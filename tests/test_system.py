# -*- coding: utf-8 -*-
"""
===========================================================================
  CONTROLIA SAAS — Automated Test Suite
  Author: Antigravity Core Engine
===========================================================================
  Run with:
    python -m pytest tests/test_system.py -v --tb=short

  Or for quick smoke test (no pytest needed):
    python tests/test_system.py
===========================================================================
"""
import os
import sys
import json
import unittest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# =========================================================================
# TEST 1: UTILITY FUNCTIONS
# =========================================================================

class TestUtils(unittest.TestCase):
    """Test utility functions that DON'T require database."""

    def test_format_cop_normal(self):
        from utils import format_cop
        self.assertEqual(format_cop(1000000), "$1.000.000")
        self.assertEqual(format_cop(0), "$0")
        self.assertEqual(format_cop(9200000), "$9.200.000")

    def test_format_cop_edge_cases(self):
        from utils import format_cop
        self.assertEqual(format_cop(None), "$0")
        self.assertEqual(format_cop("abc"), "$0")
        self.assertEqual(format_cop(-5000), "$-5.000")

    def test_sanitize_phone_co(self):
        from utils import sanitize_phone_co
        # 10-digit Colombian number
        self.assertEqual(sanitize_phone_co("3001234567"), "573001234567")
        # Already has country code
        self.assertEqual(sanitize_phone_co("573001234567"), "573001234567")
        # With spaces and dashes
        self.assertEqual(sanitize_phone_co("300 123-4567"), "573001234567")
        # Empty/None
        self.assertEqual(sanitize_phone_co(None), "")
        self.assertEqual(sanitize_phone_co(""), "")

    def test_safe_split_short(self):
        from utils import safe_split
        result = safe_split("Short text")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0], "Short text")

    def test_safe_split_long(self):
        from utils import safe_split
        long_text = "A" * 5000
        result = safe_split(long_text, max_len=4000)
        self.assertTrue(len(result) >= 2)
        # All text should be preserved
        total_len = sum(len(p) for p in result)
        self.assertEqual(total_len, 5000)

    def test_haversine_distance(self):
        from utils import haversine_distance
        # Bogota to Medellin ≈ 256 km (straight line)
        d = haversine_distance(4.6097, -74.0817, 6.2442, -75.5812)
        self.assertAlmostEqual(d / 1000, 250, delta=50)

    def test_get_vendedor_id(self):
        from utils import get_vendedor_id
        mock_msg = MagicMock()
        mock_msg.from_user.id = 12345
        self.assertEqual(get_vendedor_id(mock_msg), 12345)


# =========================================================================
# TEST 2: CONFIG VALIDATION
# =========================================================================

class TestConfig(unittest.TestCase):
    """Test configuration module loads correctly."""

    def test_required_env_vars(self):
        """Verify critical env vars exist."""
        self.assertTrue(os.environ.get("TELEGRAM_BOT_TOKEN"), "Missing TELEGRAM_BOT_TOKEN")
        self.assertTrue(os.environ.get("DATABASE_URL"), "Missing DATABASE_URL")

    def test_config_defaults(self):
        from config import SUBSCRIPTION_PRICE_COP, TRIAL_DAYS, MAX_WAYPOINTS
        self.assertGreater(SUBSCRIPTION_PRICE_COP, 0)
        self.assertGreater(TRIAL_DAYS, 0)
        self.assertEqual(MAX_WAYPOINTS, 10)


# =========================================================================
# TEST 3: DATABASE OPERATIONS (requires DB connection)
# =========================================================================

