import { createTool } from "@voltagent/core";
import { z } from "zod";
import { cancelarRemision } from "../../services/remision-service.js";

export const cancelRemisionTool = createTool({
	name: "cancel_remision",
	description:
		"Cancela una remisión previamente confirmada: devuelve stock, marca pedidos como Cancelado, anula la cuenta por cobrar asociada y registra la acción en auditoría.",
	tags: ["sales", "write", "remision"],

	parameters: z.object({
		numero: z.string().describe("Número de remisión (ej: REM-2026-0001)"),
		motivo: z.string().min(3).describe("Motivo de la cancelación"),
	}),

	execute: async (params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const result = await cancelarRemision({
			vendedorId,
			pedidoGrupo: params.numero,
			motivo: params.motivo,
			usuarioId: String(vendedorIdStr),
		});

		if (!result.success) return result;

		return {
			success: true,
			message: `✅ Remisión ${params.numero} cancelada. ${result.pedidosCancelados} pedido(s) revertidos y stock devuelto.`,
			pedidosCancelados: result.pedidosCancelados,
		};
	},
});
