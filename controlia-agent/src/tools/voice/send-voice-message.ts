import { createTool } from "@voltagent/core";
import { LRUCache } from "lru-cache";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { z } from "zod";

type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
type TTSModel = "tts-1" | "tts-1-hd";

interface CacheEntry {
	buffer: Buffer;
	createdAt: number;
}

const ttsCache = new LRUCache<string, CacheEntry>({
	max: 50,
	ttl: 1000 * 60 * 30,
});

function buildCacheKey(text: string, voice: TTSVoice, model: TTSModel): string {
	return `${model}:${voice}:${text.trim().toLowerCase()}`;
}

async function generateSpeech(
	client: OpenAI,
	text: string,
	voice: TTSVoice,
	model: TTSModel,
): Promise<Buffer> {
	const cacheKey = buildCacheKey(text, voice, model);
	const cached = ttsCache.get(cacheKey);

	if (cached) {
		return cached.buffer;
	}

	const response = await client.audio.speech.create({
		model,
		voice,
		input: text,
		response_format: "opus",
	});

	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	ttsCache.set(cacheKey, {
		buffer,
		createdAt: Date.now(),
	});

	return buffer;
}

async function sendVoiceToTelegram(
	bot: TelegramBot,
	chatId: string | number,
	audioBuffer: Buffer,
	caption?: string,
	duration?: number,
): Promise<{ messageId: number; fileId: string }> {
	const result = await bot.sendVoice(
		chatId,
		audioBuffer,
		{
			caption,
			duration,
		},
		{
			filename: "voice.ogg",
			contentType: "audio/ogg",
		},
	);

	return {
		messageId: result.message_id,
		fileId: result.voice!.file_id,
	};
}

function validateTextLength(text: string): void {
	const MAX_CHARS = 4096;
	if (text.length > MAX_CHARS) {
		throw new Error(
			`El texto excede el límite máximo de ${MAX_CHARS} caracteres (actual: ${text.length})`,
		);
	}
}

function getEnvVar(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Variable de entorno requerida no encontrada: ${name}`);
	}
	return value;
}

export const sendVoiceMessageTool = createTool({
	name: "send_voice_message",
	description:
		"Envía un mensaje de voz por Telegram a un chat_id dado. Acepta texto plano para convertir a voz usando OpenAI TTS, o un buffer de audio pre-generado en formato OGG. Orquesta el proceso de text-to-speech internamente cuando recibe texto.",
	tags: ["telegram", "voice", "tts", "audio", "messaging"],
	parameters: z.object({
		chat_id: z
			.union([z.string(), z.number()])
			.describe("ID del chat de Telegram al que se enviará el mensaje de voz"),
		text: z
			.string()
			.nullish()
			.describe(
				"Texto plano a convertir en voz usando OpenAI TTS (máximo 4096 caracteres)",
			),
		audio_buffer_base64: z
			.string()
			.nullish()
			.describe(
				"Buffer de audio pre-generado en formato OGG codificado en base64",
			),
		voice: z
			.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"])
			.nullish()
			.default("nova")
			.describe(
				"Voz de OpenAI TTS a utilizar (solo aplica cuando se usa text)",
			),
		model: z
			.enum(["tts-1", "tts-1-hd"])
			.nullish()
			.default("tts-1")
			.describe(
				"Modelo de TTS a utilizar: tts-1 (más rápido) o tts-1-hd (mayor calidad)",
			),
		caption: z
			.string()
			.nullish()
			.describe("Texto de caption opcional para acompañar el mensaje de voz"),
		duration: z
			.number()
			.int()
			.positive()
			.nullish()
			.describe(
				"Duración del audio en segundos (opcional, mejora la UI de Telegram)",
			),
		use_cache: z
			.boolean()
			.nullish()
			.default(true)
			.describe(
				"Si se debe usar caché para el TTS (evita regenerar audio idéntico)",
			),
	}),
	execute: async (params, _opts) => {
		try {
			const {
				chat_id,
				text,
				audio_buffer_base64,
				voice = "nova",
				model = "tts-1",
				caption,
				duration,
				use_cache = true,
			} = params;

			if (!text && !audio_buffer_base64) {
				return {
					success: false,
					message:
						"Error: Debes proporcionar al menos uno de los campos: 'text' o 'audio_buffer_base64'",
					data: null,
				};
			}

			if (text && audio_buffer_base64) {
				return {
					success: false,
					message:
						"Error: Proporciona solo uno de los campos: 'text' o 'audio_buffer_base64', no ambos",
					data: null,
				};
			}

			const telegramToken = getEnvVar("TELEGRAM_BOT_TOKEN");
			const bot = new TelegramBot(telegramToken);

			let audioBuffer: Buffer;
			let audioSource: "tts" | "pre-generated";
			let cachedResult = false;

			if (text) {
				validateTextLength(text);

				const openaiApiKey = getEnvVar("OPENAI_API_KEY");
				const openaiClient = new OpenAI({ apiKey: openaiApiKey });

				const cacheKey = buildCacheKey(
					text,
					voice as TTSVoice,
					model as TTSModel,
				);
				const existsInCache = ttsCache.has(cacheKey);

				if (!use_cache && existsInCache) {
					ttsCache.delete(cacheKey);
				}

				audioBuffer = await generateSpeech(
					openaiClient,
					text,
					voice as TTSVoice,
					model as TTSModel,
				);

				audioSource = "tts";
				cachedResult = existsInCache && !!use_cache;
			} else {
				try {
					audioBuffer = Buffer.from(audio_buffer_base64!, "base64");
				} catch {
					return {
						success: false,
						message:
							"Error: El audio_buffer_base64 proporcionado no es un base64 válido",
						data: null,
					};
				}

				if (audioBuffer.length === 0) {
					return {
						success: false,
						message: "Error: El buffer de audio está vacío",
						data: null,
					};
				}

				audioSource = "pre-generated";
			}

			const result = await sendVoiceToTelegram(
				bot,
				chat_id,
				audioBuffer,
				caption ?? undefined,
				duration ?? undefined,
			);

			const audioSizeKB = Math.round(audioBuffer.length / 1024);

			return {
				success: true,
				message: "Mensaje de voz enviado exitosamente",
				data: {
					message_id: result.messageId,
					file_id: result.fileId,
					chat_id,
					audio_source: audioSource,
					audio_size_kb: audioSizeKB,
					cached: cachedResult,
					voice: audioSource === "tts" ? voice : undefined,
					model: audioSource === "tts" ? model : undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `Error al enviar mensaje de voz: ${error instanceof Error ? error.message : String(error)}`,
				data: null,
			};
		}
	},
});
