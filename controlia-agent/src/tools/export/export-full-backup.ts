import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	formatCurrency,
	formatDate,
	generateMultiSheetExcel,
} from "../../services/excel-generator.js";

export const exportFullBackupTool = createTool({
	name: "export_full_backup",
	description:
		"Generar respaldo completo de TODA la información (clientes, pedidos, inventario, finanzas) en un Excel multi-hoja.",
	tags: ["export", "excel", "backup", "full", "respaldo"],

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
				};
			}
			const vendedorId = BigInt(vendedorIdStr as string);
			const sheets: { name: string; data: Record<string, unknown>[] }[] = [];

			// 1. CLIENTES
			const clientes = await prisma.clientes.findMany({
				where: { vendedor_id: vendedorId },
				include: {
					notas_cliente: true,
					pedidos: true,
				},
			});

			if (clientes.length > 0) {
				sheets.push({
					name: "Clientes",
					data: clientes.map((c) => ({
						ID: Number(c.id),
						Nombre: c.nombre,
						Telefono: c.telefono || "",
						Direccion: c.direccion || "",
						Tipo_Negocio: c.tipo_negocio || "",
						Estado: c.estado || "",
						Dia_Visita: c.dia_visita || "",
						Latitud: c.latitud || "",
						Longitud: c.longitud || "",
						Fecha_Registro: formatDate(c.fecha_registro),
						Total_Notas: c.notas_cliente.length,
						Total_Pedidos: c.pedidos.length,
					})),
				});
			}

			// 2. PEDIDOS
			const pedidos = await prisma.pedidos.findMany({
				where: { vendedor_id: vendedorId },
				include: { clientes: { select: { nombre: true } } },
			});

			if (pedidos.length > 0) {
				sheets.push({
					name: "Pedidos",
					data: pedidos.map((p) => ({
						ID: p.id,
						Cliente: p.clientes?.nombre || "N/A",
						Producto: p.producto,
						Cantidad: p.cantidad,
						Precio_Compra: p.precio_compra || 0,
						Precio_Venta: p.precio_venta || 0,
						Total: (p.precio_venta || 0) * p.cantidad,
						Estado: p.estado,
						Estado_Pago: p.estado_pago,
						Fecha: formatDate(p.fecha),
					})),
				});
			}

			// 3. INVENTARIO
			const inventario = await prisma.inventario.findMany({
				where: { vendedor_id: vendedorId },
			});

			if (inventario.length > 0) {
				sheets.push({
					name: "Inventario",
					data: inventario.map((i) => ({
						Producto: i.producto,
						Stock_Actual: i.stock_actual,
						Stock_Minimo: i.stock_minimo || 0,
						Diferencia: (i.stock_actual || 0) - (i.stock_minimo || 0),
						Estado:
							(i.stock_actual || 0) <= (i.stock_minimo || 0)
								? "🔴 CRÍTICO"
								: "🟢 OK",
						Ultima_Actualizacion: formatDate(i.ultima_actualizacion),
					})),
				});
			}

			// 4. FINANZAS
			const finanzas = await prisma.finanzas.findMany({
				where: { vendedor_id: vendedorId },
			});

			if (finanzas.length > 0) {
				sheets.push({
					name: "Finanzas",
					data: finanzas.map((f) => ({
						ID: f.id,
						Tipo: f.tipo,
						Concepto: f.concepto || "",
						Monto: f.monto,
						Fecha: formatDate(f.fecha),
						Pedido_ID: f.pedido_id || "",
					})),
				});
			}

			// 5. PRODUCTOS
			const productos = await prisma.productos.findMany({
				where: { vendedor_id: vendedorId },
			});

			if (productos.length > 0) {
				sheets.push({
					name: "Productos",
					data: productos.map((p) => ({
						ID: p.id,
						Nombre: p.nombre,
						Precio_Compra: p.precio_compra || 0,
						Precio_Venta: p.precio_venta || 0,
						Stock_Actual: p.stock_actual || 0,
						Stock_Minimo: p.stock_minimo || 0,
						Fecha_Creacion: formatDate(p.fecha_creacion),
					})),
				});
			}

			// 6. METAS
			const metas = await prisma.metas.findMany({
				where: { vendedor_id: vendedorId },
			});

			if (metas.length > 0) {
				sheets.push({
					name: "Metas",
					data: metas.map((m) => ({
						ID: m.id,
						Producto: m.producto,
						Meta_Unidades: m.meta_unidades,
						Mes: m.mes,
						Fecha_Creacion: formatDate(m.fecha_creacion),
					})),
				});
			}

			if (sheets.length === 0) {
				return {
					success: true,
					message: "📊 No hay datos para respaldar.",
					filePath: null,
				};
			}

			// Generar Excel multi-hoja
			const timestamp = new Date().toISOString().split("T")[0];
			const fileName = `Respaldo_Completo_${timestamp}.xlsx`;
			const filePath = generateMultiSheetExcel(sheets, fileName);

			if (options?.context) {
				options.context.set("lastExcelPath", filePath);
				options.context.set("lastExcelName", fileName);
			}

			// Resumen
			const resumen = sheets
				.map((s) => `${s.name}: ${s.data.length}`)
				.join(" | ");

			return {
				success: true,
				message: `✅ Respaldo completo generado\n📊 ${resumen}`,
				filePath: filePath,
				hojas: sheets.length,
				totalRegistros: sheets.reduce((sum, s) => sum + s.data.length, 0),
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error generando respaldo: " +
					(error instanceof Error ? error.message : String(error)),
				filePath: null,
			};
		}
	},
});
