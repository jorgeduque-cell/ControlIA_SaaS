import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import type { Agent } from "@voltagent/core";
import axios from "axios";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { architectAgent } from "../agents/architect.js";
import { config } from "../config/env.js";
import { cleanupOrphanedExecutions } from "../services/autonomous-executor.js";
import { startHeartbeatCron } from "../cron/heartbeat.js";
import { registerAdminNotifier } from "../services/error-monitor.js";
import { runHeartbeatManual } from "../services/heartbeat-service.js";
import { registerTelegramSender } from "../services/progress-notifier.js";
import { safeGenerateText } from "../services/safe-generate.js";
import { runInSession } from "../services/session-manager.js";
import { handleSlashCommand } from "../services/telegram-commands.js";
import { transcribeVoice } from "../services/voice-transcription.js";

const execPromise = promisify(exec);

/**
 * Detecta si una respuesta del supervisor es un rechazo inaceptable
 * ("no puedo", "no tengo la capacidad", etc.).
 */
function looksLikeRefusal(text: string): boolean {
	if (!text) return false;
	const lower = text.toLowerCase();
	const refusalPatterns = [
		"no tengo la capacidad",
		"no puedo desarrollar",
		"no puedo implementar",
		"no puedo conectarme",
		"no puedo hacer eso",
		"no puedo acceder",
		"no puedo realizar",
		"no puedo ejecutar",
		"no puedo crear",
		"no puedo generar",
		"no puedo aprender",
		"no puedo ayudar",
		"no estoy diseñado",
		"no estoy programado",
		"no tengo acceso",
		"no tengo esa funcionalidad",
		"no tengo esa herramienta",
		"no tengo esa capacidad",
		"no tengo la habilidad",
		"no es posible",
		"no puedo",
		"parece que no puedo",
		"parece que hubo un problema al intentar delegar",
		"lo siento, pero no",
	];
	return refusalPatterns.some((p) => lower.includes(p));
}

/**
 * Detecta si el usuario pide una acción directa de ejecución
 * (crear archivo, ejecutar comando, etc.) que commandExecutor puede hacer.
 */
// Memoria local de últimas solicitudes por chat (para entender "hazlo", "ya", "ok")
const lastUserRequests = new Map<number, string>();

/**
 * Memoria local de los últimos archivos generados por chat.
 *
 * El contextStore de VoltAgent se crea fresh por cada mensaje, así que
 * `lastPdfPath` se pierde al pasar al siguiente turno. Para que funcione
 * "mándame otra vez el PDF", persistimos aquí las rutas por chatId.
 *
 * TTL efectivo: mientras el archivo exista en disco.
 */
type RecentFile = { path: string; name: string; generatedAt: number };
const lastPdfByChat = new Map<number, RecentFile>();
const lastExcelByChat = new Map<number, RecentFile>();

/** Envía un PDF al chat y actualiza la memoria local. */
async function sendPdfToChat(
	bot: TelegramBot,
	chatId: number,
	pdfPath: string,
	pdfName: string,
	caption = "📄 Aquí está tu documento PDF",
): Promise<boolean> {
	try {
		if (!fs.existsSync(pdfPath)) {
			console.error(`[Telegram] PDF no encontrado en disco: ${pdfPath}`);
			return false;
		}
		await bot.sendChatAction(chatId, "upload_document");
		await bot.sendDocument(
			chatId,
			pdfPath,
			{ caption },
			{ filename: pdfName, contentType: "application/pdf" },
		);
		lastPdfByChat.set(chatId, {
			path: pdfPath,
			name: pdfName,
			generatedAt: Date.now(),
		});
		console.log(`[Telegram] PDF sent: ${pdfPath}`);
		return true;
	} catch (err) {
		console.error("[Telegram] Error sending PDF:", err);
		return false;
	}
}

/** Heurística: ¿el usuario pide reenviar el último PDF? */
function looksLikeResendPdfRequest(text: string): boolean {
	const t = text.toLowerCase().trim();
	if (t.length > 120) return false; // frases largas = otra intención
	const mentionsPdf =
		t.includes("pdf") ||
		t.includes("cotizaci") ||
		t.includes("remisi") ||
		t.includes("documento") ||
		t.includes("archivo");
	const wantsSend =
		t.includes("manda") ||
		t.includes("mándamelo") ||
		t.includes("mandamelo") ||
		t.includes("envía") ||
		t.includes("envia") ||
		t.includes("enviamelo") ||
		t.includes("envíame") ||
		t.includes("enviame") ||
		t.includes("pásame") ||
		t.includes("pasame") ||
		t.includes("dame");
	return mentionsPdf && wantsSend;
}

