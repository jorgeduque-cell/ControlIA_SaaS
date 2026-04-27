import { Agent, createReasoningTools } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { FINANCE_AGENT_PROMPT } from "../config/prompts.js";
import { chartAgingTool } from "../tools/charts/chart-aging.js";
import { chartFlujoCajaTool } from "../tools/charts/chart-flujo-caja.js";
import { convertCurrencyTool } from "../tools/external/convert-currency.js";
import { accountsReceivableTool } from "../tools/finance/accounts-receivable.js";
import { agingReportTool } from "../tools/finance/aging-report.js";
import { cashFlowTool } from "../tools/finance/cash-flow.js";
import { incomeStatementTool } from "../tools/finance/income-statement.js";
import { pnlReportTool } from "../tools/finance/pnl-report.js";
import { profitabilityAnalysisTool } from "../tools/finance/profitability-analysis.js";

// Reasoning toolkit: permite al agente "pensar" antes de calcular métricas
// financieras complejas (rentabilidad, análisis de morosidad, flujo de caja).
// Usa GPT-4o-mini (fast tier) — sin costo extra en Anthropic.
const reasoningToolkit = createReasoningTools({
	think: true,
	analyze: true,
	addInstructions: false, // No inflar system prompt — Finance Agent usa GPT-4o-mini
});

export const financeAgent = new Agent({
	name: "Finance",
	id: "finance-agent",
	purpose:
		"Contabilidad, finanzas, estado de resultados y análisis de rentabilidad",
	instructions: FINANCE_AGENT_PROMPT,
	model: getAIModelChain("fast"),
	tools: [
		incomeStatementTool,
		cashFlowTool,
		accountsReceivableTool,
		profitabilityAnalysisTool,
		pnlReportTool,
		agingReportTool,
		chartAgingTool,
		chartFlujoCajaTool,
		convertCurrencyTool,
		reasoningToolkit,
	],
	maxOutputTokens: 1024,
});
