import { createTool } from "@voltagent/core";
import { z } from "zod";

interface File {
	name: string;
	content: string;
}

class FileSystemMock {
	private files: Record<string, File> = {};

	createFile(name: string, content: string): string {
		if (this.files[name]) {
			return `El archivo '${name}' ya existe.`;
		}
		this.files[name] = { name, content };
		return `Archivo '${name}' creado exitosamente.`;
	}

	readFile(name: string): string {
		const file = this.files[name];
		if (!file) {
			return `El archivo '${name}' no existe.`;
		}
		return file.content;
	}

	deleteFile(name: string): string {
		if (!this.files[name]) {
			return `El archivo '${name}' no existe.`;
		}
		delete this.files[name];
		return `Archivo '${name}' eliminado exitosamente.`;
	}
}

const fileSystemMock = new FileSystemMock();

export const fileSystemMockTool = createTool({
	name: "file-system-mock",
	description:
		"Simula la creación y almacenamiento de archivos sin interactuar con el sistema de archivos real.",
	tags: ["mock", "file-system"],
	parameters: z.object({
		action: z.enum(["create", "read", "delete"]),
		name: z.string(),
		content: z.string().optional(),
	}),
	execute: async (params, opts) => {
		try {
			const { action, name, content } = params;
			let message: string;

			switch (action) {
				case "create":
					if (content === undefined) {
						return {
							success: false,
							message: "El contenido es necesario para crear un archivo.",
							data: null,
						};
					}
					message = fileSystemMock.createFile(name, content);
					break;
				case "read":
					message = fileSystemMock.readFile(name);
					break;
				case "delete":
					message = fileSystemMock.deleteFile(name);
					break;
				default:
					return { success: false, message: "Acción no válida.", data: null };
			}

			return { success: true, message, data: null };
		} catch (error) {
			return {
				success: false,
				message: "Ocurrió un error inesperado.",
				data: null,
			};
		}
	},
});
