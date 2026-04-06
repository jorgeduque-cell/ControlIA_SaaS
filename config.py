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
# V2 — ZERO-COST ROUTING ENGINE
# =========================================================================
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
ORS_BASE_URL = "https://api.openrouteservice.org"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org"

# =========================================================================
# SAAS PRICING & TRIAL
# =========================================================================
SUBSCRIPTION_PRICE_COP = int(os.environ.get("SUBSCRIPTION_PRICE_COP", "80000"))
TRIAL_DAYS = int(os.environ.get("TRIAL_DAYS", "3"))
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID", "")  # Owner's Telegram ID for support

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
MAX_WAYPOINTS = 23
MINUTES_PER_STOP = 5
MAX_ROUTE_HOURS = 6
MAX_DISCOVERY_STOPS = 30
DEFAULT_SEARCH_RADIUS = 1500

SEARCH_RADIUS_OPTIONS = {
    "🚶 500m (muy cerca)": 500,
    "🚶 1 km (ideal)": 1000,
    "🚶 1.5 km (extendido)": 1500,
    "🚶 2 km (caminata larga)": 2000,
    "🚶 3 km (máximo)": 3000,
}

# =========================================================================
# V2 — CLUSTERING & ANTI-TARGETING
# =========================================================================
KMEANS_THRESHOLD = 23          # Trigger K-Means above this many stops
DEFAULT_CLUSTER_SIZE = 20      # Target stops per cluster (VROOM supports up to 50)

# Chains to exclude from /ruta_pie prospecting (Anti-Targeting)
CHAIN_BLACKLIST = [
    "kfc", "mcdonalds", "mcdonald's", "frisby", "subway", "dominos",
    "domino's", "papa johns", "burger king", "starbucks", "juan valdez",
    "oxxo", "d1", "ara", "justo & bueno", "éxito", "jumbo", "olimpica",
]
