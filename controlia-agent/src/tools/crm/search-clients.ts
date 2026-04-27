import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const searchClientsTool = createTool({
	name: "search_clients",
	description:
		"Buscar clientes en la cartera por nombre o ver la lista completa. " +
		"Útil para encontrar el ID de un cliente antes de agregar notas o pedidos.",
	tags: ["crm", "read", "client"],

	parameters: z.object({
		query: z
			.string()
			.nullish()
			.describe(
				"Nombre o parte del nombre del cliente a buscar. Si se omite, devuelve los últimos 10.",
			),
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

		const clients = await prisma.clientes.findMany({
			where: {
				vendedor_id: vendedorId,
				nombre: params.query
					? { contains: params.query, mode: "insensitive" }
					: undefined,
			},
			take: params.limit,
			orderBy: { nombre: "asc" },
			select: {
				id: true,
				nombre: true,
				direccion: true,
				estado: true,
				dia_visita: true,
			},
		});

		if (clients.length === 0) {
			return {
				success: true,
				message: params.query
					? `No encontré ningún cliente que coincida con "${params.query}".`
					: "Aún no tienes clientes registrados.",
				clients: [],
			};
		}

		return {
			success: true,
			message: `Encontré ${clients.length} cliente(s).`,
			clients: clients.map((c) => ({
				...c,
				id: Number(c.id),
			})),
		};
	},
});
