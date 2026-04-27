import { createTool } from "@voltagent/core";
import { z } from "zod";
import { agingCxC } from "../../services/analytics-queries.js";

export const agingReportTool = createTool({
	name: "aging_report",
	description:
		"Reporte de antigüedad de saldos (aging) de cuentas por cobrar. Segmenta deuda en buckets (al día, 1-30, 31-60, 61-90, +90 días) para detectar riesgo de cartera.",
	tags: ["finance", "read", "analytics"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const aging = await agingCxC(vendedorId);

		const fmt = (n: number) =>
			n.toLocaleString("es-CO", {
				style: "currency",
				currency: "COP",
				minimumFractionDigits: 0,
			});

		const lines = [
			`📊 <b>Aging de cartera</b>`,
			`Cuentas activas: ${aging.cuentasActivas}`,
			`Pendiente total: ${fmt(aging.totalPendiente)}`,
			`Vencido: ${fmt(aging.totalVencido)}`,
			``,
			...aging.buckets.map(
				(b) => `• ${b.rango}: ${b.cantidad} cta. → ${fmt(b.total)}`,
			),
		];

		return {
			success: true,
			message: lines.join("\n"),
			buckets: aging.buckets,
			totalPendiente: aging.totalPendiente,
			totalVencido: aging.totalVencido,
			cuentasActivas: aging.cuentasActivas,
		};
	},
});
