/**
 * Notificador de Progreso — Singleton desacoplado
 *
 * Permite que autonomous-executor, self-healing, y cualquier servicio
 * envíe notificaciones al usuario de Telegram sin importar el bot
 * directamente (evita dependencias circulares con src/index.ts).
 *
 * Uso:
 *   // En src/index.ts, después de crear el bot:
 *   registerTelegramSender(async (chatId, msg, opts) => {
 *     await bot.telegram.sendMessage(chatId, msg, { parse_mode: opts?.parseMode });
 *   });
 *
 *   // En cualquier servicio:
 *   await notifyProgress(chatId, "Paso 3: instalando dependencias...");
 */

type SendMessageFn = (
	chatId: string,
	message: string,
	options?: { parseMode?: "HTML" | "Markdown" },
) => Promise<void>;

let _sendFn: SendMessageFn | null = null;

/** Registrar la función de envío del bot. Llamar UNA vez desde src/index.ts */
export function registerTelegramSender(fn: SendMessageFn): void {
	_sendFn = fn;
}

/** Enviar mensaje — si no hay función registrada, solo loggea en consola */
export async function notifyProgress(
	chatId: string | undefined | null,
	message: string,
	parseMode: "HTML" | "Markdown" = "HTML",
): Promise<void> {
	if (!chatId || !_sendFn) return;
	try {
		await _sendFn(chatId, message, { parseMode });
	} catch {
		// Silenciar — no queremos cascada de errores al notificar
	}
}

/** Notificación de inicio de aprendizaje autónomo */
export async function notifyLearningStart(
	chatId: string | undefined | null,
	capabilityName: string,
): Promise<void> {
	await notifyProgress(
		chatId,
		`🎓 <b>Iniciando aprendizaje autónomo...</b>\n\n` +
			`📚 <b>Capacidad:</b> <i>${capabilityName}</i>\n\n` +
			`⏳ Ejecutando 8 pasos automáticamente.\n` +
			`Te notificaré cuando termine (30-60 seg).`,
	);
}

/** Notificación de paso individual — solo envía pasos clave para no spamear */
export async function notifyLearningStep(
	chatId: string | undefined | null,
	step: number,
	name: string,
	status: "done" | "failed" | "running" | "skipped",
	detail?: string,
): Promise<void> {
	// Solo notificar pasos críticos: instalación, escritura, TypeScript, fix
	const keySteps = new Set([3, 5, 6, 7, 8]);
	if (!keySteps.has(step) || status === "running") return;

	const icon =
		status === "done"
			? "✅"
			: status === "failed"
				? "❌"
				: status === "skipped"
					? "⏭️"
					: "⏳";

	const detailStr = detail ? `\n<i>${detail.slice(0, 80)}</i>` : "";
	await notifyProgress(chatId, `${icon} Paso ${step}/8: ${name}${detailStr}`);
}

/** Notificación de resultado final */
export async function notifyLearningComplete(
	chatId: string | undefined | null,
	success: boolean,
	summary: string,
): Promise<void> {
	const header = success
		? `🎓 <b>¡Nueva capacidad implementada!</b>\n\n`
		: `⚠️ <b>Aprendizaje parcial — revisar</b>\n\n`;
	await notifyProgress(chatId, header + summary);
}

/** Notificación de auto-curación */
export async function notifyHealingResult(
	chatId: string | undefined | null,
	success: boolean,
	diagnosis: string,
	filesModified: string[],
): Promise<void> {
	if (success) {
		await notifyProgress(
			chatId,
			`🩺 <b>Auto-curación exitosa</b>\n` +
				`Diagnóstico: ${diagnosis}\n` +
				(filesModified.length
					? `Archivos corregidos: ${filesModified.join(", ")}`
					: ""),
		);
	} else {
		await notifyProgress(
			chatId,
			`🚨 <b>Error sin corregir — requiere atención</b>\n` +
				`Diagnóstico: ${diagnosis}`,
		);
	}
}
