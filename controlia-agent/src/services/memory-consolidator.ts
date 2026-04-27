/**
 * Memory Consolidator — Memoria jerárquica a largo plazo
 *
 * Problema: context_memory acumula cientos de entradas individuales.
 * La búsqueda semántica se degrada y el contexto se vuelve ruidoso.
 *
 * Solución: cada hora revisa clientes con 5+ entradas antiguas (>7 días)
 * y las condensa en UN resumen usando GPT-4o-mini.
 * Las entradas originales se marcan como `consolidado=true`.
 *
 * Resultado:
 *   Antes: 50 notas dispersas de "Don Pedro pidió 20L", "Don Pedro pagó tarde"...
 *   Después: 1 resumen "Don Pedro: cliente frecuente, compra aceite soya 20-30L,
 *             historial de pagos lentos (30-45 días), prefiere entrega los martes."
 */

import OpenAI from "openai";
import { config } from "../config/env.js";
import { prisma } from "../db/client.js";
import { formatVectorForPostgres, generateEmbedding } from "./embeddings.js";

const ENTRIES_THRESHOLD = 5; // Consolidar cuando hay ≥5 entradas sin consolidar
const DAYS_BEFORE_CONSOLIDATE = 7; // Solo consolidar entradas con más de 7 días
const CONSOLIDATION_INTERVAL_MS = 60 * 60 * 1000; // Cada 1 hora

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY || "" });

let _consolidationTimeout: ReturnType<typeof setTimeout> | null = null;
let _consolidationInterval: ReturnType<typeof setInterval> | null = null;

interface EntradaMemoria {
	id: bigint;
	tipo: string;
	contenido: string;
	created_at: Date | null;
}

/**
 * Genera un resumen consolidado de múltiples entradas de memoria de un cliente
 * usando GPT-4o-mini (rápido y económico).
 */
async function generarResumen(
	nombreCliente: string,
	entradas: EntradaMemoria[],
): Promise<string> {
	const listaEntradas = entradas
		.map((e, i) => {
			const fecha = e.created_at
				? e.created_at.toISOString().split("T")[0]
				: "fecha desconocida";
			return `${i + 1}. [${e.tipo} - ${fecha}] ${e.contenido}`;
		})
		.join("\n");

	const response = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		temperature: 0.1,
		max_tokens: 400,
		messages: [
			{
				role: "system",
				content:
					"Eres un asistente que consolida notas de clientes en un perfil conciso. " +
					"Resume toda la información en 3-5 oraciones que capturen: " +
					"patrones de compra, comportamiento de pago, preferencias, y notas importantes. " +
					"Sé específico con cantidades, fechas y detalles de aceite (soya/palma). " +
					"Escribe en español, estilo directo, sin bullets.",
			},
			{
				role: "user",
				content:
					`Consolida estas ${entradas.length} notas del cliente "${nombreCliente}":\n\n` +
					listaEntradas,
			},
		],
	});

	return response.choices[0]?.message?.content?.trim() ?? listaEntradas;
}

/**
 * Consolida las entradas de memoria de UN cliente específico.
 * Retorna true si hubo consolidación, false si no había suficientes entradas.
 */
async function consolidarCliente(
	vendedorId: bigint,
	clienteId: bigint | null,
	nombreCliente: string,
): Promise<boolean> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_CONSOLIDATE);

	// Buscar entradas antiguas NO consolidadas (excluir los resúmenes previos)
	// Dos queries separadas para evitar condicional IS NULL vs = en template literals
	const entradas =
		clienteId !== null
			? await prisma.$queryRaw<EntradaMemoria[]>`
        SELECT id, tipo, contenido, created_at
        FROM context_memory
        WHERE vendedor_id = ${vendedorId}
          AND cliente_id = ${clienteId}
          AND consolidado = false
          AND tipo != 'resumen'
          AND created_at < ${cutoffDate}
        ORDER BY created_at ASC
      `
			: await prisma.$queryRaw<EntradaMemoria[]>`
        SELECT id, tipo, contenido, created_at
        FROM context_memory
        WHERE vendedor_id = ${vendedorId}
          AND cliente_id IS NULL
          AND consolidado = false
          AND tipo != 'resumen'
          AND created_at < ${cutoffDate}
        ORDER BY created_at ASC
      `;

	if (entradas.length < ENTRIES_THRESHOLD) return false;

	console.log(
		`[memory-consolidator] Consolidando ${entradas.length} entradas ` +
			`para "${nombreCliente}" (vendedor=${vendedorId})`,
	);

	// Generar resumen con GPT-4o-mini
	const resumen = await generarResumen(nombreCliente, entradas);

	// Guardar el resumen como nueva entrada
	const nuevaEntrada = await prisma.$queryRaw<Array<{ id: bigint }>>`
    INSERT INTO context_memory (
      vendedor_id, cliente_id, tipo, contenido,
      metadata, created_at, updated_at
    ) VALUES (
      ${vendedorId},
      ${clienteId},
      'resumen',
      ${resumen},
      ${JSON.stringify({
				consolidado_desde: entradas.length,
				fecha_inicio: entradas[0]?.created_at?.toISOString(),
				fecha_fin: entradas[entradas.length - 1]?.created_at?.toISOString(),
			})}::jsonb,
      NOW(), NOW()
    )
    RETURNING id
  `;

	const nuevoId = nuevaEntrada[0]?.id;

	// Generar embedding del resumen en background
	if (nuevoId) {
		setImmediate(async () => {
			try {
				const embedding = await generateEmbedding(resumen);
				await prisma.$queryRaw`
          UPDATE context_memory
          SET embedding = ${formatVectorForPostgres(embedding)}::vector
          WHERE id = ${nuevoId}
        `;
			} catch {
				// Silencioso — el resumen ya fue guardado
			}
		});
	}

	// Marcar entradas originales como consolidadas
	const ids = entradas.map((e) => e.id);
	await prisma.$executeRaw`
    UPDATE context_memory
    SET consolidado = true
    WHERE id = ANY(${ids}::bigint[])
  `;

	console.log(
		`[memory-consolidator] ✅ ${entradas.length} entradas → 1 resumen para "${nombreCliente}"`,
	);

	return true;
}

