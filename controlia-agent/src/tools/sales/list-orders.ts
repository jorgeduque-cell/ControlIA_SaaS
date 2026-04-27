import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const listOrdersTool = createTool({
	name: "list_orders",
	description:
		"Listar pedidos realizados, filtrando por cliente o estado (Pendiente, Entregado).",
	tags: ["sales", "read", "order"],

	parameters: z.object({
		clienteId: z
			.number()
			.int()
			.nullish()
			.describe("ID del cliente para filtrar sus pedidos"),
		estado: z
			.enum(["Pendiente", "Entregado", "Cancelado"])
			.nullish()
			.describe("Estado del pedido"),
		limit: z
			.number()
			.int()
			.min(1)
			.max(50)
			.default(10)
			.describe("Cantidad máxima de resultados"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const orders = await prisma.pedidos.findMany({
			where: {
				vendedor_id: vendedorId,
				cliente_id: params.clienteId,
				estado: params.estado,
			},
			include: {
				clientes: {
					select: { nombre: true },
				},
			},
			take: params.limit,
			orderBy: { fecha: "desc" },
		});

		if (orders.length === 0) {
			return {
				success: true,
				message: "No se encontraron pedidos con esos criterios.",
				orders: [],
			};
		}

		const formatter = new Intl.NumberFormat("es-CO", {
			style: "currency",
			currency: "COP",
			minimumFractionDigits: 0,
		});

		return {
			success: true,
			message: `Listado de pedidos (${orders.length}):`,
			orders: orders.map((o) => ({
				id: Number(o.id),
				cliente: o.clientes?.nombre || "N/A",
				producto: o.producto,
				cantidad: o.cantidad,
				total: formatter.format((o.precio_venta || 0) * (o.cantidad || 0)),
				estado: o.estado,
				pago: o.estado_pago,
				fecha: o.fecha?.toISOString().split("T")[0],
			})),
		};
	},
});
