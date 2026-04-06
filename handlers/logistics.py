# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Logistics & Routing Handler (V2)
Commands: /ruta_pie, /ruta_camion, /ruta_semanal, /inventario

V3 CHANGES (VROOM Architecture):
  - Single ORS /optimization call (replaces Matrix + OR-Tools)
  - 3-tier fallback: VROOM → Matrix+Greedy → Haversine offline
  - Google Places API → Overpass API (OSM, free)
  - Google Geocoding → Nominatim (OSM, free)
  - Scikit-Learn K-Means for zone clustering
  - Distance in km added to route outputs
"""
from telebot import types
from datetime import date
import datetime as dt_mod

from config import (
    ORS_API_KEY, SEARCH_RADIUS_OPTIONS, DEFAULT_SEARCH_RADIUS,
    MINUTES_PER_STOP, MAX_DISCOVERY_STOPS, KMEANS_THRESHOLD,
)
from database import get_connection, get_products, safe_parse_date
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop, haversine_distance
from routing_engine import (
    geocode_nominatim, build_optimized_route,
    search_overpass_businesses, filter_chains,
    OSM_BUSINESS_TAGS,
)

WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
WEEKDAY_EMOJIS = {"Lunes": "1️⃣", "Martes": "2️⃣", "Miércoles": "3️⃣", "Jueves": "4️⃣", "Viernes": "5️⃣", "Sábado": "6️⃣"}
DAY_INDEX_MAP = {"Monday": "Lunes", "Tuesday": "Martes", "Wednesday": "Miércoles", "Thursday": "Jueves", "Friday": "Viernes", "Saturday": "Sábado"}

# Business type selector for /ruta_pie prospecting (OSM-based)
BUSINESS_TYPE_OPTIONS = {
    "tienda": {"emoji": "🏪", "label": "Tiendas / Minimercados"},
    "restaurante": {"emoji": "🍽️", "label": "Restaurantes"},
    "farmacia": {"emoji": "🏥", "label": "Farmacias / Droguerías"},
    "panaderia": {"emoji": "🥖", "label": "Panaderías"},
    "ferreteria": {"emoji": "🔧", "label": "Ferreterías"},
    "empresa": {"emoji": "🏢", "label": "Empresas / Oficinas"},
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
                items = get_products(vendedor_id)

                if not items:
                    bot.send_message(message.chat.id, "📦 Sin productos. Usa /configurar para crear tu catálogo.", reply_markup=types.ReplyKeyboardRemove())
                    return

                response = "📦 <b>INVENTARIO EN BODEGA</b>\n" + "━" * 30 + "\n\n"
                for item in items:
                    stock = item.get("stock_actual", 0)
                    stock_min = item.get("stock_minimo", 0)
                    alert = "🟡 BAJO" if stock <= stock_min and stock_min > 0 else "🟢 OK"
                    if stock == 0:
                        alert = "🔴 AGOTADO"
                    ultima = safe_parse_date(item.get("ultima_actualizacion"))
                    ultima_str = ultima.isoformat() if ultima else "N/A"
                    response += f"📦 <b>{item['nombre']}</b>\n"
                    response += f"   Stock: <b>{stock}</b> uds | Mín: {stock_min} | {alert}\n"
                    response += f"   💵 Compra: {format_cop(item.get('precio_compra', 0))} | Venta: {format_cop(item.get('precio_venta', 0))}\n"
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
                conn.execute(
                    "UPDATE productos SET stock_actual = stock_actual + %s, ultima_actualizacion = %s WHERE vendedor_id = %s AND nombre = %s",
                    (qty, today, vendedor_id, product),
                )
                conn.commit()
                new_stock = conn.execute(
                    "SELECT stock_actual FROM productos WHERE vendedor_id = %s AND nombre = %s",
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
                    "UPDATE productos SET stock_minimo = %s WHERE vendedor_id = %s AND nombre = %s",
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
    # /ruta_pie — Walking prospecting (V3: Overpass + VROOM)
    # =====================================================================

    @bot.message_handler(commands=["ruta_pie"])
    @requiere_suscripcion(bot)
    def cmd_route_walking(message):
        if not ORS_API_KEY:
            bot.send_message(message.chat.id, "❌ <b>ORS_API_KEY no configurada.</b>\nContacta soporte.")
            return
        bot.send_message(
            message.chat.id,
            "📱 <b>RADAR DE PROSPECCIÓN</b>\n\n"
            "🔍 Encuentra negocios reales cerca de ti.\n\n"
            "📍 Envía tu <b>ubicación actual</b> con el clip 📎\n"
            "   o escribe tu punto de partida:",
        )
        bot.register_next_step_handler(message, _step_disc_origin_v2, bot, get_vendedor_id(message))

    def _step_disc_origin_v2(message, bot, vendedor_id):
        try:
            route_data = {}

            # Accept Telegram location (📎 clip) or text address
            if message.content_type == "location":
                route_data["lat"] = message.location.latitude
                route_data["lng"] = message.location.longitude
                route_data["origin_text"] = f"{route_data['lat']:.4f}, {route_data['lng']:.4f}"
            else:
                route_data["origin_text"] = (message.text or "").strip()
                bot.send_message(message.chat.id, "🔍 Buscando ubicación...")
                lat, lng = geocode_nominatim(route_data["origin_text"])
                if lat is None:
                    bot.send_message(message.chat.id, "❌ No encontré esa dirección. Intenta ser más específico.")
                    return
                route_data["lat"] = lat
                route_data["lng"] = lng

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("🎯 Todos los Tipos")
            for key, info in BUSINESS_TYPE_OPTIONS.items():
                markup.add(f"{info['emoji']} {info['label']}")

            bot.send_message(
                message.chat.id,
                f"✅ Ubicación: {route_data['lat']:.4f}, {route_data['lng']:.4f}\n\n🎯 <b>¿Qué tipo de negocio buscas?</b>",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _step_disc_target_v2, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_target_v2(message, bot, vendedor_id, route_data):
        try:
            selected = (message.text or "").strip()
            if "Todos" in selected:
                route_data["target_keys"] = list(BUSINESS_TYPE_OPTIONS.keys())
                route_data["target_label"] = "Todos los Tipos"
            else:
                for key, info in BUSINESS_TYPE_OPTIONS.items():
                    if info["label"] in selected:
                        route_data["target_keys"] = [key]
                        route_data["target_label"] = info["label"]
                        break
                else:
                    route_data["target_keys"] = list(BUSINESS_TYPE_OPTIONS.keys())
                    route_data["target_label"] = "Todos"

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            for label in SEARCH_RADIUS_OPTIONS:
                markup.add(label)

            bot.send_message(message.chat.id, "📍 <b>¿Qué radio de búsqueda?</b>", reply_markup=markup)
            bot.register_next_step_handler(message, _step_disc_radius_v2, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_radius_v2(message, bot, vendedor_id, route_data):
        try:
            selected = (message.text or "").strip()
            route_data["radius"] = SEARCH_RADIUS_OPTIONS.get(selected, DEFAULT_SEARCH_RADIUS)

            bot.send_message(
                message.chat.id,
                "📍 Escribe la <b>dirección de destino final</b>\n(Donde terminas tu jornada):\n\n"
                "O escribe <b>mismo</b> para volver al punto de partida.",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _step_disc_dest_v2, bot, vendedor_id, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_disc_dest_v2(message, bot, vendedor_id, route_data):
        try:
            dest_text = (message.text or "").strip()
            if dest_text.lower() in ("mismo", "misma", "volver", "regreso"):
                route_data["dest_lat"] = route_data["lat"]
                route_data["dest_lng"] = route_data["lng"]
                route_data["dest_label"] = "Regreso al inicio"
            else:
                route_data["dest_label"] = dest_text
                # We'll use the text for the Maps URL, no need to geocode
                route_data["dest_lat"] = None
                route_data["dest_lng"] = None

            _execute_discovery_v2(bot, message, route_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ruta_camion — Delivery route (V3: VROOM + K-Means)
    # =====================================================================

    @bot.message_handler(commands=["ruta_camion"])
    @requiere_suscripcion(bot)
    def cmd_route_truck(message):
        try:
            if not ORS_API_KEY:
                bot.send_message(message.chat.id, "❌ <b>ORS_API_KEY no configurada.</b>")
                return

            vendedor_id = get_vendedor_id(message)
            conn = get_connection(vendedor_id)
            try:
                pending = conn.execute("""
                    SELECT c.id, c.nombre, c.direccion, c.latitud, c.longitud
                    FROM pedidos p
                    JOIN clientes c ON p.cliente_id = c.id
                    WHERE p.vendedor_id = %s AND p.estado = 'Pendiente'
                      AND c.latitud IS NOT NULL AND c.longitud IS NOT NULL
                    GROUP BY c.id, c.nombre, c.direccion, c.latitud, c.longitud
                """, (vendedor_id,)).fetchall()
            finally:
                conn.close()

            if not pending:
                bot.send_message(
                    message.chat.id,
                    "🚚 No hay pedidos pendientes con coordenadas.\n\n"
                    "💡 Asegúrate de que tus clientes tengan <b>latitud/longitud</b> registrada.",
                )
                return

            bot.send_message(
                message.chat.id,
                f"🚚 <b>RUTA DE ENTREGAS</b>\n\n"
                f"📦 <b>{len(pending)}</b> clientes con pedidos pendientes.\n\n"
                "📍 Escribe el <b>punto de partida</b>\n"
                "   o envía tu ubicación con el clip 📎:",
            )
            bot.register_next_step_handler(message, _step_truck_origin_v2, bot, vendedor_id, pending)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_truck_origin_v2(message, bot, vendedor_id, pending):
        try:
            # Get origin coordinates
            if message.content_type == "location":
                origin_lat = message.location.latitude
                origin_lng = message.location.longitude
                origin_label = f"{origin_lat:.4f}, {origin_lng:.4f}"
            else:
                origin_label = (message.text or "").strip()
                bot.send_message(message.chat.id, "🔍 Geocodificando origen...")
                origin_lat, origin_lng = geocode_nominatim(origin_label)
                if origin_lat is None:
                    bot.send_message(message.chat.id, "❌ No encontré esa dirección.")
                    return

            bot.send_message(message.chat.id, "🧠 Calculando ruta óptima...")

            # Build stops list for the routing engine
            stops = []
            for row in pending:
                stops.append({
                    "lat": row["latitud"],
                    "lng": row["longitud"],
                    "name": row["nombre"],
                    "address": row["direccion"] or "Sin dirección",
                })

            # Run the full pipeline: Cluster → VROOM Optimization → URLs
            clusters = build_optimized_route(
                origin_coords=(origin_lat, origin_lng),
                stops=stops,
                profile="driving-car",
            )

            if not clusters:
                bot.send_message(message.chat.id, "⚠️ No se pudo calcular la ruta. Intenta de nuevo.")
                return

            # Build response
            response = f"🚚 <b>RUTA DE ENTREGAS OPTIMIZADA</b>\n"
            response += f"📍 Origen: {origin_label}\n"
            response += "━" * 30 + "\n\n"

            if len(clusters) > 1:
                response += f"📊 <b>{len(pending)} entregas</b> divididas en <b>{len(clusters)} zonas</b> (K-Means)\n\n"

            for cluster in clusters:
                dist_km = cluster.get('total_distance_km', 0)
                dist_label = f" | 📏 {dist_km} km" if dist_km else ""
                response += f"🗺️ <b>{cluster['label']}</b> — {cluster['total_stops']} paradas | ⏱️ ~{cluster['total_time_min']} min{dist_label}\n"
                for i, stop in enumerate(cluster["stops"], 1):
                    response += f"  {i}. {stop['name']} — {stop.get('address', '')}\n"
                response += "\n"

            bot.send_message(message.chat.id, response, disable_web_page_preview=True)

            # Send inline buttons for each cluster
            for cluster in clusters:
                markup = types.InlineKeyboardMarkup()
                label = f"🗺️ Abrir {cluster['label']} ({cluster['total_stops']} paradas)"
                markup.add(types.InlineKeyboardButton(label, url=cluster["google_maps_url"]))
                bot.send_message(message.chat.id, f"📲 <b>{cluster['label']}</b>", reply_markup=markup)

        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ruta_semanal — Weekly fixed routes (V3: VROOM)
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
                f"📅 <b>RUTAS SEMANALES V2</b>\n{'━'*30}\n\n{summary}\n¿Qué día ver?",
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

            # Build pedir origen prompt
            bot.send_message(
                chat_id,
                f"📅 <b>RUTA DEL {chosen_day.upper()}</b>\n\n"
                f"👥 <b>{len(clients)}</b> clientes encontrados.\n\n"
                "📍 Envía tu <b>ubicación actual</b> con 📎\n"
                "   o escribe tu punto de partida:",
            )
            bot.register_next_step_handler(call.message, _step_weekly_origin, bot, vendedor_id, chosen_day, clients)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    def _step_weekly_origin(message, bot, vendedor_id, chosen_day, clients):
        try:
            # Get origin coordinates
            if message.content_type == "location":
                origin_lat = message.location.latitude
                origin_lng = message.location.longitude
            else:
                origin_text = (message.text or "").strip()
                bot.send_message(message.chat.id, "🔍 Geocodificando...")
                origin_lat, origin_lng = geocode_nominatim(origin_text)
                if origin_lat is None:
                    # Fallback: use first client's location as origin
                    origin_lat = clients[0]["latitud"]
                    origin_lng = clients[0]["longitud"]
                    bot.send_message(message.chat.id, "⚠️ No encontré la dirección. Usando el primer cliente como origen.")

            bot.send_message(message.chat.id, "🧠 Optimizando ruta...")

            # Build stops list
            stops = []
            for c in clients:
                stops.append({
                    "lat": c["latitud"],
                    "lng": c["longitud"],
                    "name": c["nombre"],
                    "address": c.get("direccion") or "Sin dirección",
                    "phone": c.get("telefono") or "Sin tel.",
                    "tipo_negocio": c.get("tipo_negocio") or "",
                })

            # Run optimization with walking profile
            clusters = build_optimized_route(
                origin_coords=(origin_lat, origin_lng),
                stops=stops,
                profile="foot-walking",
            )

            if not clusters:
                bot.send_message(message.chat.id, "⚠️ Error al calcular la ruta. Intenta de nuevo.")
                return

            # Build response (single cluster expected for weekly routes)
            for cluster in clusters:
                ordered = cluster["stops"]
                total_time = cluster["total_time_min"]
                dist_km = cluster.get("total_distance_km", 0)
                dist_label = f" | 📏 {dist_km} km" if dist_km else ""

                response = f"📅 <b>RUTA DEL {chosen_day.upper()}</b> (Optimizada V3)\n"
                response += "━" * 30 + "\n\n"
                response += f"👥 <b>{len(ordered)}</b> clientes | ⏱️ ~{total_time} min{dist_label}\n\n"

                for i, stop in enumerate(ordered, 1):
                    response += f"📍 <b>{i}. {stop['name']}</b>\n"
                    response += f"     {stop.get('address', 'Sin dirección')}\n"
                    response += f"     📱 {stop.get('phone', '')} | 🏪 {stop.get('tipo_negocio', '')}\n"
                    if i < len(ordered):
                        response += "     │\n     ↓ 🚶\n"

                response += "\n" + "━" * 30 + "\n"

                # Send message and button
                bot.send_message(message.chat.id, response, disable_web_page_preview=True)

                markup = types.InlineKeyboardMarkup()
                markup.add(types.InlineKeyboardButton(
                    f"🗺️ Abrir Ruta ({len(ordered)} paradas)",
                    url=cluster["google_maps_url"],
                ))
                bot.send_message(message.chat.id, "📲 <b>ABRIR EN GOOGLE MAPS:</b>", reply_markup=markup)

        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")


# =========================================================================
# HELPERS (module-level)
# =========================================================================

def _execute_discovery_v2(bot, message, route_data):
    """Search Overpass API for businesses and build optimized walking route."""
    try:
        bot.send_message(
            message.chat.id,
            "🔍 <b>Escaneando zona...</b>\n"
            "🌍 Buscando negocios cercanos...",
            reply_markup=types.ReplyKeyboardRemove(),
        )

        lat, lng, radius = route_data["lat"], route_data["lng"], route_data["radius"]

        # Step 1: Search Overpass API
        all_places = search_overpass_businesses(
            lat, lng, radius,
            business_types=route_data["target_keys"],
        )

        # Step 2: Anti-targeting filter
        all_places = filter_chains(all_places)

        if not all_places:
            bot.send_message(
                message.chat.id,
                f"📍 No se encontraron negocios de tipo <b>{route_data['target_label']}</b> en {radius}m.\n\n"
                "💡 Intenta con un radio más grande o tipo 'Todos'.",
            )
            return

        # Limit to MAX_DISCOVERY_STOPS
        candidates = all_places[:MAX_DISCOVERY_STOPS]

        # Step 3: Build stops for routing engine
        stops = []
        for place in candidates:
            stops.append({
                "lat": place["lat"],
                "lng": place["lng"],
                "name": place["name"],
                "address": place.get("address", ""),
                "emoji": place.get("emoji", "🏪"),
                "phone": place.get("phone", ""),
                "opening_hours": place.get("opening_hours", ""),
                "distance_from_origin": place.get("distance_from_origin", 0),
            })

        # Step 4: Optimize route with VROOM (walking)
        clusters = build_optimized_route(
            origin_coords=(lat, lng),
            stops=stops,
            profile="foot-walking",
        )

        if not clusters:
            bot.send_message(message.chat.id, "⚠️ Error al optimizar la ruta.")
            return

        # Use first (and usually only) cluster
        cluster = clusters[0]
        ordered_route = cluster["stops"]
        total_time = cluster["total_time_min"]
        total_distance_km = cluster.get("total_distance_km", 0)

        remaining = len(all_places) - len(ordered_route)

        # Build output
        response = "📱 <b>RADAR DE PROSPECCIÓN V3</b>\n"
        response += "━" * 34 + "\n\n"
        response += f"📍 <b>Zona:</b> {route_data['origin_text']}\n"
        response += f"🎯 <b>Tipo:</b> {route_data['target_label']}\n"
        response += f"📌 <b>Radio:</b> {radius}m\n"
        response += f"🔍 <b>Encontrados:</b> {len(all_places)} negocios\n"
        response += f"📊 <b>En ruta:</b> {len(ordered_route)} paradas\n"
        response += f"⏱️ <b>Tiempo est.:</b> ~{total_time} min\n"
        if total_distance_km:
            response += f"📏 <b>Distancia:</b> {total_distance_km} km\n"
        response += "\n"

        response += "🗺️ <b>RECORRIDO OPTIMIZADO:</b>\n" + "━" * 34 + "\n\n"
        response += f"🟢 <b>INICIO:</b> {route_data['origin_text']}\n     │\n"

        for i, place in enumerate(ordered_route, 1):
            dist = place.get("distance_from_origin", 0)
            walk_label = f"{dist:.0f}m" if dist < 1000 else f"{dist/1000:.1f}km"

            response += f"     ↓ 🚶 {walk_label}\n"
            response += f"📍 <b>{i}. {place['name']}</b> {place.get('emoji', '')}\n"
            if place.get("address"):
                response += f"     {place['address']}\n"
            if place.get("phone"):
                response += f"     📱 {place['phone']}\n"
            if place.get("opening_hours"):
                response += f"     🕐 {place['opening_hours']}\n"
            if i < len(ordered_route):
                response += "     │\n"

        response += "     │\n     ↓ 🚶\n"
        response += f"🔴 <b>FIN:</b> {route_data['dest_label']}\n\n"

        if remaining > 0:
            response += f"⚠️ Hay <b>{remaining}</b> negocios más fuera de esta ruta.\n\n"

        bot.send_message(message.chat.id, response, disable_web_page_preview=True)

        # Send Google Maps button
        markup = types.InlineKeyboardMarkup()
        markup.add(types.InlineKeyboardButton(
            f"🗺️ Abrir Ruta Peatonal ({len(ordered_route)} paradas)",
            url=cluster["google_maps_url"],
        ))
        bot.send_message(message.chat.id, "📲 <b>ABRIR EN GOOGLE MAPS:</b>", reply_markup=markup)

    except Exception as e:
        bot.send_message(message.chat.id, f"⚠️ Error en búsqueda: {e}")
