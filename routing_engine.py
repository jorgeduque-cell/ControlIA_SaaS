# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Zero-Cost Routing Engine (V3)

V3 Architecture — Single-call VROOM optimization:
  - Nominatim (OSM)         → Geocoding (cascade: Nominatim → Photon → Maps.co)
  - ORS /optimization       → TSP/VRP route optimization (VROOM engine, 1 API call)
  - ORS /matrix             → Fallback time matrix
  - Scikit-Learn K-Means    → Zone clustering for large stop sets
  - Overpass API (OSM)      → Business discovery (replaces Google Places)
  - Haversine               → Offline nearest-neighbor (3rd fallback)

Cost: $0/month (ORS Free Tier: 500 optimization req/day)
"""
import math
import time
import requests
import numpy as np
from urllib.parse import quote

from config import (
    ORS_API_KEY, ORS_BASE_URL, OVERPASS_URL, NOMINATIM_URL,
    KMEANS_THRESHOLD, DEFAULT_CLUSTER_SIZE, MAX_WAYPOINTS,
    CHAIN_BLACKLIST, logger,
)

# Service time per stop (seconds) — 5 min default for delivery/visit
SERVICE_TIME_PER_STOP = 300


# =========================================================================
# 1. GEOCODING — Nominatim (OpenStreetMap, free, no key needed)
# =========================================================================

def geocode_nominatim(address, country_code="co"):
    """Convert an address to (lat, lng) using multiple geocoding providers.
    Cascade: Nominatim → Photon (Komoot) → geocode.maps.co
    Each provider retries up to 2 times on 429 with exponential backoff.

    Returns:
        tuple: (lat, lng) or (None, None) if all providers fail.
    """
    import time as _time

    def _try_nominatim(addr, cc):
        """Primary: OpenStreetMap Nominatim."""
        for attempt in range(2):
            try:
                resp = requests.get(
                    f"{NOMINATIM_URL}/search",
                    params={"q": addr, "format": "json", "limit": 1, "countrycodes": cc},
                    headers={"User-Agent": "ControlIA-SaaS/3.0 (Telegram Bot)"},
                    timeout=10,
                )
                if resp.status_code == 429:
                    _time.sleep(2 ** (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                if data:
                    return float(data[0]["lat"]), float(data[0]["lon"])
                return None, None
            except Exception:
                _time.sleep(2)
        return None, None

    def _try_photon(addr, cc):
        """Fallback 1: Photon by Komoot (OSM-based, lenient rate limits)."""
        for attempt in range(2):
            try:
                resp = requests.get(
                    "https://photon.komoot.io/api",
                    params={"q": addr, "limit": 1, "lang": "es"},
                    headers={"User-Agent": "ControlIA-SaaS/3.0"},
                    timeout=10,
                )
                if resp.status_code == 429:
                    _time.sleep(2 ** (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                features = data.get("features", [])
                if features:
                    coords = features[0]["geometry"]["coordinates"]
                    return float(coords[1]), float(coords[0])  # GeoJSON: [lng, lat]
                return None, None
            except Exception:
                _time.sleep(2)
        return None, None

    def _try_maps_co(addr, cc):
        """Fallback 2: geocode.maps.co (free, no key for basic use)."""
        for attempt in range(2):
            try:
                resp = requests.get(
                    "https://geocode.maps.co/search",
                    params={"q": addr, "format": "json", "limit": 1, "countrycodes": cc},
                    headers={"User-Agent": "ControlIA-SaaS/3.0"},
                    timeout=10,
                )
                if resp.status_code == 429:
                    _time.sleep(2 ** (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                if data:
                    return float(data[0]["lat"]), float(data[0]["lon"])
                return None, None
            except Exception:
                _time.sleep(2)
        return None, None

    # ── Cascade through providers ──
    providers = [
        ("Nominatim", _try_nominatim),
        ("Photon", _try_photon),
        ("Maps.co", _try_maps_co),
    ]
    for name, fn in providers:
        lat, lng = fn(address, country_code)
        if lat is not None:
            logger.info("Geocoded '%s' via %s → (%.4f, %.4f)", address[:50], name, lat, lng)
            return lat, lng
        logger.warning("Geocode failed with %s for '%s', trying next...", name, address[:50])

    logger.error("All geocode providers failed for '%s'", address[:80])
    return None, None


# =========================================================================
# 2. ROUTE OPTIMIZATION — ORS /optimization (VROOM engine, 1 API call)
# =========================================================================

def optimize_route_vroom(origin_coords, stops, profile="driving-car"):
    """Optimize route using ORS Optimization API (VROOM engine).

    Single API call that computes time matrix + solves TSP internally.
    Replaces the old 2-step process (ORS matrix + OR-Tools).

    Args:
        origin_coords: (lat, lng) of the starting point.
        stops: List of dicts with 'lat', 'lng', 'name' keys.
        profile: 'driving-car' or 'foot-walking'.

    Returns:
        dict: {
            'ordered_stops': [...],
            'total_time_sec': int,
            'total_distance_m': int,
        }
        None on error.
    """
    if not ORS_API_KEY:
        logger.error("ORS_API_KEY not configured — cannot optimize route.")
        return None

    if not stops:
        return None

    # Build VROOM-format request
    # ORS Optimization expects [lng, lat] order
    jobs = []
    for i, stop in enumerate(stops):
        jobs.append({
            "id": i + 1,
            "location": [stop["lng"], stop["lat"]],
            "service": SERVICE_TIME_PER_STOP,
        })

    vehicles = [{
        "id": 1,
        "profile": profile,
        "start": [origin_coords[1], origin_coords[0]],  # [lng, lat]
        "end": [origin_coords[1], origin_coords[0]],     # return to start
    }]

    try:
        resp = requests.post(
            f"{ORS_BASE_URL}/optimization",
            json={
                "jobs": jobs,
                "vehicles": vehicles,
            },
            headers={
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )

        if resp.status_code == 429:
            logger.warning("ORS Optimization rate-limited (429). Falling back.")
            return None

        resp.raise_for_status()
        data = resp.json()

        # Parse VROOM response
        routes = data.get("routes", [])
        if not routes:
            logger.warning("VROOM returned no routes.")
            return None

        route = routes[0]
        steps = route.get("steps", [])

        # Extract ordered stop indices (skip start/end which are type=start/end)
        ordered_stops = []
        for step in steps:
            if step.get("type") == "job":
                job_id = step["id"]
                stop_idx = job_id - 1  # We used 1-based IDs
                if 0 <= stop_idx < len(stops):
                    ordered_stops.append(stops[stop_idx])

        total_time = route.get("duration", 0)       # seconds (includes service time)
        total_distance = route.get("distance", 0)    # meters

        # Subtract service time to get pure travel time
        travel_time = max(0, total_time - (len(ordered_stops) * SERVICE_TIME_PER_STOP))

        logger.info(
            "VROOM optimized %d stops: travel=%dmin, distance=%.1fkm",
            len(ordered_stops), travel_time // 60, total_distance / 1000,
        )

        return {
            "ordered_stops": ordered_stops,
            "total_time_sec": travel_time,
            "total_distance_m": total_distance,
        }

    except requests.exceptions.HTTPError as e:
        logger.error("ORS Optimization HTTP error: %s — %s", e, e.response.text if e.response else "")
        return None
    except Exception as e:
        logger.error("ORS Optimization error: %s", e)
        return None


# =========================================================================
# 3. FALLBACK — ORS Matrix + Greedy TSP (if /optimization fails)
# =========================================================================

def get_ors_time_matrix(coordinates, profile="driving-car"):
    """Get a time matrix (in seconds) from OpenRouteService.

    Args:
        coordinates: List of [lng, lat] pairs (ORS uses lng,lat order!)
        profile: 'driving-car' or 'foot-walking'

    Returns:
        list[list[float]]: NxN matrix of travel times in seconds.
        None on error.
    """
    if not ORS_API_KEY:
        return None

    try:
        resp = requests.post(
            f"{ORS_BASE_URL}/v2/matrix/{profile}",
            json={
                "locations": coordinates,
                "metrics": ["duration", "distance"],
                "units": "m",
            },
            headers={
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        if resp.status_code == 429:
            logger.warning("ORS Matrix rate-limited (429).")
            return None
        resp.raise_for_status()
        data = resp.json()
        return data.get("durations"), data.get("distances")
    except Exception as e:
        logger.error("ORS Matrix error: %s", e)
        return None, None


def _greedy_tsp(time_matrix, depot=0):
    """Solve TSP using greedy nearest-neighbor heuristic (no external deps).

    Args:
        time_matrix: NxN list of travel times.
        depot: Starting index.

    Returns:
        list[int]: Ordered indices.
    """
    n = len(time_matrix)
    if n <= 2:
        return list(range(n))

    visited = {depot}
    route = [depot]
    current = depot

    while len(visited) < n:
        best_next = -1
        best_time = float('inf')
        for j in range(n):
            if j not in visited and time_matrix[current][j] < best_time:
                best_time = time_matrix[current][j]
                best_next = j
            
        if best_next == -1:
            break
        visited.add(best_next)
        route.append(best_next)
        current = best_next

    return route


def _optimize_with_matrix_fallback(origin_coords, stops, profile):
    """Fallback: Use ORS matrix + greedy TSP when /optimization is unavailable.

    Returns:
        dict with 'ordered_stops', 'total_time_sec', 'total_distance_m'
        or None.
    """
    # Build coordinate list: origin + stops, [lng, lat] for ORS
    ors_coords = [[origin_coords[1], origin_coords[0]]]
    for s in stops:
        ors_coords.append([s["lng"], s["lat"]])

    result = get_ors_time_matrix(ors_coords, profile)
    if result is None or result == (None, None):
        return None

    time_matrix, distance_matrix = result
    if time_matrix is None:
        return None

    # Solve with greedy TSP
    optimal_order = _greedy_tsp(time_matrix, depot=0)

    # Extract ordered stops (skip depot index 0)
    stop_order = [i - 1 for i in optimal_order if i > 0]
    ordered_stops = [stops[i] for i in stop_order if 0 <= i < len(stops)]

    # Calculate totals
    total_time = 0
    total_distance = 0
    for i in range(len(optimal_order) - 1):
        f, t = optimal_order[i], optimal_order[i + 1]
        total_time += time_matrix[f][t]
        if distance_matrix:
            total_distance += distance_matrix[f][t]

    logger.info(
        "Matrix+Greedy fallback: %d stops, travel=%dmin",
        len(ordered_stops), int(total_time / 60),
    )

    return {
        "ordered_stops": ordered_stops,
        "total_time_sec": int(total_time),
        "total_distance_m": int(total_distance),
    }


# =========================================================================
# 4. ZONE CLUSTERING — Scikit-Learn K-Means
# =========================================================================

def cluster_stops_kmeans(coords, max_per_cluster=None):
    """Divide stops into geographic clusters using K-Means.

    Args:
        coords: List of (lat, lng) tuples.
        max_per_cluster: Max stops per cluster (default: config DEFAULT_CLUSTER_SIZE).

    Returns:
        list[list[int]]: List of clusters, each containing indices into coords.
    """
    if max_per_cluster is None:
        max_per_cluster = DEFAULT_CLUSTER_SIZE

    n = len(coords)
    if n <= max_per_cluster:
        return [list(range(n))]

    from sklearn.cluster import KMeans

    n_clusters = math.ceil(n / max_per_cluster)
    coords_array = np.array(coords)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(coords_array)

    clusters = {}
    for idx, label in enumerate(labels):
        clusters.setdefault(int(label), []).append(idx)

    # Sort clusters by their centroid latitude (North → South)
    sorted_clusters = sorted(
        clusters.values(),
        key=lambda indices: np.mean([coords[i][0] for i in indices]),
        reverse=True,
    )

    return sorted_clusters


# =========================================================================
# 5. BUSINESS DISCOVERY — Overpass API (OpenStreetMap, free)
# =========================================================================

# OSM tag mappings for business types
OSM_BUSINESS_TAGS = {
    "tienda": [
        'shop=convenience', 'shop=supermarket', 'shop=general',
        'shop=kiosk', 'shop=variety_store', 'shop=wholesale',
        'shop=department_store', 'shop=greengrocer', 'shop=butcher',
        'shop=beverages', 'shop=alcohol',
    ],
    "restaurante": [
        'amenity=restaurant', 'amenity=fast_food', 'amenity=cafe',
        'amenity=food_court', 'amenity=bar', 'amenity=pub',
    ],
    "farmacia": ['amenity=pharmacy', 'shop=chemist', 'shop=medical_supply'],
    "panaderia": ['shop=bakery', 'shop=pastry', 'shop=confectionery'],
    "ferreteria": [
        'shop=hardware', 'shop=doityourself', 'shop=paint',
        'shop=trade', 'shop=electrical',
    ],
    "empresa": [
        'office=company', 'office=yes', 'office=insurance',
        'office=financial', 'office=lawyer', 'office=accountant',
    ],
}


def search_overpass_businesses(lat, lng, radius=1000, business_types=None):
    """Search for businesses near coordinates using Overpass API (OSM).

    Args:
        lat, lng: Center coordinates.
        radius: Search radius in meters.
        business_types: List of keys from OSM_BUSINESS_TAGS (e.g. ['tienda', 'restaurante']).
                        None = search all types.

    Returns:
        list[dict]: Businesses with name, lat, lng, type, address.
    """
    if business_types is None:
        business_types = list(OSM_BUSINESS_TAGS.keys())

    # Build Overpass QL query — search node + way + relation
    tag_filters = []
    for btype in business_types:
        tags = OSM_BUSINESS_TAGS.get(btype, [])
        for tag in tags:
            key, value = tag.split("=")
            tag_filters.append(
                f'nwr["{key}"="{value}"](around:{radius},{lat},{lng});'
            )

    query = f"""
    [out:json][timeout:30];
    (
        {"".join(tag_filters)}
    );
    out body center;
    """

    try:
        logger.info("Overpass query for (%.4f, %.4f) r=%dm types=%s", lat, lng, radius, business_types)
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"User-Agent": "ControlIA-SaaS/3.0"},
            timeout=35,
        )
        resp.raise_for_status()
        data = resp.json()

        places = []
        seen_names = set()

        for element in data.get("elements", []):
            tags = element.get("tags", {})
            name = tags.get("name", "").strip()

            # For unnamed businesses, use the shop/amenity/office type as name
            if not name:
                for fallback_key in ("shop", "amenity", "office"):
                    val = tags.get(fallback_key, "")
                    if val and val != "yes":
                        name = val.replace("_", " ").capitalize()
                        break
            if not name:
                continue

            # Deduplicate by name (case-insensitive)
            name_lower = name.lower()
            if name_lower in seen_names:
                continue
            seen_names.add(name_lower)

            # Get coordinates — ways/relations use 'center' sub-object
            if element.get("type") == "node":
                place_lat = element.get("lat", 0)
                place_lng = element.get("lon", 0)
            else:
                center = element.get("center", {})
                place_lat = center.get("lat", 0)
                place_lng = center.get("lon", 0)

            if place_lat == 0 and place_lng == 0:
                continue

            # Determine business type emoji
            emoji = "🏪"
            for btype, tag_list in OSM_BUSINESS_TAGS.items():
                for tag in tag_list:
                    key, value = tag.split("=")
                    if tags.get(key) == value:
                        emoji_map = {
                            "tienda": "🏪", "restaurante": "🍽️",
                            "farmacia": "🏥", "panaderia": "🥖",
                            "ferreteria": "🔧", "empresa": "🏢",
                        }
                        emoji = emoji_map.get(btype, "🏪")
                        break

            # Calculate distance from search center
            distance = _haversine(lat, lng, place_lat, place_lng)

            places.append({
                "name": name,
                "lat": place_lat,
                "lng": place_lng,
                "address": tags.get("addr:street", tags.get("addr:full", "")),
                "distance_from_origin": distance,
                "emoji": emoji,
                "phone": tags.get("phone", tags.get("contact:phone", "")),
                "opening_hours": tags.get("opening_hours", ""),
            })

        # Sort by distance
        places.sort(key=lambda p: p["distance_from_origin"])
        logger.info("Overpass found %d businesses within %dm of (%.4f, %.4f)", len(places), radius, lat, lng)
        return places

    except Exception as e:
        logger.error("Overpass API error: %s", e)
        return []


def filter_chains(places):
    """Remove known chains from a list of businesses (Anti-Targeting).

    Args:
        places: List of dicts with 'name' key.

    Returns:
        list[dict]: Filtered list without chains.
    """
    filtered = []
    for place in places:
        name_lower = place["name"].lower()
        is_chain = any(chain in name_lower for chain in CHAIN_BLACKLIST)
        if not is_chain:
            filtered.append(place)
    return filtered


# =========================================================================
# 6. PIPELINE — Full route optimization (V3: 3-tier fallback)
# =========================================================================

def build_optimized_route(origin_coords, stops, profile="driving-car"):
    """Full pipeline: Cluster → VROOM Optimization → Google Maps URLs.

    3-tier fallback:
      1. ORS /optimization (VROOM) — single call, optimal
      2. ORS /matrix + greedy TSP — if VROOM fails
      3. Haversine nearest-neighbor — if all APIs fail (offline)

    Args:
        origin_coords: (lat, lng) of the starting point.
        stops: List of dicts with 'lat', 'lng', and 'name' keys.
        profile: 'driving-car' or 'foot-walking'.

    Returns:
        list[dict]: One entry per cluster:
            {
                'label': 'Zona A',
                'stops': [ordered list of stop dicts],
                'total_time_min': estimated minutes,
                'total_distance_km': float,
                'google_maps_url': clickable URL,
            }
        None on error.
    """
    if not stops:
        return []

    travel_mode = "driving" if profile == "driving-car" else "walking"

    # Extract coordinates
    stop_coords = [(s["lat"], s["lng"]) for s in stops]

    # Step 1: Cluster if needed (K-Means for >MAX_WAYPOINTS stops)
    if len(stops) > KMEANS_THRESHOLD:
        clusters = cluster_stops_kmeans(stop_coords, MAX_WAYPOINTS)
        logger.info("K-Means split %d stops into %d clusters.", len(stops), len(clusters))
    else:
        clusters = [list(range(len(stops)))]

    results = []
    zone_labels = _generate_zone_labels(len(clusters))

    for cluster_idx, stop_indices in enumerate(clusters):
        cluster_stops = [stops[i] for i in stop_indices]

        if len(cluster_stops) == 0:
            continue

        # If only 1 stop, no optimization needed
        if len(cluster_stops) == 1:
            ordered_stops = cluster_stops
            total_minutes = 5
            total_distance_km = _haversine(
                origin_coords[0], origin_coords[1],
                cluster_stops[0]["lat"], cluster_stops[0]["lng"],
            ) / 1000
        else:
            # ── TIER 1: ORS /optimization (VROOM) — single call ──
            vroom_result = optimize_route_vroom(origin_coords, cluster_stops, profile)

            if vroom_result:
                ordered_stops = vroom_result["ordered_stops"]
                total_minutes = int(vroom_result["total_time_sec"] / 60)
                total_distance_km = round(vroom_result["total_distance_m"] / 1000, 1)
            else:
                # ── TIER 2: ORS /matrix + greedy TSP ──
                logger.warning("VROOM failed — trying matrix+greedy fallback.")
                matrix_result = _optimize_with_matrix_fallback(origin_coords, cluster_stops, profile)

                if matrix_result:
                    ordered_stops = matrix_result["ordered_stops"]
                    total_minutes = int(matrix_result["total_time_sec"] / 60)
                    total_distance_km = round(matrix_result["total_distance_m"] / 1000, 1)
                else:
                    # ── TIER 3: Haversine nearest-neighbor (offline) ──
                    logger.warning("All APIs failed — using offline nearest-neighbor.")
                    ordered_stops = _nearest_neighbor_sort(origin_coords, cluster_stops)
                    # Estimate: sum of haversine distances
                    total_dist = 0
                    prev = origin_coords
                    for s in ordered_stops:
                        total_dist += _haversine(prev[0], prev[1], s["lat"], s["lng"])
                        prev = (s["lat"], s["lng"])
                    total_distance_km = round(total_dist / 1000, 1)
                    # Rough time: 5km/h walking, 30km/h driving
                    speed = 5 if profile == "foot-walking" else 30
                    total_minutes = int((total_distance_km / speed) * 60) if speed > 0 else 0

        # Step 4: Generate Google Maps URL(s)
        # Google Maps supports max ~23 waypoints in a URL
        maps_urls = _build_google_maps_urls(origin_coords, ordered_stops, travel_mode)

        if ordered_stops:
            result_entry = {
                "label": zone_labels[cluster_idx],
                "stops": ordered_stops,
                "total_time_min": total_minutes,
                "total_distance_km": total_distance_km,
                "total_stops": len(ordered_stops),
                "google_maps_url": maps_urls[0] if maps_urls else "",
            }
            # If multiple URLs (>23 waypoints), include them
            if len(maps_urls) > 1:
                result_entry["extra_maps_urls"] = maps_urls[1:]

            results.append(result_entry)

    return results


# =========================================================================
# INTERNAL HELPERS
# =========================================================================

def _haversine(lat1, lng1, lat2, lng2):
    """Calculate distance in meters between two coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _nearest_neighbor_sort(origin_coords, stops):
    """Fallback sorting: simple nearest-neighbor from origin."""
    remaining = list(stops)
    ordered = []
    current_lat, current_lng = origin_coords

    while remaining:
        best_idx = 0
        best_dist = _haversine(current_lat, current_lng, remaining[0]["lat"], remaining[0]["lng"])
        for i in range(1, len(remaining)):
            d = _haversine(current_lat, current_lng, remaining[i]["lat"], remaining[i]["lng"])
            if d < best_dist:
                best_dist = d
                best_idx = i
        chosen = remaining.pop(best_idx)
        ordered.append(chosen)
        current_lat, current_lng = chosen["lat"], chosen["lng"]

    return ordered


