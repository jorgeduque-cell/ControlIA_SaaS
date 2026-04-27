import { Agent } from "@voltagent/core";
import { getAIModelChain } from "../config/ai-provider.js";
import { INVENTORY_AGENT_PROMPT } from "../config/prompts.js";
import { chartInventarioTool } from "../tools/charts/chart-inventario.js";
import { addProductTool } from "../tools/inventory/add-product.js";
import { checkLowStockTool } from "../tools/inventory/check-low-stock.js";
import { getInventoryTool } from "../tools/inventory/get-inventory.js";
import { updateStockTool } from "../tools/inventory/update-stock.js";
import { valuedInventoryTool } from "../tools/inventory/valued-inventory.js";

export const inventoryAgent = new Agent({
	name: "Inventory",
	id: "inventory-agent",
	purpose:
		"Gestión de inventario, stock, alertas de productos bajos y catálogo de productos",
	instructions: INVENTORY_AGENT_PROMPT,
	model: getAIModelChain("nano"), // Groq Llama 8B — 14,400 req/día gratis
	tools: [
		getInventoryTool,
		updateStockTool,
		checkLowStockTool,
		addProductTool,
		valuedInventoryTool,
		chartInventarioTool,
	],
	maxOutputTokens: 512,
});
