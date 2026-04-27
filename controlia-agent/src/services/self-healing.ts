/**
 * Sistema de Auto-Curación (Self-Healing)
 *
 * Este sistema permite a ControlIA:
 * 1. Monitorear sus propios errores
 * 2. Detectar problemas automáticamente
 * 3. Generar fixes sin intervención humana
 * 4. Aplicar cambios y reiniciar si es necesario
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function isValidNpmPackage(name: string): boolean {
	// Scoped: @scope/package or unscoped: package-name
	return /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+$/.test(name);
}

export interface ErrorLog {
	timestamp: string;
	errorType: string;
	errorMessage: string;
	filePath?: string;
	lineNumber?: number;
	stackTrace?: string;
}

export interface HealingAction {
	id: string;
	timestamp: string;
	errorDetected: ErrorLog;
	diagnosis: string;
	fixGenerated: boolean;
	filesModified: string[];
	restartRequired: boolean;
	status: "detected" | "fixing" | "fixed" | "failed";
}

// Almacenamiento de acciones de curación
const healingHistory: HealingAction[] = [];

/**
 * Analiza un error y determina si puede auto-corregirse
 */
export function analyzeError(
	errorMessage: string,
	stackTrace?: string,
): {
	canHeal: boolean;
	diagnosis: string;
	suggestedFix: string;
	filesToCheck: string[];
} {
	const error = errorMessage.toLowerCase();

	// Error: Cannot find module
	if (
		error.includes("cannot find module") ||
		error.includes("module not found")
	) {
		const moduleMatch = errorMessage.match(
			/cannot find module ['"]([^'"]+)['"]/i,
		);
		const missingModule = moduleMatch ? moduleMatch[1] : "unknown";

		return {
			canHeal: true,
			diagnosis: `Módulo faltante: ${missingModule}`,
			suggestedFix: `npm install ${missingModule}`,
			filesToCheck: ["package.json"],
		};
	}

	// Error: TypeScript type error
	if (error.includes("error ts") || error.includes("type ")) {
		return {
			canHeal: true,
			diagnosis: "Error de tipos en TypeScript",
			suggestedFix: "Agregar validación de tipos o usar 'any' temporalmente",
			filesToCheck: extractFilePathsFromStack(stackTrace),
		};
	}

	// Error: Cannot read property of undefined
	if (
		error.includes("cannot read property") ||
		error.includes("of undefined")
	) {
		return {
			canHeal: true,
			diagnosis: "Acceso a propiedad de objeto undefined",
			suggestedFix: "Agregar optional chaining (?.) o validación de null",
			filesToCheck: extractFilePathsFromStack(stackTrace),
		};
	}

	// Error: ECONNREFUSED / Network error
	if (error.includes("econnrefused") || error.includes("enotfound")) {
		return {
			canHeal: false,
			diagnosis: "Error de conexión de red",
			suggestedFix:
				"Verificar conexión a internet - requiere intervención humana",
			filesToCheck: [],
		};
	}

	// Error: Database connection
	if (error.includes("database") || error.includes("prisma")) {
		return {
			canHeal: false,
			diagnosis: "Error de conexión a base de datos",
			suggestedFix: "Verificar DATABASE_URL - requiere intervención humana",
			filesToCheck: [".env"],
		};
	}

	// Default: unknown error
	return {
		canHeal: false,
		diagnosis: "Error no reconocido",
		suggestedFix: "Requiere análisis manual",
		filesToCheck: extractFilePathsFromStack(stackTrace),
	};
}

/**
 * Extrae rutas de archivos desde un stack trace.
 * Soporta paths Unix (/src/foo/bar.ts) y Windows (C:\src\foo\bar.ts o C:/src/foo/bar.ts).
 * Normaliza siempre a forward slashes.
 */
function extractFilePathsFromStack(stackTrace?: string): string[] {
	if (!stackTrace) return [];

	const matches: string[] = [];

	// Unix: /absolute/path/file.ts:10
	const unixMatches = stackTrace.match(/(?:^|\s)(\/[^\s:)]+\.tsx?)(?::\d+)?/gm);
	if (unixMatches) {
		for (const m of unixMatches) {
			matches.push(m.trim().replace(/:[\d]+$/, ""));
		}
	}

	// Windows: C:\path\to\file.ts:10  o  C:/path/to/file.ts:10
	const winMatches = stackTrace.match(/[A-Za-z]:[/\\][^\s:)]+\.tsx?(?::\d+)?/g);
	if (winMatches) {
		for (const m of winMatches) {
			matches.push(m.replace(/:[\d]+$/, "").replace(/\\/g, "/"));
		}
	}

	// Relativas: src/tools/foo/bar.ts:10
	const relMatches = stackTrace.match(/\bsrc[/\\][^\s:)]+\.tsx?(?::\d+)?/g);
	if (relMatches) {
		for (const m of relMatches) {
			matches.push(m.replace(/:[\d]+$/, "").replace(/\\/g, "/"));
		}
	}

	return [...new Set(matches)].filter((p) => !p.includes("node_modules"));
}

