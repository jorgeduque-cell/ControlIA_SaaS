/**
 * Optimización de rutas usando VROOM via OpenRouteService API
 *
 * VROOM resuelve VRP (Vehicle Routing Problem) con:
 *   - Múltiples vehículos / vendedores
 *   - Ventanas de tiempo por cliente (ej: solo recibe de 8am a 12pm)
 *   - Capacidad del vehículo (litros/unidades de aceite)
 *   - Minimización de distancia y tiempo total
 *
 * Si ORS no está disponible → fallback greedy nearest-neighbor en TypeScript puro
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { config } from "../../config/env.js";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface RouteJob {
	id: number;
	clienteNombre: string;
	location: [number, number]; // [lon, lat]
	service?: number; // segundos de servicio en el punto (default: 600 = 10min)
	amount?: number[]; // capacidad requerida (ej: [50] = 50 litros)
	timeWindows?: [number, number][]; // ventanas de tiempo [[desde, hasta]] en segundos desde medianoche
	description?: string;
}

export interface RouteVehicle {
	id: number;
	start: [number, number]; // [lon, lat] punto de inicio
	end?: [number, number]; // [lon, lat] punto final (default = start)
	capacity?: number[]; // capacidad del vehículo (ej: [500] = 500 litros)
	timeWindow?: [number, number]; // horario de trabajo [desde, hasta] en segundos
	profile?: "driving-car" | "driving-hgv"; // tipo de vehículo
}

export interface OptimizedStop {
	order: number;
	jobId: number;
	clienteNombre: string;
	location: [number, number];
	arrivalTime: string; // "08:30"
	serviceTime: string; // "10min"
	waitSeconds: number;
}

export interface OptimizationResult {
	success: boolean;
	source: "ors_vroom" | "greedy_fallback";
	stops: OptimizedStop[];
	totalDistanceKm: number;
	totalDurationMin: number;
	unassigned: number[]; // jobIds que no pudieron asignarse
	summary: string;
}

// ── Utilidades de tiempo ──────────────────────────────────────────────────────

function secondsToTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Fallback: greedy nearest-neighbor ────────────────────────────────────────

function haversineKm(a: [number, number], b: [number, number]): number {
	const R = 6371;
	const dLat = ((b[1] - a[1]) * Math.PI) / 180;
	const dLon = ((b[0] - a[0]) * Math.PI) / 180;
	const sinDlat = Math.sin(dLat / 2);
	const sinDlon = Math.sin(dLon / 2);
	const chord =
		sinDlat * sinDlat +
		Math.cos((a[1] * Math.PI) / 180) *
			Math.cos((b[1] * Math.PI) / 180) *
			sinDlon *
			sinDlon;
	return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function greedyRoute(
	jobs: RouteJob[],
	vehicle: RouteVehicle,
	startTimeSeconds = 25200, // 7:00am default
): OptimizationResult {
	const unvisited = [...jobs];
	const stops: OptimizedStop[] = [];
	let currentPos = vehicle.start;
	let currentTime = startTimeSeconds;
	let totalDist = 0;
	let order = 1;

	while (unvisited.length > 0) {
		// Encontrar el más cercano no visitado
		let nearest = 0;
		let nearestDist = Number.POSITIVE_INFINITY;

		for (let i = 0; i < unvisited.length; i++) {
			const d = haversineKm(currentPos, unvisited[i].location);
			if (d < nearestDist) {
				nearestDist = d;
				nearest = i;
			}
		}

		const job = unvisited.splice(nearest, 1)[0];
		// Estimar velocidad promedio urbana ~30km/h
		const travelSec = Math.round((nearestDist / 30) * 3600);
		currentTime += travelSec;
		totalDist += nearestDist;

		const serviceTime = job.service ?? 600;
		stops.push({
			order: order++,
			jobId: job.id,
			clienteNombre: job.clienteNombre,
			location: job.location,
			arrivalTime: secondsToTime(currentTime),
			serviceTime: `${Math.round(serviceTime / 60)}min`,
			waitSeconds: 0,
		});

		currentTime += serviceTime;
		currentPos = job.location;
	}

	const totalDurationMin = Math.round(
		stops.reduce((acc, s) => acc + Number.parseInt(s.serviceTime), 0) +
			(totalDist / 30) * 60,
	);

	return {
		success: true,
		source: "greedy_fallback",
		stops,
		totalDistanceKm: Math.round(totalDist * 10) / 10,
		totalDurationMin,
		unassigned: [],
		summary:
			`⚡ Ruta optimizada (nearest-neighbor) — ${stops.length} paradas | ` +
			`${Math.round(totalDist * 10) / 10}km | ${formatDuration(totalDurationMin)}`,
	};
}

// ── ORS VROOM Optimizer ───────────────────────────────────────────────────────

export async function optimizeWithVROOM(
	jobs: RouteJob[],
	vehicles: RouteVehicle[],
	startTimeSeconds = 25200,
): Promise<OptimizationResult> {
	if (!config.ORS_API_KEY || config.ORS_API_KEY.length < 5) {
		console.log("[RouteOptimizer] Sin ORS_API_KEY — usando greedy fallback");
		return greedyRoute(jobs, vehicles[0], startTimeSeconds);
	}

	// Construir payload VROOM
	const vroomJobs = jobs.map((j) => ({
		id: j.id,
		location: j.location,
		service: j.service ?? 600,
		...(j.amount ? { amount: j.amount } : {}),
		...(j.timeWindows ? { time_windows: j.timeWindows } : {}),
		description: j.description ?? j.clienteNombre,
	}));

	const vroomVehicles = vehicles.map((v) => ({
		id: v.id,
		profile: v.profile ?? "driving-car",
		start: v.start,
		end: v.end ?? v.start,
		...(v.capacity ? { capacity: v.capacity } : {}),
		...(v.timeWindow
			? { time_window: v.timeWindow }
			: { time_window: [startTimeSeconds, 72000] }),
	}));

	try {
		const resp = await fetch("https://api.openrouteservice.org/optimization", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: config.ORS_API_KEY!,
			},
			body: JSON.stringify({
				jobs: vroomJobs,
				vehicles: vroomVehicles,
			}),
			signal: AbortSignal.timeout(15000),
		});

		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			console.warn(
				`[RouteOptimizer] ORS error ${resp.status}: ${errText.slice(0, 200)} — usando greedy`,
			);
			return greedyRoute(jobs, vehicles[0], startTimeSeconds);
		}

		const data = (await resp.json()) as {
			routes?: {
				steps: {
					type: string;
					job?: number;
					arrival?: number;
					service?: number;
					waiting_time?: number;
					location?: [number, number];
				}[];
				distance?: number;
				duration?: number;
			}[];
			unassigned?: { id: number }[];
		};

		// Mapear respuesta VROOM → OptimizedStop[]
		const jobMap = new Map(jobs.map((j) => [j.id, j]));
		const stops: OptimizedStop[] = [];
		let totalDistM = 0;
		let totalDurS = 0;

		for (const route of data.routes ?? []) {
			totalDistM += route.distance ?? 0;
			totalDurS += route.duration ?? 0;

			for (const step of route.steps) {
				if (step.type !== "job" || step.job == null) continue;
				const job = jobMap.get(step.job);
				if (!job) continue;

				stops.push({
					order: stops.length + 1,
					jobId: step.job,
					clienteNombre: job.clienteNombre,
					location: step.location ?? job.location,
					arrivalTime: secondsToTime(step.arrival ?? 0),
					serviceTime: `${Math.round((step.service ?? job.service ?? 600) / 60)}min`,
					waitSeconds: step.waiting_time ?? 0,
				});
			}
		}

		const unassigned = (data.unassigned ?? []).map((u) => u.id);

		const totalDistKm = Math.round((totalDistM / 1000) * 10) / 10;
		const totalDurMin = Math.round(totalDurS / 60);

		return {
			success: true,
			source: "ors_vroom",
			stops,
			totalDistanceKm: totalDistKm,
			totalDurationMin: totalDurMin,
			unassigned,
			summary:
				`🗺️ Ruta VROOM optimizada — ${stops.length} paradas | ` +
				`${totalDistKm}km | ${formatDuration(totalDurMin)}` +
				(unassigned.length ? ` | ⚠️ ${unassigned.length} sin asignar` : ""),
		};
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			`[RouteOptimizer] ORS VROOM falló (${msg.slice(0, 80)}) — usando greedy fallback`,
		);
		return greedyRoute(jobs, vehicles[0], startTimeSeconds);
	}
}

// ── VoltAgent Tool ────────────────────────────────────────────────────────────

export const optimizeRouteTool = createTool({
	name: "optimize_route",
	description:
		"Optimiza el orden de visitas/entregas usando VROOM (via OpenRouteService). " +
		"Minimiza distancia y tiempo total respetando ventanas de tiempo y capacidad del vehículo. " +
		"Si ORS no está disponible usa algoritmo greedy nearest-neighbor como fallback.",
	tags: ["routing", "optimization", "vroom", "delivery"],

	parameters: z.object({
		jobs: z
			.array(
				z.object({
					id: z.number().int().describe("ID único del trabajo/parada"),
					clienteNombre: z.string().describe("Nombre del cliente"),
					lon: z.number().describe("Longitud del punto"),
					lat: z.number().describe("Latitud del punto"),
					service: z
						.number()
						.int()
						.nullish()
						.describe("Segundos de servicio en el punto (default: 600)"),
					cantidad: z
						.number()
						.nullish()
						.describe("Cantidad a entregar (litros/unidades)"),
				}),
			)
			.describe("Lista de trabajos/paradas a visitar"),
		vehicleStart: z
			.object({ lon: z.number(), lat: z.number() })
			.nullish()
			.describe("Coordenadas de inicio del vehículo (default: primera parada)"),
		vehicleCapacity: z
			.number()
			.nullish()
			.describe("Capacidad del vehículo en litros/unidades"),
		horaInicio: z
			.string()
			.nullish()
			.describe("Hora de inicio en formato HH:MM (default: 07:00)"),
		horaFin: z
			.string()
			.nullish()
			.describe("Hora de fin en formato HH:MM (default: 18:00)"),
	}),

	execute: async (params) => {
		try {
			if (params.jobs.length === 0) {
				return { success: false, message: "❌ No hay paradas para optimizar" };
			}

			const parseTime = (t: string): number => {
				const [h, m] = t.split(":").map(Number);
				return h * 3600 + m * 60;
			};

			const startSec = parseTime(params.horaInicio ?? "07:00");
			const endSec = parseTime(params.horaFin ?? "18:00");

			const jobs: RouteJob[] = params.jobs.map((j) => ({
				id: j.id,
				clienteNombre: j.clienteNombre,
				location: [j.lon, j.lat] as [number, number],
				service: j.service ?? 600,
				...(j.cantidad != null ? { amount: [Math.round(j.cantidad)] } : {}),
			}));

			const vehicleStart = params.vehicleStart
				? ([params.vehicleStart.lon, params.vehicleStart.lat] as [
						number,
						number,
					])
				: jobs[0].location;

			const vehicles: RouteVehicle[] = [
				{
					id: 1,
					start: vehicleStart,
					end: vehicleStart,
					...(params.vehicleCapacity
						? { capacity: [params.vehicleCapacity] }
						: {}),
					timeWindow: [startSec, endSec],
				},
			];

			const result = await optimizeWithVROOM(jobs, vehicles, startSec);

			if (!result.success || result.stops.length === 0) {
				return { success: false, message: "❌ No se pudo optimizar la ruta" };
			}

			let message = `📍 <b>RUTA OPTIMIZADA</b>\n`;
			message += `${result.source === "ors_vroom" ? "🗺️ VROOM (OpenRouteService)" : "⚡ Algoritmo greedy"}\n`;
			message += `━━━━━━━━━━━━━━━━━━━━\n`;
			message += `📊 ${result.stops.length} paradas | ${result.totalDistanceKm}km | ${formatDuration(result.totalDurationMin)}\n\n`;

			for (const stop of result.stops) {
				const wait =
					stop.waitSeconds > 0
						? ` (espera ${Math.round(stop.waitSeconds / 60)}min)`
						: "";
				message += `${stop.order}. <b>${stop.clienteNombre}</b>\n`;
				message += `   🕐 ${stop.arrivalTime} | ⏱️ ${stop.serviceTime}${wait}\n`;
			}

			if (result.unassigned.length > 0) {
				message += `\n⚠️ Sin asignar: ${result.unassigned.length} paradas (fuera del horario o capacidad)`;
			}

			return {
				success: true,
				message,
				stops: result.stops,
				totalDistanceKm: result.totalDistanceKm,
				totalDurationMin: result.totalDurationMin,
				source: result.source,
				unassigned: result.unassigned,
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error al optimizar ruta: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
