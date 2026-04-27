import fs from "fs";
import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	EMPRESA_INFO,
	MARGEN_DEFAULT,
	TERMINOS_CONDICIONES,
	TODOS_LOS_PRODUCTOS,
	buscarProductoPorSKU,
	calcularPrecioVenta,
	formatearPrecio,
	getNombreCompleto,
} from "../../config/oil-products.js";
import { prisma } from "../../db/client.js";
import {
	type QuotationData,
	type QuotationItem,
	generateQuotationPDF,
} from "../../services/pdf-generator.js";

// Busca precio_compra en la tabla productos. Matching por nombre (fuzzy).
async function lookupCostFromDB(
	sku: string,
	productoCatalogo: { nombre: string; capacidad: string },
): Promise<number | null> {
	const hints = [
		productoCatalogo.nombre,
		productoCatalogo.capacidad,
		sku.replace(/-/g, " "),
	].filter(Boolean);
	const match = await prisma.productos.findFirst({
		where: {
			OR: hints.map((h) => ({
				nombre: { contains: h, mode: "insensitive" as const },
			})),
			precio_compra: { gt: 0 },
		},
		orderBy: { ultima_actualizacion: "desc" },
	});
	return match?.precio_compra ?? null;
}

export const generateQuotationTool = createTool({
	name: "generate_quotation",
	description:
		"Generar cotización profesional en PDF. Si no se da precioCosto, lo busca automáticamente en la tabla productos (precio_compra más reciente). Sistema agrega 8% de margen automático.",
	tags: ["document", "quotation", "pricing", "pdf"],

	parameters: z.object({
		productos: z.array(
			z.object({
				sku: z
					.string()
					.describe(
						"SKU del catálogo (ej: RIOSOL-5L, RIOSOL-18L, OLEOSOB-PALMA-15KG, OLEOSOB-HIDRO-15KG)",
					),
				precioCosto: z
					.number()
					.nullish()
					.describe(
						"Precio de costo opcional. Si no se da, se busca en la tabla productos automáticamente.",
					),
				margen: z
					.number()
					.nullish()
					.describe("Margen sobre costo. Default 0.08 (8%)."),
				cantidad: z.number().nullish().describe("Cantidad. Default 1."),
			}),
		),
		tipoCotizacion: z.enum(["diaria", "semanal"]).default("diaria"),
		cliente: z
			.object({
				nombre: z.string(),
				telefono: z.string().nullish(),
				direccion: z.string().nullish(),
				nit: z.string().nullish(),
			})
			.nullish(),
		notasAdicionales: z.string().nullish(),
	}),

	execute: async (params, options) => {
		try {
			const context = options?.context;
			const vendedorNombre = context?.get("vendedorNombre") || "Vendedor";

			const items: QuotationItem[] = [];
			let totalCosto = 0;
			let totalVenta = 0;

			for (const item of params.productos) {
				const producto = buscarProductoPorSKU(item.sku);
				if (!producto) {
					return {
						success: false,
						message: `❌ SKU "${item.sku}" no encontrado.\nDisponibles: ${TODOS_LOS_PRODUCTOS.map((p) => p.sku).join(", ")}`,
					};
				}

				let precioCosto = item.precioCosto ?? null;
				if (precioCosto === null || precioCosto === 0) {
					precioCosto = await lookupCostFromDB(item.sku, producto);
				}
				if (!precioCosto || precioCosto <= 0) {
					return {
						success: false,
						message: `❌ No hay precio de costo para "${item.sku}" (${getNombreCompleto(producto)}). Registra el producto con su precio_compra en Inventario o pásalo explícitamente en la cotización.`,
					};
				}

				const margen = item.margen ?? MARGEN_DEFAULT;
				const precioVenta = calcularPrecioVenta(precioCosto, margen);
				const cantidad = item.cantidad ?? 1;

				await prisma.historico_precios.create({
					data: {
						sku: item.sku,
						precio_costo: precioCosto,
						precio_venta: precioVenta,
					},
				});

				items.push({
					sku: item.sku,
					producto: getNombreCompleto(producto),
					presentacion: producto.presentacion,
					cantidad: cantidad,
					precioUnitario: precioVenta,
					precioTotal: precioVenta * cantidad,
				});

				totalCosto += precioCosto * cantidad;
				totalVenta += precioVenta * cantidad;
			}

			const utilidadTotal = totalVenta - totalCosto;
			const margenPromedio = (utilidadTotal / totalCosto) * 100;

			// Generar número de cotización
			const numCotizacion = `COT-${Date.now().toString().slice(-6)}`;

			// Fechas
			const fecha = new Date();
			const fechaVencimiento = new Date();
			fechaVencimiento.setDate(fecha.getDate() + 3); // 3 días hábiles

			// Preparar datos para PDF
			const quotationData: QuotationData = {
				numeroCotizacion: numCotizacion,
				fecha: fecha,
				fechaVencimiento: fechaVencimiento,
				cliente: params.cliente
					? {
							nombre: params.cliente.nombre,
							telefono: params.cliente.telefono ?? undefined,
							direccion: params.cliente.direccion ?? undefined,
							nit: params.cliente.nit ?? undefined,
						}
					: { nombre: "Cliente" },
				vendedor: {
					nombre: vendedorNombre as string,
					telefono: EMPRESA_INFO.telefono,
					email: EMPRESA_INFO.email,
				},
				items: items,
				subtotal: totalVenta,
				total: totalVenta,
				notas:
					params.notasAdicionales ||
					`Cotización ${params.tipoCotizacion}. Precios con margen del ${(MARGEN_DEFAULT * 100).toFixed(0)}% sobre costo.`,
			};

			// Generar PDF real
			const pdfPath = await generateQuotationPDF(quotationData);

			// Mensaje resumen para el chat
			let mensaje = `📄 <b>COTIZACIÓN GENERADA</b>\n\n`;
			mensaje += `Número: <code>${numCotizacion}</code>\n`;
			mensaje += `Productos: ${items.length}\n`;
			mensaje += `Total: ${formatearPrecio(totalVenta)}\n`;
			mensaje += `Utilidad: ${formatearPrecio(utilidadTotal)} (${margenPromedio.toFixed(1)}%)\n\n`;

			for (const item of items) {
				const costoItem =
					params.productos.find((p) => p.sku === item.sku)?.precioCosto || 0;
				mensaje += `• ${item.sku}: ${formatearPrecio(costoItem)} → ${formatearPrecio(item.precioUnitario)} x${item.cantidad}\n`;
			}

			mensaje += `\n📎 <b>PDF generado:</b> ${pdfPath.split("\\").pop()}`;

			if (params.tipoCotizacion === "semanal") {
				mensaje += "\n\n🔄 <b>Programado envío semanal automático</b>";
			}

			// Guardar pdfPath en contexto para que el adapter lo use
			if (context) {
				context.set("lastPdfPath", pdfPath);
				context.set("lastPdfName", `Cotizacion_${numCotizacion}.pdf`);
			}

			return {
				success: true,
				message: mensaje,
				cotizacion: {
					numero: numCotizacion,
					tipo: params.tipoCotizacion,
					fecha: fecha.toISOString(),
					fechaVencimiento: fechaVencimiento.toISOString(),
					items: items,
					total: totalVenta,
					utilidad: utilidadTotal,
					margenPromedio,
					pdfPath: pdfPath,
				},
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error: " +
					(error instanceof Error ? error.message : "Error desconocido"),
			};
		}
	},
});

