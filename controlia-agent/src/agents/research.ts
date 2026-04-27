import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { searchWebTool } from "../tools/external/search-web.js";
import { webSearchTool } from "../tools/research/web-search.js";

/**
 * Research Agent — Inteligencia comercial y de mercado
 *
 * Usa OpenAI GPT-4o-mini (fast tier) para búsquedas web.
 * NO usa Anthropic → sin límite de 30K tokens/min.
 *
 * Casos de uso:
 *   - Precios de aceite de soya/palma en Colombia
 *   - Análisis de competidores y proveedores
 *   - Regulaciones del sector de aceites vegetales
 *   - Noticias del sector agroindustrial LATAM
 *   - Tendencias de mercado y commodity prices
 */
export const researchAgent = new Agent({
	name: "Research",
	id: "research-agent",
	purpose:
		"Investigación comercial: precios de mercado, competidores, proveedores, " +
		"regulaciones y tendencias del sector de aceites vegetales en LATAM",
	instructions: `Research Agent — inteligencia comercial de aceites vegetales (soya, palma) en Colombia/LATAM.

Busca: precios actualizados, proveedores mayoristas, tendencias, regulaciones importación/exportación, comparativas internacional vs local.

Fuentes prioritarias: fedepalma.org, dane.gov.co/SIPSA, agronegocios.co, asograsas.com.

Responde: cita fuente + fecha, distingue mayorista/minorista, precios en COP/kg, COP/litro, COP/ton.`,

	model: getAIModelChain("fast"), // Groq 70B / DeepSeek — sin rate limits
	tools: [
		webSearchTool, // Búsqueda web REST (Tavily/Serper)
		searchWebTool, // Fallback DuckDuckGo sin API key
	],
	temperature: 0.1,
	maxSteps: 3, // 3 búsquedas por consulta (el usuario puede pedir "busca más")
	maxOutputTokens: 1024,
});
