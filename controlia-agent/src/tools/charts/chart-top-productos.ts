import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	rangoMesActual,
	topProductos,
} from "../../services/analytics-queries.js";
import { renderTopProductosChart } from "../../services/chart-generator.js";

export const chartTopProductosTool = createTool({
	name: "chart_top_productos",
	description:
		"Genera un gráfico PNG (barras horizontales) con los productos más vendidos por ingresos en el mes actual. Envía automáticamente por Telegram.",
	tags: ["sales", "analytics", "chart"],

	parameters: z.object({
		limit: z
			.number()
			.int()
			.min(3)
			.max(15)
			.nullish()
			.describe("Cuántos productos mostrar. Default 10."),
	}),

	execute: async (params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const limit = params.limit ?? 10;
		const top = await topProductos(vendedorId, rangoMesActual(), limit);
		if (top.length === 0) {
			return {
				success: false,
				message: "No hay ventas en el mes actual para graficar.",
			};
		}

		const chartPath = await renderTopProductosChart(vendedorId, top);
		if (ctx) {
			ctx.set("lastChartPath", chartPath);
			ctx.set("lastChartName", `top-productos-${vendedorId}.png`);
			ctx.set(
				"lastChartCaption",
				`🏆 Top ${top.length} productos del mes por ingresos`,
			);
		}

		const totalIngresos = top.reduce((s, t) => s + t.ingresos, 0);
		return {
			success: true,
			message: `Gráfico generado con ${top.length} productos. Ingresos acumulados: $${totalIngresos.toLocaleString()}.`,
			chartPath,
		};
	},
});
