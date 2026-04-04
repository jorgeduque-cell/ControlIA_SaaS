# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Admin Handler
Commands: /editar, /eliminar, /backup

FEATURES V2:
  8. Edit Order    — Change quantity, sale price, purchase cost, or product.
  9. Cancel Order  — Set status to 'Cancelado' and remove linked finance record.
  Backup          — Resilient (1 conn/table), tenant-isolated, CSV format.

NOTE: /start, /cancelar, /configurar, and the drill-down router
      live in handlers/onboarding.py (Sprint 3).
"""
from telebot import types
from datetime import date, datetime
import io

from database import (
    get_connection, get_client, get_clients, get_order, get_orders,
    update_client, delete_client, delete_order, delete_finance_record,
    get_backup_data, safe_parse_date,
)
from middleware import requiere_suscripcion, requiere_suscripcion_callback
from utils import get_vendedor_id, format_cop
from config import logger


def register(bot):

    # =====================================================================
    # /backup — Resilient export (1 conn per table, tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["backup"])
    @requiere_suscripcion(bot)
    def cmd_backup(message):
        try:
            vendedor_id = get_vendedor_id(message)
            nombre = message.vendedor["nombre_negocio"]

            bot.send_message(message.chat.id, "💾 Generando respaldo... Esto puede tomar unos segundos.")

            data = get_backup_data(vendedor_id)  # 1 conn per table

            backup_text = f"-- {nombre} Backup — {datetime.now().strftime('%d/%m/%Y %H:%M')}\n\n"

            for table, rows in data.items():
                backup_text += f"-- TABLE: {table} ({len(rows)} rows)\n"
                if rows:
                    cols = list(rows[0].keys())
                    backup_text += ",".join(cols) + "\n"
                    for r in rows:
                        backup_text += ",".join(
                            str(r[c]) if r[c] is not None else "" for c in cols
                        ) + "\n"
                backup_text += "\n"

            file_bytes = io.BytesIO(backup_text.encode("utf-8"))
            filename = f"backup_{nombre.replace(' ', '_')}_{date.today().isoformat()}.csv"
            file_bytes.name = filename

            bot.send_document(
                message.chat.id,
                file_bytes,
                visible_file_name=filename,
                caption=f"💾 Respaldo de {nombre} — {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            )
        except Exception as e:
            logger.error("Backup error for %s: %s", get_vendedor_id(message), e)
            bot.send_message(message.chat.id, f"⚠️ Error al generar backup: {e}")

    # =====================================================================
    # /eliminar — Delete records (tenant-isolated)
    # =====================================================================

    @bot.message_handler(commands=["eliminar"])
    @requiere_suscripcion(bot)
    def cmd_delete(message):
        try:
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("👤 Eliminar Cliente")
            markup.add("📦 Eliminar Pedido")
            markup.add("💰 Eliminar Registro Financiero")
            markup.add("❌ Cancelar")

            bot.send_message(
                message.chat.id,
                "🗑️ <b>ELIMINAR REGISTRO</b>\n\n¿Qué tipo de registro deseas eliminar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _delete_type, bot)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_type(message, bot):
        try:
            vendedor_id = get_vendedor_id(message)
            selected = (message.text or "").strip()

            if "Cancelar" in selected:
                bot.send_message(message.chat.id, "❌ Operación cancelada.", reply_markup=types.ReplyKeyboardRemove())
                return

            if "Cliente" in selected:
                clients = get_clients(vendedor_id)
                if not clients:
                    bot.send_message(message.chat.id, "💭 No hay clientes registrados.", reply_markup=types.ReplyKeyboardRemove())
                    return

                listing = "👤 <b>CLIENTES (últimos 20):</b>\n\n"
                for c in clients[:20]:
                    listing += f"  🆔 <b>{c['id']}</b> — {c['nombre']} ({c['estado']})\n"
                listing += "\n✍️ Escribe el <b>ID</b> del cliente a eliminar:"

                bot.send_message(message.chat.id, listing, reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _delete_client_confirm, bot, vendedor_id)

            elif "Pedido" in selected:
                orders = get_orders(vendedor_id)
                if not orders:
                    bot.send_message(message.chat.id, "📦 No hay pedidos.", reply_markup=types.ReplyKeyboardRemove())
                    return

                listing = "📦 <b>PEDIDOS (últimos 20):</b>\n\n"
                for o in orders[:20]:
                    listing += (
                        f"  🆔 <b>{o['id']}</b> — {o['cliente_nombre']} | "
                        f"{o['cantidad']}x {o['producto']} | {o['estado']}\n"
                    )
                listing += "\n✍️ Escribe el <b>ID</b> del pedido a eliminar:"

                bot.send_message(message.chat.id, listing, reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _delete_order_confirm, bot, vendedor_id)

            elif "Financiero" in selected:
                conn = get_connection(vendedor_id)
                try:
                    records = conn.execute(
                        "SELECT id, tipo, concepto, monto, fecha FROM finanzas WHERE vendedor_id = %s ORDER BY id DESC LIMIT 20",
                        (vendedor_id,),
                    ).fetchall()
                finally:
                    conn.close()

                if not records:
                    bot.send_message(message.chat.id, "💰 No hay registros financieros.", reply_markup=types.ReplyKeyboardRemove())
                    return

                listing = "💰 <b>REGISTROS FINANCIEROS (últimos 20):</b>\n\n"
                for r in records:
                    listing += (
                        f"  🆔 <b>{r['id']}</b> — {r['tipo']} | "
                        f"{r['concepto']} | {format_cop(r['monto'])}\n"
                    )
                listing += "\n✍️ Escribe el <b>ID</b> del registro a eliminar:"

                bot.send_message(message.chat.id, listing, reply_markup=types.ReplyKeyboardRemove())
                bot.register_next_step_handler(message, _delete_finance_confirm, bot, vendedor_id)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_client_confirm(message, bot, vendedor_id):
        try:
            client_id = int(message.text.strip())
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, f"❌ No existe un cliente con ID {client_id}")
                return

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("✅ Sí, eliminar", "❌ No, cancelar")

            bot.send_message(
                message.chat.id,
                f'⚠️ <b>¿Eliminar al cliente "{client["nombre"]}" (ID: {client_id})?</b>\n\n'
                "🚨 Esto también eliminará todos sus pedidos y registros financieros.",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _delete_client_execute, bot, vendedor_id, client_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Debes escribir un número de ID válido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_client_execute(message, bot, vendedor_id, client_id):
        try:
            if "Sí" in (message.text or ""):
                delete_client(client_id, vendedor_id)
                bot.send_message(
                    message.chat.id,
                    f"✅ Cliente ID {client_id} eliminado con todos sus registros.",
                    reply_markup=types.ReplyKeyboardRemove(),
                )
            else:
                bot.send_message(message.chat.id, "❌ Eliminación cancelada.", reply_markup=types.ReplyKeyboardRemove())
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_order_confirm(message, bot, vendedor_id):
        try:
            order_id = int(message.text.strip())
            order = get_order(order_id, vendedor_id)
            if not order:
                bot.send_message(message.chat.id, f"❌ No existe un pedido con ID {order_id}")
                return

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("✅ Sí, eliminar", "❌ No, cancelar")

            bot.send_message(
                message.chat.id,
                f"⚠️ <b>¿Eliminar pedido ID {order_id}?</b>\n"
                f"👤 {order['cliente_nombre']} — {order['cantidad']}x {order['producto']}",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _delete_order_execute, bot, vendedor_id, order_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Debes escribir un número de ID válido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_order_execute(message, bot, vendedor_id, order_id):
        try:
            if "Sí" in (message.text or ""):
                delete_order(order_id, vendedor_id)
                bot.send_message(
                    message.chat.id,
                    f"✅ Pedido ID {order_id} eliminado.",
                    reply_markup=types.ReplyKeyboardRemove(),
                )
            else:
                bot.send_message(message.chat.id, "❌ Eliminación cancelada.", reply_markup=types.ReplyKeyboardRemove())
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_finance_confirm(message, bot, vendedor_id):
        try:
            record_id = int(message.text.strip())
            conn = get_connection(vendedor_id)
            try:
                record = conn.execute(
                    "SELECT tipo, concepto, monto FROM finanzas WHERE id = %s AND vendedor_id = %s",
                    (record_id, vendedor_id),
                ).fetchone()
            finally:
                conn.close()

            if not record:
                bot.send_message(message.chat.id, f"❌ No existe un registro financiero con ID {record_id}")
                return

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("✅ Sí, eliminar", "❌ No, cancelar")

            bot.send_message(
                message.chat.id,
                f"⚠️ <b>¿Eliminar registro financiero ID {record_id}?</b>\n"
                f"💰 {record['tipo']} — {record['concepto']} — {format_cop(record['monto'])}",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _delete_finance_execute, bot, vendedor_id, record_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ Debes escribir un número de ID válido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _delete_finance_execute(message, bot, vendedor_id, record_id):
        try:
            if "Sí" in (message.text or ""):
                delete_finance_record(record_id, vendedor_id)
                bot.send_message(
                    message.chat.id,
                    f"✅ Registro financiero ID {record_id} eliminado.",
                    reply_markup=types.ReplyKeyboardRemove(),
                )
            else:
                bot.send_message(message.chat.id, "❌ Eliminación cancelada.", reply_markup=types.ReplyKeyboardRemove())
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # =====================================================================
    # /editar — Edit records (tenant-isolated)
    # FEATURE 8: Now supports editing ORDERS (qty, price, cost, product)
    # FEATURE 9: Cancel order (set Cancelado + delete finance)
    # =====================================================================

    @bot.message_handler(commands=["editar"])
    @requiere_suscripcion(bot)
    def cmd_edit(message):
        try:
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("👤 Editar Cliente")
            markup.add("📦 Editar Pedido")
            markup.add("🚫 Cancelar Pedido")
            markup.add("❌ Cancelar")

            bot.send_message(
                message.chat.id,
                "✏️ <b>EDITAR REGISTRO</b>\n\n¿Qué deseas editar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _edit_type, bot)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _edit_type(message, bot):
        try:
            vendedor_id = get_vendedor_id(message)
            selected = (message.text or "").strip()

            if "Cancelar Pedido" in selected:
                # ── FEATURE 9: Cancel Order ──
                _edit_show_orders(message, bot, vendedor_id, mode="cancel")

            elif "Editar Pedido" in selected:
                # ── FEATURE 8: Edit Order ──
                _edit_show_orders(message, bot, vendedor_id, mode="edit")

            elif "Editar Cliente" in selected:
                _edit_show_clients(message, bot, vendedor_id)

            elif "Cancelar" in selected:
                bot.send_message(message.chat.id, "❌ Cancelado.", reply_markup=types.ReplyKeyboardRemove())

            else:
                bot.send_message(message.chat.id, "❌ Opción no reconocida.", reply_markup=types.ReplyKeyboardRemove())
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # ── EDIT/CANCEL ORDER HELPERS ──

    def _edit_show_orders(message, bot, vendedor_id, mode):
        """List orders for editing or cancellation."""
        orders = get_orders(vendedor_id)
        if not orders:
            bot.send_message(message.chat.id, "📦 No hay pedidos.", reply_markup=types.ReplyKeyboardRemove())
            return

        listing = f"📦 <b>PEDIDOS (últimos 20):</b>\n\n"
        for o in orders[:20]:
            total = o["cantidad"] * o["precio_venta"]
            listing += (
                f"  🆔 <b>{o['id']}</b> — {o['cliente_nombre']} | "
                f"{o['cantidad']}x {o['producto']} | {o['estado']} | {format_cop(total)}\n"
            )

        action = "cancelar" if mode == "cancel" else "editar"
        listing += f"\n✍️ Escribe el <b>ID</b> del pedido a {action}:"

        bot.send_message(message.chat.id, listing, reply_markup=types.ReplyKeyboardRemove())

        if mode == "cancel":
            bot.register_next_step_handler(message, _cancel_order_confirm, bot, vendedor_id)
        else:
            bot.register_next_step_handler(message, _edit_order_field, bot, vendedor_id)

    # ── FEATURE 9: CANCEL ORDER ──

    def _cancel_order_confirm(message, bot, vendedor_id):
        try:
            order_id = int(message.text.strip())
            order = get_order(order_id, vendedor_id)
            if not order:
                bot.send_message(message.chat.id, f"❌ No existe pedido con ID {order_id}")
                return

            if order["estado"] == "Cancelado":
                bot.send_message(message.chat.id, "ℹ️ Este pedido ya está cancelado.")
                return

            total = order["cantidad"] * order["precio_venta"]
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("✅ Sí, cancelar pedido", "❌ No")

            bot.send_message(
                message.chat.id,
                f"🚫 <b>¿Cancelar pedido #{order_id}?</b>\n\n"
                f"👤 {order['cliente_nombre']}\n"
                f"📦 {order['cantidad']}x {order['producto']}\n"
                f"💰 {format_cop(total)}\n"
                f"📌 Estado: {order['estado']}\n\n"
                "⚠️ Se eliminará el registro financiero asociado.",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _cancel_order_execute, bot, vendedor_id, order_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _cancel_order_execute(message, bot, vendedor_id, order_id):
        try:
            if "Sí" not in (message.text or ""):
                bot.send_message(message.chat.id, "❌ Operación cancelada.", reply_markup=types.ReplyKeyboardRemove())
                return

            conn = get_connection(vendedor_id)
            try:
                # Set order to Cancelado
                conn.execute(
                    "UPDATE pedidos SET estado = 'Cancelado' WHERE id = %s AND vendedor_id = %s",
                    (order_id, vendedor_id),
                )
                # Delete associated finance record
                conn.execute(
                    "DELETE FROM finanzas WHERE pedido_id = %s AND vendedor_id = %s",
                    (order_id, vendedor_id),
                )
                conn.commit()
            finally:
                conn.close()

            bot.send_message(
                message.chat.id,
                f"🚫 <b>Pedido #{order_id} CANCELADO</b>\n\n"
                "✅ Registro financiero asociado eliminado.",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            logger.info("Order %s cancelled by vendor %s", order_id, vendedor_id)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # ── FEATURE 8: EDIT ORDER ──

    def _edit_order_field(message, bot, vendedor_id):
        try:
            order_id = int(message.text.strip())
            order = get_order(order_id, vendedor_id)
            if not order:
                bot.send_message(message.chat.id, f"❌ No existe pedido con ID {order_id}")
                return

            total = order["cantidad"] * order["precio_venta"]
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("📦 Cantidad", "💰 Precio de Venta")
            markup.add("💲 Costo de Compra", "🏷️ Producto")
            markup.add("❌ Cancelar")

            bot.send_message(
                message.chat.id,
                f"✏️ <b>Editando Pedido #{order_id}</b>\n\n"
                f"👤 {order['cliente_nombre']}\n"
                f"📦 Cantidad: {order['cantidad']}\n"
                f"🏷️ Producto: {order['producto']}\n"
                f"💲 Costo: {format_cop(order['precio_compra'])} c/u\n"
                f"💰 Venta: {format_cop(order['precio_venta'])} c/u\n"
                f"💵 Total: {format_cop(total)}\n\n"
                "¿Qué campo editar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _edit_order_select_field, bot, vendedor_id, order_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    ALLOWED_ORDER_FIELDS = {"cantidad", "precio_venta", "precio_compra", "producto"}

    def _edit_order_select_field(message, bot, vendedor_id, order_id):
        try:
            selected = (message.text or "").strip()
            if "Cancelar" in selected:
                bot.send_message(message.chat.id, "❌ Cancelado.", reply_markup=types.ReplyKeyboardRemove())
                return

            field_map = {
                "Cantidad": "cantidad",
                "Precio de Venta": "precio_venta",
                "Costo de Compra": "precio_compra",
                "Producto": "producto",
            }

            db_field = None
            for label, col in field_map.items():
                if label in selected:
                    db_field = col
                    break

            if not db_field or db_field not in ALLOWED_ORDER_FIELDS:
                bot.send_message(message.chat.id, "❌ Campo no reconocido.", reply_markup=types.ReplyKeyboardRemove())
                return

            bot.send_message(
                message.chat.id,
                f"✍️ Escribe el <b>nuevo valor</b> para {selected}:",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _edit_order_save, bot, vendedor_id, order_id, db_field)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _edit_order_save(message, bot, vendedor_id, order_id, db_field):
        try:
            new_value = (message.text or "").strip()

            # Parse value based on field type
            if db_field == "cantidad":
                parsed = int(new_value)
                if parsed <= 0:
                    bot.send_message(message.chat.id, "❌ La cantidad debe ser mayor a 0.")
                    return
            elif db_field in ("precio_venta", "precio_compra"):
                parsed = float(new_value.replace(".", "").replace(",", ".").replace("$", ""))
                if parsed <= 0:
                    bot.send_message(message.chat.id, "❌ El valor debe ser mayor a $0.")
                    return
            else:
                parsed = new_value  # producto = string

            if db_field not in ALLOWED_ORDER_FIELDS:
                bot.send_message(message.chat.id, "❌ Campo no permitido.")
                return

            conn = get_connection(vendedor_id)
            try:
                conn.execute(
                    f"UPDATE pedidos SET {db_field} = %s WHERE id = %s AND vendedor_id = %s",
                    (parsed, order_id, vendedor_id),
                )

                # If quantity or price changed, update the finance record too
                if db_field in ("cantidad", "precio_venta"):
                    order = conn.execute(
                        "SELECT cantidad, precio_venta FROM pedidos WHERE id = %s AND vendedor_id = %s",
                        (order_id, vendedor_id),
                    ).fetchone()
                    if order:
                        new_income = order["cantidad"] * order["precio_venta"]
                        conn.execute(
                            "UPDATE finanzas SET monto = %s WHERE pedido_id = %s AND vendedor_id = %s AND tipo = 'Ingreso'",
                            (new_income, order_id, vendedor_id),
                        )

                conn.commit()
            finally:
                conn.close()

            display = format_cop(parsed) if db_field in ("precio_venta", "precio_compra") else str(parsed)
            bot.send_message(
                message.chat.id,
                f"✅ <b>Pedido #{order_id} actualizado</b>\n📝 {db_field} → {display}",
            )
        except ValueError:
            bot.send_message(message.chat.id, "❌ Valor inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    # ── EDIT CLIENT ──

    def _edit_show_clients(message, bot, vendedor_id):
        """Show clients for editing."""
        bot.send_message(
            message.chat.id,
            "✍️ Escribe el <b>ID del cliente</b> a editar:",
            reply_markup=types.ReplyKeyboardRemove(),
        )
        bot.register_next_step_handler(message, _edit_client_id, bot, vendedor_id)

    def _edit_client_id(message, bot, vendedor_id):
        try:
            client_id = int(message.text.strip())
            client = get_client(client_id, vendedor_id)
            if not client:
                bot.send_message(message.chat.id, f"❌ No existe cliente con ID {client_id}")
                return

            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            markup.add("👤 Nombre", "📱 Teléfono")
            markup.add("📍 Dirección", "🏪 Tipo de Negocio")
            markup.add("❌ Cancelar")

            bot.send_message(
                message.chat.id,
                f"✏️ <b>Editando: {client['nombre']} (ID: {client_id})</b>\n\n"
                f"👤 Nombre: {client['nombre']}\n"
                f"📱 Teléfono: {client.get('telefono', 'N/A')}\n"
                f"📍 Dirección: {client.get('direccion', 'N/A')}\n"
                f"🏪 Tipo: {client.get('tipo_negocio', 'N/A')}\n\n"
                "¿Qué campo deseas editar?",
                reply_markup=markup,
            )
            bot.register_next_step_handler(message, _edit_client_field, bot, vendedor_id, client_id)
        except ValueError:
            bot.send_message(message.chat.id, "❌ ID inválido.")
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    ALLOWED_CLIENT_FIELDS = {"nombre", "telefono", "direccion", "tipo_negocio"}

    def _edit_client_field(message, bot, vendedor_id, client_id):
        try:
            selected = (message.text or "").strip()
            if "Cancelar" in selected:
                bot.send_message(message.chat.id, "❌ Cancelado.", reply_markup=types.ReplyKeyboardRemove())
                return

            field_map = {
                "Nombre": "nombre",
                "Teléfono": "telefono",
                "Dirección": "direccion",
                "Tipo de Negocio": "tipo_negocio",
            }
            db_field = None
            for label, col in field_map.items():
                if label in selected:
                    db_field = col
                    break

            if not db_field or db_field not in ALLOWED_CLIENT_FIELDS:
                bot.send_message(message.chat.id, "❌ Campo no reconocido.", reply_markup=types.ReplyKeyboardRemove())
                return

            bot.send_message(
                message.chat.id,
                f"✍️ Escribe el <b>nuevo valor</b> para {selected}:",
                reply_markup=types.ReplyKeyboardRemove(),
            )
            bot.register_next_step_handler(message, _edit_client_save, bot, vendedor_id, client_id, db_field)
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")

    def _edit_client_save(message, bot, vendedor_id, client_id, db_field):
        try:
            if db_field not in ALLOWED_CLIENT_FIELDS:
                bot.send_message(message.chat.id, "❌ Campo no permitido.")
                return

            new_value = (message.text or "").strip()
            update_client(client_id, vendedor_id, **{db_field: new_value})

            bot.send_message(
                message.chat.id,
                f"✅ <b>Cliente ID {client_id} actualizado</b>\n📝 {db_field} → {new_value}",
            )
        except Exception as e:
            bot.send_message(message.chat.id, f"⚠️ Error: {e}")