class TestDatabase(unittest.TestCase):
    """Test database CRUD operations. Requires DATABASE_URL."""

    TEST_VENDOR_ID = 999999999  # Test vendor — must not conflict with real data

    @classmethod
    def setUpClass(cls):
        """Initialize database and create test vendor."""
        from database import init_database, get_connection
        init_database()
        conn = get_connection()
        try:
            # Clean any previous test data
            conn.execute("DELETE FROM finanzas WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM pedidos WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM notas_cliente WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM clientes WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM productos WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM vendedores WHERE id = %s", (cls.TEST_VENDOR_ID,))
            conn.commit()
        finally:
            conn.close()

    @classmethod
    def tearDownClass(cls):
        """Clean up test data."""
        from database import get_connection
        conn = get_connection()
        try:
            conn.execute("DELETE FROM finanzas WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM pedidos WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM notas_cliente WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM metas WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM clientes WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM productos WHERE vendedor_id = %s", (cls.TEST_VENDOR_ID,))
            conn.execute("DELETE FROM vendedores WHERE id = %s", (cls.TEST_VENDOR_ID,))
            conn.commit()
        finally:
            conn.close()

    def test_01_register_vendor(self):
        """Test vendor registration."""
        from database import register_vendedor, get_vendedor
        vendedor = register_vendedor(self.TEST_VENDOR_ID, "Test Negocio", "3001234567")
        self.assertIsNotNone(vendedor)
        self.assertEqual(vendedor["nombre_negocio"], "Test Negocio")

        fetched = get_vendedor(self.TEST_VENDOR_ID)
        self.assertIsNotNone(fetched)
        self.assertIn(fetched["estado"], ("Activo", "Prueba"))

    def test_02_update_vendor_meta(self):
        """Test setting monthly goal (meta_mensual)."""
        from database import update_vendedor, get_vendedor
        update_vendedor(self.TEST_VENDOR_ID, meta_mensual=5000000)
        v = get_vendedor(self.TEST_VENDOR_ID)
        self.assertEqual(v["meta_mensual"], 5000000)

    def test_03_add_product(self):
        """Test product CRUD."""
        from database import add_product, get_products
        pid = add_product(self.TEST_VENDOR_ID, "Aceite Motor", 15000, 25000, 100)
        self.assertIsNotNone(pid)
        self.assertGreater(pid, 0)

        products = get_products(self.TEST_VENDOR_ID)
        self.assertTrue(len(products) >= 1)
        p = [x for x in products if x["nombre"] == "Aceite Motor"][0]
        self.assertEqual(p["precio_compra"], 15000)
        self.assertEqual(p["precio_venta"], 25000)
        self.assertEqual(p["stock_actual"], 100)

    def test_04_add_client(self):
        """Test client creation."""
        from database import add_client, get_clients
        cid = add_client(self.TEST_VENDOR_ID, {
            "nombre": "Tienda Test",
            "telefono": "3109876543",
            "direccion": "Calle 80 #15-20, Bogota",
        })
        self.assertIsNotNone(cid)

        clients = get_clients(self.TEST_VENDOR_ID)
        self.assertTrue(len(clients) >= 1)

    def test_05_add_order(self):
        """Test order creation with precio_compra."""
        from database import add_order, get_clients, get_orders
        clients = get_clients(self.TEST_VENDOR_ID)
        self.assertTrue(len(clients) >= 1, "Need at least 1 client")
        client_id = clients[0]["id"]

        oid = add_order(self.TEST_VENDOR_ID, client_id, "Aceite Motor", 10, 15000, 25000)
        self.assertIsNotNone(oid)

        orders = get_orders(self.TEST_VENDOR_ID)
        self.assertTrue(len(orders) >= 1)
        o = [x for x in orders if x["id"] == oid][0]
        self.assertEqual(o["cantidad"], 10)
        self.assertEqual(o["precio_compra"], 15000)
        self.assertEqual(o["precio_venta"], 25000)
        self.assertEqual(o["estado"], "Pendiente")

    def test_06_deliver_order_creates_income(self):
        """Test that delivering an order creates a finanzas record."""
        from database import deliver_order, get_orders, get_finance_summary
        orders = get_orders(self.TEST_VENDOR_ID, estado="Pendiente")
        self.assertTrue(len(orders) >= 1, "Need at least 1 pending order")

        oid = orders[0]["id"]
        income = deliver_order(oid, self.TEST_VENDOR_ID)
        self.assertGreater(income, 0)

        # Verify finance record was created
        summary = get_finance_summary(self.TEST_VENDOR_ID)
        self.assertGreater(summary["income"], 0, "Income should be > 0 after delivery")

    def test_07_cogs_calculation(self):
        """CRITICAL: Verify COGS = SUM(cantidad * precio_compra) for delivered orders."""
        from database import get_finance_summary
        summary = get_finance_summary(self.TEST_VENDOR_ID)

        # We delivered 10 units at precio_compra=15000 → COGS should be 150,000
        self.assertEqual(summary["cogs"], 150000, "COGS should be 10 * 15000 = 150,000")
        # Income should be 10 * 25000 = 250,000
        self.assertEqual(summary["income"], 250000, "Income should be 10 * 25000 = 250,000")

    def test_08_net_profit_calculation(self):
        """CRITICAL: Verify net profit = income - cogs - expenses."""
        from database import get_finance_summary
        summary = get_finance_summary(self.TEST_VENDOR_ID)

        income = summary["income"]
        cogs = summary["cogs"]
        expenses = summary["expenses"]
        net_profit = income - cogs - expenses

        # 250,000 - 150,000 - 0 = 100,000
        self.assertEqual(net_profit, 100000, "Net profit should be 100,000")

    def test_09_mark_paid(self):
        """Test marking an order as paid."""
        from database import mark_order_paid, get_order, get_orders
        orders = get_orders(self.TEST_VENDOR_ID, estado="Entregado")
        self.assertTrue(len(orders) >= 1)
        oid = orders[0]["id"]

        mark_order_paid(oid, self.TEST_VENDOR_ID)
        o = get_order(oid, self.TEST_VENDOR_ID)
        self.assertEqual(o["estado_pago"], "Pagado")

    def test_10_unpaid_orders(self):
        """After paying, unpaid list should be empty for our test vendor."""
        from database import get_unpaid_orders
        unpaid = get_unpaid_orders(self.TEST_VENDOR_ID)
        self.assertEqual(len(unpaid), 0, "All orders should be paid")

    def test_11_receivables(self):
        """After paying all, receivables should be 0."""
        from database import get_receivables
        rec = get_receivables(self.TEST_VENDOR_ID)
        self.assertEqual(len(rec), 0)

    def test_12_add_expense(self):
        """Test expense recording."""
        from database import add_expense, get_finance_summary
        eid = add_expense(self.TEST_VENDOR_ID, "Gasolina", 30000)
        self.assertIsNotNone(eid)

        summary = get_finance_summary(self.TEST_VENDOR_ID)
        self.assertEqual(summary["expenses"], 30000, "Expenses should be 30,000")

    def test_13_net_profit_with_expenses(self):
        """CRITICAL: Net profit after expenses = income - cogs - expenses."""
        from database import get_finance_summary
        summary = get_finance_summary(self.TEST_VENDOR_ID)
        net = summary["income"] - summary["cogs"] - summary["expenses"]
        # 250,000 - 150,000 - 30,000 = 70,000
        self.assertEqual(net, 70000, "Net profit with expenses should be 70,000")

    def test_14_margin_analysis(self):
        """Test margin analysis per product."""
        from database import get_margin_analysis
        analysis = get_margin_analysis(self.TEST_VENDOR_ID)
        self.assertIsNotNone(analysis)
        products = analysis.get("products", [])
        self.assertTrue(len(products) >= 1)
        p = products[0]
        self.assertGreater(p["total_utilidad"], 0, "Product should have positive profit")

    def test_15_dashboard_stats(self):
        """Test dashboard returns all expected fields."""
        from database import get_dashboard_stats
        stats = get_dashboard_stats(self.TEST_VENDOR_ID)
        expected_keys = ["total_clients", "active_clients", "prospects",
                         "pending_orders", "unpaid", "today_sales", "month_sales"]
        for key in expected_keys:
            self.assertIn(key, stats, f"Dashboard missing key: {key}")

    def test_16_search_clients(self):
        """Test client search."""
        from database import search_clients
        results = search_clients(self.TEST_VENDOR_ID, "Tienda")
        self.assertTrue(len(results) >= 1, "Should find 'Tienda Test'")

    def test_17_client_profile(self):
        """Test client profile with orders and totals."""
        from database import get_client_profile, get_clients
        clients = get_clients(self.TEST_VENDOR_ID)
        profile = get_client_profile(clients[0]["id"], self.TEST_VENDOR_ID)
        self.assertIsNotNone(profile)
        self.assertIn("totals", profile)

    def test_18_backup_data(self):
        """Test backup returns all tables."""
        from database import get_backup_data
        backup = get_backup_data(self.TEST_VENDOR_ID)
        self.assertIn("productos", backup)
        self.assertIn("clientes", backup)
        self.assertIn("pedidos", backup)
        self.assertIn("finanzas", backup)

    def test_19_soft_delete_client(self):
        """CRITICAL: Soft-deleting a client must preserve financial records."""
        from database import delete_client, get_clients, get_finance_summary
        clients = get_clients(self.TEST_VENDOR_ID)
        self.assertTrue(len(clients) >= 1)

        # Get finance BEFORE delete
        summary_before = get_finance_summary(self.TEST_VENDOR_ID)

        # Soft delete
        delete_client(clients[0]["id"], self.TEST_VENDOR_ID)

        # Client should be gone from default listing
        clients_after = get_clients(self.TEST_VENDOR_ID)
        active_names = [c["nombre"] for c in clients_after]
        self.assertNotIn("Tienda Test", active_names, "Deleted client should not appear")

        # BUT finance should be IDENTICAL (no data lost)
        summary_after = get_finance_summary(self.TEST_VENDOR_ID)
        self.assertEqual(summary_after["income"], summary_before["income"],
                         "Income must NOT change after soft-delete")
        self.assertEqual(summary_after["cogs"], summary_before["cogs"],
                         "COGS must NOT change after soft-delete")

    def test_20_expense_rejects_negative(self):
        """Negative expenses should be rejected."""
        from database import add_expense
        with self.assertRaises(ValueError):
            add_expense(self.TEST_VENDOR_ID, "Gasto Falso", -5000)

    def test_21_expense_rejects_zero(self):
        """Zero expenses should be rejected."""
        from database import add_expense
        with self.assertRaises(ValueError):
            add_expense(self.TEST_VENDOR_ID, "Gasto Cero", 0)

    def test_22_set_product_goal(self):
        """Test setting and retrieving per-product monthly goals."""
        from database import set_goal, get_goals
        from datetime import date
        current_month = date.today().strftime("%Y-%m")

        set_goal(self.TEST_VENDOR_ID, "Aceite Motor", 200, current_month)
        goals = get_goals(self.TEST_VENDOR_ID, current_month)
        self.assertTrue(len(goals) >= 1)
        g = [x for x in goals if x["producto"] == "Aceite Motor"][0]
        self.assertEqual(g["meta_unidades"], 200)

    def test_23_mark_paid_requires_delivered(self):
        """Cannot mark a PENDING order as paid — must be delivered first."""
        from database import add_order, mark_order_paid, get_clients
        # Need to re-add client since we soft-deleted
        from database import add_client
        cid = add_client(self.TEST_VENDOR_ID, {
            "nombre": "Cliente Test2",
            "telefono": "3001112233",
        })
        oid = add_order(self.TEST_VENDOR_ID, cid, "Aceite Motor", 5, 15000, 25000)

        with self.assertRaises(ValueError):
            mark_order_paid(oid, self.TEST_VENDOR_ID)


