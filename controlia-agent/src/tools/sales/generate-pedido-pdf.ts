/**
 * Regenera el PDF de un pedido ya existente. El PDF primario se emite
 * automáticamente al momento de crear el pedido desde `create_order`; esta
 * tool se usa cuando el cliente o el vendedor pide "envíame el PDF del
 * pedido #N otra vez" o cuando se agruparon varios pedidos bajo el mismo
 * grupo_pedido.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	type PedidoData,
	type PedidoItem,
	generatePedidoPDF,
} from "../../services/pdf-generator.js";

export const generatePedidoPdfTool = createTool({
	name: "generate_pedido_pdf",
	description:
		"Generar/regenerar PDF de un PEDIDO (no cotización). Úsalo cuando el cliente pide el documento del pedido. Acepta pedidoId o grupoPedido (agrupa multi-línea). NO usar para cotizaciones — para eso existe generate_quotation.",
	tags: ["sales", "document", "pedido", "pdf"],

	parameters: z.object({
		pedidoId: z
			.number()
			.int()
			.nullish()
			.describe("ID de un pedido específico (tabla pedidos)."),
		grupoPedido: z
			.string()
			.nullish()
			.describe(
				"Identificador de grupo si un pedido multi-producto comparte grupo_pedido.",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorNombre =
			(context?.get("vendedorNombre") as string | undefined) ?? "Vendedor";
		const vendedorIdStr =
			context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible" };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		if (!params.pedidoId && !params.grupoPedido) {
			return {
				success: false,
				message: "Debes indicar pedidoId o grupoPedido.",
			};
		}

		const pedidos = await prisma.pedidos.findMany({
			where: {
				vendedor_id: vendedorId,
				...(params.pedidoId ? { id: params.pedidoId } : {}),
				...(params.grupoPedido ? { grupo_pedido: params.grupoPedido } : {}),
			},
			orderBy: { id: "asc" },
		});

		if (pedidos.length === 0) {
			return { success: false, message: "Pedido no encontrado." };
		}

		const clienteId = pedidos[0].cliente_id;
		const cliente = clienteId
			? await prisma.clientes.findUnique({ where: { id: clienteId } })
			: null;
		if (!cliente || cliente.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "Cliente del pedido no encontrado o sin permisos.",
			};
		}

		const items: PedidoItem[] = pedidos.map((p) => ({
			producto: p.producto,
			cantidad: p.cantidad,
			precioUnitario: p.precio_venta ?? 0,
			subtotal: (p.precio_venta ?? 0) * p.cantidad,
		}));
		const subtotal = items.reduce((s, i) => s + i.subtotal, 0);

		const primario = pedidos[0];
		const fecha = primario.fecha ?? new Date();
		const numero =
			params.grupoPedido ??
			`PED-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}-${String(Number(primario.id)).padStart(4, "0")}`;

		const data: PedidoData = {
			numero,
			fecha,
			estado: primario.estado ?? "Pendiente",
			estadoPago: primario.estado_pago ?? "Pendiente",
			cliente: {
				nombre: cliente.nombre,
				telefono: cliente.telefono ?? undefined,
				direccion: cliente.direccion ?? undefined,
			},
			vendedor: { nombre: vendedorNombre },
			items,
			subtotal,
			total: subtotal,
		};

		try {
			const pdfPath = await generatePedidoPDF(data);
			if (context) {
				context.set("lastPdfPath", pdfPath);
				context.set("lastPdfName", `${numero}.pdf`);
			}
			return {
				success: true,
				message: `📄 PDF del pedido ${numero} generado (${items.length} ítem${items.length === 1 ? "" : "s"}).`,
				numero,
				pdfPath,
			};
		} catch (e) {
			return {
				success: false,
				message: `❌ Error generando PDF: ${e instanceof Error ? e.message : "desconocido"}`,
			};
		}
	},
});
