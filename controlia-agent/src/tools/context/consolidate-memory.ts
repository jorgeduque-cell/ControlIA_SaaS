import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { forceConsolidation } from "../../services/memory-consolidator.js";

export const consolidateMemoryTool = createTool({
	name: "consolidate_memory",
	description:
		"Consolidar la memoria de clientes: resume múltiples notas dispersas en un " +
		"perfil compacto por cliente. Útil cuando el sistema lleva mucho tiempo " +
		"acumulando información y quieres que las búsquedas sean más precisas. " +
		"También muestra estadísticas de memoria actual.",
	tags: ["context", "memory", "maintenance"],

	parameters: z.object({
		modo: z
			.enum(["estadisticas", "consolidar", "ambos"])
			.default("ambos")
			.describe(
				"'estadisticas' = solo ver cuántas entradas hay, " +
					"'consolidar' = ejecutar consolidación ahora, " +
					"'ambos' = ver stats y consolidar",
			),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) throw new Error("Contexto de vendedor no disponible");
		const vendedorId = BigInt(vendedorIdStr as string);

		let msg = "";

		// ── Estadísticas ──────────────────────────────────────────────────────
		if (params.modo === "estadisticas" || params.modo === "ambos") {
			const stats = await prisma.$queryRaw<
				Array<{ tipo: string; total: number; consolidadas: number }>
			>`
        SELECT
          tipo,
          COUNT(*)::int              AS total,
          SUM(CASE WHEN consolidado THEN 1 ELSE 0 END)::int AS consolidadas
        FROM context_memory
        WHERE vendedor_id = ${vendedorId}
        GROUP BY tipo
        ORDER BY total DESC
      `;

			const totalEntradas = stats.reduce((s, r) => s + r.total, 0);
			const totalConsolidadas = stats.reduce((s, r) => s + r.consolidadas, 0);
			const activas = totalEntradas - totalConsolidadas;

			msg += `🧠 <b>ESTADO DE MEMORIA</b>\n`;
			msg += `Total entradas: ${totalEntradas} | Activas: ${activas} | Consolidadas: ${totalConsolidadas}\n\n`;

			if (stats.length > 0) {
				msg += `<b>Por tipo:</b>\n`;
				stats.forEach((r) => {
					const emoji: Record<string, string> = {
						resumen: "📋",
						preferencia: "⭐",
						nota: "📝",
						interaccion: "💬",
						recordatorio: "⏰",
						comportamiento: "📊",
					};
					msg += `  ${emoji[r.tipo] || "💾"} ${r.tipo}: ${r.total - r.consolidadas} activas\n`;
				});
				msg += "\n";
			}
		}

		// ── Consolidación ─────────────────────────────────────────────────────
		if (params.modo === "consolidar" || params.modo === "ambos") {
			msg += `⚙️ <b>CONSOLIDANDO MEMORIA...</b>\n`;

			const resultado = await forceConsolidation();

			if (resultado.grupos === 0) {
				msg +=
					`✅ No hay grupos pendientes de consolidación.\n` +
					`(Se necesitan ≥5 entradas con más de 7 días por cliente)`;
			} else {
				msg +=
					`✅ Procesados ${resultado.grupos} grupo(s)\n` +
					`📋 Resúmenes generados: ${resultado.consolidados}\n\n` +
					`La memoria está más limpia. Las próximas búsquedas serán más precisas.`;
			}
		}

		return { success: true, message: msg };
	},
});
