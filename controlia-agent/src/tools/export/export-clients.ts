import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { formatDate, generateExcel } from "../../services/excel-generator.js";

export const exportClientsTool = createTool({
	name: "export_clients_to_excel",
	description:
		"Exportar lista completa de clientes a archivo Excel (.xlsx) para análisis y respaldo.",
	tags: ["export", "excel", "clients", "backup"],

	parameters: z.object({
		includeInactive: z.boolean().default(false),
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
					count: 0,
				};
			}
			const vendedorId = BigInt(vendedorIdStr as string);

			// Obtener clientes de la base de datos
			const clientes = await prisma.clientes.findMany({
				where: {
					vendedor_id: vendedorId,
					...(params.includeInactive ? {} : { estado: { not: "Inactivo" } }),
				},
				include: {
					notas_cliente: {
						orderBy: { fecha: "desc" },
						take: 1,
					},
					pedidos: {
						orderBy: { fecha: "desc" },
						take: 1,
					},
				},
				orderBy: { nombre: "asc" },
			});

			if (clientes.length === 0) {
				return {
					success: true,
					message: "📊 No hay clientes para exportar.",
					filePath: null,
					count: 0,
				};
			}

			// Transformar datos para Excel
			const data = clientes.map((c) => ({
				ID: Number(c.id),
				Nombre: c.nombre,
				Telefono: c.telefono || "",
				Direccion: c.direccion || "",
				Tipo_Negocio: c.tipo_negocio || "",
				Estado: c.estado || "Prospecto",
				Dia_Visita: c.dia_visita || "",
				Latitud: c.latitud || "",
				Longitud: c.longitud || "",
				Fecha_Registro: formatDate(c.fecha_registro),
				Ultima_Interaccion: formatDate(c.ultima_interaccion),
				Ultima_Nota: c.notas_cliente[0]?.texto || "",
				Ultimo_Pedido: c.pedidos[0]?.producto || "",
				Total_Pedidos: c.pedidos.length,
			}));

			// Generar Excel
			const filePath = generateExcel(
				data,
				"Clientes",
				`Clientes_${Date.now()}.xlsx`,
			);

			// Guardar en contexto para envío por Telegram
			if (options?.context) {
				options.context.set("lastExcelPath", filePath);
				options.context.set(
					"lastExcelName",
					`Clientes_${clientes.length}_registros.xlsx`,
				);
			}

			return {
				success: true,
				message: `✅ Exportados ${clientes.length} clientes a Excel`,
				filePath: filePath,
				count: clientes.length,
				preview: data.slice(0, 5),
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error exportando clientes: " +
					(error instanceof Error ? error.message : String(error)),
				filePath: null,
				count: 0,
			};
		}
	},
});
