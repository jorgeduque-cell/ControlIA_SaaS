import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const addProductTool = createTool({
	name: "add_product",
	description:
		"Agregar un nuevo producto al catálogo. " +
		"Incluye nombre, precios, stock inicial y stock mínimo para alertas.",
	tags: ["inventory", "write", "product"],

	parameters: z.object({
		nombre: z.string().min(1).describe("Nombre del producto"),
		precioCompra: z
			.number()
			.min(0)
			.describe("Precio de compra/costo por unidad"),
		precioVenta: z.number().min(0).describe("Precio de venta por unidad"),
		stockInicial: z
			.number()
			.int()
			.min(0)
			.default(0)
			.describe("Cantidad inicial en stock"),
		stockMinimo: z
			.number()
			.int()
			.min(0)
			.default(0)
			.describe("Stock mínimo para alertas (0 = sin alerta)"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const existing = await prisma.productos.findFirst({
			where: {
				vendedor_id: vendedorId,
				nombre: { equals: params.nombre, mode: "insensitive" },
			},
		});

		if (existing) {
			return {
				success: false,
				message: `⚠️ Ya existe un producto llamado "${existing.nombre}". Usa 'update_stock' para modificar su inventario o elige otro nombre.`,
			};
		}

		if (params.precioVenta < params.precioCompra) {
			return {
				success: false,
				message:
					"❌ El precio de venta no puede ser menor que el precio de compra.",
			};
		}

		const newProduct = await prisma.productos.create({
			data: {
				vendedor_id: vendedorId,
				nombre: params.nombre,
				precio_compra: params.precioCompra,
				precio_venta: params.precioVenta,
				stock_actual: params.stockInicial,
				stock_minimo: params.stockMinimo,
				fecha_creacion: new Date(),
				ultima_actualizacion: new Date(),
			},
		});

		const margen = params.precioVenta - params.precioCompra;
		const margenPorcentaje =
			params.precioCompra > 0
				? ((margen / params.precioCompra) * 100).toFixed(1)
				: "0";

		const formatter = new Intl.NumberFormat("es-CO", {
			style: "currency",
			currency: "COP",
			minimumFractionDigits: 0,
		});

		let message = "✅ <b>PRODUCTO CREADO</b>\n\n";
		message += `📦 <b>${params.nombre}</b>\n`;
		message += `🆔 ID: ${newProduct.id}\n\n`;
		message += `💲 Costo: ${formatter.format(params.precioCompra)}\n`;
		message += `💵 Venta: ${formatter.format(params.precioVenta)}\n`;
		message += `📈 Margen: ${formatter.format(margen)} (${margenPorcentaje}%)\n\n`;
		message += `📊 Stock inicial: ${params.stockInicial} unidades\n`;

		if (params.stockMinimo > 0) {
			message += `⚠️ Stock mínimo: ${params.stockMinimo} unidades (alerta activada)\n`;
		}

		return {
			success: true,
			message,
			producto: {
				id: Number(newProduct.id),
				nombre: params.nombre,
				precioCompra: params.precioCompra,
				precioVenta: params.precioVenta,
				stockInicial: params.stockInicial,
				margen,
			},
		};
	},
});
