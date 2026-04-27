/**
 * convert_currency — Conversión de divisas usando Frankfurter (ECB, sin API key)
 *
 * Útil para:
 *   - Cotizaciones a clientes en USD/EUR
 *   - Actualizar precio de importación
 *   - Comparar márgenes en divisas
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";

export const convertCurrencyTool = createTool({
	name: "convert_currency",
	description:
		"Convierte un monto entre divisas usando tasas del Banco Central Europeo (vía Frankfurter). " +
		"Soporta COP, USD, EUR, MXN, PEN, CLP, ARS, BRL, etc. Sin API key.",
	tags: ["external", "finance", "currency"],

	parameters: z.object({
		monto: z.number().describe("Monto a convertir"),
		desde: z.string().describe("Divisa origen (ej: USD, COP, EUR)"),
		hacia: z.string().describe("Divisa destino (ej: COP, USD)"),
	}),

	execute: async (params) => {
		const desde = params.desde.toUpperCase();
		const hacia = params.hacia.toUpperCase();

		if (desde === hacia) {
			return {
				success: true,
				message: `${params.monto} ${desde} = ${params.monto} ${hacia} (misma divisa)`,
				resultado: params.monto,
				tasa: 1,
			};
		}

		const url = `https://api.frankfurter.dev/v1/latest?base=${desde}&symbols=${hacia}`;

		try {
			const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
			if (!resp.ok) {
				return {
					success: false,
					message: `❌ Frankfurter respondió ${resp.status}. Divisa no soportada.`,
				};
			}
			const data = (await resp.json()) as {
				base: string;
				date: string;
				rates: Record<string, number>;
			};

			const tasa = data.rates[hacia];
			if (!tasa) {
				return {
					success: false,
					message: `❌ No hay tasa disponible para ${hacia}`,
				};
			}

			const resultado = params.monto * tasa;
			const fmtOrigen = params.monto.toLocaleString("es-CO", {
				maximumFractionDigits: 2,
			});
			const fmtDestino = resultado.toLocaleString("es-CO", {
				maximumFractionDigits: hacia === "COP" ? 0 : 2,
			});

			return {
				success: true,
				message:
					`💱 <b>Conversión</b>\n` +
					`${fmtOrigen} ${desde} = <b>${fmtDestino} ${hacia}</b>\n` +
					`Tasa: 1 ${desde} = ${tasa.toFixed(6)} ${hacia}\n` +
					`Fuente: ECB (${data.date})`,
				resultado,
				tasa,
				fecha: data.date,
			};
		} catch (error) {
			return {
				success: false,
				message: `❌ Error consultando Frankfurter: ${error instanceof Error ? error.message : "desconocido"}`,
			};
		}
	},
});
