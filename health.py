# -*- coding: utf-8 -*-
"""
ControlIA SaaS — HTTP Server (Health + API + Static Files)
Serves the Telegram Mini App + REST API with HMAC validation.

Routes:
  GET  /                        → Health check (200 OK)
  GET  /app/                    → Mini App (index.html)
  GET  /app/<file>              → Static files (CSS, JS, images)
  GET  /api/vendor              → Vendor data (or is_new flag)
  GET  /api/dashboard           → Dashboard stats
  POST /api/register            → Register new vendor
  GET  /api/products            → Product catalog
  POST /api/products            → Add product
  POST /webhook/mercadopago     → IPN payment notification (Sprint 4)
"""
import hashlib
import hmac
import json
import os
import threading
import urllib.parse
from datetime import date
from http.server import HTTPServer, BaseHTTPRequestHandler

from config import TOKEN, TRIAL_DAYS, SUBSCRIPTION_PRICE_COP, logger

# Webapp directory (relative to this file)
WEBAPP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'webapp')

# Dev mode: skip HMAC validation when not on Render
IS_PRODUCTION = bool(os.environ.get('RENDER_EXTERNAL_URL'))

# MIME types for static files
MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff':  'font/woff',
}


# =========================================================================
# TELEGRAM INIT DATA VALIDATION (HMAC-SHA256)
# =========================================================================

