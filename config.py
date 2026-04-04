# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Configuration Module
Environment variables, SaaS pricing, and security constants.
All business-specific data lives in the database, not here.
"""
import os
import logging
from dotenv import load_dotenv

# Load .env file (local dev — no-op in Render where env vars are set directly)
load_dotenv()


# =========================================================================
# CORE — REQUIRED
# =========================================================================
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
DATABASE_URL = os.environ["DATABASE_URL"]  # Supabase NEW instance

# =========================================================================
# OPTIONAL INTEGRATIONS
# =========================================================================
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# =========================================================================
# SAAS PRICING & TRIAL
# =========================================================================
SUBSCRIPTION_PRICE_COP = int(os.environ.get("SUBSCRIPTION_PRICE_COP", "80000"))
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "3"))

# =========================================================================
# WEBAPP URL (Telegram Mini App)
# =========================================================================
_render_url = os.environ.get("RENDER_EXTERNAL_URL", "")
WEBAPP_URL = _render_url if _render_url else f"http://localhost:{os.environ.get('PORT', '10000')}"

# =========================================================================
# MERCADO PAGO (activar cuando se cree la cuenta)
# =========================================================================
MERCADOPAGO_ACCESS_TOKEN = os.environ.get("MERCADOPAGO_ACCESS_TOKEN", "")
MERCADOPAGO_WEBHOOK_SECRET = os.environ.get("MERCADOPAGO_WEBHOOK_SECRET", "")
WEBHOOK_BASE_URL = os.environ.get("WEBHOOK_BASE_URL", "")

# =========================================================================
# LOGGING
# =========================================================================
logger = logging.getLogger("controlia_saas")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)

# =========================================================================
# GOOGLE MAPS & ROUTING (generic — no business-specific constants)
# =========================================================================
MAX_WAYPOINTS = 10
MINUTES_PER_STOP = 4
MAX_ROUTE_HOURS = 4
MAX_DISCOVERY_STOPS = 20
DEFAULT_SEARCH_RADIUS = 1500

SEARCH_RADIUS_OPTIONS = {
    "🚶 500m (muy cerca)": 500,
    "🚶 1 km (ideal)": 1000,
    "🚶 1.5 km (extendido)": 1500,
    "🚶 2 km (caminata larga)": 2000,
    "🚶 3 km (máximo)": 3000,
}
