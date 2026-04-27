import type { InputGuardrail } from "@voltagent/core";
import { prisma } from "../db/client.js";
import { getContextValue } from "../utils/context.js";

// Flag para modo offline (sin base de datos)
let isOfflineMode = false;

// Cache de vendedores para modo offline
const offlineVendedoresCache: Record<
	string,
	{
		id: bigint;
		nombre_negocio: string;
		estado: string;
		fecha_vencimiento: Date | null;
	}
> = {};

export const subscriptionGuardrail: InputGuardrail = {
	id: "subscription-check",
	name: "Verificación de Suscripción",

	handler: async ({ inputText, context }) => {
		const vendedorIdStr =
			getContextValue(context, "userId") ||
			getContextValue(context, "vendedorId");

		// Si estamos en modo offline, verificar cache
		if (isOfflineMode && vendedorIdStr) {
			const cached = offlineVendedoresCache[String(vendedorIdStr)];
			if (cached) {
				(context as Record<string, unknown>).vendedorNombre =
					cached.nombre_negocio;
				(context as Record<string, unknown>).vendedorPlan = "starter";
				(context as Record<string, unknown>).negocioNombre =
					cached.nombre_negocio;
				(context as Record<string, unknown>).vendedorId = String(vendedorIdStr);
				return { pass: true };
			}
		}

		if (!vendedorIdStr) {
			return {
				pass: false,
				action: "block",
				message:
					"👋 ¡Bienvenido a ControlIA!\n" +
					"No tienes una cuenta registrada o no pudimos identificar tu chat.\n" +
					"Usa /start para crear tu cuenta y comenzar tu prueba gratuita.",
			};
		}

		// Validar que el ID existe y no está vacío
		if (
			!vendedorIdStr ||
			vendedorIdStr === "undefined" ||
			vendedorIdStr === "null"
		) {
			return {
				pass: false,
				action: "block",
				message:
					"⚠️ No se pudo identificar tu cuenta. Por favor reinicia el chat con /start",
			};
		}

		let vendedorId: bigint;
		try {
			vendedorId = BigInt(String(vendedorIdStr));
		} catch (e) {
			return {
				pass: false,
				action: "block",
				message:
					"⚠️ Error de formato de cuenta. ID inválido: " +
					String(vendedorIdStr).substring(0, 20),
			};
		}

		let vendedor;
		try {
			vendedor = await prisma.vendedores.findUnique({
				where: { id: vendedorId },
			});
		} catch (dbError: any) {
			// Error de conexión a base de datos
			console.error("[Guardrail] Database connection error:", dbError?.message);

			// Activar modo offline
			isOfflineMode = true;

			// Crear vendedor temporal en cache
			offlineVendedoresCache[String(vendedorId)] = {
				id: vendedorId,
				nombre_negocio: "Modo Offline",
				estado: "Activo",
				fecha_vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
			};

			(context as Record<string, unknown>).vendedorNombre = "Vendedor";
			(context as Record<string, unknown>).vendedorPlan = "starter";
			(context as Record<string, unknown>).negocioNombre = "Distribuidora";
			(context as Record<string, unknown>).vendedorId = String(vendedorId);

			return {
				pass: true,
				// Inyectar advertencia en el mensaje de respuesta
				// pero permitir continuar
			};
		}

		if (!vendedor) {
			// Modo offline: crear vendedor temporal
			if (isOfflineMode) {
				offlineVendedoresCache[String(vendedorId)] = {
					id: vendedorId,
					nombre_negocio: "Vendedor " + vendedorId.toString().slice(-4),
					estado: "Activo",
					fecha_vencimiento: null,
				};

				(context as Record<string, unknown>).vendedorNombre =
					offlineVendedoresCache[String(vendedorId)].nombre_negocio;
				(context as Record<string, unknown>).vendedorPlan = "starter";
				(context as Record<string, unknown>).negocioNombre = "Tu Negocio";
				(context as Record<string, unknown>).vendedorId = String(vendedorId);

				return { pass: true };
			}

			return {
				pass: false,
				action: "block",
				message:
					"⚠️ Tu cuenta no fue encontrada. Usa /start para registrarte de forma gratuita.",
			};
		}

		// Check expiration
		if (
			vendedor.estado !== "Inactivo" &&
			vendedor.fecha_vencimiento &&
			vendedor.fecha_vencimiento < new Date()
		) {
			await prisma.vendedores.update({
				where: { id: vendedorId },
				data: { estado: "Inactivo" },
			});

			return {
				pass: false,
				action: "block",
				message:
					`⚠️ Tu suscripción venció el ${vendedor.fecha_vencimiento.toISOString().split("T")[0]}.\n\n` +
					"Tus datos están seguros, pero los módulos están temporalmente bloqueados.\n" +
					"Por favor renueva tu suscripción para continuar usando todos los superpoderes de ControlIA.",
			};
		}

		if (vendedor.estado === "Inactivo") {
			return {
				pass: false,
				action: "block",
				message:
					"⚠️ Tu suscripción está inactiva. Por favor renueva tu plan para seguir operando.",
			};
		}

		// PASS — inject vendor context into Voltagent for downstream tools and prompt generator
		(context as Record<string, unknown>).vendedorNombre =
			vendedor.nombre_negocio || "Comerciante";
		(context as Record<string, unknown>).vendedorPlan =
			vendedor.estado === "Prueba" ? "starter" : "pro";
		(context as Record<string, unknown>).negocioNombre =
			vendedor.nombre_negocio || "Tu Negocio";
		(context as Record<string, unknown>).vendedorId = vendedorIdStr;

		return { pass: true };
	},
};
