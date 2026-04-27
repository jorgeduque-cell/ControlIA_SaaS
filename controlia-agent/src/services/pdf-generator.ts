import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
	EMPRESA_INFO,
	TERMINOS_CONDICIONES,
	formatearPrecio,
} from "../config/oil-products.js";
import { buildDocPath } from "./file-system-service.js";

export interface QuotationItem {
	sku: string;
	producto: string;
	presentacion: string;
	cantidad: number;
	precioUnitario: number;
	precioTotal: number;
}

export interface QuotationData {
	numeroCotizacion: string;
	fecha: Date;
	fechaVencimiento: Date;
	cliente: {
		nombre: string;
		telefono?: string;
		direccion?: string;
		nit?: string;
	};
	vendedor: {
		nombre: string;
		telefono?: string;
		email?: string;
	};
	items: QuotationItem[];
	subtotal: number;
	impuestos?: number;
	total: number;
	notas?: string;
	logoPath?: string;
}

/**
 * Genera un PDF de cotización profesional
 */
export async function generateQuotationPDF(
	data: QuotationData,
): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			// Crear directorio de salida si no existe
			const outputDir = path.join(process.cwd(), "temp", "quotations");
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			// Nombre del archivo
			const fileName = `COT_${data.numeroCotizacion}_${Date.now()}.pdf`;
			const filePath = path.join(outputDir, fileName);

			// Crear documento
			const doc = new PDFDocument({ margin: 50 });
			const stream = fs.createWriteStream(filePath);

			doc.pipe(stream);

			// ========== HEADER ==========
			// Logo (si existe)
			if (data.logoPath && fs.existsSync(data.logoPath)) {
				doc.image(data.logoPath, 50, 45, { width: 100 });
			} else {
				// Logo placeholder - rectángulo con texto
				doc.rect(50, 45, 100, 60).stroke("#2563eb");
				doc.fontSize(12).fillColor("#2563eb");
				doc.text("LOGO", 75, 65);
			}

			// Título COTIZACIÓN
			doc.fontSize(24).fillColor("#1e40af");
			doc.text("COTIZACIÓN", 400, 50, { align: "right" });

			// Número y fechas
			doc.fontSize(10).fillColor("#374151");
			doc.text(`No. ${data.numeroCotizacion}`, 400, 80, { align: "right" });
			doc.text(`Fecha: ${data.fecha.toLocaleDateString("es-CO")}`, 400, 95, {
				align: "right",
			});
			doc.text(
				`Válido hasta: ${data.fechaVencimiento.toLocaleDateString("es-CO")}`,
				400,
				110,
				{ align: "right" },
			);

			// Línea separadora
			doc.moveTo(50, 130).lineTo(550, 130).stroke("#e5e7eb");

			// ========== INFO EMPRESA Y CLIENTE ==========
			const startY = 150;

			// Info Empresa (izquierda)
			doc.fontSize(10).fillColor("#6b7280");
			doc.text("DE:", 50, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(
				EMPRESA_INFO.nombre || "Distribuidora de Aceites",
				50,
				startY + 15,
			);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (EMPRESA_INFO.nit)
				doc.text(`NIT: ${EMPRESA_INFO.nit}`, 50, startY + 30);
			if (EMPRESA_INFO.direccion)
				doc.text(EMPRESA_INFO.direccion, 50, startY + 45);
			if (EMPRESA_INFO.telefono)
				doc.text(`Tel: ${EMPRESA_INFO.telefono}`, 50, startY + 60);
			if (EMPRESA_INFO.email) doc.text(EMPRESA_INFO.email, 50, startY + 75);

			// Info Cliente (derecha)
			doc.fontSize(10).fillColor("#6b7280");
			doc.text("PARA:", 350, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(data.cliente.nombre, 350, startY + 15);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (data.cliente.nit)
				doc.text(`NIT: ${data.cliente.nit}`, 350, startY + 30);
			if (data.cliente.direccion)
				doc.text(data.cliente.direccion, 350, startY + 45);
			if (data.cliente.telefono)
				doc.text(`Tel: ${data.cliente.telefono}`, 350, startY + 60);

			// ========== TABLA DE PRODUCTOS ==========
			// Sistema de columnas: cada una con x inicial y width explícitos.
			// La suma de widths = tableWidth. Siempre pasar { width } al texto
			// para evitar que pdfkit wrappee al margen derecho de la página.
			const tableTop = 280;
			const tableLeft = 50;
			const tableWidth = 500;
			const pad = 6;
			type Col = {
				x: number;
				w: number;
				label: string;
				align: "left" | "right";
			};
			const cols: Col[] = [
				{ x: 50, w: 40, label: "Cant.", align: "left" },
				{ x: 90, w: 210, label: "Producto", align: "left" },
				{ x: 300, w: 80, label: "Present.", align: "left" },
				{ x: 380, w: 80, label: "Precio Unit.", align: "right" },
				{ x: 460, w: 90, label: "Total", align: "right" },
			];

			// Header
			const headerH = 26;
			doc.rect(tableLeft, tableTop, tableWidth, headerH).fill("#2563eb");
			doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold");
			for (const c of cols) {
				doc.text(c.label, c.x + pad, tableTop + 9, {
					width: c.w - pad * 2,
					align: c.align,
				});
			}

			// Filas de productos
			let rowY = tableTop + headerH;
			const rowH = 22;
			doc.font("Helvetica").fontSize(9);

			data.items.forEach((item, index) => {
				if (index % 2 === 0) {
					doc.rect(tableLeft, rowY, tableWidth, rowH).fill("#f9fafb");
				}
				doc.fillColor("#374151");

				const yText = rowY + 7;
				doc.text(String(item.cantidad), cols[0].x + pad, yText, {
					width: cols[0].w - pad * 2,
					align: cols[0].align,
				});
				doc.text(item.producto, cols[1].x + pad, yText, {
					width: cols[1].w - pad * 2,
					align: cols[1].align,
					ellipsis: true,
				});
				doc.text(item.presentacion, cols[2].x + pad, yText, {
					width: cols[2].w - pad * 2,
					align: cols[2].align,
					ellipsis: true,
				});
				doc.text(formatearPrecio(item.precioUnitario), cols[3].x + pad, yText, {
					width: cols[3].w - pad * 2,
					align: cols[3].align,
				});
				doc.text(formatearPrecio(item.precioTotal), cols[4].x + pad, yText, {
					width: cols[4].w - pad * 2,
					align: cols[4].align,
				});

				rowY += rowH;
			});

			// Línea inferior de la tabla
			doc
				.moveTo(tableLeft, rowY)
				.lineTo(tableLeft + tableWidth, rowY)
				.stroke("#d1d5db");

			// ========== TOTALES ==========
			// Caja derecha con fondo sutil. Label izquierda, valor derecha, mismo ancho.
			const totalsY = rowY + 18;
			const totalsBoxX = 330;
			const totalsBoxW = tableLeft + tableWidth - totalsBoxX; // 220
			const labelW = 110;
			const valueX = totalsBoxX + labelW + 10;
			const valueW = totalsBoxW - labelW - 10;

			let ty = totalsY;

			// Subtotal
			doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
			doc.text("Subtotal:", totalsBoxX, ty, { width: labelW, align: "left" });
			doc.fillColor("#374151");
			doc.text(formatearPrecio(data.subtotal), valueX, ty, {
				width: valueW,
				align: "right",
			});
			ty += 18;

			// IVA (si aplica)
			if (data.impuestos && data.impuestos > 0) {
				doc.fillColor("#6b7280");
				doc.text("IVA (19%):", totalsBoxX, ty, { width: labelW, align: "left" });
				doc.fillColor("#374151");
				doc.text(formatearPrecio(data.impuestos), valueX, ty, {
					width: valueW,
					align: "right",
				});
				ty += 18;
			}

			// Separador antes del TOTAL
			doc
				.moveTo(totalsBoxX, ty + 2)
				.lineTo(totalsBoxX + totalsBoxW, ty + 2)
				.stroke("#d1d5db");
			ty += 10;

			// TOTAL destacado
			doc.rect(totalsBoxX, ty - 4, totalsBoxW, 28).fill("#1e40af");
			doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold");
			doc.text("TOTAL", totalsBoxX + 10, ty + 4, {
				width: labelW,
				align: "left",
			});
			doc.text(formatearPrecio(data.total), valueX, ty + 4, {
				width: valueW - 8,
				align: "right",
			});
			ty += 32;

			// ========== NOTAS ==========
			if (data.notas) {
				const notasY = ty + 20;
				doc.fontSize(10).font("Helvetica-Bold").fillColor("#6b7280");
				doc.text("Notas:", 50, notasY, { width: 500 });
				doc.font("Helvetica").fillColor("#374151");
				doc.text(data.notas, 50, notasY + 15, { width: 500, lineGap: 2 });
			}

			// ========== TÉRMINOS Y CONDICIONES ==========
			const termsY = doc.page.height - 200;
			doc.fontSize(9).fillColor("#6b7280");
			doc.text("TÉRMINOS Y CONDICIONES", 50, termsY);
			doc
				.moveTo(50, termsY + 12)
				.lineTo(200, termsY + 12)
				.stroke("#e5e7eb");

			doc.fontSize(8).fillColor("#9ca3af");
			const terminos = TERMINOS_CONDICIONES.split("\n").slice(0, 8).join("\n");
			doc.text(terminos, 50, termsY + 20, { width: 500, lineGap: 2 });

			// ========== FIRMAS ==========
			doc.fontSize(10).fillColor("#374151");
			doc.text("_".repeat(30), 100, doc.page.height - 80);
			doc.text("Firma Vendedor", 100, doc.page.height - 65);

			doc.text("_".repeat(30), 350, doc.page.height - 80);
			doc.text("Firma Cliente", 350, doc.page.height - 65);

			// Finalizar documento
			doc.end();

			stream.on("finish", () => {
				resolve(filePath);
			});

			stream.on("error", reject);
		} catch (error) {
			reject(error);
		}
	});
}

