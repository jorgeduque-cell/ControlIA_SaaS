import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	type ExecutionStep,
	executeAutonomousLearning,
} from "../../services/autonomous-executor.js";
import {
	analyzeCapabilityGap,
	listLearnedCapabilities,
} from "../../services/self-improvement.js";

/**
 * Tool principal de auto-aprendizaje — TOTALMENTE AUTÓNOMO
 *
 * Cuando detecta un gap, ejecuta el ciclo COMPLETO sin pedir confirmación:
 *   detectar gap → investigar → diseñar → instalar deps → generar código
 *   → escribir archivos → validar TS → auto-fix si falla → registrar en DB
 *
 * El agente solo necesita llamar este tool con el request del usuario.
 * No hay pasos manuales, no hay "¿Procedo?".
 */
export const learnAndImplementTool = createTool({
	name: "learn_and_implement",
	description:
		"SISTEMA DE AUTO-APRENDIZAJE AUTÓNOMO: Cuando el usuario pide algo que el sistema no sabe hacer, " +
		"este tool investiga, genera el código TypeScript, lo escribe al disco, valida la compilación y " +
		"registra la nueva capacidad — TODO automáticamente sin intervención humana. " +
		"Úsalo cuando el usuario pida: integrar WhatsApp, enviar emails, leer QR, predicción de ventas, " +
		"reportes automáticos, o cualquier funcionalidad nueva.",
	tags: [
		"learning",
		"self-improvement",
		"auto-programming",
		"ai",
		"autonomous",
	],

	parameters: z.object({
		userRequest: z
			.string()
			.describe(
				"Solicitud original del usuario — texto exacto de lo que pidió",
			),
		context: z
			.string()
			.nullish()
			.describe(
				"Contexto adicional relevante (ej: sistema actual, restricciones)",
			),
		forceLearn: z
			.boolean()
			.nullish()
			.describe(
				"Si true, implementa aunque el sistema ya tenga una capacidad similar (para actualizar/mejorar)",
			),
	}),

	execute: async (params, options) => {
		const agentContext = options?.context;
		const vendedorIdStr =
			agentContext?.get?.("userId") || agentContext?.get?.("vendedorId");
		const vendedorId = vendedorIdStr
			? BigInt(vendedorIdStr as string)
			: undefined;

		// chatId para notificaciones en tiempo real a Telegram
		// VoltAgent guarda el chatId como "chatId" o "conversationId" en el contexto
		const chatId =
			(agentContext?.get?.("chatId") as string | undefined) ||
			(agentContext?.get?.("conversationId") as string | undefined) ||
			(vendedorIdStr as string | undefined); // fallback: usar el userId como chatId

		console.log(
			`[LearnAndImplement] 🎓 Analizando solicitud: "${params.userRequest.slice(0, 60)}..."`,
		);

		// ── PASO 1: Detectar si hay un gap ────────────────────────────────────────
		const gapAnalysis = await analyzeCapabilityGap(params.userRequest);

		if (!gapAnalysis.hasGap && !params.forceLearn) {
			return {
				success: true,
				message:
					"✅ El sistema ya tiene esta capacidad implementada.\n" +
					"No es necesario aprender nada nuevo — usa las herramientas existentes.",
				action: "use_existing",
				needsLearning: false,
			};
		}

		const gapDesc = gapAnalysis.hasGap
			? gapAnalysis.gapDescription
			: `Mejora/actualización de: ${params.userRequest.slice(0, 60)}`;

		console.log(`[LearnAndImplement] 🔍 Gap detectado: ${gapDesc}`);
		console.log(`[LearnAndImplement] 🚀 Iniciando implementación autónoma...`);

		// ── PASO 2: Ejecutar ciclo completo autónomamente ─────────────────────────
		const progressSteps: ExecutionStep[] = [];

		const result = await executeAutonomousLearning({
			userRequest: params.userRequest,
			gapDescription: gapDesc,
			researchQuery:
				gapAnalysis.researchQuery ||
				`nodejs ${params.userRequest.toLowerCase()} typescript implementation`,
			suggestedSolution: gapAnalysis.suggestedSolution || params.userRequest,
			vendedorId,
			chatId, // para notificaciones en tiempo real a Telegram
			onProgress: (step) => {
				progressSteps.push(step);
			},
		});

		// ── PASO 3: Formatear respuesta para el usuario ───────────────────────────
		const stepLog = progressSteps
			.map((s) => {
				const icon =
					s.status === "done"
						? "✅"
						: s.status === "failed"
							? "❌"
							: s.status === "skipped"
								? "⏭️"
								: "⏳";
				const time = s.durationMs
					? ` (${(s.durationMs / 1000).toFixed(1)}s)`
					: "";
				return `${icon} ${s.name}${time}: ${s.detail}`;
			})
			.join("\n");

		if (result.success) {
			const message =
				`🎓 <b>¡NUEVA CAPACIDAD IMPLEMENTADA AUTOMÁTICAMENTE!</b>\n\n` +
				`<b>Qué aprendí:</b> ${result.capabilityName}\n\n` +
				`<b>Proceso ejecutado:</b>\n${stepLog}\n\n` +
				`<b>Archivos creados:</b>\n${result.filesCreated.map((f) => `• <code>${f}</code>`).join("\n")}\n\n` +
				(result.dependenciesInstalled.length
					? `<b>Dependencias instaladas:</b> ${result.dependenciesInstalled.join(", ")}\n\n`
					: "") +
				(result.typecheckPassed
					? `✅ TypeScript: compilación exitosa\n`
					: result.rolledBack
						? `🔄 TypeScript: errores persistentes — archivos revertidos para mantener sistema limpio\n`
						: `⚠️ TypeScript: ${result.selfFixedErrors > 0 ? `${result.selfFixedErrors} errores auto-corregidos` : "errores presentes — revisar"}\n`) +
				`\n✅ <b>Ahora puedo:</b> ${result.capabilityName}`;

			return {
				success: true,
				message,
				action: "implemented",
				needsLearning: false,
				result,
				filesCreated: result.filesCreated,
				dependenciesInstalled: result.dependenciesInstalled,
				typecheckPassed: result.typecheckPassed,
			};
		} else {
			const message =
				`⚠️ <b>IMPLEMENTACIÓN PARCIAL</b>\n\n` +
				`Intenté implementar: ${result.capabilityName}\n\n` +
				`<b>Pasos ejecutados:</b>\n${stepLog}\n\n` +
				(result.filesCreated.length
					? `<b>Archivos generados (pueden requerir revisión):</b>\n${result.filesCreated.map((f) => `• <code>${f}</code>`).join("\n")}\n\n`
					: `❌ No se pudieron crear archivos\n\n`) +
				`Puedes pedirme que lo intente de nuevo o que sea más específico.`;

			return {
				success: false,
				message,
				action: "partial",
				needsLearning: true,
				result,
				filesCreated: result.filesCreated,
			};
		}
	},
});

// Re-export listLearnedCapabilities para uso del agente si lo necesita
export { listLearnedCapabilities };