function looksLikeDirectCommand(text: string): boolean {
	if (!text) return false;
	const lower = text.toLowerCase();

	// Mensajes de insistencia cortos NO se interceptan a ciegas;
	// van al Supervisor con memoria completa.
	const shortInsistence = [
		"hazlo",
		"haz",
		"ya",
		"ok",
		"dale",
		"ve",
		"procede",
		"continua",
		"sigue",
	];
	if (text.length <= 12 && shortInsistence.some((w) => lower.includes(w))) {
		return false;
	}

	const directPatterns = [
		// Archivos / documentos
		"archivo",
		"fichero",
		"documento",
		"pdf",
		"txt",
		"csv",
		"json",
		"md",
		"excel",
		"word",
		"crea",
		"crear",
		"creame",
		"crees",
		"genera",
		"generame",
		"generar",
		"guarda",
		"guardalo",
		"guárdalo",
		"guardar",
		"guarde",
		"salva",
		"salvar",
		"escribe",
		"escribir",
		"escríbe",
		"escríbelo",
		// Ubicaciones
		"escritorio",
		"desktop",
		"pc",
		"computadora",
		"laptop",
		"mi equipo",
		"mi máquina",
		"descargas",
		"downloads",
		"documentos",
		"documents",
		"mi carpeta",
		// Terminal / comandos
		"ejecuta",
		"ejecutar",
		"corre",
		"correr",
		"correlo",
		"lanza",
		"lanzar",
		"comando",
		"script",
		"terminal",
		"consola",
		"cmd",
		"powershell",
		"bash",
		"mkdir",
		"touch ",
		"echo ",
		"cat ",
		"dir",
		"ls ",
		"cd ",
		"rm ",
		"del ",
		// Acciones de sistema
		"abre ",
		"abrir ",
		"instala",
		"instalar",
		"desinstala",
		"descarga",
		"descargar",
		"elimina",
		"eliminar",
		"borra",
		"borrar",
		"mueve",
		"mover",
		"copia",
		"copiar",
		// CLIs de coding
		"kimi code",
		"claude code",
		"claude terminal",
		"kimi terminal",
		"usa claude",
		"usa kimi",
	];
	return directPatterns.some((p) => lower.includes(p));
}

function isKimiRequest(text: string): boolean {
	if (!text) return false;
	const lower = text.toLowerCase();
	return (
		lower.includes("kimi code") ||
		lower.includes("kimi terminal") ||
		lower.includes("usa kimi")
	);
}

/**
 * Detecta si una respuesta de claude_terminal o kimi_terminal indica fallo
 * por saldo insuficiente, error de ejecución, o incapacidad de completar.
 */
function looksLikeCliFailure(text: string): boolean {
	if (!text) return false;
	const lower = text.toLowerCase();
	const failurePatterns = [
		"saldo de crédito insuficiente",
		"balance de crédito insuficiente",
		"crédito insuficiente",
		"saldo insuficiente",
		"problema al intentar ejecutar",
		"problema al intentar ejecutar la instrucción",
		"no se pudo completar",
		"no se pudo ejecutar",
		"error al ejecutar",
		"error al intentar",
		"comando falló",
		"no está disponible",
		"no está instalado",
		"no se encontró",
		"not found",
		"command not found",
	];
	return failurePatterns.some((p) => lower.includes(p));
}

/**
 * Ejecuta directamente una orden simple (crear archivo, etc.) sin depender del LLM.
 */
