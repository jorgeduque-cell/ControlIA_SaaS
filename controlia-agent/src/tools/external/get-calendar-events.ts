/**
 * get_calendar_events — Lee eventos de un calendario público vía ICS
 *
 * Soporta Google Calendar (link "dirección secreta en formato iCal"),
 * Outlook/Office365, Apple Calendar compartido, Notion Calendar.
 * URL configurable por variable de entorno CALENDAR_ICS_URL o pasada por param.
 *
 * Sin OAuth, sin API keys — sólo una URL pública.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { config } from "../../config/env.js";

interface ICSEvent {
	summary: string;
	start: Date;
	end: Date;
	location?: string;
	description?: string;
}

function parseICSDate(value: string): Date | null {
	const clean = value.replace(/[TZ]/g, "").replace(/-/g, "").replace(/:/g, "");
	if (clean.length < 8) return null;
	const y = Number(clean.slice(0, 4));
	const mo = Number(clean.slice(4, 6)) - 1;
	const d = Number(clean.slice(6, 8));
	const h = clean.length >= 10 ? Number(clean.slice(8, 10)) : 0;
	const mi = clean.length >= 12 ? Number(clean.slice(10, 12)) : 0;
	const s = clean.length >= 14 ? Number(clean.slice(12, 14)) : 0;
	const isUTC = value.endsWith("Z");
	return isUTC
		? new Date(Date.UTC(y, mo, d, h, mi, s))
		: new Date(y, mo, d, h, mi, s);
}

function parseICS(text: string): ICSEvent[] {
	const events: ICSEvent[] = [];
	const blocks = text.split(/BEGIN:VEVENT/).slice(1);
	for (const block of blocks) {
		const end = block.indexOf("END:VEVENT");
		const body = end >= 0 ? block.slice(0, end) : block;
		const lines = body.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
		const ev: Partial<ICSEvent> = {};
		for (const line of lines) {
			const colon = line.indexOf(":");
			if (colon < 0) continue;
			const rawKey = line.slice(0, colon);
			const value = line.slice(colon + 1);
			const key = rawKey.split(";")[0];
			if (key === "SUMMARY") ev.summary = value;
			else if (key === "LOCATION") ev.location = value;
			else if (key === "DESCRIPTION") ev.description = value;
			else if (key === "DTSTART") {
				const d = parseICSDate(value);
				if (d) ev.start = d;
			} else if (key === "DTEND") {
				const d = parseICSDate(value);
				if (d) ev.end = d;
			}
		}
		if (ev.summary && ev.start) {
			events.push({
				summary: ev.summary,
				start: ev.start,
				end: ev.end ?? ev.start,
				location: ev.location,
				description: ev.description,
			});
		}
	}
	return events;
}

export const getCalendarEventsTool = createTool({
	name: "get_calendar_events",
	description:
		"Lee los próximos eventos de un calendario público (Google Calendar, Outlook, Apple) vía URL ICS. " +
		"Requiere configurar CALENDAR_ICS_URL en env o pasar icsUrl como parámetro.",
	tags: ["external", "calendar", "planning"],

	parameters: z.object({
		icsUrl: z
			.string()
			.nullish()
			.describe(
				"URL pública del calendario en formato ICS. Si se omite, usa CALENDAR_ICS_URL del env.",
			),
		dias: z
			.number()
			.int()
			.min(1)
			.max(30)
			.nullish()
			.describe("Ventana de días hacia adelante. Default 7."),
		limite: z
			.number()
			.int()
			.min(1)
			.max(50)
			.nullish()
			.describe("Máximo de eventos. Default 10."),
	}),

	execute: async (params) => {
		const icsUrl =
			params.icsUrl ??
			(config as { CALENDAR_ICS_URL?: string }).CALENDAR_ICS_URL;
		if (!icsUrl) {
			return {
				success: false,
				message:
					"❌ No hay calendario configurado. Comparte el link ICS de tu Google/Outlook Calendar o " +
					"configura `CALENDAR_ICS_URL` en el servidor.",
			};
		}

		try {
			const resp = await fetch(icsUrl, { signal: AbortSignal.timeout(10000) });
			if (!resp.ok) {
				return {
					success: false,
					message: `❌ Calendario respondió ${resp.status}`,
				};
			}
			const text = await resp.text();
			const all = parseICS(text);

			const ahora = new Date();
			const dias = params.dias ?? 7;
			const limite = params.limite ?? 10;
			const limiteFecha = new Date(ahora.getTime() + dias * 86400_000);

			const proximos = all
				.filter((e) => e.start >= ahora && e.start <= limiteFecha)
				.sort((a, b) => a.start.getTime() - b.start.getTime())
				.slice(0, limite);

			if (proximos.length === 0) {
				return {
					success: true,
					message: `📅 No tienes eventos en los próximos ${dias} días.`,
					eventos: [],
				};
			}

			let mensaje = `📅 <b>Próximos ${proximos.length} eventos (${dias}d):</b>\n\n`;
			for (const e of proximos) {
				const fecha = e.start.toLocaleString("es-CO", {
					weekday: "short",
					day: "2-digit",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				mensaje += `• <b>${fecha}</b> — ${e.summary}`;
				if (e.location) mensaje += ` 📍 ${e.location}`;
				mensaje += "\n";
			}

			return {
				success: true,
				message: mensaje,
				eventos: proximos.map((e) => ({
					summary: e.summary,
					start: e.start.toISOString(),
					end: e.end.toISOString(),
					location: e.location,
				})),
			};
		} catch (error) {
			return {
				success: false,
				message: `❌ Error leyendo calendario: ${error instanceof Error ? error.message : "desconocido"}`,
			};
		}
	},
});
