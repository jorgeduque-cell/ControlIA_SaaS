import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	generateAuditReport,
	getTodayLogs,
	verifyFileCreation,
} from "../../services/architect-logger.js";

/**
 * Tool para verificar auditoría del Architect Agent
 * Permite al usuario ver qué ha hecho realmente el sistema
 */
export const auditLogTool = createTool({
	name: "audit_architect_activity",
	description:
		"Verificar la actividad del Architect Agent. Muestra logs de qué acciones ha realizado, " +
		"qué archivos ha creado y el estado de las integraciones. Usa esto para auditar el trabajo del agente.",
	tags: ["audit", "logs", "verification", "architect"],

	parameters: z.object({
		action: z
			.enum(["report", "verify_file", "list_today"])
			.default("report")
			.describe(
				"'report'=reporte completo, 'verify_file'=verificar archivo específico, 'list_today'=listar acciones de hoy",
			),
		filePath: z
			.string()
			.nullish()
			.describe(
				"Ruta del archivo a verificar (solo para action='verify_file')",
			),
	}),

	execute: async (params) => {
		try {
			switch (params.action) {
				case "report": {
					const report = generateAuditReport();
					return {
						success: true,
						message: report,
						type: "report",
					};
				}

				case "verify_file": {
					if (!params.filePath) {
						return {
							success: false,
							message: "❌ Debes proporcionar filePath para verificar",
						};
					}

					const exists = verifyFileCreation(params.filePath);
					return {
						success: true,
						message: exists
							? `✅ Archivo VERIFICADO: ${params.filePath} existe`
							: `❌ Archivo NO EXISTE: ${params.filePath}`,
						fileExists: exists,
						filePath: params.filePath,
					};
				}

				case "list_today": {
					const logs = getTodayLogs();
					if (logs.length === 0) {
						return {
							success: true,
							message: "📋 No hay actividad registrada hoy",
							count: 0,
						};
					}

					let message = `📋 ACTIVIDAD DE HOY (${logs.length} acciones)\n\n`;
					logs.forEach((log, i) => {
						message += `${i + 1}. ${log.details.substring(0, 100)}...\n`;
					});

					return {
						success: true,
						message,
						count: logs.length,
						logs,
					};
				}

				default:
					return {
						success: false,
						message: "❌ Acción no reconocida",
					};
			}
		} catch (error) {
			console.error("[audit_log] Error:", error);
			return {
				success: false,
				message:
					"❌ Error en auditoría: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
