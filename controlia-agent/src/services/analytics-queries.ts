/**
 * Consultas analíticas read-only para reportes ejecutivos.
 *
 * Cada función es idempotente, multi-tenant (filtrada por vendedor_id) y
 * devuelve números serializables (Number, no BigInt).
 */

import { prisma } from "../db/client.js";

export type RangoFechas = {
	desde: Date;
	hasta: Date;
};

/** Por defecto: mes en curso. */
export function rangoMesActual(): RangoFechas {
	const now = new Date();
	const desde = new Date(now.getFullYear(), now.getMonth(), 1);
	const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
	return { desde, hasta };
}

// ── Estado de Resultados (P&G) ─────────────────────────────────────────────
export type EstadoResultados = {
	ingresos: number;
	costoVentas: number;
	utilidadBruta: number;
	margenBrutoPct: number;
	gastosOperativos: number;
	utilidadNeta: number;
	margenNetoPct: number;
	pedidosCount: number;
	desde: string;
	hasta: string;
};

export async function estadoResultados(
	vendedorId: bigint,
	rango: RangoFechas = rangoMesActual(),
): Promise<EstadoResultados> {
	const pedidos = await prisma.pedidos.findMany({
		where: {
			vendedor_id: vendedorId,
			fecha: { gte: rango.desde, lte: rango.hasta },
			estado: { in: ["Remisionado", "Entregado", "Pagado"] },
		},
		select: {
			cantidad: true,
			precio_venta: true,
			precio_compra: true,
		},
	});

	const ingresos = pedidos.reduce(
		(s, p) => s + (p.precio_venta ?? 0) * p.cantidad,
		0,
	);
	const costoVentas = pedidos.reduce(
		(s, p) => s + (p.precio_compra ?? 0) * p.cantidad,
		0,
	);
	const utilidadBruta = ingresos - costoVentas;

	const gastos = await prisma.finanzas.findMany({
		where: {
			vendedor_id: vendedorId,
			fecha: { gte: rango.desde, lte: rango.hasta },
			tipo: { in: ["egreso", "EGRESO", "gasto", "GASTO"] },
		},
		select: { monto: true },
	});
	const gastosOperativos = gastos.reduce((s, g) => s + g.monto, 0);
	const utilidadNeta = utilidadBruta - gastosOperativos;

	return {
		ingresos: round2(ingresos),
		costoVentas: round2(costoVentas),
		utilidadBruta: round2(utilidadBruta),
		margenBrutoPct:
			ingresos > 0 ? round2((utilidadBruta / ingresos) * 100) : 0,
		gastosOperativos: round2(gastosOperativos),
		utilidadNeta: round2(utilidadNeta),
		margenNetoPct: ingresos > 0 ? round2((utilidadNeta / ingresos) * 100) : 0,
		pedidosCount: pedidos.length,
		desde: rango.desde.toISOString().slice(0, 10),
		hasta: rango.hasta.toISOString().slice(0, 10),
	};
}

// ── Aging de cuentas por cobrar ────────────────────────────────────────────
export type AgingBucket = {
	rango: string;
	cantidad: number;
	total: number;
};

export type AgingCxC = {
	buckets: AgingBucket[];
	totalPendiente: number;
	totalVencido: number;
	cuentasActivas: number;
};

