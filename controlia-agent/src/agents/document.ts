import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { DOCUMENT_AGENT_PROMPT } from "../config/prompts.js";
import {
	generateQuotationTool,
	getPriceHistoryTool,
} from "../tools/document/generate-quotation.js";
import {
	exportClientsTool,
	exportFullBackupTool,
	exportInventoryTool,
	exportOrdersTool,
} from "../tools/export/index.js";

export const documentAgent = new Agent({
	name: "Document",
	id: "document-agent",
	purpose:
		"Generación de documentos profesionales: cotizaciones, histórico de precios, PDFs con términos y condiciones",
	instructions: DOCUMENT_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		generateQuotationTool,
		getPriceHistoryTool,
		exportClientsTool,
		exportInventoryTool,
		exportOrdersTool,
		exportFullBackupTool,
	],
	maxOutputTokens: 512,
});
