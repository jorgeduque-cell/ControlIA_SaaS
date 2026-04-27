import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	generateRemisionPDF,
	type RemisionItem,
} from "../../services/pdf-generator.js";
import { confirmarRemision } from "../../services/remision-service.js";

export const confirmRemisionTool = createTool({
	name: "confirm_remision",
	description:
		"Confirma uno o más pedidos pendientes como una remisión formal. Genera número REM-YYYY-NNNN, actualiza estado, registra movimiento de inventario, abre cuenta por cobrar (si es crédito) y emite PDF.",
	tags: ["sales", "write", "remision"],

	parameters: z.object({
		pedidoIds: z
			.array(z.number().int())
			.min(1)
			.describe("IDs de pedidos en estado Pendiente a confirmar"),
		esCredito: z
			.boolean()
			.nullish()
			.describe("true si la venta es a crédito (abre CxC)"),
		diasCredito: z
			.number()
			.int()
			.min(1)
			.nullish()
			.describe("Plazo de pago en días (default 30)"),
		notas: z.string().nullish().describe("Notas adicionales"),
	}),

	execute: async (params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const result = await confirmarRemision({
			vendedorId,
			pedidoIds: params.pedidoIds,
			esCredito: params.esCredito ?? false,
			diasCredito: params.diasCredito ?? 30,
			notas: params.notas ?? undefined,
			usuarioId: String(vendedorIdStr),
		});

		if (!result.success) return result;

		// Generar PDF con los datos del grupo recién creado
		const pedidos = await prisma.pedidos.findMany({
			where: { vendedor_id: vendedorId, grupo_pedido: result.pedidoGrupo },
		});
		const clienteId = pedidos[0]?.cliente_id;
		const cliente = clienteId
			? await prisma.clientes.findUnique({ where: { id: clienteId } })
			: null;

		const items: RemisionItem[] = pedidos.map((p) => ({
			producto: p.producto,
			cantidad: p.cantidad,
			precioUnitario: p.precio_venta ?? 0,
			subtotal: (p.precio_venta ?? 0) * p.cantidad,
		}));

		let pdfPath: string | undefined;
		try {
			pdfPath = await generateRemisionPDF({
				numero: result.numero,
				fecha: new Date(),
				cliente: {
					nombre: cliente?.nombre ?? "Cliente",
					telefono: cliente?.telefono ?? undefined,
					direccion: cliente?.direccion ?? undefined,
				},
				items,
				subtotal: result.total,
				total: result.total,
				esCredito: params.esCredito ?? false,
				fechaVencimiento:
					params.esCredito && params.diasCredito
						? new Date(
								Date.now() + (params.diasCredito ?? 30) * 24 * 60 * 60 * 1000,
							)
						: undefined,
				notas: params.notas ?? undefined,
			});
		} catch (pdfErr) {
			console.error("[confirm_remision] Error generando PDF:", pdfErr);
		}

		return {
			success: true,
			message: `✅ Remisión ${result.numero} confirmada. Total: $${result.total.toLocaleString("es-CO")}.${
				result.cxcId ? ` Cuenta por cobrar #${result.cxcId} abierta.` : ""
			}`,
			numero: result.numero,
			total: result.total,
			cxcId: result.cxcId ?? null,
			pdfPath: pdfPath ?? null,
		};
	},
});
