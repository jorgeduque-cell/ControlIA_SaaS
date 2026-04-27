import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { config } from "./env.js";

/**
 * Configuración de Providers — Híbrido Groq+OpenAI, CLIs para tareas pesadas
 *
 * TIER        MODELO PRIMARIO      PARA
 * ─────────── ──────────────────── ─────────────────────────────────────────────
 * architect   OpenAI gpt-4o        Architect (razonamiento + delega a Claude/Kimi Code CLI)
 * reasoning   OpenAI gpt-4o        Supervisor (routing de intenciones — calidad crítica)
 * fast        Groq Llama-3.3-70B   Finance, Routing, Research (14.4K req/día gratis)
 * nano        Groq Llama-3.1-8B    CRM, Sales, Inventory, Content, Document, Context, Notifications
 *
 * ¿POR QUÉ HÍBRIDO?
 * - Supervisor (reasoning) y Architect necesitan calidad top para routing + TS.
 * - Los 7+ agentes Nano viven en bucle de delegate_task → concentran el 80% del
 *   tráfico. Ponerlos en Groq libera los 30K TPM de OpenAI gpt-4o para el
 *   Supervisor, que ANTES se saturaba cuando Nano también golpeaba gpt-4o-mini
 *   (mismo TPM pool en cuenta Tier-1).
 *
 * TAREAS PESADAS (auto-aprendizaje, refactors, self-healing profundo):
 *   El Architect delega a `claude_code` (Claude Pro/Max) o `kimi_code` (Kimi Allegretto)
 *   vía shell-exec. No gastan tokens de API — usan tu suscripción fija.
 *
 * FALLBACK EN CASCADA (si el primario falla):
 *   Groq → OpenAI → Cerebras → Gemini → Anthropic → DeepSeek → Moonshot
 */

// Opt-in explícito para providers con saldo 0 — evita que errores de
// "Insufficient Balance" / "credit balance too low" burbujeen al usuario
// cuando el fallback automático los alcanza como último recurso.
// Activa con ANTHROPIC_ENABLED=true / DEEPSEEK_ENABLED=true / MOONSHOT_ENABLED=true.
const isEnabled = (v: string | undefined) =>
	v === "true" || v === "1" || v === "yes";

const hasAnthropic =
	!!(config.ANTHROPIC_API_KEY && config.ANTHROPIC_API_KEY.length > 10) &&
	isEnabled(process.env.ANTHROPIC_ENABLED);
const hasGemini = !!(
	config.GOOGLE_GENERATIVE_AI_API_KEY &&
	config.GOOGLE_GENERATIVE_AI_API_KEY.length > 5
);
const hasDeepSeek =
	!!(config.DEEPSEEK_API_KEY && config.DEEPSEEK_API_KEY.length > 10) &&
	isEnabled(process.env.DEEPSEEK_ENABLED);
const hasMoonshot =
	!!(config.MOONSHOT_API_KEY && config.MOONSHOT_API_KEY.length > 10) &&
	isEnabled(process.env.MOONSHOT_ENABLED);
const hasOpenAI = !!(
	config.OPENAI_API_KEY && config.OPENAI_API_KEY.length > 10
);
const hasGroq = !!(config.GROQ_API_KEY && config.GROQ_API_KEY.length > 5);
const hasCerebras = !!(
	config.CEREBRAS_API_KEY && config.CEREBRAS_API_KEY.length > 5
);

// Log providers activos al arrancar
const activos = [
	hasOpenAI && `OpenAI gpt-4o (PRIMARIO: architect + reasoning)`,
	hasGroq && `Groq (PRIMARIO: fast Llama-70B + nano Llama-8B)`,
	hasCerebras && `Cerebras (fallback: 1M tokens/día)`,
	hasGemini && `Gemini 1.5 Flash (fallback: 1500/día)`,
	hasAnthropic && `Anthropic Claude (fallback + embeddings)`,
	hasDeepSeek && `DeepSeek (fallback)`,
	hasMoonshot && `Moonshot (fallback)`,
].filter(Boolean);