async function executeDirectCommand(
	bot: TelegramBot,
	chatId: number,
	text: string,
): Promise<{ success: boolean; message: string; filePath?: string }> {
	const lower = text.toLowerCase();

	// ── 1. Detectar orden de crear archivo ──────────────────────────────────
	let fileName: string | null = null;
	let targetDir = path.join(process.cwd(), "temp", "user-files");

	// Si menciona escritorio/desktop, guardar en el escritorio del usuario
	if (
		lower.includes("escritorio") ||
		lower.includes("desktop") ||
		lower.includes("mi pc") ||
		lower.includes("en mi computadora")
	) {
		targetDir = path.join(os.homedir(), "Desktop");
	}

	// Intentar extraer nombre de archivo con extensión explícita
	const explicitNameMatch = text.match(/["']([^"']+\.(txt|csv|json|md))["']/i);
	if (explicitNameMatch) {
		fileName = explicitNameMatch[1];
	} else {
		// Intentar encontrar palabra con extensión (ej: archivo.txt)
		const extMatch = text.match(/(\S+\.(txt|csv|json|md))/i);
		if (extMatch) {
			fileName = extMatch[1];
		} else {
			// Si solo menciona la extensión suelta (ej: "un archivo txt")
			const looseExtMatch = text.match(
				/(?:archivo|fichero|documento)\s+(?:de\s+)?(?:texto\s+)?(\w+)/i,
			);
			if (looseExtMatch) {
				const ext = looseExtMatch[1].toLowerCase();
				if (["txt", "csv", "json", "md"].includes(ext)) {
					fileName = `archivo.${ext}`;
				}
			}
		}
	}

	// Si detectamos un nombre de archivo, proceder
	if (fileName) {
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true });
		}
		const filePath = path.join(targetDir, fileName);

		// Extraer contenido
		let content = "";
		const contentIndicators = [
			/(?:con\s+(?:el\s+)?texto|que\s+diga|que\s+contenga|con\s+el\s+contenido|con)\s*[:\-]?\s*["']?(.+)["']?$/i,
			/(?:llamado|nombre)\s+["']?[^"']+["']?\s+(?:con\s+)?["']?(.+)["']?$/i,
		];
		for (const pattern of contentIndicators) {
			const m = text.match(pattern);
			if (m && m[1]) {
				content = m[1].trim();
				break;
			}
		}

		fs.writeFileSync(filePath, content, "utf-8");

		// Enviar el archivo por Telegram
		try {
			await bot.sendDocument(
				chatId,
				filePath,
				{
					caption: `✅ Archivo <b>${fileName}</b> creado en:\n<code>${filePath}</code>`,
				},
				{ filename: fileName, contentType: "text/plain" },
			);
		} catch (sendErr) {
			console.error("[DirectCommand] Error enviando archivo:", sendErr);
		}

		return {
			success: true,
			message: `✅ He creado el archivo <b>${fileName}</b> y te lo he enviado por Telegram.\n📁 Ubicación: <code>${filePath}</code>`,
			filePath,
		};
	}

	// ── 2. Detectar orden de ejecutar comando shell ─────────────────────────
	const shellMatch = text.match(
		/(?:ejecuta|corre|corre\s+el)\s+(?:el\s+)?comando\s*[:\-]?\s*["']?(.+)["']?$/i,
	);
	if (shellMatch && shellMatch[1]) {
		const command = shellMatch[1].trim();
		try {
			const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
			return {
				success: true,
				message: `✅ Comando ejecutado:\n<pre>${sanitizeTelegramHtml(stdout || stderr || "Sin salida")}</pre>`,
			};
		} catch (execErr: any) {
			return {
				success: false,
				message: `❌ Error ejecutando comando:\n<pre>${sanitizeTelegramHtml(execErr.message || String(execErr))}</pre>`,
			};
		}
	}

	return { success: false, message: "" };
}

const ALLOWED_HTML_TAGS = [
	"b",
	"i",
	"u",
	"s",
	"code",
	"pre",
	"a",
	"blockquote",
	"tg-spoiler",
	"tg-emoji",
];

function sanitizeTelegramHtml(text: string): string {
	if (!text) return text;
	// Escape ampersands not part of entities
	let sanitized = text.replace(
		/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g,
		"&amp;",
	);
	// Protect allowed tags
	const placeholders: string[] = [];
	const tagRe = new RegExp(
		`<(\\/?(?:${ALLOWED_HTML_TAGS.join("|")})(?:\\s+[^>]*)?)>`,
		"gi",
	);
	sanitized = sanitized.replace(tagRe, (match) => {
		placeholders.push(match);
		return `\0${placeholders.length - 1}\0`;
	});
	// Escape remaining < and >
	sanitized = sanitized.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	// Restore allowed tags
	sanitized = sanitized.replace(
		/\0(\d+)\0/g,
		(_, i) => placeholders[Number(i)],
	);
	return sanitized;
}

/**
 * Bridge between Telegram Bot API and VoltAgent Supervisor.
 * Each Telegram message → agent.generateText() with vendor context.
 */
export function startTelegramBridge(supervisorAgent: Agent) {
	// Use long polling for local dev, or set up webhooks for prod
	const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

	// Registrar función de envío para notificaciones de progreso (autonomous-executor, self-healing)
	registerTelegramSender(async (chatId, message, opts) => {
		await bot.sendMessage(chatId, message, {
			parse_mode: opts?.parseMode ?? "HTML",
		});
	});

	// Enganchar el notificador de admin del error-monitor al bot
	if (config.ADMIN_CHAT_ID) {
		registerAdminNotifier(async (message) => {
			await bot.sendMessage(config.ADMIN_CHAT_ID!, message, {
				parse_mode: "HTML",
			});
		});
	}

	// Limpiar ejecuciones huérfanas al arrancar (reinicio, crash, etc.)
	cleanupOrphanedExecutions();

	// Cron de alertas proactivas (stock bajo, CxC vencida, pedidos sin despachar, OC atrasadas)
	startHeartbeatCron(bot);

	// Handle text messages — serializadas por chat_id para evitar race conditions
	// cuando el usuario manda varios mensajes seguidos (voz + texto + foto, etc.).
	bot.on("message", async (msg) => {
		const chatId = msg.chat.id;

		await runInSession(
			chatId,
			async () => {
				return await processTelegramMessage(msg);
			},
			{
				onWaitHint: async () => {
					try {
						await bot.sendChatAction(chatId, "typing");
					} catch {
						/* silencioso — no bloquear si falla */
					}
				},
			},
		);
	});

	async function processTelegramMessage(
		msg: TelegramBot.Message,
	): Promise<void> {
		const chatId = msg.chat.id;

		// Handle voice messages
		if (msg.voice) {
			await handleVoiceMessage(bot, supervisorAgent, msg);
			return;
		}

		// Handle photo messages (for future vision capabilities)
		if (msg.photo) {
			await handlePhotoMessage(bot, supervisorAgent, msg);
			return;
		}

		let rawText = msg.text;
		if (!rawText) return;

		if (rawText === "/start") {
			await bot.sendMessage(
				chatId,
				"👋 ¡Hola! Soy ControlIA, tu asistente de ventas inteligente. Usa un lenguaje natural para pedirme lo que necesites, por ejemplo:\n\n💬 'Registra un cliente nuevo llamado Don Diego en la calle 22'\n💬 'Haz un pedido de 2 cocacolas para Don Diego'\n💬 'Ruta de hoy' / 'Qué visito hoy' → ruta de prospección con link Google Maps\n💬 'Cierre del día' → registro de visitas\n\n🎙️ También puedes enviarme mensajes de voz!\n\nComandos del sistema:\n/status /uso /memoria /limpiar /modo /briefing /ruta_hoy /cierre_dia /export_rutas",
			);
			return;
		}

		// ── Slash commands del sistema (status, uso, memoria, limpiar, modo, briefing) ───
		if (rawText.startsWith("/")) {
			// /briefing necesita el bot handle directo (envía PDF + texto),
			// por eso se maneja aquí en vez de en telegram-commands.ts.
			const cleaned = rawText.trim().replace(/@\S+/, "").split(/\s+/)[0];
			// Shortcuts de prospección: los traducimos a lenguaje natural y dejamos
			// que el supervisor enrute al sales agent.
			if (cleaned === "/ruta_hoy") {
				rawText = "Dame la ruta de prospección de hoy.";
			} else if (cleaned === "/cierre_dia") {
				rawText = "Cierre del día: ¿qué pasó con los prospectos que visité hoy?";
			} else if (cleaned === "/export_rutas") {
				rawText = "Exporta el excel actualizado de rutas de prospección.";
			}

			if (cleaned === "/briefing") {
				try {
					const ack = await runHeartbeatManual(
						BigInt(chatId),
						String(chatId),
						bot,
					);
					await bot.sendMessage(chatId, ack, { parse_mode: "HTML" });
				} catch (err) {
					console.error("[/briefing] Error:", err);
					await bot.sendMessage(
						chatId,
						"❌ No pude generar el briefing. Intenta de nuevo.",
					);
				}
				return;
			}

			try {
				const response = await handleSlashCommand(BigInt(chatId), rawText);
				if (response !== null) {
					await bot.sendMessage(chatId, response, { parse_mode: "HTML" });
					return;
				}
			} catch (cmdErr) {
				console.error("[SlashCommand] Error:", cmdErr);
				await bot.sendMessage(
					chatId,
					"❌ Error procesando el comando. Intenta de nuevo.",
				);
				return;
			}
		}

		// ── Shortcut: reenvío del último PDF sin pasar por el LLM ───────────────
		// Evita que el bot alucine "ya te lo mandé" cuando solo quiere reenviarlo.
		if (looksLikeResendPdfRequest(rawText)) {
			const cached = lastPdfByChat.get(chatId);
			if (cached && fs.existsSync(cached.path)) {
				await sendPdfToChat(
					bot,
					chatId,
					cached.path,
					cached.name,
					"📄 Reenvío del último documento generado",
				);
				return;
			}
		}

		// ── Resolver mensajes de insistencia usando contexto local ──────────────
		let text = rawText;
		const lowerRaw = rawText.toLowerCase();
		const isInsistence =
			rawText.length <= 12 &&
			[
				"hazlo",
				"haz",
				"ya",
				"ok",
				"dale",
				"ve",
				"procede",
				"continua",
				"sigue",
			].some((w) => lowerRaw.includes(w));
		const lastRequest = lastUserRequests.get(chatId);

		if (isInsistence && lastRequest) {
			// Reconstruimos el mensaje completo para que el LLM entienda el contexto
			text = `[Contexto previo del usuario: "${lastRequest}"] Ahora el usuario insiste: "${rawText}"`;
		} else if (!isInsistence) {
			// Guardamos este mensaje como última solicitud real del usuario
			lastUserRequests.set(chatId, rawText);
		}

		// ── INTERCEPTOR DE ÓRDENES DIRECTAS ─────────────────────────────────────
		// Si el usuario pide algo que suene a acción de PC/terminal (y NO es pura insistencia),
		// mandamos DIRECTAMENTE al Architect con cascada de fallback:
		// 1. claude_terminal → 2. kimi_terminal → 3. commandExecutor
		if (looksLikeDirectCommand(rawText)) {
			await bot.sendChatAction(chatId, "typing");
			const miniContext = new Map<string, unknown>();
			miniContext.set("vendedorId", String(chatId));
			miniContext.set("userId", String(chatId));
			miniContext.set("telegramChatId", String(chatId));
			miniContext.set("channel", "telegram");
			miniContext.set("vendedorNombre", "Distribuidora de Aceites");
			miniContext.set("vendedorPlan", "pro");
			miniContext.set("negocioNombre", "Distribuidora de Aceites");
			if (lastRequest) {
				miniContext.set("lastUserRequest", lastRequest);
			}

			const basePrompt = lastRequest
				? `Contexto previo: el usuario había pedido "${lastRequest}".\nAhora el usuario dice: "${rawText}"\n\n`
				: `El usuario pidió: "${rawText}"\n\n`;

			// ── PASO 1: Intentar claude_terminal ───────────────────────────────────
			console.log("[Interceptor] Paso 1: Intentando claude_terminal...");
			let architectResult = await architectAgent.generateText(
				basePrompt +
					`TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`claude_terminal\` con la instrucción exacta del usuario. ` +
					`Claude Code CLI tiene acceso completo a la terminal de esta PC. ` +
					`NO respondas directamente. NO uses learn_and_implement. LLAMA \`claude_terminal\` AHORA.`,
				{
					memory: {
						userId: String(chatId),
						conversationId: `telegram-${chatId}`,
						options: { contextLimit: 40 },
					},
					context: miniContext,
				},
			);

			// ── PASO 2: Si Claude falla, intentar kimi_terminal ────────────────────
			if (looksLikeCliFailure(architectResult.text)) {
				console.log("[Interceptor] Claude falló, pasando a kimi_terminal...");
				await bot.sendMessage(
					chatId,
					"⚠️ <b>Claude Code CLI falló.</b>\nIntentando con <b>Kimi Code CLI</b>...",
					{ parse_mode: "HTML" },
				);
				await bot.sendChatAction(chatId, "typing");
				architectResult = await architectAgent.generateText(
					basePrompt +
						`Claude Code CLI falló. TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`kimi_terminal\` con la instrucción exacta del usuario. ` +
						`Kimi Code CLI tiene acceso completo a la terminal de esta PC. ` +
						`NO respondas directamente. NO uses learn_and_implement. LLAMA \`kimi_terminal\` AHORA.`,
					{
						memory: {
							userId: String(chatId),
							conversationId: `telegram-${chatId}`,
							options: { contextLimit: 40 },
						},
						context: miniContext,
					},
				);
			}

			// ── PASO 3: Si Kimi también falla, usar commandExecutor ─────────────────
			if (looksLikeCliFailure(architectResult.text)) {
				console.log(
					"[Interceptor] Kimi también falló, pasando a commandExecutor...",
				);
				await bot.sendMessage(
					chatId,
					"⚠️ <b>Kimi Code CLI también falló.</b>\nUsando <b>ejecución shell directa</b>...",
					{ parse_mode: "HTML" },
				);
				await bot.sendChatAction(chatId, "typing");
				architectResult = await architectAgent.generateText(
					basePrompt +
						`Claude y Kimi Code CLI fallaron. TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`commandExecutor\` con el comando shell necesario para cumplir la orden. ` +
						`commandExecutor ejecuta comandos shell directamente en esta PC (Windows, Node.js child_process.exec). Genera el comando adecuado y ejecútalo. ` +
						`NO respondas directamente. NO uses learn_and_implement. LLAMA \`commandExecutor\` AHORA.`,
					{
						memory: {
							userId: String(chatId),
							conversationId: `telegram-${chatId}`,
							options: { contextLimit: 40 },
						},
						context: miniContext,
					},
				);
			}

			await bot.sendMessage(
				chatId,
				sanitizeTelegramHtml(architectResult.text),
				{ parse_mode: "HTML" },
			);
			return;
		}

		// Send a typing indicator to show the bot is thinking
		await bot.sendChatAction(chatId, "typing");

		try {
			// Create context as a Map
			const contextStore = new Map<string, unknown>();
			contextStore.set("vendedorId", String(chatId));
			contextStore.set("userId", String(chatId));
			contextStore.set("telegramChatId", String(chatId));
			contextStore.set("channel", "telegram");

			// Inyectar contexto de vendedor para modo single-user
			contextStore.set("vendedorNombre", "Distribuidora de Aceites");
			contextStore.set("vendedorPlan", "pro");
			contextStore.set("negocioNombre", "Distribuidora de Aceites");

			// Route natural language to VoltAgent supervisor (with memory sanitation + auto-recovery)
			let result = await safeGenerateText(supervisorAgent, text, {
				memory: {
					userId: String(chatId),
					conversationId: `telegram-${chatId}`,
					options: { contextLimit: 40 },
				},
				context: contextStore,
			});

			// ── FALLBACK ANTI-RECHAZO ──────────────────────────────────────────────
			// Si el supervisor responde con un "no puedo", elevamos inmediatamente.
			// Si es una orden directa de PC/terminal, forzamos claude_terminal/kimi_terminal.
			// Si no, delegamos al Architect para learn_and_implement.
			if (looksLikeRefusal(result.text)) {
				console.log(
					`[Telegram] Supervisor refusal detected: "${result.text.substring(0, 80)}..." → escalating`,
				);

				const isDirectCommand = looksLikeDirectCommand(text);
				const fallbackLastRequest = lastUserRequests.get(chatId);
				const expandedText =
					isInsistence && fallbackLastRequest
						? `[Contexto previo del usuario: "${fallbackLastRequest}"] El usuario insiste: "${rawText}"`
						: text;

				if (isDirectCommand) {
					const basePrompt = `El usuario pidió: "${expandedText}"\n\nEL SUPERVISOR FALLÓ. Esto es una ORDEN DE EJECUCIÓN DIRECTA EN LA PC LOCAL. `;

					// Paso 1: claude_terminal
					await bot.sendMessage(
						chatId,
						`🔄 <b>El supervisor no supo cómo manejar esto.</b>\nElevando a <b>Claude Terminal</b>...`,
						{ parse_mode: "HTML" },
					);
					await bot.sendChatAction(chatId, "typing");
					let architectResult = await architectAgent.generateText(
						basePrompt +
							`TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`claude_terminal\` con la instrucción exacta del usuario. ` +
							`Claude Code CLI tiene acceso completo a la terminal. NO llames learn_and_implement. LLAMA \`claude_terminal\` AHORA.`,
						{
							memory: {
								userId: String(chatId),
								conversationId: `telegram-${chatId}`,
								options: { contextLimit: 40 },
							},
							context: contextStore,
						},
					);

					// Paso 2: kimi_terminal si Claude falla
					if (looksLikeCliFailure(architectResult.text)) {
						await bot.sendMessage(
							chatId,
							"⚠️ <b>Claude falló.</b> Intentando <b>Kimi Terminal</b>...",
							{ parse_mode: "HTML" },
						);
						await bot.sendChatAction(chatId, "typing");
						architectResult = await architectAgent.generateText(
							basePrompt +
								`Claude Code CLI falló. TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`kimi_terminal\` con la instrucción exacta del usuario. ` +
								`Kimi Code CLI tiene acceso completo a la terminal. NO llames learn_and_implement. LLAMA \`kimi_terminal\` AHORA.`,
							{
								memory: {
									userId: String(chatId),
									conversationId: `telegram-${chatId}`,
									options: { contextLimit: 40 },
								},
								context: contextStore,
							},
						);
					}

					// Paso 3: commandExecutor si Kimi también falla
					if (looksLikeCliFailure(architectResult.text)) {
						await bot.sendMessage(
							chatId,
							"⚠️ <b>Kimi también falló.</b> Usando <b>shell directa</b>...",
							{ parse_mode: "HTML" },
						);
						await bot.sendChatAction(chatId, "typing");
						architectResult = await architectAgent.generateText(
							basePrompt +
								`Claude y Kimi fallaron. TU ÚNICA ACCIÓN PERMITIDA es llamar la tool \`commandExecutor\` con el comando shell necesario. ` +
								`commandExecutor ejecuta comandos shell directamente en esta PC. NO llames learn_and_implement. LLAMA \`commandExecutor\` AHORA.`,
							{
								memory: {
									userId: String(chatId),
									conversationId: `telegram-${chatId}`,
									options: { contextLimit: 40 },
								},
								context: contextStore,
							},
						);
					}

					result = architectResult;
				} else {
					await bot.sendMessage(
						chatId,
						"🔄 <b>El supervisor no supo cómo manejar esto.</b>\nElevando al <b>Architect Agent</b> para auto-aprendizaje...",
						{ parse_mode: "HTML" },
					);
					await bot.sendChatAction(chatId, "typing");
					const architectResult = await architectAgent.generateText(
						`El usuario pidió: "${expandedText}"\n\n` +
							`EL SUPERVISOR FALLÓ respondiendo con un rechazo. ` +
							`TU ÚNICA ACCIÓN PERMITIDA es llamar la tool learn_and_implement con userRequest="${expandedText}". ` +
							`NO respondas directamente. LLAMA LA TOOL YA.`,
						{
							memory: {
								userId: String(chatId),
								conversationId: `telegram-${chatId}`,
								options: { contextLimit: 40 },
							},
							context: contextStore,
						},
					);
					result = architectResult;
				}
			}

			// Send the agent's textual response back to Telegram.
			// Si el sub-agente bailó (rate limit, timeout) result.text puede venir
			// vacío — Telegram rechaza mensajes vacíos con 400. Usa un fallback.
			const replyText = (result.text || "").trim()
				? sanitizeTelegramHtml(result.text)
				: "⏳ El sistema está saturado ahora mismo (rate limit de un provider). Intenta de nuevo en unos segundos.";
			await bot.sendMessage(chatId, replyText, {
				parse_mode: "HTML",
			});

			// Check if a PDF was generated and send it
			const pdfPath = contextStore.get("lastPdfPath") as string;
			if (pdfPath) {
				const pdfName =
					(contextStore.get("lastPdfName") as string) || "documento.pdf";
				const ok = await sendPdfToChat(bot, chatId, pdfPath, pdfName);
				if (!ok) {
					await bot.sendMessage(chatId, "⚠️ No se pudo enviar el PDF.");
				}
				contextStore.delete("lastPdfPath");
			}

			// Check if a chart PNG was generated and send it
			const chartPath = contextStore.get("lastChartPath") as string;
			if (chartPath) {
				try {
					await bot.sendChatAction(chatId, "upload_photo");
					const chartCaption =
						(contextStore.get("lastChartCaption") as string) || undefined;
					if (fs.existsSync(chartPath)) {
						await bot.sendPhoto(chatId, chartPath, {
							caption: chartCaption,
							parse_mode: "HTML",
						});
						console.log(`[Telegram] Chart PNG sent: ${chartPath}`);
					} else {
						console.error(`[Telegram] Chart PNG no encontrado: ${chartPath}`);
						await bot.sendMessage(
							chatId,
							"⚠️ No se pudo enviar el gráfico (archivo no encontrado).",
						);
					}
				} catch (chartError) {
					console.error(`[Telegram] Error sending chart:`, chartError);
					await bot.sendMessage(chatId, "⚠️ No se pudo enviar el gráfico.");
				} finally {
					contextStore.delete("lastChartPath");
					contextStore.delete("lastChartName");
					contextStore.delete("lastChartCaption");
				}
			}

			// Check if an Excel was generated and send it
			const excelPath = contextStore.get("lastExcelPath") as string;
			console.log(`[Telegram] Checking for Excel: ${excelPath}`);
			if (excelPath) {
				try {
					await bot.sendChatAction(chatId, "upload_document");
					const excelName =
						(contextStore.get("lastExcelName") as string) || "export.xlsx";
					console.log(
						`[Telegram] Sending Excel: ${excelName} from ${excelPath}`,
					);
					await bot.sendDocument(
						chatId,
						excelPath,
						{
							caption: "📊 Aquí está tu archivo Excel",
						},
						{
							filename: excelName,
							contentType:
								"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						},
					);
					console.log(`[Telegram] Excel sent successfully`);
					// Clear the path to avoid sending again
					contextStore.delete("lastExcelPath");
				} catch (excelError) {
					console.error(`[Telegram] Error sending Excel:`, excelError);
					await bot.sendMessage(
						chatId,
						"⚠️ No se pudo enviar el archivo Excel.",
					);
				}
			} else {
				console.log(`[Telegram] No Excel found in context`);
			}
		} catch (error) {
			console.error(`[Telegram] Error for chat ${chatId}:`, error);
			await bot.sendMessage(
				chatId,
				"⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo en unos momentos.",
				{ parse_mode: "HTML" },
			);
		}
	}

	/**
	 * Handle voice messages (OGG format from Telegram)
	 */
	async function handleVoiceMessage(
		bot: TelegramBot,
		agent: Agent,
		msg: TelegramBot.Message,
	) {
		const chatId = msg.chat.id;
		const voice = msg.voice!;

		try {
			// Send "transcribing" action
			await bot.sendChatAction(chatId, "typing");

			console.log(
				`[Voice] Received voice message: ${voice.file_id}, duration: ${voice.duration}s`,
			);

			// Check API key
			if (!config.OPENAI_API_KEY && !config.MOONSHOT_API_KEY) {
				await bot.sendMessage(
					chatId,
					"🎙️ <b>Nota de voz recibida</b>\n\n" +
						"⚠️ La transcripción de voz no está configurada.\n" +
						"Por favor configura OPENAI_API_KEY en las variables de entorno.",
				);
				return;
			}

			// Get file link from Telegram
			const fileLink = await bot.getFileLink(voice.file_id);
			console.log(`[Voice] File link: ${fileLink}`);

			// Send "transcribing" message
			const transcribingMsg = await bot.sendMessage(
				chatId,
				"🎙️ <i>Transcribiendo nota de voz...</i>",
				{ parse_mode: "HTML" },
			);

			// Transcribe audio
			const transcription = await transcribeVoice(
				fileLink,
				voice.file_unique_id,
			);

			// Delete "transcribing" message
			await bot.deleteMessage(chatId, transcribingMsg.message_id);

			// Show transcription to user
			await bot.sendMessage(
				chatId,
				`🎙️ <b>Nota de voz transcrita:</b>\n\n<i>"${transcription}"</i>\n\n🤖 Procesando...`,
				{ parse_mode: "HTML" },
			);

			// Shortcut: si el usuario pidió reenviar el último PDF por voz,
			// lo mandamos directo y evitamos que el LLM alucine.
			if (looksLikeResendPdfRequest(transcription)) {
				const cached = lastPdfByChat.get(chatId);
				if (cached && fs.existsSync(cached.path)) {
					await sendPdfToChat(
						bot,
						chatId,
						cached.path,
						cached.name,
						"📄 Reenvío del último documento generado",
					);
					return;
				}
			}

			// Send typing action
			await bot.sendChatAction(chatId, "typing");

			// Create context
			const contextStore = new Map<string, unknown>();
			contextStore.set("vendedorId", String(chatId));
			contextStore.set("userId", String(chatId));
			contextStore.set("telegramChatId", String(chatId));
			contextStore.set("channel", "telegram");
			contextStore.set("isVoiceMessage", true);
			contextStore.set("voiceTranscription", transcription);

			// Inyectar contexto de vendedor para modo single-user
			contextStore.set("vendedorNombre", "Distribuidora de Aceites");
			contextStore.set("vendedorPlan", "pro");
			contextStore.set("negocioNombre", "Distribuidora de Aceites");

			// Send transcription to agent
			const result = await agent.generateText(transcription, {
				memory: {
					userId: String(chatId),
					conversationId: `telegram-${chatId}`,
					options: { contextLimit: 40 },
				},
				context: contextStore,
			});

			// Voice-in → voice-out. Si hay API de TTS y el texto cabe, enviamos
			// SÓLO audio (no duplicamos con un mensaje de texto — gasta tokens TTS
			// y satura el chat). Si el TTS falla o el texto es demasiado largo,
			// caemos a texto como respaldo.
			const voiceReplyText = (result.text || "").trim()
				? sanitizeTelegramHtml(result.text)
				: "⏳ El sistema está saturado ahora mismo (rate limit de un provider). Intenta de nuevo en unos segundos.";

			const canSendVoice =
				!!config.OPENAI_API_KEY &&
				!!result.text &&
				result.text.length > 0 &&
				result.text.length <= 4096;

			let voiceSent = false;
			if (canSendVoice) {
				try {
					await bot.sendChatAction(chatId, "record_voice");
					const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
					const speechResponse = await openai.audio.speech.create({
						model: "tts-1",
						voice: "nova",
						input: result.text,
						response_format: "opus",
					});
					const arrayBuffer = await speechResponse.arrayBuffer();
					const audioBuffer = Buffer.from(arrayBuffer);
					await bot.sendVoice(
						chatId,
						audioBuffer,
						{},
						{
							filename: "voice.ogg",
							contentType: "audio/ogg",
						},
					);
					voiceSent = true;
					console.log(`[Voice] Sent voice response to chat ${chatId}`);
				} catch (ttsError) {
					console.error(`[Voice] Failed to send voice response:`, ttsError);
				}
			}

			// Sólo mandamos texto si el audio no se pudo generar/enviar.
			if (!voiceSent) {
				await bot.sendMessage(chatId, voiceReplyText, {
					parse_mode: "HTML",
				});
			}

			// Enviar PDF generado (si hay). Antes esto solo ocurría en el text
			// handler — por eso las cotizaciones pedidas por voz nunca llegaban.
			const voicePdfPath = contextStore.get("lastPdfPath") as string;
			if (voicePdfPath) {
				const pdfName =
					(contextStore.get("lastPdfName") as string) || "documento.pdf";
				await sendPdfToChat(bot, chatId, voicePdfPath, pdfName);
				contextStore.delete("lastPdfPath");
			}

			// Enviar Excel generado (si hay)
			const voiceExcelPath = contextStore.get("lastExcelPath") as string;
			if (voiceExcelPath) {
				try {
					const excelName =
						(contextStore.get("lastExcelName") as string) || "export.xlsx";
					await bot.sendChatAction(chatId, "upload_document");
					await bot.sendDocument(
						chatId,
						voiceExcelPath,
						{ caption: "📊 Aquí está tu archivo Excel" },
						{
							filename: excelName,
							contentType:
								"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
						},
					);
					lastExcelByChat.set(chatId, {
						path: voiceExcelPath,
						name: excelName,
						generatedAt: Date.now(),
					});
					contextStore.delete("lastExcelPath");
				} catch (excelError) {
					console.error("[Voice] Error sending Excel:", excelError);
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`[Voice] Error processing voice message:`, error);

			// Show specific error to user for debugging
			let userMessage = "⚠️ <b>Error al procesar el mensaje de voz</b>\n\n";

			const lowerErr = errorMessage.toLowerCase();
			const isProviderSaturation =
				lowerErr.includes("429") ||
				lowerErr.includes("rate limit") ||
				lowerErr.includes("rate_limit") ||
				lowerErr.includes("tokens per min") ||
				lowerErr.includes("tpm") ||
				lowerErr.includes("insufficient balance") ||
				lowerErr.includes("insufficient_quota") ||
				lowerErr.includes("credit balance") ||
				lowerErr.includes("exceeded your current quota") ||
				lowerErr.includes("etimedout") ||
				lowerErr.includes("econnreset") ||
				lowerErr.includes("fetch failed") ||
				lowerErr.includes("socket hang up");

			if (errorMessage.includes("401") || errorMessage.includes("API key")) {
				userMessage +=
					"❌ <b>API key inválida</b>\n" +
					"La API key de OpenAI no está configurada correctamente.\n\n" +
					"Por favor verifica que:\n" +
					"• Tienes una API key válida de OpenAI\n" +
					"• La variable OPENAI_API_KEY está configurada en el archivo .env\n" +
					"• Reiniciaste el bot después de configurar la key";
			} else if (isProviderSaturation) {
				// No expongas mensajes crudos tipo "Insufficient Balance" (DeepSeek)
				// ni "rate_limit_exceeded" (Groq/OpenAI) — el fallback ya pasó por
				// todos los providers. Esto es recuperable; el usuario reintenta.
				userMessage =
					"⏳ <b>Sistema saturado momentáneamente</b>\n\n" +
					"Los proveedores de IA están con alta demanda. Intenta de nuevo en unos segundos.";
			} else if (
				errorMessage.includes("network") ||
				errorMessage.includes("ECONNREFUSED")
			) {
				userMessage +=
					"🌐 <b>Error de conexión</b>\n" +
					"No se pudo conectar al servicio de transcripción. Verifica tu conexión a internet.";
			} else {
				userMessage +=
					"Error técnico:\n" +
					`<code>${sanitizeTelegramHtml(errorMessage.substring(0, 200))}</code>\n\n` +
					"Asegúrate de que:\n" +
					"• El audio sea claro y sin mucho ruido\n" +
					"• La duración sea menor a 5 minutos\n" +
					"• Estés hablando en español";
			}

			await bot.sendMessage(chatId, sanitizeTelegramHtml(userMessage), {
				parse_mode: "HTML",
			});
		}
	}

	/**
	 * Handle photo messages - Process with Architect Agent (Vision)
	 */
	async function handlePhotoMessage(
		bot: TelegramBot,
		agent: Agent,
		msg: TelegramBot.Message,
	) {
		const chatId = msg.chat.id;
		let localFilePath: string | null = null;

		try {
			// Get the largest photo
			const photos = msg.photo!;
			const largestPhoto = photos[photos.length - 1];

			await bot.sendChatAction(chatId, "typing");
			console.log(`[Photo] Processing photo: ${largestPhoto.file_id}`);

			// Get file link from Telegram
			const fileLink = await bot.getFileLink(largestPhoto.file_id);
			console.log(
				`[Photo] File link obtained: ${fileLink.substring(0, 50)}...`,
			);

			// Download image to local file (Telegram URLs expire quickly)
			const tempDir = path.join(process.cwd(), "temp", "images");
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			localFilePath = path.join(tempDir, `${largestPhoto.file_id}.jpg`);
			console.log(`[Photo] Downloading to: ${localFilePath}`);

			const response = await axios({
				method: "GET",
				url: fileLink,
				responseType: "stream",
				timeout: 30000,
			});

			const writer = fs.createWriteStream(localFilePath);
			response.data.pipe(writer);

			await new Promise<void>((resolve, reject) => {
				writer.on("finish", () => resolve());
				writer.on("error", reject);
			});

			console.log(`[Photo] Downloaded successfully: ${localFilePath}`);

			// Verify file exists and has content
			const stats = fs.statSync(localFilePath);
			console.log(`[Photo] File size: ${stats.size} bytes`);

			if (stats.size === 0) {
				throw new Error("Downloaded file is empty");
			}

			// Create context
			const contextStore = new Map<string, unknown>();
			contextStore.set("vendedorId", String(chatId));
			contextStore.set("userId", String(chatId));
			contextStore.set("telegramChatId", String(chatId));
			contextStore.set("channel", "telegram");
			contextStore.set("isPhotoMessage", true);
			contextStore.set("photoUrl", localFilePath); // Use local path instead of URL
			contextStore.set("photoCaption", msg.caption || "");
			contextStore.set(
				"lastUserMessage",
				msg.caption || "Procesar esta imagen",
			);

			// Inyectar contexto de vendedor
			contextStore.set("vendedorNombre", "Distribuidora de Aceites");
			contextStore.set("vendedorPlan", "pro");
			contextStore.set("negocioNombre", "Distribuidora de Aceites");

			// Send to agent with instruction to process image
			const prompt = msg.caption
				? `El usuario envió esta foto con el mensaje: "${msg.caption}"\n\nPor favor analiza la imagen usando la herramienta read_image con el archivo local: ${localFilePath}`
				: `El usuario envió una foto. Por favor analiza la imagen usando la herramienta read_image con el archivo local: ${localFilePath}`;

			console.log(`[Photo] Sending to agent...`);
			const result = await agent.generateText(prompt, {
				memory: {
					userId: String(chatId),
					conversationId: `telegram-${chatId}`,
					options: { contextLimit: 40 },
				},
				context: contextStore,
			});

			// Send response
			await bot.sendMessage(chatId, result.text, { parse_mode: "HTML" });
			console.log(`[Photo] Response sent successfully`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[Photo] Error processing photo:`, errorMsg);
			await bot.sendMessage(
				chatId,
				"📸 <b>Foto recibida</b>\n\n" +
					"❌ Lo siento, hubo un error procesando la imagen:\n" +
					`<code>${sanitizeTelegramHtml(errorMsg.substring(0, 100))}</code>\n\n` +
					"Por favor intenta de nuevo o describe lo que ves en la foto.",
				{ parse_mode: "HTML" },
			);
		} finally {
			// Cleanup: remove temporary file after processing
			if (localFilePath && fs.existsSync(localFilePath)) {
				try {
					fs.unlinkSync(localFilePath);
					console.log(`[Photo] Temporary file cleaned up: ${localFilePath}`);
				} catch (cleanupError) {
					console.error(`[Photo] Error cleaning up file:`, cleanupError);
				}
			}
		}
	}

	console.log(
		"✅ Telegram bridge connected to VoltAgent supervisor (with voice support)",
	);
}
