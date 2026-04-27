/**
 * Motor de Ejecución Autónoma — ControlIA (v2 — Robusto)
 *
 * Mejoras sobre v1:
 *   - withRetry()         Reintento con backoff exponencial en todas las llamadas IA
 *   - Deduplicación       executionQueue impide lanzar dos ejecuciones del mismo gap
 *   - Rollback total      Si tsc sigue fallando tras auto-fix, elimina archivos creados
 *   - Estado activo       activeExecutions registry para visibilidad y diagnóstico
 *   - Notificaciones      Envía progreso en tiempo real a Telegram vía progress-notifier
 *   - cleanupOrphans()    Limpia registros huérfanos al arrancar el proceso
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { generateText } from "ai";
import { getAIModel } from "../config/ai-provider.js";
import { config } from "../config/env.js";
import {
	notifyLearningComplete,
	notifyLearningStart,
	notifyLearningStep,
} from "./progress-notifier.js";
import { saveLearnedCapability } from "./self-improvement.js";

const execAsync = promisify(exec);

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ExecutionStep {
	step: number;
	name: string;
	status: "running" | "done" | "failed" | "skipped";
	detail: string;
	durationMs?: number;
}

export interface ExecutionResult {
	success: boolean;
	capabilityName: string;
	filesCreated: string[];
	dependenciesInstalled: string[];
	typecheckPassed: boolean;
	selfFixedErrors: number;
	rolledBack: boolean;
	steps: ExecutionStep[];
	summary: string;
}

interface FileSpec {
	name: string;
	path: string;
	type: "tool" | "service" | "agent" | "other";
	description: string;
}

interface DesignPlan {
	files: FileSpec[];
	dependencies: string[];
	rationale: string;
}

interface ActiveExecution {
	startedAt: Date;
	capability: string;
	vendedorId?: bigint;
	chatId?: string;
}

// ── Estado global del módulo ──────────────────────────────────────────────────

/** Deduplicación: clave normalizada → promesa en curso */
const executionQueue = new Map<string, Promise<ExecutionResult>>();

/** Registro de ejecuciones activas para diagnóstico */
const activeExecutions = new Map<string, ActiveExecution>();

// ── Retry con backoff exponencial ─────────────────────────────────────────────

async function withRetry<T>(
	fn: () => Promise<T>,
	opts: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
	const { maxAttempts = 3, baseDelayMs = 1000, label = "op" } = opts;
	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt < maxAttempts) {
				const delay = baseDelayMs * Math.pow(2, attempt - 1);
				const msg =
					err instanceof Error
						? err.message.slice(0, 80)
						: String(err).slice(0, 80);
				console.warn(
					`[AutonomousExecutor] ⚠️ ${label} — intento ${attempt}/${maxAttempts} falló (${msg}), reintentando en ${delay}ms`,
				);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
	throw lastErr;
}

// ── Rollback ──────────────────────────────────────────────────────────────────

async function rollbackCreatedFiles(files: string[]): Promise<void> {
	for (const filePath of files) {
		const fullPath = path.isAbsolute(filePath)
			? filePath
			: path.join(process.cwd(), filePath);
		const backupPath = `${fullPath}.backup-autofix`;

		try {
			if (fs.existsSync(backupPath)) {
				// Era un archivo existente — restaurar backup
				fs.copyFileSync(backupPath, fullPath);
				fs.unlinkSync(backupPath);
				console.log(`[AutonomousExecutor] ↩️ Rollback: restaurado ${filePath}`);
			} else if (fs.existsSync(fullPath)) {
				// Era archivo nuevo — eliminar
				fs.unlinkSync(fullPath);
				console.log(
					`[AutonomousExecutor] 🗑️ Rollback: eliminado nuevo archivo ${filePath}`,
				);
			}
		} catch (err) {
			console.error(
				`[AutonomousExecutor] Rollback falló para ${filePath}:`,
				err,
			);
		}
	}
}

// ── Normalización de clave ─────────────────────────────────────────────────────

function normalizeKey(desc: string): string {
	return desc
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // quitar tildes
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
}

