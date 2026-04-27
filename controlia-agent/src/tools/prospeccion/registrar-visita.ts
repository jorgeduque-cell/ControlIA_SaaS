/**
 * Registra el resultado de una visita a un prospecto.
 *
 * Se persiste en `visitas_prospeccion` (un registro por visita) y se
 * actualiza el `estado` del prospecto + `ultima_visita`. Esto es lo que el
 * usuario llena cada vez que el bot le pregunta "¿qué pasó con X?" al cerrar
 * el día (ver `cierre-dia-prospeccion.ts`).
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

const RESULTADOS = [
	"COMPRO",
	"MUY_INTERESADO",
	"INTERESADO",
	"NO_ATENDIO",
	"NO_APLICA",
] as const;

export const registrarVisitaTool = createTool({
	name: "registrar_visita_prospecto",
	description:
		"Registrar lo que pasó en una visita a un prospecto. Resultado: COMPRO, MUY_INTERESADO, INTERESADO, NO_ATENDIO, NO_APLICA. Acepta prospectoId o nombre (busca por contains).",
	tags: ["sales", "prospeccion", "visita"],

	parameters: z.object({
		prospectoId: z.number().int().nullish(),
		nombre: z
			.string()
			.nullish()
			.describe("Nombre del prospecto (matching parcial case-insensitive)."),
		resultado: z.enum(RESULTADOS),
		interes: z
			.number()
			.int()
			.min(1)
			.max(5)
			.nullish()
			.describe("Interés 1-5. Default 3."),
		proximaAccion: z.string().nullish(),
		notas: z.string().nullish(),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr =
			context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		if (!params.prospectoId && !params.nombre) {
			return {
				success: false,
				message: "Debes indicar prospectoId o nombre.",
			};
		}

		const prospecto = await prisma.prospectos.findFirst({
			where: {
				vendedor_id: vendedorId,
				...(params.prospectoId
					? { id: params.prospectoId }
					: { nombre: { contains: params.nombre!, mode: "insensitive" } }),
			},
		});
		if (!prospecto) {
			return {
				success: false,
				message: `❌ Prospecto no encontrado: "${params.nombre ?? params.prospectoId}".`,
			};
		}

		const nuevoEstado =
			params.resultado === "NO_APLICA"
				? "NO_APLICA"
				: params.resultado === "NO_ATENDIO"
					? "PENDIENTE" // vuelve a la cola para reintento
					: "VISITADO";

		const visita = await prisma.visitas_prospeccion.create({
			data: {
				vendedor_id: vendedorId,
				prospecto_id: prospecto.id,
				ruta_id: prospecto.ruta_id,
				resultado: params.resultado,
				interes: params.interes ?? 3,
				proxima_accion: params.proximaAccion,
				notas: params.notas,
			},
		});

		await prisma.prospectos.update({
			where: { id: prospecto.id },
			data: { estado: nuevoEstado, ultima_visita: new Date() },
		});

		const emoji =
			params.resultado === "COMPRO"
				? "✅"
				: params.resultado === "MUY_INTERESADO"
					? "🔥"
					: params.resultado === "INTERESADO"
						? "👍"
						: params.resultado === "NO_ATENDIO"
							? "🚪"
							: "❌";

		return {
			success: true,
			message: `${emoji} <b>${prospecto.nombre}</b> — ${params.resultado.replace("_", " ")}${params.interes ? ` (interés ${params.interes}/5)` : ""}${params.proximaAccion ? `\n   → ${params.proximaAccion}` : ""}`,
			visitaId: visita.id,
			prospectoId: prospecto.id,
			nuevoEstado,
		};
	},
});
