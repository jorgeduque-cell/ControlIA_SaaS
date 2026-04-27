/**
 * Sanitiza la memoria conversacional antes de cada generateText.
 *
 * Problema real: si una llamada LLM falla después de persistir el user-message
 * pero antes de persistir la respuesta del assistant, quedan user-messages
 * huérfanos. AI SDK v6 rechaza estructuras con `user` → `user` consecutivos o
 * tool-calls sin su correspondiente tool-result, rompiendo TODAS las llamadas
 * siguientes hasta que se limpie a mano.
 *
 * Estrategia:
 *   1. `sanitizeConversation(conversationId)` — colapsa runs de user→user
 *      consecutivos dejando sólo el último (el más reciente = el que el usuario
 *      realmente quiere que se procese).
 *   2. `clearConversation(conversationId)` — borrado total. Usado como
 *      último recurso cuando el wrapper detecta AI_InvalidPromptError.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

type MessageRow = {
	message_id: string;
	role: string;
};

export async function sanitizeConversation(
	conversationId: string,
): Promise<{ deleted: number }> {
	let rows: MessageRow[];
	try {
		rows = await prisma.$queryRaw<MessageRow[]>`
			SELECT message_id, role
			FROM voltagent_memory_messages
			WHERE conversation_id = ${conversationId}
			ORDER BY created_at ASC
		`;
	} catch {
		// Tabla puede no existir todavía — sin datos, sin sanitización.
		return { deleted: 0 };
	}
	if (rows.length < 2) return { deleted: 0 };

	const toDelete: string[] = [];

	// Regla 1: runs de user→user consecutivos — conservar sólo el último.
	for (let i = 0; i < rows.length - 1; i++) {
		if (rows[i].role === "user" && rows[i + 1].role === "user") {
			toDelete.push(rows[i].message_id);
		}
	}

	if (toDelete.length === 0) return { deleted: 0 };

	try {
		const deleted = await prisma.$executeRaw`
			DELETE FROM voltagent_memory_messages
			WHERE message_id IN (${Prisma.join(toDelete)})
		`;
		console.log(
			`[MemorySanitizer] ${conversationId} — borrados ${deleted} user-messages huérfanos`,
		);
		return { deleted: Number(deleted) };
	} catch (err) {
		console.error("[MemorySanitizer] Error borrando huérfanos:", err);
		return { deleted: 0 };
	}
}

/**
 * Borrado total de la conversación. Último recurso cuando la estructura está
 * tan corrupta que ni la sanitización puntual la salva.
 */
export async function clearConversation(
	conversationId: string,
): Promise<{ deleted: number }> {
	try {
		const deleted = await prisma.$executeRaw`
			DELETE FROM voltagent_memory_messages
			WHERE conversation_id = ${conversationId}
		`;
		console.warn(
			`[MemorySanitizer] ${conversationId} — PURGA TOTAL: ${deleted} mensajes borrados`,
		);
		return { deleted: Number(deleted) };
	} catch (err) {
		console.error("[MemorySanitizer] Error en purga total:", err);
		return { deleted: 0 };
	}
}
