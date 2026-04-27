import { exec } from "child_process";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execPromise = promisify(exec);

export const commandExecutor = createTool({
	name: "commandExecutor",
	description: "Permite ejecutar comandos CLI de manera segura y controlada.",
	tags: ["cli", "command", "executor"],
	parameters: z.object({
		command: z.string().min(1, "El comando no puede estar vacío."),
	}),
	execute: async (params, opts) => {
		try {
			const { command } = params;
			const { stdout, stderr } = await execPromise(command);

			if (stderr) {
				return {
					success: false,
					message: `Error al ejecutar el comando: ${stderr}`,
					data: null,
				};
			}

			return {
				success: true,
				message: "Comando ejecutado exitosamente.",
				data: stdout,
			};
		} catch (error) {
			return {
				success: false,
				message: `Excepción al ejecutar el comando: ${error instanceof Error ? error.message : "Error desconocido"}`,
				data: null,
			};
		}
	},
});
