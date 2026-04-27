import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const updateStockTool = createTool({
	name: "update_stock",
	description:
		"Actualizar el stock de un producto. " +
		"Puede usarse para ingresar nueva mercancía (+), registrar pérdidas/daños (-), " +
		"o ajustar el inventario.",
	tags: ["inventory", "write", "stock"],

	parameters: z.object({
		productoId: z.number().int().describe("ID del producto a actualizar"),
		cantidad: z.number().int().describe("Cantidad a agregar (+) o restar (-)"),
		motivo: z
			.string()
			.nullish()
			.describe(
				"Motivo del movimiento (ej: 'Ingreso proveedor', 'Ajuste inventario', 'Pérdida')",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const product = await prisma.productos.findUnique({
			where: { id: params.productoId },
		});

		if (!product || product.vendedor_id !== vendedorId) {
			return {
				success: false,
				message:
					"❌ Producto no encontrado o no tienes permisos para editarlo.",
			};
		}

		const stockActual = product.stock_actual || 0;
		const nuevoStock = stockActual + params.cantidad;

		if (nuevoStock < 0) {
			return {
				success: false,
				message: `❌ No puedes descontar ${Math.abs(params.cantidad)} unidades. Solo tienes ${stockActual} en stock.`,
			};
		}

		const updateResult = await prisma.productos.updateMany({
			where: {
				id: params.productoId,
				...(params.cantidad < 0
					? { stock_actual: { gte: Math.abs(params.cantidad) } }
					: {}),
			},
			data: {
				stock_actual: { increment: params.cantidad },
				ultima_actualizacion: new Date(),
			},
		});

		if (updateResult.count === 0) {
			return {
				success: false,
				message: `❌ No se pudo actualizar el stock. Verifica permisos o disponibilidad.`,
			};
		}

		const updatedProduct = await prisma.productos.findUnique({
			where: { id: params.productoId },
		});

		if (!updatedProduct) {
			return {
				success: false,
				message: "❌ Error inesperado al leer el producto actualizado.",
			};
		}

		let emoji = "📝";
		let accion = "ajustado";

		if (params.cantidad > 0) {
			emoji = "📥";
			accion = "incrementado";
		} else if (params.cantidad < 0) {
			emoji = "📤";
			accion = "decrementado";
		}

		let message = `${emoji} <b>STOCK ACTUALIZADO</b>\n\n`;
		message += `📦 Producto: <b>${product.nombre}</b>\n`;
		message += `📊 Stock anterior: ${stockActual} unidades\n`;
		message += `📈 Cambio: ${params.cantidad > 0 ? "+" : ""}${params.cantidad} unidades\n`;
		message += `📦 <b>Nuevo stock: ${nuevoStock} unidades</b>\n`;

		if (params.motivo) {
			message += `📝 Motivo: ${params.motivo}\n`;
		}

		const stockMinimo = product.stock_minimo || 0;
		if (nuevoStock === 0) {
			message +=
				"\n⚠️ <b>ALERTA:</b> Producto AGOTADO. Recomendado reabastecer.";
		} else if (stockMinimo > 0 && nuevoStock <= stockMinimo) {
			message += `\n⚠️ <b>ALERTA:</b> Stock BAJO (mínimo: ${stockMinimo}). Considera reordenar.`;
		}

		return {
			success: true,
			message,
			producto: {
				id: Number(product.id),
				nombre: product.nombre,
				stockAnterior: stockActual,
				stockNuevo: nuevoStock,
				cambio: params.cantidad,
			},
		};
	},
});
