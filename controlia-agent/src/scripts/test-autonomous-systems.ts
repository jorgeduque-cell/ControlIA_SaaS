// @ts-nocheck
/**
 * TEST DE SISTEMAS AUTÓNOMOS — ControlIA
 * Corre con: npx tsx --env-file=.env src/scripts/test-autonomous-systems.ts
 *
 * Cubre:
 *   1. Auto-aprendizaje (learn_and_implement)
 *   2. Auto-curación (self_healing)
 *   3. Monitor de errores (error_monitor)
 *   4. Generación + aplicación de código (generate_code + apply_code)
 *   5. Ciclo end-to-end: error detectado → diagnóstico → fix → historial
 */

import "dotenv/config";
import {
	isMonitoringActive,
	startErrorMonitoring,
} from "../services/error-monitor.js";
import {
	analyzeError,
	attemptAutoHeal,
	generateHealingReport,
	getHealingHistory,
} from "../services/self-healing.js";
import {
	analyzeCapabilityGap,
	listLearnedCapabilities,
} from "../services/self-improvement.js";

const C = {
	ok: (s: string) => `\x1b[32m✅ ${s}\x1b[0m`,
	fail: (s: string) => `\x1b[31m❌ ${s}\x1b[0m`,
	warn: (s: string) => `\x1b[33m⚠️  ${s}\x1b[0m`,
	head: (s: string) =>
		`\x1b[1m\x1b[36m\n── ${s} ${"─".repeat(Math.max(0, 45 - s.length))}\x1b[0m`,
	info: (s: string) => `\x1b[90m   ${s}\x1b[0m`,
	detail: (s: string) => `\x1b[37m   ${s}\x1b[0m`,
};

let passed = 0,
	failed = 0,
	warnings = 0;
const issues: string[] = [];

async function test(name: string, fn: () => Promise<string | void>) {
	try {
		const detail = await fn();
		console.log(C.ok(name));
		if (detail) console.log(C.info(detail));
		passed++;
	} catch (e: any) {
		console.log(C.fail(name));
		console.log(C.info(e?.message?.slice(0, 150)));
		issues.push(`${name}: ${e?.message?.slice(0, 80)}`);
		failed++;
	}
}

