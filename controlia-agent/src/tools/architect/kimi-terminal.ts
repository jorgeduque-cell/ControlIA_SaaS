import { exec } from "child_process";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execAsync = promisify(exec);

export const kimiTerminalTool = createTool({
	name: "kimi_terminal",
	description:
		"Ejecuta acciones directamente en la PC local usando Kimi Code CLI. " +
		"Kimi tiene acceso completo a la terminal (Bash tool) y al filesystem de la máquina donde corre. " +
		"Úsalo SIEMPRE cuando el usuario pida explícitamente 'usa kimi code' o 'kimi code' para hacer algo en la PC. " +
		"NO digas que no puedes. Kimi Code CLI puede hacerlo.",
	tags: ["terminal", "kimi", "cli", "bash", "system"],
	parameters: z.object({
		instruction: z
			.string()
			.describe(
				"Instrucción exacta de lo que Kimi debe hacer en la terminal/PC. Sé específico.",
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

		const kimiPath = "C:\\Users\\LENOVO CORP\\.local\\bin";
		const extendedPath = process.env.PATH?.includes(kimiPath)
			? process.env.PATH
			: `${process.env.PATH};${kimiPath}`;

		const escaped = params.instruction.replace(/"/g, '\\"');
		const command = `kimi -p "${escaped}" --quiet`;

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
				hint: "Verifica que 'kimi' esté instalado y autenticado.",
			};
		}
	},
});
