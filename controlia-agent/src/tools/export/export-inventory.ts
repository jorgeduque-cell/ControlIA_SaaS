import { createTool } from "@voltagent/core";
import { z } from "zod";
import { TODOS_LOS_PRODUCTOS } from "../../config/oil-products.js";
import { prisma } from "../../db/client.js";
import { generateExcel } from "../../services/excel-generator.js";

export const exportInventoryTool = createTool({
	name: "export_inventory_to_excel",
	description:
		"Exportar inventario completo a Excel con stock actual, mínimos y alertas.",
	tags: ["export", "excel", "inventory", "stock"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		try {
			const vendedorIdStr =
				options?.context?.get("userId") || options?.context?.get("vendedorId");
			if (!vendedorIdStr) {
				return {
					success: false,
					message: "❌ Contexto de vendedor no disponible",
					filePath: null,
					count: 0,
				};
			}
			const vendedorId = BigInt(vendedorIdStr as string);

			// Obtener inventario de la base de datos
			const inventario = await prisma.inventario.findMany({
				where: { vendedor_id: vendedorId },
				orderBy: { producto: "asc" },
			});

			// Obtener productos del catálogo con precios
			const productos = await prisma.productos.findMany({
				where: { vendedor_id: vendedorId },
			});

			// Combinar datos
			const data = inventario.map((inv) => {
				const prod = productos.find((p) => p.nombre === inv.producto);
				const stockStatus =
					inv.stock_actual <= (inv.stock_minimo || 0)
						? "🔴 CRÍTICO"
						: inv.stock_actual <= (inv.stock_minimo || 0) * 1.5
							? "🟡 BAJO"
							: "🟢 OK";

				return {
					Producto: inv.producto,
					Stock_Actual: inv.stock_actual,
					Stock_Minimo: inv.stock_minimo || 0,
					Diferencia: (inv.stock_actual || 0) - (inv.stock_minimo || 0),
					Estado: stockStatus,
					Precio_Costo: prod?.precio_compra || 0,
					Precio_Venta: prod?.precio_venta || 0,
					Margen_Porcentaje: prod?.precio_compra
						? (
								(((prod.precio_venta || 0) - prod.precio_compra) /
									prod.precio_compra) *
								100
							).toFixed(1) + "%"
						: "0%",
					Ultima_Actualizacion:
						inv.ultima_actualizacion?.toISOString().split("T")[0] || "",
				};
			});

			if (data.length === 0) {
				return {
					success: true,
					message: "📊 No hay productos en inventario para exportar.",
					filePath: null,
					count: 0,
				};
			}

			// Agregar resumen
			const totalProductos = data.length;
			const stockCritico = data.filter((d) =>
				d.Estado.includes("CRÍTICO"),
			).length;
			const stockBajo = data.filter((d) => d.Estado.includes("BAJO")).length;

			const filePath = generateExcel(
				data,
				"Inventario",
				`Inventario_${Date.now()}.xlsx`,
			);

			if (options?.context) {
				options.context.set("lastExcelPath", filePath);
				options.context.set(
					"lastExcelName",
					`Inventario_${data.length}_productos.xlsx`,
				);
			}

			return {
				success: true,
				message: `✅ Exportados ${data.length} productos\n🔴 Crítico: ${stockCritico}\n🟡 Bajo: ${stockBajo}\n🟢 OK: ${totalProductos - stockCritico - stockBajo}`,
				filePath: filePath,
				count: data.length,
				resumen: {
					total: totalProductos,
					critico: stockCritico,
					bajo: stockBajo,
				},
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error: " +
					(error instanceof Error ? error.message : String(error)),
				filePath: null,
			};
		}
	},
});
