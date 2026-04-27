/**
 * Slash commands del bot de Telegram.
 *
 * Cada función devuelve un string ya formateado con HTML parse_mode.
 * El vendedor_id es directamente el chat.id de Telegram (convención actual
 * del adapter — ver src/adapters/telegram.ts).
 */

import { prisma } from "../db/client.js";

const MODO_TIER_MAP: Record<string, "fast" | "reasoning"> = {
	rapido: "fast",
	rápido: "fast",
	preciso: "reasoning",
};

// ── /status ────────────────────────────────────────────────────────────────
export async function cmdStatus(vendedorId: bigint): Promise<string> {
	const [pedidosPendientes, stockCriticoRes, pref] = await Promise.all([
		prisma.pedidos.count({
			where: { vendedor_id: vendedorId, estado: "Pendiente" },
		}),
		prisma.$queryRaw<Array<{ count: bigint }>>`
			SELECT COUNT(*)::bigint AS count FROM productos
			WHERE vendedor_id = ${vendedorId}
			  AND stock_actual IS NOT NULL
			  AND stock_minimo IS NOT NULL
			  AND stock_actual <= stock_minimo
		`,
		leerPreferencia(vendedorId),
	]);

	const stockCritico = Number(stockCriticoRes[0]?.count ?? 0n);
	const modelo =
		pref === "reasoning"
			? "gpt-4o (preciso)"
			: pref === "fast"
				? "Groq 70B / gpt-4o-mini (rápido)"
				: "auto (fast tier por defecto)";

	return [
		"🤖 <b>ControlIA Status</b>",
		"",
		`Modo: ${modelo}`,
		`Pedidos pendientes: ${pedidosPendientes}`,
		`Stock crítico: ${stockCritico} productos`,
		"",
		"Sistema operativo ✅",
	].join("\n");
}

// ── /uso ───────────────────────────────────────────────────────────────────
export async function cmdUso(vendedorId: bigint): Promise<string> {
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);
	const conversationId = `telegram-${vendedorId}`;

	const mensajesHoy = await countMessagesByConversation(conversationId, hoy);
	const mensajesTotal = await countMessagesByConversation(conversationId);
	const llamadasEstimadas = Math.floor(mensajesHoy / 2);

	return [
		"📊 <b>Uso estimado</b>",
		"",
		`Mensajes hoy: ${mensajesHoy}`,
		`Mensajes totales en contexto: ${mensajesTotal}`,
		`Interacciones completas hoy: ~${llamadasEstimadas}`,
		"",
		"<i>Tracking detallado de tokens pendiente.</i>",
	].join("\n");
}

// ── /memoria ───────────────────────────────────────────────────────────────
export async function cmdMemoria(vendedorId: bigint): Promise<string> {
	const conversationId = `telegram-${vendedorId}`;
	const [mensajesContexto, ultimoCreatedAt] = await Promise.all([
		countMessagesByConversation(conversationId),
		lastMessageTime(conversationId),
	]);

	const ultimaActividad = ultimoCreatedAt
		? `hace ${Math.floor((Date.now() - ultimoCreatedAt.getTime()) / 60000)} min`
		: "nunca";

	return [
		"🧠 <b>Memoria conversacional</b>",
		"",
		`Mensajes en contexto: ${mensajesContexto} (límite: 40)`,
		`Última actividad: ${ultimaActividad}`,
		"",
		"Opciones:",
		"/limpiar — borra todo el contexto conversacional",
	].join("\n");
}

// ── /limpiar ───────────────────────────────────────────────────────────────
export async function cmdLimpiar(vendedorId: bigint): Promise<string> {
	const conversationId = `telegram-${vendedorId}`;
	let eliminados = 0;

	try {
		const res = await prisma.$executeRaw`
			DELETE FROM voltagent_memory_messages
			WHERE conversation_id = ${conversationId}
		`;
		eliminados = Number(res);
	} catch (err) {
		console.error("[cmdLimpiar] Error borrando mensajes:", err);
	}

	await prisma.audit_log.create({
		data: {
			vendedor_id: vendedorId,
			accion: "CLEAR_MEMORY",
			entidad: "voltagent_memory_messages",
			entidad_id: conversationId,
			usuario_id: vendedorId.toString(),
			datos: { mensajes_eliminados: eliminados },
		},
	});

	return [
		"🗑 <b>Contexto limpiado</b>",
		"",
		"Conversación reiniciada.",
		`${eliminados} mensajes eliminados.`,
	].join("\n");
}

