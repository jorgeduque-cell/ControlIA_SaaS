import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const getPricesTool = createTool({
	name: "get_prices",
	description: "Consultar el catálogo de productos y sus precios de venta.",
	tags: ["sales", "read", "product"],

	parameters: z.object({
		query: z
			.string()
			.nullish()
			.describe(
				"Nombre del producto a buscar. Si se omite, muestra los más populares.",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const products = await prisma.productos.findMany({
			where: {
				vendedor_id: vendedorId,
				nombre: params.query
					? { contains: params.query, mode: "insensitive" }
					: undefined,
			},
			orderBy: { nombre: "asc" },
		});

		if (products.length === 0) {
			return {
				success: true,
				message: params.query
					? `No encontré productos que coincidan con "${params.query}".`
					: "Tu catálogo de productos está vacío.",
				products: [],
			};
		}

		const formatter = new Intl.NumberFormat("es-CO", {
			style: "currency",
			currency: "COP",
			minimumFractionDigits: 0,
		});

		return {
			success: true,
			message: `Encontré ${products.length} producto(s).`,
			products: products.map((p) => ({
				nombre: p.nombre,
				precio: formatter.format(p.precio_venta || 0),
				stock: p.stock_actual,
			})),
		};
	},
});
