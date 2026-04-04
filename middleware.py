# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Middleware Module
Subscription validation (Kill Switch) and tenant context injection.

SECURITY PATTERN:
  Every handler decorated with @requiere_suscripcion will:
    1. Check if the user is registered as a vendor.
    2. Verify their subscription is active or in trial.
    3. Auto-deactivate expired subscriptions.
    4. Inject the vendor dict into message.vendedor for downstream use.

  If the vendor is not registered → redirect to /start.
  If the vendor is expired   → show renewal message + block access.
"""
import functools
from datetime import date
from database import get_vendedor, _deactivate_vendor, safe_parse_date
from config import logger


def requiere_suscripcion(bot):
    """Decorator factory: validates subscription before executing any command.

    Usage:
        @requiere_suscripcion(bot)
        def my_handler(message):
            # message.vendedor is guaranteed to exist here
            vendedor_id = message.vendedor["id"]
            nombre = message.vendedor["nombre_negocio"]
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(message, *args, **kwargs):
            vendedor_id = message.from_user.id
            vendedor = get_vendedor(vendedor_id)

            # ── NOT REGISTERED ──
            if not vendedor:
                bot.send_message(
                    message.chat.id,
                    "👋 ¡Bienvenido a ControlIA!\n\n"
                    "No tienes una cuenta registrada.\n"
                    "Usa /start para crear tu cuenta y comenzar tu prueba gratuita.",
                )
                logger.info(
                    "Unregistered user blocked — ID: %s, Command: %s",
                    vendedor_id,
                    message.text or "N/A",
                )
                return

            # ── CHECK EXPIRY ──
            fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
            estado = vendedor["estado"]

            if estado in ("Activo", "Prueba") and fecha_venc and fecha_venc < date.today():
                # Auto-deactivate expired vendor
                _deactivate_vendor(vendedor_id)
                vendedor["estado"] = "Inactivo"
                estado = "Inactivo"
                logger.info(
                    "Auto-deactivated vendor %s (%s) — expired %s",
                    vendedor_id,
                    vendedor["nombre_negocio"],
                    fecha_venc,
                )

            # ── INACTIVE / EXPIRED ──
            if estado == "Inactivo":
                fecha_str = fecha_venc.isoformat() if fecha_venc else "N/A"
                bot.send_message(
                    message.chat.id,
                    f"⚠️ Tu suscripción venció el <b>{fecha_str}</b>.\n\n"
                    "Tus datos están seguros, pero los módulos están bloqueados.\n"
                    "Para seguir usando ControlIA, renueva tu suscripción.\n\n"
                    "Usa /start para ver las opciones de pago.",
                    parse_mode="HTML",
                )
                logger.info(
                    "Expired vendor blocked — ID: %s, Name: %s, Command: %s",
                    vendedor_id,
                    vendedor["nombre_negocio"],
                    message.text or "N/A",
                )
                return

            # ── ACTIVE OR TRIAL — GRANT ACCESS ──
            # Inject vendor data into message for downstream handlers
            message.vendedor = vendedor
            return func(message, *args, **kwargs)

        return wrapper
    return decorator


def requiere_suscripcion_callback(bot):
    """Same as requiere_suscripcion but for callback_query handlers.
    callback_query has a different structure: data comes from call.message,
    but the user ID comes from call.from_user."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(call, *args, **kwargs):
            vendedor_id = call.from_user.id
            vendedor = get_vendedor(vendedor_id)

            if not vendedor:
                bot.answer_callback_query(
                    call.id,
                    "⚠️ No estás registrado. Usa /start",
                    show_alert=True,
                )
                return

            # Check expiry
            fecha_venc = safe_parse_date(vendedor.get("fecha_vencimiento"))
            estado = vendedor["estado"]

            if estado in ("Activo", "Prueba") and fecha_venc and fecha_venc < date.today():
                _deactivate_vendor(vendedor_id)
                vendedor["estado"] = "Inactivo"
                estado = "Inactivo"

            if estado == "Inactivo":
                bot.answer_callback_query(
                    call.id,
                    "⚠️ Suscripción vencida. Usa /start para renovar.",
                    show_alert=True,
                )
                return

            # Inject vendor data
            call.vendedor = vendedor
            return func(call, *args, **kwargs)

        return wrapper
    return decorator