export const getPriceHistoryTool = createTool({
	name: "get_price_history",
	description: "Consultar histórico de precios de un producto.",
	tags: ["document", "pricing", "history"],

	parameters: z.object({
		sku: z.string(),
		limit: z.number().default(10),
	}),

	execute: async (params) => {
		const historial = await prisma.historico_precios.findMany({
			where: { sku: params.sku },
			orderBy: { fecha: "desc" },
			take: params.limit,
		});

		if (historial.length === 0) {
			return {
				success: true,
				message: `📊 Sin histórico para ${params.sku}.`,
				historial: [],
			};
		}

		const producto = buscarProductoPorSKU(params.sku);
		const nombre = producto ? getNombreCompleto(producto) : params.sku;

		let mensaje = `📈 <b>HISTÓRICO: ${nombre}</b>\n\n`;

		for (const h of historial) {
			const fecha = h.fecha.toLocaleDateString("es-CO");
			mensaje += `${fecha} | Costo: ${formatearPrecio(h.precio_costo)} → Venta: ${formatearPrecio(h.precio_venta)}\n`;
		}

		if (historial.length >= 2) {
			const ultimo = historial[0];
			const anterior = historial[1];
			const variacion =
				((ultimo.precio_costo - anterior.precio_costo) /
					anterior.precio_costo) *
				100;
			mensaje += `\nVariación: ${variacion > 0 ? "📈" : "📉"} ${variacion.toFixed(2)}%\n`;
		}

		return { success: true, message: mensaje, historial };
	},
});

/**
 * Tool para enviar el PDF por Telegram
 */
export const sendQuotationPDFTool = createTool({
	name: "send_quotation_pdf",
	description:
		"NO USAR en Telegram. El PDF se envía AUTOMÁTICAMENTE después de generate_quotation (el adapter detecta lastPdfPath). Esta tool solo valida; chatId es opcional y se resuelve del contexto.",
	tags: ["document", "telegram", "send"],

	parameters: z.object({
		pdfPath: z.string().nullish(),
		chatId: z.string().nullish(),
		caption: z.string().nullish(),
	}),

	execute: async (params, options) => {
		try {
			const ctx = options?.context;
			const pdfPath =
				params.pdfPath || (ctx?.get("lastPdfPath") as string | undefined);
			const chatId =
				params.chatId ||
				(ctx?.get("chatId") as string | undefined) ||
				(ctx?.get("conversationId") as string | undefined) ||
				(ctx?.get("userId") as string | undefined);

			if (!pdfPath) {
				return {
					success: false,
					message:
						"No hay PDF reciente en contexto. Llama generate_quotation primero.",
				};
			}
			if (!fs.existsSync(pdfPath)) {
				return { success: false, message: `❌ Archivo no encontrado: ${pdfPath}` };
			}

			return {
				success: true,
				message: `📄 El PDF se envía automáticamente por el adapter — no requiere acción extra.`,
				pdfPath,
				chatId: chatId ?? null,
			};
		} catch (error) {
			return {
				success: false,
				message:
					"❌ Error: " +
					(error instanceof Error ? error.message : "Error desconocido"),
			};
		}
	},
});
