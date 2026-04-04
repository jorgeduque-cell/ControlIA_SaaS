# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Onboarding & Dashboard Handler
Commands: /start, /configurar, /cancelar, /mi_cuenta

DUAL MODE:
  - Primary: Telegram Mini App (WebApp button)
  - Fallback: Text-based dashboard (if WebApp unavailable)
  - web_app_data handler: receives commands from Mini App
"""
import json
from telebot import types
from datetime import date

from database import (
    get_vendedor, register_vendedor, get_dashboard_stats,
    get_products, add_product, safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop
from config import TRIAL_DAYS, SUBSCRIPTION_PRICE_COP, WEBAPP_URL, logger


# =========================================================================
# MODULE DEFINITIONS (for text-based fallback drill-down)
# =========================================================================

MODULES = {
    "crm": {
        "icon": "👥",
        "title": "CRM",
        "desc": "Gestión de clientes, notas y seguimiento",
        "commands": [
            ("👤 Nuevo Cliente", "cmd_nuevo_cliente"),
            ("👥 Ver Cartera", "cmd_clientes"),
            ("🔍 Buscar", "cmd_buscar"),
            ("📋 Ficha Cliente", "cmd_ficha"),
            ("📝 Nota de Visita", "cmd_nota"),
            ("📊 Pipeline", "cmd_seguimiento"),
            ("📡 Radar Comercial", "cmd_radar"),
            ("📅 Asignar Día", "cmd_asignar_dia"),
        ],
    },
    "ventas": {
        "icon": "🛒",
        "title": "VENTAS",
        "desc": "Pedidos, entregas y cobros",
        "commands": [
            ("🛒 Crear Pedido", "cmd_vender"),
            ("🔄 Repetir Pedido", "cmd_repetir"),
            ("📦 Ver Pedidos", "cmd_pedidos"),
            ("✅ Marcar Entregado", "cmd_entregar"),
            ("💳 Cobros Pendientes", "cmd_cobrar"),
            ("💵 Marcar Pagado", "cmd_pagar"),
        ],
    },
    "precios": {
        "icon": "💰",
        "title": "PRECIOS",
        "desc": "Lista de precios y cotizaciones",
        "commands": [
            ("💰 Ver Precios", "cmd_precios"),
            ("📲 Cotizar WhatsApp", "cmd_cotizar"),
        ],
    },
    "logistica": {
        "icon": "🚚",
        "title": "LOGÍSTICA",
        "desc": "Rutas, inventario y distribución",
        "commands": [
            ("📅 Ruta Semanal", "cmd_ruta_semanal"),
            ("🗺️ Prospección Pie", "cmd_ruta_pie"),
            ("🚚 Entregas Camión", "cmd_ruta_camion"),
            ("📦 Inventario", "cmd_inventario"),
        ],
    },
    "finanzas": {
        "icon": "💼",
        "title": "FINANZAS",
        "desc": "Caja, cartera, márgenes y metas",
        "commands": [
            ("💼 Estado de Caja", "cmd_caja"),
            ("💳 Cartera x Cobrar", "cmd_cuentas_por_cobrar"),
            ("📝 Registrar Gasto", "cmd_gasto"),
            ("📈 Margen Rentabilidad", "cmd_margen"),
            ("🎯 Meta Mensual", "cmd_meta"),
        ],
    },
    "documentos": {
        "icon": "📄",
        "title": "DOCUMENTOS",
        "desc": "Remisiones y despachos en PDF",
        "commands": [
            ("📄 Remisión PDF", "cmd_remision"),
            ("🚛 Despacho Formal", "cmd_despacho"),
        ],
    },
    "admin": {
        "icon": "⚙️",
        "title": "ADMINISTRACIÓN",
        "desc": "Edición, eliminación, catálogo y respaldos",
        "commands": [
            ("📦 Configurar Productos", "cmd_configurar"),
            ("✏️ Editar Registro", "cmd_editar"),
            ("🗑️ Eliminar Registro", "cmd_eliminar"),
            ("💾 Backup", "cmd_backup"),
        ],
    },
}


def _get_webapp_url():
    """Build the Mini App URL. Returns None if WEBAPP_URL is localhost (dev)."""
    if not WEBAPP_URL or 'localhost' in WEBAPP_URL:
        return None
    return f"{WEBAPP_URL}/app/"


def register(bot):

    # =====================================================================
    # /start — MAIN ENTRY (Mini App primary, text fallback)
    # =====================================================================

    @bot.message_handler(commands=["start"])
    def cmd_start(message):
        vendedor_id = get_vendedor_id(message)
        vendedor = get_vendedor(vendedor_id)
        webapp_url = _get_webapp_url()

        if webapp_url:
            # ── PRIMARY: Mini App WebApp Button ──
            markup = types.InlineKeyboardMarkup()
            markup.add(
                types.InlineKeyboardButton(
                    "📊 Abrir ControlIA",
                    web_app=types.WebAppInfo(url=webapp_url),
                )
            )

            if not vendedor:
                text = (
                    "👋 <b>¡Bienvenido a ControlIA!</b>\n\n"
                    "Tu asistente de ventas inteligente.\n"
                    f"🎁 <b>{TRIAL_DAYS} días de prueba gratis</b>\n\n"
                    "Toca el botón para comenzar ↓"
                )
            else:
                fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
                estado = vendedor["estado"]

                if estado == "Inactivo" or (fecha_venc and fecha_venc < date.today()):
                    text = (
                        f"🏢 <b>{vendedor['nombre_negocio']}</b>\n"
                        "🔴 Tu suscripción ha vencido.\n\n"
                        "Toca el botón para ver opciones de renovación ↓"
                    )
                else:
                    estado_emoji = "🟢" if estado == "Activo" else "🟡"
                    text = (
                        f"🏢 <b>{vendedor['nombre_negocio']}</b>\n"
                        f"{estado_emoji} {estado}\n\n"
                        "Toca el botón para abrir tu panel ↓"
                    )

            bot.send_message(message.chat.id, text, reply_markup=markup)
            return

        # ── FALLBACK: Text-based (when WebApp URL not available) ──
        if not vendedor:
            _start_registration(message, bot)
            return

        fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
        estado = vendedor["estado"]

        if estado == "Inactivo" or (fecha_venc and fecha_venc < date.today()):
            _show_expired_dashboard(message, bot, vendedor)
            return

        _show_main_dashboard(message, bot, vendedor)

    # =====================================================================
    # WEB APP DATA HANDLER — Receives commands from Mini App
    # =====================================================================

    @bot.message_handler(content_types=["web_app_data"])
    def handle_webapp_data(message):
        """Process data sent from the Mini App via sendData()."""
        try:
            data = json.loads(message.web_app_data.data)
            action = data.get("action")

            if action == "command":
                cmd = data.get("command", "")
                if cmd:
                    # Fake the message text so handlers pick it up
                    message.text = f"/{cmd}"
                    bot.process_new_messages([message])
                    logger.info(
                        "Mini App command dispatched — User: %s, Command: /%s",
                        message.from_user.id, cmd,
                    )
            else:
                logger.warning("Unknown webapp action: %s", action)

        except Exception as e:
            logger.error("WebApp data handler error: %s", e)
            bot.send_message(
                message.chat.id,
                "⚠️ Error al procesar la acción. Intenta de nuevo.",
            )

    # =====================================================================
    # REGISTRATION FLOW (Text-based fallback)
    # =====================================================================

    def _start_registration(message, bot):
        """Step 1: Welcome message + ask for business name."""
        chat_id = message.chat.id
        welcome = (
            "👋 <b>¡Bienvenido a ControlIA!</b>\n\n"
            "Soy tu asistente de ventas inteligente. Te ayudo a:\n"
            "  📋 Gestionar clientes y prospectos\n"
            "  🛒 Crear pedidos y controlar entregas\n"
            "  💰 Llevar tus finanzas al día\n"
            "  🗺️ Planificar rutas de venta\n"
            "  📄 Generar documentos PDF profesionales\n\n"
            f"🎁 Tienes <b>{TRIAL_DAYS} días de prueba gratis</b> para probarlo todo.\n\n"
            "Vamos a configurar tu cuenta en 2 pasos sencillos.\n\n"
            "📝 <b>Paso 1/2:</b> ¿Cómo se llama tu negocio?"
        )
        bot.send_message(chat_id, welcome)
        bot.register_next_step_handler(message, _step_business_name, bot)

    def _step_business_name(message, bot):
        """Step 2: Save business name, ask for phone."""
        nombre = (message.text or "").strip()
        if not nombre or nombre.startswith("/"):
            bot.send_message(message.chat.id, "⚠️ Escribe el nombre de tu negocio (no un comando).")
            bot.register_next_step_handler(message, _step_business_name, bot)
            return

        # Store temporarily
        message.nombre_negocio = nombre
        bot.send_message(
            message.chat.id,
            f"✅ Negocio: <b>{nombre}</b>\n\n"
            "📱 <b>Paso 2/2:</b> ¿Cuál es tu número de WhatsApp?\n"
            "<i>(Este número aparecerá en cotizaciones y documentos para tus clientes)</i>",
        )
        bot.register_next_step_handler(message, _step_phone, bot, nombre)

    def _step_phone(message, bot, nombre_negocio):
        """Step 3: Save phone, create vendor, show success."""
        telefono = (message.text or "").strip()
        if not telefono or telefono.startswith("/"):
            bot.send_message(message.chat.id, "⚠️ Escribe tu número de WhatsApp.")
            bot.register_next_step_handler(message, _step_phone, bot, nombre_negocio)
            return

        vendedor_id = get_vendedor_id(message)

        try:
            vendedor = register_vendedor(vendedor_id, nombre_negocio, telefono)
            fecha_venc = safe_parse_date(vendedor["fecha_vencimiento"])
            fecha_str = fecha_venc.strftime("%d/%m/%Y") if fecha_venc else "N/A"

            success = (
                "🎉 <b>¡Cuenta creada exitosamente!</b>\n\n"
                f"🏢 Negocio: <b>{vendedor['nombre_negocio']}</b>\n"
                f"📱 WhatsApp: <b>{vendedor['telefono_soporte']}</b>\n"
                f"📅 Prueba gratis hasta: <b>{fecha_str}</b>\n"
                f"💰 Después: {format_cop(SUBSCRIPTION_PRICE_COP)}/mes\n\n"
                "━" * 25 + "\n\n"
                "📦 <b>Siguiente paso:</b> Configura tus productos con /configurar\n"
                "🏠 O accede al panel principal con /start"
            )
            bot.send_message(message.chat.id, success)
            logger.info(
                "New vendor registered — ID: %s, Business: %s",
                vendedor_id, nombre_negocio,
            )
        except Exception as e:
            logger.error("Registration failed for %s: %s", vendedor_id, e)
            bot.send_message(message.chat.id, f"⚠️ Error al registrar: {e}")

    # =====================================================================
    # DASHBOARD — DRILL-DOWN PATTERN (Text-based fallback)
    # =====================================================================

    def _build_main_dashboard_text(vendedor, stats):
        """Build the main dashboard text with stats."""
        nombre = vendedor["nombre_negocio"]
        estado = vendedor["estado"]
        fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
        fecha_str = fecha_venc.strftime("%d/%m/%Y") if fecha_venc else "N/A"
        estado_emoji = "🟢" if estado == "Activo" else "🟡" if estado == "Prueba" else "🔴"

        text = f"🏢 <b>{nombre}</b>\n"
        text += f"📅 {date.today().strftime('%d/%m/%Y')} — {estado_emoji} {estado} (hasta {fecha_str})\n"
        text += "━" * 30 + "\n\n"
        text += "📊 <b>PANEL RÁPIDO:</b>\n"
        text += f"  👥 Clientes: {stats['total_clients']} (✅ {stats['active_clients']} | ⏳ {stats['prospects']})\n"
        text += f"  📦 Pendientes: <b>{stats['pending_orders']}</b>\n"
        text += f"  💳 Sin pagar: <b>{stats['unpaid']}</b>\n"
        text += f"  💰 Ventas hoy: <b>{format_cop(stats['today_sales'])}</b>\n\n"
        text += "👇 <b>Selecciona un módulo:</b>"
        return text

    def _build_main_keyboard():
        """Build the main dashboard keyboard with module buttons (2-column grid)."""
        markup = types.InlineKeyboardMarkup(row_width=2)
        buttons = []
        for key, mod in MODULES.items():
            buttons.append(
                types.InlineKeyboardButton(
                    f"{mod['icon']} {mod['title']}",
                    callback_data=f"mod_{key}",
                )
            )
        # Add in pairs for 2-column layout
        for i in range(0, len(buttons), 2):
            pair = buttons[i:i+2]
            markup.row(*pair)
        return markup

    def _show_main_dashboard(message, bot, vendedor):
        """Show the main dashboard with module buttons (1 message)."""
        try:
            stats = get_dashboard_stats(vendedor["id"])
            text = _build_main_dashboard_text(vendedor, stats)
            markup = _build_main_keyboard()
            bot.send_message(message.chat.id, text, reply_markup=markup)
        except Exception as e:
            logger.error("Dashboard error for %s: %s", vendedor["id"], e)
            bot.send_message(message.chat.id, f"⚠️ Error al cargar el panel: {e}")

    def _show_expired_dashboard(message, bot, vendedor):
        """Show dashboard for expired vendors with renewal CTA."""
        nombre = vendedor["nombre_negocio"]
        fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
        fecha_str = fecha_venc.strftime("%d/%m/%Y") if fecha_venc else "N/A"

        text = (
            f"🏢 <b>{nombre}</b>\n"
            "━" * 30 + "\n\n"
            f"🔴 <b>Tu suscripción venció el {fecha_str}</b>\n\n"
            "Tus datos están seguros y no se perderán.\n"
            "Para volver a usar todos los módulos, renueva tu suscripción.\n\n"
            f"💰 Precio: <b>{format_cop(SUBSCRIPTION_PRICE_COP)}/mes</b>"
        )
        # TODO Sprint 4: Add Mercado Pago payment button
        markup = types.InlineKeyboardMarkup()
        markup.add(
            types.InlineKeyboardButton(
                f"💳 Renovar ({format_cop(SUBSCRIPTION_PRICE_COP)}/mes)",
                callback_data="pay_renew",
            )
        )
        bot.send_message(message.chat.id, text, reply_markup=markup)

    # =====================================================================
    # DRILL-DOWN: Module clicked → edit message with sub-commands
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("mod_"))
    @requiere_suscripcion_callback(bot)
    def handle_module_drill(call):
        """User clicked a module button → edit message to show sub-commands."""
        try:
            module_key = call.data.replace("mod_", "")
            mod = MODULES.get(module_key)
            if not mod:
                bot.answer_callback_query(call.id, "Módulo no encontrado")
                return

            bot.answer_callback_query(call.id)

            # Build sub-command keyboard (2-column grid)
            markup = types.InlineKeyboardMarkup(row_width=2)
            buttons = [types.InlineKeyboardButton(label, callback_data=cb_data) for label, cb_data in mod["commands"]]
            for i in range(0, len(buttons), 2):
                markup.row(*buttons[i:i+2])
            # Back button (full width)
            markup.row(
                types.InlineKeyboardButton("← Volver al Panel", callback_data="back_dashboard")
            )

            text = f"{mod['icon']} <b>MÓDULO {mod['title']}</b>\n"
            text += f"<i>{mod['desc']}</i>\n\n"
            text += "👇 Selecciona una acción:"

            bot.edit_message_text(
                text,
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                reply_markup=markup,
                parse_mode="HTML",
            )
        except Exception as e:
            logger.error("Drill-down error: %s", e)

    # =====================================================================
    # BACK TO DASHBOARD — Re-fetch stats and rebuild
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data == "back_dashboard")
    @requiere_suscripcion_callback(bot)
    def handle_back_dashboard(call):
        """Return to main dashboard with refreshed stats."""
        try:
            bot.answer_callback_query(call.id)
            vendedor = call.vendedor
            stats = get_dashboard_stats(vendedor["id"])
            text = _build_main_dashboard_text(vendedor, stats)
            markup = _build_main_keyboard()

            bot.edit_message_text(
                text,
                chat_id=call.message.chat.id,
                message_id=call.message.message_id,
                reply_markup=markup,
                parse_mode="HTML",
            )
        except Exception as e:
            logger.error("Back dashboard error: %s", e)

    # =====================================================================
    # INLINE BUTTON ROUTER — cmd_* buttons → dispatch to handlers
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("cmd_"))
    @requiere_suscripcion_callback(bot)
    def handle_command_buttons(call):
        """Route inline button presses to their corresponding command handlers."""
        try:
            bot.answer_callback_query(call.id)
            cmd = call.data.replace("cmd_", "")

            # Inject from_user and fake text so handlers work seamlessly
            call.message.from_user = call.from_user
            call.message.text = f"/{cmd}"
            # Inject vendor data so middleware doesn't re-query
            call.message.vendedor = call.vendedor
            bot.process_new_messages([call.message])
        except Exception as e:
            logger.error("Command router error: %s", e)
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    # =====================================================================
    # PAY BUTTON (placeholder until Sprint 4 — Mercado Pago)
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data == "pay_renew")
    def handle_pay_renew(call):
        """Placeholder for renewal payment — Sprint 4."""
        bot.answer_callback_query(
            call.id,
            "💳 La pasarela de pagos se habilitará pronto. Contacta al administrador.",
            show_alert=True,
        )

    # =====================================================================
    # /configurar — PRODUCT CATALOG WIZARD
    # =====================================================================

    @bot.message_handler(commands=["configurar"])
    @requiere_suscripcion(bot)
    def cmd_configurar(message):
        """Start the product catalog configuration wizard."""
        vendedor_id = get_vendedor_id(message)
        products = get_products(vendedor_id)

        if products:
            text = f"📦 <b>Tu catálogo actual ({len(products)} productos):</b>\n\n"
            for p in products:
                text += f"  • <b>{p['nombre']}</b> — Compra: {format_cop(p['precio_compra'])} | Venta: {format_cop(p['precio_venta'])} | Stock: {p['stock_actual']}\n"
            text += "\n¿Deseas agregar otro producto?"
        else:
            text = (
                "📦 <b>Configuración de Productos</b>\n\n"
                "Aún no tienes productos registrados.\n"
                "Vamos a agregar tu primer producto.\n\n"
            )

        markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
        markup.add("✅ Agregar Producto", "❌ Terminar")
        bot.send_message(message.chat.id, text, reply_markup=markup)
        bot.register_next_step_handler(message, _config_choice, bot)

    def _config_choice(message, bot):
        """Handle user's choice: add product or finish."""
        text = (message.text or "").strip()
        if "Agregar" in text or text.lower() in ("si", "sí", "s"):
            bot.send_message(
                message.chat.id,
                "📝 <b>Nombre del producto:</b>\n<i>(Ej: Caja x12 unidades, Bidón 20L, Paquete Premium)</i>",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _config_nombre, bot)
        else:
            products = get_products(get_vendedor_id(message))
            if products:
                bot.send_message(
                    message.chat.id,
                    f"✅ Catálogo listo con <b>{len(products)} producto(s)</b>.\n"
                    "Ya puedes usar /vender para crear pedidos.\n"
                    "Accede al panel principal con /start",
                    reply_markup=types.ReplyKeyboardRemove(),
                )
            else:
                bot.send_message(
                    message.chat.id,
                    "⚠️ No tienes productos registrados.\n"
                    "Necesitas al menos 1 producto para usar /vender.\n"
                    "Usa /configurar cuando quieras agregarlos.",
                    reply_markup=types.ReplyKeyboardRemove(),
                )

    def _config_nombre(message, bot):
        """Step 1: Product name."""
        nombre = (message.text or "").strip()
        if not nombre or nombre.startswith("/"):
            bot.send_message(message.chat.id, "⚠️ Escribe un nombre válido para el producto.")
            bot.register_next_step_handler(message, _config_nombre, bot)
            return

        bot.send_message(
            message.chat.id,
            f"✅ Producto: <b>{nombre}</b>\n\n"
            "💵 <b>Precio de COMPRA</b> (tu costo):\n"
            "<i>(Solo el número, sin $ ni puntos. Ej: 50000)</i>",
        )
        bot.register_next_step_handler(message, _config_precio_compra, bot, nombre)

    def _config_precio_compra(message, bot, nombre):
        """Step 2: Purchase price."""
        try:
            precio = float((message.text or "0").replace(".", "").replace(",", ".").replace("$", "").strip())
        except ValueError:
            bot.send_message(message.chat.id, "⚠️ Escribe solo el número. Ej: 50000")
            bot.register_next_step_handler(message, _config_precio_compra, bot, nombre)
            return

        bot.send_message(
            message.chat.id,
            f"✅ Costo: <b>{format_cop(precio)}</b>\n\n"
            "💰 <b>Precio de VENTA</b> (lo que cobras al cliente):\n"
            "<i>(Solo el número. Ej: 75000)</i>",
        )
        bot.register_next_step_handler(message, _config_precio_venta, bot, nombre, precio)

    def _config_precio_venta(message, bot, nombre, precio_compra):
        """Step 3: Sale price."""
        try:
            precio = float((message.text or "0").replace(".", "").replace(",", ".").replace("$", "").strip())
        except ValueError:
            bot.send_message(message.chat.id, "⚠️ Escribe solo el número. Ej: 75000")
            bot.register_next_step_handler(message, _config_precio_venta, bot, nombre, precio_compra)
            return

        margen = precio - precio_compra
        margen_pct = (margen / precio_compra * 100) if precio_compra > 0 else 0

        bot.send_message(
            message.chat.id,
            f"✅ Venta: <b>{format_cop(precio)}</b>\n"
            f"📈 Margen: <b>{format_cop(margen)}</b> ({margen_pct:.0f}%)\n\n"
            "📦 <b>Stock inicial</b> (unidades disponibles):\n"
            "<i>(Solo el número. Ej: 100)</i>",
        )
        bot.register_next_step_handler(message, _config_stock, bot, nombre, precio_compra, precio)

    def _config_stock(message, bot, nombre, precio_compra, precio_venta):
        """Step 4: Initial stock → save product."""
        try:
            stock = int((message.text or "0").strip())
        except ValueError:
            bot.send_message(message.chat.id, "⚠️ Escribe un número entero. Ej: 100")
            bot.register_next_step_handler(message, _config_stock, bot, nombre, precio_compra, precio_venta)
            return

        vendedor_id = get_vendedor_id(message)

        try:
            product_id = add_product(vendedor_id, nombre, precio_compra, precio_venta, stock)

            margen = precio_venta - precio_compra
            bot.send_message(
                message.chat.id,
                f"✅ <b>Producto registrado (ID: {product_id})</b>\n\n"
                f"  📦 {nombre}\n"
                f"  💵 Compra: {format_cop(precio_compra)}\n"
                f"  💰 Venta: {format_cop(precio_venta)}\n"
                f"  📈 Margen: {format_cop(margen)}\n"
                f"  📦 Stock: {stock} uds\n",
            )

            # Ask if they want to add another
            markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
            markup.add("✅ Agregar Producto", "❌ Terminar")
            bot.send_message(
                message.chat.id,
                "¿Deseas agregar otro producto?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _config_choice, bot)

        except Exception as e:
            logger.error("Product add failed for %s: %s", vendedor_id, e)
            bot.send_message(message.chat.id, f"⚠️ Error al guardar: {e}")

    # =====================================================================
    # /mi_cuenta — Account info
    # =====================================================================

    @bot.message_handler(commands=["mi_cuenta"])
    @requiere_suscripcion(bot)
    def cmd_mi_cuenta(message):
        """Show account/subscription info."""
        vendedor = message.vendedor
        fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
        fecha_str = fecha_venc.strftime("%d/%m/%Y") if fecha_venc else "N/A"
        estado = vendedor["estado"]
        estado_emoji = "🟢" if estado == "Activo" else "🟡" if estado == "Prueba" else "🔴"
        productos = get_products(vendedor["id"])

        text = (
            "👤 <b>MI CUENTA</b>\n"
            "━" * 25 + "\n\n"
            f"🏢 Negocio: <b>{vendedor['nombre_negocio']}</b>\n"
            f"📱 WhatsApp: <b>{vendedor.get('telefono_soporte', 'N/A')}</b>\n"
            f"{estado_emoji} Estado: <b>{estado}</b>\n"
            f"📅 Vence: <b>{fecha_str}</b>\n"
            f"📦 Productos: <b>{len(productos)}</b>\n"
            f"🆔 ID: <code>{vendedor['id']}</code>\n"
        )
        bot.send_message(message.chat.id, text)

    # =====================================================================
    # /cancelar — Cancel any ongoing flow
    # =====================================================================

    @bot.message_handler(commands=["cancelar"])
    def cmd_cancel(message):
        """Cancel any step handler in progress."""
        bot.clear_step_handler_by_chat_id(message.chat.id)
        bot.send_message(
            message.chat.id,
            "❌ <b>Acción cancelada.</b>\nTodos los flujos pendientes han sido detenidos.",
            reply_markup=types.ReplyKeyboardRemove(),
        )
