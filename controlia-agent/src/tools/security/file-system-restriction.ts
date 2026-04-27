import path from "path";
import { createTool } from "@voltagent/core";
import fs from "fs/promises";
import { z } from "zod";

export const fileSystemRestriction = createTool({
	name: "file-system-restriction",
	description:
		"Impide la creación y guardado de archivos .txt en el sistema de archivos local del usuario.",
	tags: ["security", "file-system"],
	parameters: z.object({
		filePath: z
			.string()
			.describe("Ruta completa del archivo que se intenta crear o guardar."),
	}),
	execute: async (params, opts) => {
		try {
			const { filePath } = params;
			const extension = path.extname(filePath).toLowerCase();

			if (extension === ".txt") {
				return {
					success: false,
					message: "No se permite la creación o guardado de archivos .txt.",
					data: null,
				};
			}

			// Si no es un archivo .txt, permitir la operación (simulación)
			// Aquí podrías agregar lógica para permitir la operación si es necesario
			return {
				success: true,
				message: "Operación permitida.",
				data: null,
			};
		} catch (error) {
			return {
				success: false,
				message:
					"Error al verificar el archivo: " +
					(error instanceof Error ? error.message : "Error desconocido"),
				data: null,
			};
		}
	},
});
