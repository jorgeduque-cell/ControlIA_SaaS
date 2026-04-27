import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const markPaidTool = createTool({
	name: "mark_paid",
	description:
		"Marcar un pedido como PAGADO. Esto también registra el ingreso en finanzas.",
	tags: ["sales", "write", "pago"],

	parameters: z.object({
		pedidoId: z.number().int().describe("ID del pedido pagado"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const order = await prisma.pedidos.findUnique({
			where: { id: params.pedidoId },
			include: { clientes: true },
		});

		if (!order || order.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "Pedido no encontrado o sin permisos.",
			};
		}

		const montoTotal = (order.precio_venta || 0) * (order.cantidad || 0);

		// Update order status
		await prisma.pedidos.update({
			where: { id: params.pedidoId },
			data: { estado_pago: "Pagado" },
		});

		// Record in finanzas
		await prisma.finanzas.create({
			data: {
				vendedor_id: vendedorId,
				tipo: "Ingreso",
				concepto: `Pago pedido #${params.pedidoId} - ${order.producto}`,
				monto: montoTotal,
				fecha: new Date(),
				pedido_id: params.pedidoId,
			},
		});

		return {
			success: true,
			message: `¡Pago registrado! El pedido #${params.pedidoId} de "${order.clientes?.nombre || "Cliente"}" por $${montoTotal.toLocaleString()} ha sido marcado como PAGADO. 💰`,
		};
	},
});