// ── Funciones de consulta de estado ──────────────────────────────────────────

/** Retorna true si hay una ejecución activa para esa capacidad */
export function isLearning(capabilityDescription: string): boolean {
	return executionQueue.has(normalizeKey(capabilityDescription));
}

/** Lista todas las ejecuciones activas */
export function getActiveExecutions(): ActiveExecution[] {
	return Array.from(activeExecutions.values());
}

/** Limpia el registro de ejecuciones activas (llamar al arrancar el proceso) */
export function cleanupOrphanedExecutions(): void {
	const count = activeExecutions.size;
	activeExecutions.clear();
	if (count > 0) {
		console.log(
			`[AutonomousExecutor] 🧹 Limpiadas ${count} ejecuciones huérfanas al arrancar`,
		);
	}
}

// ── Función principal (con deduplicación) ─────────────────────────────────────

export async function executeAutonomousLearning(params: {
	userRequest: string;
	gapDescription: string;
	researchQuery: string;
	suggestedSolution: string;
	vendedorId?: bigint;
	chatId?: string;
	onProgress?: (step: ExecutionStep) => void;
}): Promise<ExecutionResult> {
	const key = normalizeKey(params.gapDescription);

	// ── Deduplicación ──────────────────────────────────────────────────────────
	if (executionQueue.has(key)) {
		console.log(
			`[AutonomousExecutor] ⏳ Ya aprendiendo "${key}" — reutilizando ejecución en curso`,
		);
		await notifyProgress(
			params.chatId,
			`⏳ Ya estoy aprendiendo <b>${params.gapDescription}</b>. Dame un momento, te aviso cuando termine.`,
		);
		return executionQueue.get(key)!;
	}

	// Registrar como activo
	activeExecutions.set(key, {
		startedAt: new Date(),
		capability: params.gapDescription,
		vendedorId: params.vendedorId,
		chatId: params.chatId,
	});

	const execution = _executeInternal(params, key);
	executionQueue.set(key, execution);

	try {
		return await execution;
	} finally {
		executionQueue.delete(key);
		activeExecutions.delete(key);
	}
}

// ── Ejecución interna ─────────────────────────────────────────────────────────

