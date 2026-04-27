import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { createTool } from "@voltagent/core";
import { z } from "zod";

const execAsync = promisify(exec);

/**
 * Tool para aplicar código generado al sistema.
 * Crea o modifica archivos en el proyecto y, si el archivo es TypeScript,
 * ejecuta `tsc --noEmit` para validar la sintaxis. Si falla, hace rollback
 * automático al backup (o elimina el archivo nuevo).
 */
export const applyCodeTool = createTool({
	name: "apply_code",
	description:
		"Aplica código generado al sistema. Crea nuevos archivos o modifica existentes. " +
		"Para archivos .ts/.tsx valida con TypeScript post-escritura y hace rollback si hay errores.",
	tags: ["development", "file", "system", "modification"],

	parameters: z.object({
		filePath: z
			.string()
			.describe("Ruta del archivo (ej: src/tools/finance/new-tool.ts)"),
		code: z.string().describe("Código a escribir en el archivo"),
		action: z
			.enum(["create", "append", "replace"])
			.default("create")
			.describe(
				"'create'=nuevo archivo, 'append'=agregar al final, 'replace'=reemplazar todo",
			),
		backup: z
			.boolean()
			.default(true)
			.describe("Crear backup antes de modificar"),
		skipTypecheck: z
			.boolean()
			.default(false)
			.describe("Saltar validación TypeScript (solo usar en emergencias)"),
	}),

	execute: async (params) => {
		try {
			const projectRoot = path.resolve(process.cwd());
			const fullPath = path.resolve(
				path.isAbsolute(params.filePath)
					? params.filePath
					: path.join(projectRoot, params.filePath),
			);

			if (
				!fullPath.startsWith(projectRoot + path.sep) &&
				fullPath !== projectRoot
			) {
				return {
					success: false,
					message:
						"❌ Seguridad: No se pueden crear archivos fuera del proyecto",
				};
			}

			const fileExists = fs.existsSync(fullPath);

			if (fileExists && params.action === "create") {
				return {
					success: false,
					message: `❌ El archivo ya existe: ${params.filePath}. Usa 'replace' para sobrescribir o 'append' para agregar.`,
				};
			}

			if (!fileExists && params.action !== "create") {
				return {
					success: false,
					message: `❌ El archivo no existe: ${params.filePath}. Usa 'create' para crearlo.`,
				};
			}

			let backupPath: string | null = null;
			if (params.backup && fileExists) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				backupPath = `${fullPath}.backup-${timestamp}`;
				fs.copyFileSync(fullPath, backupPath);
			}

			const dir = path.dirname(fullPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			switch (params.action) {
				case "create":
					fs.writeFileSync(fullPath, params.code, "utf-8");
					break;
				case "replace":
					fs.writeFileSync(fullPath, params.code, "utf-8");
					break;
				case "append":
					fs.appendFileSync(fullPath, "\n" + params.code, "utf-8");
					break;
			}

			// Validación TypeScript post-escritura para .ts/.tsx
			const isTypeScript =
				params.filePath.endsWith(".ts") || params.filePath.endsWith(".tsx");
			if (isTypeScript && !params.skipTypecheck) {
				try {
					await execAsync("npx tsc --noEmit", {
						cwd: projectRoot,
						timeout: 120000, // 2 minutos máximo
					});
					console.log(
						`[apply_code] ✅ TypeScript validation passed for ${params.filePath}`,
					);
				} catch (tscError: unknown) {
					// Rollback: restaurar backup o eliminar archivo nuevo
					let rollbackMessage = "";
					if (backupPath && fs.existsSync(backupPath)) {
						fs.copyFileSync(backupPath, fullPath);
						rollbackMessage = "Restaurado desde backup";
					} else if (params.action === "create") {
						fs.unlinkSync(fullPath);
						rollbackMessage = "Archivo nuevo eliminado";
					} else {
						rollbackMessage =
							"⚠️ No se pudo hacer rollback (sin backup disponible)";
					}

					const errOutput = tscError as { stdout?: string; stderr?: string };
					const rawErrors = (
						errOutput.stdout ||
						errOutput.stderr ||
						""
					).toString();
					const firstErrors = rawErrors.split("\n").slice(0, 25).join("\n");

					console.error(
						`[apply_code] ❌ TypeScript validation failed — ${rollbackMessage}`,
					);

					return {
						success: false,
						message: `❌ TypeScript validation falló. ${rollbackMessage}. Revisa los errores y regenera el código.`,
						tscErrors: firstErrors,
						rolledBack: true,
						filePath: params.filePath,
					};
				}
			}

			return {
				success: true,
				message:
					`✅ Archivo ${params.action === "create" ? "creado" : "modificado"}: ${params.filePath}` +
					(isTypeScript && !params.skipTypecheck
						? " (TypeScript validado ✓)"
						: ""),
				filePath: params.filePath,
				fullPath: fullPath,
				backupPath: backupPath,
				action: params.action,
				typecheckPassed: isTypeScript && !params.skipTypecheck,
			};
		} catch (error) {
			console.error("[apply_code] Error:", error);
			return {
				success: false,
				message:
					"❌ Error aplicando código: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