/**
 * Ciclo completo de consolidación para TODOS los vendedores.
 * Agrupa por vendedor+cliente y consolida donde haya suficientes entradas.
 */
async function runConsolidationCycle(): Promise<void> {
	try {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_CONSOLIDATE);

		// Encontrar grupos (vendedor+cliente) que necesitan consolidación
		const grupos = await prisma.$queryRaw<
			Array<{
				vendedor_id: bigint;
				cliente_id: bigint | null;
				nombre_cliente: string;
				total_entradas: number;
			}>
		>`
      SELECT
        cm.vendedor_id,
        cm.cliente_id,
        COALESCE(c.nombre, 'Contexto General') AS nombre_cliente,
        COUNT(cm.id)::int                       AS total_entradas
      FROM context_memory cm
      LEFT JOIN clientes c ON c.id = cm.cliente_id
      WHERE cm.consolidado = false
        AND cm.tipo != 'resumen'
        AND cm.created_at < ${cutoffDate}
      GROUP BY cm.vendedor_id, cm.cliente_id, c.nombre
      HAVING COUNT(cm.id) >= ${ENTRIES_THRESHOLD}
      ORDER BY total_entradas DESC
    `;

		if (grupos.length === 0) return;

		console.log(
			`[memory-consolidator] ${grupos.length} grupo(s) pendientes de consolidación`,
		);

		for (const grupo of grupos) {
			await consolidarCliente(
				grupo.vendedor_id,
				grupo.cliente_id,
				grupo.nombre_cliente,
			);
			// Pausa entre clientes para no saturar la API de OpenAI
			await new Promise((r) => setTimeout(r, 500));
		}
	} catch (err) {
		console.error("[memory-consolidator] Error en ciclo:", err);
		// No propagar — el error no debe matar el proceso
	}
}

/**
 * Inicia el servicio de consolidación automática.
 * Llama a esto una sola vez al arrancar el servidor.
 */
export function startMemoryConsolidator(): void {
	if (!config.OPENAI_API_KEY) {
		console.warn(
			"[memory-consolidator] OPENAI_API_KEY no configurada — consolidación deshabilitada",
		);
		return;
	}

	// Primera ejecución al arrancar (después de 5 min para no sobrecargar el cold start)
	_consolidationTimeout = setTimeout(
		() => {
			_consolidationTimeout = null;
			runConsolidationCycle();
		},
		5 * 60 * 1000,
	);

	// Luego cada hora
	_consolidationInterval = setInterval(
		runConsolidationCycle,
		CONSOLIDATION_INTERVAL_MS,
	);

	console.log(
		"[memory-consolidator] ✅ Iniciado — primera consolidación en 5 min, luego cada hora",
	);
}

export function stopMemoryConsolidator(): void {
	if (_consolidationTimeout) {
		clearTimeout(_consolidationTimeout);
		_consolidationTimeout = null;
	}
	if (_consolidationInterval) {
		clearInterval(_consolidationInterval);
		_consolidationInterval = null;
	}
	console.log("[memory-consolidator] Consolidación detenida");
}

/**
 * Fuerza una consolidación inmediata (para invocar desde el agente o CLI).
 */
export async function forceConsolidation(): Promise<{
	grupos: number;
	consolidados: number;
}> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - DAYS_BEFORE_CONSOLIDATE);

	const grupos = await prisma.$queryRaw<
		Array<{
			vendedor_id: bigint;
			cliente_id: bigint | null;
			nombre_cliente: string;
			total_entradas: number;
		}>
	>`
    SELECT
      cm.vendedor_id,
      cm.cliente_id,
      COALESCE(c.nombre, 'Contexto General') AS nombre_cliente,
      COUNT(cm.id)::int AS total_entradas
    FROM context_memory cm
    LEFT JOIN clientes c ON c.id = cm.cliente_id
    WHERE cm.consolidado = false
      AND cm.tipo != 'resumen'
      AND cm.created_at < ${cutoffDate}
    GROUP BY cm.vendedor_id, cm.cliente_id, c.nombre
    HAVING COUNT(cm.id) >= ${ENTRIES_THRESHOLD}
  `;

	let consolidados = 0;
	for (const g of grupos) {
		const ok = await consolidarCliente(
			g.vendedor_id,
			g.cliente_id,
			g.nombre_cliente,
		);
		if (ok) consolidados++;
		await new Promise((r) => setTimeout(r, 500));
	}

	return { grupos: grupos.length, consolidados };
}
