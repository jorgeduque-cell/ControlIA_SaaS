/**
 * Devuelve la ruta de prospección para el día.
 *
 * Sin geocodificación: las direcciones (sucias) se pasan a Google Maps
 * via URL `dir/?api=1&waypoints=...&travelmode=driving`. Maps las resuelve
 * en el cliente del usuario, mucho mejor que cualquier geocoder gratis para
 * direcciones tipo "BODEGA 7 LOCAL 11".
 *
 * Selección de ruta:
 *   - Si el usuario pasa rutaNumero, esa.
 *   - Si no: round-robin por día del año contra las rutas con prospectos
 *     PENDIENTES del vendedor. Reproducible: martes siempre da la misma.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

const ORIGIN_DEFAULT =
	process.env.RUTA_ORIGEN_DEFAULT ?? "Carrera 7 #71-21, Bogotá";

function buildMapsUrl(direcciones: string[], origen: string): string {
	const sufijo = ", Bogotá, Colombia";
	const waypoints = direcciones
		.slice(0, -1)
		.map((d) => encodeURIComponent(d + sufijo))
		.join("|");
	const destino = encodeURIComponent(direcciones[direcciones.length - 1] + sufijo);
	const origin = encodeURIComponent(origen);
	const base = "https://www.google.com/maps/dir/?api=1";
	const wpParam = waypoints ? `&waypoints=${waypoints}` : "";
	return `${base}&origin=${origin}&destination=${destino}${wpParam}&travelmode=driving`;
}

export const rutaHoyTool = createTool({
	name: "ruta_hoy",
	description:
		"Devuelve la ruta de prospección de HOY: lista de clientes con dirección/teléfono + link de Google Maps. Si no se pasa rutaNumero elige automáticamente por día. Sólo incluye prospectos PENDIENTES (no visitados aún).",
	tags: ["sales", "prospeccion", "ruta", "maps"],

	parameters: z.object({
		rutaNumero: z
			.number()
			.int()
			.nullish()
			.describe(
				"Número de ruta específico (1-29 = Bogotá, 100 = Cundinamarca). Si se omite, elige automático por día.",
			),
		zona: z
			.string()
			.nullish()
			.describe(
				"Filtro por zona si quieres que elija ruta dentro de una zona específica (ej: 'NORTE EXTREMO').",
			),
		origen: z
			.string()
			.nullish()
			.describe("Dirección de origen para la ruta. Default: oficina."),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr =
			context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		// Resolver qué ruta usar
		let rutaSeleccionada: { id: number; numero: number; zona: string } | null =
			null;

		if (params.rutaNumero) {
			const r = await prisma.rutas_prospeccion.findUnique({
				where: {
					vendedor_id_numero: {
						vendedor_id: vendedorId,
						numero: params.rutaNumero,
					},
				},
			});
			if (!r) {
				return {
					success: false,
					message: `❌ Ruta ${params.rutaNumero} no existe para este vendedor.`,
				};
			}
			rutaSeleccionada = { id: r.id, numero: r.numero, zona: r.zona };
		} else {
			const candidatas = await prisma.rutas_prospeccion.findMany({
				where: {
					vendedor_id: vendedorId,
					...(params.zona
						? { zona: { contains: params.zona, mode: "insensitive" } }
						: {}),
					prospectos: { some: { estado: "PENDIENTE" } },
				},
				orderBy: { numero: "asc" },
			});
			if (candidatas.length === 0) {
				return {
					success: false,
					message: params.zona
						? `❌ No hay rutas pendientes en la zona "${params.zona}".`
						: "❌ No hay rutas con prospectos pendientes. ¿Ya se cubrieron todas?",
				};
			}
			const dayOfYear = Math.floor(
				(Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
					86_400_000,
			);
			const r = candidatas[dayOfYear % candidatas.length];
			rutaSeleccionada = { id: r.id, numero: r.numero, zona: r.zona };
		}

		const prospectos = await prisma.prospectos.findMany({
			where: {
				vendedor_id: vendedorId,
				ruta_id: rutaSeleccionada.id,
				estado: "PENDIENTE",
			},
			orderBy: { id: "asc" },
		});

		if (prospectos.length === 0) {
			return {
				success: false,
				message: `✅ Ruta ${rutaSeleccionada.numero} (${rutaSeleccionada.zona}) ya está completa — todos los prospectos visitados.`,
			};
		}

		// Marcar como EN_RUTA hoy (para que el cierre del día los pregunte)
		await prisma.prospectos.updateMany({
			where: {
				id: { in: prospectos.map((p) => p.id) },
			},
			data: { estado: "EN_RUTA" },
		});

		const conDireccion = prospectos.filter(
			(p) => p.direccion && p.direccion.length > 3,
		);
		const sinDireccion = prospectos.length - conDireccion.length;

		const origen = params.origen ?? ORIGIN_DEFAULT;
		const mapsUrl =
			conDireccion.length > 0
				? buildMapsUrl(
						conDireccion.map((p) => p.direccion ?? ""),
						origen,
					)
				: null;

		// Mensaje formateado
		let msg = `🗺️ <b>RUTA ${String(rutaSeleccionada.numero).padStart(2, "0")} — ${rutaSeleccionada.zona}</b>\n`;
		msg += `${prospectos.length} clientes pendientes${sinDireccion > 0 ? ` (${sinDireccion} sin dirección)` : ""}\n\n`;
		prospectos.forEach((p, i) => {
			msg += `<b>${i + 1}.</b> ${p.nombre}\n`;
			if (p.direccion) msg += `   📍 ${p.direccion}\n`;
			if (p.telefono) msg += `   📞 ${p.telefono}\n`;
			if (p.vendedor_historico) msg += `   👤 ${p.vendedor_historico}\n`;
		});
		if (mapsUrl) {
			msg += `\n🧭 <a href="${mapsUrl}">Abrir ruta en Google Maps</a>`;
		}
		msg += `\n\n<i>Al final del día te preguntaré qué pasó con cada uno. Para registrar una visita ahora: "registrar visita a {nombre}".</i>`;

		return {
			success: true,
			message: msg,
			ruta: rutaSeleccionada,
			prospectos: prospectos.map((p) => ({
				id: p.id,
				nombre: p.nombre,
				direccion: p.direccion,
				telefono: p.telefono,
			})),
			mapsUrl,
		};
	},
});