def _build_google_maps_urls(origin_coords, ordered_stops, travel_mode):
    """Build Google Maps direction URLs, splitting if >23 waypoints.

    Google Maps URL supports max ~23 waypoints. For larger routes,
    we split into multiple URLs with overlapping endpoints.

    Returns:
        list[str]: One or more Google Maps URLs.
    """
    if not ordered_stops:
        return []

    MAX_GMAPS_WAYPOINTS = 23
    origin_str = f"{origin_coords[0]},{origin_coords[1]}"

    if len(ordered_stops) <= MAX_GMAPS_WAYPOINTS:
        # Single URL — all stops fit
        dest_stop = ordered_stops[-1]
        dest_str = f"{dest_stop['lat']},{dest_stop['lng']}"

        waypoints = []
        for s in ordered_stops[:-1]:
            waypoints.append(f"{s['lat']},{s['lng']}")

        url = f"https://www.google.com/maps/dir/?api=1&travelmode={travel_mode}"
        url += f"&origin={origin_str}"
        if waypoints:
            url += f"&waypoints={'|'.join(waypoints)}"
        url += f"&destination={dest_str}"
        return [url]

    # Multiple URLs needed
    urls = []
    chunk_size = MAX_GMAPS_WAYPOINTS
    chunks = [ordered_stops[i:i + chunk_size] for i in range(0, len(ordered_stops), chunk_size)]

    for idx, chunk in enumerate(chunks):
        if idx == 0:
            start_str = origin_str
        else:
            # Start from last stop of previous chunk
            prev_last = chunks[idx - 1][-1]
            start_str = f"{prev_last['lat']},{prev_last['lng']}"

        dest = chunk[-1]
        dest_str = f"{dest['lat']},{dest['lng']}"

        waypoints = [f"{s['lat']},{s['lng']}" for s in chunk[:-1]]

        url = f"https://www.google.com/maps/dir/?api=1&travelmode={travel_mode}"
        url += f"&origin={start_str}"
        if waypoints:
            url += f"&waypoints={'|'.join(waypoints)}"
        url += f"&destination={dest_str}"
        urls.append(url)

    return urls


def _generate_zone_labels(count):
    """Generate zone labels: Zona A, Zona B, Zona C, etc."""
    if count == 1:
        return ["Ruta Completa"]
    labels = []
    for i in range(count):
        letter = chr(65 + i)  # A, B, C...
        labels.append(f"Zona {letter}")
    return labels
