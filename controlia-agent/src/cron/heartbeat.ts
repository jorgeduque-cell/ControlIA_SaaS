/**
 * Daemon de heartbeat: cada N minutos chequea alertas (stock bajo, CxC
 * vencidas, pedidos sin despachar, OC pendientes) y le envía un resumen
 * proactivo al vendedor por Telegram.
 *
 * - Espera 45s tras el arranque para no atropellar la inicialización.
 * - Default 30min entre tics. Override con HEARTBEAT_INTERVAL_MS.
 * - Deshabilitable con HEARTBEAT_ENABLED=false (útil en CI/local).
 */

import type TelegramBot from "node-telegram-bot-api";
import {
	runCierreDiaForAll,
	runHeartbeatForAll,
} from "../services/heartbeat-service.js";

let initialTimeoutHandle: NodeJS.Timeout | null = null;
let intervalHandle: NodeJS.Timeout | null = null;

export function startHeartbeatCron(
	bot: TelegramBot,
	intervalMs: number = Number(process.env.HEARTBEAT_INTERVAL_MS) ||
		30 * 60 * 1000,
): void {
	if (process.env.HEARTBEAT_ENABLED === "false") {
		console.log("[Heartbeat] HEARTBEAT_ENABLED=false → daemon desactivado.");
		return;
	}

	const tick = async () => {
		try {
			await runHeartbeatForAll(bot);
		} catch (err) {
			console.error("[Heartbeat] Error en tick:", err);
		}
		try {
			await runCierreDiaForAll(bot);
		} catch (err) {
			console.error("[CierreDia] Error en tick:", err);
		}
	};

	// Espera 45s para no chocar con startup de providers/voltagent.
	initialTimeoutHandle = setTimeout(() => {
		void tick();
		intervalHandle = setInterval(() => void tick(), intervalMs);
	}, 45 * 1000);

	console.log(
		`[Heartbeat] Cron armado: primer tick en 45s, luego cada ${Math.round(intervalMs / 60000)}min.`,
	);
}

export function stopHeartbeatCron(): void {
	if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle);
	if (intervalHandle) clearInterval(intervalHandle);
	initialTimeoutHandle = null;
	intervalHandle = null;
}