async function _executeInternal(
	params: {
		userRequest: string;
		gapDescription: string;
		researchQuery: string;
		suggestedSolution: string;
		vendedorId?: bigint;
		chatId?: string;
		onProgress?: (step: ExecutionStep) => void;
	},
	_key: string,
): Promise<ExecutionResult> {
	const steps: ExecutionStep[] = [];
	const filesCreated: string[] = [];
	const dependenciesInstalled: string[] = [];
	let selfFixedErrors = 0;
	let tscPassed = false;
	let rolledBack = false;

	const log = (
		step: number,
		name: string,
		status: ExecutionStep["status"],
		detail: string,
		durationMs?: number,
	) => {
		const s: ExecutionStep = { step, name, status, detail, durationMs };
		steps.push(s);
		params.onProgress?.(s);
		const icon =
			status === "done"
				? "✅"
				: status === "failed"
					? "❌"
					: status === "skipped"
						? "⏭️"
						: "⏳";
		console.log(
			`[AutonomousExecutor] ${icon} [${status.toUpperCase()}] Step ${step}: ${name} — ${detail}`,
		);
		// Notificar pasos clave a Telegram
		notifyLearningStep(params.chatId, step, name, status, detail).catch(
			() => {},
		);
	};

	// Notificar inicio
	await notifyLearningStart(params.chatId, params.gapDescription);

	let t0 = Date.now();

	// ── PASO 1: Investigación ─────────────────────────────────────────────────
	log(1, "Investigación", "running", `"${params.researchQuery}"`);
	t0 = Date.now();
	let researchContext = "";
	try {
		researchContext = await withRetry(
			() => researchTopic(params.researchQuery, params.gapDescription),
			{ label: "research", maxAttempts: 3, baseDelayMs: 2000 },
		);
		log(
			1,
			"Investigación",
			"done",
			`${researchContext.length} chars`,
			Date.now() - t0,
		);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		log(1, "Investigación", "failed", msg.slice(0, 100), Date.now() - t0);
		researchContext = `Implementar: ${params.gapDescription}. Usar las mejores prácticas de Node.js/TypeScript.`;
	}

	// ── PASO 2: Diseño ────────────────────────────────────────────────────────
	log(2, "Diseño de archivos", "running", "Analizando estructura óptima...");
	t0 = Date.now();
	let design: DesignPlan;
	try {
		design = await withRetry(
			() =>
				generateDesignPlan(
					params.gapDescription,
					params.userRequest,
					researchContext,
				),
			{ label: "design", maxAttempts: 3, baseDelayMs: 1500 },
		);
		const depsStr = design.dependencies.length
			? design.dependencies.join(", ")
			: "ninguna";
		log(
			2,
			"Diseño de archivos",
			"done",
			`${design.files.length} archivos | deps: ${depsStr}`,
			Date.now() - t0,
		);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		log(2, "Diseño de archivos", "failed", msg.slice(0, 100));
		const slug = normalizeKey(params.gapDescription).slice(0, 40);
		design = {
			files: [
				{
					name: slug,
					path: `src/tools/extensions/${slug}.ts`,
					type: "tool",
					description: params.gapDescription,
				},
			],
			dependencies: [],
			rationale: "fallback plan",
		};
	}

	// ── PASO 3: Instalar dependencias ─────────────────────────────────────────
	if (design.dependencies.length > 0) {
		const depList = design.dependencies.join(" ");
		log(3, "npm install", "running", depList);
		t0 = Date.now();
		try {
			await withRetry(
				() =>
					execAsync(`npm install ${depList}`, {
						cwd: process.cwd(),
						timeout: 90_000,
					}),
				{ label: "npm install", maxAttempts: 2, baseDelayMs: 3000 },
			);
			dependenciesInstalled.push(...design.dependencies);
			log(
				3,
				"npm install",
				"done",
				`Instaladas: ${design.dependencies.join(", ")}`,
				Date.now() - t0,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			log(3, "npm install", "failed", msg.slice(0, 120), Date.now() - t0);
		}
	} else {
		log(3, "npm install", "skipped", "Sin dependencias nuevas");
	}

	// ── PASO 4: Generar código ────────────────────────────────────────────────
	const generatedFiles: { filePath: string; code: string }[] = [];
	const systemCtx = getSystemContext();

	for (let i = 0; i < design.files.length; i++) {
		const spec = design.files[i];
		const stepName = `Generar [${i + 1}/${design.files.length}]: ${spec.name}`;
		log(4, stepName, "running", spec.description);
		t0 = Date.now();
		try {
			const code = await withRetry(
				() =>
					generateFileCode({
						spec,
						gapDescription: params.gapDescription,
						researchContext,
						systemContext: systemCtx,
						installedDeps: dependenciesInstalled,
					}),
				{ label: `generate ${spec.name}`, maxAttempts: 3, baseDelayMs: 2000 },
			);
			generatedFiles.push({ filePath: spec.path, code });
			log(4, stepName, "done", `${code.length} chars`, Date.now() - t0);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			log(4, stepName, "failed", msg.slice(0, 120), Date.now() - t0);
		}
	}

	// ── PASO 5: Escribir archivos ─────────────────────────────────────────────
	for (const { filePath, code } of generatedFiles) {
		log(5, `Escribir: ${filePath}`, "running", "");
		t0 = Date.now();
		try {
			const fullPath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath);

			if (!fullPath.startsWith(process.cwd())) {
				log(
					5,
					`Escribir: ${filePath}`,
					"failed",
					"Ruta fuera del proyecto — bloqueada",
				);
				continue;
			}

			const dir = path.dirname(fullPath);
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(fullPath, code, "utf-8");
			filesCreated.push(filePath);
			log(
				5,
				`Escribir: ${filePath}`,
				"done",
				"✅ Escrito en disco",
				Date.now() - t0,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			log(
				5,
				`Escribir: ${filePath}`,
				"failed",
				msg.slice(0, 120),
				Date.now() - t0,
			);
		}
	}

	if (filesCreated.length === 0) {
		const summary =
			"❌ No se pudo crear ningún archivo. Revisa los logs del servidor.";
		await notifyLearningComplete(params.chatId, false, summary);
		return {
			success: false,
			capabilityName: params.gapDescription,
			filesCreated: [],
			dependenciesInstalled,
			typecheckPassed: false,
			selfFixedErrors: 0,
			rolledBack: false,
			steps,
			summary,
		};
	}

	// ── PASO 6: TypeScript check ──────────────────────────────────────────────
	log(6, "TypeScript check", "running", "npx tsc --noEmit");
	t0 = Date.now();
	let tscErrors = "";

	try {
		await execAsync("npx tsc --noEmit", {
			cwd: process.cwd(),
			timeout: 120_000,
		});
		tscPassed = true;
		log(6, "TypeScript check", "done", "Sin errores ✅", Date.now() - t0);
	} catch (tscErr: unknown) {
		const e = tscErr as { stdout?: string; stderr?: string };
		tscErrors = (e.stdout || e.stderr || "").toString();
		const lineCount = tscErrors.split("\n").filter(Boolean).length;
		log(
			6,
			"TypeScript check",
			"failed",
			`${lineCount} líneas de error`,
			Date.now() - t0,
		);
	}

	// ── PASO 7: Auto-fix TypeScript escalado (LLM → Claude CLI → Kimi CLI) ───
	if (!tscPassed && tscErrors) {
		type FixAttempt = {
			label: string;
			run: () => Promise<{
				success: boolean;
				fixedFiles: number;
				message: string;
			}>;
		};
		const attempts: FixAttempt[] = [
			{
				label: "Auto-fix LLM (ronda 1/4)",
				run: () => autoFixTypeScriptErrors(tscErrors, filesCreated),
			},
			{
				label: "Auto-fix LLM (ronda 2/4)",
				run: () => autoFixTypeScriptErrors(tscErrors, filesCreated),
			},
			{
				label: "Auto-fix Claude CLI (ronda 3/4)",
				run: () => cliAutoFix("claude", tscErrors, filesCreated),
			},
			{
				label: "Auto-fix Kimi CLI (ronda 4/4)",
				run: () => cliAutoFix("kimi", tscErrors, filesCreated),
			},
		];

		for (const attempt of attempts) {
			log(7, attempt.label, "running", "Corrigiendo errores...");
			t0 = Date.now();

			let fixResult: { success: boolean; fixedFiles: number; message: string };
			try {
				fixResult = await withRetry(attempt.run, {
					label: attempt.label,
					maxAttempts: 2,
					baseDelayMs: 1500,
				});
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				log(7, attempt.label, "failed", msg.slice(0, 100), Date.now() - t0);
				continue; // probar siguiente estrategia — NO abortar
			}

			selfFixedErrors += fixResult.fixedFiles;

			if (fixResult.success) {
				try {
					await execAsync("npx tsc --noEmit", {
						cwd: process.cwd(),
						timeout: 120_000,
					});
					tscPassed = true;
					log(
						7,
						attempt.label,
						"done",
						`✅ Corregido — ${fixResult.fixedFiles} archivos`,
						Date.now() - t0,
					);
					break;
				} catch (tscErr2: unknown) {
					const e = tscErr2 as { stdout?: string; stderr?: string };
					tscErrors = (e.stdout || e.stderr || "").toString();
					log(
						7,
						attempt.label,
						"failed",
						`Fix aplicado — errores persisten`,
						Date.now() - t0,
					);
				}
			} else {
				log(7, attempt.label, "failed", fixResult.message, Date.now() - t0);
			}
		}

		// ── Rollback si TypeScript sigue roto tras TODAS las estrategias ─────────
		if (!tscPassed) {
			log(
				7,
				"Rollback",
				"running",
				`Eliminando ${filesCreated.length} archivos que no compilaron`,
			);
			t0 = Date.now();
			await rollbackCreatedFiles(filesCreated);
			rolledBack = true;
			log(
				7,
				"Rollback",
				"done",
				"Archivos eliminados — sistema limpio",
				Date.now() - t0,
			);

			const summary =
				`❌ Aprendizaje revertido: el código generado no compiló después de 2 rondas de auto-fix.\n` +
				`Archivos eliminados: ${filesCreated.join(", ")}\n` +
				`Intenta ser más específico o usa 'forceLearn: true' para reintentar.`;

			await notifyLearningComplete(params.chatId, false, summary);
			return {
				success: false,
				capabilityName: params.gapDescription,
				filesCreated: [],
				dependenciesInstalled,
				typecheckPassed: false,
				selfFixedErrors,
				rolledBack: true,
				steps,
				summary,
			};
		}
	} else if (tscPassed) {
		log(7, "Auto-fix TS", "skipped", "TypeScript pasó limpio — no necesario");
	}

	// ── PASO 8: Registro en DB ────────────────────────────────────────────────
	log(8, "Registro DB", "running", "Guardando nueva capacidad...");
	t0 = Date.now();
	try {
		await saveLearnedCapability(
			params.userRequest,
			params.gapDescription,
			filesCreated.join(", "),
			`Implementado autónomamente. Archivos: ${filesCreated.join(", ")}. Deps: ${dependenciesInstalled.join(", ") || "ninguna"}. TS: ${tscPassed ? "✅" : "⚠️"}`,
			params.vendedorId,
		);
		log(8, "Registro DB", "done", "Capacidad registrada", Date.now() - t0);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		log(8, "Registro DB", "failed", msg.slice(0, 120), Date.now() - t0);
	}

	// ── Resumen final ─────────────────────────────────────────────────────────
	const summaryLines = [
		`✅ <b>${params.gapDescription}</b>`,
		`📁 Archivos (${filesCreated.length}): <code>${filesCreated.join(", ")}</code>`,
		dependenciesInstalled.length
			? `📦 Deps: ${dependenciesInstalled.join(", ")}`
			: null,
		tscPassed
			? `✅ TypeScript: limpio`
			: `⚠️ TypeScript: errores (${selfFixedErrors} auto-corregidos)`,
		`⏱️ ${steps.filter((s) => s.status !== "skipped").length} pasos ejecutados`,
	].filter(Boolean) as string[];

	const summary = summaryLines.join("\n");

	await notifyLearningComplete(params.chatId, true, summary);

	return {
		success: true,
		capabilityName: params.gapDescription,
		filesCreated,
		dependenciesInstalled,
		typecheckPassed: tscPassed,
		selfFixedErrors,
		rolledBack,
		steps,
		summary,
	};
}

// ── Investigación ─────────────────────────────────────────────────────────────

async function researchTopic(
	query: string,
	gapDescription: string,
): Promise<string> {
	// Intentar Tavily
	if (config.TAVILY_API_KEY && config.TAVILY_API_KEY.length > 5) {
		try {
			const resp = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: config.TAVILY_API_KEY,
					query,
					search_depth: "basic",
					max_results: 3,
				}),
			});
			if (resp.ok) {
				const data = (await resp.json()) as {
					results?: { title: string; content?: string; snippet?: string }[];
				};
				const snippets = (data.results || [])
					.map((r) => `[${r.title}]: ${r.content || r.snippet || ""}`)
					.join("\n\n");
				if (snippets.length > 50) {
					console.log("[AutonomousExecutor] 🌐 Investigación vía Tavily ✅");
					return snippets;
				}
			}
		} catch {
			/* Tavily falló */
		}
	}

	// Intentar Serper
	if (config.SERPER_API_KEY && config.SERPER_API_KEY.length > 5) {
		try {
			const resp = await fetch("https://google.serper.dev/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-KEY": config.SERPER_API_KEY,
				},
				body: JSON.stringify({ q: query, num: 3 }),
			});
			if (resp.ok) {
				const data = (await resp.json()) as {
					organic?: { title: string; snippet?: string }[];
				};
				const snippets = (data.organic || [])
					.map((r) => `[${r.title}]: ${r.snippet || ""}`)
					.join("\n\n");
				if (snippets.length > 50) {
					console.log("[AutonomousExecutor] 🌐 Investigación vía Serper ✅");
					return snippets;
				}
			}
		} catch {
			/* Serper falló */
		}
	}

	// Fallback: conocimiento del modelo IA
	console.log(
		"[AutonomousExecutor] 🧠 Investigación vía conocimiento IA (fallback)",
	);
	const { text } = await generateText({
		model: getAIModel("fast"),
		prompt:
			`Experto Node.js/TypeScript. Necesito implementar: "${gapDescription}"\n` +
			`Provee:\n1. Mejor librería npm\n2. Cómo integrarla en TypeScript\n3. Ejemplo mínimo\n4. Errores comunes\n` +
			`Responde en español, técnico y directo.`,
		maxOutputTokens: 800,
		temperature: 0.3,
	});
	return text;
}

