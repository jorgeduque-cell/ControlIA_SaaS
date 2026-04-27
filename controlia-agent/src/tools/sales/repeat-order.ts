import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const repeatOrderTool = createTool({
	name: "repeat_order",
	description: "Repetir el último pedido realizado por un cliente.",
	tags: ["sales", "write", "order"],

	parameters: z.object({
		clienteId: z
			.number()
			.int()
			.describe("ID del cliente cuyo pedido se desea repetir"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		// Get last order for this client
		const lastOrder = await prisma.pedidos.findFirst({
			where: {
				vendedor_id: vendedorId,
				cliente_id: params.clienteId,
			},
			orderBy: { fecha: "desc" },
		});

		if (!lastOrder) {
			return {
				success: false,
				message: "No encontré pedidos anteriores para este cliente.",
			};
		}

		// Create order + update inventory atomically
		const result = await prisma.$transaction(async (tx) => {
			const order = await tx.pedidos.create({
				data: {
					vendedor_id: vendedorId,
					cliente_id: params.clienteId,
					producto: lastOrder.producto,
					cantidad: lastOrder.cantidad,
					precio_compra: lastOrder.precio_compra,
					precio_venta: lastOrder.precio_venta,
					estado: "Pendiente",
					estado_pago: "Pendiente",
					fecha: new Date(),
				},
			});

			const product = await tx.productos.findFirst({
				where: {
					vendedor_id: vendedorId,
					nombre: { contains: lastOrder.producto, mode: "insensitive" },
				},
			});

			if (product) {
				const updateResult = await tx.productos.updateMany({
					where: { id: product.id, stock_actual: { gte: lastOrder.cantidad } },
					data: { stock_actual: { decrement: lastOrder.cantidad } },
				});
				if (updateResult.count === 0) {
					throw new Error(`Stock insuficiente para "${lastOrder.producto}".`);
				}
			}

			return order;
		});

		return {
			success: true,
			message: `¡Pedido repetido con éxito! Se creó un nuevo pedido de ${lastOrder.cantidad}x ${lastOrder.producto}.`,
			order: { ...result, id: Number(result.id) },
		};
	},
});
