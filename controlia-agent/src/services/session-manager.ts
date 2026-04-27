/**
 * Session manager: serializa el procesamiento por chat_id de Telegram.
 *
 * Problema: si el usuario manda 3 mensajes seguidos muy rápido (p.ej. una voz
 * + texto + foto) el bot arrancaba 3 `generateText()` en paralelo. Esto:
 *   • causa escrituras concurrentes en voltagent_memory_* (orden perdido),
 *   • dispara race conditions en create-order / stock updates,
 *   • revienta el rate limit de OpenAI/Groq si los 3 mensajes caen en la
 *     misma ventana.
 *
 * Solución: un único `Promise` por chat_id. Cada mensaje espera al anterior
 * del mismo chat, pero chats distintos procesan en paralelo.
 *
 * Diseño:
 *   • Si una tarea falla, la cadena NO se rompe — el error se aísla y el
 *     siguiente mensaje del mismo chat procede normalmente.
 *   • Si nadie está esperando detrás, limpiamos la entrada del Map para no
 *     acumular referencias.
 *   • `hint` opcional — si el usuario lleva esperando > HINT_THRESHOLD_MS,
 *     le avisamos que estamos procesando el anterior.
 */

const queues = new Map<number, Promise<void>>();
const inFlight = new Set<number>();

const HINT_THRESHOLD_MS = 4000;

export interface SessionOptions {
	/**
	 * Callback opcional invocado si el mensaje lleva más de HINT_THRESHOLD_MS
	 * esperando en cola. Útil para mandar "un momento, terminando lo anterior…"
	 * al usuario sin interrumpir la tarea en curso.
	 */
	onWaitHint?: () => Promise<void> | void;
}

export async function runInSession<T>(
	chatId: number,
	task: () => Promise<T>,
	opts: SessionOptions = {},
): Promise<T> {
	const prev = queues.get(chatId) ?? Promise.resolve();

	let resolveLink!: () => void;
	const nextLink = new Promise<void>((res) => {
		resolveLink = res;
	});
	queues.set(chatId, nextLink);

	// Si la espera se alarga, avisamos al usuario — sin bloquear.
	let hintFired = false;
	const hintTimer = opts.onWaitHint
		? setTimeout(() => {
				hintFired = true;
				try {
					void opts.onWaitHint?.();
				} catch (e) {
					console.error("[SessionManager] onWaitHint error:", e);
				}
			}, HINT_THRESHOLD_MS)
		: null;

	try {
		// Esperamos el turno previo, pero NO propagamos sus errores (ya fueron
		// reportados al usuario en su propio handler).
		try {
			await prev;
		} catch {
			/* aislado */
		}

		if (hintTimer) clearTimeout(hintTimer);
		if (hintFired) {
			// El hint ya se disparó — nada que hacer, solo evitar doble aviso.
		}

		inFlight.add(chatId);
		try {
			return await task();
		} finally {
			inFlight.delete(chatId);
		}
	} finally {
		resolveLink();
		// Si seguimos siendo la cola (nadie encoló detrás), limpiamos.
		if (queues.get(chatId) === nextLink) {
			queues.delete(chatId);
		}
	}
}

/** Observabilidad: tamaño de colas activas. */
export function getSessionStats(): {
	chatsConCola: number;
	enEjecucion: number;
	chatsEnEjecucion: number[];
} {
	return {
		chatsConCola: queues.size,
		enEjecucion: inFlight.size,
		chatsEnEjecucion: Array.from(inFlight),
	};
}

/** Sólo para tests / reinicio controlado. */
export function resetSessionManager(): void {
	queues.clear();
	inFlight.clear();
}