// ── Diseño ────────────────────────────────────────────────────────────────────

async function generateDesignPlan(
	gapDescription: string,
	userRequest: string,
	researchContext: string,
): Promise<DesignPlan> {
	const systemContext = getSystemContext();
	const { text } = await generateText({
		model: getAIModel("architect"),
		system:
			`Eres el arquitecto de ControlIA (VoltAgent 2.0, distribuidoras de aceite LATAM).\n` +
			`Estructura del proyecto:\n${systemContext}\n\n` +
			`REGLAS:\n- Tools: src/tools/<categoria>/<nombre>.ts\n` +
			`- Services: src/services/<nombre>.ts\n` +
			`- TypeScript estricto + createTool de @voltagent/core\n` +
			`- Preferir una dependencia npm bien conocida\n` +
			`- Si la librería tiene @types separado, inclúyelo`,
		prompt:
			`Implementar: "${gapDescription}"\nSolicitud: "${userRequest}"\n` +
			`Investigación:\n${researchContext.slice(0, 1500)}\n\n` +
			`Responde SOLO JSON (sin markdown):\n` +
			`{"files":[{"name":"nombre","path":"src/tools/cat/nombre.ts","type":"tool","description":"qué hace"}],"dependencies":["npm-pkg"],"rationale":"razón"}`,
		maxOutputTokens: 600,
		temperature: 0.1,
	});

	try {
		const jsonMatch = text.match(/\{[\s\S]+\}/);
		if (!jsonMatch) throw new Error("No JSON");
		const parsed = JSON.parse(jsonMatch[0]) as DesignPlan;
		if (!Array.isArray(parsed.files) || parsed.files.length === 0)
			throw new Error("No files");
		return parsed;
	} catch {
		const slug = normalizeKey(gapDescription).slice(0, 40);
		return {
			files: [
				{
					name: slug,
					path: `src/tools/extensions/${slug}.ts`,
					type: "tool",
					description: gapDescription,
				},
			],
			dependencies: [],
			rationale: "fallback",
		};
	}
}

