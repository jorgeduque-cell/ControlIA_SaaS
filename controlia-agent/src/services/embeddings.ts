import OpenAI from "openai";
import { config } from "../config/env.js";

// Cliente OpenAI para embeddings
const openai = new OpenAI({
	apiKey: config.OPENAI_API_KEY || "",
});

/**
 * Genera embeddings vectoriales para un texto
 * Usa el modelo text-embedding-3-small de OpenAI (1536 dimensiones)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	if (!config.OPENAI_API_KEY) {
		throw new Error(
			"OPENAI_API_KEY no configurada. Necesaria para generar embeddings.",
		);
	}

	// Limpiar y truncar texto si es muy largo
	const cleanText = text.trim().slice(0, 8000);

	const response = await openai.embeddings.create({
		model: "text-embedding-3-small",
		input: cleanText,
	});

	return response.data[0].embedding;
}

/**
 * Calcula similitud coseno entre dos vectores
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Formatea un vector para PostgreSQL/pgvector
 */
export function formatVectorForPostgres(embedding: number[]): string {
	return `[${embedding.join(",")}]`;
}
