/**
 * Servicio de numeración atómica por vendedor + tipo + año.
 *
 * Genera consecutivos monotónicos (COT-2026-0001, REM-2026-0001…)
 * usando una transacción con upsert para evitar race conditions.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

export type ConsecutivoTipo =
	| "COT" // Cotización
	| "REM" // Remisión (pedido confirmado)
	| "OC" // Orden de compra
	| "AJ" // Ajuste de inventario
	| "CLI" // Cliente
	| "PRV" // Proveedor
	| "PRD"; // Producto

type PrismaLike = Prisma.TransactionClient | typeof prisma;

/**
 * Obtiene el siguiente número consecutivo de forma atómica.
 * Devuelve { numero, codigo } → p.ej. { numero: 7, codigo: "COT-2026-0007" }
 *
 * Si se pasa un `tx` (transacción activa), el increment participa en ella.
 */
export async function siguienteConsecutivo(
	vendedorId: bigint,
	tipo: ConsecutivoTipo,
	anio: number = new Date().getFullYear(),
	tx?: Prisma.TransactionClient,
): Promise<{ numero: number; codigo: string }> {
	const runner: PrismaLike = tx ?? prisma;

	const row = await runner.consecutivos.upsert({
		where: {
			vendedor_id_tipo_anio: {
				vendedor_id: vendedorId,
				tipo,
				anio,
			},
		},
		create: {
			vendedor_id: vendedorId,
			tipo,
			anio,
			ultimo_numero: 1,
		},
		update: {
			ultimo_numero: { increment: 1 },
		},
	});

	const padded = String(row.ultimo_numero).padStart(4, "0");
	return {
		numero: row.ultimo_numero,
		codigo: `${tipo}-${anio}-${padded}`,
	};
}

/**
 * Lee el último número sin incrementarlo (útil para previews).
 */
export async function ultimoConsecutivo(
	vendedorId: bigint,
	tipo: ConsecutivoTipo,
	anio: number = new Date().getFullYear(),
): Promise<number> {
	const row = await prisma.consecutivos.findUnique({
		where: {
			vendedor_id_tipo_anio: {
				vendedor_id: vendedorId,
				tipo,
				anio,
			},
		},
	});
	return row?.ultimo_numero ?? 0;
}