// ── Generación de código ──────────────────────────────────────────────────────

async function generateFileCode(params: {
	spec: FileSpec;
	gapDescription: string;
	researchContext: string;
	systemContext: string;
	installedDeps: string[];
}): Promise<string> {
	const { text } = await generateText({
		model: getAIModel("architect"),
		system:
			`Experto TypeScript para VoltAgent 2.0.\n` +
			`ESTRUCTURA TOOL:\n` +
			`import { createTool } from "@voltagent/core"; import { z } from "zod";\n` +
			`export const toolName = createTool({ name:"...", description:"...", tags:[], parameters:z.object({...}), execute:async(params,opts)=>({success:true,message:"...",data:null}) });\n\n` +
			`REGLAS: TypeScript estricto | imports con .js | try/catch siempre | sin 'any' | mensajes en español\n` +
			`Deps disponibles: ${params.installedDeps.join(", ") || "las del proyecto"}\n` +
			`SOLO código TypeScript — sin markdown, sin explicaciones`,
		prompt:
			`Archivo: ${params.spec.path}\nTipo: ${params.spec.type}\nDescripción: ${params.spec.description}\n` +
			`Capacidad: ${params.gapDescription}\n\nContexto investigación:\n${params.researchContext.slice(0, 1200)}\n\n` +
			`Genera código TypeScript completo y funcional:`,
		maxOutputTokens: 2000,
		temperature: 0.15,
	});

	const match =
		text.match(/```typescript\n([\s\S]+?)\n```/) ||
		text.match(/```ts\n([\s\S]+?)\n```/) ||
		text.match(/```\n([\s\S]+?)\n```/);
	return match ? match[1].trim() : text.trim();
}

