/**
 * get_weather — Clima actual + pronóstico usando Open-Meteo (sin API key)
 *
 * Útil para:
 *   - Planear rutas de entrega (lluvia → reprogramar)
 *   - Contextualizar el día del vendedor
 *   - Alertas climáticas en zonas rurales
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { geocodeAddress } from "../routing/geocode-address.js";

const WEATHER_CODE: Record<number, string> = {
	0: "☀️ Despejado",
	1: "🌤️ Mayormente despejado",
	2: "⛅ Parcialmente nublado",
	3: "☁️ Nublado",
	45: "🌫️ Neblina",
	48: "🌫️ Neblina con escarcha",
	51: "🌦️ Llovizna ligera",
	53: "🌦️ Llovizna moderada",
	55: "🌦️ Llovizna intensa",
	61: "🌧️ Lluvia ligera",
	63: "🌧️ Lluvia moderada",
	65: "🌧️ Lluvia fuerte",
	71: "🌨️ Nieve ligera",
	73: "🌨️ Nieve moderada",
	75: "🌨️ Nieve fuerte",
	80: "🌧️ Chubascos ligeros",
	81: "🌧️ Chubascos moderados",
	82: "⛈️ Chubascos violentos",
	95: "⛈️ Tormenta eléctrica",
	96: "⛈️ Tormenta con granizo ligero",
	99: "⛈️ Tormenta con granizo fuerte",
};

export const getWeatherTool = createTool({
	name: "get_weather",
	description:
		"Consulta el clima actual y pronóstico a 3 días para una ciudad o coordenadas GPS. " +
		"Útil antes de planificar rutas, visitas o entregas. No requiere API key (Open-Meteo).",
	tags: ["external", "weather", "planning"],

	parameters: z.object({
		ciudad: z
			.string()
			.nullish()
			.describe("Ciudad (ej: 'Medellín'). Si se omite, usar lat/lon."),
		lat: z.number().nullish().describe("Latitud"),
		lon: z.number().nullish().describe("Longitud"),
		dias: z
			.number()
			.int()
			.min(1)
			.max(7)
			.nullish()
			.describe("Días de pronóstico (1–7). Default 3."),
	}),

	execute: async (params) => {
		let lat = params.lat ?? null;
		let lon = params.lon ?? null;
		let label = params.ciudad ?? "";

		if ((lat === null || lon === null) && params.ciudad) {
			const geo = await geocodeAddress(params.ciudad, params.ciudad);
			lat = geo.lat;
			lon = geo.lon;
			label = geo.label;
		}

		if (lat === null || lon === null) {
			return {
				success: false,
				message: "❌ Necesito una ciudad o coordenadas lat/lon.",
			};
		}

		const dias = params.dias ?? 3;
		const url =
			`https://api.open-meteo.com/v1/forecast` +
			`?latitude=${lat}&longitude=${lon}` +
			`&current=temperature_2m,weather_code,precipitation,wind_speed_10m` +
			`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
			`&forecast_days=${dias}&timezone=auto`;

		try {
			const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
			if (!resp.ok) {
				return {
					success: false,
					message: `❌ Open-Meteo respondió ${resp.status}`,
				};
			}
			const data = (await resp.json()) as {
				current: {
					temperature_2m: number;
					weather_code: number;
					precipitation: number;
					wind_speed_10m: number;
				};
				daily: {
					time: string[];
					weather_code: number[];
					temperature_2m_max: number[];
					temperature_2m_min: number[];
					precipitation_sum: number[];
					precipitation_probability_max: number[];
				};
			};

			const c = data.current;
			let mensaje = `🌡️ <b>Clima ${label || `${lat.toFixed(2)},${lon.toFixed(2)}`}</b>\n\n`;
			mensaje += `<b>Ahora:</b> ${WEATHER_CODE[c.weather_code] ?? "—"} ${c.temperature_2m}°C`;
			if (c.precipitation > 0) mensaje += ` · ${c.precipitation}mm lluvia`;
			mensaje += ` · 💨 ${c.wind_speed_10m} km/h\n\n`;

			mensaje += `<b>Pronóstico ${dias} días:</b>\n`;
			for (let i = 0; i < data.daily.time.length; i++) {
				const fecha = new Date(data.daily.time[i]).toLocaleDateString("es-CO", {
					weekday: "short",
					day: "2-digit",
					month: "short",
				});
				const cond = WEATHER_CODE[data.daily.weather_code[i]] ?? "—";
				const tmin = Math.round(data.daily.temperature_2m_min[i]);
				const tmax = Math.round(data.daily.temperature_2m_max[i]);
				const probLluvia = data.daily.precipitation_probability_max[i] ?? 0;
				mensaje += `• ${fecha}: ${cond} ${tmin}–${tmax}°C`;
				if (probLluvia >= 30) mensaje += ` · 🌧️ ${probLluvia}%`;
				mensaje += "\n";
			}

			const alertaLluvia = data.daily.precipitation_probability_max[0] >= 60;
			if (alertaLluvia) {
				mensaje += `\n⚠️ Alta probabilidad de lluvia hoy — considera reprogramar entregas al aire libre.`;
			}

			return {
				success: true,
				message: mensaje,
				current: c,
				daily: data.daily,
				alertaLluvia,
			};
		} catch (error) {
			return {
				success: false,
				message: `❌ Error consultando Open-Meteo: ${error instanceof Error ? error.message : "desconocido"}`,
			};
		}
	},
});
