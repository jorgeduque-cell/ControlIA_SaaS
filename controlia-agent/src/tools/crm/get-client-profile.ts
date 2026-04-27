import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const getClientProfileTool = createTool({
	name: "get_client_profile",
	description:
		"Obtener el perfil detallado de un cliente, incluyendo su historial de pedidos y notas.",
	tags: ["crm", "read", "client"],

	parameters: z.object({
		clienteId: z.number().int().describe("ID del cliente a consultar"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const client = await prisma.clientes.findUnique({
			where: { id: params.clienteId },
			include: {
				pedidos: {
					take: 5,
					orderBy: { fecha: "desc" },
				},
				notas_cliente: {
					take: 5,
					orderBy: { fecha: "desc" },
				},
			},
		});

		if (!client || client.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "Cliente no encontrado o sin permisos.",
			};
		}

		return {
			success: true,
			profile: {
				id: Number(client.id),
				nombre: client.nombre,
				telefono: client.telefono,
				direccion: client.direccion,
				estado: client.estado,
				dia_visita: client.dia_visita,
				resumen_pedidos: client.pedidos.map(
					(p) => `${p.cantidad}x ${p.producto} (${p.estado})`,
				),
				ultimas_notas: client.notas_cliente.map(
					(n) => `[${n.fecha?.toISOString().split("T")[0]}] ${n.texto}`,
				),
			},
		};
	},
});
