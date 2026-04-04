# -*- coding: utf-8 -*-
"""
ControlIA SaaS — CRM & Commercial Intelligence Handler
Commands: /nuevo_cliente, /clientes, /buscar, /radar, /asignar_dia, /nota, /ficha, /seguimiento

V2 CHANGES:
  - is_admin() → @requiere_suscripcion(bot)
  - get_connection() → tenant-scoped database functions
  - TARGET_BUSINESS_TYPES / BLACKLIST → removed (SaaS-generic)
  - date.fromisoformat() → safe_parse_date()
  - All queries filtered by vendedor_id
"""
from telebot import types
from datetime import date, timedelta

from database import (
    get_connection, get_client, get_clients, add_client, update_client,
    search_clients, get_client_profile, get_pipeline_stats,
    add_note, get_notes, safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop, safe_split, sanitize_phone_co, geocode_address
from config import logger

WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
WEEKDAY_EMOJIS = {"Lunes": "1️⃣", "Martes": "2️⃣", "Miércoles": "3️⃣", "Jueves": "4️⃣", "Viernes": "5️⃣", "Sábado": "6️⃣"}

# Generic business types (SaaS — not tied to any single industry)
BUSINESS_TYPES = [
    "🏪 Tienda", "🍽️ Restaurante", "🏢 Empresa", "🏭 Fábrica",
    "🏥 Farmacia", "🏫 Institución", "🛒 Supermercado", "🏠 Persona Natural",
    "🏪 Otro",
]


def register(bot):

    # =====================================================================
    # /nuevo_cliente — Multi-step registration
    # =====================================================================

    @bot.message_handler(commands=["nuevo_cliente"])
    @requiere_suscripcion(bot)
    def cmd_new_client(message):
        bot.send_message(message.chat.id, "📝 <b>Registro de Nuevo Cliente</b>\n\nEscribe el <b>nombre</b> del cliente:")
        bot.register_next_step_handler(message, _step_name, bot, get_vendedor_id(message))

    def _step_name(message, bot, vendedor_id):
        try:
            nombre = (message.text or "").strip()
            if not nombre or nombre.startswith("/"):
                bot.send_message(message.chat.id, "⚠️ Escribe un nombre válido.")
                bot.register_next_step_handler(message, _step_name, bot, vendedor_id)
                return
            data = {"nombre": nombre}
            bot.send_message(message.chat.id, "📱 Escribe el <b>teléfono</b> del cliente:")
            bot.register_next_step_handler(message, _step_phone, bot, vendedor_id, data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_phone(message, bot, vendedor_id, data):
        try:
            data["telefono"] = (message.text or "").strip()
            bot.send_message(
                message.chat.id,
                "📍 Escribe la <b>dirección</b> del cliente:\n"
                "<i>(Sé preciso para geolocalización. Ej: Calle 170 #9-15, Bogotá)</i>",
            )
            bot.register_next_step_handler(message, _step_address, bot, vendedor_id, data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_address(message, bot, vendedor_id, data):
        try:
            data["direccion"] = (message.text or "").strip()
            bot.send_message(message.chat.id, "🔍 Geolocalizando dirección...")
            lat, lng = geocode_address(data["direccion"])
            if lat is not None:
                data["latitud"] = lat
                data["longitud"] = lng
                bot.send_message(message.chat.id, f"✅ Ubicación: <code>{lat:.5f}, {lng:.5f}</code>")
            else:
                data["latitud"] = None
                data["longitud"] = None
                bot.send_message(message.chat.id, "⚠️ Sin GPS. Puedes actualizarlo después con /editar")

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            for bt in BUSINESS_TYPES:
                markup.add(bt)

            bot.send_message(message.chat.id, "🎯 Selecciona el <b>tipo de negocio</b>:", reply_markup=markup)
            bot.register_next_step_handler(message, _step_business, bot, vendedor_id, data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_business(message, bot, vendedor_id, data):
        try:
            selected = (message.text or "").strip()
            if "Otro" in selected:
                bot.send_message(message.chat.id, "🏪 Escribe el tipo de negocio:", reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _step_business_manual, bot, vendedor_id, data)
                return
            # Remove emoji prefix
            data["tipo_negocio"] = selected.split(" ", 1)[-1] if " " in selected else selected
            _ask_visit_day(bot, message, vendedor_id, data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_business_manual(message, bot, vendedor_id, data):
        try:
            data["tipo_negocio"] = (message.text or "").strip()
            _ask_visit_day(bot, message, vendedor_id, data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _ask_visit_day(bot, message, vendedor_id, data):
        markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        for day in WEEKDAYS:
            markup.add(f"{WEEKDAY_EMOJIS[day]} {day}")
        markup.add("⏭️ Omitir")

        bot.send_message(
            message.chat.id,
            "📅 <b>¿Qué día visitas a este cliente?</b>\n<i>(Para la ruta semanal)</i>",
            reply_markup=markup,
        )
        bot.register_next_step_handler(message, _step_visit_day, bot, vendedor_id, data)

    def _step_visit_day(message, bot, vendedor_id, data):
        try:
            selected = (message.text or "").strip()
            if "Omitir" in selected:
                data["dia_visita"] = None
            else:
                for day in WEEKDAYS:
                    if day in selected:
                        data["dia_visita"] = day
                        break
                else:
                    data["dia_visita"] = None

            # Save client
            client_id = add_client(vendedor_id, data)

            gps_line = ""
            if data.get("latitud"):
                gps_line = f"\n📌 GPS: <code>{data['latitud']:.5f}, {data['longitud']:.5f}</code>"
            day_line = ""
            if data.get("dia_visita"):
                day_line = f"\n📅 Día de visita: {data['dia_visita']}"

            bot.send_message(
                message.chat.id,
                f"✅ <b>Cliente registrado</b>\n\n"
                f"🆔 ID: <b>{client_id}</b>\n"
                f"👤 {data['nombre']}\n"
                f"📱 {data['telefono']}\n"
                f"📍 {data['direccion']}{gps_line}{day_line}\n"
                f"🏪 {data['tipo_negocio']}\n"
                f"📌 Estado: Prospecto",
                reply_markup=types.ReplyKeyboardRemove(),
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error al guardar: {e}")

    # =====================================================================
    # /asignar_dia — Assign visit day
    # =====================================================================

    @bot.message_handler(commands=["asignar_dia"])
    @requiere_suscripcion(bot)
    def cmd_assign_day(message):
        bot.send_message(message.chat.id, "📅 Escribe el <b>ID del cliente</b>:")
        bot.register_next_step_handler(message, _assign_day_id, bot, get_vendedor_id(message))

    def _assign_day_id(message, bot, vendedor_id):
        try:
            client_id = int(message.text.strip())
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, f"❌ No existe cliente con ID {client_id}")
                return

            current_day = client.get("dia_visita") or "Sin asignar"
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            for day in WEEKDAYS:
                markup.add(f"{WEEKDAY_EMOJIS[day]} {day}")
            markup.add("🚫 Quitar día asignado")

            bot.send_message(
                message.chat.id,
                f"📅 <b>{client['nombre']}</b>\nDía actual: <b>{current_day}</b>\n\n¿Qué día asignar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _assign_day_save, bot, vendedor_id, client_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _assign_day_save(message, bot, vendedor_id, client_id):
        try:
            selected = (message.text or "").strip()
            new_day = None
            if "Quitar" not in selected:
                for day in WEEKDAYS:
                    if day in selected:
                        new_day = day
                        break

            update_client(client_id, vendedor_id, dia_visita=new_day)
            label = new_day or "Sin asignar"
            bot.send_message(message.chat.id, f"✅ Día de visita: <b>{label}</b>", reply_markup=types.ReplyKeyboardRemove())
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /clientes — List clients with filter
    # =====================================================================

    @bot.message_handler(commands=["clientes"])
    @requiere_suscripcion(bot)
    def cmd_clients(message):
        markup = types.InlineKeyboardMarkup(row_width=3)
        markup.row(
            types.InlineKeyboardButton("✅ Activos", callback_data="clients_filter:Activo"),
            types.InlineKeyboardButton("⏳ Prospectos", callback_data="clients_filter:Prospecto"),
            types.InlineKeyboardButton("📋 Todos", callback_data="clients_filter:Todos"),
        )
        bot.send_message(message.chat.id, "👥 <b>CARTERA DE CLIENTES</b>\n\n¿Qué filtro aplicar?", reply_markup=markup)

    @bot.callback_query_handler(func=lambda call: call.data.startswith("clients_filter:"))
    @requiere_suscripcion_callback(bot)
    def handle_clients_filter(call):
        try:
            bot.answer_callback_query(call.id)
            filter_type = call.data.replace("clients_filter:", "")
            vendedor_id = call.from_user.id

            if filter_type == "Todos":
                clients = get_clients(vendedor_id)
                label = "TODOS"
            else:
                clients = get_clients(vendedor_id, estado=filter_type)
                label = filter_type.upper() + "S"

            if not clients:
                bot.send_message(call.message.chat.id, f"📭 No hay clientes ({label}).")
                return

            response = f"👥 <b>CLIENTES — {label}</b> ({len(clients)}):\n\n"
            markup = types.InlineKeyboardMarkup(row_width=2)

            for c in clients:
                state_icon = "✅" if c["estado"] == "Activo" else "⏳"
                day_tag = f" | 📅 {c['dia_visita']}" if c.get("dia_visita") else ""
                gps_tag = " 📌" if c.get("latitud") else ""
                response += f"{state_icon} <b>{c['id']}. {c['nombre']}</b>{gps_tag}\n"
                response += f"   📱 {c.get('telefono') or 'N/A'} | 🏪 {c.get('tipo_negocio') or 'N/A'}{day_tag}\n\n"

                markup.add(
                    types.InlineKeyboardButton(f"📋 Ficha #{c['id']} — {c['nombre'][:20]}", callback_data=f"ficha:{c['id']}")
                )

            if len(response) > 4000:
                for part in safe_split(response):
                    bot.send_message(call.message.chat.id, part)
                bot.send_message(call.message.chat.id, "👇 <b>Ver ficha:</b>", reply_markup=markup)
            else:
                bot.send_message(call.message.chat.id, response, reply_markup=markup)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data.startswith("ficha:"))
    @requiere_suscripcion_callback(bot)
    def handle_ficha_callback(call):
        try:
            bot.answer_callback_query(call.id)
            client_id = call.data.replace("ficha:", "")
            call.message.from_user = call.from_user
            call.message.text = f"/ficha {client_id}"
            call.message.vendedor = call.vendedor
            bot.process_new_messages([call.message])
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /buscar — Search clients by name
    # =====================================================================

    @bot.message_handler(commands=["buscar"])
    @requiere_suscripcion(bot)
    def cmd_search(message):
        bot.send_message(message.chat.id, "🔍 Escribe el <b>nombre</b> del cliente a buscar:")
        bot.register_next_step_handler(message, _step_search, bot, get_vendedor_id(message))

    def _step_search(message, bot, vendedor_id):
        try:
            query = (message.text or "").strip()
            results = search_clients(vendedor_id, query)

            if not results:
                bot.send_message(message.chat.id, f'🔍 No se encontraron clientes con "{query}".')
                return

            response = f'🔍 <b>Resultados para "{query}":</b>\n\n'
            for c in results:
                state_icon = "✅" if c["estado"] == "Activo" else "⏳"
                day_tag = f" | 📅 {c['dia_visita']}" if c.get("dia_visita") else ""
                response += f"{state_icon} <b>{c['id']}. {c['nombre']}</b>\n"
                response += f"   📱 {c.get('telefono') or 'N/A'} | 🏪 {c.get('tipo_negocio') or 'N/A'}{day_tag}\n"
                response += f"   📍 {c.get('direccion') or 'N/A'}\n\n"

            bot.send_message(message.chat.id, response)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /radar — Commercial intelligence (tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["radar"])
    @requiere_suscripcion(bot)
    def cmd_radar(message):
        try:
            vendedor_id = get_vendedor_id(message)
            nombre_negocio = message.vendedor["nombre_negocio"]
            conn = get_connection(vendedor_id)
            try:
                today = date.today()
                report = f"📡 <b>RADAR COMERCIAL — {nombre_negocio}</b>\n"
                report += f"📅 {today.strftime('%d/%m/%Y')}\n"
                report += "━" * 30 + "\n\n"

                # TOP 3 VIP
                top_vip = conn.execute("""
                    SELECT c.id, c.nombre, SUM(p.cantidad * p.precio_venta) as total_ventas
                    FROM clientes c JOIN pedidos p ON c.id = p.cliente_id
                    WHERE c.vendedor_id = %s
                    GROUP BY c.id ORDER BY total_ventas DESC LIMIT 3
                """, (vendedor_id,)).fetchall()

                report += "🏆 <b>TOP 3 CLIENTES VIP</b>\n"
                if top_vip:
                    medals = ["🥇", "🥈", "🥉"]
                    for i, row in enumerate(top_vip):
                        report += f"  {medals[i]} {row['nombre']} — {format_cop(row['total_ventas'])}\n"
                else:
                    report += "  Sin datos de ventas aún.\n"
                report += "\n"

                # CHURN ALERT
                cutoff_date = (today - timedelta(days=14)).isoformat()
                fugue_clients = conn.execute("""
                    SELECT c.id, c.nombre, c.telefono, c.ultima_interaccion
                    FROM clientes c
                    WHERE c.vendedor_id = %s AND c.estado = 'Activo' AND c.ultima_interaccion < %s
                    AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id AND p.vendedor_id = %s AND p.fecha >= %s)
                """, (vendedor_id, cutoff_date, vendedor_id, cutoff_date)).fetchall()

                report += "🚨 <b>ALERTA FUGA</b> (Sin compras +14 días)\n"
                if fugue_clients:
                    for row in fugue_clients:
                        phone = sanitize_phone_co(row.get("telefono", ""))
                        wa_link = f"https://wa.me/{phone}"
                        interaccion = safe_parse_date(row.get("ultima_interaccion"))
                        fecha_str = interaccion.isoformat() if interaccion else "N/A"
                        report += f"  ⚠️ {row['nombre']} — Último: {fecha_str}\n"
                        report += f"     📲 <a href='{wa_link}'>WhatsApp</a>\n"
                else:
                    report += "  ✅ Sin alertas.\n"
                report += "\n"

                # COLD PROSPECTS
                cold_date = (today - timedelta(days=7)).isoformat()
                cold_prospects = conn.execute("""
                    SELECT id, nombre, fecha_registro
                    FROM clientes WHERE vendedor_id = %s AND estado = 'Prospecto' AND fecha_registro < %s
                """, (vendedor_id, cold_date)).fetchall()

                report += "🧊 <b>PROSPECTOS FRÍOS</b> (+7 días sin compra)\n"
                if cold_prospects:
                    for row in cold_prospects:
                        fecha_reg = safe_parse_date(row.get("fecha_registro"))
                        fecha_str = fecha_reg.isoformat() if fecha_reg else "N/A"
                        report += f"  ❄️ {row['nombre']} — Registrado: {fecha_str}\n"
                else:
                    report += "  ✅ Sin prospectos fríos.\n"
            finally:
                conn.close()

            bot.send_message(message.chat.id, report, disable_web_page_preview=True)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /nota — Add client note
    # =====================================================================

    @bot.message_handler(commands=["nota"])
    @requiere_suscripcion(bot)
    def cmd_note(message):
        try:
            parts = message.text.strip().split(maxsplit=1)
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /nota [ID_Cliente]")
                return

            vendedor_id = get_vendedor_id(message)
            client_id = int(parts[1])
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, f"❌ No existe cliente con ID {client_id}")
                return

            bot.send_message(
                message.chat.id,
                f"📝 <b>NOTA PARA: {client['nombre']}</b>\n\nEscribe la nota:",
            )
            bot.register_next_step_handler(message, _step_note_save, bot, vendedor_id, client_id, client["nombre"])
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_note_save(message, bot, vendedor_id, client_id, client_name):
        try:
            text = (message.text or "").strip()
            add_note(vendedor_id, client_id, text)
            today = date.today().isoformat()

            bot.send_message(
                message.chat.id,
                f"✅ <b>Nota guardada</b>\n\n👤 {client_name}\n📝 {text}\n📅 {today}",
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /ficha — Full client profile
    # =====================================================================

    @bot.message_handler(commands=["ficha"])
    @requiere_suscripcion(bot)
    def cmd_profile(message):
        try:
            parts = message.text.strip().split(maxsplit=1)
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /ficha [ID_Cliente]")
                return

            vendedor_id = get_vendedor_id(message)
            client_id = int(parts[1])
            profile = get_client_profile(client_id, vendedor_id)

            if not profile:
                bot.send_message(message.chat.id, f"❌ No existe cliente con ID {client_id}")
                return

            client = profile["client"]
            orders = profile["orders"]
            totals = profile["totals"]
            notes = profile["notes"]

            state_icon = "✅" if client["estado"] == "Activo" else "⏳"
            phone = sanitize_phone_co(client.get("telefono", ""))
            wa_url = f"https://wa.me/{phone}"

            days_since = ""
            interaccion = safe_parse_date(client.get("ultima_interaccion"))
            if interaccion:
                delta = (date.today() - interaccion).days
                days_since = f" ({delta} días)"

            response = "📋 <b>FICHA DEL CLIENTE</b>\n"
            response += "━" * 30 + "\n\n"
            response += f"{state_icon} <b>{client['nombre']}</b> (ID: {client_id})\n"
            response += f"📱 {client.get('telefono') or 'N/A'} | 🏪 {client.get('tipo_negocio') or 'N/A'}\n"
            response += f"📍 {client.get('direccion') or 'N/A'}\n"
            if client.get("dia_visita"):
                response += f"📅 Día de visita: <b>{client['dia_visita']}</b>\n"
            if client.get("latitud"):
                maps_url = f"https://www.google.com/maps?q={client['latitud']},{client['longitud']}"
                response += f"📌 <a href='{maps_url}'>Ver en Google Maps</a>\n"
            response += f"📲 <a href='{wa_url}'>WhatsApp</a>\n"

            fecha_reg = safe_parse_date(client.get("fecha_registro"))
            fecha_reg_str = fecha_reg.isoformat() if fecha_reg else "N/A"
            interaccion_str = interaccion.isoformat() if interaccion else "N/A"
            response += f"📅 Registro: {fecha_reg_str} | Última: {interaccion_str}{days_since}\n\n"

            # Financials
            response += f"💰 <b>Total facturado:</b> {format_cop(totals['total_vendido'])}\n"
            response += f"📈 <b>Utilidad:</b> {format_cop(totals['total_utilidad'])}\n"
            response += f"📦 <b>Pedidos:</b> {totals['num_pedidos']}\n\n"

            # Orders
            if orders:
                response += "📦 <b>Últimos pedidos:</b>\n"
                for o in orders:
                    total = o["cantidad"] * o["precio_venta"]
                    pay_icon = "🟢" if o.get("estado_pago") == "Pagado" else "🔴"
                    response += f"  #{o['id']} | {o['cantidad']}x {o['producto']} | {format_cop(total)} | {o['estado']} {pay_icon}\n"
                response += "\n"

            # Notes
            if notes:
                response += "📝 <b>Últimas notas:</b>\n"
                for n in notes:
                    fecha_nota = safe_parse_date(n.get("fecha"))
                    fecha_str = fecha_nota.isoformat() if fecha_nota else "N/A"
                    response += f"  • [{fecha_str}] {n['texto']}\n"
                response += "\n"

            response += "💡 Comandos rápidos:\n"
            response += f"  /nota {client_id} — Agregar nota\n"
            response += f"  /repetir {client_id} — Repetir pedido"

            bot.send_message(message.chat.id, response, disable_web_page_preview=True)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /seguimiento — Sales pipeline
    # =====================================================================

    @bot.message_handler(commands=["seguimiento"])
    @requiere_suscripcion(bot)
    def cmd_pipeline(message):
        try:
            vendedor_id = get_vendedor_id(message)
            states = get_pipeline_stats(vendedor_id)
            total = sum(row["c"] for row in states) if states else 0

            conn = get_connection(vendedor_id)
            try:
                # VIP candidates
                vip_candidates = conn.execute("""
                    SELECT c.id, c.nombre, COUNT(p.id) as num_orders
                    FROM clientes c JOIN pedidos p ON c.id = p.cliente_id
                    WHERE c.vendedor_id = %s AND c.estado = 'Activo'
                    GROUP BY c.id HAVING COUNT(p.id) >= 3
                    ORDER BY num_orders DESC LIMIT 5
                """, (vendedor_id,)).fetchall()

                # Inactive risk
                cutoff_30 = (date.today() - timedelta(days=30)).isoformat()
                inactive_candidates = conn.execute("""
                    SELECT c.id, c.nombre, c.ultima_interaccion
                    FROM clientes c WHERE c.vendedor_id = %s AND c.estado = 'Activo'
                    AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id AND p.vendedor_id = %s AND p.fecha >= %s)
                """, (vendedor_id, vendedor_id, cutoff_30)).fetchall()
            finally:
                conn.close()

            state_emojis = {"Prospecto": "⏳", "Activo": "✅", "VIP": "🏆", "Inactivo": "💤"}

            response = "📊 <b>PIPELINE COMERCIAL</b>\n"
            response += "━" * 30 + "\n\n"
            response += f"👥 Total clientes: <b>{total}</b>\n\n"

            for row in states:
                emoji = state_emojis.get(row["estado"], "⬜")
                bar_len = int((row["c"] / total) * 15) if total > 0 else 0
                bar = "█" * bar_len + "░" * (15 - bar_len)
                response += f"{emoji} <b>{row['estado']}</b>: {row['c']}\n"
                response += f"   <code>{bar}</code>\n\n"

            if vip_candidates:
                response += "🏆 <b>CANDIDATOS A VIP</b> (3+ compras):\n"
                for v in vip_candidates:
                    response += f"  ⭐ {v['nombre']} — {v['num_orders']} pedidos\n"
                response += "\n"

            if inactive_candidates:
                response += "💤 <b>RIESGO DE INACTIVIDAD</b> (0 pedidos en 30 días):\n"
                for ic in inactive_candidates:
                    interaccion = safe_parse_date(ic.get("ultima_interaccion"))
                    fecha_str = interaccion.isoformat() if interaccion else "N/A"
                    response += f"  ⚠️ {ic['nombre']} — Último: {fecha_str}\n"

            bot.send_message(message.chat.id, response)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")
