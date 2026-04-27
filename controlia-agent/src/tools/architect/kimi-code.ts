import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execAsync = promisify(exec);

const REPO_ROOT = path.resolve(process.cwd());

export const kimiCodeTool = createTool({
	name: "kimi_code",
	description: `Delega una tarea de ingeniería pesada al CLI de Kimi Code (corre localmente con tu suscripción Kimi Allegretto).

CUÁNDO USAR:
- Alternativa a claude_code cuando quieras aprovechar tu plan Kimi Allegretto
- Refactors y generación de código en TypeScript
- Implementación de nuevas features del roadmap
- Revisión y auditoría de código

CÓMO FUNCIONA:
- Ejecuta 'kimi -p' en modo no-interactivo sobre el repo de ControlIA
- Kimi Code (K2.5) tiene acceso al filesystem del repo
- Devuelve el output de texto del agente

NO USAR PARA:
- Preguntas simples (usa tu propio reasoning)
- Tareas del dominio de negocio (CRM, ventas, finanzas — esas son de otros agentes)`,
	parameters: z.object({
		prompt: z
			.string()
			.describe(
				"Instrucción completa para Kimi Code. Sé específico: qué archivo, qué cambio, qué validación.",
			),
		cwd: z
			.string()
			.nullish()
			.describe(
				"Directorio de trabajo. Por defecto la raíz del repo controlia-agent.",
			),
		timeoutMs: z
			.number()
			.nullish()
			.describe("Timeout en ms. Default 480000 (8 min)."),
	}),
	execute: async (params) => {
		const startedAt = Date.now();
		const cwd = params.cwd ?? REPO_ROOT;
		const timeout = params.timeoutMs ?? 480_000;

		const escaped = params.prompt.replace(/"/g, '\\"');
		const command = `kimi -p "${escaped}" --quiet --yolo`;

		try {
			const { stdout, stderr } = await execAsync(command, {
				cwd,
				timeout,
				maxBuffer: 20 * 1024 * 1024,
				shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
			});
			return {
				success: true,
				durationMs: Date.now() - startedAt,
				output: stdout.trim(),
				warnings: stderr?.trim() || undefined,
			};
		} catch (err: any) {
			return {
				success: false,
				durationMs: Date.now() - startedAt,
				error: err.message,
				stdout: err.stdout?.toString().trim(),
				stderr: err.stderr?.toString().trim(),
				hint: "Verifica que 'kimi' esté instalado y autenticado (kimi --version). Si el flag -p no es el correcto, revisa 'kimi --help' y ajusta src/tools/architect/kimi-code.ts.",
			};
		}
	},
});
