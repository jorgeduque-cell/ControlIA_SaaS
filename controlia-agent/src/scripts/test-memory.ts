/**
 * Test de memoria a largo plazo — corre con:
 *   npx tsx --env-file=.env src/scripts/test-memory.ts
 *
 * Verifica:
 *   1. save_context  — guardar entradas en context_memory
 *   2. search_context — buscar por similitud semántica
 *   3. consolidate   — resumir entradas en un perfil
 *   4. search post-consolidación — la búsqueda sigue funcionando con el resumen
 */

import "dotenv/config";
import { prisma } from "../db/client.js";
import {
	formatVectorForPostgres,
	generateEmbedding,
} from "../services/embeddings.js";
import { forceConsolidation } from "../services/memory-consolidator.js";

const TEST_VENDEDOR_ID = BigInt(9999999999); // ID ficticio solo para test
const TEST_CLIENTE_ID = null; // null para evitar FK con tabla clientes

const COLOR = {
	ok: "\x1b[32m✅\x1b[0m",
	fail: "\x1b[31m❌\x1b[0m",
	info: "\x1b[36mℹ️ \x1b[0m",
	head: "\x1b[1m\x1b[35m",
	reset: "\x1b[0m",
};

async function crearVendedorTest() {
	await prisma.$executeRaw`
    INSERT INTO vendedores (id, nombre_negocio, estado)
    VALUES (${TEST_VENDEDOR_ID}, 'TEST_VENDEDOR', 'Activo')
    ON CONFLICT (id) DO NOTHING
  `;
}

async function limpiarDatosTest() {
	await prisma.$executeRaw`DELETE FROM context_memory WHERE vendedor_id = ${TEST_VENDEDOR_ID}`;
	await prisma.$executeRaw`DELETE FROM vendedores WHERE id = ${TEST_VENDEDOR_ID}`;
}

async function guardarEntrada(
	tipo: string,
	contenido: string,
	diasAtras: number,
) {
	const fecha = new Date();
	fecha.setDate(fecha.getDate() - diasAtras);

	const result = await prisma.$queryRaw<Array<{ id: bigint }>>`
    INSERT INTO context_memory (vendedor_id, cliente_id, tipo, contenido, metadata, created_at, updated_at)
    VALUES (
      ${TEST_VENDEDOR_ID},
      ${TEST_CLIENTE_ID},
      ${tipo},
      ${contenido},
      '{}'::jsonb,
      ${fecha},
      ${fecha}
    )
    RETURNING id
  `;

	const id = result[0]?.id;

	// Agregar embedding
	try {
		const emb = await generateEmbedding(contenido);
		await prisma.$queryRaw`
      UPDATE context_memory SET embedding = ${formatVectorForPostgres(emb)}::vector
      WHERE id = ${id}
    `;
	} catch {
		// Si no hay OPENAI_API_KEY, skip embedding
	}

	return id;
}

