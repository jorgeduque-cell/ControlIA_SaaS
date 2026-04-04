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
import io
import json
import os
import threading
import urllib.parse
import urllib.request
from datetime import date, datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

from config import TOKEN, TRIAL_DAYS, SUBSCRIPTION_PRICE_COP, MERCADOPAGO_WEBHOOK_SECRET, logger

# Viral footer injected into every generated PDF
VIRAL_FOOTER = (
    "\U0001F4C4 Documento generado con @controliasaasbot \u2014 "
    "Organice sus cobros y rutas por $2,600/d\u00EDa. "
    "Pru\u00E9belo 7 d\u00EDas gratis \u2192 t.me/controliasaasbot"
)

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

    # ── SUBSCRIPTION GUARD (Kill Switch for API) ──

    def _require_active_subscription(self, vendor_id):
        """Check if vendor has active subscription. Returns True if active.
        If expired, sends 403 and returns False.
        Skipped for /api/vendor and /api/register (onboarding routes)."""
        from database import get_vendedor, _deactivate_vendor
        from database import safe_parse_date
        vendedor = get_vendedor(vendor_id)
        if not vendedor:
            self._send_error(403, "No estas registrado. Usa /start en el bot.")
            return False

        estado = vendedor["estado"]
        fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))

        # Auto-deactivate expired vendors
        if estado in ("Activo", "Prueba") and fecha_venc and fecha_venc < date.today():
            _deactivate_vendor(vendor_id)
            estado = "Inactivo"

        if estado == "Inactivo":
            fecha_str = fecha_venc.isoformat() if fecha_venc else "N/A"
            self._json_response({
                "error": "subscription_expired",
                "message": f"Tu suscripcion vencio el {fecha_str}. Renueva para continuar.",
                "expired": True,
            }, 403)
            return False

        return True

    # ── API GET ROUTER ──

    def _route_api_get(self, path):
        vendor_id = self._authenticate()
        if vendor_id is None:
            return  # Error already sent

        # Onboarding routes — no subscription check
        if path == '/api/vendor':
            self._api_get_vendor(vendor_id)
            return

        # All other routes require active subscription
        if not self._require_active_subscription(vendor_id):
            return

        if path == '/api/dashboard':
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
        elif path.startswith('/api/whatsapp/'):
            self._route_whatsapp_get(vendor_id, path)
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

        # Onboarding route — no subscription check
        if path == '/api/register':
            self._api_register(vendor_id, body)
            return

        # All other routes require active subscription
        if not self._require_active_subscription(vendor_id):
            return

        if path == '/api/products':
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
        elif path == '/api/documents/remision':
            self._api_generate_remision(vendor_id, body)
        elif path == '/api/documents/despacho':
            self._api_generate_despacho(vendor_id, body)
        elif path == '/api/documents/cotizacion':
            self._api_generate_cotizacion(vendor_id)
        elif path == '/api/documents/backup':
            self._api_generate_backup(vendor_id)
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
            if not profile:
                self._send_error(404, "Cliente no encontrado")
                return
            # Flatten totals into top-level for frontend
            totals = profile.get('totals') or {}
            profile['orders_count'] = totals.get('num_pedidos', 0)
            profile['total_purchases'] = totals.get('total_vendido', 0)
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
        # Map DB field names to what frontend expects
        items = []
        if orders:
            for o in orders:
                row = dict(o)
                # get_unpaid returns c.nombre, frontend expects cliente_nombre
                if 'nombre' in row and 'cliente_nombre' not in row:
                    row['cliente_nombre'] = row['nombre']
                items.append(row)
        self._json_response({"items": items})

    # ─────────────────────────────────────────────────────────────────
    # FINANCE API
    # ─────────────────────────────────────────────────────────────────

    def _api_get_finance(self, vendor_id):
        from database import get_finance_summary, get_unpaid_orders
        summary = get_finance_summary(vendor_id)
        # Get total receivable (unpaid orders)
        unpaid = get_unpaid_orders(vendor_id)
        total_receivable = sum(o['total'] for o in unpaid) if unpaid else 0
        # Map to what frontend expects
        self._json_response({
            "total_sales": summary.get('income', 0),
            "total_collected": summary.get('income', 0) - total_receivable,
            "total_expenses": summary.get('expenses', 0),
            "total_receivable": total_receivable,
            "cogs": summary.get('cogs', 0),
        })

    def _api_get_receivables(self, vendor_id):
        from database import get_receivables
        items_raw = get_receivables(vendor_id)
        # Map DB fields to what frontend expects
        items = []
        if items_raw:
            for r in items_raw:
                row = dict(r)
                row['cliente_nombre'] = row.get('nombre', 'Cliente')
                row['pedidos_pendientes'] = row.get('num_pedidos', 0)
                row['total_pendiente'] = row.get('total_deuda', 0)
                items.append(row)
        self._json_response({"items": items})

    def _api_get_margin(self, vendor_id):
        from database import get_margin_analysis
        analysis = get_margin_analysis(vendor_id)
        # analysis returns {products: [...], top_clients: [...]}
        # Frontend expects items array with producto, precio_compra, precio_venta
        items = []
        if analysis and analysis.get('products'):
            for p in analysis['products']:
                row = dict(p)
                row['nombre'] = row.get('producto', '')
                row['precio_compra'] = row.get('avg_costo', 0)
                row['precio_venta'] = row.get('avg_venta', 0)
                items.append(row)
        self._json_response({"items": items})

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
        from database import get_pipeline_stats, get_dashboard_stats
        states = get_pipeline_stats(vendor_id)
        dash = get_dashboard_stats(vendor_id)
        # Map state counts to frontend-expected fields
        state_map = {}
        if states:
            for row in states:
                state_map[row['estado']] = row['c']
        self._json_response({
            "total_clients": dash.get('total_clients', 0),
            "active": state_map.get('Activo', 0),
            "prospects": state_map.get('Prospecto', 0),
            "pending_orders": dash.get('pending_orders', 0),
            "month_sales": dash.get('today_sales', 0),
        })

    def _api_add_note(self, vendor_id, body):
        from database import add_note
        cliente_id = body.get('cliente_id')
        texto = (body.get('texto') or '').strip()
        if not cliente_id or not texto:
            self._send_error(400, "cliente_id and texto are required")
            return
        try:
            add_note(vendor_id, int(cliente_id), texto)
            self._json_response({"ok": True})
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

    # ── DOCUMENT PDF GENERATION (sent via Telegram Bot API) ──

    def _send_pdf_to_telegram(self, chat_id, pdf_buffer, filename, caption):
        """Send a PDF file to a Telegram chat using Bot API."""
        try:
            url = f"https://api.telegram.org/bot{TOKEN}/sendDocument"
            boundary = '----FormBoundary7MA4YWxkTrZu0gW'
            pdf_data = pdf_buffer.getvalue()

            body_parts = []
            # chat_id field
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Disposition: form-data; name="chat_id"')
            body_parts.append(b'')
            body_parts.append(str(chat_id).encode())
            # caption field
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Disposition: form-data; name="caption"')
            body_parts.append(b'')
            body_parts.append(caption.encode('utf-8'))
            # document field
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(f'Content-Disposition: form-data; name="document"; filename="{filename}"'.encode())
            body_parts.append(b'Content-Type: application/pdf')
            body_parts.append(b'')
            body_parts.append(pdf_data)
            # close
            body_parts.append(f'--{boundary}--'.encode())

            body = b'\r\n'.join(body_parts)
            req = urllib.request.Request(
                url, data=body,
                headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                return result.get('ok', False)
        except Exception as e:
            logger.error("Failed to send PDF to Telegram: %s", e)
            return False

    def _api_generate_remision(self, vendor_id, body):
        """POST /api/documents/remision — Generate remision PDF and send to chat."""
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.enums import TA_CENTER
        from database import get_vendedor, get_order
        from utils import format_cop

        order_id = body.get('order_id')
        if not order_id:
            self._send_error(400, "order_id is required")
            return

        try:
            order_id = int(order_id)
            vendedor = get_vendedor(vendor_id)
            order = get_order(order_id, vendor_id)

            if not order:
                self._send_error(404, "Pedido no encontrado")
                return

            nombre = vendedor['nombre_negocio'] if vendedor else 'Mi Negocio'
            total = order['cantidad'] * order['precio_venta']

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

            fecha_str = date.today().isoformat()
            elements = []
            elements.append(Paragraph(f"REMISION {nombre}", title_style))
            elements.append(Spacer(1, 5 * mm))

            data = [
                ["Remision No.", str(order_id), "Fecha", fecha_str],
                ["Cliente", order.get("cliente_nombre", ""), "Direccion", order.get("cliente_dir") or ""],
                ["Telefono", order.get("cliente_tel") or "", "", ""],
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

            # Viral footer
            viral_style = ParagraphStyle("Viral", parent=styles["Normal"], fontSize=6, textColor=colors.Color(0.4, 0.4, 0.4), fontName="Helvetica-Oblique", alignment=TA_CENTER, spaceBefore=10*mm)
            elements.append(Paragraph(VIRAL_FOOTER, viral_style))

            doc.build(elements)
            buffer.seek(0)

            safe_name = nombre.replace(" ", "_")
            filename = f"Remision_{order_id}_{safe_name}.pdf"
            caption = f"Remision #{order_id} - {order.get('cliente_nombre', '')} - {format_cop(total)}"

            sent = self._send_pdf_to_telegram(vendor_id, buffer, filename, caption)
            if sent:
                self._json_response({"ok": True, "message": "PDF enviado al chat", "filename": filename})
            else:
                self._send_error(500, "No se pudo enviar el PDF al chat")
        except Exception as e:
            logger.error("Remision PDF error: %s", e)
            self._send_error(500, str(e))

    def _api_generate_despacho(self, vendor_id, body):
        """POST /api/documents/despacho — Generate despacho PDF and send to chat."""
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.enums import TA_CENTER
        from database import get_vendedor, get_order
        from utils import format_cop

        order_id = body.get('order_id')
        if not order_id:
            self._send_error(400, "order_id is required")
            return

        try:
            order_id = int(order_id)
            vendedor = get_vendedor(vendor_id)
            order = get_order(order_id, vendor_id)

            if not order:
                self._send_error(404, "Pedido no encontrado")
                return

            nombre = vendedor['nombre_negocio'] if vendedor else 'Mi Negocio'
            total = order['cantidad'] * order['precio_venta']
            now = datetime.now()
            today_str = now.strftime("%d/%m/%Y")
            dispatch_id = now.strftime("%Y%m%d%H%M")

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
            ])

            elements = []
            elements.append(Paragraph(f"<b>{nombre}</b>", company_style))
            elements.append(Spacer(1, 4*mm))
            elements.append(Paragraph("<b>DESPACHO DE MERCANCIA</b>", title_style))
            elements.append(Spacer(1, 3*mm))

            t1 = Table([
                [f"No. Remision: {dispatch_id}", f"Fecha: {today_str}"],
                [f"Cliente: {order.get('cliente_nombre', '')}", f"Direccion: {order.get('cliente_dir') or ''}"],
            ], colWidths=[half_width, half_width])
            t1.setStyle(green_grid)
            elements.append(t1)
            elements.append(Spacer(1, 4*mm))

            elements.append(Paragraph("  DETALLE DE MERCANCIA", section_style))
            detail = [
                ["Producto", "Cantidad", "Precio Unit.", "Total"],
                [order["producto"], str(order["cantidad"]), format_cop(order["precio_venta"]), format_cop(total)],
            ]
            dt = Table(detail, colWidths=[full_width*0.40, full_width*0.20, full_width*0.20, full_width*0.20])
            dt.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, brand_color),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("BACKGROUND", (0, 0), (-1, 0), brand_bg),
            ]))
            elements.append(dt)
            elements.append(Spacer(1, 5*mm))
            elements.append(Paragraph(f"<b>TOTAL: {format_cop(total)}</b>", ParagraphStyle("Tot", parent=styles["Normal"], fontSize=12, fontName="Helvetica-Bold")))

            # Viral footer
            viral_style = ParagraphStyle("DViral", parent=styles["Normal"], fontSize=6, textColor=colors.Color(0.4, 0.4, 0.4), fontName="Helvetica-Oblique", alignment=TA_CENTER, spaceBefore=10*mm)
            elements.append(Paragraph(VIRAL_FOOTER, viral_style))

            doc.build(elements)
            buffer.seek(0)

            safe_name = nombre.replace(" ", "_")
            filename = f"Despacho_{safe_name}_{dispatch_id}.pdf"
            caption = f"Despacho {nombre} - {order.get('cliente_nombre', '')} - {format_cop(total)}"

            sent = self._send_pdf_to_telegram(vendor_id, buffer, filename, caption)
            if sent:
                self._json_response({"ok": True, "message": "PDF enviado al chat", "filename": filename})
            else:
                self._send_error(500, "No se pudo enviar el PDF al chat")
        except Exception as e:
            logger.error("Despacho PDF error: %s", e)
            self._send_error(500, str(e))

    def _api_generate_cotizacion(self, vendor_id):
        """POST /api/documents/cotizacion — Generate price list PDF and send to chat."""
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.enums import TA_CENTER
        from database import get_vendedor, get_products
        from utils import format_cop

        try:
            vendedor = get_vendedor(vendor_id)
            products = get_products(vendor_id)
            priced = [p for p in products if p.get('precio_venta', 0) > 0]

            if not priced:
                self._send_error(400, "No hay productos con precio configurado")
                return

            nombre = vendedor['nombre_negocio'] if vendedor else 'Mi Negocio'
            today_str = datetime.now().strftime("%d/%m/%Y")

            buffer = io.BytesIO()
            page_w, page_h = 140 * mm, 200 * mm
            doc = SimpleDocTemplate(
                buffer, pagesize=(page_w, page_h),
                leftMargin=10*mm, rightMargin=10*mm,
                topMargin=10*mm, bottomMargin=10*mm,
            )

            styles = getSampleStyleSheet()
            brand_blue = colors.Color(0.1, 0.3, 0.6)
            brand_bg = colors.Color(0.85, 0.9, 1.0)

            title_style = ParagraphStyle("PT", parent=styles["Title"], fontSize=14, alignment=TA_CENTER, fontName="Helvetica-Bold")
            sub_style = ParagraphStyle("PS", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER, textColor=colors.gray)
            footer_style = ParagraphStyle("PF", parent=styles["Normal"], fontSize=7, alignment=TA_CENTER, textColor=colors.gray, fontName="Helvetica-Oblique")

            elements = []
            elements.append(Paragraph(f"<b>{nombre}</b>", title_style))
            elements.append(Spacer(1, 3*mm))
            elements.append(Paragraph("<b>LISTA DE PRECIOS</b>", ParagraphStyle("PLT", parent=styles["Title"], fontSize=16, alignment=TA_CENTER, textColor=brand_blue)))
            elements.append(Paragraph(f"Vigente: {today_str}", sub_style))
            elements.append(Spacer(1, 5*mm))

            table_data = [["Producto", "Presentacion", "Precio Unitario"]]
            for p in priced:
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

            # Viral footer
            viral_style = ParagraphStyle("CViral", parent=styles["Normal"], fontSize=6, textColor=colors.Color(0.4, 0.4, 0.4), fontName="Helvetica-Oblique", alignment=TA_CENTER, spaceBefore=8*mm)
            elements.append(Paragraph(VIRAL_FOOTER, viral_style))

            doc.build(elements)
            buffer.seek(0)

            safe_name = nombre.replace(" ", "_")
            filename = f"Precios_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
            caption = f"Lista de Precios - {nombre} - {today_str}"

            sent = self._send_pdf_to_telegram(vendor_id, buffer, filename, caption)
            if sent:
                self._json_response({"ok": True, "message": "PDF enviado al chat", "filename": filename})
            else:
                self._send_error(500, "No se pudo enviar el PDF al chat")
        except Exception as e:
            logger.error("Cotizacion PDF error: %s", e)
            self._send_error(500, str(e))

    def _api_generate_backup(self, vendor_id):
        """POST /api/documents/backup — Generate backup JSON and send to chat."""
        from database import get_backup_data
        try:
            backup = get_backup_data(vendor_id)
            text = json.dumps(backup, default=str, ensure_ascii=False, indent=2)
            pdf_buffer = io.BytesIO(text.encode('utf-8'))

            today_str = date.today().isoformat()
            filename = f"controlia_backup_{today_str}.json"
            caption = f"Respaldo ControlIA - {today_str}"

            # Send JSON file directly (not PDF)
            url = f"https://api.telegram.org/bot{TOKEN}/sendDocument"
            boundary = '----FormBoundary7MA4YWxkTrZu0gW'
            file_data = pdf_buffer.getvalue()

            body_parts = []
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Disposition: form-data; name="chat_id"')
            body_parts.append(b'')
            body_parts.append(str(vendor_id).encode())
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(b'Content-Disposition: form-data; name="caption"')
            body_parts.append(b'')
            body_parts.append(caption.encode('utf-8'))
            body_parts.append(f'--{boundary}'.encode())
            body_parts.append(f'Content-Disposition: form-data; name="document"; filename="{filename}"'.encode())
            body_parts.append(b'Content-Type: application/json')
            body_parts.append(b'')
            body_parts.append(file_data)
            body_parts.append(f'--{boundary}--'.encode())

            body = b'\r\n'.join(body_parts)
            req = urllib.request.Request(
                url, data=body,
                headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                if result.get('ok'):
                    self._json_response({"ok": True, "message": "Respaldo enviado al chat"})
                else:
                    self._send_error(500, "No se pudo enviar el respaldo")
        except Exception as e:
            logger.error("Backup send error: %s", e)
            self._send_error(500, str(e))

    # ── MERCADO PAGO WEBHOOK (HMAC Verified) ──

    def _webhook_mercadopago(self):
        """Process MercadoPago IPN webhook with HMAC signature verification.
        Activates vendor subscription on successful payment."""
        from database import update_subscription
        from config import MERCADOPAGO_ACCESS_TOKEN

        body = self._read_json_body()

        # Always respond 200 to MercadoPago (they retry on non-200)
        if not body:
            self.send_response(200)
            self.end_headers()
            return

        # ── HMAC SIGNATURE VERIFICATION ──
        if MERCADOPAGO_WEBHOOK_SECRET:
            x_signature = self.headers.get('x-signature', '')
            x_request_id = self.headers.get('x-request-id', '')

            # Parse ts and v1 from x-signature header
            # Format: "ts=TIMESTAMP,v1=HASH"
            sig_parts = {}
            for part in x_signature.split(','):
                if '=' in part:
                    k, v = part.strip().split('=', 1)
                    sig_parts[k] = v

            ts = sig_parts.get('ts', '')
            received_hash = sig_parts.get('v1', '')

            if ts and received_hash:
                # Build the manifest string for HMAC
                data_id = body.get('data', {}).get('id', '')
                manifest = f"id:{data_id};request-id:{x_request_id};ts:{ts};"
                expected_hash = hmac.new(
                    MERCADOPAGO_WEBHOOK_SECRET.encode(),
                    manifest.encode(),
                    hashlib.sha256,
                ).hexdigest()

                if not hmac.compare_digest(expected_hash, received_hash):
                    logger.warning(
                        "MercadoPago webhook HMAC mismatch — REJECTED. "
                        "Expected: %s, Received: %s",
                        expected_hash[:16], received_hash[:16],
                    )
                    self._json_response({"error": "Invalid signature"}, 403)
                    return

                logger.info("MercadoPago webhook HMAC verified successfully")
            else:
                logger.warning("MercadoPago webhook missing signature components")
        else:
            logger.warning("MERCADOPAGO_WEBHOOK_SECRET not configured — skipping HMAC")

        # ── PROCESS PAYMENT ──
        action = body.get('action', '')
        topic = body.get('type', body.get('topic', ''))
        data_id = body.get('data', {}).get('id', '')

        logger.info(
            "MercadoPago webhook: action=%s, type=%s, data_id=%s",
            action, topic, data_id,
        )

        # Only process approved payments
        if action == 'payment.created' or topic == 'payment':
            if data_id and MERCADOPAGO_ACCESS_TOKEN:
                try:
                    # Fetch payment details from MercadoPago API
                    payment_url = f"https://api.mercadopago.com/v1/payments/{data_id}"
                    req = urllib.request.Request(
                        payment_url,
                        headers={"Authorization": f"Bearer {MERCADOPAGO_ACCESS_TOKEN}"},
                    )
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        payment = json.loads(resp.read())

                    if payment.get('status') == 'approved':
                        # Extract vendor_id from external_reference
                        ext_ref = payment.get('external_reference', '')
                        amount = payment.get('transaction_amount', 0)

                        if ext_ref:
                            vendor_id = int(ext_ref)
                            new_expiry = update_subscription(vendor_id, days=30)
                            logger.info(
                                "PAYMENT APPROVED — Vendor %s activated until %s "
                                "(Amount: $%s COP)",
                                vendor_id, new_expiry, amount,
                            )

                            # Notify vendor via Telegram
                            try:
                                msg = (
                                    f"\u2705 <b>Pago confirmado!</b>\n\n"
                                    f"Monto: ${amount:,.0f} COP\n"
                                    f"Tu suscripcion esta activa hasta: <b>{new_expiry}</b>\n\n"
                                    f"Gracias por confiar en ControlIA \U0001F680"
                                )
                                notify_url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
                                notify_data = json.dumps({
                                    "chat_id": vendor_id,
                                    "text": msg,
                                    "parse_mode": "HTML",
                                }).encode()
                                notify_req = urllib.request.Request(
                                    notify_url,
                                    data=notify_data,
                                    headers={"Content-Type": "application/json"},
                                )
                                urllib.request.urlopen(notify_req, timeout=10)
                            except Exception as e:
                                logger.error("Failed to notify vendor %s: %s", vendor_id, e)
                        else:
                            logger.warning("Payment approved but no external_reference")
                    else:
                        logger.info("Payment status: %s (not approved)", payment.get('status'))

                except Exception as e:
                    logger.error("Error processing MercadoPago payment: %s", e)

        self._json_response({"status": "received"})

    # ── WHATSAPP DEEP LINK API ──

    def _route_whatsapp_get(self, vendor_id, path):
        """Route WhatsApp API requests."""
        # /api/whatsapp/cotizacion/{client_id}
        # /api/whatsapp/cobro/{client_id}
        parts = path.rstrip('/').split('/')
        # Expected: ['', 'api', 'whatsapp', 'cotizacion', '123']
        if len(parts) < 5:
            self._send_error(400, "Client ID required")
            return

        action = parts[3]  # cotizacion or cobro
        client_id = parts[4]

        try:
            client_id = int(client_id)
        except ValueError:
            self._send_error(400, "Invalid client ID")
            return

        if action == 'cotizacion':
            self._api_whatsapp_cotizacion(vendor_id, client_id)
        elif action == 'cobro':
            self._api_whatsapp_cobro(vendor_id, client_id)
        else:
            self._send_error(404, "Unknown WhatsApp action")

    def _format_phone_co(self, phone):
        """Normalize Colombian phone to international format (573XXXXXXXXX)."""
        if not phone:
            return None
        phone = phone.strip().replace(' ', '').replace('-', '').replace('+', '')
        if phone.startswith('57') and len(phone) == 12:
            return phone  # Already international
        if phone.startswith('3') and len(phone) == 10:
            return '57' + phone  # Add country code
        if phone.startswith('0'):
            return '57' + phone[1:]  # Remove leading 0, add 57
        return '57' + phone  # Default: prepend 57

    def _api_whatsapp_cotizacion(self, vendor_id, client_id):
        """GET /api/whatsapp/cotizacion/{client_id} — Generate WhatsApp price list link."""
        from database import get_vendedor, get_client, get_products
        from utils import format_cop

        try:
            vendedor = get_vendedor(vendor_id)
            client = get_client(client_id, vendor_id)
            products = get_products(vendor_id)
            priced = [p for p in products if p.get('precio_venta', 0) > 0]

            if not client:
                self._send_error(404, "Cliente no encontrado")
                return
            if not client.get('telefono'):
                self._send_error(400, "El cliente no tiene telefono registrado")
                return
            if not priced:
                self._send_error(400, "No hay productos con precio configurado")
                return

            nombre_negocio = vendedor['nombre_negocio'] if vendedor else 'Mi Negocio'
            client_name = client.get('nombre', 'Cliente')
            phone = self._format_phone_co(client['telefono'])

            # Build price list message
            lines = []
            lines.append(f"Hola {client_name}! Le saluda {nombre_negocio}.")
            lines.append("")
            lines.append("Le comparto nuestra lista de precios:")
            lines.append("")
            for i, p in enumerate(priced, 1):
                lines.append(f"{i}. {p['nombre']} — {format_cop(p['precio_venta'])}")
            lines.append("")
            lines.append("Hagame su pedido y se lo llevo!")
            lines.append(f"\n{VIRAL_FOOTER}")

            message = '\n'.join(lines)
            wa_url = f"https://wa.me/{phone}?text={urllib.parse.quote(message)}"

            self._json_response({
                "ok": True,
                "url": wa_url,
                "client_name": client_name,
                "phone": phone,
                "products_count": len(priced),
            })
        except Exception as e:
            logger.error("WhatsApp cotizacion error: %s", e)
            self._send_error(500, str(e))

    def _api_whatsapp_cobro(self, vendor_id, client_id):
        """GET /api/whatsapp/cobro/{client_id} — Generate WhatsApp payment reminder link."""
        from database import get_vendedor, get_client, get_orders
        from utils import format_cop

        try:
            vendedor = get_vendedor(vendor_id)
            client = get_client(client_id, vendor_id)

            if not client:
                self._send_error(404, "Cliente no encontrado")
                return
            if not client.get('telefono'):
                self._send_error(400, "El cliente no tiene telefono registrado")
                return

            nombre_negocio = vendedor['nombre_negocio'] if vendedor else 'Mi Negocio'
            client_name = client.get('nombre', 'Cliente')
            phone = self._format_phone_co(client['telefono'])

            # Get unpaid orders for this client
            all_orders = get_orders(vendor_id)
            unpaid = [o for o in all_orders
                      if o.get('cliente_id') == client_id
                      and o.get('estado_pago') == 'Pendiente']

            if not unpaid:
                self._send_error(400, "Este cliente no tiene deudas pendientes")
                return

            total = sum(o['cantidad'] * o['precio_venta'] for o in unpaid)

            lines = []
            lines.append(f"Hola {client_name}, le saluda {nombre_negocio}.")
            lines.append("")
            lines.append("Le escribo para recordarle su cuenta pendiente:")
            lines.append("")
            for o in unpaid:
                subtotal = o['cantidad'] * o['precio_venta']
                lines.append(f"- {o['producto']} x{o['cantidad']} = {format_cop(subtotal)}")
            lines.append("")
            lines.append(f"*TOTAL PENDIENTE: {format_cop(total)}*")
            lines.append("")
            lines.append("Le agradezco si puede ponerse al dia. Cualquier duda me avisa!")

            message = '\n'.join(lines)
            wa_url = f"https://wa.me/{phone}?text={urllib.parse.quote(message)}"

            self._json_response({
                "ok": True,
                "url": wa_url,
                "client_name": client_name,
                "phone": phone,
                "total_debt": total,
                "orders_count": len(unpaid),
            })
        except Exception as e:
            logger.error("WhatsApp cobro error: %s", e)
            self._send_error(500, str(e))

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
