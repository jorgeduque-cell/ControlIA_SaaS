# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Sales & Orders Handler
Commands: /vender, /pedidos, /entregar, /cobrar, /pagar, /repetir

FEATURES V2:
  6. Smart Pricing   — Shows saved price from catalog with Use/Change buttons
  7. Multi-Product    — Cart system: add multiple products per order
  10. Quick Remision  — After creating order, button to generate PDF
  11. WhatsApp Share  — After remision, button to send via WhatsApp
"""
from telebot import types
from datetime import date
from urllib.parse import quote

from database import (
    get_connection, get_client, get_clients, get_products,
    get_product, add_order, get_orders, get_order,
    deliver_order, mark_order_paid, get_unpaid_orders,
    get_last_order, delete_order, update_product,
    safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop, safe_split, sanitize_phone_co
from config import logger


def register(bot):

    # =====================================================================
    # /vender — MULTI-PRODUCT CART with SMART PRICING
    # =====================================================================

    @bot.message_handler(commands=["vender"])
    @requiere_suscripcion(bot)
    def cmd_sell(message):
        vendedor_id = get_vendedor_id(message)
        products = get_products(vendedor_id)

        if not products:
            bot.send_message(
                message.chat.id,
                "⚠️ No tienes productos configurados.\n"
                "Usa /configurar para agregar tu catálogo primero.",
            )
            return

        bot.send_message(message.chat.id, "🛒 <b>Nueva Venta</b>\n\nEscribe el <b>ID del cliente</b>:")
        bot.register_next_step_handler(message, _sell_client_id, bot, vendedor_id)

    def _sell_client_id(message, bot, vendedor_id):
        try:
            client_id = int(message.text.strip())
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, "❌ Cliente no encontrado. Verifica el ID.")
                return

            # Initialize cart
            cart = {
                "cliente_id": client_id,
                "cliente_nombre": client["nombre"],
                "cliente_telefono": client.get("telefono", ""),
                "items": [],
            }
            _show_product_selector(message, bot, vendedor_id, cart)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido. Debe ser un número.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _show_product_selector(message, bot, vendedor_id, cart):
        """Show dynamic product keyboard from vendor's catalog."""
        products = get_products(vendedor_id)
        markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        for p in products:
            markup.add(f"{p['nombre']} ({format_cop(p['precio_venta'])})")

        items_text = ""
        if cart["items"]:
            items_text = "\n🛒 <b>Carrito actual:</b>\n"
            for item in cart["items"]:
                items_text += f"  • {item['cantidad']}x {item['producto']} — {format_cop(item['subtotal'])}\n"
            items_text += "\n"

        bot.send_message(
            message.chat.id,
            f"👤 Cliente: <b>{cart['cliente_nombre']}</b>\n"
            f"{items_text}"
            "📦 Selecciona el <b>producto</b>:",
            reply_markup=markup,
        )
        bot.register_next_step_handler(message, _sell_product, bot, vendedor_id, cart)

    def _sell_product(message, bot, vendedor_id, cart):
        try:
            text = (message.text or "").strip()
            # Extract product name (remove price in parentheses)
            product_name = text.split("(")[0].strip() if "(" in text else text

            # Find matching product in catalog
            products = get_products(vendedor_id)
            matched = None
            for p in products:
                if p["nombre"].lower() == product_name.lower():
                    matched = p
                    break

            if not matched:
                bot.send_message(message.chat.id, "❌ Producto no encontrado en tu catálogo.")
                _show_product_selector(message, bot, vendedor_id, cart)
                return

            cart["current_product"] = matched

            bot.send_message(
                message.chat.id,
                f"✅ Producto: <b>{matched['nombre']}</b>\n\n"
                "📦 Escribe la <b>cantidad</b> de unidades:",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _sell_quantity, bot, vendedor_id, cart)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _sell_quantity(message, bot, vendedor_id, cart):
        try:
            quantity = int(message.text.strip())
            if quantity <= 0:
                bot.send_message(message.chat.id, "❌ La cantidad debe ser mayor a 0.")
                return
            if quantity > 10000:
                bot.send_message(message.chat.id, "❌ Cantidad demasiado alta (máx 10,000).")
                return

            cart["current_quantity"] = quantity
            product = cart["current_product"]

            # ── FEATURE 6: SMART PRICING ──
            # Show saved price from catalog with Use/Change buttons
            saved_price = product["precio_venta"]

            if saved_price and saved_price > 0:
                markup = types.InlineKeyboardMarkup(row_width=2)
                markup.row(
                    types.InlineKeyboardButton(
                        f"✅ Usar {format_cop(saved_price)}",
                        callback_data=f"use_price:{saved_price}:{product['precio_compra']}",
                    ),
                    types.InlineKeyboardButton(
                        "💲 Otro precio",
                        callback_data="custom_price",
                    ),
                )
                bot.send_message(
                    message.chat.id,
                    f"💰 <b>Precio de {product['nombre']}</b>\n\n"
                    f"📋 Precio guardado: <b>{format_cop(saved_price)}</b>\n"
                    f"💵 Costo: {format_cop(product['precio_compra'])}\n"
                    f"📈 Margen: {format_cop(saved_price - product['precio_compra'])}\n\n"
                    "¿Usar este precio o ingresar otro?",
                    reply_markup=markup,
                )
                # Store cart in a temp dict keyed by chat_id for callback access
                if not hasattr(bot, "_carts"):
                    bot._carts = {}
                bot._carts[message.chat.id] = cart
            else:
                # No saved price → ask manually
                bot.send_message(
                    message.chat.id,
                    "💲 Escribe el <b>costo de compra unitario</b> (tu costo):",
                )
                bot.register_next_step_handler(message, _sell_cost_manual, bot, vendedor_id, cart)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Cantidad inválida. Debe ser un número entero.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # ── SMART PRICING: Use saved price ──
    @bot.callback_query_handler(func=lambda call: call.data.startswith("use_price:"))
    @requiere_suscripcion_callback(bot)
    def handle_use_price(call):
        try:
            bot.answer_callback_query(call.id)
            parts = call.data.split(":")
            precio_venta = float(parts[1])
            precio_compra = float(parts[2])
            chat_id = call.message.chat.id

            cart = getattr(bot, "_carts", {}).get(chat_id)
            if not cart:
                bot.send_message(chat_id, "⚠️ Carrito no encontrado. Inicia de nuevo con /vender")
                return

            _add_item_to_cart(call.message, bot, call.from_user.id, cart, precio_compra, precio_venta)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    # ── SMART PRICING: Custom price ──
    @bot.callback_query_handler(func=lambda call: call.data == "custom_price")
    @requiere_suscripcion_callback(bot)
    def handle_custom_price(call):
        try:
            bot.answer_callback_query(call.id)
            chat_id = call.message.chat.id
            cart = getattr(bot, "_carts", {}).get(chat_id)
            if not cart:
                bot.send_message(chat_id, "⚠️ Carrito no encontrado. Inicia de nuevo con /vender")
                return

            vendedor_id = call.from_user.id
            bot.send_message(chat_id, "💲 Escribe el <b>costo de compra unitario</b> (tu costo):")
            bot.register_next_step_handler(call.message, _sell_cost_manual, bot, vendedor_id, cart)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    def _sell_cost_manual(message, bot, vendedor_id, cart):
        try:
            cost = float((message.text or "0").replace(".", "").replace(",", ".").replace("$", "").strip())
            if cost <= 0:
                bot.send_message(message.chat.id, "❌ El costo debe ser mayor a $0.")
                return
            cart["manual_cost"] = cost
            bot.send_message(message.chat.id, "💰 Escribe el <b>precio de venta unitario</b>:")
            bot.register_next_step_handler(message, _sell_price_manual, bot, vendedor_id, cart)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Valor inválido. Ingresa un número.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _sell_price_manual(message, bot, vendedor_id, cart):
        try:
            price = float((message.text or "0").replace(".", "").replace(",", ".").replace("$", "").strip())
            if price <= 0:
                bot.send_message(message.chat.id, "❌ El precio debe ser mayor a $0.")
                return

            cost = cart.pop("manual_cost", 0)
            product = cart["current_product"]

            # Auto-update catalog price if changed
            if price != product["precio_venta"] or cost != product["precio_compra"]:
                update_product(product["id"], vendedor_id, precio_compra=cost, precio_venta=price)
                logger.info(
                    "Auto-updated product %s prices: compra=%s, venta=%s",
                    product["nombre"], cost, price,
                )

            _add_item_to_cart(message, bot, vendedor_id, cart, cost, price)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Valor inválido. Ingresa un número.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # FEATURE 7: MULTI-PRODUCT CART
    # =====================================================================

    def _add_item_to_cart(message, bot, vendedor_id, cart, precio_compra, precio_venta):
        """Add current product to cart and ask: add more or finalize?"""
        product = cart["current_product"]
        quantity = cart["current_quantity"]
        subtotal = quantity * precio_venta

        cart["items"].append({
            "producto": product["nombre"],
            "cantidad": quantity,
            "precio_compra": precio_compra,
            "precio_venta": precio_venta,
            "subtotal": subtotal,
        })

        # Clear temp
        cart.pop("current_product", None)
        cart.pop("current_quantity", None)

        # Show cart summary
        cart_text = "🛒 <b>CARRITO:</b>\n"
        grand_total = 0
        for i, item in enumerate(cart["items"], 1):
            cart_text += f"  {i}. {item['cantidad']}x {item['producto']} — {format_cop(item['subtotal'])}\n"
            grand_total += item["subtotal"]
        cart_text += f"\n💵 <b>Total: {format_cop(grand_total)}</b>"

        markup = types.InlineKeyboardMarkup(row_width=2)
        markup.row(
            types.InlineKeyboardButton("➕ Agregar otro producto", callback_data="cart_add_more"),
            types.InlineKeyboardButton("✅ Finalizar pedido", callback_data="cart_finalize"),
        )

        bot.send_message(message.chat.id, cart_text, reply_markup=markup)

        # Store cart for callback access
        if not hasattr(bot, "_carts"):
            bot._carts = {}
        bot._carts[message.chat.id] = cart

    @bot.callback_query_handler(func=lambda call: call.data == "cart_add_more")
    @requiere_suscripcion_callback(bot)
    def handle_cart_add_more(call):
        """Add another product to the cart."""
        try:
            bot.answer_callback_query(call.id)
            chat_id = call.message.chat.id
            vendedor_id = call.from_user.id
            cart = getattr(bot, "_carts", {}).get(chat_id)
            if not cart:
                bot.send_message(chat_id, "⚠️ Carrito no encontrado. Usa /vender para iniciar.")
                return
            _show_product_selector(call.message, bot, vendedor_id, cart)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data == "cart_finalize")
    @requiere_suscripcion_callback(bot)
    def handle_cart_finalize(call):
        """Finalize the cart: create one order per item."""
        try:
            bot.answer_callback_query(call.id)
            chat_id = call.message.chat.id
            vendedor_id = call.from_user.id
            cart = getattr(bot, "_carts", {}).pop(chat_id, None)
            if not cart or not cart["items"]:
                bot.send_message(chat_id, "⚠️ Carrito vacío.")
                return

            order_ids = []
            grand_total = 0

            for item in cart["items"]:
                order_id = add_order(
                    vendedor_id,
                    cart["cliente_id"],
                    item["producto"],
                    item["cantidad"],
                    item["precio_compra"],
                    item["precio_venta"],
                )
                order_ids.append(order_id)
                grand_total += item["subtotal"]

            # Build confirmation
            response = f"✅ <b>Pedido(s) Creado(s)</b>\n\n"
            response += f"👤 Cliente: <b>{cart['cliente_nombre']}</b>\n"
            response += "━" * 25 + "\n"
            for i, item in enumerate(cart["items"]):
                response += (
                    f"📦 <b>#{order_ids[i]}</b> — {item['cantidad']}x {item['producto']}\n"
                    f"    💲 Costo: {format_cop(item['precio_compra'])} c/u\n"
                    f"    💰 Venta: {format_cop(item['precio_venta'])} c/u\n"
                    f"    💵 Subtotal: {format_cop(item['subtotal'])}\n\n"
                )
            response += f"━" * 25 + "\n"
            response += f"💵 <b>TOTAL: {format_cop(grand_total)}</b>\n"
            response += "📌 Estado: Pendiente"

            # ── FEATURE 10: QUICK REMISION BUTTONS ──
            markup = types.InlineKeyboardMarkup(row_width=1)
            for oid in order_ids:
                markup.add(
                    types.InlineKeyboardButton(
                        f"📄 Remisión Pedido #{oid}",
                        callback_data=f"quick_remision:{oid}",
                    )
                )

            bot.send_message(chat_id, response, reply_markup=markup)
            logger.info(
                "Orders created for vendor %s: %s (total: %s)",
                vendedor_id, order_ids, format_cop(grand_total),
            )
        except Exception as e:
            logger.error("Cart finalize error: %s", e)
            bot.send_message(call.message.chat.id, f"⚠️ Error al crear pedidos: {e}")

    # =====================================================================
    # FEATURE 10: QUICK REMISION (delegates to documents handler)
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("quick_remision:"))
    @requiere_suscripcion_callback(bot)
    def handle_quick_remision(call):
        """Generate remision PDF directly from the order confirmation."""
        try:
            bot.answer_callback_query(call.id, "📄 Generando remisión...")
            order_id = call.data.replace("quick_remision:", "")
            # Route to the /remision handler
            call.message.from_user = call.from_user
            call.message.text = f"/remision {order_id}"
            call.message.vendedor = call.vendedor
            bot.process_new_messages([call.message])
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    # =====================================================================
    # FEATURE 11: WHATSAPP SHARE (after remision — callback)
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("wa_share:"))
    @requiere_suscripcion_callback(bot)
    def handle_wa_share(call):
        """Open WhatsApp with pre-written message for the order."""
        try:
            bot.answer_callback_query(call.id)
            order_id = int(call.data.replace("wa_share:", ""))
            vendedor_id = call.from_user.id
            order = get_order(order_id, vendedor_id)

            if not order:
                bot.send_message(call.message.chat.id, "❌ Pedido no encontrado.")
                return

            phone = sanitize_phone_co(order.get("cliente_tel", ""))
            total = order["cantidad"] * order["precio_venta"]
            nombre_negocio = call.vendedor["nombre_negocio"]

            wa_msg = (
                f"Hola {order['cliente_nombre']}, te envío la remisión del pedido #{order_id}.\n\n"
                f"📦 {order['cantidad']}x {order['producto']}\n"
                f"💰 Total: {format_cop(total)}\n\n"
                f"Gracias por tu compra.\n"
                f"— {nombre_negocio}"
            )
            wa_url = f"https://wa.me/{phone}?text={quote(wa_msg)}"

            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("📲 Abrir WhatsApp", url=wa_url))

            bot.send_message(
                call.message.chat.id,
                f"📲 <b>Enviar por WhatsApp</b>\n\n"
                f"👤 {order['cliente_nombre']}\n"
                f"📱 {phone}\n\n"
                "Toca el botón para abrir WhatsApp con el mensaje listo:",
                reply_markup=markup,
            )
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /pedidos — View orders (tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["pedidos"])
    @requiere_suscripcion(bot)
    def cmd_orders(message):
        try:
            markup = types.InlineKeyboardMarkup(row_width=3)
            markup.row(
                types.InlineKeyboardButton("⏳ Pendientes", callback_data="orders_filter:Pendiente"),
                types.InlineKeyboardButton("✅ Entregados", callback_data="orders_filter:Entregado"),
                types.InlineKeyboardButton("📋 Todos", callback_data="orders_filter:Todos"),
            )
            bot.send_message(message.chat.id, "📦 <b>PEDIDOS</b>\n\n¿Qué filtro aplicar?", reply_markup=markup)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    @bot.callback_query_handler(func=lambda call: call.data.startswith("orders_filter:"))
    @requiere_suscripcion_callback(bot)
    def handle_orders_filter(call):
        try:
            bot.answer_callback_query(call.id)
            filter_type = call.data.replace("orders_filter:", "")
            vendedor_id = call.from_user.id

            if filter_type == "Todos":
                orders = get_orders(vendedor_id)
                label = "TODOS"
            else:
                orders = get_orders(vendedor_id, estado=filter_type)
                label = filter_type.upper() + "S"

            if not orders:
                bot.send_message(call.message.chat.id, f"📭 No hay pedidos ({label}).")
                return

            response = f"📦 <b>PEDIDOS — {label}</b> ({len(orders)}):\n\n"
            markup = types.InlineKeyboardMarkup(row_width=2)

            for o in orders:
                total = o["cantidad"] * o["precio_venta"]
                state_icon = "⏳" if o["estado"] == "Pendiente" else "✅" if o["estado"] == "Entregado" else "🚫"
                pay_icon = ""
                if o["estado"] == "Entregado":
                    pay_icon = " 🟢" if o.get("estado_pago") == "Pagado" else " 🔴"

                response += f"{state_icon} <b>#{o['id']}</b> — {o['cliente_nombre']}\n"
                response += f"   📦 {o['cantidad']}x {o['producto']}\n"
                response += f"   💰 {format_cop(total)} | {o['estado']}{pay_icon}\n\n"

                if o["estado"] == "Pendiente":
                    markup.add(
                        types.InlineKeyboardButton(f"✅ Entregar #{o['id']}", callback_data=f"deliver:{o['id']}")
                    )

            if len(response) > 4000:
                for part in safe_split(response):
                    bot.send_message(call.message.chat.id, part)
                bot.send_message(call.message.chat.id, "👇 Acciones:", reply_markup=markup)
            else:
                bot.send_message(call.message.chat.id, response, reply_markup=markup)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /entregar — Mark order as delivered (tenant-isolated)
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("deliver:"))
    @requiere_suscripcion_callback(bot)
    def handle_deliver_callback(call):
        try:
            bot.answer_callback_query(call.id)
            order_id = call.data.replace("deliver:", "")
            call.message.from_user = call.from_user
            call.message.text = f"/entregar {order_id}"
            call.message.vendedor = call.vendedor
            bot.process_new_messages([call.message])
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    @bot.message_handler(commands=["entregar"])
    @requiere_suscripcion(bot)
    def cmd_deliver(message):
        try:
            parts = message.text.strip().split()
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /entregar [ID_Pedido]")
                return

            order_id = int(parts[1])
            vendedor_id = get_vendedor_id(message)

            try:
                income = deliver_order(order_id, vendedor_id)
            except ValueError as ve:
                bot.send_message(message.chat.id, f"ℹ️ {ve}")
                return

            order = get_order(order_id, vendedor_id)

            # ── FEATURE 11: WhatsApp share button after delivery ──
            markup = types.InlineKeyboardMarkup()
            markup.add(
                types.InlineKeyboardButton(
                    f"📲 Avisar por WhatsApp",
                    callback_data=f"wa_share:{order_id}",
                )
            )

            bot.send_message(
                message.chat.id,
                f"✅ <b>Pedido #{order_id} ENTREGADO</b>\n\n"
                f"📦 {order['producto']} x{order['cantidad']}\n"
                f"💰 Ingreso registrado: <b>{format_cop(income)}</b>",
                reply_markup=markup,
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido. Uso: /entregar [ID_Pedido]")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /cobrar — Pending payments with WhatsApp links (tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["cobrar"])
    @requiere_suscripcion(bot)
    def cmd_collect(message):
        try:
            vendedor_id = get_vendedor_id(message)
            unpaid = get_unpaid_orders(vendedor_id)

            if not unpaid:
                bot.send_message(message.chat.id, "✅ ¡No hay cobros pendientes! Todos tus clientes están al día.")
                return

            total_pending = sum(row["total"] for row in unpaid)
            nombre_negocio = message.vendedor["nombre_negocio"]

            response = f"💳 <b>COBROS PENDIENTES</b>\n"
            response += "━" * 30 + "\n"
            response += f"💰 Total por cobrar: <b>{format_cop(total_pending)}</b>\n"
            response += f"📦 Pedidos sin pagar: <b>{len(unpaid)}</b>\n\n"

            markup = types.InlineKeyboardMarkup(row_width=2)

            for row in unpaid:
                phone = sanitize_phone_co(row.get("telefono", ""))
                row_fecha = safe_parse_date(row.get("fecha"))
                days_ago = (date.today() - row_fecha).days if row_fecha else 0
                urgency = "🔴" if days_ago > 7 else ("🟡" if days_ago > 3 else "🟢")

                wa_msg = (
                    f"Buenos días {row['nombre']}, le recuerdo que tiene pendiente el pedido "
                    f"#{row['id']} por {format_cop(row['total'])} "
                    f"({row['cantidad']}x {row['producto']}). "
                    f"¿Cuándo podemos coordinar el pago? — {nombre_negocio}"
                )
                wa_url = f"https://wa.me/{phone}?text={quote(wa_msg)}"

                fecha_str = row_fecha.isoformat() if row_fecha else "N/A"
                response += f"{urgency} <b>#{row['id']}</b> — {row['nombre']}\n"
                response += f"   📦 {row['cantidad']}x {row['producto']} | {format_cop(row['total'])}\n"
                response += f"   📅 {fecha_str} ({days_ago} días)\n\n"

                markup.row(
                    types.InlineKeyboardButton(f"📲 Cobrar #{row['id']}", url=wa_url),
                    types.InlineKeyboardButton(f"✅ Pagado #{row['id']}", callback_data=f"pay:{row['id']}"),
                )

            bot.send_message(message.chat.id, response, reply_markup=markup, disable_web_page_preview=True)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /pagar — Mark order as paid (tenant-isolated)
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("pay:"))
    @requiere_suscripcion_callback(bot)
    def handle_pay_callback(call):
        try:
            order_id = int(call.data.replace("pay:", ""))
            vendedor_id = call.from_user.id
            order = get_order(order_id, vendedor_id)

            if not order:
                bot.answer_callback_query(call.id, "❌ Pedido no encontrado.")
                return
            if order.get("estado_pago") == "Pagado":
                bot.answer_callback_query(call.id, "ℹ️ Ya está pagado.")
                return

            mark_order_paid(order_id, vendedor_id)
            total = order["cantidad"] * order["precio_venta"]
            bot.answer_callback_query(call.id, f"✅ Pedido #{order_id} PAGADO")
            bot.send_message(
                call.message.chat.id,
                f"✅ <b>Pago registrado</b>\n\n"
                f"📦 Pedido #{order_id} — {order['cliente_nombre']}\n"
                f"💰 {format_cop(total)} — <b>PAGADO ✅</b>",
            )
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    @bot.message_handler(commands=["pagar"])
    @requiere_suscripcion(bot)
    def cmd_pay(message):
        try:
            parts = message.text.strip().split()
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /pagar [ID_Pedido]")
                return

            order_id = int(parts[1])
            vendedor_id = get_vendedor_id(message)
            order = get_order(order_id, vendedor_id)

            if not order:
                bot.send_message(message.chat.id, "❌ Pedido no encontrado.")
                return
            if order.get("estado_pago") == "Pagado":
                bot.send_message(message.chat.id, "ℹ️ Este pedido ya está marcado como pagado.")
                return

            mark_order_paid(order_id, vendedor_id)
            total = order["cantidad"] * order["precio_venta"]
            bot.send_message(
                message.chat.id,
                f"✅ <b>Pago registrado</b>\n\n"
                f"📦 Pedido #{order_id} — {order['cliente_nombre']}\n"
                f"💰 {format_cop(total)} — <b>PAGADO ✅</b>",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /repetir — Repeat last order for a client (tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["repetir"])
    @requiere_suscripcion(bot)
    def cmd_repeat(message):
        try:
            parts = message.text.strip().split()
            if len(parts) < 2:
                bot.send_message(message.chat.id, "❌ Uso: /repetir [ID_Cliente]")
                return

            vendedor_id = get_vendedor_id(message)
            client_id = int(parts[1])
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, "❌ Cliente no encontrado.")
                return

            last = get_last_order(client_id, vendedor_id)
            if not last:
                bot.send_message(message.chat.id, f"❌ {client['nombre']} no tiene pedidos anteriores.")
                return

            total = last["cantidad"] * last["precio_venta"]

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("✅ Sí, repetir pedido", "❌ No, cancelar")

            bot.send_message(
                message.chat.id,
                f"🔄 <b>REPETIR ÚLTIMO PEDIDO</b>\n\n"
                f"👤 Cliente: <b>{client['nombre']}</b>\n"
                f"📦 {last['cantidad']}x {last['producto']}\n"
                f"💲 Costo: {format_cop(last['precio_compra'])} c/u\n"
                f"💰 Venta: {format_cop(last['precio_venta'])} c/u\n"
                f"💵 Total: <b>{format_cop(total)}</b>\n\n"
                "¿Confirmar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _repeat_confirm, bot, vendedor_id, client_id, client["nombre"], last)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _repeat_confirm(message, bot, vendedor_id, client_id, client_name, last_order):
        try:
            if "Sí" not in (message.text or ""):
                bot.send_message(message.chat.id, "❌ Cancelado.", reply_markup=types.ReplyKeyboardRemove())
                return

            order_id = add_order(
                vendedor_id, client_id,
                last_order["producto"], last_order["cantidad"],
                last_order["precio_compra"], last_order["precio_venta"],
            )

            total = last_order["cantidad"] * last_order["precio_venta"]

            markup = types.InlineKeyboardMarkup()
            markup.add(
                types.InlineKeyboardButton(f"📄 Remisión #{order_id}", callback_data=f"quick_remision:{order_id}")
            )

            bot.send_message(
                message.chat.id,
                f"✅ <b>Pedido #{order_id} creado (recompra)</b>\n\n"
                f"👤 {client_name}\n"
                f"📦 {last_order['cantidad']}x {last_order['producto']}\n"
                f"💵 Total: <b>{format_cop(total)}</b>",
                reply_markup=markup,
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}", reply_markup=types.ReplyKeyboardRemove())
