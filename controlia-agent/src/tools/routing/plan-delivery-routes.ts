/**
 * Planificación de rutas de entrega — Tool principal
 *
 * Integra automáticamente:
 *   1. Pedidos pendientes desde la BD
 *   2. Geocodificación de clientes sin coordenadas (y las guarda para no repetir)
 *   3. Optimización VROOM via ORS
 *   4. Respuesta formateada en español lista para Telegram
 *
 * Casos de uso:
 *   - "planifica mis entregas de hoy"
 *   - "organiza la ruta del martes"
 *   - "optimiza el recorrido de ventas de esta semana"
 *   - "cuánto tiempo tomarán las entregas de mañana?"
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { geocodeAddress } from "./geocode-address.js";
import {
	type RouteJob,
	type RouteVehicle,
	optimizeWithVROOM,
} from "./optimize-route.js";

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function parseUserDate(input: string | undefined): Date {
	if (!input || input === "hoy") return new Date();
	if (input === "mañana" || input === "manana") {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return d;
	}
	if (input === "ayer") {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d;
	}
	// Intentar parsear fecha literal (dd/mm/yyyy o yyyy-mm-dd)
	const parsed = new Date(
		input.includes("/") ? input.split("/").reverse().join("-") : input,
	);
	return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDate(d: Date): string {
	return d.toISOString().split("T")[0]; // "2026-04-12"
}

function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Tool principal ────────────────────────────────────────────────────────────

export const planDeliveryRoutesTool = createTool({
	name: "plan_delivery_routes",
	description:
		"Planifica y optimiza la ruta de entregas/visitas del día usando VROOM (OpenRouteService). " +
		"Obtiene automáticamente los pedidos pendientes de la base de datos, geocodifica las " +
		"direcciones de los clientes que no tienen coordenadas, y genera la secuencia óptima " +
		"de visitas minimizando distancia y tiempo. " +
		"Úsalo cuando el usuario diga: 'planifica entregas', 'ruta de hoy', 'organiza visitas', " +
		"'optimiza mi recorrido', 'cuántas entregas tengo'.",
	tags: ["routing", "delivery", "optimization", "planning", "vroom"],

	parameters: z.object({
		fecha: z
			.string()
			.nullish()
			.describe(
				"Fecha de entregas: 'hoy', 'mañana', 'dd/mm/yyyy' (default: hoy)",
			),
		horaInicio: z
			.string()
			.nullish()
			.describe("Hora de inicio HH:MM (default: 07:00)"),
		horaFin: z
			.string()
			.nullish()
			.describe("Hora de fin HH:MM (default: 18:00)"),
		soloConDireccion: z
			.boolean()
			.nullish()
			.describe("Si true, omite clientes sin dirección registrada"),
		incluirPagados: z
			.boolean()
			.nullish()
			.describe(
				"Si true, incluye pedidos ya pagados (default: false — solo pendientes)",
			),
	}),

	execute: async (params, options) => {
		const agentContext = options?.context;
		const vendedorIdStr =
			agentContext?.get?.("userId") || agentContext?.get?.("vendedorId");
		if (!vendedorIdStr) {
			return {
				success: false,
				message: "❌ Contexto de vendedor no disponible",
			};
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const fechaTarget = parseUserDate(params.fecha ?? undefined);
		const fechaStr = formatDate(fechaTarget);
		const fechaLabel =
			params.fecha === "mañana" || params.fecha === "manana"
				? "Mañana"
				: params.fecha === "ayer"
					? "Ayer"
					: fechaStr === formatDate(new Date())
						? "Hoy"
						: fechaStr;

		try {
			// ── Paso 1: Obtener pedidos pendientes ───────────────────────────────
			type PedidoRow = {
				pedido_id: number;
				cliente_id: number | null;
				nombre: string | null;
				direccion: string | null;
				latitud: number | null;
				longitud: number | null;
				producto: string;
				cantidad: number;
				estado: string | null;
				estado_pago: string | null;
				telefono: string | null;
			};

			const estadoPago = params.incluirPagados
				? ["Pendiente", "Pagado"]
				: ["Pendiente"];

			const rawPedidos = await prisma.$queryRaw<PedidoRow[]>`
        SELECT
          p.id           AS pedido_id,
          p.cliente_id,
          c.nombre,
          c.direccion,
          c.latitud,
          c.longitud,
          c.telefono,
          p.producto,
          p.cantidad,
          p.estado,
          p.estado_pago
        FROM pedidos p
        LEFT JOIN clientes c ON c.id = p.cliente_id
        WHERE p.vendedor_id = ${vendedorId}
          AND p.estado_pago = ANY(${estadoPago}::text[])
          AND (
            p.fecha = ${fechaStr}::date
            OR (p.fecha IS NULL AND p.estado = 'Pendiente')
          )
        ORDER BY c.nombre ASC
      `;

			if (rawPedidos.length === 0) {
				return {
					success: true,
					message:
						`📭 <b>Sin entregas para ${fechaLabel}</b>\n\n` +
						`No hay pedidos pendientes registrados para esta fecha.\n` +
						`Puedes crear pedidos con el comando "nuevo pedido".`,
					stops: [],
					totalPedidos: 0,
				};
			}

			// ── Paso 2: Agrupar por cliente y geocodificar si falta coordenada ──
			type ClienteGroup = {
				clienteId: number | null;
				nombre: string;
				direccion: string | null;
				telefono: string | null;
				lat: number | null;
				lon: number | null;
				pedidos: { producto: string; cantidad: number }[];
				needsGeocode: boolean;
			};

			const clienteMap = new Map<string, ClienteGroup>();

			for (const p of rawPedidos) {
				const key =
					p.cliente_id != null
						? String(p.cliente_id)
						: `sin_cliente_${p.pedido_id}`;
				if (!clienteMap.has(key)) {
					clienteMap.set(key, {
						clienteId: p.cliente_id,
						nombre: p.nombre ?? "Cliente sin nombre",
						direccion: p.direccion ?? null,
						telefono: p.telefono ?? null,
						lat: p.latitud != null ? Number(p.latitud) : null,
						lon: p.longitud != null ? Number(p.longitud) : null,
						pedidos: [],
						needsGeocode:
							(p.latitud == null || p.longitud == null) && !!p.direccion,
					});
				}
				clienteMap
					.get(key)!
					.pedidos.push({ producto: p.producto, cantidad: p.cantidad });
			}

			// Geocodificar clientes sin coordenadas
			const geocodingPromises: Promise<unknown>[] = [];
			for (const [key, c] of clienteMap) {
				if (c.needsGeocode && c.direccion) {
					geocodingPromises.push(
						geocodeAddress(c.direccion)
							.then((res) => {
								c.lat = res.lat;
								c.lon = res.lon;
								// Guardar coordenadas en DB para no repetir
								if (c.clienteId != null && res.confidence > 0.2) {
									return prisma.clientes
										.update({
											where: { id: c.clienteId },
											data: { latitud: res.lat, longitud: res.lon },
										})
										.catch(() => {}); // ignorar error si falla
								}
							})
							.catch(() => {}),
					);
				}
				void key; // suprimir warning
			}

			await Promise.all(geocodingPromises);

			// Filtrar clientes con coordenadas válidas
			const clientesConCoords = Array.from(clienteMap.values()).filter(
				(c) => c.lat != null && c.lon != null,
			);
			const sinCoords = Array.from(clienteMap.values()).filter(
				(c) => c.lat == null || c.lon == null,
			);

			if (clientesConCoords.length === 0) {
				// Ninguno tiene coordenadas — listar igualmente sin optimizar
				const lista = Array.from(clienteMap.values())
					.map(
						(c, i) =>
							`${i + 1}. <b>${c.nombre}</b>${c.direccion ? `\n   📍 ${c.direccion}` : ""}\n   📦 ${c.pedidos.map((p) => `${p.cantidad} ${p.producto}`).join(", ")}`,
					)
					.join("\n\n");

				return {
					success: true,
					message:
						`📋 <b>ENTREGAS ${fechaLabel.toUpperCase()}</b>\n` +
						`⚠️ Sin coordenadas — lista sin optimizar\n` +
						`━━━━━━━━━━━━━━━━━━━━\n\n` +
						lista +
						`\n\n💡 <i>Agrega direcciones a los clientes para obtener rutas optimizadas</i>`,
					stops: [],
					totalPedidos: rawPedidos.length,
				};
			}

			// ── Paso 3: Construir jobs VROOM ─────────────────────────────────────
			const parseTime = (t: string): number => {
				const [h, m] = t.split(":").map(Number);
				return h * 3600 + m * 60;
			};

			const startSec = parseTime(params.horaInicio ?? "07:00");
			const endSec = parseTime(params.horaFin ?? "18:00");

			const jobs: RouteJob[] = clientesConCoords.map((c, i) => ({
				id: i + 1,
				clienteNombre: c.nombre,
				location: [c.lon!, c.lat!] as [number, number],
				service: 600, // 10 min por parada
				amount: [c.pedidos.reduce((sum, p) => sum + p.cantidad, 0)],
				description: c.pedidos
					.map((p) => `${p.cantidad} ${p.producto}`)
					.join(", "),
			}));

			// Inicio desde coordenadas del primer cliente (aprox al negocio del vendedor)
			const vehicles: RouteVehicle[] = [
				{
					id: 1,
					start: jobs[0].location,
					end: jobs[0].location,
					capacity: [99999], // Sin límite por ahora
					timeWindow: [startSec, endSec],
				},
			];

			// ── Paso 4: Optimizar ────────────────────────────────────────────────
			const result = await optimizeWithVROOM(jobs, vehicles, startSec);

			// ── Paso 5: Formatear respuesta ──────────────────────────────────────
			const clientesByJobId = new Map(
				clientesConCoords.map((c, i) => [i + 1, c]),
			);

			const totalCantidad = Array.from(clienteMap.values())
				.flatMap((c) => c.pedidos)
				.reduce((sum, p) => sum + p.cantidad, 0);

			let message = `🗺️ <b>RUTA OPTIMIZADA — ${fechaLabel.toUpperCase()}</b>\n`;
			message +=
				result.source === "ors_vroom"
					? `🏆 VROOM (OpenRouteService)\n`
					: `⚡ Algoritmo nearest-neighbor\n`;
			message += `━━━━━━━━━━━━━━━━━━━━\n`;
			message += `📦 ${rawPedidos.length} pedidos | ${clienteMap.size} clientes | ${totalCantidad} unid.\n`;
			message += `📍 ${result.stops.length} con coordenadas | ${result.totalDistanceKm}km | ${formatDuration(result.totalDurationMin)}\n\n`;

			for (const stop of result.stops) {
				const c = clientesByJobId.get(stop.jobId);
				const pedidoStr =
					c?.pedidos.map((p) => `${p.cantidad} ${p.producto}`).join(", ") ?? "";
				const tel = c?.telefono ? `📞 ${c.telefono}` : "";

				message += `${stop.order}. <b>${stop.clienteNombre}</b>\n`;
				message += `   🕐 ${stop.arrivalTime} | ⏱️ ${stop.serviceTime}\n`;
				message += `   📦 ${pedidoStr}\n`;
				if (c?.direccion) message += `   📍 ${c.direccion}\n`;
				if (tel) message += `   ${tel}\n`;
				message += "\n";
			}

			if (sinCoords.length > 0) {
				message += `⚠️ <b>Sin coordenadas (no incluidos en ruta):</b>\n`;
				for (const c of sinCoords) {
					const pedidoStr = c.pedidos
						.map((p) => `${p.cantidad} ${p.producto}`)
						.join(", ");
					message += `  • ${c.nombre}${c.direccion ? ` — ${c.direccion}` : " — sin dirección"} | ${pedidoStr}\n`;
				}
			}

			if (result.unassigned.length > 0) {
				message += `\n⚠️ ${result.unassigned.length} parada(s) no pudieron asignarse (fuera de horario)`;
			}

			return {
				success: true,
				message,
				stops: result.stops,
				totalPedidos: rawPedidos.length,
				totalClientes: clienteMap.size,
				totalDistanceKm: result.totalDistanceKm,
				totalDurationMin: result.totalDurationMin,
				source: result.source,
				sinCoordenadas: sinCoords.map((c) => c.nombre),
			};
		} catch (error) {
			console.error("[plan_delivery_routes] Error:", error);
			return {
				success: false,
				message:
					"❌ Error al planificar rutas: " +
					(error instanceof Error ? error.message : String(error)),
				stops: [],
				totalPedidos: 0,
			};
		}
	},
});
