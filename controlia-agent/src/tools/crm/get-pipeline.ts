import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const getPipelineTool = createTool({
	name: "get_pipeline",
	description:
		"Obtener un resumen del estado de la cartera (cuántos prospectos, clientes activos, etc.).",
	tags: ["crm", "read", "analytics"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const stats = await prisma.clientes.groupBy({
			by: ["estado"],
			where: { vendedor_id: vendedorId },
			_count: { _all: true },
		});

		if (stats.length === 0) {
			return {
				success: true,
				message: "No tienes clientes registrados para generar un pipeline.",
			};
		}

		const summary = stats
			.map((s) => `${s.estado || "Sin Estado"}: ${s._count._all}`)
			.join("\n");

		return {
			success: true,
			message: `Resumen de Cartera (Pipeline):\n${summary}`,
			data: stats,
		};
	},
});