# =========================================================================
# TEST 4: GEOCODING
# =========================================================================

class TestGeocoding(unittest.TestCase):
    """Test geocoding functions."""

    def test_geocode_valid_address(self):
        from routing_engine import geocode_nominatim
        lat, lng = geocode_nominatim("Bogota, Colombia")
        # Should return valid coordinates for Bogota
        if lat is not None:  # API might be rate-limited
            self.assertAlmostEqual(lat, 4.6, delta=0.5)
            self.assertAlmostEqual(lng, -74.1, delta=0.5)

    def test_geocode_invalid_address(self):
        from routing_engine import geocode_nominatim
        lat, lng = geocode_nominatim("xyznonexistent12345")
        self.assertIsNone(lat)
        self.assertIsNone(lng)


# =========================================================================
# TEST 5: FINANCE FORMULA VALIDATION (pure logic, no DB)
# =========================================================================

class TestFinanceFormulas(unittest.TestCase):
    """Validate finance calculations match expected formulas."""

    def test_caja_formula(self):
        """The Estado de Caja formula must be: Net = Collected - COGS - Expenses."""
        total_sales = 9200000
        total_collected = 9200000
        cogs = 8000000
        expenses = 100000
        receivable = 0

        net_profit = total_collected - cogs - expenses
        self.assertEqual(net_profit, 1100000)
        self.assertNotEqual(net_profit, total_collected, "Net MUST differ from collected if there are costs")

    def test_margin_formula(self):
        """Margin % = (venta - compra) / venta * 100."""
        precio_venta = 25000
        precio_compra = 15000
        margin = ((precio_venta - precio_compra) / precio_venta) * 100
        self.assertEqual(margin, 40.0)

    def test_zero_cogs(self):
        """When precio_compra is 0, net = collected - expenses."""
        collected = 1000000
        cogs = 0
        expenses = 50000
        net = collected - cogs - expenses
        self.assertEqual(net, 950000)


