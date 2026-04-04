# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Database Module
Multi-tenant PostgreSQL (Supabase) with Row Level Security (RLS).

SECURITY LAYERS:
  1. Application-level: Every function requires vendedor_id parameter.
  2. Database-level: RLS policies reject queries without matching vendedor_id.
  3. SQL Injection: All queries use parameterized placeholders (%s), never string concat.
"""
import psycopg
from psycopg.rows import dict_row
from datetime import date, timedelta
from config import DATABASE_URL, TRIAL_DAYS, logger


# =========================================================================
# DATE SAFETY — PostgreSQL returns date objects, not strings
# =========================================================================

def safe_parse_date(value):
    """Safely convert a value to datetime.date.
    PostgreSQL returns datetime.date objects, but some code paths
    may receive ISO strings ('2026-04-03'). This avoids the crash:
      fromisoformat() argument must be str, not datetime.date
    """
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


# =========================================================================
# CONNECTION POOL — reuse connections instead of creating new ones
# =========================================================================

from psycopg_pool import ConnectionPool

_pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=2,    # Keep 2 connections warm
    max_size=10,   # Scale up to 10 under load
    kwargs={"autocommit": False},
)


class PgConnection:
    """Wrapper around a pooled psycopg connection. Provides dict-row access
    and tenant-scoping via set_config(). On close(), the connection is
    returned to the pool — NOT destroyed."""

    def __init__(self, conn, pool_conn=None):
        self._conn = conn
        self._pool_conn = pool_conn  # Keep reference to return to pool

    def execute(self, query, params=None):
        """Execute query and return cursor with dict-like row access."""
        cursor = self._conn.cursor(row_factory=dict_row)
        cursor.execute(query, params)
        return cursor

    def set_tenant(self, vendedor_id):
        """Set the current tenant for RLS policies within this transaction.
        Uses set_config() because psycopg3 doesn't support params in SET."""
        self._conn.execute(
            "SELECT set_config('app.current_vendedor_id', %s, true)",
            (str(vendedor_id),),
        )

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        """Return connection to pool (reset state first)."""
        try:
            self._conn.rollback()  # Reset any pending transaction
        except Exception:
            pass
        if self._pool_conn:
            _pool.putconn(self._pool_conn)
        else:
            self._conn.close()


def get_connection(vendedor_id=None):
    """Get a connection from the pool. Sets tenant context if provided."""
    conn = _pool.getconn()
    wrapped = PgConnection(conn, pool_conn=conn)
    if vendedor_id is not None:
        wrapped.set_tenant(vendedor_id)
    return wrapped


# =========================================================================
# SCHEMA INITIALIZATION + RLS POLICIES
# =========================================================================

