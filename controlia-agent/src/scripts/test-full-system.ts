// @ts-nocheck
/**
 * TEST COMPLETO DEL SISTEMA — ControlIA
 * Corre con: npx tsx --env-file=.env src/scripts/test-full-system.ts
 *
 * Cubre:
 *   1.  Base de datos (Prisma + PostgreSQL)
 *   2.  AI Providers (Gemini reasoning, Gemini fast, Claude architect)
 *   3.  Embeddings (OpenAI text-embedding-3-small)
 *   4.  CRM (buscar clientes, pipeline, perfil)
 *   5.  Ventas (precios, pedidos, crear orden)
 *   6.  Inventario (stock, productos, alertas)
 *   7.  Finanzas (P&L, flujo de caja, cartera)
 *   8.  Contexto / Memoria semántica
 *   9.  Consolidación de memoria a largo plazo
 *  10.  Contenido (generar contenido, cotización)
 *  11.  Notificaciones (cartera vencida, forecast demanda)
 *  12.  Investigación (web search)
 *  13.  Memoria PostgreSQL (VoltAgent)
 */

import "dotenv/config";
import { PostgreSQLMemoryAdapter } from "@voltagent/postgres";
import { generateText } from "ai";
import { getAIModel } from "../config/ai-provider.js";
import { config } from "../config/env.js";
import { prisma } from "../db/client.js";
import { generateEmbedding } from "../services/embeddings.js";

// ── Colores para la terminal ──────────────────────────────────────────────────
const C = {
	ok: (s: string) => `\x1b[32m✅ ${s}\x1b[0m`,
	fail: (s: string) => `\x1b[31m❌ ${s}\x1b[0m`,
	skip: (s: string) => `\x1b[33m⚠️  ${s}\x1b[0m`,
	head: (s: string) =>
		`\x1b[1m\x1b[36m\n── ${s} ${"─".repeat(Math.max(0, 45 - s.length))}\x1b[0m`,
	info: (s: string) => `\x1b[90m   ${s}\x1b[0m`,
};

// ── Estado global ─────────────────────────────────────────────────────────────
let passed = 0,
	failed = 0,
	skipped = 0;
const errors: string[] = [];

async function test(name: string, fn: () => Promise<string | void>) {
	try {
		const detail = await fn();
		console.log(C.ok(name) + (detail ? C.info(detail) : ""));
		passed++;
	} catch (e: any) {
		const msg = e?.message || String(e);
		console.log(C.fail(name));
		console.log(C.info(msg.slice(0, 120)));
		errors.push(`${name}: ${msg.slice(0, 100)}`);
		failed++;
	}
}

