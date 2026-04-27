import { createTool } from "@voltagent/core";
import { z } from "zod";
import { inventarioValorizado } from "../../services/analytics-queries.js";
import { renderInventarioChart } from "../../services/chart-generator.js";

export const chartInventarioTool = createTool({
	name: "chart_inventario",
	description:
		"Genera un gráfico PNG (barras) comparando valor costo vs. valor venta de los productos con más inventario. Envía automáticamente por Telegram.",
	tags: ["inventory", "analytics", "chart"],

	parameters: z.object({
		topN: z
			.number()
			.int()
			.min(5)
			.max(20)
			.nullish()
			.describe("Cuántos productos graficar. Default 10."),
	}),

	execute: async (params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const data = await inventarioValorizado(vendedorId);
		if (data.items.length === 0) {
			return {
				success: false,
				message: "No hay productos con inventario para graficar.",
			};
		}

		const topN = params.topN ?? 10;
		const chartPath = await renderInventarioChart(vendedorId, data, topN);
		if (ctx) {
			ctx.set("lastChartPath", chartPath);
			ctx.set("lastChartName", `inventario-${vendedorId}.png`);
			ctx.set(
				"lastChartCaption",
				`📦 Inventario valorizado — Top ${topN}`,
			);
		}

		return {
			success: true,
			message: `Gráfico generado. Valor costo total: $${data.totalValorCompra.toLocaleString()}, Valor venta total: $${data.totalValorVenta.toLocaleString()}, Margen potencial: $${data.margenPotencial.toLocaleString()}.`,
			chartPath,
		};
	},
});