/**
 * Intenta auto-corregir un error
 */
export async function attemptAutoHeal(
	errorLog: ErrorLog,
): Promise<HealingAction> {
	const action: HealingAction = {
		id: `heal-${Date.now()}`,
		timestamp: new Date().toISOString(),
		errorDetected: errorLog,
		diagnosis: "",
		fixGenerated: false,
		filesModified: [],
		restartRequired: false,
		status: "detected",
	};

	healingHistory.push(action);

	// Analizar el error
	const analysis = analyzeError(errorLog.errorMessage, errorLog.stackTrace);
	action.diagnosis = analysis.diagnosis;

	if (!analysis.canHeal) {
		action.status = "failed";
		return action;
	}

	action.status = "fixing";

	try {
		// Caso 1: Módulo faltante
		if (analysis.suggestedFix.startsWith("npm install")) {
			const moduleName = analysis.suggestedFix
				.replace("npm install ", "")
				.trim();
			console.log(`[SelfHealing] Instalando módulo: ${moduleName}`);

			if (!isValidNpmPackage(moduleName)) {
				console.error("[SelfHealing] Nombre de módulo inválido:", moduleName);
				action.status = "failed";
				return action;
			}

			const { stdout, stderr } = await execFileAsync(
				"npm",
				["install", moduleName],
				{
					cwd: process.cwd(),
				},
			);
			console.log(`[SelfHealing] npm install output:`, stdout);

			action.filesModified.push("package.json", "package-lock.json");
			action.restartRequired = true;
			action.fixGenerated = true;
		}

		// Caso 2: Errores de tipos / runtime — reescritura automática DESHABILITADA.
		// Para reactivar: SELF_HEAL_REWRITE=true (solo en dev, nunca en prod).
		// El comportamiento anterior reescribía archivos enteros con IA desde stack traces,
		// lo que corrompió archivos reales. Ahora sólo reporta.
		if (
			errorLog.errorType === "typescript" ||
			analysis.diagnosis.includes("TypeScript") ||
			analysis.diagnosis.includes("undefined")
		) {
			const rewriteEnabled = process.env.SELF_HEAL_REWRITE === "true";
			if (!rewriteEnabled) {
				console.warn(
					`[SelfHealing] Reescritura automática deshabilitada. Archivos en stack: ${analysis.filesToCheck.join(", ") || "(ninguno)"}`,
				);
				action.status = "failed";
				action.fixGenerated = false;
				return action;
			}
			// Rama desactivada por defecto — mantener comentada para referencia futura.
		}

		action.status = "fixed";
	} catch (error) {
		console.error("[SelfHealing] Error aplicando fix:", error);
		action.status = "failed";
	}

	return action;
}

/**
 * Reinicia el servidor.
 * En producción (Render/PM2/nodemon) un process.exit(1) es suficiente
 * para que el process manager reinicie el proceso automáticamente.
 * Se espera 500ms para que el último log llegue a la consola.
 */
export async function restartServer(): Promise<boolean> {
	try {
		console.log("[SelfHealing] 🔄 Reiniciando servidor en 500ms...");
		// Dar tiempo al log para que se envíe antes de matar el proceso
		await new Promise((resolve) => setTimeout(resolve, 500));
		process.exit(1); // PM2 / nodemon / Render lo reinicia automáticamente
	} catch (error) {
		console.error("[SelfHealing] Error al reiniciar:", error);
		return false;
	}
}

/**
 * Obtiene historial de curación
 */
export function getHealingHistory(): HealingAction[] {
	return healingHistory;
}

/**
 * Genera reporte de auto-curación
 */
export function generateHealingReport(): string {
	const total = healingHistory.length;
	const fixed = healingHistory.filter((h) => h.status === "fixed").length;
	const failed = healingHistory.filter((h) => h.status === "failed").length;

	let report = `🩺 REPORTE DE AUTO-CURACIÓN\n`;
	report += `Total errores detectados: ${total}\n`;
	report += `✅ Auto-corregidos: ${fixed}\n`;
	report += `❌ Requieren intervención: ${failed}\n\n`;

	if (healingHistory.length > 0) {
		report += `ÚLTIMAS ACCIONES:\n`;
		healingHistory.slice(-5).forEach((h) => {
			report += `- ${h.timestamp}: ${h.diagnosis} (${h.status})\n`;
		});
	}

	return report;
}