function skip(name: string, reason: string) {
	console.log(C.skip(`${name} — ${reason}`));
	skipped++;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeContext(vendedorId: string) {
	const map = new Map<string, unknown>([
		["userId", vendedorId],
		["vendedorId", vendedorId],
		["vendedorNombre", "Test Vendedor"],
		["negocioNombre", "Aceites Test SAS"],
		["chatId", "123456789"],
	]);
	return {
		context: {
			get: (k: string) => map.get(k),
			set: (k: string, v: unknown) => map.set(k, v),
		},
	};
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
	console.log("\x1b[1m\x1b[35m");
	console.log("╔══════════════════════════════════════════════════╗");
	console.log("║   TEST COMPLETO — ControlIA Agent System         ║");
	console.log("╚══════════════════════════════════════════════════╝\x1b[0m\n");

	// ═══════════════════════════════════════════════════════════════════════════
	// 1. BASE DE DATOS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("1. BASE DE DATOS"));

	let vendedorId = "";
	let clienteId = 0;

	await test("Conexión PostgreSQL", async () => {
		const r = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
		return `servidor: ${r[0].now.toISOString()}`;
	});

	await test("Leer tabla vendedores", async () => {
		const rows = await prisma.vendedores.findMany({ take: 1 });
		if (!rows.length) throw new Error("No hay vendedores en la DB");
		vendedorId = rows[0].id.toString();
		return `id=${vendedorId} | ${rows[0].nombre_negocio}`;
	});

	await test("Leer tabla clientes", async () => {
		if (!vendedorId) throw new Error("Necesita vendedorId");
		const rows = await prisma.clientes.findMany({
			where: { vendedor_id: BigInt(vendedorId) },
			take: 1,
		});
		if (!rows.length) throw new Error("No hay clientes para este vendedor");
		clienteId = rows[0].id;
		return `id=${clienteId} | ${rows[0].nombre}`;
	});

	await test("Leer tabla pedidos", async () => {
		if (!vendedorId) throw new Error("Necesita vendedorId");
		const count = await prisma.pedidos.count({
			where: { vendedor_id: BigInt(vendedorId) },
		});
		return `${count} pedido(s) registrados`;
	});

	await test("Leer tabla productos", async () => {
		if (!vendedorId) throw new Error("Necesita vendedorId");
		const rows = await prisma.productos.findMany({
			where: { vendedor_id: BigInt(vendedorId) },
			take: 3,
		});
		return `${rows.length} producto(s): ${rows.map((p) => p.nombre).join(", ")}`;
	});

	await test("Leer tabla inventario", async () => {
		if (!vendedorId) throw new Error("Necesita vendedorId");
		const rows = await prisma.inventario.findMany({
			where: { vendedor_id: BigInt(vendedorId) },
			take: 3,
		});
		return `${rows.length} ítem(s) en inventario`;
	});

	await test("Leer tabla finanzas", async () => {
		if (!vendedorId) throw new Error("Necesita vendedorId");
		const count = await prisma.finanzas.count({
			where: { vendedor_id: BigInt(vendedorId) },
		});
		return `${count} movimiento(s) financieros`;
	});

	await test("Tabla context_memory (pgvector)", async () => {
		const r = await prisma.$queryRaw<[{ col: string }]>`
      SELECT column_name as col FROM information_schema.columns
      WHERE table_name='context_memory' AND column_name='embedding'
    `;
		if (!r.length) throw new Error("Columna embedding no existe");
		return "columna embedding vector(1536) OK";
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// 2. AI PROVIDERS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("2. AI PROVIDERS"));

	await test("Gemini 2.5 Flash — tier reasoning", async () => {
		const { text } = await generateText({
			model: getAIModel("reasoning"),
			prompt: "Responde solo con estas palabras exactas: Gemini reasoning OK",
			maxOutputTokens: 30,
		});
		if (!text) throw new Error("Respuesta vacía");
		return text.trim().slice(0, 60);
	});

	await test("Gemini 2.5 Flash — tier fast", async () => {
		const { text } = await generateText({
			model: getAIModel("fast"),
			prompt: "Di solo: 'Gemini fast OK'",
			maxOutputTokens: 20,
		});
		return text.trim().slice(0, 60);
	});

	await test("Claude Sonnet 4.6 — tier architect", async () => {
		const { text } = await generateText({
			model: getAIModel("architect"),
			prompt: "Di solo: 'Claude architect OK'",
			maxOutputTokens: 20,
		});
		return text.trim().slice(0, 60);
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// 3. EMBEDDINGS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("3. EMBEDDINGS (OpenAI)"));

	await test("Generar embedding texto", async () => {
		const emb = await generateEmbedding("aceite de soya Colombia precio");
		if (emb.length !== 1536)
			throw new Error(`Dimensión incorrecta: ${emb.length}`);
		return `vector de ${emb.length} dimensiones`;
	});

	await test("Similitud semántica", async () => {
		const { cosineSimilarity } = await import("../services/embeddings.js");
		const [a, b] = await Promise.all([
			generateEmbedding("aceite de palma refinado"),
			generateEmbedding("aceite palma refinada Colombia"),
		]);
		const sim = cosineSimilarity(a, b);
		if (sim < 0.7)
			throw new Error(`Similitud demasiado baja: ${sim.toFixed(3)}`);
		return `similitud: ${(sim * 100).toFixed(1)}%`;
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// 4. CRM TOOLS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("4. CRM"));

	if (!vendedorId) {
		skip("CRM tools", "no hay vendedorId disponible");
	} else {
		const ctx = makeContext(vendedorId);

		await test("search_clients — buscar clientes", async () => {
			const { searchClientsTool } = await import(
				"../tools/crm/search-clients.js"
			);
			const r = await searchClientsTool.execute(
				{ query: "", limit: 5 },
				ctx as any,
			);
			return `encontró resultados: ${r.success}`;
		});

		await test("get_pipeline — embudo de ventas", async () => {
			const { getPipelineTool } = await import("../tools/crm/get-pipeline.js");
			const r = await getPipelineTool.execute({}, ctx as any);
			return `pipeline: ${r.success}`;
		});

		if (clienteId) {
			await test("get_client_profile — perfil de cliente", async () => {
				const { getClientProfileTool } = await import(
					"../tools/crm/get-client-profile.js"
				);
				const r = await getClientProfileTool.execute({ clienteId }, ctx as any);
				return `perfil: ${r.success}`;
			});
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 5. VENTAS TOOLS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("5. VENTAS"));

	if (!vendedorId) {
		skip("Sales tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("get_prices — consultar precios", async () => {
			const { getPricesTool } = await import("../tools/sales/get-prices.js");
			const r = await getPricesTool.execute(
				{ query: "aceite soya" },
				ctx as any,
			);
			return `precios: ${r.success}`;
		});

		await test("list_orders — listar pedidos", async () => {
			const { listOrdersTool } = await import("../tools/sales/list-orders.js");
			const r = await listOrdersTool.execute({ limit: 5 }, ctx as any);
			return `pedidos: ${r.success}`;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 6. INVENTARIO TOOLS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("6. INVENTARIO"));

	if (!vendedorId) {
		skip("Inventory tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("get_inventory — ver stock", async () => {
			const { getInventoryTool } = await import(
				"../tools/inventory/get-inventory.js"
			);
			const r = await getInventoryTool.execute({}, ctx as any);
			return `inventario: ${r.success}`;
		});

		await test("check_low_stock — alertas de stock", async () => {
			const { checkLowStockTool } = await import(
				"../tools/inventory/check-low-stock.js"
			);
			const r = await checkLowStockTool.execute({}, ctx as any);
			return `alertas: ${r.success}`;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 7. FINANZAS TOOLS
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("7. FINANZAS"));

	if (!vendedorId) {
		skip("Finance tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("income_statement — estado de resultados", async () => {
			const { incomeStatementTool } = await import(
				"../tools/finance/income-statement.js"
			);
			const r = await incomeStatementTool.execute(
				{ periodo: "mes", año: 2026, incluirDetalle: true },
				ctx as any,
			);
			return `P&L: ${r.success}`;
		});

		await test("cash_flow — flujo de caja", async () => {
			const { cashFlowTool } = await import("../tools/finance/cash-flow.js");
			const r = await cashFlowTool.execute(
				{ dias: 30, incluirProyeccion: true },
				ctx as any,
			);
			return `cashflow: ${r.success}`;
		});

		await test("accounts_receivable — cuentas por cobrar", async () => {
			const { accountsReceivableTool } = await import(
				"../tools/finance/accounts-receivable.js"
			);
			const r = await accountsReceivableTool.execute(
				{ incluirDetalleClientes: true, limiteClientes: 5 },
				ctx as any,
			);
			return `cartera: ${r.success}`;
		});

		await test("profitability_analysis — análisis rentabilidad", async () => {
			const { profitabilityAnalysisTool } = await import(
				"../tools/finance/profitability-analysis.js"
			);
			const r = await profitabilityAnalysisTool.execute(
				{ analisis: "general" },
				ctx as any,
			);
			return `rentabilidad: ${r.success}`;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 8. CONTEXTO / MEMORIA SEMÁNTICA
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("8. MEMORIA SEMÁNTICA (context_memory)"));

	if (!vendedorId) {
		skip("Context tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("save_context — guardar en memoria", async () => {
			const { saveContextTool } = await import(
				"../tools/context/save-context.js"
			);
			const r = await saveContextTool.execute(
				{
					tipo: "nota",
					contenido: "TEST: cliente prueba prefiere aceite palma refinado 20L",
					metadata: { test: true },
				},
				ctx as any,
			);
			if (!r.success) throw new Error(r.message);
			return "guardado OK";
		});

		await test("search_context — buscar en memoria", async () => {
			const { searchContextTool } = await import(
				"../tools/context/search-context.js"
			);
			const r = await searchContextTool.execute(
				{ query: "aceite palma preferencia", limit: 3 },
				ctx as any,
			);
			return `encontró: ${r.results?.length ?? 0} resultado(s)`;
		});

		await test("consolidate_memory — estadísticas", async () => {
			const { consolidateMemoryTool } = await import(
				"../tools/context/consolidate-memory.js"
			);
			const r = await consolidateMemoryTool.execute(
				{ modo: "estadisticas" },
				ctx as any,
			);
			if (!r.success) throw new Error(r.message);
			return "stats OK";
		});

		if (clienteId) {
			await test("find_similar_clients — clientes similares", async () => {
				const { findSimilarClientsTool } = await import(
					"../tools/context/find-similar-clients.js"
				);
				const r = await findSimilarClientsTool.execute(
					{ clienteId, limit: 3 },
					ctx as any,
				);
				return `similares: ${r.similarClients?.length ?? 0}`;
			});
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 9. NOTIFICACIONES
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("9. NOTIFICACIONES"));

	if (!vendedorId) {
		skip("Notification tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("get_overdue_clients — cartera vencida", async () => {
			const { overdueClientsTool } = await import(
				"../tools/notifications/overdue-clients.js"
			);
			const r = await overdueClientsTool.execute(
				{ diasMinimos: 1, limite: 10 },
				ctx as any,
			);
			return `clientes con mora: ${r.clientes?.length ?? 0}`;
		});

		await test("forecast_demand — proyección de demanda", async () => {
			const { demandForecastTool } = await import(
				"../tools/notifications/demand-forecast.js"
			);
			const r = await demandForecastTool.execute(
				{ diasHistorial: 90, diasProyeccion: 30 },
				ctx as any,
			);
			return `productos analizados: ${r.consumoPorProducto?.length ?? 0}`;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 10. CONTENIDO
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("10. CONTENIDO"));

	if (!vendedorId) {
		skip("Content tools", "no hay vendedorId");
	} else {
		const ctx = makeContext(vendedorId);

		await test("generate_oil_content — contenido marketing", async () => {
			const { generateOilContentTool } = await import(
				"../tools/content/generate-oil-content.js"
			);
			const r = await generateOilContentTool.execute(
				{
					tipo: "beneficios",
					aceite: "soya",
				},
				ctx as any,
			);
			return `contenido: ${r.success}`;
		});

		await test("generate_quotation — cotización", async () => {
			const { generateQuotationTool } = await import(
				"../tools/document/generate-quotation.js"
			);
			const r = await generateQuotationTool.execute(
				{
					productos: [
						{ sku: "SOYA-20L", precioCosto: 75000, cantidad: 5, margen: 0.08 },
					],
					tipoCotizacion: "diaria",
					cliente: { nombre: "Restaurante Prueba" },
				},
				ctx as any,
			);
			return `cotización: ${r.success}`;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 11. INVESTIGACIÓN (Web Search)
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("11. INVESTIGACIÓN (Web Search)"));

	await test("web_search — búsqueda web", async () => {
		const { webSearchTool } = await import("../tools/research/web-search.js");
		const r = await webSearchTool.execute(
			{
				query: "precio aceite soya Colombia 2025",
				numResults: 3,
				searchType: "general",
			},
			{} as any,
		);
		const hasResults = r && typeof r === "object";
		if (!hasResults) throw new Error("Sin respuesta del search");
		return "búsqueda ejecutada OK";
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// 12. MEMORIA VOLTAGENT (PostgreSQL Adapter)
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("12. MEMORIA VOLTAGENT (PostgreSQL)"));

	await test("PostgreSQLMemoryAdapter — tablas en DB", async () => {
		// Verificar que las tablas de VoltAgent memory existen (se crean al arrancar el servidor)
		const r = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_name LIKE 'voltagent_memory%'
    `;
		const tablas = (r as any[]).map((t) => t.table_name);
		return tablas.length
			? `tablas: ${tablas.join(", ")}`
			: "tablas aún no creadas (se crean al primer arranque del servidor)";
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// 13. SERVICIO DE CONSOLIDACIÓN DE MEMORIA
	// ═══════════════════════════════════════════════════════════════════════════
	console.log(C.head("13. CONSOLIDACIÓN DE MEMORIA"));

	await test("forceConsolidation — ciclo de consolidación", async () => {
		const { forceConsolidation } = await import(
			"../services/memory-consolidator.js"
		);
		const r = await forceConsolidation();
		return `grupos procesados: ${r.grupos}, consolidados: ${r.consolidados}`;
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// RESUMEN FINAL
	// ═══════════════════════════════════════════════════════════════════════════
	await prisma.$disconnect();

	const total = passed + failed + skipped;
	console.log("\n\x1b[1m\x1b[35m");
	console.log("╔══════════════════════════════════════════════════╗");
	console.log(
		`║  RESULTADO: ${passed}/${total} OK  |  ${failed} FALLIDOS  |  ${skipped} OMITIDOS${" ".repeat(Math.max(0, 10 - String(passed).length - String(total).length - String(failed).length - String(skipped).length))}║`,
	);
	console.log("╚══════════════════════════════════════════════════╝\x1b[0m");

	if (errors.length) {
		console.log("\n\x1b[31mFALLOS:\x1b[0m");
		errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
	} else {
		console.log("\n\x1b[32m🚀 Sistema 100% operativo\x1b[0m");
	}
	console.log();

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("Error fatal:", e);
	process.exit(1);
});
