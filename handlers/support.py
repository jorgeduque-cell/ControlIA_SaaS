# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Support Chat Handler
Forwards user messages to the platform admin and admin replies back.

Flow:
  1. User writes a text message (not a command) → forwarded to ADMIN_CHAT_ID
  2. Admin replies (quote) to a forwarded message → bot sends reply to the user
  3. Each conversation is tracked via reply-to-message threading
"""
from config import ADMIN_CHAT_ID, logger
from database import get_connection


def register(bot):
    """Register support message handlers. Must be loaded LAST (catch-all)."""

    @bot.message_handler(commands=["soporte"])
    def cmd_support(message):
        """Show support instructions."""
        bot.send_message(
            message.chat.id,
            "💬 *Soporte ControlIA*\n\n"
            "Escribe tu duda o mensaje aquí y nuestro equipo te responderá lo antes posible.\n\n"
            "Solo escribe tu mensaje de texto y lo recibiremos al instante. ✅",
            parse_mode="Markdown",
        )

    @bot.message_handler(
        func=lambda m: (
            m.text
            and not m.text.startswith("/")
            and ADMIN_CHAT_ID
            and str(m.chat.id) != ADMIN_CHAT_ID
        ),
        content_types=["text"],
    )
    def forward_to_admin(message):
        """Forward user messages to the platform admin."""
        user = message.from_user
        user_id = message.chat.id
        user_name = user.first_name or "Desconocido"
        username = f"@{user.username}" if user.username else "sin username"

        # Try to get vendor info from database
        vendor_info = ""
        try:
            conn = get_connection(vendor_id=user_id)
            cur = conn.cursor()
            cur.execute("SELECT nombre_negocio FROM vendedores WHERE telegram_id = %s", (user_id,))
            row = cur.fetchone()
            if row:
                vendor_info = f"\n🏢 Negocio: {row[0]}"
            conn.close()
        except Exception:
            pass

        # Build admin message with user context
        admin_msg = (
            f"📩 *Mensaje de Soporte*\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"👤 {user_name} ({username})\n"
            f"🆔 ID: `{user_id}`"
            f"{vendor_info}\n"
            f"━━━━━━━━━━━━━━━━━\n\n"
            f"💬 {message.text}"
        )

        try:
            sent = bot.send_message(
                int(ADMIN_CHAT_ID),
                admin_msg,
                parse_mode="Markdown",
            )
            # Confirm to user
            bot.send_message(
                user_id,
                "✅ *Mensaje recibido*\n\n"
                "Tu mensaje fue enviado a nuestro equipo de soporte. "
                "Te responderemos lo antes posible por este mismo chat.\n\n"
                "💡 Mientras tanto, puedes seguir usando la app con el botón 📊 ControlIA.",
                parse_mode="Markdown",
            )
            logger.info("SUPPORT: Message from %s (%s) forwarded to admin", user_name, user_id)
        except Exception as e:
            logger.error("SUPPORT: Failed to forward message: %s", e)
            bot.send_message(
                user_id,
                "⚠️ No pudimos enviar tu mensaje. Intenta de nuevo más tarde.",
            )

    @bot.message_handler(
        func=lambda m: (
            m.reply_to_message
            and ADMIN_CHAT_ID
            and str(m.chat.id) == ADMIN_CHAT_ID
            and m.reply_to_message.text
            and "🆔 ID:" in m.reply_to_message.text
        ),
        content_types=["text"],
    )
    def reply_to_user(message):
        """Admin replies to a forwarded support message → send back to the user."""
        try:
            # Extract user ID from the original forwarded message
            original_text = message.reply_to_message.text
            # Find the line with ID: `123456`
            import re
            match = re.search(r"🆔 ID:\s*`?(\d+)`?", original_text)
            if not match:
                bot.send_message(message.chat.id, "⚠️ No pude identificar al usuario. Responde a un mensaje de soporte.")
                return

            target_user_id = int(match.group(1))
            reply_text = message.text

            bot.send_message(
                target_user_id,
                f"💬 *Respuesta de Soporte ControlIA*\n\n{reply_text}",
                parse_mode="Markdown",
            )

            bot.send_message(
                message.chat.id,
                f"✅ Respuesta enviada al usuario `{target_user_id}`",
                parse_mode="Markdown",
            )
            logger.info("SUPPORT: Admin replied to user %s", target_user_id)

        except Exception as e:
            logger.error("SUPPORT: Failed to reply to user: %s", e)
            bot.send_message(message.chat.id, f"⚠️ Error al enviar respuesta: {e}")
