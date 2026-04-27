/**
 * Diagnóstico de conexión y actividad de la DB.
 * Muestra:
 *   - A qué host estamos conectados
 *   - Row counts de tablas clave
 *   - Últimos registros escritos (para confirmar que SÍ se está guardando)
 */

import { prisma } from "../db/client.js";

async function main() {
	const url = process.env.DATABASE_URL ?? "";
	const host = url.match(/@([^:/]+)/)?.[1] ?? "desconocido";
	const proveedor = host.includes("render")
		? "Render"
		: host.includes("supabase")
			? "Supabase"
			: host.includes("localhost")
				? "Local"
				: "Otro";

	console.log("═══════════════════════════════════════════════════════════");
	console.log("  DIAGNÓSTICO DE DB");
	console.log("═══════════════════════════════════════════════════════════");
	console.log(`  Proveedor: ${proveedor}`);
	console.log(`  Host:      ${host}`);
	console.log("───────────────────────────────────────────────────────────");

	// 1. Conectividad
	const ping = await prisma.$queryRawUnsafe<Array<{ now: Date }>>(
		"SELECT NOW() AS now",
	);
	console.log(`  ✔ Conectado (DB time: ${ping[0]?.now.toISOString()})`);
	console.log("───────────────────────────────────────────────────────────");

	// 2. Row counts
	const tablas = [
		"vendedores",
		"clientes",
		"productos",
		"pedidos",
		"cuentas_por_cobrar",
		"cotizaciones",
		"ordenes_compra",
		"voltagent_memory_messages",
		"voltagent_memory_conversations",
		"heartbeat_log",
		"audit_log",
		"context_memory",
	];

	console.log("  TABLA                             FILAS");
	console.log("  ────────────────────────────────  ──────");
	for (const t of tablas) {
		try {
			const r = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
				`SELECT COUNT(*)::bigint AS count FROM "${t}"`,
			);
			const n = Number(r[0]?.count ?? 0n);
			const flag = n > 0 ? "✔" : "·";
			console.log(`  ${flag} ${t.padEnd(32)}  ${String(n).padStart(6)}`);
		} catch {
			console.log(`  ✘ ${t.padEnd(32)}  (no existe)`);
		}
	}
	console.log("───────────────────────────────────────────────────────────");

	// 3. Últimos 3 mensajes en memoria conversacional (prueba de escritura viva)
	try {
		const ultimos = await prisma.$queryRawUnsafe<
			Array<{
				created_at: Date;
				conversation_id: string;
				role: string;
			}>
		>(`
			SELECT created_at, conversation_id, role
			FROM voltagent_memory_messages
			ORDER BY created_at DESC
			LIMIT 3
		`);
		console.log("  Últimos 3 mensajes en memoria conversacional:");
		if (ultimos.length === 0) {
			console.log("    (vacío — aún nadie ha conversado con el bot)");
		} else {
			for (const m of ultimos) {
				console.log(
					`    ${m.created_at.toISOString()}  ${m.role.padEnd(10)}  ${m.conversation_id}`,
				);
			}
		}
	} catch (err) {
		console.log("  ✘ No se pudo leer voltagent_memory_messages:", err);
	}
	console.log("───────────────────────────────────────────────────────────");

	// 4. Último pedido, último audit_log (prueba de escritura "de negocio")
	try {
		const ultimoPedido = await prisma.pedidos.findFirst({
			orderBy: { id: "desc" },
			select: {
				id: true,
				vendedor_id: true,
				producto: true,
				cantidad: true,
				estado: true,
				fecha: true,
			},
		});
		console.log("  Último pedido:");
		console.log(
			ultimoPedido
				? `    #${ultimoPedido.id} vendedor=${ultimoPedido.vendedor_id} ${ultimoPedido.cantidad}× ${ultimoPedido.producto} (${ultimoPedido.estado}) ${ultimoPedido.fecha?.toISOString().slice(0, 10) ?? "—"}`
				: "    (vacío)",
		);
	} catch {
		console.log("  ✘ Error leyendo pedidos");
	}

	try {
		const ultimoAudit = await prisma.audit_log.findFirst({
			orderBy: { created_at: "desc" },
			select: { created_at: true, accion: true, entidad: true },
		});
		console.log("  Último audit_log:");
		console.log(
			ultimoAudit
				? `    ${ultimoAudit.created_at.toISOString()}  ${ultimoAudit.accion} ${ultimoAudit.entidad}`
				: "    (vacío)",
		);
	} catch {
		console.log("  ✘ Error leyendo audit_log");
	}

	console.log("═══════════════════════════════════════════════════════════");
}

main()
	.catch((err) => {
		console.error("\n✘ DIAGNÓSTICO FALLÓ:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