def validate_init_data(init_data_raw, bot_token):
    """Validate Telegram WebApp initData using HMAC-SHA256.

    Returns the user dict (id, first_name, etc.) if valid, None otherwise.
    See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    try:
        params = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))
        received_hash = params.pop('hash', None)
        if not received_hash:
            return None

        # Build data-check-string (sorted alphabetically)
        data_check_string = '\n'.join(
            f"{k}={v}" for k, v in sorted(params.items())
        )

        # Secret key: HMAC-SHA256("WebAppData", bot_token)
        secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

        # Calculate expected hash
        calc_hash = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calc_hash, received_hash):
            return None

        # Extract user data
        user_raw = params.get('user')
        if user_raw:
            return json.loads(user_raw)
        return None
    except Exception as e:
        logger.error("initData validation error: %s", e)
        return None


# =========================================================================
# HTTP HANDLER
# =========================================================================

class AppHandler(BaseHTTPRequestHandler):
    """HTTP handler for health checks, static files, and API endpoints."""

    # ── ROUTING: GET ──

    def do_GET(self):
        path = self.path.split('?')[0]  # Strip query params

        if path == '/':
            self._health_check()
        elif path.startswith('/app'):
            self._serve_static(path)
        elif path.startswith('/api/'):
            self._route_api_get(path)
        else:
            self._send_error(404, "Not Found")

    # ── ROUTING: POST ──

    def do_POST(self):
        path = self.path.split('?')[0]

        if path.startswith('/api/'):
            self._route_api_post(path)
        elif path == '/webhook/mercadopago':
            self._webhook_mercadopago()
        else:
            self._send_error(404, "Not Found")

    # ── ROUTING: OPTIONS (CORS) ──

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    # ── HEALTH CHECK ──

    def _health_check(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ControlIA SaaS - Online")

    # ── STATIC FILE SERVER ──

    def _serve_static(self, path):
        # /app → /app/ redirect
        if path == '/app':
            self.send_response(301)
            self.send_header("Location", "/app/")
            self.end_headers()
            return

        # Map URL path to file
        if path == '/app/':
            file_path = os.path.join(WEBAPP_DIR, 'index.html')
        else:
            # /app/style.css → webapp/style.css
            relative = path.replace('/app/', '', 1)
            # Security: prevent directory traversal
            relative = relative.replace('..', '').lstrip('/')
            file_path = os.path.join(WEBAPP_DIR, relative)

        # Verify file exists and is within webapp dir
        file_path = os.path.normpath(file_path)
        if not file_path.startswith(os.path.normpath(WEBAPP_DIR)):
            self._send_error(403, "Forbidden")
            return

        if not os.path.isfile(file_path):
            self._send_error(404, "File not found")
            return

        # Determine content type
        ext = os.path.splitext(file_path)[1].lower()
        content_type = MIME_TYPES.get(ext, 'application/octet-stream')

        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            logger.error("Static file error: %s", e)
            self._send_error(500, "Internal Server Error")

    # ── API GET ROUTER ──

    def _route_api_get(self, path):
        vendor_id = self._authenticate()
        if vendor_id is None:
            return  # Error already sent

        if path == '/api/vendor':
            self._api_get_vendor(vendor_id)
        elif path == '/api/dashboard':
            self._api_get_dashboard(vendor_id)
        elif path == '/api/products':
            self._api_get_products(vendor_id)
        elif path == '/api/clients':
            self._api_get_clients(vendor_id)
        elif path.startswith('/api/clients/'):
            client_id = path.split('/')[-1]
            self._api_get_client_detail(vendor_id, client_id)
        elif path == '/api/orders':
            self._api_get_orders(vendor_id)
        elif path == '/api/orders/unpaid':
            self._api_get_unpaid(vendor_id)
        elif path == '/api/finance/summary':
            self._api_get_finance(vendor_id)
        elif path == '/api/finance/receivables':
            self._api_get_receivables(vendor_id)
        elif path == '/api/finance/margin':
            self._api_get_margin(vendor_id)
        elif path == '/api/pipeline':
            self._api_get_pipeline(vendor_id)
        elif path == '/api/backup':
            self._api_get_backup(vendor_id)
        else:
            self._send_error(404, "API endpoint not found")

    # ── API POST ROUTER ──

    def _route_api_post(self, path):
        vendor_id = self._authenticate()
        if vendor_id is None:
            return

        body = self._read_json_body()
        if body is None:
            return

        if path == '/api/register':
            self._api_register(vendor_id, body)
        elif path == '/api/products':
            self._api_add_product(vendor_id, body)
        elif path == '/api/clients':
            self._api_add_client(vendor_id, body)
        elif path == '/api/orders':
            self._api_add_order(vendor_id, body)
        elif path == '/api/orders/deliver':
            self._api_deliver_order(vendor_id, body)
        elif path == '/api/orders/pay':
            self._api_pay_order(vendor_id, body)
        elif path == '/api/orders/repeat':
            self._api_repeat_order(vendor_id, body)
        elif path == '/api/expenses':
            self._api_add_expense(vendor_id, body)
        elif path == '/api/notes':
            self._api_add_note(vendor_id, body)
        elif path == '/api/clients/search':
            self._api_search_clients(vendor_id, body)
        elif path == '/api/clients/assign-day':
            self._api_assign_day(vendor_id, body)
        elif path == '/api/finance/meta':
            self._api_set_meta(vendor_id, body)
        elif path.startswith('/api/delete/'):
            self._api_delete_record(vendor_id, path, body)
        else:
            self._send_error(404, "API endpoint not found")

    # ── AUTHENTICATION ──

    def _authenticate(self):
        """Validate Telegram initData and return vendor_id, or send 401."""
        if not IS_PRODUCTION:
            # Dev mode: use header or default test ID
            dev_id = self.headers.get('X-Dev-Vendor-Id', '12345')
            try:
                return int(dev_id)
            except ValueError:
                return 12345

        # Production: validate Telegram HMAC
        init_data = self.headers.get('X-Telegram-Init-Data', '')
        if not init_data:
            self._send_error(401, "Missing authentication")
            return None

        user = validate_init_data(init_data, TOKEN)
        if not user or 'id' not in user:
            self._send_error(401, "Invalid authentication")
            return None

        return int(user['id'])

    # ─────────────────────────────────────────────────────────────────
    # API ENDPOINTS
    # ─────────────────────────────────────────────────────────────────

    def _api_get_vendor(self, vendor_id):
        """GET /api/vendor — Returns vendor data or is_new flag."""
        from database import get_vendedor

        vendedor = get_vendedor(vendor_id)
        if not vendedor:
            self._json_response({
                "is_new": True,
                "trial_days": TRIAL_DAYS,
                "subscription_price": SUBSCRIPTION_PRICE_COP,
            })
        else:
            self._json_response({
                "is_new": False,
                "vendor": self._serialize_vendor(vendedor),
            })

    def _api_get_dashboard(self, vendor_id):
        """GET /api/dashboard — Returns vendor + stats."""
        from database import get_vendedor, get_dashboard_stats, get_products

        vendedor = get_vendedor(vendor_id)
        if not vendedor:
            self._send_error(404, "Vendor not found")
            return

        stats = get_dashboard_stats(vendor_id)
        products = get_products(vendor_id)
        stats['products_count'] = len(products)

        self._json_response({
            "vendor": self._serialize_vendor(vendedor),
            "stats": stats,
        })

    def _api_register(self, vendor_id, body):
        """POST /api/register — Register a new vendor."""
        from database import register_vendedor

        business_name = (body.get('business_name') or '').strip()
        phone = (body.get('phone') or '').strip()

        if not business_name:
            self._send_error(400, "business_name is required")
            return

        try:
            vendedor = register_vendedor(vendor_id, business_name, phone)
            logger.info("New vendor via Mini App — ID: %s, Business: %s", vendor_id, business_name)
            self._json_response({
                "vendor": self._serialize_vendor(vendedor),
            })
        except Exception as e:
            logger.error("Registration failed for %s: %s", vendor_id, e)
            self._send_error(500, str(e))

    def _api_get_products(self, vendor_id):
        """GET /api/products — Get product catalog."""
        from database import get_products

        products = get_products(vendor_id)
        self._json_response({
            "products": [dict(p) for p in products] if products else [],
        })

    def _api_add_product(self, vendor_id, body):
        """POST /api/products — Add a product to catalog."""
        from database import add_product

        name = (body.get('name') or '').strip()
        if not name:
            self._send_error(400, "name is required")
            return

        try:
            product_id = add_product(
                vendor_id,
                name,
                body.get('buy_price', 0),
                body.get('sell_price', 0),
                body.get('stock', 0),
            )
            self._json_response({"product_id": product_id})
        except Exception as e:
            logger.error("Add product failed: %s", e)
            self._send_error(500, str(e))

    # ─────────────────────────────────────────────────────────────────
    # CLIENTS API
    # ─────────────────────────────────────────────────────────────────

    def _api_get_clients(self, vendor_id):
        from database import get_clients
        clients = get_clients(vendor_id)
        self._json_response({
            "items": [dict(c) for c in clients] if clients else [],
        })

    def _api_get_client_detail(self, vendor_id, client_id):
        from database import get_client_profile
        try:
            profile = get_client_profile(int(client_id), vendor_id)
            self._json_response(profile)
        except Exception as e:
            self._send_error(404, str(e))

    def _api_add_client(self, vendor_id, body):
        from database import add_client
        nombre = (body.get('nombre') or '').strip()
        if not nombre:
            self._send_error(400, "nombre is required")
            return
        try:
            client_id = add_client(vendor_id, body)
            self._json_response({"client_id": client_id})
        except Exception as e:
            logger.error("Add client failed: %s", e)
            self._send_error(500, str(e))

    def _api_search_clients(self, vendor_id, body):
        from database import search_clients
        q = (body.get('query') or '').strip()
        if not q:
            self._send_error(400, "query is required")
            return
        results = search_clients(vendor_id, q)
        self._json_response({
            "items": [dict(c) for c in results] if results else [],
        })

    # ─────────────────────────────────────────────────────────────────
    # ORDERS API
    # ─────────────────────────────────────────────────────────────────

    def _api_get_orders(self, vendor_id):
        from database import get_orders
        import urllib.parse as up
        # Parse query params for status filter
        qs = up.parse_qs(up.urlparse(self.path).query)
        status = qs.get('status', [None])[0]
        orders = get_orders(vendor_id, estado=status)
        self._json_response({
            "items": [dict(o) for o in orders] if orders else [],
        })

    def _api_add_order(self, vendor_id, body):
        from database import add_order
        required = ['cliente_id', 'producto', 'cantidad', 'precio_venta']
        for field in required:
            if not body.get(field):
                self._send_error(400, f"{field} is required")
                return
        try:
            order_id = add_order(
                vendor_id,
                body['cliente_id'],
                body['producto'],
                body['cantidad'],
                body.get('precio_compra', 0),
                body['precio_venta'],
            )
            self._json_response({"order_id": order_id})
        except Exception as e:
            logger.error("Add order failed: %s", e)
            self._send_error(500, str(e))

    def _api_deliver_order(self, vendor_id, body):
        from database import deliver_order
        order_id = body.get('order_id')
        if not order_id:
            self._send_error(400, "order_id is required")
            return
        try:
            deliver_order(int(order_id), vendor_id)
            self._json_response({"ok": True})
        except Exception as e:
            self._send_error(500, str(e))

    def _api_pay_order(self, vendor_id, body):
        from database import mark_order_paid
        order_id = body.get('order_id')
        if not order_id:
            self._send_error(400, "order_id is required")
            return
        try:
            mark_order_paid(int(order_id), vendor_id)
            self._json_response({"ok": True})
        except Exception as e:
            self._send_error(500, str(e))

    def _api_get_unpaid(self, vendor_id):
        from database import get_unpaid_orders
        orders = get_unpaid_orders(vendor_id)
        self._json_response({
            "items": [dict(o) for o in orders] if orders else [],
        })

    # ─────────────────────────────────────────────────────────────────
    # FINANCE API
    # ─────────────────────────────────────────────────────────────────

    def _api_get_finance(self, vendor_id):
        from database import get_finance_summary
        summary = get_finance_summary(vendor_id)
        self._json_response(summary)

    def _api_get_receivables(self, vendor_id):
        from database import get_receivables
        items = get_receivables(vendor_id)
        self._json_response({
            "items": [dict(r) for r in items] if items else [],
        })

    def _api_get_margin(self, vendor_id):
        from database import get_margin_analysis
        analysis = get_margin_analysis(vendor_id)
        self._json_response({
            "items": [dict(a) for a in analysis] if analysis else [],
        })

    def _api_add_expense(self, vendor_id, body):
        from database import add_expense
        concepto = (body.get('concepto') or '').strip()
        monto = body.get('monto', 0)
        if not concepto or not monto:
            self._send_error(400, "concepto and monto are required")
            return
        try:
            expense_id = add_expense(vendor_id, concepto, float(monto))
            self._json_response({"expense_id": expense_id})
        except Exception as e:
            self._send_error(500, str(e))

    # ─────────────────────────────────────────────────────────────────
    # PIPELINE & NOTES API
    # ─────────────────────────────────────────────────────────────────

    def _api_get_pipeline(self, vendor_id):
        from database import get_pipeline_stats
        stats = get_pipeline_stats(vendor_id)
        self._json_response(stats)

    def _api_add_note(self, vendor_id, body):
        from database import add_note
        cliente_id = body.get('cliente_id')
        texto = (body.get('texto') or '').strip()
        if not cliente_id or not texto:
            self._send_error(400, "cliente_id and texto are required")
            return
        try:
            note_id = add_note(vendor_id, int(cliente_id), texto)
            self._json_response({"note_id": note_id})
        except Exception as e:
            self._send_error(500, str(e))

    # ── BACKUP ──

    def _api_get_backup(self, vendor_id):
        """GET /api/backup — Returns all business data as JSON for download."""
        from database import get_backup_data
        try:
            data = get_backup_data(vendor_id)
            self._json_response({"backup": data, "vendor_id": vendor_id})
        except Exception as e:
            self._send_error(500, str(e))

    # ── REPEAT ORDER ──

    def _api_repeat_order(self, vendor_id, body):
        """POST /api/orders/repeat — Repeat the last order for a client."""
        from database import get_last_order, add_order
        cliente_id = body.get('cliente_id')
        if not cliente_id:
            self._send_error(400, "cliente_id is required")
            return
        try:
            last = get_last_order(int(cliente_id), vendor_id)
            if not last:
                self._send_error(404, "No hay pedidos anteriores para este cliente")
                return
            order_id = add_order(
                vendor_id, int(cliente_id), last['producto'],
                last['cantidad'], last.get('precio_compra', 0), last['precio_venta']
            )
            self._json_response({"order_id": order_id, "producto": last['producto'], "cantidad": last['cantidad']})
        except Exception as e:
            self._send_error(500, str(e))

    # ── ASSIGN VISIT DAY ──

    def _api_assign_day(self, vendor_id, body):
        """POST /api/clients/assign-day — Assign visit day to a client."""
        from database import search_clients, update_client
        nombre = (body.get('cliente_nombre') or '').strip()
        dia = (body.get('dia') or '').strip()
        if not nombre or not dia:
            self._send_error(400, "cliente_nombre and dia are required")
            return
        try:
            results = search_clients(vendor_id, nombre)
            if not results:
                self._send_error(404, "Cliente no encontrado: " + nombre)
                return
            client = results[0]
            update_client(client['id'], vendor_id, dia_visita=dia)
            self._json_response({"ok": True, "client": client['nombre'], "dia": dia})
        except Exception as e:
            self._send_error(500, str(e))

    # ── SET META ──

    def _api_set_meta(self, vendor_id, body):
        """POST /api/finance/meta — Set monthly sales goal."""
        from database import update_vendedor
        meta = body.get('meta')
        if meta is None:
            self._send_error(400, "meta is required")
            return
        try:
            update_vendedor(vendor_id, meta_mensual=float(meta))
            self._json_response({"ok": True, "meta": float(meta)})
        except Exception as e:
            self._send_error(500, str(e))

    # ── DELETE RECORDS ──

    def _api_delete_record(self, vendor_id, path, body):
        """POST /api/delete/<type> — Delete a record (client, order, product)."""
        from database import delete_client, delete_order, delete_product
        record_type = path.split('/')[-1]
        record_id = body.get('id')
        if not record_id:
            self._send_error(400, "id is required")
            return
        try:
            record_id = int(record_id)
            if record_type == 'client':
                delete_client(record_id, vendor_id)
            elif record_type == 'order':
                delete_order(record_id, vendor_id)
            elif record_type == 'product':
                delete_product(record_id, vendor_id)
            else:
                self._send_error(400, "Invalid record type: " + record_type)
                return
            self._json_response({"ok": True, "deleted": record_type, "id": record_id})
        except Exception as e:
            self._send_error(500, str(e))

    # ── MERCADO PAGO WEBHOOK (Sprint 4) ──

    def _webhook_mercadopago(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "received"}')

    # ─────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────

    def _json_response(self, data, status=200):
        """Send a JSON response with CORS headers."""
        body = json.dumps(data, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status, message):
        """Send a JSON error response."""
        self._json_response({"error": message}, status)

    def _read_json_body(self):
        """Read and parse JSON body from POST request."""
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw)
        except Exception as e:
            self._send_error(400, f"Invalid JSON: {e}")
            return None

    def _set_cors_headers(self):
        """Set CORS headers for Telegram WebView."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, X-Telegram-Init-Data, X-Dev-Vendor-Id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def _serialize_vendor(self, vendedor):
        """Convert vendor dict to JSON-safe format."""
        v = dict(vendedor)
        # Convert date objects to ISO strings
        for key in ('fecha_vencimiento', 'fecha_registro'):
            val = v.get(key)
            if val and isinstance(val, date):
                v[key] = val.isoformat()
        return v

    def log_message(self, format, *args):
        """Silence default HTTP logging to keep console clean."""
        pass


# =========================================================================
# SERVER STARTUP
# =========================================================================

def start_health_server():
    """Start HTTP server in a background thread (non-blocking).
    Serves health checks, static Mini App files, and API endpoints."""
    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(("0.0.0.0", port), AppHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("HTTP server started on port %s (API + Mini App + Health)", port)
    return port