def init_database():
    """Create all tables and enable Row Level Security.
    Safe to call multiple times (IF NOT EXISTS)."""
    conn = psycopg.connect(DATABASE_URL)
    cursor = conn.cursor()

    # ── Allow the GUC variable used by RLS policies ──
    cursor.execute("""
        DO $$
        BEGIN
            PERFORM set_config('app.current_vendedor_id', '0', true);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;
    """)

    # ── 1. VENDEDORES (Core SaaS Table) ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS vendedores (
            id BIGINT PRIMARY KEY,
            nombre_negocio TEXT NOT NULL DEFAULT 'Mi Negocio',
            estado TEXT NOT NULL DEFAULT 'Inactivo',
            fecha_vencimiento DATE,
            telefono_soporte TEXT,
            fecha_registro TIMESTAMP DEFAULT NOW()
        )
    """)

    # ── 2. PRODUCTOS (Dynamic Catalog per Vendor) ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS productos (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL,
            precio_compra DOUBLE PRECISION DEFAULT 0,
            precio_venta DOUBLE PRECISION DEFAULT 0,
            stock_actual INTEGER DEFAULT 0,
            fecha_creacion DATE DEFAULT CURRENT_DATE
        )
    """)

    # ── 3. CLIENTES ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clientes (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL,
            telefono TEXT,
            direccion TEXT,
            tipo_negocio TEXT,
            estado TEXT DEFAULT 'Prospecto',
            fecha_registro DATE,
            ultima_interaccion DATE,
            latitud DOUBLE PRECISION,
            longitud DOUBLE PRECISION,
            dia_visita TEXT
        )
    """)

    # ── 4. PEDIDOS ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pedidos (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            cliente_id INTEGER NOT NULL REFERENCES clientes(id),
            producto TEXT NOT NULL,
            cantidad INTEGER NOT NULL,
            precio_compra DOUBLE PRECISION,
            precio_venta DOUBLE PRECISION,
            estado TEXT DEFAULT 'Pendiente',
            estado_pago TEXT DEFAULT 'Pendiente',
            fecha DATE
        )
    """)

    # ── 5. FINANZAS ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS finanzas (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            concepto TEXT,
            monto DOUBLE PRECISION NOT NULL,
            fecha DATE,
            pedido_id INTEGER REFERENCES pedidos(id)
        )
    """)

    # ── 6. NOTAS DE CLIENTE ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notas_cliente (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            cliente_id INTEGER NOT NULL REFERENCES clientes(id),
            texto TEXT NOT NULL,
            fecha DATE
        )
    """)

    # ── 7. METAS ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metas (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            producto TEXT NOT NULL,
            meta_unidades INTEGER NOT NULL DEFAULT 0,
            mes TEXT NOT NULL,
            fecha_creacion DATE
        )
    """)

    # ── 8. INVENTARIO ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventario (
            id SERIAL PRIMARY KEY,
            vendedor_id BIGINT NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
            producto TEXT NOT NULL,
            stock_actual INTEGER NOT NULL DEFAULT 0,
            stock_minimo INTEGER NOT NULL DEFAULT 0,
            ultima_actualizacion DATE
        )
    """)

    # ── INDEXES for multi-tenant query performance ──
    _create_indexes(cursor)

    # ── ROW LEVEL SECURITY ──
    _enable_rls(cursor)

    conn.commit()
    conn.close()
    logger.info("Database initialized — all tables and RLS policies ready.")


def _create_indexes(cursor):
    """Create indexes on vendedor_id columns for fast tenant-scoped queries."""
    index_definitions = [
        ("idx_productos_vendedor", "productos", "vendedor_id"),
        ("idx_clientes_vendedor", "clientes", "vendedor_id"),
        ("idx_pedidos_vendedor", "pedidos", "vendedor_id"),
        ("idx_finanzas_vendedor", "finanzas", "vendedor_id"),
        ("idx_notas_vendedor", "notas_cliente", "vendedor_id"),
        ("idx_metas_vendedor", "metas", "vendedor_id"),
        ("idx_inventario_vendedor", "inventario", "vendedor_id"),
    ]
    for idx_name, table, column in index_definitions:
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})"
        )


def _enable_rls(cursor):
    """Enable Row Level Security on all tenant-scoped tables.
    RLS policies use the session variable app.current_vendedor_id
    set via PgConnection.set_tenant(). This is the SECOND line of defense
    — the first is the application-level vendedor_id parameter in every function."""
    tenant_tables = ["productos", "clientes", "pedidos", "finanzas", "notas_cliente", "metas", "inventario"]

    for table in tenant_tables:
        # Enable RLS (idempotent)
        cursor.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

        # Force RLS even for table owner (defense-in-depth)
        cursor.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

        # Drop existing policy to avoid conflicts on re-run
        policy_name = f"tenant_isolation_{table}"
        cursor.execute(f"DROP POLICY IF EXISTS {policy_name} ON {table}")

        # Create policy: rows visible only when vendedor_id matches session variable
        # The COALESCE handles the case where the variable is not set (returns '0')
        cursor.execute(f"""
            CREATE POLICY {policy_name} ON {table}
            FOR ALL
            USING (
                vendedor_id = COALESCE(
                    NULLIF(current_setting('app.current_vendedor_id', true), ''),
                    '0'
                )::BIGINT
            )
            WITH CHECK (
                vendedor_id = COALESCE(
                    NULLIF(current_setting('app.current_vendedor_id', true), ''),
                    '0'
                )::BIGINT
            )
        """)

    logger.info("RLS policies applied to %d tables.", len(tenant_tables))


