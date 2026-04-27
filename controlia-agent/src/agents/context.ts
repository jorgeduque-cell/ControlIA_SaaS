import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { CONTEXT_AGENT_PROMPT } from "../config/prompts.js";
import { consolidateMemoryTool } from "../tools/context/consolidate-memory.js";
import { findSimilarClientsTool } from "../tools/context/find-similar-clients.js";
import { saveContextTool } from "../tools/context/save-context.js";
import { searchContextTool } from "../tools/context/search-context.js";

export const contextAgent = new Agent({
	name: "Context",
	id: "context-agent",
	purpose:
		"Memoria semántica y contexto inteligente - Recuerda preferencias, busca información contextual y encuentra patrones",
	instructions: CONTEXT_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		saveContextTool,
		searchContextTool,
		findSimilarClientsTool,
		consolidateMemoryTool,
	],
	maxOutputTokens: 512,
});
