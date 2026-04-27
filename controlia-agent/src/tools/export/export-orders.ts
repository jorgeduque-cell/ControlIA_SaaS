import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	formatCurrency,
	formatDate,
	generateExcel,
} from "../../services/excel-generator.js";

export const exportOrdersTool = createTool({
	name: "export_orders_to_excel",
	description:
		"Exportar pedidos/ventas a Excel con filtros por fecha, estado o cliente.",
	tags: ["export", "excel", "orders", "sales"],

	parameters: z.object({
		fechaDesde: z.string().nullish(), // YYYY-MM-DD
		fechaHasta: z.string().nullish(),
		estado: z
			.enum(["Pendiente", "Entregado", "Pagado", "Cancelado", "Todos"])
			.default("Todos"),
	}),

	execute: async (params, options) => {
		try {
			const vendedorIdStr =
				options?.context?.get("userId") || options?.context?.get("vendedorId");
			if (!vendedorIdStr) {
				return {
					success: false,
					message: "❌ Contexto de vendedor no disponible",
					filePath: null,
				};
			}
			const vendedorId = BigInt(vendedorIdStr as string);

			// Construir where clause
			const where: any = { vendedor_id: vendedorId };

			if (params.estado !== "Todos") {
				where.estado = params.estado;
			}

			if (params.fechaDesde || params.fechaHasta) {
				where.fecha = {};
				if (params.fechaDesde) where.fecha.gte = new Date(params.fechaDesde);
				if (params.fechaHasta) where.fecha.lte = new Date(params.fechaHasta);
			}

			const pedidos = await prisma.pedidos.findMany({
				where,
				include: {
					clientes: {
						select: { nombre: true, telefono: true },
					},
				},
				orderBy: { fecha: "desc" },
			});

			if (pedidos.length === 0) {
				return {
					success: true,
					message:
						"📊 No hay pedidos para exportar con los filtros seleccionados.",
					filePath: null,
					count: 0,
				};
			}

			const data = pedidos.map((p) => ({
				ID_Pedido: p.id,
				Cliente: p.clientes?.nombre || "N/A",
				Telefono_Cliente: p.clientes?.telefono || "",
				Producto: p.producto,
				Cantidad: p.cantidad,
				Precio_Compra: p.precio_compra || 0,
				Precio_Venta: p.precio_venta || 0,
				Total_Venta: (p.precio_venta || 0) * p.cantidad,
				Utilidad: ((p.precio_venta || 0) - (p.precio_compra || 0)) * p.cantidad,
				Estado: p.estado,
				Estado_Pago: p.estado_pago,
				Fecha: formatDate(p.fecha),
				Grupo_Pedido: p.grupo_pedido || "",
			}));

			// Calcular totales
			const totalVentas = data.reduce((sum, d) => sum + d.Total_Venta, 0);
			const totalUtilidad = data.reduce((sum, d) => sum + d.Utilidad, 0);

			const filePath = generateExcel(
				data,
				"Pedidos",
				`Pedidos_${Date.now()}.xlsx`,
			);

			if (options?.context) {
				options.context.set("lastExcelPath", filePath);
				options.context.set(
					"lastExcelName",
					`Pedidos_${pedidos.length}_registros.xlsx`,
				);
			}

			return {
				success: true,
				message: `✅ Exportados ${pedidos.length} pedidos\n💰 Total ventas: ${formatCurrency(totalVentas)}\n📈 Utilidad: ${formatCurrency(totalUtilidad)}`,
				filePath: filePath,
				count: pedidos.length,
				totales: { ventas: totalVentas, utilidad: totalUtilidad },
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
