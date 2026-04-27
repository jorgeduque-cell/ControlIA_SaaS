import "dotenv/config";
import {
	Memory,
	VoltAgent,
	VoltAgentObservability,
	VoltOpsClient,
} from "@voltagent/core";
import { LibSQLObservabilityAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { PostgreSQLMemoryAdapter } from "@voltagent/postgres";
import { honoServer } from "@voltagent/server-hono";

import { startTelegramBridge } from "./adapters/telegram.js";
import { startWhatsAppBridge } from "./adapters/whatsapp.js";
import { createSupervisorAgent } from "./agents/supervisor.js";
import { config } from "./config/env.js";
import { createControlIAMCPServer } from "./mcp/index.js";
import { startErrorMonitoring } from "./services/error-monitor.js";
import { startMemoryConsolidator } from "./services/memory-consolidator.js";

// Create a logger instance
const logger = createPinoLogger({
	name: "controlia-agent",
	level: "info",
});

// Configure persistent memory (PostgreSQL — Render requiere SSL para conexiones externas)
// Aseguramos ?sslmode=require si no viene ya en la URL
const dbUrlWithSSL = config.DATABASE_URL.includes("sslmode=")
	? config.DATABASE_URL
	: config.DATABASE_URL.includes("?")
		? `${config.DATABASE_URL}&sslmode=require`
		: `${config.DATABASE_URL}?sslmode=require`;

const memory = new Memory({
	storage: new PostgreSQLMemoryAdapter({
		connection: dbUrlWithSSL,
		tablePrefix: "voltagent_memory", // tablas: voltagent_memory_conversations, etc.
	}),
});

// Configure persistent observability (LibSQL / SQLite)
const observability = new VoltAgentObservability({
	storage: new LibSQLObservabilityAdapter({
		url: "file:./.voltagent/observability.db",
	}),
});

// Initialize VoltOps Client if keys are present
const voltOpsClient =
	config.VOLTAGENT_PUBLIC_KEY && config.VOLTAGENT_SECRET_KEY
		? new VoltOpsClient({
				publicKey: config.VOLTAGENT_PUBLIC_KEY,
				secretKey: config.VOLTAGENT_SECRET_KEY,
			})
		: undefined;

// Create supervisor agent WITH memory
const supervisorAgent = createSupervisorAgent(memory);

// Create the overall VoltAgent application
const app = new VoltAgent({
	agents: {
		controlia: supervisorAgent,
	},
	workflows: {},
	server: honoServer({ port: 3141 }),
	logger,
	observability,
	voltOpsClient,
	// MCP Server — Fase 3
	// Expone ControlIA a Claude Desktop y otros clientes MCP
	// Endpoint: http://<host>:3141/mcp/controlia/mcp
	mcpServers: {
		controlia: createControlIAMCPServer(supervisorAgent),
	},
});

// Start the Telegram bot Bridge!
startTelegramBridge(supervisorAgent);

// Start the WhatsApp Business API Bridge!
startWhatsAppBridge(supervisorAgent);

// Start error monitoring for self-healing
startErrorMonitoring();
console.log("🩺 Sistema de auto-curación activado");

// Start long-term memory consolidator (runs every hour in background)
startMemoryConsolidator();
