/**
 * Organización de archivos generados (PDFs, Excel, backups) en el disco.
 *
 * Estructura:
 *   <root>/
 *     cotizaciones/YYYY/MM/COT-YYYY-NNNN.pdf
 *     remisiones/YYYY/MM/REM-YYYY-NNNN.pdf
 *     ordenes-compra/YYYY/MM/OC-YYYY-NNNN.pdf
 *     reportes/YYYY/MM/<nombre>.pdf
 *     excel/YYYY/MM/<nombre>.xlsx
 *     backups/YYYY-MM-DD/<archivo>
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DocumentoTipo =
	| "cotizacion"
	| "pedido"
	| "remision"
	| "orden-compra"
	| "reporte"
	| "excel"
	| "backup"
	| "chart";

function docsRoot(): string {
	const envRoot = process.env.CONTROLIA_DOCS_ROOT;
	if (envRoot && envRoot.trim().length > 0) return envRoot;
	return path.join(os.homedir(), "Desktop", "ControlIA");
}

function subdirFor(tipo: DocumentoTipo): string {
	switch (tipo) {
		case "cotizacion":
			return "cotizaciones";
		case "pedido":
			return "pedidos";
		case "remision":
			return "remisiones";
		case "orden-compra":
			return "ordenes-compra";
		case "reporte":
			return "reportes";
		case "excel":
			return "excel";
		case "backup":
			return "backups";
		case "chart":
			return "charts";
	}
}

function monthPartition(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return path.join(String(y), m);
}

function dayPartition(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * Devuelve (y crea si falta) la carpeta destino para un documento.
 */
export function ensureDocDir(
	tipo: DocumentoTipo,
	date: Date = new Date(),
): string {
	const base = docsRoot();
	const partition = tipo === "backup" ? dayPartition(date) : monthPartition(date);
	const dir = path.join(base, subdirFor(tipo), partition);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Construye la ruta absoluta esperada para un archivo, creando la carpeta.
 */
export function buildDocPath(
	tipo: DocumentoTipo,
	fileName: string,
	date: Date = new Date(),
): string {
	const dir = ensureDocDir(tipo, date);
	return path.join(dir, fileName);
}

/**
 * Devuelve la carpeta raíz para mostrársela al usuario.
 */
export function getDocsRoot(): string {
	return docsRoot();
}
