import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { SALES_AGENT_PROMPT } from "../config/prompts.js";
import { chartTopProductosTool } from "../tools/charts/chart-top-productos.js";
import { cierreDiaTool } from "../tools/prospeccion/cierre-dia.js";
import { exportRutasTool } from "../tools/prospeccion/export-rutas.js";
import { registrarVisitaTool } from "../tools/prospeccion/registrar-visita.js";
import { rutaHoyTool } from "../tools/prospeccion/ruta-hoy.js";
import { cancelRemisionTool } from "../tools/sales/cancel-remision.js";
import { confirmRemisionTool } from "../tools/sales/confirm-remision.js";
import { createOrderTool } from "../tools/sales/create-order.js";
import { deliverOrderTool } from "../tools/sales/deliver-order.js";
import { generatePedidoPdfTool } from "../tools/sales/generate-pedido-pdf.js";
import { getPricesTool } from "../tools/sales/get-prices.js";
import { listOrdersTool } from "../tools/sales/list-orders.js";
import { markPaidTool } from "../tools/sales/mark-paid.js";
import { repeatOrderTool } from "../tools/sales/repeat-order.js";

export const salesAgent = new Agent({
	name: "Sales",
	id: "sales-agent",
	purpose: "Gestión de pedidos, ventas, cobranzas y precios",
	instructions: SALES_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		getPricesTool,
		createOrderTool,
		generatePedidoPdfTool,
		listOrdersTool,
		deliverOrderTool,
		markPaidTool,
		repeatOrderTool,
		confirmRemisionTool,
		cancelRemisionTool,
		chartTopProductosTool,
		rutaHoyTool,
		registrarVisitaTool,
		cierreDiaTool,
		exportRutasTool,
	],
	maxOutputTokens: 512,
});
