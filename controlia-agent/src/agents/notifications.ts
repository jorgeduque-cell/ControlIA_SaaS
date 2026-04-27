import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { sendEmailTool } from "../tools/email/index.js";
import { sendWhatsappMessageTool } from "../tools/external/send-whatsapp-message.js";
import { accountsReceivableTool } from "../tools/finance/accounts-receivable.js";
import { checkLowStockTool } from "../tools/inventory/check-low-stock.js";
import { demandForecastTool } from "../tools/notifications/demand-forecast.js";
import { overdueClientsTool } from "../tools/notifications/overdue-clients.js";

/**
 * Notifications Agent — Alertas proactivas y gestión de cobranza
 *
 * Casos de uso:
 *   - "¿Quién me debe más de 30 días?"
 *   - "¿Qué aceite me va a faltar esta semana?"
 *   - "Genera un mensaje de cobro para Restaurante La Casona"
 *   - "¿Qué alertas tengo hoy?"
 *   - "Resumen de cartera vencida"
 *
 * Modelo: nano (Groq Llama 8B) — CRUD simple, no necesita reasoning tools
 */
export const notificationsAgent = new Agent({
	name: "Notifications",
	id: "notifications-agent",
	purpose:
		"Alertas proactivas de cartera vencida, stock crítico y forecast de demanda de aceite",

	instructions: `Notifications Agent — alertas proactivas de cartera vencida, stock crítico y forecast.

Responsabilidades:
- 💳 Cobranza: cartera vencida ordenada por antigüedad/monto. Prioridad 🔴 60+ días, ⚠️ 31-60, ✅ 1-30.
- 📦 Inventario: alertar aceite soya/palma en nivel crítico, proyectar días de stock.
- 📈 Forecast: proyectar demanda 30 días y sugerir compras.

Mensaje de cobro (cuando te pidan uno): "Hola [Nombre], tenemos pendiente $[monto] por su pedido del [fecha]. ¿Cuándo podríamos coordinar el pago? Saludos."

Formato: emojis de criticidad, ordenar por prioridad, incluir teléfono del cliente si existe.`,

	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		overdueClientsTool,
		demandForecastTool,
		accountsReceivableTool,
		checkLowStockTool,
		sendWhatsappMessageTool,
		sendEmailTool,
	],
	temperature: 0.1,
	maxSteps: 4,
	maxOutputTokens: 512,
});
