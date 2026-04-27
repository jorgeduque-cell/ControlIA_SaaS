/**
 * Wrapper resiliente alrededor de `agent.generateText()`:
 *   1. Sanitiza la memoria ANTES de la llamada (colapsa user→user huérfanos).
 *   2. Si la llamada lanza AI_InvalidPromptError (memoria estructuralmente
 *      inválida que la sanitización no pudo salvar), PURGA la conversación y
 *      reintenta UNA vez. Mejor perder contexto que tener un bot muerto.
 *
 * Sólo intercepta el tipo de error específico de AI SDK — otras fallas
 * (rate limit, red, tool crash) se propagan sin tocar memoria.
 */

import type { Agent } from "@voltagent/core";
import {
	clearConversation,
	sanitizeConversation,
} from "./memory-sanitizer.js";

type GenerateTextParams = Parameters<Agent["generateText"]>;
type GenerateTextResult = Awaited<ReturnType<Agent["generateText"]>>;

function isInvalidPromptError(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	const e = err as { name?: string; constructor?: { name?: string } };
	return (
		e.name === "AI_InvalidPromptError" ||
		e.constructor?.name === "AI_InvalidPromptError"
	);
}

export async function safeGenerateText(
	agent: Agent,
	prompt: GenerateTextParams[0],
	options: GenerateTextParams[1] & {
		memory?: { conversationId?: string };
	},
): Promise<GenerateTextResult> {
	const conversationId = options?.memory?.conversationId;

	if (conversationId) {
		await sanitizeConversation(conversationId);
	}

	try {
		return await agent.generateText(prompt, options);
	} catch (err) {
		if (!isInvalidPromptError(err)) throw err;
		if (!conversationId) throw err;

		console.warn(
			`[SafeGenerate] AI_InvalidPromptError en ${conversationId}. Purgando memoria y reintentando una vez.`,
		);
		await clearConversation(conversationId);

		// Segundo intento en memoria vacía. Si vuelve a fallar propagamos — el
		// error ya no es culpa de la memoria.
		return await agent.generateText(prompt, options);
	}
}
