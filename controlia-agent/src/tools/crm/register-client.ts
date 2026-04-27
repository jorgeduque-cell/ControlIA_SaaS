import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const registerClientTool = createTool({
	name: "register_client",
	description:
		"Registrar un nuevo cliente en la cartera del vendedor. " +
		"Captura nombre, teléfono, dirección, tipo de negocio y ubicación GPS.",
	tags: ["crm", "write", "client"],

	parameters: z.object({
		nombre: z.string().describe("Nombre completo del cliente o negocio"),
		telefono: z
			.string()
			.nullish()
			.describe("Número de teléfono con código de país"),
		direccion: z.string().nullish().describe("Dirección física del negocio"),
		tipoNegocio: z
			.string()
			.nullish()
			.describe("Categoría: Tienda, Restaurante, etc."),
		latitud: z.number().nullish().describe("Latitud GPS del negocio"),
		longitud: z.number().nullish().describe("Longitud GPS del negocio"),
		diaVisita: z
			.string()
			.nullish()
			.describe(
				"Día asignado para visitas: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado o Domingo",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const createdClient = await prisma.clientes.create({
			data: {
				vendedor_id: vendedorId,
				nombre: params.nombre,
				telefono: params.telefono ?? null,
				direccion: params.direccion ?? null,
				tipo_negocio: params.tipoNegocio ?? null,
				estado: "Prospecto",
				fecha_registro: new Date(),
				ultima_interaccion: new Date(),
				latitud: params.latitud ?? null,
				longitud: params.longitud ?? null,
				dia_visita: params.diaVisita ?? null,
			},
		});

		return {
			success: true,
			clientId: Number(createdClient.id),
			message: `¡Listo! Cliente "${params.nombre}" registrado exitosamente.`,
		};
	},
});