// ── /modo [rapido|preciso] ─────────────────────────────────────────────────
export async function cmdModo(
	vendedorId: bigint,
	modoArg: string | undefined,
): Promise<string> {
	const modo = (modoArg ?? "").toLowerCase().trim();
	const tier = MODO_TIER_MAP[modo];

	if (!tier) {
		return [
			"Uso:",
			"<code>/modo rapido</code>   → respuestas rápidas (Groq/gpt-4o-mini)",
			"<code>/modo preciso</code>  → máxima calidad (gpt-4o)",
		].join("\n");
	}

	await prisma.context_memory.create({
		data: {
			vendedor_id: vendedorId,
			tipo: "user_preference",
			contenido: tier,
			metadata: { kind: "preferred_tier", value: tier },
		},
	});

	return modo.startsWith("rap")
		? [
				"⚡️ <b>Modo rápido activado</b>",
				"",
				"Prioridad: Groq Llama 70B / gpt-4o-mini",
				"Respuestas más veloces, menor costo.",
				"",
				"Usa <code>/modo preciso</code> para máxima calidad.",
			].join("\n")
		: [
				"🎯 <b>Modo preciso activado</b>",
				"",
				"Prioridad: gpt-4o",
				"Máxima calidad en razonamiento complejo.",
				"",
				"Usa <code>/modo rapido</code> para velocidad.",
			].join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function countMessagesByConversation(
	conversationId: string,
	since?: Date,
): Promise<number> {
	try {
		const rows = since
			? await prisma.$queryRaw<Array<{ count: bigint }>>`
				SELECT COUNT(*)::bigint AS count FROM voltagent_memory_messages
				WHERE conversation_id = ${conversationId}
				  AND created_at >= ${since}
			`
			: await prisma.$queryRaw<Array<{ count: bigint }>>`
				SELECT COUNT(*)::bigint AS count FROM voltagent_memory_messages
				WHERE conversation_id = ${conversationId}
			`;
		return Number(rows[0]?.count ?? 0n);
	} catch {
		// Tabla aún no creada (primera ejecución) — no es error
		return 0;
	}
}

async function lastMessageTime(
	conversationId: string,
): Promise<Date | null> {
	try {
		const rows = await prisma.$queryRaw<Array<{ created_at: Date }>>`
			SELECT created_at FROM voltagent_memory_messages
			WHERE conversation_id = ${conversationId}
			ORDER BY created_at DESC LIMIT 1
		`;
		return rows[0]?.created_at ?? null;
	} catch {
		return null;
	}
}

async function leerPreferencia(
	vendedorId: bigint,
): Promise<"fast" | "reasoning" | null> {
	const pref = await prisma.context_memory.findFirst({
		where: { vendedor_id: vendedorId, tipo: "user_preference" },
		orderBy: { created_at: "desc" },
		select: { contenido: true },
	});
	const val = pref?.contenido;
	return val === "fast" || val === "reasoning" ? val : null;
}

/**
 * Dispatcher: detecta si el texto es un slash command soportado y lo ejecuta.
 * Devuelve `null` si no es un comando reconocido, o el texto ya formateado.
 */
export async function handleSlashCommand(
	vendedorId: bigint,
	text: string,
): Promise<string | null> {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;

	// Quitar el @botname que Telegram adjunta a veces (/status@MiBot)
	const cleaned = trimmed.replace(/@\S+/, "");
	const [command, ...args] = cleaned.split(/\s+/);

	switch (command) {
		case "/status":
			return cmdStatus(vendedorId);
		case "/uso":
			return cmdUso(vendedorId);
		case "/memoria":
			return cmdMemoria(vendedorId);
		case "/limpiar":
			return cmdLimpiar(vendedorId);
		case "/modo":
			return cmdModo(vendedorId, args[0]);
		default:
			return null;
	}
}