# =========================================================================
# VENDEDOR CRUD
# =========================================================================

def get_vendedor(vendedor_id):
    """Fetch a vendor by their Telegram chat_id. Returns dict or None."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM vendedores WHERE id = %s", (vendedor_id,)
        ).fetchone()
        return row
    finally:
        conn.close()


def register_vendedor(vendedor_id, nombre_negocio, telefono_soporte=""):
    """Register a new vendor with trial period. Returns the created record."""
    trial_end = date.today() + timedelta(days=TRIAL_DAYS)
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO vendedores (id, nombre_negocio, estado, fecha_vencimiento, telefono_soporte)
               VALUES (%s, %s, 'Prueba', %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (vendedor_id, nombre_negocio, trial_end, telefono_soporte),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM vendedores WHERE id = %s", (vendedor_id,)
        ).fetchone()
        return row
    finally:
        conn.close()


def update_vendedor(vendedor_id, **fields):
    """Update vendor fields. Only whitelisted columns are allowed."""
    allowed = {"nombre_negocio", "telefono_soporte", "estado", "fecha_vencimiento"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [vendedor_id]
    conn = get_connection()
    try:
        conn.execute(
            f"UPDATE vendedores SET {set_clause} WHERE id = %s", values
        )
        conn.commit()
    finally:
        conn.close()


def update_subscription(vendedor_id, days=30):
    """Extend subscription by N days from today. Activates the vendor."""
    new_expiry = date.today() + timedelta(days=days)
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE vendedores SET estado = 'Activo', fecha_vencimiento = %s WHERE id = %s",
            (new_expiry, vendedor_id),
        )
        conn.commit()
        logger.info("Subscription extended for vendor %s until %s", vendedor_id, new_expiry)
        return new_expiry
    finally:
        conn.close()


def is_subscription_active(vendedor_id):
    """Check if vendor has an active or trial subscription."""
    vendedor = get_vendedor(vendedor_id)
    if not vendedor:
        return False
    if vendedor["estado"] == "Inactivo":
        return False
    if vendedor["fecha_vencimiento"] and vendedor["fecha_vencimiento"] < date.today():
        # Auto-deactivate expired vendors
        _deactivate_vendor(vendedor_id)
        return False
    return True


def _deactivate_vendor(vendedor_id):
    """Mark vendor as inactive (internal use — called on expiry check)."""
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE vendedores SET estado = 'Inactivo' WHERE id = %s",
            (vendedor_id,),
        )
        conn.commit()
    finally:
        conn.close()


# =========================================================================
# PRODUCTOS (Dynamic Catalog)
# =========================================================================

def get_products(vendedor_id):
    """Get all products for a vendor."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT * FROM productos WHERE vendedor_id = %s ORDER BY nombre",
            (vendedor_id,),
        ).fetchall()
    finally:
        conn.close()


