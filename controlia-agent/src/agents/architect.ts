import { Agent, createReasoningTools } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { ARCHITECT_PROMPT } from "../prompts/architect.js";
import { claudeCodeTool } from "../tools/architect/claude-code.js";
import { claudeTerminalTool } from "../tools/architect/claude-terminal.js";
import { kimiCodeTool } from "../tools/architect/kimi-code.js";
import { kimiTerminalTool } from "../tools/architect/kimi-terminal.js";
import { learnAndImplementTool } from "../tools/architect/learn-and-implement.js";
import { selfHealingTool } from "../tools/architect/self-healing.js";
import { commandExecutor } from "../tools/cli/command-executor.js";
import { applyCodeTool } from "../tools/development/apply-code.js";
import { auditLogTool } from "../tools/development/audit-log.js";
import { generateCodeTool } from "../tools/development/generate-code.js";
import { readImageTool } from "../tools/vision/read-image.js";

// Reasoning toolkit — addInstructions: FALSE para no inflar el system prompt
// (cada request del Architect ya tiene ARCHITECT_PROMPT + 10 tool schemas)
const reasoningToolkit = createReasoningTools({
	think: true,
	analyze: true,
	addInstructions: false,
});

/**
 * Architect Agent - Agente autónomo que puede:
 * 1. Leer y entender imágenes/documentos
 * 2. Buscar información en internet
 * 3. Generar código para nuevas funcionalidades
 * 4. Auto-modificar el sistema
 */
export const architectAgent = new Agent({
	name: "Architect",
	id: "architect-agent",
	purpose:
		"Agente arquitecto que puede analizar imágenes, investigar en internet, generar código y auto-modificar el sistema",
	instructions: ARCHITECT_PROMPT,
	model: getAIModelChain("architect"), // Claude Sonnet 4.6: 5x más barato que Opus, capaz para TypeScript
	tools: [
		readImageTool, // Leer fotos/documentos
		generateCodeTool, // Generar código TypeScript
		applyCodeTool, // Aplicar cambios al sistema
		auditLogTool, // Verificar auditoría
		learnAndImplementTool, // AUTO-APRENDIZAJE PRINCIPAL
		selfHealingTool, // AUTO-CURACIÓN DEL SISTEMA
		claudeCodeTool, // Delegar a Claude Code CLI (plan Claude Max/Pro) para código
		claudeTerminalTool, // Delegar a Claude Code CLI para acciones de TERMINAL/PC
		kimiTerminalTool, // Delegar a Kimi Code CLI para acciones de TERMINAL/PC
		kimiCodeTool, // Delegar a Kimi Code CLI (plan Kimi Allegretto)
		commandExecutor, // Ejecutar comandos en el sistema local
		reasoningToolkit, // think + analyze antes de modificar código
	],
	temperature: 0.2,
	maxSteps: 8, // Reducido: 8 steps × ~3K tokens/step = ~24K < 30K/min Tier 1
	maxOutputTokens: 4096,
});
