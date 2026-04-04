# -*- coding: utf-8 -*-
"""
===========================================================================
  CONTROLIA SAAS — Multi-Tenant Telegram Sales Bot
  Entry Point
  Author: Antigravity Core Engine
===========================================================================
  ENVIRONMENT VARIABLES (REQUIRED):
    - TELEGRAM_BOT_TOKEN    → Bot token from @BotFather
    - DATABASE_URL          → Supabase PostgreSQL connection string

  OPTIONAL:
    - GOOGLE_API_KEY        → For /radar, /ruta_pie, /ruta_camion
    - SUBSCRIPTION_PRICE_COP → Monthly price (default: 80000)
    - TRIAL_DAYS            → Free trial days (default: 3)
    - PORT                  → Health server port (default: 10000)

  USAGE:
    pip install -r requirements.txt
    python bot.py
===========================================================================
"""
import telebot
from telebot import types

from config import TOKEN, WEBAPP_URL, logger
from database import init_database
from handlers import register_all


# =========================================================================
# BOT INSTANCE
# =========================================================================
bot = telebot.TeleBot(TOKEN, parse_mode="HTML")


# =========================================================================
# REGISTER ALL HANDLERS
# =========================================================================
register_all(bot)


# =========================================================================
# TELEGRAM MENU — Commands visible in the bot's menu
# =========================================================================
def set_bot_commands():
    """Register all commands in the Telegram menu."""
    commands = [
        types.BotCommand("start", "🏢 Panel principal"),
        types.BotCommand("configurar", "📦 Configurar productos"),
        types.BotCommand("mi_cuenta", "👤 Mi cuenta y suscripción"),
        # CRM
        types.BotCommand("nuevo_cliente", "👤 Registrar nuevo cliente"),
        types.BotCommand("clientes", "👥 Ver cartera de clientes"),
        types.BotCommand("buscar", "🔍 Buscar cliente"),
        types.BotCommand("ficha", "📋 Perfil completo del cliente"),
        types.BotCommand("nota", "📝 Agregar nota de visita"),
        types.BotCommand("seguimiento", "📊 Pipeline comercial"),
        types.BotCommand("radar", "📡 Inteligencia comercial"),
        types.BotCommand("asignar_dia", "📅 Asignar día de visita"),
        # Ventas
        types.BotCommand("vender", "🛒 Crear pedido de venta"),
        types.BotCommand("repetir", "🔄 Repetir último pedido"),
        types.BotCommand("pedidos", "📦 Ver pedidos"),
        types.BotCommand("entregar", "✅ Marcar entregado"),
        types.BotCommand("cobrar", "💳 Cobros pendientes"),
        types.BotCommand("pagar", "💵 Marcar pedido pagado"),
        # Precios
        types.BotCommand("precios", "💰 Lista de precios"),
        types.BotCommand("cotizar", "📲 Cotización WhatsApp"),
        # Logística
        types.BotCommand("ruta_semanal", "📅 Ruta fija semanal"),
        types.BotCommand("ruta_pie", "🗺️ Prospección a pie"),
        types.BotCommand("ruta_camion", "🚚 Ruta vehicular"),
        types.BotCommand("inventario", "📦 Control de stock"),
        # Documentos
        types.BotCommand("remision", "📄 Remisión PDF"),
        types.BotCommand("despacho", "🚛 Despacho formal PDF"),
        # Finanzas
        types.BotCommand("gasto", "📝 Registrar gasto"),
        types.BotCommand("caja", "💼 Estado de caja"),
        types.BotCommand("cuentas_por_cobrar", "💳 Cartera por cobrar"),
        types.BotCommand("margen", "📈 Análisis de rentabilidad"),
        types.BotCommand("meta", "🎯 Meta mensual"),
        types.BotCommand("meta_set", "🎯 Configurar meta"),
        # Admin
        types.BotCommand("editar", "✏️ Editar registro"),
        types.BotCommand("eliminar", "🗑️ Eliminar registro"),
        types.BotCommand("backup", "💾 Respaldar datos"),
        types.BotCommand("cancelar", "❌ Cancelar acción"),
    ]
    bot.set_my_commands(commands)


def set_menu_button():
    """Configure the bot's menu button to open the Mini App.
    Only in production (when WEBAPP_URL points to a real HTTPS URL)."""
    if 'localhost' not in WEBAPP_URL and WEBAPP_URL.startswith('https'):
        try:
            webapp_url = f"{WEBAPP_URL}/app/"
            bot.set_chat_menu_button(
                menu_button=types.MenuButtonWebApp(
                    type="web_app",
                    text="📊 ControlIA",
                    web_app=types.WebAppInfo(url=webapp_url),
                )
            )
            logger.info("Menu button set to Mini App: %s", webapp_url)
        except Exception as e:
            logger.warning("Could not set menu button: %s", e)
    else:
        logger.info("Menu button: using default (dev mode / no HTTPS)")



# =========================================================================
# MAIN ENTRY POINT
# =========================================================================
if __name__ == "__main__":
    print("=" * 50)
    print("  CONTROLIA SAAS — Multi-Tenant Sales Bot")
    print("  Inicializando base de datos...")
    init_database()
    print("  ✅ Base de datos lista (8 tablas + RLS).")
    set_bot_commands()
    print("  ✅ Comandos de menú registrados.")
    set_menu_button()
    print(f"  ✅ Mini App URL: {WEBAPP_URL}/app/")

    # Health check server (keeps Render free tier alive)
    from health import start_health_server
    port = start_health_server()
    print(f"  ✅ Health server en puerto {port}.")

    # Clear any stale Telegram connections (prevents 409 Conflict on Render restarts)
    import time
    try:
        bot.remove_webhook()
        bot.get_updates(offset=-1, timeout=1)
    except Exception:
        pass
    time.sleep(2)  # Let the old instance fully die

    print("  🤖 Bot en ejecución. Ctrl+C para detener.")
    print("=" * 50)

    # Retry loop — handles transient 409 conflicts during Render deploys
    while True:
        try:
            bot.infinity_polling(timeout=60, long_polling_timeout=60, skip_pending=True)
            break  # Clean exit
        except Exception as e:
            logger.error("Polling crashed: %s — restarting in 5s...", e)
            time.sleep(5)