def get_product(product_id, vendedor_id):
    """Get a single product, enforcing tenant isolation."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT * FROM productos WHERE id = %s AND vendedor_id = %s",
            (product_id, vendedor_id),
        ).fetchone()
    finally:
        conn.close()


def add_product(vendedor_id, nombre, precio_compra=0, precio_venta=0, stock=0):
    """Add a product to a vendor's catalog. Returns the new product ID."""
    conn = get_connection(vendedor_id)
    try:
        cursor = conn.execute(
            """INSERT INTO productos (vendedor_id, nombre, precio_compra, precio_venta, stock_actual)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (vendedor_id, nombre, precio_compra, precio_venta, stock),
        )
        product_id = cursor.fetchone()["id"]
        conn.commit()
        return product_id
    finally:
        conn.close()


def update_product(product_id, vendedor_id, **fields):
    """Update product fields. Enforces tenant isolation."""
    allowed = {"nombre", "precio_compra", "precio_venta", "stock_actual"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [product_id, vendedor_id]
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            f"UPDATE productos SET {set_clause} WHERE id = %s AND vendedor_id = %s",
            values,
        )
        conn.commit()
        return True
    finally:
        conn.close()


def delete_product(product_id, vendedor_id):
    """Delete a product. Enforces tenant isolation."""
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            "DELETE FROM productos WHERE id = %s AND vendedor_id = %s",
            (product_id, vendedor_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# =========================================================================
# CLIENTES (Tenant-Isolated)
# =========================================================================

def get_clients(vendedor_id, estado=None):
    """Get all clients for a vendor, optionally filtered by estado."""
    conn = get_connection(vendedor_id)
    try:
        if estado:
            return conn.execute(
                "SELECT * FROM clientes WHERE vendedor_id = %s AND estado = %s ORDER BY nombre",
                (vendedor_id, estado),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM clientes WHERE vendedor_id = %s ORDER BY nombre",
            (vendedor_id,),
        ).fetchall()
    finally:
        conn.close()


def get_client(client_id, vendedor_id):
    """Get a single client, enforcing tenant isolation."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT * FROM clientes WHERE id = %s AND vendedor_id = %s",
            (client_id, vendedor_id),
        ).fetchone()
    finally:
        conn.close()


def add_client(vendedor_id, data):
    """Insert a new client. Returns the new client ID.
    data dict keys: nombre, telefono, direccion, tipo_negocio, latitud, longitud, dia_visita
    """
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        cursor = conn.execute(
            """INSERT INTO clientes
               (vendedor_id, nombre, telefono, direccion, tipo_negocio,
                estado, fecha_registro, ultima_interaccion, latitud, longitud, dia_visita)
               VALUES (%s, %s, %s, %s, %s, 'Prospecto', %s, %s, %s, %s, %s)
               RETURNING id""",
            (
                vendedor_id,
                data.get("nombre", ""),
                data.get("telefono"),
                data.get("direccion"),
                data.get("tipo_negocio"),
                today,
                today,
                data.get("latitud"),
                data.get("longitud"),
                data.get("dia_visita"),
            ),
        )
        client_id = cursor.fetchone()["id"]
        conn.commit()
        return client_id
    finally:
        conn.close()


def update_client(client_id, vendedor_id, **fields):
    """Update client fields. Enforces tenant isolation."""
    allowed = {
        "nombre", "telefono", "direccion", "tipo_negocio",
        "estado", "ultima_interaccion", "latitud", "longitud", "dia_visita",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [client_id, vendedor_id]
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            f"UPDATE clientes SET {set_clause} WHERE id = %s AND vendedor_id = %s",
            values,
        )
        conn.commit()
        return True
    finally:
        conn.close()


