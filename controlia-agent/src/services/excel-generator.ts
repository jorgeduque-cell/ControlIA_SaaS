import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

/**
 * Genera un archivo Excel desde datos JSON
 */
export function generateExcel<T extends Record<string, unknown>>(
	data: T[],
	sheetName: string,
	fileName?: string,
): string {
	// Crear directorio de salida si no existe
	const outputDir = path.join(process.cwd(), "temp", "exports");
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Nombre del archivo
	const finalFileName = fileName || `export_${sheetName}_${Date.now()}.xlsx`;
	const filePath = path.join(outputDir, finalFileName);

	// Crear workbook y worksheet
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.json_to_sheet(data);

	// Ajustar anchos de columna automáticamente
	const colWidths = autoFitColumns(data);
	ws["!cols"] = colWidths;

	// Agregar worksheet al workbook
	XLSX.utils.book_append_sheet(wb, ws, sheetName);

	// Guardar archivo
	XLSX.writeFile(wb, filePath);

	return filePath;
}

/**
 * Genera un archivo Excel con múltiples hojas
 */
export function generateMultiSheetExcel(
	sheets: { name: string; data: Record<string, unknown>[] }[],
	fileName?: string,
): string {
	const outputDir = path.join(process.cwd(), "temp", "exports");
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const finalFileName = fileName || `respaldo_completo_${Date.now()}.xlsx`;
	const filePath = path.join(outputDir, finalFileName);

	const wb = XLSX.utils.book_new();

	for (const sheet of sheets) {
		if (sheet.data.length === 0) continue;

		const ws = XLSX.utils.json_to_sheet(sheet.data);
		const colWidths = autoFitColumns(sheet.data);
		ws["!cols"] = colWidths;

		XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31)); // Excel limita nombres a 31 chars
	}

	XLSX.writeFile(wb, filePath);
	return filePath;
}

/**
 * Calcula el ancho óptimo de columnas
 */
function autoFitColumns<T extends Record<string, unknown>>(
	data: T[],
): { wch: number }[] {
	if (data.length === 0) return [];

	const keys = Object.keys(data[0]);
	const widths = keys.map((key) => {
		// Ancho basado en el header
		let maxWidth = key.length;

		// Revisar todos los valores
		for (const row of data) {
			const value = row[key];
			const strValue =
				value !== null && value !== undefined ? String(value) : "";
			maxWidth = Math.max(maxWidth, strValue.length);
		}

		// Máximo 50 caracteres, mínimo 10
		return { wch: Math.min(Math.max(maxWidth + 2, 10), 50) };
	});

	return widths;
}

/**
 * Formatea fechas para Excel
 */
export function formatDate(date: Date | null | undefined): string {
	if (!date) return "";
	return new Date(date).toLocaleDateString("es-CO", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

/**
 * Formatea moneda para Excel
 */
export function formatCurrency(amount: number | null | undefined): string {
	if (amount === null || amount === undefined) return "$0";
	return new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "COP",
		minimumFractionDigits: 0,
	}).format(amount);
}

/**
 * Limpia un nombre para usar como nombre de hoja de Excel
 * (elimina caracteres inválidos y limita a 31 caracteres)
 */
export function cleanSheetName(name: string): string {
	return name
		.replace(/[\\/*\[\]:?]/g, "") // Caracteres inválidos en nombres de hojas
		.substring(0, 31);
}
