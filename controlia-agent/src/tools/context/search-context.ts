import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { generateEmbedding } from "../../services/embeddings.js";

export const searchContextTool = createTool({
	name: "search_context",
	description:
		"Buscar información contextual usando búsqueda semántica. " +
		"Encuentra preferencias, notas, interacciones similares a la consulta. " +
		"Útil para recordar información sobre clientes o patrones de comportamiento.",
	tags: ["context", "memory", "read", "rag", "search"],

	parameters: z.object({
		query: z
			.string()
			.min(1)
			.describe(
				"La consulta en lenguaje natural (ej: 'qué le gusta a Don Pedro', 'clientes que pagan tarde')",
			),
		clienteId: z
			.number()
			.int()
			.nullish()
			.describe("Filtrar por cliente específico (opcional)"),
		tipo: z
			.enum([
				"preferencia",
				"nota",
				"interaccion",
				"recordatorio",
				"comportamiento",
			])
			.nullish()
			.describe("Filtrar por tipo de información (opcional)"),
		limit: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe("Máximo de resultados a retornar"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		try {
			let results: unknown;

			// Intentar búsqueda vectorial; si pgvector no está disponible usar ILIKE
			try {
				const queryEmbedding = await generateEmbedding(params.query);
				const embeddingString = `[${queryEmbedding.join(",")}]`;

				if (params.clienteId && params.tipo) {
					results = await prisma.$queryRaw`
            SELECT id, cliente_id, tipo, contenido, metadata, created_at,
              1 - (embedding <=> ${embeddingString}::vector) as similarity
            FROM context_memory
            WHERE vendedor_id = ${vendedorId}
              AND cliente_id = ${BigInt(params.clienteId)}
              AND tipo = ${params.tipo}
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingString}::vector
            LIMIT ${params.limit}
          `;
				} else if (params.clienteId) {
					results = await prisma.$queryRaw`
            SELECT id, cliente_id, tipo, contenido, metadata, created_at,
              1 - (embedding <=> ${embeddingString}::vector) as similarity
            FROM context_memory
            WHERE vendedor_id = ${vendedorId}
              AND cliente_id = ${BigInt(params.clienteId)}
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingString}::vector
            LIMIT ${params.limit}
          `;
				} else if (params.tipo) {
					results = await prisma.$queryRaw`
            SELECT id, cliente_id, tipo, contenido, metadata, created_at,
              1 - (embedding <=> ${embeddingString}::vector) as similarity
            FROM context_memory
            WHERE vendedor_id = ${vendedorId}
              AND tipo = ${params.tipo}
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingString}::vector
            LIMIT ${params.limit}
          `;
				} else {
					results = await prisma.$queryRaw`
            SELECT id, cliente_id, tipo, contenido, metadata, created_at,
              1 - (embedding <=> ${embeddingString}::vector) as similarity
            FROM context_memory
            WHERE vendedor_id = ${vendedorId}
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingString}::vector
            LIMIT ${params.limit}
          `;
				}
			} catch (vectorErr: any) {
				// pgvector no disponible → fallback a búsqueda por texto (ILIKE)
				if (
					vectorErr?.meta?.code === "42703" ||
					vectorErr?.meta?.code === "42704"
				) {
					const likeQuery = `%${params.query}%`;
					if (params.clienteId && params.tipo) {
						results = await prisma.$queryRaw`
              SELECT id, cliente_id, tipo, contenido, metadata, created_at, 0.5 as similarity
              FROM context_memory
              WHERE vendedor_id = ${vendedorId}
                AND cliente_id = ${BigInt(params.clienteId)}
                AND tipo = ${params.tipo}
                AND contenido ILIKE ${likeQuery}
              ORDER BY created_at DESC LIMIT ${params.limit}
            `;
					} else if (params.clienteId) {
						results = await prisma.$queryRaw`
              SELECT id, cliente_id, tipo, contenido, metadata, created_at, 0.5 as similarity
              FROM context_memory
              WHERE vendedor_id = ${vendedorId}
                AND cliente_id = ${BigInt(params.clienteId)}
                AND contenido ILIKE ${likeQuery}
              ORDER BY created_at DESC LIMIT ${params.limit}
            `;
					} else if (params.tipo) {
						results = await prisma.$queryRaw`
              SELECT id, cliente_id, tipo, contenido, metadata, created_at, 0.5 as similarity
              FROM context_memory
              WHERE vendedor_id = ${vendedorId}
                AND tipo = ${params.tipo}
                AND contenido ILIKE ${likeQuery}
              ORDER BY created_at DESC LIMIT ${params.limit}
            `;
					} else {
						results = await prisma.$queryRaw`
              SELECT id, cliente_id, tipo, contenido, metadata, created_at, 0.5 as similarity
              FROM context_memory
              WHERE vendedor_id = ${vendedorId}
                AND contenido ILIKE ${likeQuery}
              ORDER BY created_at DESC LIMIT ${params.limit}
            `;
					}
				} else {
					throw vectorErr;
				}
			}

			if (!results || (results as any[]).length === 0) {
				return {
					success: true,
					message:
						"🔍 No encontré información relevante en la memoria.\n\n" +
						"💡 Tip: Puedes guardar información usando el tool 'save_context'",
					results: [],
				};
			}

			// Formatear resultados
			const typedResults = results as any[];

			const tipoEmoji: Record<string, string> = {
				preferencia: "⭐",
				nota: "📝",
				interaccion: "💬",
				recordatorio: "⏰",
				comportamiento: "📊",
			};

			let message = `🔍 <b>RESULTADOS DE BÚSQUEDA SEMÁNTICA</b>\n`;
			message += `Consulta: "${params.query}"\n`;
			message += "━".repeat(30) + "\n\n";

			const formattedResults = typedResults.map((r) => {
				const similarity = Math.round(r.similarity * 100);
				return {
					id: Number(r.id),
					clienteId: r.cliente_id ? Number(r.cliente_id) : null,
					tipo: r.tipo,
					contenido: r.contenido,
					similarity,
					emoji: tipoEmoji[r.tipo] || "💾",
				};
			});

			for (const r of formattedResults) {
				message += `${r.emoji} <b>${r.tipo.toUpperCase()}</b> (${r.similarity}% match)\n`;
				message += `"${r.contenido.substring(0, 150)}${r.contenido.length > 150 ? "..." : ""}"\n\n`;
			}

			return {
				success: true,
				message,
				results: formattedResults,
			};
		} catch (error) {
			console.error("[search_context] Error:", error);
			return {
				success: false,
				message:
					"❌ Error al buscar en el contexto. Verifica que:\n" +
					"• OPENAI_API_KEY esté configurada\n" +
					"• La tabla context_memory existe en la base de datos\n" +
					"• La extensión pgvector está habilitada",
				results: [],
			};
		}
	},
});