def delete_client(client_id, vendedor_id):
    """Delete a client and all related records. Enforces tenant isolation."""
    conn = get_connection(vendedor_id)
    try:
        # Cascade: finanzas → pedidos → notas → client
        conn.execute(
            "DELETE FROM finanzas WHERE pedido_id IN (SELECT id FROM pedidos WHERE cliente_id = %s AND vendedor_id = %s)",
            (client_id, vendedor_id),
        )
        conn.execute(
            "DELETE FROM notas_cliente WHERE cliente_id = %s AND vendedor_id = %s",
            (client_id, vendedor_id),
        )
        conn.execute(
            "DELETE FROM pedidos WHERE cliente_id = %s AND vendedor_id = %s",
            (client_id, vendedor_id),
        )
        conn.execute(
            "DELETE FROM clientes WHERE id = %s AND vendedor_id = %s",
            (client_id, vendedor_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def search_clients(vendedor_id, query_text):
    """Search clients by name (case-insensitive). Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT * FROM clientes WHERE vendedor_id = %s AND nombre ILIKE %s",
            (vendedor_id, f"%{query_text}%"),
        ).fetchall()
    finally:
        conn.close()


# =========================================================================
# PEDIDOS (Orders — Tenant-Isolated)
# =========================================================================

def add_order(vendedor_id, cliente_id, producto, cantidad, precio_compra, precio_venta):
    """Create a new order. Returns the order ID."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        # Verify client belongs to this vendor
        client = conn.execute(
            "SELECT id FROM clientes WHERE id = %s AND vendedor_id = %s",
            (cliente_id, vendedor_id),
        ).fetchone()
        if not client:
            raise ValueError(f"Client {cliente_id} not found for vendor {vendedor_id}")

        cursor = conn.execute(
            """INSERT INTO pedidos
               (vendedor_id, cliente_id, producto, cantidad, precio_compra, precio_venta, estado, estado_pago, fecha)
               VALUES (%s, %s, %s, %s, %s, %s, 'Pendiente', 'Pendiente', %s)
               RETURNING id""",
            (vendedor_id, cliente_id, producto, cantidad, precio_compra, precio_venta, today),
        )
        order_id = cursor.fetchone()["id"]

        # Activate client on first purchase
        conn.execute(
            "UPDATE clientes SET estado = 'Activo', ultima_interaccion = %s WHERE id = %s AND vendedor_id = %s",
            (today, cliente_id, vendedor_id),
        )
        conn.commit()
        return order_id
    finally:
        conn.close()


def get_orders(vendedor_id, estado=None):
    """Get orders with client names. Optionally filtered by status."""
    conn = get_connection(vendedor_id)
    try:
        if estado:
            return conn.execute(
                """SELECT p.*, c.nombre as cliente_nombre FROM pedidos p
                   JOIN clientes c ON p.cliente_id = c.id
                   WHERE p.vendedor_id = %s AND p.estado = %s
                   ORDER BY p.fecha DESC""",
                (vendedor_id, estado),
            ).fetchall()
        return conn.execute(
            """SELECT p.*, c.nombre as cliente_nombre FROM pedidos p
               JOIN clientes c ON p.cliente_id = c.id
               WHERE p.vendedor_id = %s ORDER BY p.fecha DESC""",
            (vendedor_id,),
        ).fetchall()
    finally:
        conn.close()


def get_order(order_id, vendedor_id):
    """Get a single order with client info. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            """SELECT p.*, c.nombre as cliente_nombre, c.direccion as cliente_dir,
                      c.telefono as cliente_tel
               FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
               WHERE p.id = %s AND p.vendedor_id = %s""",
            (order_id, vendedor_id),
        ).fetchone()
    finally:
        conn.close()


def deliver_order(order_id, vendedor_id):
    """Mark order as delivered + create income record. Returns the income amount."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        order = conn.execute(
            "SELECT * FROM pedidos WHERE id = %s AND vendedor_id = %s",
            (order_id, vendedor_id),
        ).fetchone()
        if not order:
            raise ValueError("Order not found")
        if order["estado"] == "Entregado":
            raise ValueError("Order already delivered")

        income = order["cantidad"] * order["precio_venta"]

        conn.execute(
            "UPDATE pedidos SET estado = 'Entregado' WHERE id = %s AND vendedor_id = %s",
            (order_id, vendedor_id),
        )
        conn.execute(
            """INSERT INTO finanzas (vendedor_id, tipo, concepto, monto, fecha, pedido_id)
               VALUES (%s, 'Ingreso', %s, %s, %s, %s)""",
            (vendedor_id, f"Venta pedido #{order_id} — {order['producto']}", income, today, order_id),
        )
        # Auto-deduct stock
        conn.execute(
            """UPDATE productos SET stock_actual = GREATEST(0, stock_actual - %s)
               WHERE vendedor_id = %s AND nombre = %s""",
            (order["cantidad"], vendedor_id, order["producto"]),
        )
        conn.execute(
            "UPDATE clientes SET ultima_interaccion = %s WHERE id = %s AND vendedor_id = %s",
            (today, order["cliente_id"], vendedor_id),
        )
        conn.commit()
        return income
    finally:
        conn.close()


def mark_order_paid(order_id, vendedor_id):
    """Mark order as paid. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            "UPDATE pedidos SET estado_pago = 'Pagado' WHERE id = %s AND vendedor_id = %s",
            (order_id, vendedor_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_unpaid_orders(vendedor_id):
    """Get delivered but unpaid orders with client info."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            """SELECT p.id, p.producto, p.cantidad, p.precio_venta, p.fecha,
                      c.nombre, c.telefono,
                      (p.cantidad * p.precio_venta) as total
               FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
               WHERE p.vendedor_id = %s AND p.estado = 'Entregado'
                 AND (p.estado_pago IS NULL OR p.estado_pago = 'Pendiente')
               ORDER BY p.fecha ASC""",
            (vendedor_id,),
        ).fetchall()
    finally:
        conn.close()


def get_last_order(cliente_id, vendedor_id):
    """Get the last order for a client. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            """SELECT producto, cantidad, precio_compra, precio_venta
               FROM pedidos WHERE cliente_id = %s AND vendedor_id = %s
               ORDER BY id DESC LIMIT 1""",
            (cliente_id, vendedor_id),
        ).fetchone()
    finally:
        conn.close()


