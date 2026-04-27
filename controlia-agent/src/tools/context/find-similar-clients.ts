import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { generateEmbedding } from "../../services/embeddings.js";

export const findSimilarClientsTool = createTool({
	name: "find_similar_clients",
	description:
		"Encontrar clientes similares basado en comportamiento, preferencias o patrones de compra. " +
		"Usa embeddings para comparar perfiles de clientes y encontrar similitudes. " +
		"Útil para segmentación y estrategias de venta.",
	tags: ["context", "analytics", "rag", "segmentation"],

	parameters: z.object({
		clienteId: z.number().int().describe("ID del cliente de referencia"),
		limit: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe("Cantidad de clientes similares a encontrar"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		try {
			// 1. Obtener el perfil del cliente de referencia
			const referenceClient = await prisma.clientes.findUnique({
				where: { id: params.clienteId },
				include: {
					pedidos: {
						orderBy: { fecha: "desc" },
						take: 10,
					},
					notas_cliente: {
						orderBy: { fecha: "desc" },
						take: 5,
					},
				},
			});

			if (!referenceClient || referenceClient.vendedor_id !== vendedorId) {
				return {
					success: false,
					message: "❌ Cliente de referencia no encontrado.",
					similarClients: [],
				};
			}

			// 2. Construir un texto descriptivo del perfil del cliente
			const productosFrecuentes = referenceClient.pedidos
				.map((p) => p.producto)
				.filter((v, i, a) => a.indexOf(v) === i)
				.slice(0, 5);

			const profileText = `
        Cliente: ${referenceClient.nombre}
        Tipo de negocio: ${referenceClient.tipo_negocio || "No especificado"}
        Estado: ${referenceClient.estado}
        Productos comprados: ${productosFrecuentes.join(", ") || "Ninguno registrado"}
        Total pedidos: ${referenceClient.pedidos.length}
        Notas: ${referenceClient.notas_cliente.map((n) => n.texto).join(". ") || "Sin notas"}
      `.trim();

			// 3. Generar embedding del perfil
			const profileEmbedding = await generateEmbedding(profileText);
			const embeddingString = `[${profileEmbedding.join(",")}]`;

			// 4. Buscar contextos similares de otros clientes
			const similarContexts = await prisma.$queryRaw`
        SELECT DISTINCT ON (cliente_id)
          cliente_id,
          1 - (embedding <=> ${embeddingString}::vector) as similarity
        FROM context_memory
        WHERE vendedor_id = ${vendedorId}
          AND cliente_id IS NOT NULL
          AND cliente_id != ${BigInt(params.clienteId)}
        ORDER BY cliente_id, embedding <=> ${embeddingString}::vector
        LIMIT ${params.limit}
      `;

			if (!similarContexts || (similarContexts as any[]).length === 0) {
				return {
					success: true,
					message:
						`📊 <b>ANÁLISIS DE SIMILITUD</b>\n\n` +
						`Cliente de referencia: <b>${referenceClient.nombre}</b>\n` +
						`Tipo: ${referenceClient.tipo_negocio || "No especificado"}\n\n` +
						`⚠️ No encontré clientes similares en la base de datos.\n` +
						`💡 Guarda más información sobre tus clientes usando 'save_context' para mejorar las recomendaciones.`,
					similarClients: [],
				};
			}

			// 5. Obtener detalles de los clientes similares
			const typedContexts = similarContexts as any[];
			const similarClientIds = typedContexts.map((c) => Number(c.cliente_id));

			const similarClientsDetails = await prisma.clientes.findMany({
				where: {
					id: { in: similarClientIds },
					vendedor_id: vendedorId,
				},
				include: {
					pedidos: {
						orderBy: { fecha: "desc" },
						take: 3,
					},
				},
			});

			// 6. Formatear resultados
			let message = `📊 <b>CLIENTES SIMILARES A ${referenceClient.nombre.toUpperCase()}</b>\n`;
			message += `Tipo de negocio: ${referenceClient.tipo_negocio || "No especificado"}\n`;
			message += `Productos frecuentes: ${productosFrecuentes.join(", ") || "N/A"}\n\n`;
			message += "━".repeat(30) + "\n\n";

			const formattedResults = typedContexts.map((ctx) => {
				const clientDetail = similarClientsDetails.find(
					(c) => c.id === Number(ctx.cliente_id),
				);
				return {
					id: Number(ctx.cliente_id),
					nombre: clientDetail?.nombre || "Desconocido",
					tipoNegocio: clientDetail?.tipo_negocio,
					similarity: Math.round(ctx.similarity * 100),
					pedidosRecientes:
						clientDetail?.pedidos.map((p) => p.producto).slice(0, 3) || [],
				};
			});

			for (const r of formattedResults) {
				message += `👤 <b>${r.nombre}</b> (${r.similarity}% similaridad)\n`;
				if (r.tipoNegocio) message += `   🏪 ${r.tipoNegocio}\n`;
				if (r.pedidosRecientes.length > 0) {
					message += `   🛒 Compra: ${r.pedidosRecientes.join(", ")}\n`;
				}
				message += "\n";
			}

			message +=
				"💡 <b>Recomendación:</b> Estos clientes podrían tener necesidades similares. " +
				"Considera ofrecerles los mismos productos o estrategias de venta.";

			return {
				success: true,
				message,
				similarClients: formattedResults,
			};
		} catch (error) {
			console.error("[find_similar_clients] Error:", error);
			return {
				success: false,
				message: "❌ Error al buscar clientes similares.",
				similarClients: [],
			};
		}
	},
});
