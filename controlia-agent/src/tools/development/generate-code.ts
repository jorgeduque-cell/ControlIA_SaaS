import { createTool } from "@voltagent/core";
import { generateText } from "ai";
import { z } from "zod";
import { getAIModel } from "../../config/ai-provider.js";

/**
 * Tool para generar código TypeScript.
 * Usa el cerebro del tier "architect" (Claude Opus por defecto) a través del
 * AI SDK para que la generación de código respete la configuración de providers
 * del sistema — no hardcodea OpenAI.
 */
export const generateCodeTool = createTool({
	name: "generate_code",
	description:
		"Genera código TypeScript de alta calidad para nuevas funcionalidades. " +
		"Puede crear tools, agents, servicios, adapters, etc. siguiendo las mejores prácticas del proyecto.",
	tags: ["development", "code", "generation", "typescript"],

	parameters: z.object({
		description: z
			.string()
			.describe("Descripción detallada de lo que debe hacer el código"),
		fileType: z
			.enum(["tool", "agent", "service", "adapter", "component", "other"])
			.describe("Tipo de archivo a generar"),
		fileName: z
			.string()
			.describe("Nombre sugerido del archivo (sin extensión)"),
		dependencies: z
			.array(z.string())
			.nullish()
			.describe("Dependencias npm necesarias"),
		existingCode: z
			.string()
			.nullish()
			.describe("Código existente para extender/modificar"),
	}),

	execute: async (params) => {
		try {
			const systemPrompt = `Eres un experto desarrollador TypeScript especializado en VoltAgent 2.0.

REGLAS PARA GENERAR CÓDIGO:
1. Usa TypeScript estricto con tipos explícitos
2. Sigue el estilo del proyecto: imports con .js, funciones async/await
3. Para TOOLS: usa createTool de @voltagent/core con zod para validación
4. Para AGENTS: usa Agent class con purpose, instructions, tools
5. Para SERVICIOS: exporta funciones puras, no clases
6. SIEMPRE maneja errores con try/catch
7. Usa comentarios JSDoc para documentar
8. NO uses 'any', define interfaces/types
9. Los archivos deben ser compatibles con ES modules

ESTRUCTURA DE UN TOOL:
\`\`\`typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const toolName = createTool({
  name: "tool_name",
  description: "Descripción clara",
  tags: ["categoria"],
  parameters: z.object({...}),
  execute: async (params, options) => {
    // Implementación
    return { success: true, message: "...", data: ... };
  },
});
\`\`\``;

			const userPrompt = `Genera código TypeScript para:

TIPO: ${params.fileType}
NOMBRE: ${params.fileName}
DESCRIPCIÓN: ${params.description}
${params.dependencies ? `DEPENDENCIAS NECESARIAS: ${params.dependencies.join(", ")}` : ""}
${params.existingCode ? `CÓDIGO EXISTENTE A EXTENDER:\n${params.existingCode}` : ""}

Responde con el código completo y listo para usar. Incluye:
1. Todos los imports necesarios
2. Código completo y funcional
3. Comentarios explicativos
4. Ejemplo de uso (opcional)

Formato de respuesta:
FILE_PATH: src/[ruta]/[nombre].ts
DEPENDENCIES: [lista de npm install si aplica]

\`\`\`typescript
[código completo aquí]
\`\`\``;

			const { text } = await generateText({
				model: getAIModel("architect"),
				system: systemPrompt,
				prompt: userPrompt,
				temperature: 0.2,
			});

			const filePathMatch = text.match(/FILE_PATH:\s*(.+)/);
			const dependenciesMatch = text.match(/DEPENDENCIES:\s*(.+)/);
			const codeMatch = text.match(/```typescript\n([\s\S]+?)\n```/);

			return {
				success: true,
				message: "✅ Código generado correctamente",
				filePath:
					filePathMatch?.[1]?.trim() ||
					`src/${params.fileType}s/${params.fileName}.ts`,
				dependencies:
					dependenciesMatch?.[1]
						?.trim()
						.split(",")
						.map((d) => d.trim()) ||
					params.dependencies ||
					[],
				code: codeMatch?.[1]?.trim() || text,
				fullResponse: text,
			};
		} catch (error) {
			console.error("[generate_code] Error:", error);
			return {
				success: false,
				message:
					"❌ Error generando código: " +
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