// ══════════════════════════════════════════════════════════════════════════
// ── Remisión ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export interface RemisionItem {
	producto: string;
	cantidad: number;
	precioUnitario: number;
	subtotal: number;
}

export interface RemisionData {
	numero: string; // REM-2026-0001
	fecha: Date;
	cliente: {
		nombre: string;
		telefono?: string;
		direccion?: string;
		nit?: string;
	};
	items: RemisionItem[];
	subtotal: number;
	impuestos?: number;
	total: number;
	esCredito: boolean;
	fechaVencimiento?: Date;
	notas?: string;
}

export async function generateRemisionPDF(data: RemisionData): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			const fileName = `${data.numero}.pdf`;
			const filePath = buildDocPath("remision", fileName, data.fecha);

			const doc = new PDFDocument({ margin: 50 });
			const stream = fs.createWriteStream(filePath);
			doc.pipe(stream);

			// Header
			doc.rect(50, 45, 100, 60).stroke("#2563eb");
			doc.fontSize(12).fillColor("#2563eb").text("LOGO", 75, 65);

			doc.fontSize(24).fillColor("#1e40af");
			doc.text("REMISIÓN", 400, 50, { align: "right" });

			doc.fontSize(10).fillColor("#374151");
			doc.text(`No. ${data.numero}`, 400, 80, { align: "right" });
			doc.text(`Fecha: ${data.fecha.toLocaleDateString("es-CO")}`, 400, 95, {
				align: "right",
			});
			if (data.esCredito && data.fechaVencimiento) {
				doc.fillColor("#dc2626");
				doc.text(
					`Vence: ${data.fechaVencimiento.toLocaleDateString("es-CO")}`,
					400,
					110,
					{ align: "right" },
				);
				doc.fillColor("#374151");
			}

			doc.moveTo(50, 130).lineTo(550, 130).stroke("#e5e7eb");

			// DE / PARA
			const startY = 150;
			doc.fontSize(10).fillColor("#6b7280").text("DE:", 50, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(
				EMPRESA_INFO.nombre || "Distribuidora de Aceites",
				50,
				startY + 15,
			);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (EMPRESA_INFO.nit) doc.text(`NIT: ${EMPRESA_INFO.nit}`, 50, startY + 30);
			if (EMPRESA_INFO.telefono)
				doc.text(`Tel: ${EMPRESA_INFO.telefono}`, 50, startY + 45);

			doc.fontSize(10).fillColor("#6b7280").text("PARA:", 350, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(data.cliente.nombre, 350, startY + 15);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (data.cliente.nit)
				doc.text(`NIT: ${data.cliente.nit}`, 350, startY + 30);
			if (data.cliente.direccion)
				doc.text(data.cliente.direccion, 350, startY + 45);
			if (data.cliente.telefono)
				doc.text(`Tel: ${data.cliente.telefono}`, 350, startY + 60);

			// Tabla
			const tableTop = 260;
			const tableLeft = 50;
			const tableWidth = 500;
			const pad = 6;
			type Col = {
				x: number;
				w: number;
				label: string;
				align: "left" | "right";
			};
			const cols: Col[] = [
				{ x: 50, w: 50, label: "Cant.", align: "left" },
				{ x: 100, w: 260, label: "Producto", align: "left" },
				{ x: 360, w: 90, label: "Precio Unit.", align: "right" },
				{ x: 450, w: 100, label: "Subtotal", align: "right" },
			];

			const headerH = 26;
			doc.rect(tableLeft, tableTop, tableWidth, headerH).fill("#2563eb");
			doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold");
			for (const c of cols) {
				doc.text(c.label, c.x + pad, tableTop + 9, {
					width: c.w - pad * 2,
					align: c.align,
				});
			}

			let rowY = tableTop + headerH;
			const rowH = 22;
			doc.font("Helvetica").fontSize(9);

			data.items.forEach((item, index) => {
				if (index % 2 === 0) {
					doc.rect(tableLeft, rowY, tableWidth, rowH).fill("#f9fafb");
				}
				doc.fillColor("#374151");
				const yText = rowY + 7;
				doc.text(String(item.cantidad), cols[0].x + pad, yText, {
					width: cols[0].w - pad * 2,
					align: cols[0].align,
				});
				doc.text(item.producto, cols[1].x + pad, yText, {
					width: cols[1].w - pad * 2,
					align: cols[1].align,
					ellipsis: true,
				});
				doc.text(formatearPrecio(item.precioUnitario), cols[2].x + pad, yText, {
					width: cols[2].w - pad * 2,
					align: cols[2].align,
				});
				doc.text(formatearPrecio(item.subtotal), cols[3].x + pad, yText, {
					width: cols[3].w - pad * 2,
					align: cols[3].align,
				});
				rowY += rowH;
			});

			doc
				.moveTo(tableLeft, rowY)
				.lineTo(tableLeft + tableWidth, rowY)
				.stroke("#d1d5db");

			// Totales
			const totalsY = rowY + 18;
			const totalsBoxX = 330;
			const totalsBoxW = tableLeft + tableWidth - totalsBoxX;
			const labelW = 110;
			const valueX = totalsBoxX + labelW + 10;
			const valueW = totalsBoxW - labelW - 10;

			let ty = totalsY;
			doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
			doc.text("Subtotal:", totalsBoxX, ty, { width: labelW, align: "left" });
			doc.fillColor("#374151");
			doc.text(formatearPrecio(data.subtotal), valueX, ty, {
				width: valueW,
				align: "right",
			});
			ty += 18;

			if (data.impuestos && data.impuestos > 0) {
				doc.fillColor("#6b7280");
				doc.text("IVA:", totalsBoxX, ty, { width: labelW, align: "left" });
				doc.fillColor("#374151");
				doc.text(formatearPrecio(data.impuestos), valueX, ty, {
					width: valueW,
					align: "right",
				});
				ty += 18;
			}

			doc
				.moveTo(totalsBoxX, ty + 2)
				.lineTo(totalsBoxX + totalsBoxW, ty + 2)
				.stroke("#d1d5db");
			ty += 10;

			doc.rect(totalsBoxX, ty - 4, totalsBoxW, 28).fill("#1e40af");
			doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold");
			doc.text("TOTAL", totalsBoxX + 10, ty + 4, {
				width: labelW,
				align: "left",
			});
			doc.text(formatearPrecio(data.total), valueX, ty + 4, {
				width: valueW - 8,
				align: "right",
			});
			ty += 32;

			// Condición de pago
			ty += 10;
			doc.font("Helvetica-Bold").fontSize(10);
			doc.fillColor(data.esCredito ? "#dc2626" : "#059669");
			doc.text(
				data.esCredito ? "CONDICIÓN: CRÉDITO" : "CONDICIÓN: CONTADO",
				50,
				ty,
			);

			if (data.notas) {
				ty += 25;
				doc.font("Helvetica-Bold").fontSize(10).fillColor("#6b7280");
				doc.text("Notas:", 50, ty, { width: 500 });
				doc.font("Helvetica").fillColor("#374151");
				doc.text(data.notas, 50, ty + 15, { width: 500, lineGap: 2 });
			}

			// Firmas
			doc.fontSize(10).fillColor("#374151");
			doc.text("_".repeat(30), 80, doc.page.height - 100);
			doc.text("Entregado por", 80, doc.page.height - 85);

			doc.text("_".repeat(30), 350, doc.page.height - 100);
			doc.text("Recibido conforme", 350, doc.page.height - 85);

			doc.fontSize(8).fillColor("#9ca3af");
			doc.text(
				`Documento generado el ${new Date().toLocaleString("es-CO")}`,
				50,
				doc.page.height - 50,
				{ align: "center", width: 500 },
			);

			doc.end();
			stream.on("finish", () => resolve(filePath));
			stream.on("error", reject);
		} catch (error) {
			reject(error);
		}
	});
}

