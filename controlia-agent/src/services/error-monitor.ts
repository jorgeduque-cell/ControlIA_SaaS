/**
 * Monitor de Errores en Tiempo Real
 *
 * Captura errores no manejados, intenta auto-curación y
 * notifica al admin de Telegram si el fix falla.
 */

import { config } from "../config/env.js";

let isMonitoring = false;
let adminNotifyFn: ((msg: string) => Promise<void>) | null = null;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

// Stored listeners so they can be removed on stop
let _uncaughtHandler: ((error: Error) => void) | null = null;
let _rejectionHandler: ((reason: unknown) => void) | null = null;

/** Guard anti-recursión: evita loop si attemptAutoHeal lanza una excepción */
let _handlingUncaught = false;
let _handlingRejection = false;

/**
 * Registra una función para notificar al admin por Telegram.
 * Llamar desde el bot handler después de inicializar el bot.
 */
export function registerAdminNotifier(
	fn: (msg: string) => Promise<void>,
): void {
	adminNotifyFn = fn;
}

async function notifyAdmin(message: string): Promise<void> {
	if (!adminNotifyFn || !config.ADMIN_CHAT_ID) return;
	try {
		await adminNotifyFn(message);
	} catch {
		// Silenciar — no queremos un loop de errores al notificar
	}
}

/**
 * Inicia el monitoreo de errores del proceso
 */
export function startErrorMonitoring(): void {
	if (isMonitoring) return;

	console.log("[ErrorMonitor] Iniciando monitoreo de errores...");

	// ── Errores no manejados ────────────────────────────────────────────────────
	_uncaughtHandler = async (error: Error) => {
		if (_handlingUncaught) return;
		_handlingUncaught = true;
		try {
			console.error("[ErrorMonitor] ⚠️ Excepción no manejada:", error.message);
			await notifyAdmin(
				`🚨 <b>Excepción no manejada</b>\n` +
					`<code>${error.message.slice(0, 300)}</code>\n` +
					`Timestamp: ${new Date().toISOString()}`,
			);
		} finally {
			_handlingUncaught = false;
		}
	};
	process.on("uncaughtException", _uncaughtHandler);

	// ── Promesas rechazadas ────────────────────────────────────────────────────
	_rejectionHandler = async (reason: unknown) => {
		if (_handlingRejection) return;
		_handlingRejection = true;
		try {
			const msg = reason instanceof Error ? reason.message : String(reason);
			console.error("[ErrorMonitor] ⚠️ Promesa rechazada no manejada:", msg);

			// No spamear al admin con errores recuperables/transitorios de providers.
			// Son ruido: rate limits, timeouts, conexiones flaky — el sistema ya
			// tiene retry con backoff en las capas superiores.
			const low = msg.toLowerCase();
			const isTransient =
				low.includes("rate limit") ||
				low.includes("rate_limit") ||
				low.includes("tokens per min") ||
				low.includes("tpm") ||
				low.includes("429") ||
				low.includes("etimedout") ||
				low.includes("econnreset") ||
				low.includes("enotfound") ||
				low.includes("socket hang up") ||
				low.includes("fetch failed") ||
				low.includes("expected") ||
				low.includes("cancelled") ||
				low.includes("aborted");

			if (!isTransient) {
				await notifyAdmin(
					`⚠️ <b>Promesa rechazada sin manejar</b>\n` +
						`<code>${msg.slice(0, 300)}</code>`,
				);
			}
		} finally {
			_handlingRejection = false;
		}
	};
	process.on("unhandledRejection", _rejectionHandler);

	// ── Health check cada 30 segundos ─────────────────────────────────────────
	_healthCheckInterval = setInterval(() => {
		checkSystemHealth();
	}, 30_000);

	isMonitoring = true;
	console.log("[ErrorMonitor] ✅ Monitoreo activado");
}

/**
 * Verifica la salud del sistema: memoria, heap, etc.
 */
async function checkSystemHealth(): Promise<void> {
	const mem = process.memoryUsage();
	const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
	const rssMB = Math.round(mem.rss / 1024 / 1024);

	if (heapMB > 400) {
		const msg = `[ErrorMonitor] ⚠️ Uso de memoria alto: heap=${heapMB}MB rss=${rssMB}MB`;
		console.warn(msg);

		// Forzar garbage collection si está disponible (Node --expose-gc)
		if (typeof global.gc === "function") {
			global.gc();
			const afterMem = process.memoryUsage();
			const afterMB = Math.round(afterMem.heapUsed / 1024 / 1024);
			console.log(`[ErrorMonitor] GC forzado: ${heapMB}MB → ${afterMB}MB`);
		}

		// Notificar al admin si supera 512MB (potencial OOM)
		if (heapMB > 512) {
			await notifyAdmin(
				`⚠️ <b>Memoria crítica</b>\n` +
					`Heap: ${heapMB}MB | RSS: ${rssMB}MB\n` +
					`El proceso puede fallar pronto.`,
			);
		}
	}
}

/**
 * Detiene el monitoreo (solo marca el flag — los listeners de process no se pueden remover)
 */
export function stopErrorMonitoring(): void {
	isMonitoring = false;
	if (_uncaughtHandler) {
		process.removeListener("uncaughtException", _uncaughtHandler);
		_uncaughtHandler = null;
	}
	if (_rejectionHandler) {
		process.removeListener("unhandledRejection", _rejectionHandler);
		_rejectionHandler = null;
	}
	if (_healthCheckInterval) {
		clearInterval(_healthCheckInterval);
		_healthCheckInterval = null;
	}
	console.log("[ErrorMonitor] Monitoreo desactivado");
}

export function isMonitoringActive(): boolean {
	return isMonitoring;
}
