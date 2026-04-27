import { createTool } from "@voltagent/core";
import { z } from "zod";
import { inventarioValorizado } from "../../services/analytics-queries.js";

export const valuedInventoryTool = createTool({
	name: "valued_inventory",
	description:
		"Inventario valorizado: stock actual por producto con valor a precio de compra y valor potencial a precio de venta. Útil para cierres contables y para saber cuánto capital está inmovilizado.",
	tags: ["inventory", "read", "analytics"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const ctx = options?.context;
		const vendedorIdStr = ctx?.get("userId") || ctx?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const inv = await inventarioValorizado(vendedorId);
		const fmt = (n: number) =>
			n.toLocaleString("es-CO", {
				style: "currency",
				currency: "COP",
				minimumFractionDigits: 0,
			});

		const top = inv.items
			.sort((a, b) => b.valorCompra - a.valorCompra)
			.slice(0, 10)
			.map(
				(i) =>
					`• ${i.nombre}: ${i.stock} und → ${fmt(i.valorCompra)} (venta ${fmt(i.valorVenta)})`,
			);

		const message = [
			`📦 <b>Inventario valorizado</b>`,
			`Productos: ${inv.items.length}`,
			`Valor a costo:   ${fmt(inv.totalValorCompra)}`,
			`Valor a venta:   ${fmt(inv.totalValorVenta)}`,
			`Margen potencial: ${fmt(inv.margenPotencial)}`,
			``,
			`Top 10 por valor:`,
			...top,
		].join("\n");

		return {
			success: true,
			message,
			totalValorCompra: inv.totalValorCompra,
			totalValorVenta: inv.totalValorVenta,
			margenPotencial: inv.margenPotencial,
			items: inv.items,
		};
	},
});