// ══════════════════════════════════════════════════════════════════════════
// ── Pedido ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export interface PedidoItem {
	producto: string;
	cantidad: number;
	precioUnitario: number;
	subtotal: number;
}

export interface PedidoData {
	numero: string; // PED-YYYYMMDD-NNN o PED-<grupo>
	fecha: Date;
	estado: string; // Pendiente / Confirmado / Entregado
	estadoPago: string; // Pendiente / Pagado
	cliente: {
		nombre: string;
		telefono?: string;
		direccion?: string;
		nit?: string;
	};
	vendedor: {
		nombre: string;
		telefono?: string;
		email?: string;
	};
	items: PedidoItem[];
	subtotal: number;
	impuestos?: number;
	total: number;
	notas?: string;
}

/**
 * Genera un PDF de PEDIDO (NO cotización). Muestra el estado operativo
 * (Pendiente/Confirmado/Entregado) y el estado de pago. Este es el documento
 * interno que confirma que un pedido fue registrado en el sistema.
 */
export async function generatePedidoPDF(data: PedidoData): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			const fileName = `${data.numero}.pdf`;
			const filePath = buildDocPath("pedido", fileName, data.fecha);

			const doc = new PDFDocument({ margin: 50 });
			const stream = fs.createWriteStream(filePath);
			doc.pipe(stream);

			// Header — logo + título PEDIDO
			doc.rect(50, 45, 100, 60).stroke("#059669");
			doc.fontSize(12).fillColor("#059669").text("LOGO", 75, 65);

			doc.fontSize(24).fillColor("#065f46");
			doc.text("PEDIDO", 400, 50, { align: "right" });

			doc.fontSize(10).fillColor("#374151");
			doc.text(`No. ${data.numero}`, 400, 80, { align: "right" });
			doc.text(`Fecha: ${data.fecha.toLocaleDateString("es-CO")}`, 400, 95, {
				align: "right",
			});

			// Estado del pedido — badge coloreado
			const estadoColor =
				data.estado.toLowerCase() === "entregado"
					? "#059669"
					: data.estado.toLowerCase() === "confirmado"
						? "#2563eb"
						: "#f59e0b";
			doc.fontSize(9).fillColor(estadoColor).font("Helvetica-Bold");
			doc.text(`ESTADO: ${data.estado.toUpperCase()}`, 400, 110, {
				align: "right",
			});
			doc
				.fontSize(9)
				.fillColor(
					data.estadoPago.toLowerCase() === "pagado" ? "#059669" : "#dc2626",
				);
			doc.text(`PAGO: ${data.estadoPago.toUpperCase()}`, 400, 122, {
				align: "right",
			});
			doc.font("Helvetica");

			doc.moveTo(50, 145).lineTo(550, 145).stroke("#e5e7eb");

			// DE / PARA
			const startY = 165;
			doc.fontSize(10).fillColor("#6b7280").text("DE:", 50, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(
				EMPRESA_INFO.nombre || "Distribuidora de Aceites",
				50,
				startY + 15,
			);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (EMPRESA_INFO.nit)
				doc.text(`NIT: ${EMPRESA_INFO.nit}`, 50, startY + 30);
			if (EMPRESA_INFO.direccion)
				doc.text(EMPRESA_INFO.direccion, 50, startY + 45);
			if (EMPRESA_INFO.telefono)
				doc.text(`Tel: ${EMPRESA_INFO.telefono}`, 50, startY + 60);
			doc.text(`Vendedor: ${data.vendedor.nombre}`, 50, startY + 75);

			doc.fontSize(10).fillColor("#6b7280").text("CLIENTE:", 350, startY);
			doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold");
			doc.text(data.cliente.nombre, 350, startY + 15);
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			if (data.cliente.nit)
				doc.text(`NIT: ${data.cliente.nit}`, 350, startY + 30);
			if (data.cliente.direccion)
				doc.text(data.cliente.direccion, 350, startY + 45);
			if (data.cliente.telefono)
				doc.text(`Tel: ${data.cliente.telefono}`, 350, startY + 60);

			// Tabla de productos
			const tableTop = 280;
			const tableLeft = 50;
			const tableWidth = 500;
			const pad = 6;
			type Col = {
				x: number;
				w: number;
				label: string;
				align: "left" | "right";
			};
			const cols: Col[] = [
				{ x: 50, w: 50, label: "Cant.", align: "left" },
				{ x: 100, w: 260, label: "Producto", align: "left" },
				{ x: 360, w: 90, label: "Precio Unit.", align: "right" },
				{ x: 450, w: 100, label: "Subtotal", align: "right" },
			];

			const headerH = 26;
			doc.rect(tableLeft, tableTop, tableWidth, headerH).fill("#059669");
			doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold");
			for (const c of cols) {
				doc.text(c.label, c.x + pad, tableTop + 9, {
					width: c.w - pad * 2,
					align: c.align,
				});
			}

			let rowY = tableTop + headerH;
			const rowH = 22;
			doc.font("Helvetica").fontSize(9);

			data.items.forEach((item, index) => {
				if (index % 2 === 0) {
					doc.rect(tableLeft, rowY, tableWidth, rowH).fill("#f0fdf4");
				}
				doc.fillColor("#374151");
				const yText = rowY + 7;
				doc.text(String(item.cantidad), cols[0].x + pad, yText, {
					width: cols[0].w - pad * 2,
					align: cols[0].align,
				});
				doc.text(item.producto, cols[1].x + pad, yText, {
					width: cols[1].w - pad * 2,
					align: cols[1].align,
					ellipsis: true,
				});
				doc.text(formatearPrecio(item.precioUnitario), cols[2].x + pad, yText, {
					width: cols[2].w - pad * 2,
					align: cols[2].align,
				});
				doc.text(formatearPrecio(item.subtotal), cols[3].x + pad, yText, {
					width: cols[3].w - pad * 2,
					align: cols[3].align,
				});
				rowY += rowH;
			});

			doc
				.moveTo(tableLeft, rowY)
				.lineTo(tableLeft + tableWidth, rowY)
				.stroke("#d1d5db");

			// Totales
			const totalsY = rowY + 18;
			const totalsBoxX = 330;
			const totalsBoxW = tableLeft + tableWidth - totalsBoxX;
			const labelW = 110;
			const valueX = totalsBoxX + labelW + 10;
			const valueW = totalsBoxW - labelW - 10;

			let ty = totalsY;
			doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
			doc.text("Subtotal:", totalsBoxX, ty, { width: labelW, align: "left" });
			doc.fillColor("#374151");
			doc.text(formatearPrecio(data.subtotal), valueX, ty, {
				width: valueW,
				align: "right",
			});
			ty += 18;

			if (data.impuestos && data.impuestos > 0) {
				doc.fillColor("#6b7280");
				doc.text("IVA:", totalsBoxX, ty, { width: labelW, align: "left" });
				doc.fillColor("#374151");
				doc.text(formatearPrecio(data.impuestos), valueX, ty, {
					width: valueW,
					align: "right",
				});
				ty += 18;
			}

			doc
				.moveTo(totalsBoxX, ty + 2)
				.lineTo(totalsBoxX + totalsBoxW, ty + 2)
				.stroke("#d1d5db");
			ty += 10;

			doc.rect(totalsBoxX, ty - 4, totalsBoxW, 28).fill("#065f46");
			doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold");
			doc.text("TOTAL", totalsBoxX + 10, ty + 4, {
				width: labelW,
				align: "left",
			});
			doc.text(formatearPrecio(data.total), valueX, ty + 4, {
				width: valueW - 8,
				align: "right",
			});
			ty += 40;

			// Aviso: este NO es una cotización
			doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6b7280");
			doc.text(
				"Este documento confirma el registro del pedido en el sistema. No constituye cotización ni factura.",
				50,
				ty,
				{ width: 500, lineGap: 2 },
			);

			if (data.notas) {
				ty += 30;
				doc.font("Helvetica-Bold").fontSize(10).fillColor("#6b7280");
				doc.text("Notas:", 50, ty, { width: 500 });
				doc.font("Helvetica").fillColor("#374151");
				doc.text(data.notas, 50, ty + 15, { width: 500, lineGap: 2 });
			}

			// Firmas
			doc.fontSize(10).fillColor("#374151");
			doc.text("_".repeat(30), 80, doc.page.height - 100);
			doc.text("Vendedor", 80, doc.page.height - 85);

			doc.text("_".repeat(30), 350, doc.page.height - 100);
			doc.text("Cliente / Autoriza", 350, doc.page.height - 85);

			doc.fontSize(8).fillColor("#9ca3af");
			doc.text(
				`Documento generado el ${new Date().toLocaleString("es-CO")}`,
				50,
				doc.page.height - 50,
				{ align: "center", width: 500 },
			);

			doc.end();
			stream.on("finish", () => resolve(filePath));
			stream.on("error", reject);
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Genera un PDF simple del Estado de Resultados
 */
export async function generateIncomeStatementPDF(
	periodo: string,
	data: {
		ingresos: Record<string, number>;
		costos: Record<string, number>;
		gastos: Record<string, number>;
		utilidadBruta: number;
		utilidadNeta: number;
	},
): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			const outputDir = path.join(process.cwd(), "temp", "reports");
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			const fileName = `ER_${periodo.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
			const filePath = path.join(outputDir, fileName);

			const doc = new PDFDocument({ margin: 50 });
			const stream = fs.createWriteStream(filePath);

			doc.pipe(stream);

			// Header
			doc.fontSize(20).fillColor("#1e40af");
			doc.text("ESTADO DE RESULTADOS", 50, 50, { align: "center" });

			doc.fontSize(12).fillColor("#6b7280");
			doc.text(EMPRESA_INFO.nombre || "Distribuidora de Aceites", 50, 80, {
				align: "center",
			});
			doc.text(`Período: ${periodo}`, 50, 100, { align: "center" });

			// Ingresos
			let y = 140;
			doc.fontSize(12).fillColor("#111827").font("Helvetica-Bold");
			doc.text("INGRESOS", 50, y);

			y += 25;
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			Object.entries(data.ingresos).forEach(([key, value]) => {
				doc.text(key, 70, y);
				doc.text(formatearPrecio(value), 420, y, { align: "right", width: 130 });
				y += 18;
			});

			// Costos
			y += 10;
			doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827");
			doc.text("COSTOS DE VENTAS", 50, y);

			y += 25;
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			Object.entries(data.costos).forEach(([key, value]) => {
				doc.text(key, 70, y);
				doc.text(formatearPrecio(value), 420, y, { align: "right", width: 130 });
				y += 18;
			});

			// Utilidad Bruta
			y += 10;
			doc.font("Helvetica-Bold").fontSize(11).fillColor("#059669");
			doc.text("UTILIDAD BRUTA", 50, y);
			doc.text(formatearPrecio(data.utilidadBruta), 420, y, { align: "right", width: 130 });

			// Gastos
			y += 30;
			doc.fontSize(12).fillColor("#111827");
			doc.text("GASTOS OPERATIVOS", 50, y);

			y += 25;
			doc.font("Helvetica").fontSize(10).fillColor("#374151");
			Object.entries(data.gastos).forEach(([key, value]) => {
				doc.text(key, 70, y);
				doc.text(formatearPrecio(value), 420, y, { align: "right", width: 130 });
				y += 18;
			});

			// Utilidad Neta
			y += 20;
			const isPositive = data.utilidadNeta >= 0;
			doc
				.font("Helvetica-Bold")
				.fontSize(14)
				.fillColor(isPositive ? "#059669" : "#dc2626");
			doc.text("UTILIDAD NETA", 50, y);
			doc.text(formatearPrecio(data.utilidadNeta), 420, y, { align: "right", width: 130 });

			// Footer
			doc.fontSize(9).fillColor("#9ca3af");
			doc.text(
				`Generado por ControlIA - ${new Date().toLocaleDateString("es-CO")}`,
				50,
				doc.page.height - 50,
				{ align: "center" },
			);

			doc.end();

			stream.on("finish", () => resolve(filePath));
			stream.on("error", reject);
		} catch (error) {
			reject(error);
		}
	});
}
