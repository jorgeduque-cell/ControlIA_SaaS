/**
 * Geocodificación de direcciones → coordenadas [lon, lat]
 *
 * Estrategia en capas:
 *   1. ORS Geocoding API (si ORS_API_KEY disponible) — más preciso
 *   2. Mapa de ciudades/barrios LATAM hardcodeado — fallback offline
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { config } from "../../config/env.js";

// ── Mapa de ciudades LATAM con coordenadas centrales ─────────────────────────
// [lon, lat] — formato VROOM/ORS
const CIUDAD_COORDS: Record<string, [number, number]> = {
	// Colombia
	bogota: [-74.0721, 4.711],
	bogotá: [-74.0721, 4.711],
	medellin: [-75.5636, 6.2518],
	medellín: [-75.5636, 6.2518],
	cali: [-76.532, 3.4516],
	barranquilla: [-74.7964, 10.9685],
	cartagena: [-75.5074, 10.391],
	bucaramanga: [-73.1198, 7.1254],
	pereira: [-75.6961, 4.8133],
	manizales: [-75.5207, 5.07],
	cucuta: [-72.5078, 7.8939],
	cucúta: [-72.5078, 7.8939],
	ibague: [-75.2324, 4.4389],
	ibagué: [-75.2324, 4.4389],
	"santa marta": [-74.2173, 11.2408],
	villavicencio: [-73.6294, 4.142],
	pasto: [-77.2814, 1.2136],
	monteria: [-75.8842, 8.7575],
	montería: [-75.8842, 8.7575],
	neiva: [-75.2961, 2.9273],
	armenia: [-75.6813, 4.5339],
	valledupar: [-73.25, 10.4779],
	// México
	"ciudad de mexico": [-99.1332, 19.4326],
	guadalajara: [-103.3494, 20.6597],
	monterrey: [-100.3162, 25.6866],
	// Perú
	lima: [-77.0428, -12.0464],
	// Ecuador
	quito: [-78.4678, -0.1807],
	guayaquil: [-79.9, -2.17],
	// Chile
	santiago: [-70.6483, -33.4569],
	// Argentina
	"buenos aires": [-58.3816, -34.6037],
};

export interface GeocodeResult {
	lon: number;
	lat: number;
	confidence: number;
	label: string;
	source: "ors" | "city_fallback" | "default";
}

/**
 * Geocodifica una dirección a coordenadas [lon, lat]
 */
export async function geocodeAddress(
	address: string,
	ciudad?: string,
): Promise<GeocodeResult> {
	const fullAddress = ciudad ? `${address}, ${ciudad}` : address;

	// ── Capa 1: ORS Geocoding API ─────────────────────────────────────────────
	if (config.ORS_API_KEY && config.ORS_API_KEY.length > 5) {
		try {
			const query = encodeURIComponent(fullAddress);
			const url =
				`https://api.openrouteservice.org/geocode/search` +
				`?api_key=${config.ORS_API_KEY}` +
				`&text=${query}` +
				`&size=1` +
				`&layers=address,venue,locality` +
				`&boundary.country=CO,MX,PE,EC,CL,AR,VE,BO,PY,UY`;

			const resp = await fetch(url, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(5000),
			});

			if (resp.ok) {
				const data = (await resp.json()) as {
					features?: {
						geometry: { coordinates: [number, number] };
						properties: { confidence?: number; label?: string };
					}[];
				};

				const feature = data.features?.[0];
				if (feature && feature.geometry.coordinates.length === 2) {
					const [lon, lat] = feature.geometry.coordinates;
					return {
						lon,
						lat,
						confidence: feature.properties.confidence ?? 0.5,
						label: feature.properties.label ?? fullAddress,
						source: "ors",
					};
				}
			}
		} catch {
			// ORS falló — continuar con fallback
		}
	}

	// ── Capa 2: Fallback por nombre de ciudad ─────────────────────────────────
	const searchText = (ciudad || address)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, ""); // quitar tildes para comparación

	for (const [cityKey, coords] of Object.entries(CIUDAD_COORDS)) {
		const normalizedKey = cityKey
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		if (
			searchText.includes(normalizedKey) ||
			normalizedKey.includes(searchText)
		) {
			return {
				lon: coords[0],
				lat: coords[1],
				confidence: 0.3,
				label: `${address} (aproximado — centro de ciudad)`,
				source: "city_fallback",
			};
		}
	}

	// ── Capa 3: Default — Bogotá centro ───────────────────────────────────────
	console.warn(
		`[Geocoding] No se pudo geocodificar: "${fullAddress}" — usando Bogotá centro`,
	);
	return {
		lon: -74.0721,
		lat: 4.711,
		confidence: 0.1,
		label: `${address} (sin geocodificar — usando Bogotá)`,
		source: "default",
	};
}

// ── VoltAgent Tool ────────────────────────────────────────────────────────────

export const geocodeAddressTool = createTool({
	name: "geocode_address",
	description:
		"Convierte una dirección en coordenadas GPS [longitud, latitud]. " +
		"Usa ORS Geocoding con fallback a coordenadas de ciudad. " +
		"Útil para ubicar clientes antes de optimizar rutas.",
	tags: ["routing", "geocoding", "location"],

	parameters: z.object({
		address: z
			.string()
			.describe("Dirección a geocodificar (ej: 'Calle 50 #30-20')"),
		ciudad: z
			.string()
			.nullish()
			.describe("Ciudad para contexto (ej: 'Medellín')"),
		clienteId: z
			.number()
			.int()
			.nullish()
			.describe("ID del cliente para guardar coordenadas en DB"),
	}),

	execute: async (params) => {
		try {
			const result = await geocodeAddress(
				params.address,
				params.ciudad ?? undefined,
			);

			return {
				success: true,
				message:
					`📍 <b>Geocodificación</b>\n` +
					`Dirección: ${params.address}\n` +
					`Coordenadas: ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}\n` +
					`Confianza: ${Math.round(result.confidence * 100)}%\n` +
					`Fuente: ${result.source === "ors" ? "ORS (precisión alta)" : result.source === "city_fallback" ? "Centro de ciudad (aproximado)" : "Default Bogotá"}`,
				lat: result.lat,
				lon: result.lon,
				confidence: result.confidence,
				label: result.label,
				source: result.source,
			};
		} catch (error) {
			return {
				success: false,
				message: "❌ Error al geocodificar la dirección",
				lat: 4.711,
				lon: -74.0721,
				confidence: 0,
				label: params.address,
				source: "default" as const,
			};
		}
	},
});
