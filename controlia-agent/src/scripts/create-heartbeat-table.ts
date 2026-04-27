/**
 * One-off: crea la tabla heartbeat_log en la DB.
 *
 * No usamos `prisma migrate dev` porque Render no permite terminar conexiones
 * (falla con permission denied SUPERUSER).
 * No usamos `prisma db push` porque intentaría droppear las tablas
 * voltagent_memory_* que VoltAgent crea en runtime fuera del schema Prisma.
 *
 * Esto aplica SOLO el DDL del nuevo modelo, preservando todo lo demás.
 *
 * Ejecutar: tsx src/scripts/create-heartbeat-table.ts
 */

import { prisma } from "../db/client.js";

async function main() {
	console.log("[heartbeat-ddl] Creando tabla heartbeat_log si no existe...");

	await prisma.$executeRawUnsafe(`
		CREATE TABLE IF NOT EXISTS "heartbeat_log" (
			"id"           BIGSERIAL PRIMARY KEY,
			"vendedor_id"  BIGINT NOT NULL,
			"executed_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
			"chat_id"      TEXT,
			"message_id"   TEXT,
			"alerts_sent"  JSONB,
			"summary_text" TEXT,
			"trigger"      TEXT NOT NULL DEFAULT 'cron'
		)
	`);

	await prisma.$executeRawUnsafe(`
		CREATE INDEX IF NOT EXISTS "heartbeat_log_vendedor_id_idx"
		ON "heartbeat_log" ("vendedor_id")
	`);

	await prisma.$executeRawUnsafe(`
		CREATE INDEX IF NOT EXISTS "heartbeat_log_executed_at_idx"
		ON "heartbeat_log" ("executed_at")
	`);

	// Sanity check
	const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
		`SELECT COUNT(*)::bigint AS count FROM heartbeat_log`,
	);
	console.log(
		`[heartbeat-ddl] ✔ Tabla lista. Filas actuales: ${rows[0]?.count ?? 0n}`,
	);
}

main()
	.catch((err) => {
		console.error("[heartbeat-ddl] ✘ Falló:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
