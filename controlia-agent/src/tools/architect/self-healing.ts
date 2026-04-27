import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	attemptAutoHeal,
	generateHealingReport,
	getHealingHistory,
	restartServer,
} from "../../services/self-healing.js";

/**
 * Tool para ejecutar auto-curación del sistema
 */
export const selfHealingTool = createTool({
	name: "self_healing",
	description: `Intenta auto-corregir errores del sistema sin intervención humana.
  
CAPACIDADES:
- Detectar errores comunes (módulos faltantes, errores de tipos, null references)
- Instalar dependencias automáticamente
- Aplicar fixes de código
- Generar reportes de salud del sistema
- Reiniciar el servidor si es necesario

USO: Cuando el sistema falla o el usuario dice "arreglate", "soluciona el error", "autocorregir"`,
	parameters: z.object({
		action: z
			.enum(["heal", "report", "history", "restart"])
			.describe("Acción a ejecutar"),
		errorMessage: z
			.string()
			.nullish()
			.describe("Mensaje de error a analizar (solo para 'heal')"),
		errorStack: z
			.string()
			.nullish()
			.describe("Stack trace del error (opcional)"),
	}),
	execute: async (params) => {
		switch (params.action) {
			case "heal": {
				if (!params.errorMessage) {
					return {
						success: false,
						message: "❌ Se requiere errorMessage para la acción 'heal'",
					};
				}

				const errorLog = {
					timestamp: new Date().toISOString(),
					errorType: "detected",
					errorMessage: params.errorMessage ?? "",
					stackTrace: params.errorStack ?? undefined,
				};

				const result = await attemptAutoHeal(errorLog);

				if (result.status === "fixed") {
					let message = `✅ **ERROR AUTO-CORREGIDO**\n\n`;
					message += `🔍 Diagnóstico: ${result.diagnosis}\n`;
					message += `📝 Archivos modificados: ${result.filesModified.join(", ")}\n`;
					if (result.restartRequired) {
						message += `🔄 Reinicio requerido\n`;
					}
					return { success: true, message, action: result };
				} else {
					return {
						success: false,
						message: `❌ No se pudo auto-corregir: ${result.diagnosis}\n\nEste error requiere intervención manual.`,
						action: result,
					};
				}
			}

			case "report": {
				const report = generateHealingReport();
				return {
					success: true,
					message: report,
				};
			}

			case "history": {
				const history = getHealingHistory();
				return {
					success: true,
					message: `📊 Historial de auto-curación (${history.length} eventos)`,
					data: history,
				};
			}

			case "restart": {
				const restarted = await restartServer();
				return {
					success: restarted,
					message: restarted
						? "🔄 Servidor reiniciado exitosamente"
						: "❌ No se pudo reiniciar el servidor",
				};
			}

			default:
				return { success: false, message: "Acción no reconocida" };
		}
	},
});
