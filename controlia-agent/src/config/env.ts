import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	DATABASE_URL: z.string().url(),

	// Anthropic (Claude Sonnet 4.6) - Architect tier (solo generación de código)
	ANTHROPIC_API_KEY: z.string().startsWith("sk-").optional().or(z.literal("")),

	// Google Gemini - Reasoning tier (Supervisor) - FREE tier disponible
	GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional().or(z.literal("")),

	// DeepSeek V3 - Fast tier (agentes operativos) - 95% más barato que Sonnet
	DEEPSEEK_API_KEY: z.string().startsWith("sk-").optional().or(z.literal("")),

	// Groq - Fast + Nano tier GRATUITO (Llama 3.3 70B 1000/día, Llama 3.1 8B 14400/día)
	// Obtén tu API key gratis en: https://console.groq.com → no requiere tarjeta
	GROQ_API_KEY: z.string().optional().or(z.literal("")),

	// Cerebras - Nano tier GRATUITO (1,000,000 tokens/día, Llama 3.3 70B)
	// Obtén tu API key gratis en: https://cloud.cerebras.ai → no requiere tarjeta
	CEREBRAS_API_KEY: z.string().optional().or(z.literal("")),

	// Moonshot (Kimi K2.5) - Fast tier fallback
	MOONSHOT_API_KEY: z.string().startsWith("sk-").optional().or(z.literal("")),
	MOONSHOT_BASE_URL: z.string().url().default("https://api.moonshot.cn/v1"),

	// OpenAI - Embeddings (text-embedding-3-small) + fallback
	OPENAI_API_KEY: z.string().startsWith("sk-").optional().or(z.literal("")),

	// Tavily - Web search real para el Architect (https://tavily.com)
	TAVILY_API_KEY: z.string().optional().or(z.literal("")),

	// Serper - Alternativa a Tavily (Google Search API)
	SERPER_API_KEY: z.string().optional().or(z.literal("")),

	TELEGRAM_BOT_TOKEN: z.string().min(1),
	ADMIN_CHAT_ID: z.string().optional(),
	ORS_API_KEY: z.string().optional(),
	SUBSCRIPTION_PRICE_COP: z.string().transform(Number).default("80000"),
	TRIAL_DAYS: z.string().transform(Number).default("7"),
	MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
	VOLTAGENT_PUBLIC_KEY: z.string().optional(),
	VOLTAGENT_SECRET_KEY: z.string().optional(),

	// Calendario público (Google/Outlook/Apple) en formato ICS para plan_my_day
	CALENDAR_ICS_URL: z.string().url().optional().or(z.literal("")),

	// WhatsApp vía Twilio (opcional) — sid, token, from (formato "whatsapp:+14155238886")
	TWILIO_ACCOUNT_SID: z.string().optional().or(z.literal("")),
	TWILIO_AUTH_TOKEN: z.string().optional().or(z.literal("")),
	TWILIO_WHATSAPP_FROM: z.string().optional().or(z.literal("")),

	// WhatsApp Business API (Meta Cloud API) — para recibir y responder mensajes
	WHATSAPP_ACCESS_TOKEN: z.string().optional().or(z.literal("")),
	WHATSAPP_PHONE_NUMBER_ID: z.string().optional().or(z.literal("")),
	WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional().or(z.literal("")),
	WHATSAPP_WEBHOOK_PORT: z.string().transform(Number).default("3142"),

	// Email (SMTP vía nodemailer)
	SMTP_HOST: z.string().optional().or(z.literal("")),
	SMTP_PORT: z.string().transform(Number).default("587"),
	SMTP_USER: z.string().optional().or(z.literal("")),
	SMTP_PASS: z.string().optional().or(z.literal("")),
	SMTP_FROM: z.string().email().optional().or(z.literal("")),

	// Self-healing (deshabilitado por defecto — evita reescritura de archivos por LLM)
	SELF_HEAL_REWRITE: z.string().optional().or(z.literal("")),
});

export const config = envSchema.parse(process.env);
