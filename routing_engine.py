# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Zero-Cost Routing Engine (V2)

Replaces paid Google API calls with free Open Source alternatives:
  - Nominatim (OSM)         → Geocoding
  - OpenRouteService (ORS)  → Time/distance matrices (driving + walking)
  - Google OR-Tools          → TSP/VRP route optimization
  - Scikit-Learn K-Means     → Zone clustering for large stop sets
  - Overpass API (OSM)       → Business discovery (replaces Google Places)

Cost: $0/month (ORS Free Tier: 500 matrix req/day, Overpass/Nominatim: unlimited)
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
                    headers={"User-Agent": "ControlIA-SaaS/2.0 (Telegram Bot)"},
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
                    headers={"User-Agent": "ControlIA-SaaS/2.0"},
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
                    headers={"User-Agent": "ControlIA-SaaS/2.0"},
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
# 2. DISTANCE MATRIX — OpenRouteService (free tier: 500 req/day)
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
        logger.error("ORS_API_KEY not configured — cannot compute time matrix.")
        return None

    try:
        resp = requests.post(
            f"{ORS_BASE_URL}/v2/matrix/{profile}",
            json={
                "locations": coordinates,
                "metrics": ["duration"],
                "units": "m",
            },
            headers={
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("durations")
    except requests.exceptions.HTTPError as e:
        logger.error("ORS Matrix HTTP error: %s — %s", e, e.response.text if e.response else "")
        return None
    except Exception as e:
        logger.error("ORS Matrix error: %s", e)
        return None


def get_ors_distance_matrix(coordinates, profile="driving-car"):
    """Get a distance matrix (in meters) from OpenRouteService.

    Args:
        coordinates: List of [lng, lat] pairs (ORS uses lng,lat order!)
        profile: 'driving-car' or 'foot-walking'

    Returns:
        list[list[float]]: NxN matrix of distances in meters.
        None on error.
    """
    if not ORS_API_KEY:
        logger.error("ORS_API_KEY not configured.")
        return None

    try:
        resp = requests.post(
            f"{ORS_BASE_URL}/v2/matrix/{profile}",
            json={
                "locations": coordinates,
                "metrics": ["distance"],
                "units": "m",
            },
            headers={
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("distances")
    except Exception as e:
        logger.error("ORS Distance Matrix error: %s", e)
        return None


# =========================================================================
# 3. ROUTE OPTIMIZATION — Google OR-Tools (TSP Solver, runs locally)
# =========================================================================

def optimize_route_ortools(time_matrix, depot=0):
    """Solve the Travelling Salesman Problem (TSP) using OR-Tools.

    Args:
        time_matrix: NxN list of travel times (seconds or any unit).
        depot: Index of the starting point (default: 0 = first coordinate).

    Returns:
        list[int]: Ordered indices of the optimal route (excluding return to depot).
        None on error.
    """
    from ortools.constraint_solver import routing_enums_pb2, pywrapcp

    n = len(time_matrix)
    if n <= 2:
        return list(range(n))

    # Create the routing index manager
    manager = pywrapcp.RoutingIndexManager(n, 1, depot)
    routing = pywrapcp.RoutingModel(manager)

    # Create the transit callback
    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(time_matrix[from_node][to_node])

    transit_callback_index = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Set search parameters
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.FromSeconds(5)  # Max 5 seconds to find solution

    # Solve
    solution = routing.SolveWithParameters(search_params)
    if not solution:
        logger.warning("OR-Tools found no solution — falling back to input order.")
        return list(range(n))

    # Extract ordered route
    route = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        route.append(node)
        index = solution.Value(routing.NextVar(index))

    return route


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
            headers={"User-Agent": "ControlIA-SaaS/2.0"},
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
# 6. PIPELINE — Full route optimization
# =========================================================================

def build_optimized_route(origin_coords, stops, profile="driving-car"):
    """Full pipeline: Cluster → ORS Matrix → OR-Tools TSP → Google Maps URLs.

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
                'google_maps_url': clickable URL,
            }
        None on error.
    """
    if not stops:
        return []

    travel_mode = "driving" if profile == "driving-car" else "walking"

    # Extract coordinates
    stop_coords = [(s["lat"], s["lng"]) for s in stops]

    # Step 1: Cluster if needed
    if len(stops) > KMEANS_THRESHOLD:
        clusters = cluster_stops_kmeans(stop_coords, MAX_WAYPOINTS)
        logger.info("K-Means split %d stops into %d clusters.", len(stops), len(clusters))
    else:
        clusters = [list(range(len(stops)))]

    results = []
    zone_labels = _generate_zone_labels(len(clusters))

    for cluster_idx, stop_indices in enumerate(clusters):
        cluster_stops = [stops[i] for i in stop_indices]

        # Build coordinate list for ORS: origin + cluster stops
        # ORS expects [lng, lat] order!
        ors_coords = [[origin_coords[1], origin_coords[0]]]
        for s in cluster_stops:
            ors_coords.append([s["lng"], s["lat"]])

        # Step 2: Get time matrix from ORS
        time_matrix = get_ors_time_matrix(ors_coords, profile)

        if time_matrix:
            # Step 3: Optimize with OR-Tools
            optimal_order = optimize_route_ortools(time_matrix, depot=0)

            # Remove depot (index 0) from the route order
            stop_order = [i - 1 for i in optimal_order if i > 0]
            ordered_stops = [cluster_stops[i] for i in stop_order]

            # Calculate total time
            total_seconds = 0
            for i in range(len(optimal_order) - 1):
                from_idx = optimal_order[i]
                to_idx = optimal_order[i + 1]
                total_seconds += time_matrix[from_idx][to_idx]
            total_minutes = int(total_seconds / 60)
        else:
            # Fallback: nearest-neighbor if ORS fails
            logger.warning("ORS matrix failed — using nearest-neighbor fallback.")
            ordered_stops = _nearest_neighbor_sort(origin_coords, cluster_stops)
            total_minutes = len(cluster_stops) * 5  # rough estimate

        # Step 4: Generate Google Maps URL
        if ordered_stops:
            origin_str = f"{origin_coords[0]},{origin_coords[1]}"
            dest_stop = ordered_stops[-1]
            dest_str = f"{dest_stop['lat']},{dest_stop['lng']}"

            waypoints = []
            for s in ordered_stops[:-1]:
                waypoints.append(f"{s['lat']},{s['lng']}")

            # Build URL respecting MAX_WAYPOINTS for Google Maps
            waypoint_str = "|".join(waypoints[:MAX_WAYPOINTS - 1])

            url = f"https://www.google.com/maps/dir/?api=1&travelmode={travel_mode}"
            url += f"&origin={origin_str}"
            if waypoint_str:
                url += f"&waypoints={waypoint_str}"
            url += f"&destination={dest_str}"

            results.append({
                "label": zone_labels[cluster_idx],
                "stops": ordered_stops,
                "total_time_min": total_minutes,
                "total_stops": len(ordered_stops),
                "google_maps_url": url,
            })

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


def _generate_zone_labels(count):
    """Generate zone labels: Zona A, Zona B, Zona C, etc."""
    if count == 1:
        return ["Ruta Completa"]
    labels = []
    for i in range(count):
        letter = chr(65 + i)  # A, B, C...
        labels.append(f"Zona {letter}")
    return labels
