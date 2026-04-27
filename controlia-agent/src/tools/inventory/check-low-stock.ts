import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";

export const checkLowStockTool = createTool({
	name: "check_low_stock",
	description:
		"Verificar productos con stock bajo o agotados. " +
		"Muestra alertas de qué productos necesitan reabastecimiento urgente.",
	tags: ["inventory", "analytics", "alerts"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const products = await prisma.productos.findMany({
			where: { vendedor_id: vendedorId },
			orderBy: { stock_actual: "asc" },
		});

		const agotados: typeof products = [];
		const bajos: typeof products = [];
		const sinMinimo: typeof products = [];

		for (const p of products) {
			const stock = p.stock_actual || 0;
			const minStock = p.stock_minimo || 0;

			if (stock === 0) {
				agotados.push(p);
			} else if (minStock > 0 && stock <= minStock) {
				bajos.push(p);
			} else if (minStock === 0 && stock < 10) {
				sinMinimo.push(p);
			}
		}

		const formatter = new Intl.NumberFormat("es-CO", {
			style: "currency",
			currency: "COP",
			minimumFractionDigits: 0,
		});

		let message = "🚨 <b>ALERTAS DE INVENTARIO</b>\n";
		message += "━".repeat(30) + "\n\n";

		if (agotados.length > 0) {
			message += `🔴 <b>PRODUCTOS AGOTADOS (${agotados.length})</b>\n`;
			message += "Reordenar URGENTE:\n";
			for (const p of agotados) {
				message += `   • ${p.nombre} - Venta: ${formatter.format(p.precio_venta || 0)}\n`;
			}
			message += "\n";
		}

		if (bajos.length > 0) {
			message += `🟡 <b>STOCK BAJO (${bajos.length})</b>\n`;
			message += "Reordenar pronto:\n";
			for (const p of bajos) {
				const stock = p.stock_actual || 0;
				const min = p.stock_minimo || 0;
				message += `   • ${p.nombre}: ${stock} uds (mín: ${min})\n`;
			}
			message += "\n";
		}

		if (sinMinimo.length > 0) {
			message += `⚠️ <b>SIN STOCK MÍNIMO CONFIGURADO (${sinMinimo.length})</b>\n`;
			message += "Considera definir un stock mínimo para alertas:\n";
			for (const p of sinMinimo.slice(0, 5)) {
				message += `   • ${p.nombre}: ${p.stock_actual} uds\n`;
			}
			if (sinMinimo.length > 5) {
				message += `   ... y ${sinMinimo.length - 5} más\n`;
			}
			message += "\n";
		}

		if (agotados.length === 0 && bajos.length === 0) {
			message += "✅ <b>¡Todo en orden!</b>\n";
			message += "No hay productos agotados ni con stock bajo.\n\n";
			message += `📊 Total de productos en catálogo: ${products.length}`;
		}

		return {
			success: true,
			message,
			alerts: {
				agotados: agotados.length,
				bajos: bajos.length,
				sinMinimo: sinMinimo.length,
				total: products.length,
			},
			productosAgotados: agotados.map((p) => ({
				id: Number(p.id),
				nombre: p.nombre,
			})),
			productosBajos: bajos.map((p) => ({
				id: Number(p.id),
				nombre: p.nombre,
				stock: p.stock_actual,
				minimo: p.stock_minimo,
			})),
		};
	},
});
