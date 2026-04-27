import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execAsync = promisify(exec);

const REPO_ROOT = path.resolve(process.cwd());

export const claudeCodeTool = createTool({
	name: "claude_code",
	description: `Delega una tarea de ingeniería pesada al CLI de Claude Code (corre localmente con tu suscripción Claude Max/Pro).

CUÁNDO USAR:
- Refactors multi-archivo que requieren leer y editar varios .ts
- Debug complejo donde hay que entender todo el flujo
- Generación de código nuevo robusto (tools, agentes, servicios)
- Self-healing avanzado cuando el error requiere razonamiento profundo

CÓMO FUNCIONA:
- Ejecuta 'claude -p' en modo no-interactivo sobre el repo de ControlIA
- Claude Code tiene acceso completo al filesystem del repo (Read, Edit, Grep, Bash)
- Devuelve el output de texto del agente

NO USAR PARA:
- Preguntas simples (usa tu propio reasoning)
- Tareas del dominio de negocio (CRM, ventas, finanzas — esas son de otros agentes)`,
	parameters: z.object({
		prompt: z
			.string()
			.describe(
				"Instrucción completa para Claude Code. Sé específico: qué archivo, qué cambio, qué validación.",
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
		const command = `claude -p "${escaped}" --output-format text`;

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
				hint: "Verifica que 'claude' esté instalado y autenticado (claude --version). El CLI debe estar en PATH.",
			};
		}
	},
});