def delete_order(order_id, vendedor_id):
    """Delete an order and related finance records. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            "DELETE FROM finanzas WHERE pedido_id = %s AND vendedor_id = %s",
            (order_id, vendedor_id),
        )
        conn.execute(
            "DELETE FROM pedidos WHERE id = %s AND vendedor_id = %s",
            (order_id, vendedor_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# =========================================================================
# FINANZAS (Finance — Tenant-Isolated)
# =========================================================================

def add_expense(vendedor_id, concepto, monto):
    """Record an expense. Returns the finance record ID."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        cursor = conn.execute(
            """INSERT INTO finanzas (vendedor_id, tipo, concepto, monto, fecha)
               VALUES (%s, 'Egreso', %s, %s, %s) RETURNING id""",
            (vendedor_id, concepto, monto, today),
        )
        record_id = cursor.fetchone()["id"]
        conn.commit()
        return record_id
    finally:
        conn.close()


def get_finance_summary(vendedor_id, date_from=None):
    """Get income, COGS, and expenses for a period. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        if date_from:
            income = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM finanzas WHERE vendedor_id = %s AND tipo = 'Ingreso' AND fecha >= %s",
                (vendedor_id, date_from),
            ).fetchone()["total"]
            cogs = conn.execute(
                "SELECT COALESCE(SUM(cantidad * precio_compra), 0) as total FROM pedidos WHERE vendedor_id = %s AND estado = 'Entregado' AND fecha >= %s",
                (vendedor_id, date_from),
            ).fetchone()["total"]
            expenses = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM finanzas WHERE vendedor_id = %s AND tipo = 'Egreso' AND fecha >= %s",
                (vendedor_id, date_from),
            ).fetchone()["total"]
        else:
            income = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM finanzas WHERE vendedor_id = %s AND tipo = 'Ingreso'",
                (vendedor_id,),
            ).fetchone()["total"]
            cogs = conn.execute(
                "SELECT COALESCE(SUM(cantidad * precio_compra), 0) as total FROM pedidos WHERE vendedor_id = %s AND estado = 'Entregado'",
                (vendedor_id,),
            ).fetchone()["total"]
            expenses = conn.execute(
                "SELECT COALESCE(SUM(monto), 0) as total FROM finanzas WHERE vendedor_id = %s AND tipo = 'Egreso'",
                (vendedor_id,),
            ).fetchone()["total"]
        return {"income": income, "cogs": cogs, "expenses": expenses}
    finally:
        conn.close()


def get_receivables(vendedor_id):
    """Get accounts receivable grouped by client. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            """SELECT c.id, c.nombre, c.telefono,
                      COUNT(p.id) as num_pedidos,
                      SUM(p.cantidad * p.precio_venta) as total_deuda,
                      MIN(p.fecha) as pedido_mas_antiguo
               FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
               WHERE p.vendedor_id = %s AND p.estado = 'Entregado'
                 AND (p.estado_pago IS NULL OR p.estado_pago = 'Pendiente')
               GROUP BY c.id ORDER BY total_deuda DESC""",
            (vendedor_id,),
        ).fetchall()
    finally:
        conn.close()


