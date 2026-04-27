import { promises as fs } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import {
	type ClientExportData,
	clientDataService,
} from "../services/client-data-service";

/**
 * 📄 ADAPTADOR DOCUMENT-CLIENT
 *
 * Conecta el Document Agent con el servicio centralizado de clientes.
 * Proporciona métodos para exportar datos de clientes a diferentes formatos.
 */

export interface ExportResult {
	success: boolean;
	filePath?: string;
	clientCount: number;
	message: string;
}

/**
 * Exporta los datos de los clientes a un archivo Excel.
 * @returns Resultado de la exportación con ruta del archivo.
 */
export async function exportClientsToExcel(): Promise<ExportResult> {
	try {
		// Obtener datos de clientes desde el servicio centralizado
		const clients: ClientExportData[] =
			await clientDataService.getClientsForExport();

		// Manejar el caso de 0 clientes
		if (clients.length === 0) {
			return {
				success: false,
				clientCount: 0,
				message: "⚠️ No hay clientes registrados para exportar.",
			};
		}

		// Crear directorio de exports si no existe
		const exportsDir = path.resolve(process.cwd(), "exports");
		await fs.mkdir(exportsDir, { recursive: true });

		// Crear un nuevo libro de Excel
		const workbook = new ExcelJS.Workbook();
		workbook.creator = "ControlIA";
		workbook.created = new Date();

		const worksheet = workbook.addWorksheet("Clientes", {
			properties: { tabColor: { argb: "4472C4" } },
		});

		// Definir columnas con headers y anchos
		worksheet.columns = [
			{ header: "ID", key: "id", width: 15 },
			{ header: "Nombre", key: "nombre", width: 25 },
			{ header: "Email", key: "email", width: 30 },
			{ header: "Teléfono", key: "telefono", width: 18 },
			{ header: "Dirección", key: "direccion", width: 35 },
			{ header: "Notas", key: "notas", width: 40 },
			{ header: "Fecha Creación", key: "fechaCreacion", width: 15 },
		];

		// Estilizar header
		const headerRow = worksheet.getRow(1);
		headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
		headerRow.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: "4472C4" },
		};
		headerRow.alignment = { horizontal: "center", vertical: "middle" };
		headerRow.height = 25;

		// Agregar datos de clientes
		clients.forEach((client, index) => {
			const row = worksheet.addRow(client);

			// Alternar colores de filas
			if (index % 2 === 0) {
				row.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: { argb: "F2F2F2" },
				};
			}
		});

		// Agregar fila de resumen
		worksheet.addRow([]);
		const summaryRow = worksheet.addRow([
			"",
			`Total de Clientes: ${clients.length}`,
			"",
			"",
			"",
			"",
			"",
		]);
		summaryRow.font = { bold: true, italic: true };

		// Agregar bordes a todas las celdas con datos
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber <= clients.length + 1) {
				row.eachCell((cell) => {
					cell.border = {
						top: { style: "thin" },
						left: { style: "thin" },
						bottom: { style: "thin" },
						right: { style: "thin" },
					};
				});
			}
		});

		// Generar nombre de archivo con timestamp
		const timestamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.slice(0, 19);
		const fileName = `clientes_${timestamp}.xlsx`;
		const filePath = path.join(exportsDir, fileName);

		// Guardar el archivo Excel
		await workbook.xlsx.writeFile(filePath);

		console.log(`✅ Excel exportado: ${filePath} (${clients.length} clientes)`);

		return {
			success: true,
			filePath,
			clientCount: clients.length,
			message: `✅ Exportación exitosa: ${clients.length} clientes guardados en ${fileName}`,
		};
	} catch (error: any) {
		console.error("❌ Error al exportar clientes a Excel:", error.message);
		return {
			success: false,
			clientCount: 0,
			message: `❌ Error en exportación: ${error.message}`,
		};
	}
}

/**
 * Obtiene el conteo de clientes disponibles para exportar.
 * Útil para verificar antes de exportar.
 */
export async function getExportableClientCount(): Promise<number> {
	return await clientDataService.getClientCount();
}

/**
 * Obtiene una vista previa de los datos a exportar.
 */
export async function getExportPreview(): Promise<ClientExportData[]> {
	return await clientDataService.getClientsForExport();
}

// Exportar para uso directo
export default {
	exportClientsToExcel,
	getExportableClientCount,
	getExportPreview,
};
