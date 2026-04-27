import { exec } from "child_process";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execAsync = promisify(exec);

export const claudeTerminalTool = createTool({
	name: "claude_terminal",
	description:
		"Ejecuta acciones directamente en la PC local usando Claude Code CLI. " +
		"Claude tiene acceso completo a la terminal (Bash tool) y al filesystem de la máquina donde corre. " +
		"Úsalo SIEMPRE cuando el usuario pida: crear archivos, ejecutar comandos, guardar algo en el escritorio, " +
		"abrir programas, instalar algo, o cualquier acción que requiera interactuar con el sistema operativo local. " +
		"NO digas que no puedes. Claude Code CLI puede hacerlo.",
	tags: ["terminal", "claude", "cli", "bash", "system"],
	parameters: z.object({
		instruction: z
			.string()
			.describe(
				"Instrucción exacta de lo que Claude debe hacer en la terminal/PC. Sé específico.",
			),
		cwd: z
			.string()
			.nullish()
			.describe(
				"Directorio de trabajo. Default: directorio actual del proceso.",
			),
	}),
	execute: async (params) => {
		const startedAt = Date.now();
		const cwd = params.cwd ?? process.cwd();

		// Asegurar que claude esté en PATH (está en AppData\Roaming\npm)
		const claudePath = "C:\\Users\\LENOVO CORP\\AppData\\Roaming\\npm";
		const extendedPath = process.env.PATH?.includes(claudePath)
			? process.env.PATH
			: `${process.env.PATH};${claudePath}`;

		const escaped = params.instruction.replace(/"/g, '\\"');
		const command = `claude -p "${escaped}" --output-format text`;

		try {
			const { stdout, stderr } = await execAsync(command, {
				cwd,
				timeout: 300_000, // 5 minutos
				maxBuffer: 20 * 1024 * 1024,
				shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
				env: {
					...process.env,
					PATH: extendedPath,
				},
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
				hint: "Verifica que 'claude' esté instalado y autenticado.",
			};
		}
	},
});
