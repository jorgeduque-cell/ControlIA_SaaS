import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const deliverOrderTool = createTool({
	name: "deliver_order",
	description: "Marcar un pedido como ENTREGADO.",
	tags: ["sales", "write", "order"],

	parameters: z.object({
		pedidoId: z.number().int().describe("ID del pedido a entregar"),
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
		});

		if (!order || order.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "Pedido no encontrado o sin permisos.",
			};
		}

		await prisma.pedidos.update({
			where: { id: params.pedidoId },
			data: { estado: "Entregado" },
		});

		return {
			success: true,
			message: `El pedido #${params.pedidoId} ha sido marcado como ENTREGADO. 🚚`,
		};
	},
});
