# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Logistics & Routing Handler
Commands: /ruta_pie, /ruta_camion, /ruta_semanal, /inventario

V2 CHANGES:
  - PRODUCT_CATALOG → dynamic from DB
  - TARGET_BUSINESS_TYPES → generic SaaS search types
  - TRANSMILENIO_STATIONS / COMPANY_ADDRESS → removed (SaaS-generic)
  - is_admin() → @requiere_suscripcion(bot)
  - All queries scoped to vendedor_id
"""
from telebot import types
from datetime import date
import datetime as dt_mod

from config import (
    GOOGLE_API_KEY, SEARCH_RADIUS_OPTIONS, DEFAULT_SEARCH_RADIUS,
    MINUTES_PER_STOP, MAX_DISCOVERY_STOPS,
)
from database import get_connection, get_products, safe_parse_date
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import (
    get_vendedor_id, format_cop, geocode_address, search_nearby_places,
    haversine_distance, build_google_maps_links, build_walking_route,
)

WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
WEEKDAY_EMOJIS = {"Lunes": "1️⃣", "Martes": "2️⃣", "Miércoles": "3️⃣", "Jueves": "4️⃣", "Viernes": "5️⃣", "Sábado": "6️⃣"}
DAY_INDEX_MAP = {"Monday": "Lunes", "Tuesday": "Martes", "Wednesday": "Miércoles", "Thursday": "Jueves", "Friday": "Viernes", "Saturday": "Sábado"}

# Generic business types for Google Places prospecting (SaaS — not tied to any industry)
GENERIC_SEARCH_TYPES = {
    "tienda": {"emoji": "🏪", "label": "Tiendas / Minimercados", "keywords": ["tienda", "minimercado", "supermercado"]},
    "restaurante": {"emoji": "🍽️", "label": "Restaurantes", "keywords": ["restaurante", "comida", "asadero"]},
    "farmacia": {"emoji": "🏥", "label": "Farmacias / Droguerías", "keywords": ["farmacia", "droguería"]},
    "panaderia": {"emoji": "🥖", "label": "Panaderías", "keywords": ["panadería", "bakery"]},
    "ferreteria": {"emoji": "🔧", "label": "Ferreterías", "keywords": ["ferretería", "ferretera"]},
    "empresa": {"emoji": "🏢", "label": "Empresas / Oficinas", "keywords": ["empresa", "oficina"]},
}


def register(bot):

    # =====================================================================
    # /inventario — Stock control (dynamic catalog)
    # =====================================================================

    @bot.message_handler(commands=["inventario"])
    @requiere_suscripcion(bot)
    def cmd_inventory(message):
        markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        markup.add("📊 Ver Stock")
        markup.add("➕ Ingresar Mercancía")
        markup.add("⚙️ Ajustar Stock Mínimo")
        markup.add("❌ Cancelar")

        bot.send_message(message.chat.id, "📦 <b>CONTROL DE INVENTARIO</b>\n\n¿Qué deseas hacer?", reply_markup=markup)
        bot.register_next_step_handler(message, _step_inv_action, bot, get_vendedor_id(message))

    def _step_inv_action(message, bot, vendedor_id):
        try:
            selected = (message.text or "").strip()
            if "Cancelar" in selected:
                bot.send_message(message.chat.id, "❌ Cancelado.", reply_markup=types.ReplyKeyboardRemove())
                return

            if "Ver Stock" in selected:
                conn = get_connection(vendedor_id)
                try:
                    items = conn.execute(
                        "SELECT * FROM inventario WHERE vendedor_id = %s ORDER BY producto", (vendedor_id,)
                    ).fetchall()
                finally:
                    conn.close()

                if not items:
                    bot.send_message(message.chat.id, "📦 Sin datos de inventario. Ingresa mercancía primero.", reply_markup=types.ReplyKeyboardRemove())
                    return

                response = "📦 <b>INVENTARIO EN BODEGA</b>\n" + "━" * 30 + "\n\n"
                for item in items:
                    stock = item.get("stock_actual", 0)
                    stock_min = item.get("stock_minimo", 0)
                    alert = "🟡 BAJO" if stock <= stock_min else "🟢 OK"
                    if stock == 0:
                        alert = "🔴 AGOTADO"
                    ultima = safe_parse_date(item.get("ultima_actualizacion"))
                    ultima_str = ultima.isoformat() if ultima else "N/A"
                    response += f"📦 <b>{item['producto']}</b>\n"
                    response += f"   Stock: <b>{stock}</b> uds | Mín: {stock_min} | {alert}\n"
                    response += f"   📅 Últ. mov: {ultima_str}\n\n"

                bot.send_message(message.chat.id, response, reply_markup=types.ReplyKeyboardRemove())

            elif "Ingresar" in selected:
                catalog = get_products(vendedor_id)
                if not catalog:
                    bot.send_message(message.chat.id, "⚠️ No tienes productos. Usa /configurar.", reply_markup=types.ReplyKeyboardRemove())
                    return
                markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
                for p in catalog:
                    markup.add(p["nombre"])
                bot.send_message(message.chat.id, "➕ <b>INGRESO</b>\n\nSelecciona el producto:", reply_markup=markup)
                bot.register_next_step_handler(message, _step_inv_add_product, bot, vendedor_id)

            elif "Ajustar" in selected:
                catalog = get_products(vendedor_id)
                if not catalog:
                    bot.send_message(message.chat.id, "⚠️ No tienes productos.", reply_markup=types.ReplyKeyboardRemove())
                    return
                markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
                for p in catalog:
                    markup.add(p["nombre"])
                bot.send_message(message.chat.id, "⚙️ <b>AJUSTAR STOCK MÍNIMO</b>\n\nSelecciona:", reply_markup=markup)
                bot.register_next_step_handler(message, _step_inv_min_product, bot, vendedor_id)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_inv_add_product(message, bot, vendedor_id):
        try:
            product = (message.text or "").strip()
            catalog = get_products(vendedor_id)
            valid_names = [p["nombre"] for p in catalog]
            if product not in valid_names:
                bot.send_message(message.chat.id, "❌ Producto no válido.", reply_markup=types.ReplyKeyboardRemove())
                return
            bot.send_message(message.chat.id, f"➕ ¿Cuántas unidades de <b>{product}</b> ingresan?", reply_markup=types.ReplyKeyboardRemove())
            bot.register_next_step_handler(message, _step_inv_add_qty, bot, vendedor_id, product)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_inv_add_qty(message, bot, vendedor_id, product):
        try:
            qty = int(message.text.strip())
            if qty <= 0:
                bot.send_message(message.chat.id, "❌ Debe ser mayor a 0.")
                return

            today = date.today().isoformat()
            conn = get_connection(vendedor_id)
            try:
                existing = conn.execute(
                    "SELECT id FROM inventario WHERE vendedor_id = %s AND producto = %s",
                    (vendedor_id, product),
                ).fetchone()

                if existing:
                    conn.execute(
                        "UPDATE inventario SET stock_actual = stock_actual + %s, ultima_actualizacion = %s WHERE vendedor_id = %s AND producto = %s",
                        (qty, today, vendedor_id, product),
                    )
                else:
                    conn.execute(
                        "INSERT INTO inventario (vendedor_id, producto, stock_actual, stock_minimo, ultima_actualizacion) VALUES (%s, %s, %s, 0, %s)",
                        (vendedor_id, product, qty, today),
                    )
                conn.commit()
                new_stock = conn.execute(
                    "SELECT stock_actual FROM inventario WHERE vendedor_id = %s AND producto = %s",
                    (vendedor_id, product),
                ).fetchone()["stock_actual"]
            finally:
                conn.close()

            bot.send_message(
                message.chat.id,
                f"✅ <b>Mercancía ingresada</b>\n\n📦 {product}: +{qty} uds\n📊 Stock actual: <b>{new_stock}</b> uds",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ Cantidad inválida.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_inv_min_product(message, bot, vendedor_id):
        try:
            product = (message.text or "").strip()
            catalog = get_products(vendedor_id)
            valid_names = [p["nombre"] for p in catalog]
            if product not in valid_names:
                bot.send_message(message.chat.id, "❌ Producto no válido.", reply_markup=types.ReplyKeyboardRemove())
                return
            bot.send_message(
                message.chat.id,
                f"⚙️ ¿Nuevo <b>stock mínimo</b> para {product}?\n(Alerta cuando baje de ese número)",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _step_inv_min_save, bot, vendedor_id, product)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_inv_min_save(message, bot, vendedor_id, product):
        try:
            min_qty = int(message.text.strip())
            conn = get_connection(vendedor_id)
            try:
                conn.execute(
                    "UPDATE inventario SET stock_minimo = %s WHERE vendedor_id = %s AND producto = %s",
                    (min_qty, vendedor_id, product),
                )
                conn.commit()
            finally:
                conn.close()
            bot.send_message(message.chat.id, f"✅ Stock mínimo de <b>{product}</b>: <b>{min_qty}</b> uds.")
        except ValueError:
            bot.send_message(message.chat.id, "❌ Número inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ruta_pie — Walking prospecting (Google Places)
    # =====================================================================

    @bot.message_handler(commands=["ruta_pie"])
    @requiere_suscripcion(bot)
    def cmd_route_walking(message):
        if not GOOGLE_API_KEY:
            bot.send_message(message.chat.id, "❌ <b>GOOGLE_API_KEY no configurada.</b>")
            return
        bot.send_message(
            message.chat.id,
            "📱 <b>RADAR DE PROSPECCIÓN</b>\n\n"
            "🔍 Escanea Google Maps para negocios reales.\n\n"
            "📍 Escribe tu <b>punto de partida</b>\n(Ej: Calle 170, Bogota):",
        )
        bot.register_next_step_handler(message, _step_disc_origin, bot, get_vendedor_id(message))

    def _step_disc_origin(message, bot, vendedor_id):
        try:
            route_data = {"origin_text": (message.text or "").strip()}
            bot.send_message(message.chat.id, "🔍 Geocodificando...")
            lat, lng = geocode_address(route_data["origin_text"])
            if lat is None:
                bot.send_message(message.chat.id, "❌ No encontré esa dirección.")
                return
            route_data["lat"] = lat
            route_data["lng"] = lng

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("🎯 Todos los Tipos")
            for key, info in GENERIC_SEARCH_TYPES.items():
                markup.add(f"{info['emoji']} {info['label']}")

            bot.send_message(
                message.chat.id,
                f"✅ Ubicación: {lat:.4f}, {lng:.4f}\n\n🎯 <b>¿Qué tipo de negocio buscas?</b>",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _step_disc_target, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_target(message, bot, vendedor_id, route_data):
        try:
            selected = (message.text or "").strip()
            if "Todos" in selected:
                route_data["target_keys"] = list(GENERIC_SEARCH_TYPES.keys())
                route_data["target_label"] = "Todos los Tipos"
            else:
                for key, info in GENERIC_SEARCH_TYPES.items():
                    if info["label"] in selected:
                        route_data["target_keys"] = [key]
                        route_data["target_label"] = info["label"]
                        break
                else:
                    route_data["target_keys"] = list(GENERIC_SEARCH_TYPES.keys())
                    route_data["target_label"] = "Todos"

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            for label in SEARCH_RADIUS_OPTIONS:
                markup.add(label)

            bot.send_message(message.chat.id, "📍 <b>¿Qué radio de búsqueda?</b>", reply_markup=markup)
            bot.register_next_step_handler(message, _step_disc_radius, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_radius(message, bot, vendedor_id, route_data):
        try:
            selected = (message.text or "").strip()
            route_data["radius"] = SEARCH_RADIUS_OPTIONS.get(selected, DEFAULT_SEARCH_RADIUS)

            bot.send_message(
                message.chat.id,
                "📍 Escribe la <b>dirección de destino final</b>\n(Donde terminas tu jornada):",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _step_disc_dest, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_dest(message, bot, vendedor_id, route_data):
        try:
            route_data["destination"] = (message.text or "").strip()
            route_data["dest_label"] = route_data["destination"]
            _execute_discovery(bot, message, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ruta_camion — Delivery route
    # =====================================================================

    @bot.message_handler(commands=["ruta_camion"])
    @requiere_suscripcion(bot)
    def cmd_route_truck(message):
        try:
            vendedor_id = get_vendedor_id(message)
            conn = get_connection(vendedor_id)
            try:
                pending = conn.execute("""
                    SELECT c.nombre, c.direccion FROM pedidos p
                    JOIN clientes c ON p.cliente_id = c.id
                    WHERE p.vendedor_id = %s AND p.estado = 'Pendiente' AND c.direccion IS NOT NULL
                    GROUP BY c.id
                """, (vendedor_id,)).fetchall()
            finally:
                conn.close()

            if not pending:
                bot.send_message(message.chat.id, "🚚 No hay pedidos pendientes con dirección.")
                return

            bot.send_message(
                message.chat.id,
                f"🚚 <b>RUTA DE ENTREGAS</b>\n\n"
                f"📦 <b>{len(pending)}</b> clientes con pedidos pendientes.\n\n"
                "📍 Escribe el <b>punto de partida</b>:",
            )
            bot.register_next_step_handler(message, _step_truck_origin, bot, vendedor_id, pending)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_truck_origin(message, bot, vendedor_id, pending):
        try:
            origin = (message.text or "").strip()
            addresses = [row["direccion"] for row in pending if row["direccion"]]
            if not addresses:
                bot.send_message(message.chat.id, "❌ No hay direcciones válidas.")
                return
            links = build_google_maps_links(origin, addresses[:-1], addresses[-1], "driving")

            response = f"🚚 <b>RUTA DE ENTREGAS</b>\n📍 Origen: {origin}\n" + "━" * 28 + "\n\n"
            response += "📦 <b>Entregas:</b>\n"
            for i, row in enumerate(pending, 1):
                response += f"  {i}. {row['nombre']} — {row['direccion']}\n"
            response += "\n"
            for label, url in links:
                response += f"🗺️ <a href='{url}'>{label}</a>\n"
            response += f"\n📌 Total: {len(addresses)} entregas"

            bot.send_message(message.chat.id, response, disable_web_page_preview=True)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ruta_semanal — Weekly fixed routes
    # =====================================================================

    @bot.message_handler(commands=["ruta_semanal"])
    @requiere_suscripcion(bot)
    def cmd_weekly_route(message):
        try:
            vendedor_id = get_vendedor_id(message)
            today_name = DAY_INDEX_MAP.get(dt_mod.datetime.now().strftime("%A"), None)

            conn = get_connection(vendedor_id)
            try:
                summary = ""
                for day in WEEKDAYS:
                    count = conn.execute(
                        "SELECT COUNT(*) as c FROM clientes WHERE vendedor_id = %s AND dia_visita = %s AND latitud IS NOT NULL",
                        (vendedor_id, day),
                    ).fetchone()["c"]
                    today_mark = " ← HOY" if day == today_name else ""
                    summary += f"  {WEEKDAY_EMOJIS[day]} {day}: <b>{count}</b> clientes{today_mark}\n"

                no_day = conn.execute(
                    "SELECT COUNT(*) as c FROM clientes WHERE vendedor_id = %s AND dia_visita IS NULL AND estado = 'Activo'",
                    (vendedor_id,),
                ).fetchone()["c"]
                summary += f"  ❓ Sin asignar: {no_day} clientes activos\n"
            finally:
                conn.close()

            markup = types.InlineKeyboardMarkup(row_width=2)
            if today_name and today_name in WEEKDAYS:
                markup.add(types.InlineKeyboardButton(f"📍 HOY ({today_name})", callback_data=f"ruta_dia:{today_name}"))
            for day in WEEKDAYS:
                markup.add(types.InlineKeyboardButton(f"{WEEKDAY_EMOJIS[day]} {day}", callback_data=f"ruta_dia:{day}"))

            bot.send_message(
                message.chat.id,
                f"📅 <b>RUTAS SEMANALES</b>\n{'━'*30}\n\n{summary}\n¿Qué día ver?",
                reply_markup=markup,
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data.startswith("ruta_dia:"))
    @requiere_suscripcion_callback(bot)
    def handle_ruta_dia(call):
        try:
            bot.answer_callback_query(call.id)
            chosen_day = call.data.replace("ruta_dia:", "")
            vendedor_id = call.from_user.id
            chat_id = call.message.chat.id

            conn = get_connection(vendedor_id)
            try:
                clients = conn.execute("""
                    SELECT id, nombre, direccion, telefono, tipo_negocio, latitud, longitud
                    FROM clientes
                    WHERE vendedor_id = %s AND dia_visita = %s AND latitud IS NOT NULL AND longitud IS NOT NULL
                    ORDER BY nombre
                """, (vendedor_id, chosen_day)).fetchall()
            finally:
                conn.close()

            if not clients:
                bot.send_message(
                    chat_id,
                    f"📭 No hay clientes geolocalizados para <b>{chosen_day}</b>.\n\nUsa /asignar_dia para asignar.",
                )
                return

            # Nearest-neighbor sort
            ordered = []
            remaining = list(clients)
            current_lat = remaining[0]["latitud"]
            current_lng = remaining[0]["longitud"]

            while remaining:
                best_idx = 0
                best_dist = haversine_distance(current_lat, current_lng, remaining[0]["latitud"], remaining[0]["longitud"])
                for i in range(1, len(remaining)):
                    d = haversine_distance(current_lat, current_lng, remaining[i]["latitud"], remaining[i]["longitud"])
                    if d < best_dist:
                        best_dist = d
                        best_idx = i
                c = remaining.pop(best_idx)
                ordered.append({"client": c, "walk_distance": best_dist})
                current_lat, current_lng = c["latitud"], c["longitud"]

            total_walk = sum(item["walk_distance"] for item in ordered) / 1000
            stop_coords = [(item["client"]["latitud"], item["client"]["longitud"]) for item in ordered]

            first_addr = ordered[0]["client"]["direccion"] or f"{ordered[0]['client']['latitud']},{ordered[0]['client']['longitud']}"
            last_addr = ordered[-1]["client"]["direccion"] or f"{ordered[-1]['client']['latitud']},{ordered[-1]['client']['longitud']}"
            links = build_walking_route(first_addr, stop_coords, last_addr)

            response = f"📅 <b>RUTA DEL {chosen_day.upper()}</b>\n"
            response += "━" * 30 + "\n\n"
            response += f"👥 <b>{len(ordered)}</b> clientes | 🚶 ~{total_walk:.1f} km\n\n"

            for i, item in enumerate(ordered, 1):
                c = item["client"]
                walk = item["walk_distance"]
                walk_label = f"{walk:.0f}m" if walk < 1000 else f"{walk/1000:.1f}km"

                if i > 1:
                    response += f"     ↓ 🚶 {walk_label}\n"
                response += f"📍 <b>{i}. {c['nombre']}</b>\n"
                response += f"     {c.get('direccion') or 'Sin dirección'}\n"
                response += f"     📱 {c.get('telefono') or 'Sin tel.'} | 🏪 {c.get('tipo_negocio') or ''}\n"
                if i < len(ordered):
                    response += "     │\n"

            response += "\n━" * 30 + "\n"
            response += "📲 <b>ABRIR EN GOOGLE MAPS:</b>\n\n"
            for label, url in links:
                response += f"  <a href='{url}'>{label}</a>\n"

            bot.send_message(chat_id, response, disable_web_page_preview=True)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")


# =========================================================================
# HELPERS (module-level)
# =========================================================================

def _execute_discovery(bot, message, route_data):
    """Search Google Places for real businesses and build a walking route."""
    try:
        bot.send_message(
            message.chat.id,
            "🔍 <b>Escaneando...</b>\nBuscando negocios en Google Maps...",
            reply_markup=types.ReplyKeyboardRemove(),
        )

        lat, lng, radius = route_data["lat"], route_data["lng"], route_data["radius"]
        all_places = []
        seen_ids = set()

        for target_key in route_data["target_keys"]:
            info = GENERIC_SEARCH_TYPES[target_key]
            for keyword in info["keywords"]:
                results = search_nearby_places(lat, lng, keyword, radius)
                for place in results:
                    pid = place.get("place_id", "")
                    if pid in seen_ids:
                        continue
                    seen_ids.add(pid)
                    name = place.get("name", "")
                    ploc = place.get("geometry", {}).get("location", {})
                    plat, plng = ploc.get("lat", 0), ploc.get("lng", 0)
                    distance = haversine_distance(lat, lng, plat, plng)
                    all_places.append({
                        "name": name,
                        "address": place.get("vicinity", ""),
                        "lat": plat,
                        "lng": plng,
                        "distance_from_origin": distance,
                        "rating": place.get("rating", 0),
                        "total_ratings": place.get("user_ratings_total", 0),
                        "open_now": place.get("opening_hours", {}).get("open_now", None),
                        "emoji": info["emoji"],
                    })

        if not all_places:
            bot.send_message(
                message.chat.id,
                f"📍 No se encontraron negocios de tipo <b>{route_data['target_label']}</b> en {radius}m.",
            )
            return

        # Nearest-neighbor sort
        candidates = list(all_places)
        ordered_route = []
        current_lat, current_lng = lat, lng

        while candidates and len(ordered_route) < MAX_DISCOVERY_STOPS:
            best_idx = 0
            best_dist = haversine_distance(current_lat, current_lng, candidates[0]["lat"], candidates[0]["lng"])
            for i in range(1, len(candidates)):
                d = haversine_distance(current_lat, current_lng, candidates[i]["lat"], candidates[i]["lng"])
                if d < best_dist:
                    best_dist = d
                    best_idx = i
            chosen = candidates.pop(best_idx)
            chosen["walk_distance"] = best_dist
            ordered_route.append(chosen)
            current_lat, current_lng = chosen["lat"], chosen["lng"]

        remaining = len(all_places) - len(ordered_route)
        total_walk_m = sum(p["walk_distance"] for p in ordered_route)
        total_walk_km = total_walk_m / 1000
        total_time = len(ordered_route) * MINUTES_PER_STOP + int(total_walk_m / 80)
        hours, mins = total_time // 60, total_time % 60

        stop_coords = [(p["lat"], p["lng"]) for p in ordered_route]
        links = build_walking_route(route_data["origin_text"], stop_coords, route_data["destination"])

        # Build output
        response = "📱 <b>RADAR DE PROSPECCIÓN</b>\n"
        response += "━" * 34 + "\n\n"
        response += f"📍 <b>Zona:</b> {route_data['origin_text']}\n"
        response += f"🎯 <b>Target:</b> {route_data['target_label']}\n"
        response += f"📌 <b>Radio:</b> {radius}m\n"
        response += f"🔍 <b>Encontrados:</b> {len(all_places)} negocios\n"
        response += f"📊 <b>En ruta:</b> {len(ordered_route)} paradas\n"
        response += f"🚶 <b>Distancia:</b> ~{total_walk_km:.1f} km\n"
        response += f"⏱️ <b>Tiempo:</b> ~{hours}h {mins}min\n\n"

        response += "🗺️ <b>RECORRIDO:</b>\n" + "━" * 34 + "\n\n"
        response += f"🟢 <b>INICIO:</b> {route_data['origin_text']}\n     │\n"

        for i, place in enumerate(ordered_route, 1):
            walk_label = f"{place['walk_distance']:.0f}m" if place["walk_distance"] < 1000 else f"{place['walk_distance']/1000:.1f}km"
            open_icon = "🟢" if place["open_now"] else ("🔴" if place["open_now"] is False else "⚪")

            response += f"     ↓ 🚶 {walk_label}\n"
            response += f"📍 <b>{i}. {place['name']}</b> {place['emoji']}\n"
            response += f"     {place['address']}\n"
            response += f"     {open_icon}"
            if place["rating"]:
                response += f" ⭐ {place['rating']}"
            if place["total_ratings"]:
                response += f" ({place['total_ratings']} reseñas)"
            response += "\n"
            if i < len(ordered_route):
                response += "     │\n"

        response += "     │\n     ↓ 🚶\n"
        response += f"🔴 <b>FIN:</b> {route_data['dest_label']}\n\n"

        response += "━" * 34 + "\n📲 <b>ABRIR EN GOOGLE MAPS:</b>\n\n"
        for label, url in links:
            response += f"  <a href='{url}'>{label}</a>\n"

        if remaining > 0:
            response += f"\n⚠️ Hay <b>{remaining}</b> negocios más fuera de esta ruta."

        bot.send_message(message.chat.id, response, disable_web_page_preview=True)
    except Exception as e:
        bot.send_message(message.chat.id, f"⚠️ Error en búsqueda: {e}")
