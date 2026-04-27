/**
 * Aplica las 12 tablas + índices + FKs que faltan en la DB de Render.
 *
 * Lee /tmp/diff_raw.sql (generado por `prisma migrate diff`), FILTRA toda
 * sentencia peligrosa (DROP TABLE / DROP INDEX / DROP CONSTRAINT / cualquier
 * cosa que toque voltagent_memory_*) y aplica el resto vía $executeRawUnsafe
 * una a una, registrando éxito/fracaso por sentencia.
 *
 * Seguro de re-ejecutar: las sentencias fallan idempotentemente (tabla ya
 * existe, índice ya existe, etc.) y se registran como skip.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";

const DIFF_PATH =
	process.env.DDL_DIFF_PATH ?? path.join("/tmp", "diff_raw.sql");

function isDangerous(stmt: string): boolean {
	const s = stmt.toUpperCase();
	if (s.includes("DROP TABLE")) return true;
	if (s.includes("DROP INDEX")) return true;
	if (s.includes("DROP CONSTRAINT")) return true;
	if (stmt.includes("voltagent_memory_")) return true;
	if (stmt.includes("idx_context_memory_embedding")) return true;
	return false;
}

function splitStatements(sql: string): string[] {
	// Remove block of prisma update notice if present (lines starting with │ or └ or ┌)
	const cleaned = sql
		.split("\n")
		.filter((l) => !/^[│└┌─]/.test(l.trim()))
		.join("\n");

	return cleaned
		.split(";")
		.map((s) => s.replace(/--.*$/gm, "").trim())
		.filter((s) => s.length > 0);
}

async function main() {
	if (!fs.existsSync(DIFF_PATH)) {
		console.error(`✘ No existe ${DIFF_PATH}. Genera primero con:`);
		console.error(
			`  npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > ${DIFF_PATH}`,
		);
		process.exit(1);
	}

	const raw = fs.readFileSync(DIFF_PATH, "utf-8");
	const all = splitStatements(raw);

	const safe = all.filter((s) => !isDangerous(s));
	const skipped = all.filter((s) => isDangerous(s));

	console.log(`═══════════════════════════════════════════════════════════`);
	console.log(`  APLICAR DDL FALTANTE`);
	console.log(`═══════════════════════════════════════════════════════════`);
	console.log(`  Total sentencias:  ${all.length}`);
	console.log(`  A aplicar (safe):  ${safe.length}`);
	console.log(`  Omitidas (peligrosas): ${skipped.length}`);
	console.log(`───────────────────────────────────────────────────────────`);
	for (const s of skipped) {
		const firstLine = s.split("\n")[0].slice(0, 80);
		console.log(`  ⨯ SKIP: ${firstLine}`);
	}
	console.log(`───────────────────────────────────────────────────────────`);

	let ok = 0;
	let already = 0;
	let err = 0;
	for (const stmt of safe) {
		const head = stmt.split("\n")[0].slice(0, 80);
		try {
			await prisma.$executeRawUnsafe(stmt);
			console.log(`  ✔ ${head}`);
			ok++;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (
				msg.includes("already exists") ||
				msg.includes("duplicate") ||
				msg.includes("ya existe")
			) {
				console.log(`  · SKIP (ya existe): ${head}`);
				already++;
			} else {
				console.log(`  ✘ ERROR: ${head}`);
				console.log(`    → ${msg.split("\n")[0]}`);
				err++;
			}
		}
	}

	console.log(`───────────────────────────────────────────────────────────`);
	console.log(
		`  RESULTADO: ${ok} aplicadas  ·  ${already} ya existían  ·  ${err} errores`,
	);
	console.log(`═══════════════════════════════════════════════════════════`);

	if (err > 0) process.exit(2);
}

main()
	.catch((e) => {
		console.error("\n✘ FATAL:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
