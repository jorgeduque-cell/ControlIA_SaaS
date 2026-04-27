import { Agent, type Memory } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { SUPERVISOR_PROMPT } from "../config/prompts.js";
import { sendVoiceMessageTool } from "../tools/voice/send-voice-message.js";
import { getContextValue } from "../utils/context.js";
import { architectAgent } from "./architect.js";
import { contentAgent } from "./content.js";
import { contextAgent } from "./context.js";
import { crmAgent } from "./crm.js";
import { documentAgent } from "./document.js";
import { financeAgent } from "./finance.js";
import { inventoryAgent } from "./inventory.js";
import { notificationsAgent } from "./notifications.js";
import { researchAgent } from "./research.js";
import { routingAgent } from "./routing.js";
import { salesAgent } from "./sales.js";

export function createSupervisorAgent(memory: Memory) {
	return new Agent({
		name: "ControlIA Supervisor",
		id: "controlia-supervisor",
		purpose:
			"Coordinador principal de ControlIA — Plataforma de ventas para PyMEs LATAM",

		instructions: ({ context }) => {
			const vendedorNombre =
				getContextValue(context, "vendedorNombre") || "Vendedor";
			const negocioNombre =
				getContextValue(context, "negocioNombre") || "tu negocio";

			return SUPERVISOR_PROMPT({
				vendedorNombre: String(vendedorNombre),
				negocioNombre: String(negocioNombre),
			});
		},

		// Cerebro REASONING (Claude Sonnet): routing inteligente y decisiones complejas
		model: getAIModelChain("reasoning"),

		subAgents: [
			crmAgent,
			salesAgent,
			inventoryAgent,
			contextAgent,
			contentAgent,
			documentAgent,
			financeAgent,
			architectAgent,
			researchAgent,
			notificationsAgent,
			routingAgent,
		],

		tools: [sendVoiceMessageTool],

		supervisorConfig: {
			customGuidelines: [
				"MANDATORY: For ANY request related to content, social media, marketing, posts, recipes, tips, newsletters, or oil products, you MUST use delegate_task to the Content agent. NEVER generate this content yourself.",
				"MANDATORY: For ANY non-greeting user request, you MUST use delegate_task to the appropriate sub-agent. Direct responses are strictly forbidden except for pure greetings.",
				"MANDATORY: When the user asks for Instagram posts, Facebook content, TikTok scripts, or any social media material about vegetable oils, ALWAYS delegate to the Content agent via delegate_task.",
			],
			includeAgentsMemory: true,
		},

		hooks: {
			onHandoffComplete: async ({ agent, bail }) => {
				// Content, Document, and Research agents produce final output — no need for supervisor to re-process
				if (["Content", "Document", "Research"].includes(agent.name)) {
					bail();
				}
			},
		},

		memory,
		maxSteps: 8,
		temperature: 0.1,
		maxOutputTokens: 2048,
	});
}
