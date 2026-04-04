# -*- coding: utf-8 -*-
"""
ControlIA SaaS — Handler Registry
Registers all command handler modules with the bot instance.
Order matters: onboarding registers /start and the callback router,
so it must be loaded first.
"""
from handlers import onboarding, crm, sales, logistics, documents, finance, admin


def register_all(bot):
    """Register all handler modules with the bot instance."""
    onboarding.register(bot)  # /start, /configurar, /cancelar, drill-down router
    crm.register(bot)
    sales.register(bot)
    logistics.register(bot)
    documents.register(bot)
    finance.register(bot)
    admin.register(bot)       # /backup, /editar, /eliminar
