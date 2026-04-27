/**
 * plan_my_day — Asistente personal para armar agenda diaria
 *
 * Combina:
 *   - Clientes del CRM (con día de visita asignado o sin visita reciente)
 *   - Pedidos pendientes de entrega
 *   - Ventanas de tiempo del usuario (bloques de estudio, reuniones, etc.)
 *
 * Devuelve una agenda con bloques horarios realistas respetando las ventanas
 * bloqueadas. No inventa datos — sólo usa lo que hay en la DB.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

type TimeBlock = {
	start: string; // HH:MM
	end: string;
	label: string;
	detalle?: string;
};

function parseHM(hm: string): number {
	const [h, m] = hm.split(":").map(Number);
	return h * 60 + (m || 0);
}
function fmtHM(total: number): string {
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function subtractBusy(
	start: number,
	end: number,
	busy: { start: number; end: number }[],
): { start: number; end: number }[] {
	// Devuelve los intervalos libres dentro de [start, end] tras restar busy
	const sorted = [...busy].sort((a, b) => a.start - b.start);
	const free: { start: number; end: number }[] = [];
	let cursor = start;
	for (const b of sorted) {
		if (b.end <= cursor) continue;
		if (b.start >= end) break;
		if (b.start > cursor)
			free.push({ start: cursor, end: Math.min(b.start, end) });
		cursor = Math.max(cursor, b.end);
		if (cursor >= end) break;
	}
	if (cursor < end) free.push({ start: cursor, end });
	return free.filter((f) => f.end - f.start >= 30); // descartar huecos <30 min
}

export const planMyDayTool = createTool({
	name: "plan_my_day",
	description:
		"Arma una agenda realista para el día pedido (hoy/mañana). Combina clientes del CRM, " +
		"pedidos pendientes y las ventanas bloqueadas del usuario (estudios, reuniones). " +
		"Devuelve bloques horarios con clientes a visitar, pedidos a entregar y huecos libres. " +
		"Úsalo cuando el usuario diga: 'prepara mi día', 'qué hago mañana', 'agéndame el día', " +
		"'organiza mi jornada'. Requiere que el usuario indique al menos una ventana libre o bloqueada.",
	tags: ["routing", "planning", "daily", "agenda"],

	parameters: z.object({
		dia: z
			.enum(["hoy", "mañana"])
			.nullish()
			.describe("Día a planificar. Default: mañana"),
		horaInicio: z
			.string()
			.nullish()
			.describe("Hora de inicio de la jornada HH:MM (default 07:00)"),
		horaFin: z
			.string()
			.nullish()
			.describe("Hora de fin de la jornada HH:MM (default 22:00)"),
		bloqueadas: z
			.array(
				z.object({
					inicio: z.string().describe("HH:MM"),
					fin: z.string().describe("HH:MM"),
					motivo: z
						.string()
						.describe(
							"Qué hace el usuario en ese bloque (ej: 'estudio', 'reunión familiar')",
						),
				}),
			)
			.nullish()
			.describe(
				"Ventanas ya ocupadas del día. Ejemplo: [{inicio:'18:40',fin:'22:00',motivo:'estudio'}]",
			),
		minDuracionVisita: z
			.number()
			.nullish()
			.describe("Duración mínima por visita/entrega en minutos. Default 45."),
		maxVisitas: z
			.number()
			.nullish()
			.describe("Número máximo de visitas sugeridas. Default 6."),
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

		// ── Fecha objetivo ────────────────────────────────────────────────
		const dia = params.dia ?? "mañana";
		const fecha = new Date();
		if (dia === "mañana") fecha.setDate(fecha.getDate() + 1);
		const nombreDiaEs = [
			"Domingo",
			"Lunes",
			"Martes",
			"Miércoles",
			"Jueves",
			"Viernes",
			"Sábado",
		][fecha.getDay()];
		const fechaStr = fecha.toLocaleDateString("es-CO", {
			day: "2-digit",
			month: "long",
			year: "numeric",
		});

		// ── Ventana del día + bloqueadas ──────────────────────────────────
		const dayStart = parseHM(params.horaInicio ?? "07:00");
		const dayEnd = parseHM(params.horaFin ?? "22:00");
		const busy = (params.bloqueadas ?? []).map((b) => ({
			start: parseHM(b.inicio),
			end: parseHM(b.fin),
			label: b.motivo,
		}));
		const freeSlots = subtractBusy(
			dayStart,
			dayEnd,
			busy.map((b) => ({ start: b.start, end: b.end })),
		);

		// ── Datos reales: clientes + pedidos pendientes ───────────────────
		const [clientes, pedidosPendientes] = await Promise.all([
			prisma.clientes.findMany({
				where: {
					vendedor_id: vendedorId,
					OR: [
						{ dia_visita: { equals: nombreDiaEs, mode: "insensitive" } },
						{ estado: "Prospecto" },
					],
				},
				orderBy: { ultima_interaccion: "asc" },
				take: 20,
			}),
			prisma.pedidos.findMany({
				where: {
					vendedor_id: vendedorId,
					estado: "Pendiente",
				},
				include: { clientes: true },
				orderBy: { fecha: "asc" },
				take: 20,
			}),
		]);

		// ── Priorización ──────────────────────────────────────────────────
		const maxVisitas = params.maxVisitas ?? 6;
		const minDur = params.minDuracionVisita ?? 45;

		// Prioridad 1: pedidos pendientes (hay que entregarlos)
		// Prioridad 2: clientes con día de visita = día pedido
		// Prioridad 3: prospectos sin pedidos
		type Activity = {
			tipo: "entrega" | "visita";
			nombre: string;
			detalle: string;
		};
		const activities: Activity[] = [];

		for (const p of pedidosPendientes) {
			if (activities.length >= maxVisitas) break;
			const cliente = p.clientes?.nombre ?? "Cliente";
			activities.push({
				tipo: "entrega",
				nombre: cliente,
				detalle: `Entregar ${p.cantidad}x ${p.producto}`,
			});
		}
		for (const c of clientes) {
			if (activities.length >= maxVisitas) break;
			if (activities.some((a) => a.nombre === c.nombre)) continue;
			activities.push({
				tipo: "visita",
				nombre: c.nombre,
				detalle:
					c.estado === "Prospecto"
						? "Primera visita (prospecto)"
						: "Visita de rutina",
			});
		}

		// ── Asignar a slots libres ────────────────────────────────────────
		const blocks: TimeBlock[] = [];
		const remaining = [...activities];

		for (const slot of freeSlots) {
			let cursor = slot.start;
			while (remaining.length > 0 && cursor + minDur <= slot.end) {
				const act = remaining.shift()!;
				blocks.push({
					start: fmtHM(cursor),
					end: fmtHM(cursor + minDur),
					label: `${act.tipo === "entrega" ? "🚚" : "🤝"} ${act.nombre}`,
					detalle: act.detalle,
				});
				cursor += minDur + 15; // 15 min buffer entre visitas
			}
		}

		// Agregar bloques bloqueados al resultado (para mostrar contexto)
		const displayBlocks: TimeBlock[] = [
			...blocks,
			...busy.map((b) => ({
				start: fmtHM(b.start),
				end: fmtHM(b.end),
				label: `🔒 ${b.label}`,
			})),
		].sort((a, b) => parseHM(a.start) - parseHM(b.start));

		// ── Mensaje formateado ────────────────────────────────────────────
		let mensaje = `📅 <b>Agenda ${dia.toUpperCase()} — ${nombreDiaEs}, ${fechaStr}</b>\n\n`;

		if (displayBlocks.length === 0) {
			mensaje +=
				"Sin bloques programados. No tienes pedidos pendientes ni clientes con visita asignada para este día.\n";
		} else {
			for (const b of displayBlocks) {
				mensaje += `<b>${b.start}–${b.end}</b>  ${b.label}`;
				if (b.detalle) mensaje += `\n   ${b.detalle}`;
				mensaje += "\n";
			}
		}

		const sinAsignar = remaining.length;
		if (sinAsignar > 0) {
			mensaje += `\n⚠️ ${sinAsignar} actividad${sinAsignar > 1 ? "es" : ""} sin espacio — considera extender la jornada o reducir bloqueos.\n`;
		}

		const totalPedidos = pedidosPendientes.length;
		const totalClientes = clientes.length;
		mensaje += `\n📊 Contexto: ${totalPedidos} pedido(s) pendiente(s), ${totalClientes} cliente(s) con visita posible.\n`;

		if (totalPedidos === 0 && totalClientes === 0) {
			mensaje +=
				"\n💡 No tienes nada en CRM aún. Empieza registrando tus primeros clientes con `registrar cliente <nombre>` o tus primeros pedidos.\n";
		}

		return {
			success: true,
			message: mensaje,
			agenda: displayBlocks,
			sinAsignar: remaining,
			stats: {
				pedidosPendientes: totalPedidos,
				clientesCRM: totalClientes,
				bloquesAsignados: blocks.length,
				bloquesLibres: freeSlots.length,
			},
		};
	},
});
