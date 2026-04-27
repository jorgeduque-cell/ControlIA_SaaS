import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { CONTENT_AGENT_PROMPT } from "../config/prompts.js";
import { generateOilContentTool } from "../tools/content/generate-oil-content.js";

export const contentAgent = new Agent({
	name: "Content",
	id: "content-agent",
	purpose:
		"Generación de contenido automático sobre aceite para marketing, redes sociales y newsletters",
	instructions: CONTENT_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [generateOilContentTool],
	maxOutputTokens: 512,
});