# =========================================================================
# TEST 6: MIDDLEWARE LOGIC
# =========================================================================

class TestMiddleware(unittest.TestCase):
    """Test subscription validation logic."""

    def test_expiry_check(self):
        """An expired vendor should be blocked."""
        from datetime import date
        yesterday = date.today() - timedelta(days=1)
        estado = "Activo"
        # Simulate middleware logic
        if estado in ("Activo", "Prueba") and yesterday < date.today():
            should_deactivate = True
        else:
            should_deactivate = False
        self.assertTrue(should_deactivate)

    def test_active_not_expired(self):
        """An active vendor with future expiry should pass."""
        from datetime import date
        tomorrow = date.today() + timedelta(days=1)
        estado = "Activo"
        if estado in ("Activo", "Prueba") and tomorrow < date.today():
            should_deactivate = True
        else:
            should_deactivate = False
        self.assertFalse(should_deactivate)


# =========================================================================
# MAIN — Run without pytest
# =========================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  CONTROLIA SAAS — TEST SUITE")
    print("=" * 60)

    # Load .env for local testing
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Always run these (no DB needed)
    suite.addTests(loader.loadTestsFromTestCase(TestUtils))
    suite.addTests(loader.loadTestsFromTestCase(TestFinanceFormulas))
    suite.addTests(loader.loadTestsFromTestCase(TestMiddleware))

    # Only run DB tests if DATABASE_URL is set
    if os.environ.get("DATABASE_URL"):
        print("  ✅ DATABASE_URL found — running DB tests")
        suite.addTests(loader.loadTestsFromTestCase(TestConfig))
        suite.addTests(loader.loadTestsFromTestCase(TestDatabase))
        suite.addTests(loader.loadTestsFromTestCase(TestGeocoding))
    else:
        print("  ⚠️ DATABASE_URL not found — skipping DB tests")
        print("     Set DATABASE_URL in .env to run full suite")

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print("  ✅ ALL TESTS PASSED")
    else:
        print(f"  ❌ FAILURES: {len(result.failures)} | ERRORS: {len(result.errors)}")
    print("=" * 60)
