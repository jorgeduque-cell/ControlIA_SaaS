import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { CRM_AGENT_PROMPT } from "../config/prompts.js";
import { addVisitNoteTool } from "../tools/crm/add-visit-note.js";
import { getClientProfileTool } from "../tools/crm/get-client-profile.js";
import { getPipelineTool } from "../tools/crm/get-pipeline.js";
import { registerClientTool } from "../tools/crm/register-client.js";
import { searchClientsTool } from "../tools/crm/search-clients.js";

export const crmAgent = new Agent({
	name: "CRM",
	id: "crm-agent",
	purpose:
		"Gestión de clientes, prospectos, notas de visita y pipeline comercial",
	instructions: CRM_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		registerClientTool,
		searchClientsTool,
		addVisitNoteTool,
		getClientProfileTool,
		getPipelineTool,
	],
	maxOutputTokens: 512,
});
