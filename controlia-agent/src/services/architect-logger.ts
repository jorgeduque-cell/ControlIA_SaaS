import fs from "fs";
import path from "path";

/**
 * Sistema de auditoría para el Architect Agent
 * Guarda logs de cada acción para verificación
 */

const LOG_DIR = path.join(process.cwd(), "logs", "architect");

// Asegurar que existe el directorio
if (!fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface ArchitectAction {
	timestamp: string;
	type:
		| "image_read"
		| "web_search"
		| "code_generated"
		| "code_applied"
		| "error";
	status: "started" | "completed" | "failed";
	details: string;
	filePath?: string;
	userRequest: string;
}

/**
 * Log de acción del Architect
 */
export function logArchitectAction(action: ArchitectAction): void {
	const date = new Date().toISOString().split("T")[0];
	const logFile = path.join(LOG_DIR, `architect-${date}.log`);

	const logEntry =
		`[${action.timestamp}] [${action.type.toUpperCase()}] [${action.status.toUpperCase()}]\n` +
		`Request: ${action.userRequest}\n` +
		`Details: ${action.details}\n` +
		(action.filePath ? `File: ${action.filePath}\n` : "") +
		"-".repeat(80) +
		"\n";

	fs.appendFileSync(logFile, logEntry, "utf-8");
	console.log(`[Architect Log] ${action.type}: ${action.status}`);
}

/**
 * Obtiene el historial de acciones del día
 */
export function getTodayLogs(): ArchitectAction[] {
	const date = new Date().toISOString().split("T")[0];
	const logFile = path.join(LOG_DIR, `architect-${date}.log`);

	if (!fs.existsSync(logFile)) {
		return [];
	}

	const content = fs.readFileSync(logFile, "utf-8");
	// Parse simple para mostrar
	return content
		.split("-".repeat(80))
		.filter((entry) => entry.trim())
		.map((entry) => ({
			timestamp: entry.match(/\[(.*?)\]/)?.[1] || "",
			type: "info" as any,
			status: "completed" as any,
			details: entry,
			userRequest: "",
		}));
}

/**
 * Verifica si un archivo fue realmente creado
 */
export function verifyFileCreation(filePath: string): boolean {
	const fullPath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);

	return fs.existsSync(fullPath);
}

/**
 * Genera reporte de auditoría
 */
export function generateAuditReport(): string {
	const date = new Date().toISOString().split("T")[0];
	const logFile = path.join(LOG_DIR, `architect-${date}.log`);

	let report = `📊 REPORTE DE AUDITORÍA - Architect Agent\n`;
	report += `Fecha: ${date}\n`;
	report += "=".repeat(80) + "\n\n";

	if (!fs.existsSync(logFile)) {
		report += "❌ No hay actividad registrada hoy\n";
		return report;
	}

	const content = fs.readFileSync(logFile, "utf-8");
	const entries = content.split("-".repeat(80)).filter((e) => e.trim());

	report += `Total de acciones: ${entries.length}\n\n`;

	// Contar por tipo
	const imageReads = entries.filter((e) => e.includes("[IMAGE_READ]")).length;
	const webSearches = entries.filter((e) => e.includes("[WEB_SEARCH]")).length;
	const codesGenerated = entries.filter((e) =>
		e.includes("[CODE_GENERATED]"),
	).length;
	const codesApplied = entries.filter((e) =>
		e.includes("[CODE_APPLIED]"),
	).length;
	const errors = entries.filter((e) => e.includes("[ERROR]")).length;

	report += `📷 Imágenes leídas: ${imageReads}\n`;
	report += `🔍 Búsquedas web: ${webSearches}\n`;
	report += `💻 Códigos generados: ${codesGenerated}\n`;
	report += `📝 Archivos creados: ${codesApplied}\n`;
	report += `❌ Errores: ${errors}\n\n`;

	// Últimas 5 acciones
	report += "ÚLTIMAS ACCIONES:\n";
	report += "-".repeat(80) + "\n";
	entries.slice(-5).forEach((entry, i) => {
		report += `${i + 1}. ${entry.trim()}\n\n`;
	});

	return report;
}
