import { createTool } from "@voltagent/core";
import axios from "axios";
import { z } from "zod";

export const openaiIntegration = createTool({
	name: "openai-integration",
	description:
		"Proporciona una función para interactuar con la API de OpenAI y generar texto o respuestas automáticas.",
	tags: ["openai", "integración", "texto", "respuestas automáticas"],
	parameters: z.object({
		prompt: z.string().min(1, "El prompt no puede estar vacío"),
		maxTokens: z.number().int().positive().optional(),
		temperature: z.number().min(0).max(1).optional(),
	}),
	execute: async (params, opts) => {
		const { prompt, maxTokens = 150, temperature = 0.7 } = params;
		const apiKey = process.env.OPENAI_API_KEY;

		if (!apiKey) {
			return {
				success: false,
				message: "La clave de API de OpenAI no está configurada.",
				data: null,
			};
		}

		try {
			const response = await axios.post(
				"https://api.openai.com/v1/engines/davinci-codex/completions",
				{
					prompt,
					max_tokens: maxTokens,
					temperature,
				},
				{
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
				},
			);

			const data = response.data;
			return {
				success: true,
				message: "Respuesta generada exitosamente.",
				data: data.choices[0].text.trim(),
			};
		} catch (error) {
			return {
				success: false,
				message: "Error al comunicarse con la API de OpenAI.",
				data: error instanceof Error ? error.message : "Error desconocido",
			};
		}
	},
});
