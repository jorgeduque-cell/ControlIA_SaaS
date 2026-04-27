import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	formatVectorForPostgres,
	generateEmbedding,
} from "../../services/embeddings.js";

export const saveContextTool = createTool({
	name: "save_context",
	description:
		"Guardar información contextual sobre un cliente en memoria semántica. " +
		"Útil para recordar preferencias, comportamientos, notas importantes, etc. " +
		"La información se almacena con embeddings para búsqueda semántica futura.",
	tags: ["context", "memory", "write", "rag"],

	parameters: z.object({
		clienteId: z
			.number()
			.int()
			.nullish()
			.describe("ID del cliente (opcional, para contexto general dejar vacío)"),
		tipo: z
			.enum([
				"preferencia",
				"nota",
				"interaccion",
				"recordatorio",
				"comportamiento",
			])
			.describe("Tipo de información a guardar"),
		contenido: z.string().min(1).describe("El contenido textual a recordar"),
		metadata: z
			.record(z.any())
			.nullish()
			.describe("Datos adicionales en formato JSON"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		try {
			// 1. Guardar inmediatamente SIN embedding (rápido — no bloquea la respuesta)
			const result = await prisma.$queryRaw`
        INSERT INTO context_memory (
          vendedor_id, cliente_id, tipo, contenido,
          metadata, created_at, updated_at
        ) VALUES (
          ${vendedorId},
          ${params.clienteId ? BigInt(params.clienteId) : null},
          ${params.tipo},
          ${params.contenido},
          ${JSON.stringify(params.metadata || {})}::jsonb,
          NOW(), NOW()
        )
        RETURNING id
      `;

			const savedId =
				Array.isArray(result) && result[0] ? (result[0] as any).id : null;

			// 2. Generar y actualizar embedding en background (no bloquea la respuesta al usuario)
			if (savedId) {
				setImmediate(async () => {
					try {
						const embedding = await generateEmbedding(params.contenido);
						await prisma.$queryRaw`
              UPDATE context_memory
              SET embedding = ${formatVectorForPostgres(embedding)}::vector
              WHERE id = ${BigInt(savedId)}
            `;
					} catch {
						// Silencioso — el registro ya fue guardado, solo falta el embedding
					}
				});
			}

			// Construir mensaje de confirmación
			const tipoEmoji: Record<string, string> = {
				preferencia: "⭐",
				nota: "📝",
				interaccion: "💬",
				recordatorio: "⏰",
				comportamiento: "📊",
			};

			return {
				success: true,
				message:
					`${tipoEmoji[params.tipo] || "💾"} <b>Información guardada</b>\n\n` +
					`Tipo: ${params.tipo}\n` +
					`Contenido: "${params.contenido.substring(0, 100)}${params.contenido.length > 100 ? "..." : ""}"\n\n` +
					`✅ Almacenado en memoria semántica para futuras consultas.`,
				id: savedId ? Number(savedId) : null,
			};
		} catch (error) {
			console.error("[save_context] Error:", error);
			return {
				success: false,
				message:
					"❌ Error al guardar el contexto. Verifica que OPENAI_API_KEY esté configurada para generar embeddings.",
			};
		}
	},
});
