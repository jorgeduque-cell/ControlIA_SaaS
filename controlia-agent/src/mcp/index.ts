import type { Agent } from "@voltagent/core";
import { MCPServer } from "@voltagent/mcp-server";

/**
 * ControlIA MCP Server — Fase 3
 *
 * Expone los agentes de ControlIA como herramientas MCP accesibles desde:
 *   - Claude Desktop (vía HTTP remoto)
 *   - Cursor IDE
 *   - Cualquier cliente compatible con MCP
 *
 * Endpoint HTTP (Streamable MCP): http://<host>:3141/mcp/controlia/mcp
 *
 * Configuración en Claude Desktop:
 * {
 *   "mcpServers": {
 *     "controlia": {
 *       "type": "http",
 *       "url": "http://localhost:3141/mcp/controlia/mcp"
 *     }
 *   }
 * }
 *
 * Para acceso remoto reemplaza localhost por la IP/dominio del servidor.
 */
export function createControlIAMCPServer(supervisorAgent: Agent): MCPServer {
	return new MCPServer({
		id: "controlia",
		name: "ControlIA",
		version: "1.0.0",
		description:
			"Sistema de gestión empresarial para distribuidoras LATAM. " +
			"Permite consultar clientes, pedidos, inventario y finanzas en lenguaje natural.",
		protocols: {
			http: true, // Manejado por Hono en /mcp/controlia/mcp
			sse: true, // SSE para clientes que lo prefieran en /mcp/controlia/sse
			stdio: false, // Deshabilitado — el proceso principal usa stdin/stdout para logs
		},
		agents: {
			// El supervisor enruta automáticamente a CRM, Ventas, Inventario, Finanzas, etc.
			supervisor: supervisorAgent,
		},
	});
}
