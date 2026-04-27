import fs from "fs";
import path from "path";
import { createTool } from "@voltagent/core";
import axios from "axios";
import OpenAI from "openai";
import { z } from "zod";
import { logArchitectAction } from "../../services/architect-logger.js";

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Tool para analizar imágenes usando GPT-4 Vision
 * Puede leer documentos, facturas, fotos, etc.
 */
export const readImageTool = createTool({
	name: "read_image",
	description:
		"Analiza imágenes (fotos, documentos, facturas) y extrae información estructurada. " +
		"Usa GPT-4 Vision para OCR y comprensión de documentos.",
	tags: ["vision", "ocr", "image", "document"],

	parameters: z.object({
		imageUrl: z.string().describe("URL de la imagen o path local"),
		prompt: z
			.string()
			.nullish()
			.describe("Instrucciones específicas para el análisis"),
		extractStructure: z
			.boolean()
			.default(true)
			.describe("Extraer datos en formato estructurado (JSON)"),
	}),

	execute: async (params, options) => {
		const userRequest =
			options?.context?.get("lastUserMessage") || "Análisis de imagen";

		console.log(`[read_image] Iniciando análisis de: ${params.imageUrl}`);

		logArchitectAction({
			timestamp: new Date().toISOString(),
			type: "image_read",
			status: "started",
			details: `Analizando imagen: ${params.imageUrl.substring(0, 50)}...`,
			userRequest: String(userRequest),
		});

		try {
			let imageData: string;
			let isUrl = false;

			// Verificar que existe el archivo si es path local
			if (!params.imageUrl.startsWith("http")) {
				if (!fs.existsSync(params.imageUrl)) {
					throw new Error(`Archivo no encontrado: ${params.imageUrl}`);
				}
				console.log(
					`[read_image] Archivo local encontrado: ${params.imageUrl}`,
				);
			}

			// Detectar si es URL o archivo local
			if (params.imageUrl.startsWith("http")) {
				imageData = params.imageUrl;
				isUrl = true;
			} else {
				// Leer archivo local y convertir a base64
				const imagePath = path.isAbsolute(params.imageUrl)
					? params.imageUrl
					: path.join(process.cwd(), params.imageUrl);

				if (!fs.existsSync(imagePath)) {
					return {
						success: false,
						message: `❌ Archivo no encontrado: ${imagePath}`,
					};
				}

				const imageBuffer = fs.readFileSync(imagePath);
				const base64 = imageBuffer.toString("base64");
				const mimeType =
					path.extname(imagePath).toLowerCase() === ".png"
						? "image/png"
						: "image/jpeg";
				imageData = `data:${mimeType};base64,${base64}`;
			}

			const defaultPrompt = params.extractStructure
				? "Analiza esta imagen y extrae toda la información relevante en formato estructurado. " +
					"Si es una factura/documento financiero, extrae: fecha, proveedor, items, cantidades, precios, total. " +
					"Responde en español y usa formato JSON si es posible."
				: "Describe detalladamente el contenido de esta imagen en español.";

			const userPrompt = params.prompt || defaultPrompt;

			// Llamar a GPT-4 Vision
			const response = await openai.chat.completions.create({
				model: "gpt-4o", // GPT-4o tiene capacidades de visión
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: userPrompt },
							{
								type: "image_url",
								image_url: {
									url: imageData,
								},
							},
						],
					},
				],
				max_tokens: 2000,
			});

			const analysis =
				response.choices[0]?.message?.content ||
				"No se pudo analizar la imagen";

			logArchitectAction({
				timestamp: new Date().toISOString(),
				type: "image_read",
				status: "completed",
				details: `Imagen analizada exitosamente. Longitud del análisis: ${analysis.length} caracteres`,
				userRequest: String(userRequest),
			});

			return {
				success: true,
				message: "✅ Imagen analizada correctamente",
				analysis: analysis,
				isUrl,
				prompt: userPrompt,
			};
		} catch (error) {
			logArchitectAction({
				timestamp: new Date().toISOString(),
				type: "error",
				status: "failed",
				details: `Error leyendo imagen: ${error instanceof Error ? error.message : String(error)}`,
				userRequest: String(userRequest),
			});

			console.error("[read_image] Error:", error);
			return {
				success: false,
				message:
					"❌ Error al analizar imagen: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