export async function agingCxC(vendedorId: bigint): Promise<AgingCxC> {
	const cuentas = await prisma.cuentas_por_cobrar.findMany({
		where: {
			vendedor_id: vendedorId,
			estado: { in: ["PENDIENTE", "PARCIAL", "VENCIDO"] },
		},
		select: {
			monto_pendiente: true,
			fecha_vencimiento: true,
		},
	});

	const hoy = new Date();
	const buckets: Record<string, AgingBucket> = {
		"Al día": { rango: "Al día", cantidad: 0, total: 0 },
		"1-30 días": { rango: "1-30 días", cantidad: 0, total: 0 },
		"31-60 días": { rango: "31-60 días", cantidad: 0, total: 0 },
		"61-90 días": { rango: "61-90 días", cantidad: 0, total: 0 },
		"+90 días": { rango: "+90 días", cantidad: 0, total: 0 },
	};

	let totalVencido = 0;
	let totalPendiente = 0;

	for (const c of cuentas) {
		const diasVencido = Math.floor(
			(hoy.getTime() - c.fecha_vencimiento.getTime()) / 86_400_000,
		);
		totalPendiente += c.monto_pendiente;

		let key: string;
		if (diasVencido <= 0) key = "Al día";
		else if (diasVencido <= 30) key = "1-30 días";
		else if (diasVencido <= 60) key = "31-60 días";
		else if (diasVencido <= 90) key = "61-90 días";
		else key = "+90 días";

		buckets[key].cantidad += 1;
		buckets[key].total += c.monto_pendiente;
		if (diasVencido > 0) totalVencido += c.monto_pendiente;
	}

	return {
		buckets: Object.values(buckets).map((b) => ({ ...b, total: round2(b.total) })),
		totalPendiente: round2(totalPendiente),
		totalVencido: round2(totalVencido),
		cuentasActivas: cuentas.length,
	};
}

// ── Inventario valorizado ─────────────────────────────────────────────────
export type InventarioValorizado = {
	items: Array<{
		sku: string | null;
		nombre: string;
		stock: number;
		precioCompra: number;
		valorCompra: number;
		precioVenta: number;
		valorVenta: number;
	}>;
	totalValorCompra: number;
	totalValorVenta: number;
	margenPotencial: number;
};

export async function inventarioValorizado(
	vendedorId: bigint,
): Promise<InventarioValorizado> {
	const productos = await prisma.productos.findMany({
		where: { vendedor_id: vendedorId },
		select: {
			nombre: true,
			stock_actual: true,
			precio_compra: true,
			precio_venta: true,
		},
	});

	const items = productos.map((p) => {
		const stock = p.stock_actual ?? 0;
		const precioCompra = p.precio_compra ?? 0;
		const precioVenta = p.precio_venta ?? 0;
		return {
			sku: null as string | null,
			nombre: p.nombre,
			stock,
			precioCompra,
			valorCompra: round2(stock * precioCompra),
			precioVenta,
			valorVenta: round2(stock * precioVenta),
		};
	});

	const totalValorCompra = items.reduce((s, i) => s + i.valorCompra, 0);
	const totalValorVenta = items.reduce((s, i) => s + i.valorVenta, 0);

	return {
		items,
		totalValorCompra: round2(totalValorCompra),
		totalValorVenta: round2(totalValorVenta),
		margenPotencial: round2(totalValorVenta - totalValorCompra),
	};
}

// ── Top productos por ingresos ────────────────────────────────────────────
export type TopProducto = {
	producto: string;
	cantidadVendida: number;
	ingresos: number;
	pedidos: number;
};

export async function topProductos(
	vendedorId: bigint,
	rango: RangoFechas = rangoMesActual(),
	limit: number = 10,
): Promise<TopProducto[]> {
	const pedidos = await prisma.pedidos.findMany({
		where: {
			vendedor_id: vendedorId,
			fecha: { gte: rango.desde, lte: rango.hasta },
			estado: { in: ["Remisionado", "Entregado", "Pagado"] },
		},
		select: { producto: true, cantidad: true, precio_venta: true },
	});

	const agg = new Map<string, TopProducto>();
	for (const p of pedidos) {
		const current = agg.get(p.producto) ?? {
			producto: p.producto,
			cantidadVendida: 0,
			ingresos: 0,
			pedidos: 0,
		};
		current.cantidadVendida += p.cantidad;
		current.ingresos += (p.precio_venta ?? 0) * p.cantidad;
		current.pedidos += 1;
		agg.set(p.producto, current);
	}

	return Array.from(agg.values())
		.map((t) => ({ ...t, ingresos: round2(t.ingresos) }))
		.sort((a, b) => b.ingresos - a.ingresos)
		.slice(0, limit);
}

