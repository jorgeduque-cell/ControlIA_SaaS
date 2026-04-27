import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	estadoResultados,
	rangoMesActual,
} from "../../services/analytics-queries.js";

export const pnlReportTool = createTool({
	name: "pnl_report",
	description:
		"Estado de resultados (P&G) del período solicitado. Calcula ingresos, costo de ventas, utilidad bruta, gastos operativos y utilidad neta con sus márgenes.",
	tags: ["finance", "read", "analytics"],

	parameters: z.object({
		desde: z
			.string()
			.nullish()
			.describe("Fecha inicio YYYY-MM-DD (default: primer día del mes actual)"),
		hasta: z
			.string()
			.nullish()
			.describe("Fecha fin YYYY-MM-DD (default: último día del mes actual)"),
	}),

	execute: async (params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const rango = rangoMesActual();
		if (params.desde) rango.desde = new Date(params.desde);
		if (params.hasta) rango.hasta = new Date(params.hasta);

		const pnl = await estadoResultados(vendedorId, rango);
		const fmt = (n: number) =>
			n.toLocaleString("es-CO", {
				style: "currency",
				currency: "COP",
				minimumFractionDigits: 0,
			});

		const message = [
			`📈 <b>Estado de resultados ${pnl.desde} → ${pnl.hasta}</b>`,
			`Pedidos facturados: ${pnl.pedidosCount}`,
			``,
			`Ingresos:      ${fmt(pnl.ingresos)}`,
			`Costo ventas: -${fmt(pnl.costoVentas)}`,
			`─────────────────`,
			`Utilidad bruta: ${fmt(pnl.utilidadBruta)}  (${pnl.margenBrutoPct}%)`,
			`Gastos op.:    -${fmt(pnl.gastosOperativos)}`,
			`─────────────────`,
			`<b>Utilidad neta: ${fmt(pnl.utilidadNeta)}  (${pnl.margenNetoPct}%)</b>`,
		].join("\n");

		return { success: true, message, ...pnl };
	},
});
