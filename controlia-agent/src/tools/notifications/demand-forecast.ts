import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

/**
 * Forecast de demanda para aceite soya/palma.
 * Analiza histórico de pedidos (últimos 90 días) y proyecta necesidades de stock.
 */
export const demandForecastTool = createTool({
	name: "forecast_demand",
	description:
		"Proyectar demanda de aceite (soya/palma) para los próximos 30 días basado en " +
		"historial de ventas. Identifica productos con riesgo de quiebre de stock y " +
		"sugiere cantidades de reabastecimiento.",
	tags: ["inventory", "analytics", "forecast"],

	parameters: z.object({
		diasHistorial: z
			.number()
			.int()
			.default(90)
			.describe("Días de historial a analizar (default 90)"),
		diasProyeccion: z
			.number()
			.int()
			.default(30)
			.describe("Días a proyectar (default 30)"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) throw new Error("Contexto de vendedor no disponible");
		const vendedorId = BigInt(vendedorIdStr as string);

		// 1. Consumo promedio diario por producto (últimos N días)
		const consumo = await prisma.$queryRaw<
			Array<{
				producto: string;
				total_vendido: number;
				dias_con_ventas: number;
				promedio_diario: number;
			}>
		>`
      SELECT
        producto,
        SUM(cantidad)::float                              AS total_vendido,
        COUNT(DISTINCT fecha)::int                        AS dias_con_ventas,
        (SUM(cantidad)::float / ${params.diasHistorial}) AS promedio_diario
      FROM pedidos
      WHERE vendedor_id = ${vendedorId}
        AND estado != 'Cancelado'
        AND fecha >= CURRENT_DATE - ${params.diasHistorial}::int
      GROUP BY producto
      ORDER BY total_vendido DESC
    `;

		// 2. Stock actual
		const stocks = await prisma.inventario.findMany({
			where: { vendedor_id: vendedorId },
			select: { producto: true, stock_actual: true, stock_minimo: true },
		});

		const stockMap = new Map(stocks.map((s) => [s.producto.toLowerCase(), s]));

		const fmt = (n: number, unit = "") =>
			`${new Intl.NumberFormat("es-CO").format(Math.round(n))}${unit}`;

		let msg = `📈 <b>FORECAST DE DEMANDA — ${params.diasProyeccion} DÍAS</b>\n`;
		msg += `Basado en últimos ${params.diasHistorial} días de ventas\n\n`;

		const alertas: string[] = [];
		const recomendaciones: Array<{
			producto: string;
			comprarUnidades: number;
			diasCobertura: number;
		}> = [];

		for (const item of consumo) {
			const demandaProyectada = item.promedio_diario * params.diasProyeccion;
			const stock = stockMap.get(item.producto.toLowerCase());
			const stockActual = stock?.stock_actual ?? 0;
			const stockMinimo = stock?.stock_minimo ?? 0;

			const diasCobertura =
				item.promedio_diario > 0
					? Math.floor(stockActual / item.promedio_diario)
					: 999;

			const necesitaReabastecimiento = diasCobertura < params.diasProyeccion;
			const cantidadSugerida = Math.max(
				0,
				Math.ceil(demandaProyectada - stockActual + stockMinimo),
			);

			const emoji = diasCobertura < 7 ? "🔴" : diasCobertura < 15 ? "⚠️" : "✅";

			msg += `${emoji} <b>${item.producto}</b>\n`;
			msg += `   Venta diaria: ~${fmt(item.promedio_diario)} und/día\n`;
			msg += `   Proyección ${params.diasProyeccion}d: ${fmt(demandaProyectada)} und\n`;
			msg += `   Stock actual: ${fmt(stockActual)} und (${diasCobertura < 999 ? diasCobertura + " días" : "sin límite"})\n`;

			if (necesitaReabastecimiento && cantidadSugerida > 0) {
				msg += `   ⚡ <b>Comprar: ${fmt(cantidadSugerida)} und</b>\n`;
				alertas.push(`${item.producto}: quiebre en ${diasCobertura} días`);
				recomendaciones.push({
					producto: item.producto,
					comprarUnidades: cantidadSugerida,
					diasCobertura,
				});
			}
			msg += "\n";
		}

		if (alertas.length === 0) {
			msg += `✅ <b>Stock suficiente para los próximos ${params.diasProyeccion} días.</b>`;
		} else {
			msg += `⚡ <b>RESUMEN DE COMPRAS SUGERIDAS:</b>\n`;
			recomendaciones.forEach((r) => {
				msg += `  • ${r.producto}: ${fmt(r.comprarUnidades)} und (${r.diasCobertura}d cobertura actual)\n`;
			});
		}

		return {
			success: true,
			message: msg,
			alertas,
			recomendaciones,
			consumoPorProducto: consumo,
		};
	},
});