// ── Auto-fix TypeScript ───────────────────────────────────────────────────────

async function autoFixTypeScriptErrors(
	tscOutput: string,
	createdFiles: string[],
): Promise<{ success: boolean; fixedFiles: number; message: string }> {
	// Parsear errores por archivo — soporta paths Unix y Windows
	const errorsByFile = new Map<string, string[]>();

	for (const line of tscOutput.split("\n")) {
		// Unix:   src/foo/bar.ts(10,5): error TS2345: ...
		// Windows: src\foo\bar.ts(10,5): error TS2345: ...
		const match = line.match(
			/^([^(]+\.tsx?)\((\d+),\d+\):\s+error\s+TS\d+:\s+(.+)/,
		);
		if (match) {
			const [, rawPath, lineNum, errMsg] = match;
			const normalized = rawPath.replace(/\\/g, "/");
			if (!errorsByFile.has(normalized)) errorsByFile.set(normalized, []);
			errorsByFile.get(normalized)!.push(`L${lineNum}: ${errMsg}`);
		}
	}

	if (errorsByFile.size === 0) {
		return {
			success: false,
			fixedFiles: 0,
			message: "No se pudieron parsear los errores de tsc",
		};
	}

	let fixedFiles = 0;

	for (const [filePath, errors] of errorsByFile) {
		// Solo archivos del proyecto (no node_modules, no .d.ts)
		if (filePath.includes("node_modules") || filePath.endsWith(".d.ts"))
			continue;

		const fullPath = path.isAbsolute(filePath)
			? filePath
			: path.join(process.cwd(), filePath);
		if (!fs.existsSync(fullPath)) continue;

		const originalCode = fs.readFileSync(fullPath, "utf-8");
		const errSummary = errors.slice(0, 10).join("\n");

		try {
			const { text: fixedCode } = await withRetry(
				() =>
					generateText({
						model: getAIModel("architect"),
						system:
							`Experto TypeScript. Corrige los errores. SOLO código — sin markdown.\n` +
							`Mantén funcionalidad. Optional chaining (?.) para nulls. Imports con .js`,
						prompt: `Archivo: ${filePath}\nErrores:\n${errSummary}\n\nCódigo actual:\n${originalCode}\n\nCódigo corregido:`,
						maxOutputTokens: 2500,
						temperature: 0.1,
					}),
				{ label: `fix ${filePath}`, maxAttempts: 2, baseDelayMs: 1000 },
			);

			const codeMatch =
				fixedCode.match(/```typescript\n([\s\S]+?)\n```/) ||
				fixedCode.match(/```ts\n([\s\S]+?)\n```/) ||
				fixedCode.match(/```\n([\s\S]+?)\n```/);
			const cleanCode = codeMatch ? codeMatch[1].trim() : fixedCode.trim();

			// Backup antes de sobrescribir
			const backupPath = `${fullPath}.backup-autofix`;
			if (!fs.existsSync(backupPath)) {
				fs.copyFileSync(fullPath, backupPath);
			}

			fs.writeFileSync(fullPath, cleanCode, "utf-8");
			fixedFiles++;
			console.log(`[AutonomousExecutor] 🩹 Auto-fixed: ${filePath}`);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[AutonomousExecutor] Fix falló para ${filePath}:`, msg);
		}
	}

	return {
		success: fixedFiles > 0,
		fixedFiles,
		message:
			fixedFiles > 0
				? `${fixedFiles} archivo(s) corregidos automáticamente`
				: "No se pudo corregir ningún archivo",
	};
}

// ── Auto-fix vía CLI externo (Claude Code / Kimi) ────────────────────────────
//
// Cuando el LLM directo no logra arreglar los errores (2 rondas), escalamos al
// CLI local que tiene acceso completo al filesystem y puede razonar sobre varios
// archivos a la vez. El CLI escribe los fixes directamente, nosotros sólo
// verificamos con tsc después.

async function cliAutoFix(
	cli: "claude" | "kimi",
	tscOutput: string,
	createdFiles: string[],
): Promise<{ success: boolean; fixedFiles: number; message: string }> {
	// Backup de los archivos creados ANTES de invocar el CLI (por si escribe mal)
	const backedUp: string[] = [];
	for (const filePath of createdFiles) {
		const fullPath = path.isAbsolute(filePath)
			? filePath
			: path.join(process.cwd(), filePath);
		if (!fs.existsSync(fullPath)) continue;
		const backupPath = `${fullPath}.backup-autofix`;
		if (!fs.existsSync(backupPath)) {
			try {
				fs.copyFileSync(fullPath, backupPath);
				backedUp.push(filePath);
			} catch {
				/* ignorar */
			}
		}
	}

	// Limitar el payload — tsc puede escupir cientos de líneas
	const errorLines = tscOutput.split("\n").filter(Boolean).slice(0, 60);
	const errSummary = errorLines.join("\n");

	const fileList = createdFiles.length
		? createdFiles.map((f) => `- ${f}`).join("\n")
		: "(ninguno — busca los archivos mencionados en los errores)";

	const prompt =
		`Arregla estos errores de TypeScript en el repo ControlIA. ` +
		`Edita los archivos directamente usando tus herramientas. No respondas con texto, ` +
		`SOLO edita los archivos necesarios para que "npx tsc --noEmit" pase limpio. ` +
		`Mantén la funcionalidad. Si un archivo está corrupto o vacío, bórralo.\n\n` +
		`ARCHIVOS GENERADOS RECIENTEMENTE (revisar primero):\n${fileList}\n\n` +
		`ERRORES TSC:\n${errSummary}\n\n` +
		`Al terminar, verifica con "npx tsc --noEmit" y reporta OK o qué quedó pendiente.`;

	const escaped = prompt.replace(/"/g, '\\"');
	const command =
		cli === "claude"
			? `claude -p "${escaped}" --output-format text`
			: `kimi -p "${escaped}" --quiet --yolo`;

	try {
		await execAsync(command, {
			cwd: process.cwd(),
			timeout: 480_000,
			maxBuffer: 20 * 1024 * 1024,
			shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
		});
		// El CLI ya escribió los cambios; contamos como "1 intento exitoso"
		// (el verificador externo corre tsc y decide si realmente quedó limpio)
		return {
			success: true,
			fixedFiles: backedUp.length || 1,
			message: `${cli} CLI completó el fix`,
		};
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[AutonomousExecutor] ${cli} CLI falló:`, msg.slice(0, 200));
		return {
			success: false,
			fixedFiles: 0,
			message: `${cli} CLI falló: ${msg.slice(0, 120)}`,
		};
	}
}

// ── Contexto del sistema ──────────────────────────────────────────────────────

function getSystemContext(): string {
	const srcDir = path.join(process.cwd(), "src");
	if (!fs.existsSync(srcDir)) return "src/ no encontrado";

	const lines: string[] = ["src/"];
	const readDir = (dir: string, prefix: string, depth: number) => {
		if (depth > 3) return;
		try {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (entry.name.startsWith(".") || entry.name === "node_modules")
					continue;
				if (entry.isDirectory()) {
					lines.push(`${prefix}${entry.name}/`);
					readDir(path.join(dir, entry.name), prefix + "  ", depth + 1);
				} else if (entry.name.endsWith(".ts")) {
					lines.push(`${prefix}${entry.name}`);
				}
			}
		} catch {
			/* ignorar permisos */
		}
	};

	readDir(srcDir, "  ", 0);
	return lines.slice(0, 60).join("\n");
}

// Reexport helper para el progress-notifier interno (evita importación duplicada)
async function notifyProgress(
	chatId: string | undefined | null,
	message: string,
): Promise<void> {
	const { notifyProgress: _notify } = await import("./progress-notifier.js");
	await _notify(chatId ?? undefined, message);
}
