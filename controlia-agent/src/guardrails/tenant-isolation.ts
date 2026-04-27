import type { InputGuardrail } from "@voltagent/core";
import { getContextValue } from "../utils/context.js";

/**
 * Ensures that the system does not process operations
 * if the `vendedorId` is missing from the context.
 * This is the first line of defense for multi-tenancy.
 */
export const tenantGuardrail: InputGuardrail = {
	id: "tenant-isolation",
	name: "Aislamiento de Tenant (Vendedor)",

	handler: async ({ context }) => {
		const vendedorId =
			getContextValue(context, "userId") ||
			getContextValue(context, "vendedorId");

		if (!vendedorId) {
			return {
				pass: false,
				action: "block",
				message:
					"❌ Error interno: No se pudo identificar de forma segura tu contexto de negocio. Por favor contacta a soporte.",
			};
		}

		// El contexto es válido, permitimos continuar
		return { pass: true };
	},
};