if (activos.length === 0) {
	console.warn(
		"⚠️  No hay providers de AI configurados. El agente no funcionará.",
	);
} else {
	console.log(`🤖 Providers activos:\n   ${activos.join("\n   ")}`);
}

if (!hasGroq && !hasCerebras) {
	console.warn(
		"💡 TIP: Para 0 rate limits agrega GROQ_API_KEY (gratis en console.groq.com)",
	);
}

// ── Instancias de providers ───────────────────────────────────────────────────

export const anthropicProvider = hasAnthropic
	? createAnthropic({ apiKey: config.ANTHROPIC_API_KEY })
	: null;

export const geminiProvider = hasGemini
	? createGoogleGenerativeAI({ apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY })
	: null;

export const deepseekProvider = hasDeepSeek
	? createDeepSeek({ apiKey: config.DEEPSEEK_API_KEY })
	: null;

// Groq — OpenAI-compatible, Llama 3.1/3.3 gratis
export const groqProvider = hasGroq
	? createOpenAI({
			apiKey: config.GROQ_API_KEY,
			baseURL: "https://api.groq.com/openai/v1",
		})
	: null;

// Cerebras — OpenAI-compatible, 1M tokens/día gratis
export const cerebrasProvider = hasCerebras
	? createOpenAI({
			apiKey: config.CEREBRAS_API_KEY,
			baseURL: "https://api.cerebras.ai/v1",
		})
	: null;

// Moonshot — OpenAI-compatible
export const moonshotProvider = hasMoonshot
	? createOpenAI({
			apiKey: config.MOONSHOT_API_KEY,
			baseURL: config.MOONSHOT_BASE_URL,
		})
	: null;

export const openAIProvider = hasOpenAI
	? createOpenAI({ apiKey: config.OPENAI_API_KEY })
	: null;

// ── Modelos ───────────────────────────────────────────────────────────────────

const MODELS = {
	// Architect — máxima calidad para código TypeScript en producción
	ANTHROPIC_ARCHITECT: "claude-sonnet-4-6",
	ANTHROPIC_HAIKU: "claude-haiku-4-5-20251001",

	// Groq — gratis, function calling nativo
	GROQ_70B: "llama-3.3-70b-versatile", // 1,000 req/día — para razonamiento
	GROQ_8B: "llama-3.1-8b-instant", // 14,400 req/día — para CRUD simple

	// Cerebras — gratis, 1M tokens/día
	CEREBRAS_70B: "llama-3.3-70b",

	// Gemini 1.5 Flash — 1,500 req/día gratis (NO usar 2.5 = 20/día, NO usar 2.0 = deprecado)
	GEMINI_FREE: "gemini-1.5-flash",

	// Otros
	DEEPSEEK_CHAT: "deepseek-chat",
	MOONSHOT_FAST: "kimi-k2-5",
	OPENAI_REASONING: "gpt-4o",
	OPENAI_FAST: "gpt-4o-mini",
} as const;

// ── Selector de modelo por tier ───────────────────────────────────────────────

export type BrainTier = "architect" | "reasoning" | "fast" | "nano";

