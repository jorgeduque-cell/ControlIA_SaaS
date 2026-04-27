import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const addVisitNoteTool = createTool({
	name: "add_visit_note",
	description:
		"Agregar una nota de seguimiento o visita a un cliente específico.",
	tags: ["crm", "write", "note"],

	parameters: z.object({
		clienteId: z
			.number()
			.int()
			.describe("ID del cliente al que se le agrega la nota"),
		texto: z
			.string()
			.describe(
				"Contenido de la nota (ej: 'No estaba', 'Pidió que vuelva el martes')",
			),
		proximaVisita: z
			.string()
			.nullish()
			.describe("Día sugerido para la próxima visita (Lunes-Domingo)"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		// Verify client belongs to vendor
		const client = await prisma.clientes.findUnique({
			where: { id: params.clienteId },
		});

		if (!client || client.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "No encontré al cliente o no tienes permiso para editarlo.",
			};
		}

		// Create the note
		await prisma.notas_cliente.create({
			data: {
				vendedor_id: vendedorId,
				cliente_id: params.clienteId,
				texto: params.texto,
				fecha: new Date(),
			},
		});

		// Update client status if proximaVisita is provided
		if (params.proximaVisita) {
			await prisma.clientes.update({
				where: { id: params.clienteId },
				data: { dia_visita: params.proximaVisita },
			});
		}

		return {
			success: true,
			message: `Nota guardada para "${client.nombre}".${params.proximaVisita ? ` Próxima visita agendada para: ${params.proximaVisita}.` : ""}`,
		};
	},
});
