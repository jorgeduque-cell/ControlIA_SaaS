import { createTool } from "@voltagent/core";
import { z } from "zod";
import { agingCxC } from "../../services/analytics-queries.js";
import { renderAgingChart } from "../../services/chart-generator.js";

export const chartAgingTool = createTool({
	name: "chart_aging",
	description:
		"Genera un gráfico PNG (doughnut) con el aging de cuentas por cobrar. Úsalo cuando el usuario pida 'gráfica', 'visual' o 'chart' de la cartera. El PNG se envía AUTOMÁTICAMENTE por Telegram — no intentes enviarlo manualmente.",
	tags: ["finance", "analytics", "chart"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const aging = await agingCxC(vendedorId);
		if (aging.cuentasActivas === 0) {
			return {
				success: false,
				message: "No hay cuentas por cobrar activas para graficar.",
			};
		}

		const chartPath = await renderAgingChart(vendedorId, aging.buckets);
		if (ctx) {
			ctx.set("lastChartPath", chartPath);
			ctx.set("lastChartName", `aging-${vendedorId}.png`);
			ctx.set("lastChartCaption", "📊 Aging de cartera");
		}

		return {
			success: true,
			message: `Gráfico generado. Cuentas activas: ${aging.cuentasActivas}. Pendiente: $${aging.totalPendiente.toLocaleString()}, Vencido: $${aging.totalVencido.toLocaleString()}.`,
			chartPath,
		};
	},
});
