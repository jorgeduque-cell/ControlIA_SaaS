import { MCPClient, createTool } from "@voltagent/core";
import { z } from "zod";

/**
 * Tavily MCP — Búsqueda comercial avanzada via Model Context Protocol
 *
 * Conecta al MCP server oficial de Tavily (HTTP) en lugar de usar
 * la REST API directamente. Ventajas:
 *   - Protocolo estándar MCP (intercambiable con otros providers)
 *   - Acceso a tools adicionales: search, extract, crawl
 *   - Respuestas estructuradas con metadata enriquecida
 *
 * Requiere: TAVILY_API_KEY en .env
 * Endpoint: https://mcp.tavily.com/mcp/
 *
 * Herramientas disponibles:
 *   - tavily_mcp_search  → búsqueda web con AI answer
 *   - tavily_mcp_extract → extraer contenido de URLs
 */

let _client: MCPClient | null = null;

function getTavilyMCPClient(): MCPClient {
	if (_client) return _client;

	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey) {
		throw new Error(
			"TAVILY_API_KEY no está configurada en .env. " +
				"Obtén una gratis en https://tavily.com",
		);
	}

	_client = new MCPClient({
		clientInfo: { name: "controlia-agent", version: "1.0.0" },
		server: {
			type: "http",
			url: "https://mcp.tavily.com/mcp/",
			requestInit: {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
			},
		},
		timeout: 30000,
	});

	return _client;
}

/**
 * Búsqueda web con respuesta AI via Tavily MCP.
 * Mejor que web_search (REST) para:
 *   - Investigación comercial profunda (precios, competidores)
 *   - Noticias del sector energético LATAM
 *   - Regulaciones y normativas de distribución de combustibles
 *   - Análisis de mercado con respuesta directa de AI
 */
export const tavilyMCPSearchTool = createTool({
	name: "tavily_mcp_search",
	description:
		"Búsqueda comercial avanzada via Tavily MCP. Devuelve resultados web más " +
		"una respuesta AI directa. Ideal para investigar precios de combustibles, " +
		"noticias del sector energético LATAM, análisis de competidores, " +
		"regulaciones de distribución, y licitaciones públicas. " +
		"Usar 'advanced' para investigación profunda, 'basic' para consultas rápidas.",
	tags: ["research", "web", "mcp", "search", "commercial"],

	parameters: z.object({
		query: z.string().describe("Consulta de búsqueda en lenguaje natural"),
		search_depth: z
			.enum(["basic", "advanced"])
			.default("basic")
			.describe(
				"basic: rápido (2-3s); advanced: profundo, más resultados (5-10s)",
			),
		include_answer: z
			.boolean()
			.default(true)
			.describe("Incluir respuesta directa generada por Tavily AI"),
		max_results: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe("Número de páginas web a retornar (1-10)"),
		include_domains: z
			.array(z.string())
			.nullish()
			.describe(
				"Limitar búsqueda a estos dominios (ej: ['reuters.com', 'bloomberg.com'])",
			),
	}),

	execute: async (params) => {
		try {
			const client = getTavilyMCPClient();
			const result = await client.callTool({
				name: "tavily-search",
				arguments: {
					query: params.query,
					search_depth: params.search_depth,
					include_answer: params.include_answer,
					max_results: params.max_results,
					...(params.include_domains && {
						include_domains: params.include_domains,
					}),
				},
			} as Parameters<typeof client.callTool>[0]);

			return {
				success: true,
				mode: "live" as const,
				source: "tavily-mcp",
				result,
				query: params.query,
			};
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error("[tavily_mcp_search] Error:", msg);
			return {
				success: false,
				mode: "error" as const,
				error: msg,
				query: params.query,
				suggestion:
					"Verifica TAVILY_API_KEY en .env y conectividad a https://mcp.tavily.com",
			};
		}
	},
});

/**
 * Extrae contenido completo de URLs via Tavily MCP.
 * Útil para leer páginas de proveedores, documentos regulatorios,
 * convocatorias de licitaciones, contratos públicos.
 */
export const tavilyMCPExtractTool = createTool({
	name: "tavily_mcp_extract",
	description:
		"Extrae el contenido completo y estructurado de URLs específicas via Tavily MCP. " +
		"Útil para leer páginas de proveedores de combustible, documentos de regulación, " +
		"licitaciones y contratos, noticias completas sobre el sector energético LATAM. " +
		"Más preciso que web_search para URLs conocidas.",
	tags: ["research", "web", "mcp", "extract"],

	parameters: z.object({
		urls: z
			.array(z.string().url())
			.min(1)
			.max(5)
			.describe("Lista de URLs a extraer (máximo 5 por llamada)"),
	}),

	execute: async (params) => {
		try {
			const client = getTavilyMCPClient();
			const result = await client.callTool({
				name: "tavily-extract",
				arguments: { urls: params.urls },
			} as Parameters<typeof client.callTool>[0]);

			return {
				success: true,
				mode: "live" as const,
				source: "tavily-mcp",
				result,
				urls: params.urls,
			};
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error("[tavily_mcp_extract] Error:", msg);
			return {
				success: false,
				mode: "error" as const,
				error: msg,
				urls: params.urls,
			};
		}
	},
});