def get_margin_analysis(vendedor_id):
    """Get profit margin per product. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        products = conn.execute(
            """SELECT producto,
                      SUM(cantidad) as total_uds,
                      AVG(precio_compra) as avg_costo,
                      AVG(precio_venta) as avg_venta,
                      SUM(cantidad * precio_venta) as total_ventas,
                      SUM(cantidad * (precio_venta - precio_compra)) as total_utilidad
               FROM pedidos WHERE vendedor_id = %s AND estado = 'Entregado'
               GROUP BY producto ORDER BY total_utilidad DESC""",
            (vendedor_id,),
        ).fetchall()
        top_clients = conn.execute(
            """SELECT c.nombre,
                      SUM(p.cantidad * p.precio_venta) as total_ventas,
                      SUM(p.cantidad * (p.precio_venta - p.precio_compra)) as utilidad
               FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
               WHERE p.vendedor_id = %s AND p.estado = 'Entregado'
               GROUP BY c.id ORDER BY utilidad DESC LIMIT 5""",
            (vendedor_id,),
        ).fetchall()
        return {"products": products, "top_clients": top_clients}
    finally:
        conn.close()


def delete_finance_record(record_id, vendedor_id):
    """Delete a finance record. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            "DELETE FROM finanzas WHERE id = %s AND vendedor_id = %s",
            (record_id, vendedor_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()


# =========================================================================
# NOTAS (Client Notes — Tenant-Isolated)
# =========================================================================

def add_note(vendedor_id, cliente_id, texto):
    """Add a note to a client. Updates ultima_interaccion."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        conn.execute(
            "INSERT INTO notas_cliente (vendedor_id, cliente_id, texto, fecha) VALUES (%s, %s, %s, %s)",
            (vendedor_id, cliente_id, texto, today),
        )
        conn.execute(
            "UPDATE clientes SET ultima_interaccion = %s WHERE id = %s AND vendedor_id = %s",
            (today, cliente_id, vendedor_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_notes(cliente_id, vendedor_id, limit=3):
    """Get recent notes for a client. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT texto, fecha FROM notas_cliente WHERE cliente_id = %s AND vendedor_id = %s ORDER BY id DESC LIMIT %s",
            (cliente_id, vendedor_id, limit),
        ).fetchall()
    finally:
        conn.close()


# =========================================================================
# METAS (Sales Goals — Tenant-Isolated)
# =========================================================================

def get_goals(vendedor_id, mes):
    """Get sales goals for a specific month. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        return conn.execute(
            "SELECT * FROM metas WHERE vendedor_id = %s AND mes = %s ORDER BY producto",
            (vendedor_id, mes),
        ).fetchall()
    finally:
        conn.close()


def set_goal(vendedor_id, producto, meta_unidades, mes):
    """Set or update a monthly sales goal. Tenant-isolated."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        existing = conn.execute(
            "SELECT id FROM metas WHERE vendedor_id = %s AND producto = %s AND mes = %s",
            (vendedor_id, producto, mes),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE metas SET meta_unidades = %s, fecha_creacion = %s WHERE id = %s AND vendedor_id = %s",
                (meta_unidades, today, existing["id"], vendedor_id),
            )
        else:
            conn.execute(
                "INSERT INTO metas (vendedor_id, producto, meta_unidades, mes, fecha_creacion) VALUES (%s, %s, %s, %s, %s)",
                (vendedor_id, producto, meta_unidades, mes, today),
            )
        conn.commit()
    finally:
        conn.close()


# =========================================================================
# DASHBOARD STATS (Aggregated — Tenant-Isolated)
# =========================================================================