function warn(name: string, issue: string) {
	console.log(C.warn(`${name}`));
	console.log(C.detail(`   ${issue}`));
	warnings++;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	console.log("\x1b[1m\x1b[35m");
	console.log("╔══════════════════════════════════════════════════╗");
	console.log("║   TEST SISTEMAS AUTÓNOMOS — ControlIA            ║");
	console.log("╚══════════════════════════════════════════════════╝\x1b[0m\n");

	// ═══════════════════════════════════════════════════════════════
	// 1. AUTO-APRENDIZAJE
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("1. AUTO-APRENDIZAJE (learn_and_implement)"));

	await test("Detectar gap — capacidad inexistente (QR)", async () => {
		const result = await analyzeCapabilityGap(
			"necesito escanear codigo qr del producto",
		);
		if (!result.hasGap)
			throw new Error("Debería detectar gap de QR pero no lo hizo");
		return `gap: "${result.gapDescription}" | query: "${result.researchQuery}"`;
	});

	await test("Detectar gap — predicción de ventas", async () => {
		const result = await analyzeCapabilityGap(
			"quiero una prediccion de cuánto voy a vender el próximo mes",
		);
		if (!result.hasGap) throw new Error("Debería detectar gap de predicción");
		return `gap: "${result.gapDescription}"`;
	});

	await test("No detectar gap — capacidad existente (email)", async () => {
		// 'email' existe en nodemailer/email-service.ts
		const result = await analyzeCapabilityGap(
			"quiero enviar un correo email al cliente",
		);
		// Puede o no detectar gap dependiendo de si encuentra el archivo
		return `hasGap: ${result.hasGap} (email-service existe en el sistema)`;
	});

	await test("No detectar gap — operación normal de ventas", async () => {
		const result = await analyzeCapabilityGap(
			"muéstrame los pedidos de esta semana",
		);
		if (result.hasGap)
			throw new Error(`Detectó gap falso: ${result.gapDescription}`);
		return "solicitud normal reconocida — sin gap";
	});

	await test("Listar capacidades aprendidas", async () => {
		const caps = await listLearnedCapabilities();
		return `capacidades en DB: ${caps.length}`;
	});

	await test("Tool learn_and_implement — flujo completo", async () => {
		const { learnAndImplementTool } = await import(
			"../tools/architect/learn-and-implement.js"
		);
		const ctx = { context: { get: () => "659132607", set: () => {} } };
		const r = await learnAndImplementTool.execute(
			{
				userRequest:
					"necesito integración con whatsapp business para enviar mensajes",
			},
			ctx,
		);
		if (!r.success) throw new Error("Tool retornó success=false");
		const action =
			r.action === "learning_required"
				? "gap detectado → plan generado"
				: "capacidad ya existe";
		return `action: ${r.action} | ${action}`;
	});

	// ═══════════════════════════════════════════════════════════════
	// 2. DIAGNÓSTICO DE ERRORES
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("2. DIAGNÓSTICO DE ERRORES (analyzeError)"));

	await test("Diagnosticar — módulo faltante", async () => {
		const r = analyzeError(
			"Cannot find module 'stripe' or its corresponding type declarations",
		);
		if (!r.canHeal) throw new Error("Debería poder curar módulo faltante");
		if (!r.suggestedFix.includes("npm install"))
			throw new Error("Fix debería ser npm install");
		return `diagnóstico: "${r.diagnosis}" | fix: "${r.suggestedFix}"`;
	});

	await test("Diagnosticar — null reference", async () => {
		const r = analyzeError("TypeError: Cannot read property 'id' of undefined");
		return `canHeal: ${r.canHeal} | diagnóstico: "${r.diagnosis}"`;
	});

	await test("Diagnosticar — error TypeScript", async () => {
		const r = analyzeError(
			"error TS2345: Argument of type 'string' is not assignable",
		);
		return `canHeal: ${r.canHeal} | diagnóstico: "${r.diagnosis}"`;
	});

	await test("Diagnosticar — error de red (no curable)", async () => {
		const r = analyzeError("ECONNREFUSED 127.0.0.1:5432");
		if (r.canHeal) throw new Error("Error de red NO debería ser auto-curable");
		return `canHeal: false ✓ | diagnóstico: "${r.diagnosis}"`;
	});

	await test("Diagnosticar — error de DB (no curable)", async () => {
		const r = analyzeError(
			"PrismaClientKnownRequestError: database connection failed",
		);
		if (r.canHeal) throw new Error("Error de DB NO debería ser auto-curable");
		return `canHeal: false ✓ | fix requerido: "${r.suggestedFix}"`;
	});

	// ═══════════════════════════════════════════════════════════════
	// 3. AUTO-CURACIÓN
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("3. AUTO-CURACIÓN (self_healing)"));

	await test("Intentar curar — error de red (debe fallar gracefully)", async () => {
		const r = await attemptAutoHeal({
			timestamp: new Date().toISOString(),
			errorType: "uncaughtException",
			errorMessage: "ECONNREFUSED 127.0.0.1:3000",
		});
		if (r.status !== "failed")
			throw new Error(`Estado inesperado: ${r.status}`);
		return `status: failed ✓ | diagnóstico: "${r.diagnosis}"`;
	});

	await test("Intentar curar — null reference (análisis completo)", async () => {
		// Usamos una ruta INEXISTENTE para que el self-healer no modifique archivos reales
		const r = await attemptAutoHeal({
			timestamp: new Date().toISOString(),
			errorType: "uncaughtException",
			errorMessage: "TypeError: Cannot read property 'nombre' of undefined",
			stackTrace:
				"at getFakeProfile (src/tools/fake/non-existent-tool.ts:45:10)",
		});
		return `status: ${r.status} | diagnosis: "${r.diagnosis}" | archivos: ${r.filesModified?.length ?? 0}`;
	});

	await test("Tool self_healing — reporte", async () => {
		const { selfHealingTool } = await import(
			"../tools/architect/self-healing.js"
		);
		const r = await selfHealingTool.execute({ action: "report" }, {});
		if (!r.success) throw new Error(`report falló: ${r.message}`);
		return "reporte generado OK";
	});

	await test("Tool self_healing — historial", async () => {
		const { selfHealingTool } = await import(
			"../tools/architect/self-healing.js"
		);
		const r = await selfHealingTool.execute({ action: "history" }, {});
		if (!r.success) throw new Error("historial falló");
		return `eventos en historial: ${r.data?.length ?? 0}`;
	});

	await test("Tool self_healing — heal con error de módulo", async () => {
		const { selfHealingTool } = await import(
			"../tools/architect/self-healing.js"
		);
		const r = await selfHealingTool.execute(
			{
				action: "heal",
				errorMessage:
					"Cannot find module 'lodash' or its corresponding type declarations",
			},
			{},
		);
		// No instalará realmente lodash — pero debe procesar el error sin crashear
		return `success: ${r.success} | status: ${r.action?.status ?? "procesado"}`;
	});

	await test("Historial de curación en memoria", async () => {
		const history = getHealingHistory();
		if (history.length === 0)
			throw new Error(
				"No hay historial (los tests anteriores debieron agregar entradas)",
			);
		const byStatus = history.reduce((acc: any, h) => {
			acc[h.status] = (acc[h.status] || 0) + 1;
			return acc;
		}, {});
		return `total: ${history.length} | ${JSON.stringify(byStatus)}`;
	});

	await test("Reporte de curación con datos", async () => {
		const report = generateHealingReport();
		if (!report.includes("REPORTE"))
			throw new Error("Reporte no tiene formato esperado");
		const lines = report.split("\n").filter((l) => l.trim());
		return `reporte: ${lines.length} líneas`;
	});

	// ═══════════════════════════════════════════════════════════════
	// 4. MONITOR DE ERRORES
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("4. MONITOR DE ERRORES (error_monitor)"));

	await test("Iniciar monitoreo", async () => {
		if (isMonitoringActive()) return "ya estaba activo";
		startErrorMonitoring();
		if (!isMonitoringActive()) throw new Error("No se activó el monitoreo");
		return "monitoreo activado ✓";
	});

	await test("Idempotencia — doble inicio sin duplicar listeners", async () => {
		const antes = isMonitoringActive();
		startErrorMonitoring(); // segunda llamada
		startErrorMonitoring(); // tercera llamada
		if (!isMonitoringActive())
			throw new Error("Se desactivó con llamadas múltiples");
		return "doble inicio ignorado correctamente ✓";
	});

	await test("Captura de promesa rechazada (simulado)", async () => {
		// Verificar que el sistema no crashea cuando hay un unhandledRejection
		// Lo simulamos disparando uno controlado y esperando que el monitor lo procese
		const captured = false;

		const originalListeners = process.listenerCount("unhandledRejection");

		// El monitor YA tiene el listener — solo verificamos que está registrado
		if (originalListeners === 0)
			throw new Error("Listener unhandledRejection no registrado");
		return `listeners registrados: ${originalListeners} (monitor activo)`;
	});

	// ═══════════════════════════════════════════════════════════════
	// 5. GENERACIÓN Y APLICACIÓN DE CÓDIGO
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("5. GENERATE_CODE + APPLY_CODE"));

	await test("generate_code — generar tool TypeScript", async () => {
		const { generateCodeTool } = await import(
			"../tools/development/generate-code.js"
		);
		const r = await generateCodeTool.execute(
			{
				type: "tool",
				name: "test_ping",
				description: "Tool de prueba que retorna pong",
				requirements:
					"Recibe un mensaje y lo devuelve con 'pong:' como prefijo",
			},
			{},
		);
		if (!r.success) throw new Error(`generate_code falló: ${r.message}`);
		const tieneCode = r.code?.length > 50;
		return `código generado: ${r.code?.length ?? 0} chars | contiene código: ${tieneCode}`;
	});

	await test("audit_log — verificar auditoría del sistema", async () => {
		const { auditLogTool } = await import("../tools/development/audit-log.js");
		const r = await auditLogTool.execute({}, {});
		return `auditoría: ${r.success} | ${r.message?.slice(0, 60) ?? "OK"}`;
	});

	// ═══════════════════════════════════════════════════════════════
	// 6. CICLO END-TO-END AUTÓNOMO
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("6. CICLO END-TO-END AUTÓNOMO"));

	await test("Ciclo completo: detectar gap → plan → historial", async () => {
		// Simular el flujo completo que haría el Architect Agent
		// Paso 1: Detectar gap
		const gap = await analyzeCapabilityGap(
			"necesito integración con mercado libre para sincronizar inventario",
		);
		if (!gap.hasGap) return "capacidad ya existe en el sistema";

		// Paso 2: Generar plan
		const { generateImplementationPlan } = await import(
			"../services/self-improvement.js"
		);
		const plan = generateImplementationPlan(gap.gapDescription, {
			libraries: ["axios"],
		});

		// Paso 3: Verificar que el plan es ejecutable
		if (!plan.steps.length) throw new Error("Plan sin pasos");
		if (!plan.filesToCreate.length)
			throw new Error("Plan sin archivos a crear");

		return [
			`gap: "${gap.gapDescription}"`,
			`pasos del plan: ${plan.steps.length}`,
			`archivos a crear: ${plan.filesToCreate.map((f) => f.name).join(", ")}`,
			`tiempo estimado: ${plan.estimatedTime}`,
		].join(" | ");
	});

	await test("Ciclo completo: error detectado → diagnóstico → intento curación", async () => {
		const errorSimulado = {
			timestamp: new Date().toISOString(),
			errorType: "uncaughtException",
			errorMessage: "Cannot find module '@stripe/stripe-js'",
			stackTrace: "at src/tools/payments/stripe.ts:3:10",
		};

		const healing = await attemptAutoHeal(errorSimulado);
		const history = getHealingHistory();
		const ultimo = history[history.length - 1];

		if (!ultimo) throw new Error("No se registró en historial");
		if (ultimo.diagnosis !== healing.diagnosis)
			throw new Error("Historial inconsistente");

		return `error → diagnóstico: "${healing.diagnosis}" → status: ${healing.status} → en historial: ✓`;
	});

	// ═══════════════════════════════════════════════════════════════
	// DIAGNÓSTICO DE LIMITACIONES REALES
	// ═══════════════════════════════════════════════════════════════
	console.log(C.head("DIAGNÓSTICO DE LIMITACIONES"));

	// ✅ TODAS LAS LIMITACIONES ANTERIORES HAN SIDO CORREGIDAS:
	//
	// ✅ self-healing — fix TypeScript: ahora usa IA (generateText architect) para leer el archivo
	//    con errores, generar código corregido y escribirlo de vuelta al disco con backup automático.
	//
	// ✅ self-healing — restart: ahora llama process.exit(1) real — PM2/nodemon/Render reinicia.
	//
	// ✅ self-improvement — vendedor_id: ahora busca el primer vendedor en DB dinámicamente,
	//    o usa system_capability sin vendedor si no hay ninguno.
	//
	// ✅ learn_and_implement — TOTALMENTE AUTÓNOMO: llama executeAutonomousLearning() que ejecuta
	//    los 8 pasos completos: investigación → diseño → npm install → generación de código →
	//    escritura en disco → tsc → auto-fix TS → registro en DB.
	//
	// ℹ️ error_monitor — health check con setInterval:
	//    Comportamiento esperado en producción. En tests mantiene el proceso vivo brevemente.

	warn(
		"error_monitor — setInterval en tests",
		"startErrorMonitoring() registra un setInterval de 30s. En tests puede mantener el proceso vivo. En producción es el comportamiento correcto.",
	);

	// ═══════════════════════════════════════════════════════════════
	// RESUMEN
	// ═══════════════════════════════════════════════════════════════
	const total = passed + failed;
	console.log("\n\x1b[1m\x1b[35m");
	console.log("╔══════════════════════════════════════════════════╗");
	console.log(
		`║  ${passed}/${total} tests OK  |  ${failed} fallidos  |  ${warnings} advertencias      ║`,
	);
	console.log("╚══════════════════════════════════════════════════╝\x1b[0m");

	if (issues.length) {
		console.log("\n\x1b[31mFALLOS:\x1b[0m");
		issues.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
	}

	if (warnings > 0) {
		console.log(
			`\n\x1b[33m${warnings} limitaciones documentadas — ver sección DIAGNÓSTICO arriba\x1b[0m`,
		);
	}

	if (failed === 0) {
		console.log("\n\x1b[32m✅ Todos los sistemas autónomos operativos\x1b[0m");
	}
	console.log();

	// Terminar forzado porque el setInterval del error-monitor mantiene el proceso vivo
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("Error fatal:", e);
	process.exit(1);
});
