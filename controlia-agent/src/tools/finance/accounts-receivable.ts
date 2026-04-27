import { createTool } from "@voltagent/core";
import { z } from "zod";
import { formatearPrecio } from "../../config/oil-products.js";
import { prisma } from "../../db/client.js";

export const accountsReceivableTool = createTool({
	name: "analyze_accounts_receivable",
	description:
		"Analizar cuentas por cobrar con aging (0-30, 31-60, 60+ días) y clientes morosos.",
	tags: ["finance", "receivables", "collections"],

	parameters: z.object({
		incluirDetalleClientes: z.boolean().default(true),
		limiteClientes: z.number().default(10),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const deudasRaw = await prisma.$queryRaw<
			Array<{
				cliente_id: number | null;
				nombre: string | null;
				total_deuda: number;
				dias_mora: number | null;
			}>
		>`
      SELECT
        p.cliente_id,
        c.nombre,
        SUM(p.precio_venta * p.cantidad)::float AS total_deuda,
        EXTRACT(DAY FROM (NOW() - MIN(p.fecha)))::int AS dias_mora
      FROM pedidos p
      LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.vendedor_id = ${vendedorId}
        AND p.estado_pago != 'Pagado'
        AND p.precio_venta IS NOT NULL
      GROUP BY p.cliente_id, c.nombre
      HAVING SUM(p.precio_venta * p.cantidad) > 0
      ORDER BY dias_mora DESC NULLS LAST
    `;

		const clientesDeuda = deudasRaw.map((d) => ({
			nombre: d.nombre || `Cliente #${d.cliente_id}`,
			monto: d.total_deuda,
			dias: d.dias_mora || 0,
			limite: 0,
		}));

		const totalCartera = clientesDeuda.reduce((sum, c) => sum + c.monto, 0);

		const aging = {
			"0-30": clientesDeuda
				.filter((c) => c.dias <= 30)
				.reduce((s, c) => s + c.monto, 0),
			"31-60": clientesDeuda
				.filter((c) => c.dias > 30 && c.dias <= 60)
				.reduce((s, c) => s + c.monto, 0),
			"60+": clientesDeuda
				.filter((c) => c.dias > 60)
				.reduce((s, c) => s + c.monto, 0),
		};

		let report = `💳 **CUENTAS POR COBRAR**\n`;
		report += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
		report += `Total cartera: ${formatearPrecio(totalCartera)}\n`;
		report += `Clientes con deuda: ${clientesDeuda.length}\n\n`;

		if (totalCartera > 0) {
			report += `📊 **ANÁLISIS POR ANTIGÜEDAD**\n`;
			report += `  0-30 días:  ${formatearPrecio(aging["0-30"])} (${((aging["0-30"] / totalCartera) * 100).toFixed(0)}%)\n`;
			report += `  31-60 días: ${formatearPrecio(aging["31-60"])} (${((aging["31-60"] / totalCartera) * 100).toFixed(0)}%) ⚠️\n`;
			report += `  60+ días:   ${formatearPrecio(aging["60+"])} (${((aging["60+"] / totalCartera) * 100).toFixed(0)}%) 🔴\n\n`;
		} else {
			report += `✅ No hay cuentas por cobrar pendientes.\n\n`;
		}

		const morosos = clientesDeuda.filter((c) => c.dias > 30);
		if (morosos.length > 0) {
			report += `🔴 **CLIENTES MOROSOS (30+ días)**\n`;
			morosos.slice(0, params.limiteClientes).forEach((c) => {
				const emoji = c.dias > 60 ? "🔴" : "⚠️";
				report += `  ${emoji} ${c.nombre}\n`;
				report += `     ${formatearPrecio(c.monto)} - ${c.dias} días\n`;
			});
			report += `\n`;
		}

		const urgente = aging["31-60"] + aging["60+"];
		if (totalCartera > 0) {
			report += `⚡ **Total urgente (30+ días):** ${formatearPrecio(urgente)}\n\n`;
			report += `💡 **RECOMENDACIONES**\n`;
			report += `1. Contactar clientes 60+ días inmediatamente\n`;
			report += `2. Revisar límites de crédito de morosos\n`;
			report += `3. Considerar descuento por pronto pago (2-3%)\n`;
		}

		return {
			success: true,
			report,
			data: {
				totalCartera,
				aging,
				clientesMorosos: morosos.length,
				totalUrgente: urgente,
			},
		};
	},
});