def get_dashboard_stats(vendedor_id):
    """Get quick stats for the /start dashboard. All tenant-isolated."""
    today = date.today().isoformat()
    conn = get_connection(vendedor_id)
    try:
        total_clients = conn.execute(
            "SELECT COUNT(*) as c FROM clientes WHERE vendedor_id = %s", (vendedor_id,)
        ).fetchone()["c"]
        active_clients = conn.execute(
            "SELECT COUNT(*) as c FROM clientes WHERE vendedor_id = %s AND estado = 'Activo'", (vendedor_id,)
        ).fetchone()["c"]
        prospects = conn.execute(
            "SELECT COUNT(*) as c FROM clientes WHERE vendedor_id = %s AND estado = 'Prospecto'", (vendedor_id,)
        ).fetchone()["c"]
        pending_orders = conn.execute(
            "SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = %s AND estado = 'Pendiente'", (vendedor_id,)
        ).fetchone()["c"]
        unpaid = conn.execute(
            "SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = %s AND estado = 'Entregado' AND (estado_pago IS NULL OR estado_pago = 'Pendiente')",
            (vendedor_id,),
        ).fetchone()["c"]
        today_sales = conn.execute(
            "SELECT COALESCE(SUM(cantidad * precio_venta), 0) as t FROM pedidos WHERE vendedor_id = %s AND fecha = %s",
            (vendedor_id, today),
        ).fetchone()["t"]
        return {
            "total_clients": total_clients,
            "active_clients": active_clients,
            "prospects": prospects,
            "pending_orders": pending_orders,
            "unpaid": unpaid,
            "today_sales": today_sales,
        }
    finally:
        conn.close()


def get_pipeline_stats(vendedor_id):
    """Get pipeline/funnel stats grouped by estado. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        states = conn.execute(
            """SELECT estado, COUNT(*) as c FROM clientes WHERE vendedor_id = %s
               GROUP BY estado ORDER BY
               CASE estado WHEN 'Prospecto' THEN 1 WHEN 'Activo' THEN 2 WHEN 'VIP' THEN 3 WHEN 'Inactivo' THEN 4 ELSE 5 END""",
            (vendedor_id,),
        ).fetchall()
        return states
    finally:
        conn.close()


def get_client_profile(client_id, vendedor_id):
    """Get full client profile with orders, totals, and notes. Tenant-isolated."""
    conn = get_connection(vendedor_id)
    try:
        client = conn.execute(
            "SELECT * FROM clientes WHERE id = %s AND vendedor_id = %s",
            (client_id, vendedor_id),
        ).fetchone()
        if not client:
            return None

        orders = conn.execute(
            """SELECT id, producto, cantidad, precio_venta, estado, estado_pago, fecha
               FROM pedidos WHERE cliente_id = %s AND vendedor_id = %s ORDER BY id DESC LIMIT 5""",
            (client_id, vendedor_id),
        ).fetchall()

        totals = conn.execute(
            """SELECT COALESCE(SUM(cantidad * precio_venta), 0) as total_vendido,
                      COALESCE(SUM(cantidad * (precio_venta - precio_compra)), 0) as total_utilidad,
                      COUNT(*) as num_pedidos
               FROM pedidos WHERE cliente_id = %s AND vendedor_id = %s""",
            (client_id, vendedor_id),
        ).fetchone()

        notes = conn.execute(
            "SELECT texto, fecha FROM notas_cliente WHERE cliente_id = %s AND vendedor_id = %s ORDER BY id DESC LIMIT 3",
            (client_id, vendedor_id),
        ).fetchall()

        return {
            "client": client,
            "orders": orders,
            "totals": totals,
            "notes": notes,
        }
    finally:
        conn.close()


def get_backup_data(vendedor_id):
    """Export all data for a specific vendor. Tenant-isolated.
    Uses 1 connection per table to avoid Supabase pooler timeout."""
    tables = ["clientes", "pedidos", "finanzas", "notas_cliente", "metas", "productos"]
    result = {}
    for table in tables:
        conn = get_connection(vendedor_id)
        try:
            rows = conn.execute(
                f"SELECT * FROM {table} WHERE vendedor_id = %s", (vendedor_id,)
            ).fetchall()
            result[table] = rows
        finally:
            conn.close()
    return result