export function getAIModel(tier: BrainTier = "fast") {
	// ── ARCHITECT: OpenAI gpt-4o primero (Anthropic sin créditos — fallback) ──
	if (tier === "architect") {
		if (openAIProvider) return openAIProvider.chat(MODELS.OPENAI_REASONING);
		if (groqProvider) return groqProvider.chat(MODELS.GROQ_70B);
		if (cerebrasProvider) return cerebrasProvider.chat(MODELS.CEREBRAS_70B);
		if (geminiProvider) return geminiProvider(MODELS.GEMINI_FREE);
		if (anthropicProvider) return anthropicProvider(MODELS.ANTHROPIC_ARCHITECT);
		if (deepseekProvider) return deepseekProvider(MODELS.DEEPSEEK_CHAT);
		throw new Error("No hay provider configurado para tier=architect");
	}

	// ── REASONING: OpenAI gpt-4o (Supervisor — routing + decomposición) ──
	// Anthropic Sonnet 4.6 quedó como fallback tras agotar créditos. Cuando
	// recargues Anthropic, vuelve a poner anthropicProvider al principio
	// para recuperar Sonnet 4.6 en el Supervisor.
	if (tier === "reasoning") {
		if (openAIProvider) return openAIProvider.chat(MODELS.OPENAI_REASONING);
		if (groqProvider) return groqProvider.chat(MODELS.GROQ_70B);
		if (cerebrasProvider) return cerebrasProvider.chat(MODELS.CEREBRAS_70B);
		if (geminiProvider) return geminiProvider(MODELS.GEMINI_FREE);
		if (anthropicProvider) return anthropicProvider(MODELS.ANTHROPIC_ARCHITECT);
		if (deepseekProvider) return deepseekProvider(MODELS.DEEPSEEK_CHAT);
		throw new Error("No hay provider configurado para tier=reasoning");
	}

	// ── FAST: Groq Llama 3.3 70B (Finance, Routing, Research) ──
	// Groq primero — libera TPM de OpenAI para el Supervisor.
	if (tier === "fast") {
		if (groqProvider) return groqProvider.chat(MODELS.GROQ_70B);
		if (openAIProvider) return openAIProvider.chat(MODELS.OPENAI_FAST);
		if (cerebrasProvider) return cerebrasProvider.chat(MODELS.CEREBRAS_70B);
		if (geminiProvider) return geminiProvider(MODELS.GEMINI_FREE);
		if (anthropicProvider) return anthropicProvider(MODELS.ANTHROPIC_HAIKU);
		if (deepseekProvider) return deepseekProvider(MODELS.DEEPSEEK_CHAT);
		throw new Error("No hay provider configurado para tier=fast");
	}

	// ── NANO: Groq Llama 3.1 8B (CRM, Sales, Inventory, Content, Document, Context, Notifications) ──
	// 14.4K req/día gratis. Libera gpt-4o-mini (mismo TPM pool que gpt-4o)
	// para que el Supervisor no se sature con rate limits cuando hay mucha
	// actividad de sub-agentes.
	if (groqProvider) return groqProvider.chat(MODELS.GROQ_8B);
	if (openAIProvider) return openAIProvider.chat(MODELS.OPENAI_FAST);
	if (cerebrasProvider) return cerebrasProvider.chat(MODELS.CEREBRAS_70B);
	if (geminiProvider) return geminiProvider(MODELS.GEMINI_FREE);
	if (anthropicProvider) return anthropicProvider(MODELS.ANTHROPIC_HAIKU);
	if (deepseekProvider) return deepseekProvider(MODELS.DEEPSEEK_CHAT);
	throw new Error("No hay provider configurado para tier=nano");
}

export const activeProvider =
	groqProvider ??
	deepseekProvider ??
	anthropicProvider ??
	geminiProvider ??
	cerebrasProvider ??
	moonshotProvider ??
	openAIProvider;

// ── Cadena de modelos con fallback automático (VoltAgent AgentModelConfig[]) ──
//
// VoltAgent detecta errores reintentables (429 rate_limit, 503, timeouts) y
// prueba el siguiente modelo del array. Esto hace al sistema resiliente cuando
// un provider (ej. Groq 8B con 6K TPM) se satura.
//
// Orden: primario gratis → fallback pagado → redes alternativas.

type ModelEntry = { id: string; model: ReturnType<typeof getAIModel> };

