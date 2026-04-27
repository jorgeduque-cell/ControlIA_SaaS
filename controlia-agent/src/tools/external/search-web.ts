/**
 * search_web — Búsqueda web rápida
 *
 * Estrategia:
 *   1. DuckDuckGo Instant Answer API (gratis, sin key) — respuestas tipo knowledge panel
 *   2. Fallback: HTML lite de DuckDuckGo — primeros resultados
 *
 * Complementa al Research Agent (Tavily/Serper). Útil cuando no hay keys de pago.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

async function duckduckgoInstant(q: string): Promise<string | null> {
	try {
		const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
		const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
		if (!resp.ok) return null;
		const data = (await resp.json()) as {
			AbstractText?: string;
			AbstractSource?: string;
			AbstractURL?: string;
			Answer?: string;
			Definition?: string;
		};
		if (data.AbstractText) {
			return `📖 <b>${data.AbstractSource ?? "Fuente"}</b>: ${data.AbstractText}\n🔗 ${data.AbstractURL ?? ""}`;
		}
		if (data.Answer) return `✅ ${data.Answer}`;
		if (data.Definition) return `📘 ${data.Definition}`;
		return null;
	} catch {
		return null;
	}
}

async function duckduckgoHtml(
	q: string,
	limit: number,
): Promise<SearchResult[]> {
	try {
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
		const resp = await fetch(url, {
			headers: { "User-Agent": "Mozilla/5.0 (ControlIA/1.0)" },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) return [];
		const html = await resp.text();
		const results: SearchResult[] = [];
		const regex =
			/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(html)) && results.length < limit) {
			const rawUrl = match[1];
			const urlMatch = rawUrl.match(/uddg=([^&]+)/);
			const finalUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
			results.push({
				title: match[2].replace(/<[^>]+>/g, "").trim(),
				url: finalUrl,
				snippet: match[3].replace(/<[^>]+>/g, "").trim(),
			});
		}
		return results;
	} catch {
		return [];
	}
}

export const searchWebTool = createTool({
	name: "search_web",
	description:
		"Búsqueda web rápida sin API keys (DuckDuckGo). Úsalo para consultar información pública, " +
		"precios de mercado, noticias o datos que no están en el CRM. Para búsquedas más profundas usa research_web.",
	tags: ["external", "search", "web"],

	parameters: z.object({
		query: z.string().describe("Consulta a buscar"),
		limite: z
			.number()
			.int()
			.min(1)
			.max(10)
			.nullish()
			.describe("Número de resultados. Default 5."),
	}),

	execute: async (params) => {
		const limite = params.limite ?? 5;

		const instant = await duckduckgoInstant(params.query);
		const results = await duckduckgoHtml(params.query, limite);

		if (!instant && results.length === 0) {
			return {
				success: false,
				message: `🔍 Sin resultados para "${params.query}". Intenta reformular la búsqueda.`,
			};
		}

		let mensaje = `🔍 <b>Búsqueda:</b> ${params.query}\n\n`;
		if (instant) mensaje += instant + "\n\n";
		if (results.length > 0) {
			mensaje += `<b>Resultados:</b>\n`;
			results.forEach((r, i) => {
				mensaje += `${i + 1}. <b>${r.title}</b>\n   ${r.snippet}\n   🔗 ${r.url}\n`;
			});
		}

		return {
			success: true,
			message: mensaje,
			instant,
			results,
		};
	},
});
