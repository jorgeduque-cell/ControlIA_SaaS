/**
 * Cierre del día — pregunta al usuario qué pasó con cada prospecto que
 * quedó en estado EN_RUTA hoy y todavía no se registró visita.
 *
 * Se invoca desde el heartbeat de las 6 PM o manualmente con "/cierre_dia".
 * Devuelve la lista de prospectos pendientes de respuesta + un guion para
 * que el LLM le pregunte uno por uno al usuario.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const cierreDiaTool = createTool({
	name: "cierre_dia_prospeccion",
	description:
		"Lista los prospectos que el vendedor sacó a ruta hoy y NO ha registrado visita aún. El supervisor debe usar esta lista para ir preguntando uno por uno qué pasó con cada cliente.",
	tags: ["sales", "prospeccion", "cierre"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const context = options?.context;
		const vendedorIdStr =
			context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const hoyInicio = new Date();
		hoyInicio.setHours(0, 0, 0, 0);

		// Prospectos en EN_RUTA sin visita registrada hoy
		const enRuta = await prisma.prospectos.findMany({
			where: {
				vendedor_id: vendedorId,
				estado: "EN_RUTA",
			},
			orderBy: { id: "asc" },
		});

		const idsEnRuta = enRuta.map((p) => p.id);
		const visitasHoy = await prisma.visitas_prospeccion.findMany({
			where: {
				vendedor_id: vendedorId,
				prospecto_id: { in: idsEnRuta },
				fecha: { gte: hoyInicio },
			},
			select: { prospecto_id: true },
		});
		const yaRegistrados = new Set(visitasHoy.map((v) => v.prospecto_id));
		const pendientes = enRuta.filter((p) => !yaRegistrados.has(p.id));

		if (pendientes.length === 0) {
			return {
				success: true,
				message:
					"✅ Cierre del día: todos los prospectos visitados hoy ya tienen feedback registrado.",
				pendientes: [],
			};
		}

		let msg = `📋 <b>CIERRE DEL DÍA</b>\n${pendientes.length} prospecto${pendientes.length === 1 ? "" : "s"} sin feedback de tu ruta de hoy:\n\n`;
		pendientes.forEach((p, i) => {
			msg += `<b>${i + 1}.</b> ${p.nombre}`;
			if (p.direccion) msg += ` — ${p.direccion}`;
			msg += "\n";
		});
		msg +=
			"\n¿Qué pasó con cada uno? Te voy a ir preguntando uno por uno, o si prefieres dime 'todos no atendieron' / 'el 1 y el 3 compraron' y yo registro.";

		return {
			success: true,
			message: msg,
			pendientes: pendientes.map((p) => ({
				id: p.id,
				nombre: p.nombre,
				direccion: p.direccion,
				telefono: p.telefono,
			})),
		};
	},
});
