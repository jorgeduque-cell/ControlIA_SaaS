import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	formatCurrency,
	generateExcel,
} from "../../services/excel-generator.js";

export const getInventoryTool = createTool({
	name: "get_inventory",
	description:
		"Obtener el inventario actual de productos en formato Excel. " +
		"Genera archivo .xlsx con stock, precios y alertas.",
	tags: ["inventory", "excel", "stock", "export"],

	parameters: z.object({
		filter: z
			.enum(["all", "low", "out", "ok"])
			.nullish()
			.describe(
				"Filtro: 'all'=todos, 'low'=stock bajo, 'out'=agotados, 'ok'=stock normal",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const filter = params.filter || "all";

		const products = await prisma.productos.findMany({
			where: { vendedor_id: vendedorId },
			orderBy: { nombre: "asc" },
		});

		if (products.length === 0) {
			return {
				success: true,
				message:
					"📦 Tu catálogo de productos está vacío. Usa el tool 'add_product' para agregar productos.",
				products: [],
				summary: { total: 0, low: 0, out: 0, ok: 0 },
			};
		}

		// Preparar datos para Excel
		const data = products.map((p) => {
			const stock = p.stock_actual || 0;
			const minStock = p.stock_minimo || 0;
			const margen = (p.precio_venta || 0) - (p.precio_compra || 0);
			const margenPorc = p.precio_compra
				? ((margen / p.precio_compra) * 100).toFixed(1) + "%"
				: "0%";

			let estado: string;
			if (stock === 0) {
				estado = "🔴 AGOTADO";
			} else if (stock <= minStock && minStock > 0) {
				estado = "🟡 BAJO";
			} else {
				estado = "🟢 OK";
			}

			return {
				Producto: p.nombre,
				Stock_Actual: stock,
				Stock_Minimo: minStock,
				Diferencia: stock - minStock,
				Precio_Costo: p.precio_compra || 0,
				Precio_Venta: p.precio_venta || 0,
				Margen_Pesos: margen,
				Margen_Porcentaje: margenPorc,
				Estado: estado,
				Ultima_Actualizacion:
					p.ultima_actualizacion?.toISOString().split("T")[0] || "",
			};
		});

		// Filtrar si es necesario
		let filteredData = data;
		if (filter === "low") {
			filteredData = data.filter((p) => p.Estado.includes("BAJO"));
		} else if (filter === "out") {
			filteredData = data.filter((p) => p.Estado.includes("AGOTADO"));
		} else if (filter === "ok") {
			filteredData = data.filter((p) => p.Estado.includes("OK"));
		}

		// Calcular resumen
		const summary = {
			total: products.length,
			low: data.filter((p) => p.Estado.includes("BAJO")).length,
			out: data.filter((p) => p.Estado.includes("AGOTADO")).length,
			ok: data.filter((p) => p.Estado.includes("OK")).length,
		};

		// Generar Excel
		const fileName = `Inventario_${new Date().toISOString().split("T")[0]}.xlsx`;
		const filePath = generateExcel(filteredData, "Inventario", fileName);

		console.log(`[Inventory] Excel generado: ${filePath}`);
		console.log(`[Inventory] Context exists: ${!!context}`);

		// Guardar en contexto para envío por Telegram
		if (context) {
			context.set("lastExcelPath", filePath);
			context.set("lastExcelName", fileName);
			console.log(`[Inventory] Guardado en contexto: ${filePath}`);
		} else {
			console.error(`[Inventory] ERROR: Context no disponible`);
		}

		// Mensaje resumen
		let message = `📊 <b>INVENTARIO GENERADO</b>\n\n`;
		message += `Total productos: ${summary.total}\n`;
		message += `🟢 OK: ${summary.ok}\n`;
		message += `🟡 Bajo: ${summary.low}\n`;
		message += `🔴 Agotado: ${summary.out}\n\n`;
		message += `📎 Archivo Excel generado`;

		return {
			success: true,
			message,
			filePath,
			summary,
			totalRegistros: filteredData.length,
		};
	},
});
