import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	DATOS_CURIOSOS,
	TIPS_ALMACENAMIENTO,
	USOS_RECOMENDADOS,
	getDatoCurioso,
} from "../../config/oil-products.js";

export const generateOilContentTool = createTool({
	name: "generate_oil_content",
	description:
		"Generar contenido automático sobre aceite comestible para marketing y redes sociales.",
	tags: ["content", "marketing", "oil"],

	parameters: z.object({
		tipo: z.enum([
			"dato_curioso",
			"beneficios",
			"receta",
			"almacenamiento",
			"newsletter",
			"comparativa",
		]),
		aceite: z
			.enum(["soya", "palma", "mixto", "todos"])
			.nullish()
			.default("todos"),
	}),

	execute: async (params) => {
		const contentType = params.tipo;
		const oilType = params.aceite || "todos";

		switch (contentType) {
			case "dato_curioso": {
				const fact = getDatoCurioso();
				return {
					success: true,
					content: `🧐 <b>¿SABÍAS QUÉ?</b>\n\n${fact}\n\n#AceiteDeCalidad #Distribuidora`,
					type: "dato_curioso",
				};
			}

			case "beneficios": {
				const emoji = oilType === "palma" ? "🌴" : "🌱";
				const usos =
					oilType === "palma"
						? [
								...USOS_RECOMENDADOS.oleosoberano_palma,
								...USOS_RECOMENDADOS.oleosoberano_hidrogenado,
							]
						: USOS_RECOMENDADOS.riosol;

				let message = `${emoji} <b>BENEFICIOS DEL ACEITE DE ${oilType.toUpperCase()}</b>\n\n`;
				usos.forEach((u) => {
					message += `  ✓ ${u}\n`;
				});

				return {
					success: true,
					content: message + "\n#Beneficios #Calidad",
					type: "beneficios",
				};
			}

			case "receta": {
				const usos =
					oilType === "soya"
						? USOS_RECOMENDADOS.riosol
						: oilType === "palma"
							? USOS_RECOMENDADOS.oleosoberano_palma
							: [
									...USOS_RECOMENDADOS.riosol,
									...USOS_RECOMENDADOS.oleosoberano_palma,
								];
				const uso = usos[Math.floor(Math.random() * usos.length)];
				const emoji = oilType === "palma" ? "🍰" : "🍳";

				return {
					success: true,
					content:
						`${emoji} <b>USO RECOMENDADO</b>\n\n` +
						`${uso}\n\n` +
						`🛒 Consulta nuestras presentaciones disponibles\n#Recetas`,
					type: "receta",
				};
			}

			case "almacenamiento": {
				const tip =
					TIPS_ALMACENAMIENTO[
						Math.floor(Math.random() * TIPS_ALMACENAMIENTO.length)
					];
				return {
					success: true,
					content: `📦 <b>CONSEJO</b>\n\n${tip}\n\n#Tips #Almacenamiento`,
					type: "almacenamiento",
				};
			}

			case "newsletter": {
				const fact = getDatoCurioso();
				const uso = USOS_RECOMENDADOS.riosol[0];

				return {
					success: true,
					content:
						"📰 <b>NEWSLETTER SEMANAL</b>\n" +
						"━".repeat(20) +
						"\n\n" +
						`🧐 ${fact}\n\n` +
						`🍳 ${uso}\n\n` +
						"📞 Contáctanos para más info\n#Newsletter",
					type: "newsletter",
				};
			}

			case "comparativa": {
				return {
					success: true,
					content:
						"⚖️ <b>RIOSOL VS OLEOSOBERANO</b>\n\n" +
						"🌱 <b>Riosol (Soya):</b> Líquido, versátil, ideal para cocinar y freír\n\n" +
						"🌴 <b>Oleosoberano (Palma):</b> Sólido, perfecto para repostería, estable\n\n" +
						"💡 Cocina diaria: Riosol | Repostería: Oleosoberano\n#Comparativa",
					type: "comparativa",
				};
			}

			default:
				return {
					success: false,
					content: "Tipo no soportado",
					type: "error",
				};
		}
	},
});
