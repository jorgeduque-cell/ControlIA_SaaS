# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Finance Handler
Commands: /gasto, /caja, /cuentas_por_cobrar, /margen, /meta, /meta_set

V2 CHANGES:
  - is_admin() → @requiere_suscripcion(bot)
  - get_connection() → get_connection(vendedor_id)
  - PRODUCT_CATALOG → dynamic from DB (get_products)
  - Hard-coded branding → vendedor["nombre_negocio"]
  - costo_compra → precio_compra (schema match)
  - date.fromisoformat() → safe_parse_date()
"""
from telebot import types
from datetime import date, timedelta

from database import (
    get_connection, get_products, get_finance_summary,
    get_receivables, get_margin_analysis, get_goals, set_goal,
    add_expense, safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop, sanitize_phone_co
from config import logger


def register(bot):

    # =====================================================================
    # /gasto — Register expense
    # =====================================================================

    @bot.message_handler(commands=["gasto"])
    @requiere_suscripcion(bot)
    def cmd_expense(message):
        bot.send_message(message.chat.id, "📝 <b>Registro de Gasto</b>\n\nEscribe el <b>concepto</b> del gasto:")
        bot.register_next_step_handler(message, _step_expense_concept, bot, get_vendedor_id(message))

    def _step_expense_concept(message, bot, vendedor_id):
        try:
            concepto = (message.text or "").strip()
            if not concepto or concepto.startswith("/"):
                bot.send_message(message.chat.id, "⚠️ Escribe un concepto válido.")
                return
            bot.send_message(message.chat.id, "💲 Escribe el <b>monto</b> del gasto:")
            bot.register_next_step_handler(message, _step_expense_amount, bot, vendedor_id, concepto)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _step_expense_amount(message, bot, vendedor_id, concepto):
        try:
            raw = (message.text or "").strip().replace("$", "").replace(".", "").replace(",", ".")
            amount = float(raw)
            if amount <= 0:
                bot.send_message(message.chat.id, "❌ El monto debe ser mayor a $0.")
                return

            add_expense(vendedor_id, concepto, amount)

            bot.send_message(
                message.chat.id,
                f"✅ <b>Gasto registrado</b>\n\n"
                f"📋 Concepto: {concepto}\n"
                f"💸 Monto: <b>{format_cop(amount)}</b>",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ Monto inválido. Ingresa un número.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /caja — Income statement
    # =====================================================================

    @bot.message_handler(commands=["caja"])
    @requiere_suscripcion(bot)
    def cmd_cash_report(message):
        markup = types.InlineKeyboardMarkup(row_width=2)
        markup.row(
            types.InlineKeyboardButton("📅 Hoy", callback_data="caja:hoy"),
            types.InlineKeyboardButton("📆 Esta Semana", callback_data="caja:semana"),
        )
        markup.row(
            types.InlineKeyboardButton("🗓️ Este Mes", callback_data="caja:mes"),
            types.InlineKeyboardButton("📊 Histórico Total", callback_data="caja:total"),
        )
        bot.send_message(message.chat.id, "💼 <b>ESTADO DE RESULTADOS</b>\n\n¿Qué período?", reply_markup=markup)

    @bot.callback_query_handler(func=lambda call: call.data.startswith("caja:"))
    @requiere_suscripcion_callback(bot)
    def handle_caja_callback(call):
        try:
            bot.answer_callback_query(call.id)
            vendedor_id = call.from_user.id
            nombre_negocio = call.vendedor["nombre_negocio"]
            period = call.data.replace("caja:", "")
            today = date.today()

            if period == "hoy":
                date_filter = today.isoformat()
                period_label = f"HOY ({today.strftime('%d/%m/%Y')})"
            elif period == "semana":
                date_filter = (today - timedelta(days=today.weekday())).isoformat()
                period_label = f"ESTA SEMANA (desde {date_filter})"
            elif period == "mes":
                date_filter = today.replace(day=1).isoformat()
                period_label = f"ESTE MES ({today.strftime('%B %Y')})"
            else:
                date_filter = None
                period_label = "HISTÓRICO TOTAL"

            summary = get_finance_summary(vendedor_id, date_from=date_filter)
            gross_income = summary["income"]
            cogs = summary["cogs"]
            expenses = summary["expenses"]
            net_profit = gross_income - cogs - expenses

            report = f"💼 <b>ESTADO DE RESULTADOS — {period_label}</b>\n"
            report += f"📅 {nombre_negocio}\n"
            report += "━" * 30 + "\n\n"
            report += f"💰 Ingreso Bruto: <b>{format_cop(gross_income)}</b>\n"
            report += f"🛒 Costo Mercancía: <b>{format_cop(cogs)}</b>\n"
            report += f"🚚 Gastos Operativos: <b>{format_cop(expenses)}</b>\n"
            report += "━" * 30 + "\n"
            report += f"💵 <b>UTILIDAD NETA: {format_cop(net_profit)}</b>\n"

            bot.send_message(call.message.chat.id, report)
        except Exception as e:
            bot.send_message(call.message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /cuentas_por_cobrar — Accounts receivable
    # =====================================================================

    @bot.message_handler(commands=["cuentas_por_cobrar"])
    @requiere_suscripcion(bot)
    def cmd_receivables(message):
        try:
            vendedor_id = get_vendedor_id(message)
            receivables = get_receivables(vendedor_id)

            if not receivables:
                bot.send_message(message.chat.id, "✅ ¡Cartera limpia! No hay cuentas por cobrar.")
                return

            grand_total = sum(row["total_deuda"] for row in receivables)

            response = "💳 <b>CARTERA POR COBRAR</b>\n"
            response += "━" * 30 + "\n"
            response += f"💰 Total cartera: <b>{format_cop(grand_total)}</b>\n"
            response += f"👥 Clientes con deuda: <b>{len(receivables)}</b>\n\n"

            for row in receivables:
                oldest = safe_parse_date(row.get("pedido_mas_antiguo"))
                days = (date.today() - oldest).days if oldest else 0
                urgency = "🔴" if days > 7 else ("🟡" if days > 3 else "🟢")
                phone = sanitize_phone_co(row.get("telefono", ""))
                wa_url = f"https://wa.me/{phone}"
                oldest_str = oldest.isoformat() if oldest else "N/A"

                response += f"{urgency} <b>{row['nombre']}</b>\n"
                response += f"   💰 {format_cop(row['total_deuda'])} | {row['num_pedidos']} pedido(s)\n"
                response += f"   📅 Más antiguo: {oldest_str} ({days} días)\n"
                response += f"   📲 <a href='{wa_url}'>WhatsApp</a>\n\n"

            bot.send_message(message.chat.id, response, disable_web_page_preview=True)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /margen — Margin analysis
    # =====================================================================

    @bot.message_handler(commands=["margen"])
    @requiere_suscripcion(bot)
    def cmd_margin(message):
        try:
            vendedor_id = get_vendedor_id(message)
            analysis = get_margin_analysis(vendedor_id)
            products = analysis["products"]
            top_clients = analysis["top_clients"]

            response = "📊 <b>ANÁLISIS DE MARGEN DE RENTABILIDAD</b>\n"
            response += "━" * 34 + "\n\n"

            if products:
                response += "📦 <b>MARGEN POR PRODUCTO:</b>\n\n"
                for p in products:
                    avg_venta = p.get("avg_venta") or 0
                    avg_costo = p.get("avg_costo") or 0
                    if avg_venta > 0:
                        margin_pct = ((avg_venta - avg_costo) / avg_venta) * 100
                        margin_unit = avg_venta - avg_costo
                    else:
                        margin_pct = 0
                        margin_unit = 0

                    response += f"  📦 <b>{p['producto']}</b>\n"
                    response += f"     💲 Costo prom: {format_cop(avg_costo)} | Venta prom: {format_cop(avg_venta)}\n"
                    response += f"     📈 Margen: <b>{margin_pct:.1f}%</b> ({format_cop(margin_unit)}/ud)\n"
                    total_uds = p.get("total_uds") or 0
                    total_util = p.get("total_utilidad") or 0
                    response += f"     📊 {total_uds} uds | Utilidad: {format_cop(total_util)}\n\n"
            else:
                response += "📦 Sin datos de productos entregados aún.\n\n"

            if top_clients:
                response += "🏆 <b>TOP 5 CLIENTES POR RENTABILIDAD:</b>\n\n"
                medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
                for i, c in enumerate(top_clients):
                    total_ventas = c.get("total_ventas") or 0
                    utilidad = c.get("utilidad") or 0
                    pct = (utilidad / total_ventas * 100) if total_ventas else 0
                    response += f"  {medals[i]} {c['nombre']}\n"
                    response += f"     💰 Ventas: {format_cop(total_ventas)} | Utilidad: {format_cop(utilidad)} ({pct:.0f}%)\n\n"

            bot.send_message(message.chat.id, response)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /meta — Monthly sales goals (dynamic catalog)
    # =====================================================================

    @bot.message_handler(commands=["meta"])
    @requiere_suscripcion(bot)
    def cmd_target(message):
        try:
            vendedor_id = get_vendedor_id(message)
            today = date.today()
            current_month = today.strftime("%Y-%m")
            month_label = today.strftime("%B %Y").upper()
            first_day = today.replace(day=1)

            week_number = min(4, (today.day - 1) // 7 + 1)
            if today.month < 12:
                next_month = first_day.replace(month=first_day.month + 1, day=1)
            else:
                next_month = first_day.replace(year=first_day.year + 1, month=1, day=1)
            days_in_month = (next_month - timedelta(days=1)).day
            days_left = days_in_month - today.day

            goals = get_goals(vendedor_id, current_month)

            # Get sales for this month
            conn = get_connection(vendedor_id)
            try:
                sales = conn.execute("""
                    SELECT producto, COALESCE(SUM(cantidad), 0) as uds_vendidas
                    FROM pedidos
                    WHERE vendedor_id = %s AND fecha >= %s AND estado IN ('Pendiente', 'Entregado')
                    GROUP BY producto
                """, (vendedor_id, first_day.isoformat())).fetchall()

                total_orders = conn.execute(
                    "SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = %s AND fecha >= %s",
                    (vendedor_id, first_day.isoformat()),
                ).fetchone()["c"]
            finally:
                conn.close()

            sales_map = {s["producto"]: s["uds_vendidas"] for s in sales}

            # Get dynamic catalog for product buttons
            catalog = get_products(vendedor_id)

            if not goals:
                response = f"🎯 <b>META MENSUAL — {month_label}</b>\n"
                response += "━" * 30 + "\n\n"
                response += "⚠️ No tienes metas configuradas para este mes.\n\n"
                response += "👇 Presiona un producto para configurar su meta:"

                markup = types.InlineKeyboardMarkup(row_width=1)
                for prod in catalog:
                    sold = sales_map.get(prod["nombre"], 0)
                    markup.add(types.InlineKeyboardButton(
                        f"🎯 {prod['nombre']} ({sold} vendidas)",
                        callback_data=f"meta_set:{prod['nombre'][:30]}",
                    ))

                bot.send_message(message.chat.id, response, reply_markup=markup)
                return

            # Build progress report
            response = f"🎯 <b>META MENSUAL — {month_label}</b>\n"
            response += "━" * 30 + "\n"
            response += f"📅 Semana {week_number}/4 | Quedan {days_left} días\n"
            response += f"📦 Pedidos del mes: {total_orders}\n\n"

            total_revenue_sold = 0
            total_revenue_goal = 0

            for g in goals:
                product = g["producto"]
                goal_monthly = g["meta_unidades"]
                goal_weekly = goal_monthly / 4
                sold = sales_map.get(product, 0)

                # Find price from catalog
                matching = [p for p in catalog if p["nombre"] == product]
                price = matching[0]["precio_venta"] if matching else 0

                progress = (sold / goal_monthly * 100) if goal_monthly > 0 else 0
                remaining = max(0, goal_monthly - sold)
                expected_by_now = goal_weekly * week_number
                weekly_status = "✅" if sold >= expected_by_now else "⚠️"

                revenue_sold = sold * price
                revenue_goal = goal_monthly * price
                total_revenue_sold += revenue_sold
                total_revenue_goal += revenue_goal

                filled = int(progress / 5)
                bar = "█" * min(filled, 20) + "░" * max(0, 20 - filled)

                response += f"📦 <b>{product}</b>\n"
                response += f"   🎯 Meta mensual: <b>{goal_monthly} uds</b> ({goal_weekly:.0f}/semana)\n"
                response += f"   ✅ Vendidas: <b>{sold} uds</b> ({progress:.0f}%)\n"
                response += f"   📊 Faltantes: {remaining} uds\n"
                response += f"   {weekly_status} Sem {week_number}: esperado {expected_by_now:.0f} | real {sold}\n"
                if price > 0:
                    response += f"   💰 Facturado: {format_cop(revenue_sold)} / {format_cop(revenue_goal)}\n"
                response += f"   <code>{bar}</code> {progress:.0f}%\n\n"

            response += "━" * 30 + "\n"
            response += f"💰 <b>FACTURACIÓN ESTIMADA:</b>\n"
            response += f"   Vendido: <b>{format_cop(total_revenue_sold)}</b>\n"
            response += f"   Meta: <b>{format_cop(total_revenue_goal)}</b>\n\n"

            total_progress = (total_revenue_sold / total_revenue_goal * 100) if total_revenue_goal > 0 else 0
            if total_progress >= 100:
                response += "🎉 <b>¡META CUMPLIDA!</b> 🏆🔥"
            elif total_progress >= 75:
                response += "💪 ¡Casi lo logras!"
            elif total_progress >= 50:
                response += "🚀 Vas en buen camino."
            else:
                response += "⚡ ¡Acelera las ventas!"

            markup = types.InlineKeyboardMarkup(row_width=1)
            for prod in catalog:
                markup.add(types.InlineKeyboardButton(
                    f"✏️ Cambiar meta: {prod['nombre'][:25]}",
                    callback_data=f"meta_set:{prod['nombre'][:30]}",
                ))

            bot.send_message(message.chat.id, response, reply_markup=markup)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # meta_set callback — Set goal for a product
    # =====================================================================

    @bot.callback_query_handler(func=lambda call: call.data.startswith("meta_set:"))
    @requiere_suscripcion_callback(bot)
    def handle_meta_set_callback(call):
        try:
            bot.answer_callback_query(call.id)
            vendedor_id = call.from_user.id
            product_name = call.data.replace("meta_set:", "")

            today = date.today()
            current_month = today.strftime("%Y-%m")

            goals = get_goals(vendedor_id, current_month)
            existing = next((g for g in goals if g["producto"] == product_name), None)

            conn = get_connection(vendedor_id)
            try:
                sold = conn.execute("""
                    SELECT COALESCE(SUM(cantidad), 0) as uds
                    FROM pedidos WHERE vendedor_id = %s AND producto = %s AND fecha >= %s
                    AND estado IN ('Pendiente', 'Entregado')
                """, (vendedor_id, product_name, today.replace(day=1).isoformat())).fetchone()["uds"]
            finally:
                conn.close()

            current = existing["meta_unidades"] if existing else 0

            msg = f"🎯 <b>CONFIGURAR META: {product_name}</b>\n\n"
            if current > 0:
                msg += f"📊 Meta actual: <b>{current} uds/mes</b>\n"
            msg += f"✅ Vendidas este mes: <b>{sold} uds</b>\n\n"
            msg += "Escribe la <b>cantidad de unidades</b> como meta mensual:"

            bot.send_message(call.message.chat.id, msg)
            bot.register_next_step_handler(call.message, _step_meta_save, bot, vendedor_id, product_name)
        except Exception as e:
            bot.answer_callback_query(call.id, f"⚠️ Error: {e}")

    def _step_meta_save(message, bot, vendedor_id, product_name):
        try:
            units = int(message.text.strip())
            if units <= 0:
                bot.send_message(message.chat.id, "❌ La meta debe ser mayor a 0.")
                return

            current_month = date.today().strftime("%Y-%m")
            set_goal(vendedor_id, product_name, units, current_month)

            weekly = units / 4

            bot.send_message(
                message.chat.id,
                f"✅ <b>Meta configurada</b>\n\n"
                f"📦 {product_name}\n"
                f"🎯 Meta mensual: <b>{units} uds</b>\n"
                f"📅 Semanal: <b>{weekly:.0f} uds/semana</b>\n\n"
                f"📊 Sem 1: {weekly:.0f} | Sem 2: {weekly*2:.0f} | "
                f"Sem 3: {weekly*3:.0f} | Sem 4: {units} 🏁",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ Escribe un número válido. Ej: 100")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /meta_set command fallback
    # =====================================================================

    @bot.message_handler(commands=["meta_set"])
    @requiere_suscripcion(bot)
    def cmd_target_set(message):
        vendedor_id = get_vendedor_id(message)
        catalog = get_products(vendedor_id)

        if not catalog:
            bot.send_message(message.chat.id, "⚠️ No tienes productos. Usa /configurar para crear tu catálogo.")
            return

        markup = types.InlineKeyboardMarkup(row_width=1)
        for prod in catalog:
            markup.add(types.InlineKeyboardButton(
                f"🎯 {prod['nombre']}",
                callback_data=f"meta_set:{prod['nombre'][:30]}",
            ))

        bot.send_message(
            message.chat.id,
            "🎯 <b>CONFIGURAR META MENSUAL</b>\n\nSelecciona el producto:",
            reply_markup=markup,
        )