export function getAIModelChain(tier: BrainTier = "fast"): ModelEntry[] {
	const chain: ModelEntry[] = [];

	if (tier === "architect" || tier === "reasoning") {
		// Supervisor / Architect: calidad primero, Groq 70B como red de seguridad.
		if (openAIProvider)
			chain.push({
				id: `openai-${MODELS.OPENAI_REASONING}`,
				model: openAIProvider.chat(MODELS.OPENAI_REASONING),
			});
		if (groqProvider)
			chain.push({
				id: `groq-${MODELS.GROQ_70B}`,
				model: groqProvider.chat(MODELS.GROQ_70B),
			});
		if (cerebrasProvider)
			chain.push({
				id: `cerebras-${MODELS.CEREBRAS_70B}`,
				model: cerebrasProvider.chat(MODELS.CEREBRAS_70B),
			});
		if (anthropicProvider)
			chain.push({
				id: `anthropic-${MODELS.ANTHROPIC_ARCHITECT}`,
				model: anthropicProvider(MODELS.ANTHROPIC_ARCHITECT),
			});
		if (geminiProvider)
			chain.push({
				id: `gemini-${MODELS.GEMINI_FREE}`,
				model: geminiProvider(MODELS.GEMINI_FREE),
			});
		if (deepseekProvider)
			chain.push({
				id: `deepseek-${MODELS.DEEPSEEK_CHAT}`,
				model: deepseekProvider(MODELS.DEEPSEEK_CHAT),
			});
	} else if (tier === "fast") {
		// Finance/Routing/Research: Groq 70B primero, fallback gpt-4o-mini.
		if (groqProvider)
			chain.push({
				id: `groq-${MODELS.GROQ_70B}`,
				model: groqProvider.chat(MODELS.GROQ_70B),
			});
		if (cerebrasProvider)
			chain.push({
				id: `cerebras-${MODELS.CEREBRAS_70B}`,
				model: cerebrasProvider.chat(MODELS.CEREBRAS_70B),
			});
		if (openAIProvider)
			chain.push({
				id: `openai-${MODELS.OPENAI_FAST}`,
				model: openAIProvider.chat(MODELS.OPENAI_FAST),
			});
		if (geminiProvider)
			chain.push({
				id: `gemini-${MODELS.GEMINI_FREE}`,
				model: geminiProvider(MODELS.GEMINI_FREE),
			});
		if (anthropicProvider)
			chain.push({
				id: `anthropic-${MODELS.ANTHROPIC_HAIKU}`,
				model: anthropicProvider(MODELS.ANTHROPIC_HAIKU),
			});
		if (deepseekProvider)
			chain.push({
				id: `deepseek-${MODELS.DEEPSEEK_CHAT}`,
				model: deepseekProvider(MODELS.DEEPSEEK_CHAT),
			});
	} else {
		// NANO (7 agentes): Groq 8B barato → Groq 70B → gpt-4o-mini → Gemini.
		// El Groq 8B tiene solo 6K TPM; cuando se sature el sistema cae al
		// 70B de Groq (12K TPM) y luego a OpenAI sin que el usuario vea el
		// fallo.
		if (groqProvider)
			chain.push({
				id: `groq-${MODELS.GROQ_8B}`,
				model: groqProvider.chat(MODELS.GROQ_8B),
			});
		if (groqProvider)
			chain.push({
				id: `groq-${MODELS.GROQ_70B}`,
				model: groqProvider.chat(MODELS.GROQ_70B),
			});
		if (cerebrasProvider)
			chain.push({
				id: `cerebras-${MODELS.CEREBRAS_70B}`,
				model: cerebrasProvider.chat(MODELS.CEREBRAS_70B),
			});
		if (openAIProvider)
			chain.push({
				id: `openai-${MODELS.OPENAI_FAST}`,
				model: openAIProvider.chat(MODELS.OPENAI_FAST),
			});
		if (geminiProvider)
			chain.push({
				id: `gemini-${MODELS.GEMINI_FREE}`,
				model: geminiProvider(MODELS.GEMINI_FREE),
			});
		if (anthropicProvider)
			chain.push({
				id: `anthropic-${MODELS.ANTHROPIC_HAIKU}`,
				model: anthropicProvider(MODELS.ANTHROPIC_HAIKU),
			});
		if (deepseekProvider)
			chain.push({
				id: `deepseek-${MODELS.DEEPSEEK_CHAT}`,
				model: deepseekProvider(MODELS.DEEPSEEK_CHAT),
			});
	}

	if (chain.length === 0) {
		throw new Error(`No hay providers configurados para tier=${tier}`);
	}
	return chain;
}
