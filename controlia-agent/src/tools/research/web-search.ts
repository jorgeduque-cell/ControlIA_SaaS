import { createTool } from "@voltagent/core";
import axios from "axios";
import { z } from "zod";

/**
 * Tool para buscar información en internet.
 * Prefiere Tavily (mejor para research de código) → Serper (Google Search) → fallback local.
 *
 * Para habilitar búsqueda real, configura una de estas keys en .env:
 *   - TAVILY_API_KEY  (1000 búsquedas/mes gratis en https://tavily.com)
 *   - SERPER_API_KEY  (2500 búsquedas gratis en https://serper.dev)
 *
 * Sin keys, el tool cae a una knowledge base local limitada. Cuando eso pasa,
 * la respuesta incluye `mode: "simulated"` para que el agente sepa que los
 * resultados son canned y no refleja el estado actual de internet.
 */
export const webSearchTool = createTool({
	name: "web_search",
	description:
		"Busca información actualizada en internet. Útil para investigar APIs, librerías, " +
		"documentación técnica y ejemplos de código. IMPORTANTE: si la respuesta tiene " +
		"`mode: 'simulated'`, los resultados son de una knowledge base local limitada, NO de internet real — " +
		"avisa al usuario que la búsqueda real no está configurada antes de tomar decisiones basadas en esos datos.",
	tags: ["research", "web", "search", "documentation"],

	parameters: z.object({
		query: z.string().describe("Consulta de búsqueda"),
		numResults: z.number().default(5).describe("Número de resultados (1-10)"),
		searchType: z
			.enum(["general", "code", "documentation"])
			.default("general")
			.describe("Tipo de búsqueda"),
	}),

	execute: async (params) => {
		const tavilyKey = process.env.TAVILY_API_KEY;
		const serperKey = process.env.SERPER_API_KEY;

		if (tavilyKey) {
			try {
				const response = await axios.post(
					"https://api.tavily.com/search",
					{
						api_key: tavilyKey,
						query: params.query,
						max_results: Math.min(params.numResults, 10),
						search_depth: params.searchType === "code" ? "advanced" : "basic",
					},
					{ headers: { "Content-Type": "application/json" } },
				);

				const results = response.data?.results || [];
				return {
					success: true,
					mode: "live" as const,
					provider: "tavily",
					message: `🔍 Tavily: ${results.length} resultados`,
					results: results.map(
						(r: { title: string; url: string; content: string }) => ({
							title: r.title,
							link: r.url,
							snippet: r.content,
						}),
					),
					query: params.query,
				};
			} catch (error) {
				console.error("[web_search] Tavily error:", error);
			}
		}

		if (serperKey) {
			try {
				const response = await axios.post(
					"https://google.serper.dev/search",
					{ q: params.query, num: Math.min(params.numResults, 10) },
					{
						headers: {
							"X-API-KEY": serperKey,
							"Content-Type": "application/json",
						},
					},
				);

				const results = response.data?.organic || [];
				return {
					success: true,
					mode: "live" as const,
					provider: "serper",
					message: `🔍 Serper: ${results.length} resultados`,
					results: results.map(
						(r: { title: string; link: string; snippet: string }) => ({
							title: r.title,
							link: r.link,
							snippet: r.snippet,
						}),
					),
					query: params.query,
				};
			} catch (error) {
				console.error("[web_search] Serper error:", error);
			}
		}

		return simulateSearch(params.query, params.searchType);
	},
});

/**
 * Simula búsqueda para desarrollo
 * Devuelve información útil basada en keywords
 */
function simulateSearch(query: string, type: string) {
	const lowerQuery = query.toLowerCase();

	// Base de conocimiento embebida para desarrollo
	const knowledgeBase: Record<string, any> = {
		"nodejs pdf": {
			title: "Cómo generar PDFs en Node.js",
			libraries: ["pdfkit", "puppeteer", "jspdf"],
			bestPractice: "Usar pdfkit para PDFs simples, puppeteer para HTML-to-PDF",
			codeExample: `import PDFDocument from "pdfkit";
const doc = new PDFDocument();
doc.text("Hola Mundo");
doc.end();`,
		},
		"whatsapp api": {
			title: "WhatsApp Business API para Node.js",
			libraries: ["whatsapp-web.js", "@whapi-sdk/whatsapp", "twilio"],
			bestPractice: "whatsapp-web.js para bots locales, Twilio para producción",
			codeExample: `import { Client } from "whatsapp-web.js";
const client = new Client();
client.on('qr', qr => console.log('QR:', qr));
client.initialize();`,
		},
		"ocr image": {
			title: "OCR (Reconocimiento de texto) en Node.js",
			libraries: [
				"tesseract.js",
				"@google-cloud/vision",
				"OpenAI GPT-4 Vision",
			],
			bestPractice:
				"GPT-4 Vision para documentos complejos, Tesseract.js para texto simple",
			codeExample: `// Usar GPT-4 Vision (ya implementado en read_image tool)`,
		},
		"qr code": {
			title: "Lectura de códigos QR en Node.js",
			libraries: ["qrcode-reader", "jsqr", "@zxing/library"],
			bestPractice: "jsqr para web, @zxing/library para Node.js",
			codeExample: `import jsQR from "jsqr";
const code = jsQR(imageData, width, height);
console.log(code.data);`,
		},
		"excel export": {
			title: "Exportar Excel en Node.js",
			libraries: ["xlsx", "exceljs", "csv-writer"],
			bestPractice:
				"xlsx para archivos .xlsx simples, exceljs para formato avanzado",
			codeExample: `import * as XLSX from "xlsx";
const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, "file.xlsx");`,
		},
	};

	// Buscar coincidencias
	let result = null;
	for (const [key, value] of Object.entries(knowledgeBase)) {
		if (lowerQuery.includes(key)) {
			result = value;
			break;
		}
	}

	if (result) {
		return {
			success: true,
			mode: "simulated" as const,
			provider: "local-knowledge-base",
			message: `⚠️ SIMULADO (no es búsqueda real): información canned sobre "${query}"`,
			result: result,
			warning:
				"Esta respuesta viene de una knowledge base local limitada, NO de internet. " +
				"Avisa al usuario antes de tomar decisiones técnicas basadas en este resultado. " +
				"Para búsquedas reales configura TAVILY_API_KEY (gratis en https://tavily.com) o SERPER_API_KEY en .env.",
		};
	}

	return {
		success: false,
		mode: "simulated" as const,
		provider: "local-knowledge-base",
		message: `⚠️ SIMULADO: "${query}" no está en la knowledge base local y no hay API de búsqueda configurada`,
		warning:
			"La búsqueda web real no está disponible. Pide al usuario configurar TAVILY_API_KEY (gratis) " +
			"en .env o reformula la tarea para no depender de información de internet.",
		query: query,
	};
}
