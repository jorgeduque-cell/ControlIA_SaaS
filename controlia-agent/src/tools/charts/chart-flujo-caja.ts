import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	flujoCaja,
	rangoMesActual,
} from "../../services/analytics-queries.js";
import { renderFlujoCajaChart } from "../../services/chart-generator.js";

export const chartFlujoCajaTool = createTool({
	name: "chart_flujo_caja",
	description:
		"Genera un gráfico PNG (línea) con el flujo de caja diario del mes actual: ingresos, egresos y neto. Envía automáticamente por Telegram.",
	tags: ["finance", "analytics", "chart"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const dias = await flujoCaja(vendedorId, rangoMesActual());
		if (dias.length === 0) {
			return {
				success: false,
				message: "No hay movimientos de caja este mes para graficar.",
			};
		}

		const chartPath = await renderFlujoCajaChart(vendedorId, dias);
		if (ctx) {
			ctx.set("lastChartPath", chartPath);
			ctx.set("lastChartName", `flujo-caja-${vendedorId}.png`);
			ctx.set("lastChartCaption", "💰 Flujo de caja del mes");
		}

		const neto = dias.reduce((s, d) => s + d.neto, 0);
		return {
			success: true,
			message: `Gráfico generado con ${dias.length} días. Neto acumulado: $${neto.toLocaleString()}.`,
			chartPath,
		};
	},
});
