# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Documents Handler (PDF Generation)
Commands: /remision, /despacho, /precios, /cotizar

V2 CHANGES:
  - Removed all hardcoded COMPANY_NAME, OWNER_NAME, OWNER_CC, etc.
  - Now reads business name from message.vendedor["nombre_negocio"]
  - All DB queries scoped to vendedor_id
  - Prices now come from productos table (not the deleted precios table)
  - is_admin() → @requiere_suscripcion(bot)
"""
import io
import urllib.parse
from telebot import types
from datetime import datetime, date

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER

from database import (
    get_connection, get_order, get_products, get_product,
    get_clients, get_client, update_product, safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop, sanitize_phone_co
from config import logger


def register(bot):

    # =====================================================================
    # /remision — Generate PDF invoice from an order
    # =====================================================================

    @bot.message_handler(commands=["remision"])
    @requiere_suscripcion(bot)
    def cmd_remission(message):
        try:
            parts = message.text.strip().split()
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /remision [ID_Pedido]")
                return

            vendedor_id = get_vendedor_id(message)
            nombre_negocio = message.vendedor["nombre_negocio"]
            order_id = int(parts[1])
            order = get_order(order_id, vendedor_id)

            if not order:
                bot.send_message(message.chat.id, "❌ Pedido no encontrado.")
                return

            total = order["cantidad"] * order["precio_venta"]

            buffer = io.BytesIO()
            page_w, page_h = 140 * mm, 216 * mm
            doc = SimpleDocTemplate(
                buffer, pagesize=(page_w, page_h),
                leftMargin=10*mm, rightMargin=10*mm,
                topMargin=10*mm, bottomMargin=10*mm,
            )

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle("RemTitle", parent=styles["Title"], fontSize=14, alignment=TA_CENTER)
            normal_style = ParagraphStyle("RemNormal", parent=styles["Normal"], fontSize=9)

            fecha_order = safe_parse_date(order.get("fecha"))
            fecha_str = fecha_order.isoformat() if fecha_order else date.today().isoformat()

            elements = []
            elements.append(Paragraph(f"REMISIÓN {nombre_negocio}", title_style))
            elements.append(Spacer(1, 5 * mm))

            data = [
                ["Remisión No.", str(order_id), "Fecha", fecha_str],
                ["Cliente", order.get("cliente_nombre", ""), "Dirección", order.get("cliente_dir") or ""],
                ["Teléfono", order.get("cliente_tel") or "", "", ""],
            ]
            t = Table(data, colWidths=[25*mm, 35*mm, 25*mm, 35*mm])
            t.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.9, 0.9, 0.9)),
                ("BACKGROUND", (2, 0), (2, -1), colors.Color(0.9, 0.9, 0.9)),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 5 * mm))

            detail_data = [
                ["Producto", "Cantidad", "Precio Unit.", "Total"],
                [order["producto"], str(order["cantidad"]), format_cop(order["precio_venta"]), format_cop(total)],
            ]
            dt = Table(detail_data, colWidths=[40*mm, 25*mm, 25*mm, 30*mm])
            dt.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.85, 0.85, 0.85)),
            ]))
            elements.append(dt)
            elements.append(Spacer(1, 8 * mm))
            elements.append(Paragraph(f"<b>TOTAL A PAGAR: {format_cop(total)}</b>", normal_style))

            doc.build(elements)
            buffer.seek(0)

            safe_name = nombre_negocio.replace(" ", "_")
            bot.send_document(
                message.chat.id, buffer,
                visible_file_name=f"Remision_{order_id}_{safe_name}.pdf",
                caption=f"📄 Remisión #{order_id} — {order.get('cliente_nombre', '')} — {format_cop(total)}",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido. Uso: /remision [ID_Pedido]")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error al generar remisión: {e}")

    # =====================================================================
    # /despacho — Generic dispatch document
    # =====================================================================

    @bot.message_handler(commands=["despacho"])
    @requiere_suscripcion(bot)
    def cmd_dispatch(message):
        try:
            nombre = message.vendedor["nombre_negocio"]
            dispatch_data = {"items": [], "nombre_negocio": nombre}
            vendedor_id = get_vendedor_id(message)

            bot.send_message(
                message.chat.id,
                f"🚛 <b>DESPACHO DE MERCANCÍA — {nombre}</b>\n\n"
                "📦 <b>Paso 1:</b> Escribe la <b>descripción del producto</b>:",
            )
            bot.register_next_step_handler(message, _desp_item_desc, bot, vendedor_id, dispatch_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_item_desc(message, bot, vendedor_id, dispatch_data):
        try:
            current_item = {"descripcion": (message.text or "").strip()}
            bot.send_message(message.chat.id, "📋 <b>Presentación</b> (Ej: Caja, Bidón 18L):")
            bot.register_next_step_handler(message, _desp_item_pres, bot, vendedor_id, dispatch_data, current_item)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_item_pres(message, bot, vendedor_id, dispatch_data, current_item):
        try:
            current_item["presentacion"] = (message.text or "").strip()
            bot.send_message(message.chat.id, "🔢 <b>Cantidad</b> de unidades:")
            bot.register_next_step_handler(message, _desp_item_qty, bot, vendedor_id, dispatch_data, current_item)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_item_qty(message, bot, vendedor_id, dispatch_data, current_item):
        try:
            current_item["cantidad"] = int(message.text.strip())
            bot.send_message(message.chat.id, "⚖️ <b>Peso por unidad</b> en kg (Ej: 15):")
            bot.register_next_step_handler(message, _desp_item_weight, bot, vendedor_id, dispatch_data, current_item)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Número inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_item_weight(message, bot, vendedor_id, dispatch_data, current_item):
        try:
            current_item["peso_ud"] = float(message.text.strip().replace(",", "."))
            current_item["peso_total"] = current_item["cantidad"] * current_item["peso_ud"]
            dispatch_data["items"].append(current_item)

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("➕ Agregar otro producto", "✅ Continuar con transporte")

            items_list = ""
            for i, item in enumerate(dispatch_data["items"], 1):
                items_list += f"  {i}. {item['descripcion']} | {item['presentacion']} | {item['cantidad']} uds | {item['peso_total']:.0f} kg\n"

            bot.send_message(
                message.chat.id,
                f"✅ Agregado.\n\n📦 <b>Mercancía:</b>\n{items_list}\n¿Agregar otro o continuar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _desp_more, bot, vendedor_id, dispatch_data)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Peso inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_more(message, bot, vendedor_id, dispatch_data):
        try:
            if "Agregar" in (message.text or ""):
                bot.send_message(message.chat.id, "📦 Escribe la <b>descripción del siguiente producto</b>:", reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _desp_item_desc, bot, vendedor_id, dispatch_data)
            else:
                bot.send_message(message.chat.id, "🚛 <b>TRANSPORTE</b>\n\n1️⃣ <b>Empresa Transportadora</b>:", reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _desp_transport, bot, vendedor_id, dispatch_data, "empresa")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    TRANSPORT_STEPS = [
        ("empresa", "2️⃣ <b>Nombre del Conductor</b>:", "conductor"),
        ("conductor", "3️⃣ <b>Cédula del Conductor</b>:", "cc"),
        ("cc", "4️⃣ <b>Placa del Vehículo</b>:", "placa"),
    ]

    def _desp_transport(message, bot, vendedor_id, dispatch_data, field):
        try:
            dispatch_data[field] = (message.text or "").strip()

            for step_field, prompt, next_field in TRANSPORT_STEPS:
                if step_field == field:
                    bot.send_message(message.chat.id, prompt)
                    bot.register_next_step_handler(message, _desp_transport, bot, vendedor_id, dispatch_data, next_field)
                    return

            if field == "placa":
                markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
                markup.add("Furgón", "Turbo", "Camión", "Camioneta")
                bot.send_message(message.chat.id, "5️⃣ <b>Tipo de Vehículo</b>:", reply_markup=markup)
                bot.register_next_step_handler(message, _desp_vehicle_type, bot, vendedor_id, dispatch_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_vehicle_type(message, bot, vendedor_id, dispatch_data):
        try:
            dispatch_data["tipo_vehiculo"] = (message.text or "").strip()
            bot.send_message(message.chat.id, "6️⃣ <b>Teléfono del Conductor</b>:", reply_markup=types.ReplyKeyboardRemove())
            bot.register_next_step_handler(message, _desp_phone, bot, vendedor_id, dispatch_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _desp_phone(message, bot, vendedor_id, dispatch_data):
        try:
            dispatch_data["telefono_conductor"] = (message.text or "").strip()
            _generate_dispatch_pdf(bot, message, dispatch_data)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /precios — View & manage catalog prices
    # =====================================================================

    @bot.message_handler(commands=["precios"])
    @requiere_suscripcion(bot)
    def cmd_prices(message):
        try:
            vendedor_id = get_vendedor_id(message)
            nombre_negocio = message.vendedor["nombre_negocio"]
            products = get_products(vendedor_id)

            has_prices = products and any(p["precio_venta"] > 0 for p in products)

            if has_prices:
                response = f"💰 <b>LISTA DE PRECIOS — {nombre_negocio}</b>\n"
                response += "━" * 30 + "\n\n"
                for p in products:
                    if p["precio_venta"] > 0:
                        margin = ((p["precio_venta"] - p["precio_compra"]) / p["precio_venta"] * 100) if p["precio_venta"] > 0 else 0
                        response += f"📦 <b>{p['nombre']}</b>\n"
                        response += f"   💲 Costo: {format_cop(p['precio_compra'])} | Venta: <b>{format_cop(p['precio_venta'])}</b> | Margen: {margin:.0f}%\n\n"
            else:
                response = "⚠️ No tienes precios configurados.\nUsa /configurar para crear tu catálogo.\n"

            markup = types.InlineKeyboardMarkup(row_width=1)
            for p in products:
                label = f"✏️ {p['nombre']}"
                if p["precio_venta"] > 0:
                    label += f" ({format_cop(p['precio_venta'])})"
                markup.add(types.InlineKeyboardButton(label, callback_data=f"price_edit:{p['id']}"))

            markup.row(
                types.InlineKeyboardButton("📄 Generar PDF", callback_data="price_pdf"),
                types.InlineKeyboardButton("📲 Cotizar", callback_data="cmd_cotizar"),
            )

            bot.send_message(message.chat.id, response, reply_markup=markup)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # ── Price inline callbacks ──

    @bot.callback_query_handler(func=lambda call: call.data.startswith("price_edit:"))
    @requiere_suscripcion_callback(bot)
    def handle_price_edit(call):
        try:
            bot.answer_callback_query(call.id)
            vendedor_id = call.from_user.id
            product_id = int(call.data.replace("price_edit:", ""))
            product = get_product(product_id, vendedor_id)

            if not product:
                bot.send_message(call.message.chat.id, "❌ Producto no encontrado.")
                return

            msg = f"✏️ <b>ACTUALIZAR: {product['nombre']}</b>\n\n"
            if product["precio_venta"] > 0:
                msg += f"💲 Costo actual: {format_cop(product['precio_compra'])}\n"
                msg += f"💰 Venta actual: {format_cop(product['precio_venta'])}\n\n"
            msg += "Escribe el <b>nuevo costo de compra</b>:"

            bot.send_message(call.message.chat.id, msg)
            bot.register_next_step_handler(call.message, _step_price_cost, bot, vendedor_id, product_id, product["nombre"])
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    def _step_price_cost(message, bot, vendedor_id, product_id, product_name):
        try:
            raw = (message.text or "").strip().replace("$", "").replace(".", "").replace(",", ".")
            cost = float(raw)
            if cost <= 0:
                bot.send_message(message.chat.id, "❌ Debe ser mayor a $0.")
                return
            bot.send_message(message.chat.id, f"💲 Costo: <b>{format_cop(cost)}</b> ✅\n\nEscribe el <b>precio de venta</b>:")
            bot.register_next_step_handler(message, _step_price_sale, bot, vendedor_id, product_id, product_name, cost)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Valor inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_price_sale(message, bot, vendedor_id, product_id, product_name, cost):
        try:
            raw = (message.text or "").strip().replace("$", "").replace(".", "").replace(",", ".")
            price = float(raw)
            if price <= 0:
                bot.send_message(message.chat.id, "❌ Debe ser mayor a $0.")
                return

            update_product(product_id, vendedor_id, precio_compra=cost, precio_venta=price)
            margin = ((price - cost) / price * 100) if price > 0 else 0

            bot.send_message(
                message.chat.id,
                f"✅ <b>Precio actualizado</b>\n\n"
                f"📦 {product_name}\n"
                f"💲 Costo: {format_cop(cost)}\n"
                f"💰 Venta: <b>{format_cop(price)}</b>\n"
                f"📈 Margen: {margin:.0f}%",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ Valor inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "price_pdf")
    @requiere_suscripcion_callback(bot)
    def handle_price_pdf(call):
        try:
            bot.answer_callback_query(call.id, "📄 Generando PDF...")
            vendedor_id = call.from_user.id
            nombre = call.vendedor["nombre_negocio"]
            products = get_products(vendedor_id)
            priced = [p for p in products if p["precio_venta"] > 0]

            if not priced:
                bot.send_message(call.message.chat.id, "⚠️ No hay precios configurados.")
                return

            _generate_price_pdf(bot, call.message, priced, nombre)
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /cotizar — WhatsApp quote links
    # =====================================================================

    @bot.message_handler(commands=["cotizar"])
    @requiere_suscripcion(bot)
    def cmd_quote(message):
        try:
            vendedor_id = get_vendedor_id(message)
            products = get_products(vendedor_id)
            priced = [p for p in products if p["precio_venta"] > 0]

            if not priced:
                bot.send_message(message.chat.id, "⚠️ Configura precios primero con /precios")
                return

            markup = types.InlineKeyboardMarkup(row_width=1)
            markup.add(
                types.InlineKeyboardButton("📅 Clientes de HOY", callback_data="quote_today"),
                types.InlineKeyboardButton("👤 Un cliente (por ID)", callback_data="quote_single"),
                types.InlineKeyboardButton("👥 Todos los prospectos", callback_data="quote_prospects"),
            )
            bot.send_message(
                message.chat.id,
                "📲 <b>ENVIAR COTIZACIÓN POR WHATSAPP</b>\n\n¿A quién?",
                reply_markup=markup,
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "cmd_cotizar")
    @requiere_suscripcion_callback(bot)
    def handle_cmd_cotizar_cb(call):
        try:
            bot.answer_callback_query(call.id)
            call.message.from_user = call.from_user
            call.message.vendedor = call.vendedor
            call.message.text = "/cotizar"
            bot.process_new_messages([call.message])
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data.startswith("quote_"))
    @requiere_suscripcion_callback(bot)
    def handle_quote_callback(call):
        try:
            bot.answer_callback_query(call.id)
            vendedor_id = call.from_user.id
            nombre = call.vendedor["nombre_negocio"]
            action = call.data.replace("quote_", "")

            products = get_products(vendedor_id)
            priced = [p for p in products if p["precio_venta"] > 0]

            if action == "today":
                today_str = date.today().isoformat()
                conn = get_connection(vendedor_id)
                try:
                    clients = conn.execute(
                        "SELECT id, nombre, telefono FROM clientes WHERE vendedor_id = %s AND fecha_registro = %s AND telefono IS NOT NULL",
                        (vendedor_id, today_str),
                    ).fetchall()
                finally:
                    conn.close()
                if not clients:
                    bot.send_message(call.message.chat.id, "📭 No hay clientes registrados hoy con teléfono.")
                    return
                _send_quote_links(bot, call.message, clients, priced, nombre, "registrados hoy")

            elif action == "single":
                bot.send_message(call.message.chat.id, "✍️ Escribe el <b>ID del cliente</b>:")
                bot.register_next_step_handler(call.message, _step_quote_single, bot, vendedor_id, priced, nombre)

            elif action == "prospects":
                clients = get_clients(vendedor_id, estado="Prospecto")
                clients_with_phone = [c for c in clients if c.get("telefono")]
                if not clients_with_phone:
                    bot.send_message(call.message.chat.id, "📭 No hay prospectos con teléfono.")
                    return
                _send_quote_links(bot, call.message, clients_with_phone, priced, nombre, "prospectos")
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    def _step_quote_single(message, bot, vendedor_id, priced, nombre):
        try:
            client_id = int(message.text.strip())
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, "❌ Cliente no encontrado.")
                return
            _send_quote_links(bot, message, [client], priced, nombre, f"cliente ID {client_id}")
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")


# =========================================================================
# PDF GENERATION HELPERS (module-level)
# =========================================================================

def _generate_dispatch_pdf(bot, message, dispatch_data):
    """Generate a generic dispatch PDF."""
    try:
        nombre = dispatch_data["nombre_negocio"]
        now = datetime.now()
        today_str = now.strftime("%d/%m/%Y")
        time_str = now.strftime("%H:%M")
        dispatch_id = now.strftime("%Y%m%d%H%M")

        grand_qty = sum(item["cantidad"] for item in dispatch_data["items"])
        grand_weight = sum(item["peso_total"] for item in dispatch_data["items"])

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=letter,
            leftMargin=15*mm, rightMargin=15*mm,
            topMargin=12*mm, bottomMargin=12*mm,
        )

        styles = getSampleStyleSheet()
        brand_color = colors.Color(0.15, 0.45, 0.15)
        brand_bg = colors.Color(0.85, 0.95, 0.85)
        brand_header = colors.Color(0.2, 0.5, 0.2)

        title_style = ParagraphStyle("DTitle", parent=styles["Title"], fontSize=16, alignment=TA_CENTER, fontName="Helvetica-Bold")
        company_style = ParagraphStyle("DCompany", parent=styles["Normal"], fontSize=14, alignment=TA_CENTER, fontName="Helvetica-Bold")
        section_style = ParagraphStyle("DSection", parent=styles["Normal"], fontSize=9, spaceBefore=4*mm, fontName="Helvetica-Bold", textColor=colors.white, backColor=brand_header, leftIndent=2*mm, borderPadding=2)

        full_width = letter[0] - 30 * mm
        half_width = full_width / 2

        green_grid = TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, brand_color),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3*mm),
            ("TOPPADDING", (0, 0), (-1, -1), 2*mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2*mm),
        ])

        elements = []
        elements.append(Paragraph(f"<b>{nombre}</b>", company_style))
        elements.append(Spacer(1, 4*mm))
        elements.append(Paragraph("<b>DESPACHO DE MERCANCÍA</b>", title_style))
        elements.append(Spacer(1, 3*mm))

        # Doc info
        t1 = Table([
            [f"No. Remisión: {dispatch_id}", f"Fecha: {today_str}"],
            ["Pedido No.: ___________", f"Hora: {time_str}"],
        ], colWidths=[half_width, half_width])
        t1.setStyle(green_grid)
        elements.append(t1)
        elements.append(Spacer(1, 2*mm))

        # Merchandise
        elements.append(Paragraph("  DETALLE DE MERCANCÍA", section_style))
        t4_header = ["Item", "Descripción", "Presentación", "Cantidad", "Peso kg"]
        t4_data = [t4_header]
        for idx, item in enumerate(dispatch_data["items"], 1):
            t4_data.append([str(idx), item["descripcion"], item["presentacion"], str(item["cantidad"]), str(item["peso_ud"])])
        while len(t4_data) < 6:
            t4_data.append(["", "", "", "", ""])

        col_widths = [full_width*0.08, full_width*0.36, full_width*0.20, full_width*0.18, full_width*0.18]
        t4 = Table(t4_data, colWidths=col_widths)
        t4.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, brand_color),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 0), (4, -1), "CENTER"),
            ("BACKGROUND", (0, 0), (-1, 0), brand_bg),
        ]))
        elements.append(t4)
        elements.append(Spacer(1, 3*mm))

        # Totals
        t_totals = Table([[f"TOTAL UNIDADES: {grand_qty}", f"TOTAL PESO: {grand_weight:.0f} kg"]], colWidths=[half_width, half_width])
        t_totals.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10)]))
        elements.append(t_totals)
        elements.append(Spacer(1, 4*mm))

        # Transport
        elements.append(Paragraph("  INFORMACIÓN DEL TRANSPORTE", section_style))
        t5 = Table([
            [f"Empresa: {dispatch_data.get('empresa', '')}", ""],
            [f"Conductor: {dispatch_data.get('conductor', '')}", f"CC: {dispatch_data.get('cc', '')}"],
            [f"Placa: {dispatch_data.get('placa', '')}", f"Tipo: {dispatch_data.get('tipo_vehiculo', '')}"],
            [f"Teléfono: {dispatch_data.get('telefono_conductor', '')}", ""],
        ], colWidths=[half_width, half_width])
        t5.setStyle(green_grid)
        elements.append(t5)

        doc.build(elements)
        buffer.seek(0)

        safe_name = nombre.replace(" ", "_")
        bot.send_document(
            message.chat.id, buffer,
            visible_file_name=f"Despacho_{safe_name}_{dispatch_id}.pdf",
            caption=f"📦 Despacho {nombre} — {grand_qty} uds / {grand_weight:.0f} kg",
        )
        bot.send_message(message.chat.id, "✅ Documento de despacho generado.")
    except Exception as e:
        bot.send_message(message.chat.id, f"⚠️ Error: {e}")


def _generate_price_pdf(bot, message, products, nombre_negocio):
    """Generate a branded PDF price list from the dynamic catalog."""
    try:
        today_str = datetime.now().strftime("%d/%m/%Y")
        safe_name = nombre_negocio.replace(" ", "_")

        buffer = io.BytesIO()
        page_w, page_h = 140 * mm, 200 * mm
        doc = SimpleDocTemplate(
            buffer, pagesize=(page_w, page_h),
            leftMargin=10*mm, rightMargin=10*mm,
            topMargin=10*mm, bottomMargin=10*mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("PT", parent=styles["Title"], fontSize=14, alignment=TA_CENTER, fontName="Helvetica-Bold")
        sub_style = ParagraphStyle("PS", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER, textColor=colors.gray)
        footer_style = ParagraphStyle("PF", parent=styles["Normal"], fontSize=7, alignment=TA_CENTER, textColor=colors.gray, fontName="Helvetica-Oblique")

        brand_blue = colors.Color(0.1, 0.3, 0.6)
        brand_bg = colors.Color(0.85, 0.9, 1.0)

        elements = []
        elements.append(Paragraph(f"<b>{nombre_negocio}</b>", title_style))
        elements.append(Spacer(1, 3*mm))
        elements.append(Paragraph("<b>LISTA DE PRECIOS</b>", ParagraphStyle("PLT", parent=styles["Title"], fontSize=16, alignment=TA_CENTER, textColor=brand_blue)))
        elements.append(Paragraph(f"Vigente: {today_str}", sub_style))
        elements.append(Spacer(1, 5*mm))

        table_data = [["Producto", "Presentación", "Precio Unitario"]]
        for p in products:
            table_data.append([p["nombre"], "Unidad", format_cop(p["precio_venta"])])

        full_width = page_w - 20*mm
        t = Table(table_data, colWidths=[full_width*0.45, full_width*0.25, full_width*0.30])
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, brand_blue),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("BACKGROUND", (0, 0), (-1, 0), brand_bg),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.95, 0.95, 0.95)]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 8*mm))
        elements.append(Paragraph("* Precios sujetos a cambio sin previo aviso", footer_style))

        doc.build(elements)
        buffer.seek(0)

        bot.send_document(
            message.chat.id, buffer,
            visible_file_name=f"Precios_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf",
            caption=f"📄 Lista de Precios — {nombre_negocio} — {today_str}",
        )
    except Exception as e:
        bot.send_message(message.chat.id, f"⚠️ Error: {e}")


def _send_quote_links(bot, message, clients, products, nombre_negocio, label):
    """Generate WhatsApp links with pre-built price quote message."""
    try:
        price_lines = []
        for p in products:
            price_lines.append(f"📦 {p['nombre']}: {format_cop(p['precio_venta'])}")
        price_text = "\n".join(price_lines)

        greeting = (
            f"Buenos día, le saluda {nombre_negocio}.\n\n"
            f"Le comparto nuestra lista de precios:\n\n"
            f"{price_text}\n\n"
            "¿Le interesa hacer un pedido? Estoy a su disposición. 👍"
        )
        encoded_greeting = urllib.parse.quote(greeting, safe="")

        response = f"📲 <b>COTIZACIONES — {label.upper()}</b>\n"
        response += "━" * 30 + "\n"
        response += f"👥 {len(clients)} cliente(s)\n\n"

        for c in clients:
            phone = sanitize_phone_co(c.get("telefono", ""))
            wa_url = f"https://wa.me/{phone}?text={encoded_greeting}"
            response += f"👤 <b>{c['nombre']}</b>\n"
            response += f"   📲 <a href='{wa_url}'>Enviar cotización</a>\n\n"

        response += "💡 <i>Cada link abre WhatsApp con la lista pre-escrita.</i>"
        bot.send_message(message.chat.id, response, reply_markup=types.ReplyKeyboardRemove(), disable_web_page_preview=True)
    except Exception as e:
        bot.send_message(message.chat.id, f"⚠️ Error: {e}")
