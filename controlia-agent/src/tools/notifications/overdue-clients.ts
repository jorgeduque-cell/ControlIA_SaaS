import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

/**
 * Obtiene clientes con pedidos sin pagar agrupados por antigüedad.
 * Usa la DB real de Render (tabla pedidos con estado_pago).
 */
export const overdueClientsTool = createTool({
	name: "get_overdue_clients",
	description:
		"Consultar clientes con cartera vencida (pedidos sin pagar) de aceite, " +
		"agrupados por antigüedad: reciente (1-30 días), urgente (31-60), crítico (60+). " +
		"Devuelve listado con nombres, montos y días de mora para enviar recordatorios.",
	tags: ["notifications", "finance", "collections"],

	parameters: z.object({
		diasMinimos: z
			.number()
			.int()
			.default(1)
			.describe("Solo mostrar deudas de al menos N días"),
		limite: z
			.number()
			.int()
			.default(20)
			.describe("Máximo de clientes a retornar"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) throw new Error("Contexto de vendedor no disponible");
		const vendedorId = BigInt(vendedorIdStr as string);

		const rows = await prisma.$queryRaw<
			Array<{
				cliente_id: number;
				nombre: string;
				telefono: string | null;
				total_deuda: number;
				pedidos_pendientes: number;
				fecha_mas_antigua: Date;
				dias_mora: number;
			}>
		>`
      SELECT
        c.id          AS cliente_id,
        c.nombre,
        c.telefono,
        SUM(p.cantidad * p.precio_venta)::float    AS total_deuda,
        COUNT(p.id)::int                           AS pedidos_pendientes,
        MIN(p.fecha)                               AS fecha_mas_antigua,
        (CURRENT_DATE - MIN(p.fecha))::int         AS dias_mora
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.vendedor_id = ${vendedorId}
        AND p.estado_pago = 'Pendiente'
        AND p.estado     != 'Cancelado'
        AND p.fecha IS NOT NULL
      GROUP BY c.id, c.nombre, c.telefono
      HAVING (CURRENT_DATE - MIN(p.fecha)) >= ${params.diasMinimos}
      ORDER BY dias_mora DESC
      LIMIT ${params.limite}
    `;

		if (!rows.length) {
			return {
				success: true,
				message:
					"✅ No hay clientes con cartera vencida. ¡Excelente gestión de cobros!",
				clientes: [],
				resumen: { total: 0, reciente: 0, urgente: 0, critico: 0 },
			};
		}

		const reciente = rows.filter((r) => r.dias_mora <= 30);
		const urgente = rows.filter((r) => r.dias_mora > 30 && r.dias_mora <= 60);
		const critico = rows.filter((r) => r.dias_mora > 60);

		const fmt = (n: number) =>
			new Intl.NumberFormat("es-CO", {
				style: "currency",
				currency: "COP",
				maximumFractionDigits: 0,
			}).format(n);

		const totalDeuda = rows.reduce((s, r) => s + r.total_deuda, 0);

		let msg = `💳 <b>CARTERA VENCIDA</b>\n`;
		msg += `Total: <b>${fmt(totalDeuda)}</b> — ${rows.length} clientes\n\n`;

		if (critico.length) {
			msg += `🔴 <b>CRÍTICO (60+ días)</b>\n`;
			critico.forEach((r) => {
				msg += `  • ${r.nombre} — ${fmt(r.total_deuda)} (${r.dias_mora} días)\n`;
				if (r.telefono) msg += `    📱 ${r.telefono}\n`;
			});
			msg += "\n";
		}
		if (urgente.length) {
			msg += `⚠️ <b>URGENTE (31-60 días)</b>\n`;
			urgente.forEach((r) => {
				msg += `  • ${r.nombre} — ${fmt(r.total_deuda)} (${r.dias_mora} días)\n`;
			});
			msg += "\n";
		}
		if (reciente.length) {
			msg += `🟡 <b>RECIENTE (1-30 días)</b>\n`;
			reciente.forEach((r) => {
				msg += `  • ${r.nombre} — ${fmt(r.total_deuda)} (${r.dias_mora} días)\n`;
			});
		}

		return {
			success: true,
			message: msg,
			clientes: rows.map((r) => ({
				clienteId: r.cliente_id,
				nombre: r.nombre,
				telefono: r.telefono,
				deuda: r.total_deuda,
				diasMora: r.dias_mora,
				pedidosPendientes: r.pedidos_pendientes,
				nivel:
					r.dias_mora > 60
						? "critico"
						: r.dias_mora > 30
							? "urgente"
							: "reciente",
			})),
			resumen: {
				total: totalDeuda,
				reciente: reciente.reduce((s, r) => s + r.total_deuda, 0),
				urgente: urgente.reduce((s, r) => s + r.total_deuda, 0),
				critico: critico.reduce((s, r) => s + r.total_deuda, 0),
			},
		};
	},
});