// ── Flujo de caja (ingresos vs egresos por día) ───────────────────────────
export type FlujoCajaDia = {
	fecha: string;
	ingresos: number;
	egresos: number;
	neto: number;
};

export async function flujoCaja(
	vendedorId: bigint,
	rango: RangoFechas = rangoMesActual(),
): Promise<FlujoCajaDia[]> {
	const movimientos = await prisma.finanzas.findMany({
		where: {
			vendedor_id: vendedorId,
			fecha: { gte: rango.desde, lte: rango.hasta },
		},
		select: { tipo: true, monto: true, fecha: true },
	});

	const byDay = new Map<string, FlujoCajaDia>();
	for (const m of movimientos) {
		if (!m.fecha) continue;
		const key = m.fecha.toISOString().slice(0, 10);
		const row = byDay.get(key) ?? {
			fecha: key,
			ingresos: 0,
			egresos: 0,
			neto: 0,
		};
		const low = (m.tipo || "").toLowerCase();
		if (low.includes("ingreso") || low.includes("venta")) {
			row.ingresos += m.monto;
		} else {
			row.egresos += m.monto;
		}
		row.neto = row.ingresos - row.egresos;
		byDay.set(key, row);
	}

	return Array.from(byDay.values())
		.map((r) => ({
			fecha: r.fecha,
			ingresos: round2(r.ingresos),
			egresos: round2(r.egresos),
			neto: round2(r.neto),
		}))
		.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Comparativo de ventas: mes actual vs mes anterior ─────────────────────
export type ComparativoVentas = {
	actual: { desde: string; hasta: string; ingresos: number; pedidos: number };
	anterior: {
		desde: string;
		hasta: string;
		ingresos: number;
		pedidos: number;
	};
	variacionPct: number;
};

export async function comparativoVentas(
	vendedorId: bigint,
): Promise<ComparativoVentas> {
	const actual = rangoMesActual();
	const anteriorDesde = new Date(
		actual.desde.getFullYear(),
		actual.desde.getMonth() - 1,
		1,
	);
	const anteriorHasta = new Date(
		actual.desde.getFullYear(),
		actual.desde.getMonth(),
		0,
		23,
		59,
		59,
	);

	const [resActual, resAnterior] = await Promise.all([
		sumVentas(vendedorId, actual.desde, actual.hasta),
		sumVentas(vendedorId, anteriorDesde, anteriorHasta),
	]);

	const variacionPct =
		resAnterior.ingresos > 0
			? round2(
					((resActual.ingresos - resAnterior.ingresos) / resAnterior.ingresos) *
						100,
				)
			: resActual.ingresos > 0
				? 100
				: 0;

	return {
		actual: {
			desde: actual.desde.toISOString().slice(0, 10),
			hasta: actual.hasta.toISOString().slice(0, 10),
			...resActual,
		},
		anterior: {
			desde: anteriorDesde.toISOString().slice(0, 10),
			hasta: anteriorHasta.toISOString().slice(0, 10),
			...resAnterior,
		},
		variacionPct,
	};
}

async function sumVentas(
	vendedorId: bigint,
	desde: Date,
	hasta: Date,
): Promise<{ ingresos: number; pedidos: number }> {
	const rows = await prisma.pedidos.findMany({
		where: {
			vendedor_id: vendedorId,
			fecha: { gte: desde, lte: hasta },
			estado: { in: ["Remisionado", "Entregado", "Pagado"] },
		},
		select: { cantidad: true, precio_venta: true },
	});
	const ingresos = rows.reduce(
		(s, r) => s + (r.precio_venta ?? 0) * r.cantidad,
		0,
	);
	return { ingresos: round2(ingresos), pedidos: rows.length };
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
