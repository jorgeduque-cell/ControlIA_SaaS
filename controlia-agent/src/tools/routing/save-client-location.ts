/**
 * Guardar o actualizar coordenadas GPS de un cliente
 * Evita re-geocodificar en futuras rutas
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { geocodeAddress } from "./geocode-address.js";

export const saveClientLocationTool = createTool({
	name: "save_client_location",
	description:
		"Guarda o actualiza las coordenadas GPS de un cliente para usarlas en rutas de entrega. " +
		"Puede geocodificar automáticamente la dirección del cliente o recibir coordenadas directas. " +
		"Úsalo cuando: el usuario da una ubicación de un cliente, o para mejorar precisión de rutas.",
	tags: ["routing", "location", "client", "geocoding"],

	parameters: z.object({
		clienteId: z.number().int().describe("ID del cliente a actualizar"),
		lat: z.number().nullish().describe("Latitud directa (si ya la tienes)"),
		lon: z.number().nullish().describe("Longitud directa (si ya la tienes)"),
		direccion: z
			.string()
			.nullish()
			.describe("Dirección para geocodificar automáticamente"),
		ciudad: z
			.string()
			.nullish()
			.describe("Ciudad del cliente (mejora precisión del geocoding)"),
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

		try {
			// Verificar que el cliente pertenece al vendedor
			const cliente = await prisma.clientes.findFirst({
				where: { id: params.clienteId, vendedor_id: vendedorId },
			});

			if (!cliente) {
				return {
					success: false,
					message: `❌ Cliente #${params.clienteId} no encontrado`,
				};
			}

			let lat = params.lat;
			let lon = params.lon;
			let source = "manual";
			let confidence = 1.0;

			// Geocodificar si no vienen coordenadas directas
			if (
				(lat == null || lon == null) &&
				(params.direccion || cliente.direccion)
			) {
				const addr = params.direccion || cliente.direccion || "";
				const geo = await geocodeAddress(addr, params.ciudad ?? undefined);
				lat = geo.lat;
				lon = geo.lon;
				source = geo.source;
				confidence = geo.confidence;
			}

			if (lat == null || lon == null) {
				return {
					success: false,
					message:
						"❌ No se pudieron obtener coordenadas. Proporciona lat/lon o una dirección válida.",
				};
			}

			// Actualizar en DB
			await prisma.clientes.update({
				where: { id: params.clienteId },
				data: {
					latitud: lat,
					longitud: lon,
					...(params.direccion ? { direccion: params.direccion } : {}),
				},
			});

			return {
				success: true,
				message:
					`✅ <b>Ubicación guardada</b>\n` +
					`Cliente: <b>${cliente.nombre}</b>\n` +
					`Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}\n` +
					`Fuente: ${source === "ors" ? "ORS (alta precisión)" : source === "city_fallback" ? "Centro de ciudad" : "Manual"}\n` +
					`Confianza: ${Math.round(confidence * 100)}%\n\n` +
					`✅ Esta ubicación se usará en futuras rutas de entrega.`,
				lat,
				lon,
				clienteId: params.clienteId,
				clienteNombre: cliente.nombre,
				source,
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error guardando ubicación: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