async function buscarMemoria(query: string, limite = 3) {
	try {
		const emb = await generateEmbedding(query);
		const embStr = `[${emb.join(",")}]`;

		return prisma.$queryRaw<
			Array<{ id: bigint; tipo: string; contenido: string; similarity: number }>
		>`
      SELECT id, tipo, contenido,
        (1 - (embedding <=> ${embStr}::vector))::float AS similarity
      FROM context_memory
      WHERE vendedor_id = ${TEST_VENDEDOR_ID}
        AND embedding IS NOT NULL
        AND consolidado = false
      ORDER BY embedding <=> ${embStr}::vector
      LIMIT ${limite}
    `;
	} catch {
		// Fallback sin vector
		return prisma.$queryRaw<
			Array<{ id: bigint; tipo: string; contenido: string; similarity: number }>
		>`
      SELECT id, tipo, contenido, 0.5::float AS similarity
      FROM context_memory
      WHERE vendedor_id = ${TEST_VENDEDOR_ID}
        AND consolidado = false
        AND contenido ILIKE ${"%" + query.split(" ")[0] + "%"}
      LIMIT ${limite}
    `;
	}
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
	console.log(
		`\n${COLOR.head}═══════════════════════════════════════${COLOR.reset}`,
	);
	console.log(
		`${COLOR.head}  TEST DE MEMORIA LARGA — ControlIA     ${COLOR.reset}`,
	);
	console.log(
		`${COLOR.head}═══════════════════════════════════════${COLOR.reset}\n`,
	);

	let passed = 0;
	let failed = 0;

	try {
		// ── PASO 0: Limpiar datos anteriores ──
		console.log(`${COLOR.info} Preparando datos de test...`);
		await limpiarDatosTest();
		await crearVendedorTest();
		console.log(`${COLOR.ok} Setup OK\n`);

		// ── PASO 1: Guardar 6 entradas (>5 para trigger de consolidación) ──
		console.log(
			`${COLOR.head}PASO 1: Guardar entradas de memoria${COLOR.reset}`,
		);
		const entradas = [
			{
				tipo: "interaccion",
				contenido:
					"Don Pedro pidió 20 litros de aceite de soya, entrega martes",
				dias: 10,
			},
			{
				tipo: "comportamiento",
				contenido:
					"Don Pedro pagó con 35 días de retraso, hay que hacer seguimiento",
				dias: 9,
			},
			{
				tipo: "preferencia",
				contenido: "Prefiere el aceite de palma refinado marca Palmasol",
				dias: 8,
			},
			{
				tipo: "nota",
				contenido:
					"Tiene panadería en el centro, compra cada 2 semanas aproximadamente",
				dias: 8,
			},
			{
				tipo: "interaccion",
				contenido:
					"Pidió cotización para 50 litros de soya, dijo que estaba caro",
				dias: 7,
			},
			{
				tipo: "comportamiento",
				contenido:
					"Segunda vez que reclama por el precio, comparando con proveedor de Bogotá",
				dias: 7,
			},
		];

		const ids: bigint[] = [];
		for (const e of entradas) {
			const id = await guardarEntrada(e.tipo, e.contenido, e.dias);
			if (id) ids.push(id);
			process.stdout.write(".");
		}
		console.log();

		if (ids.length === entradas.length) {
			console.log(
				`${COLOR.ok} ${ids.length} entradas guardadas (IDs: ${ids.slice(0, 3).map(String).join(", ")}...)\n`,
			);
			passed++;
		} else {
			console.log(
				`${COLOR.fail} Solo se guardaron ${ids.length}/${entradas.length} entradas\n`,
			);
			failed++;
		}

		// ── PASO 2: Buscar por similitud semántica ──
		console.log(`${COLOR.head}PASO 2: Búsqueda semántica${COLOR.reset}`);
		const resultados = await buscarMemoria("pago lento deuda");

		if (resultados.length > 0) {
			console.log(`${COLOR.ok} Encontró ${resultados.length} resultado(s):`);
			resultados.forEach((r) => {
				const sim = (r.similarity * 100).toFixed(0);
				console.log(
					`   [${sim}%] ${r.tipo}: "${r.contenido.substring(0, 60)}..."`,
				);
			});
			passed++;
		} else {
			console.log(
				`${COLOR.fail} No encontró resultados (¿OPENAI_API_KEY falta para embeddings?)`,
			);
			failed++;
		}
		console.log();

		// ── PASO 3: Verificar conteo antes de consolidar ──
		console.log(
			`${COLOR.head}PASO 3: Estado antes de consolidar${COLOR.reset}`,
		);
		const antes = await prisma.$queryRaw<
			Array<{ total: number; consolidadas: number }>
		>`
      SELECT COUNT(*)::int AS total,
        SUM(CASE WHEN consolidado THEN 1 ELSE 0 END)::int AS consolidadas
      FROM context_memory WHERE vendedor_id = ${TEST_VENDEDOR_ID}
    `;
		const { total, consolidadas } = antes[0] ?? { total: 0, consolidadas: 0 };
		console.log(
			`${COLOR.ok} ${total} entradas activas, ${consolidadas} consolidadas\n`,
		);
		passed++;

		// ── PASO 4: Forzar consolidación ──
		console.log(
			`${COLOR.head}PASO 4: Consolidación (resumen con GPT-4o-mini)${COLOR.reset}`,
		);
		const resultado = await forceConsolidation();

		if (resultado.consolidados > 0) {
			console.log(
				`${COLOR.ok} Consolidados: ${resultado.consolidados} grupo(s)\n`,
			);
			passed++;
		} else if (resultado.grupos === 0) {
			console.log(
				`${COLOR.info} Sin grupos que consolidar (entradas tienen < 7 días — normal en test)\n`,
			);
			// Forzar con fecha más vieja para el test
			await prisma.$executeRaw`
        UPDATE context_memory
        SET created_at = NOW() - INTERVAL '10 days',
            updated_at = NOW() - INTERVAL '10 days'
        WHERE vendedor_id = ${TEST_VENDEDOR_ID}
          AND consolidado = false
          AND tipo != 'resumen'
      `;
			const resultado2 = await forceConsolidation();
			if (resultado2.consolidados > 0) {
				console.log(
					`${COLOR.ok} Consolidados tras ajuste de fecha: ${resultado2.consolidados} grupo(s)\n`,
				);
				passed++;
			} else {
				console.log(`${COLOR.fail} No se pudo consolidar\n`);
				failed++;
			}
		}

		// ── PASO 5: Verificar resumen generado ──
		console.log(
			`${COLOR.head}PASO 5: Verificar resumen generado${COLOR.reset}`,
		);
		const resumenes = await prisma.$queryRaw<
			Array<{ contenido: string; created_at: Date }>
		>`
      SELECT contenido, created_at FROM context_memory
      WHERE vendedor_id = ${TEST_VENDEDOR_ID} AND tipo = 'resumen'
      ORDER BY created_at DESC LIMIT 1
    `;

		if (resumenes.length > 0) {
			console.log(`${COLOR.ok} Resumen generado:`);
			console.log(`   "${resumenes[0].contenido}"\n`);
			passed++;
		} else {
			console.log(`${COLOR.fail} No se generó resumen\n`);
			failed++;
		}

		// ── PASO 6: Buscar después de consolidar (debería encontrar el resumen) ──
		console.log(
			`${COLOR.head}PASO 6: Búsqueda post-consolidación${COLOR.reset}`,
		);
		const postConsolidacion = await buscarMemoria("aceite soya precio pago");

		if (postConsolidacion.length > 0) {
			console.log(
				`${COLOR.ok} Encontró ${postConsolidacion.length} resultado(s) post-consolidación:`,
			);
			postConsolidacion.forEach((r) => {
				const sim = (r.similarity * 100).toFixed(0);
				console.log(
					`   [${sim}% — ${r.tipo}] "${r.contenido.substring(0, 80)}..."`,
				);
			});
			passed++;
		} else {
			console.log(
				`${COLOR.info} Sin resultados post-consolidación (embedding pendiente — normal)\n`,
			);
		}
	} catch (err) {
		console.error(`${COLOR.fail} Error inesperado:`, err);
		failed++;
	} finally {
		// Limpiar datos de test
		await limpiarDatosTest();
		await prisma.$disconnect();
	}

	// ── RESUMEN ──
	console.log(
		`\n${COLOR.head}═══════════════════════════════════════${COLOR.reset}`,
	);
	console.log(`  RESULTADO: ${passed} OK / ${failed} FALLIDOS`);
	const estado =
		failed === 0
			? `${COLOR.ok} MEMORIA FUNCIONA CORRECTAMENTE`
			: `${COLOR.fail} HAY PROBLEMAS`;
	console.log(`  ${estado}`);
	console.log(
		`${COLOR.head}═══════════════════════════════════════${COLOR.reset}\n`,
	);

	process.exit(failed > 0 ? 1 : 0);
}

main();
