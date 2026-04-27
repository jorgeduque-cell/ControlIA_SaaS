import { createTool } from "@voltagent/core";
import { z } from "zod";
import { formatearPrecio } from "../../config/oil-products.js";
import { prisma } from "../../db/client.js";

function isEntrada(tipo: string): boolean {
	const t = tipo.toLowerCase();
	return ["ingreso", "venta", "entrada", "cobro", "abono", "recaudo"].some(
		(k) => t.includes(k),
	);
}

function isSalida(tipo: string): boolean {
	const t = tipo.toLowerCase();
	return ["gasto", "compra", "salida", "pago", "egreso", "retiro"].some((k) =>
		t.includes(k),
	);
}

export const cashFlowTool = createTool({
	name: "analyze_cash_flow",
	description:
		"Analizar flujo de caja (entradas y salidas) con proyecciones de liquidez.",
	tags: ["finance", "cashflow", "liquidity"],

	parameters: z.object({
		dias: z.number().min(7).max(90).default(30),
		incluirProyeccion: z.boolean().default(true),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);
		const { dias, incluirProyeccion } = params;

		const desde = new Date();
		desde.setDate(desde.getDate() - dias);

		// Registros de finanzas en el período
		const finanzas = await prisma.finanzas.findMany({
			where: {
				vendedor_id: vendedorId,
				fecha: { gte: desde },
			},
		});

		const entradasFinanzas = finanzas
			.filter((f) => isEntrada(f.tipo))
			.reduce((s, f) => s + f.monto, 0);
		const salidasFinanzas = finanzas
			.filter((f) => isSalida(f.tipo))
			.reduce((s, f) => s + f.monto, 0);

		// Pedidos pagados en el período (ventas al contado / cobros)
		const pedidosPagados = await prisma.pedidos.aggregate({
			where: {
				vendedor_id: vendedorId,
				estado_pago: "Pagado",
				fecha: { gte: desde },
				precio_venta: { not: null },
			},
			_sum: { precio_venta: true },
		});
		const ventasContado = (pedidosPagados._sum.precio_venta || 0) as number;

		// Costo de mercancía vendida (aproximación)
		const pedidosCosto = await prisma.pedidos.aggregate({
			where: {
				vendedor_id: vendedorId,
				estado_pago: "Pagado",
				fecha: { gte: desde },
				precio_compra: { not: null },
			},
			_sum: { precio_compra: true },
		});
		const costoMercancia = (pedidosCosto._sum.precio_compra || 0) as number;

		const entradas = {
			finanzas: entradasFinanzas,
			ventasContado,
			total: entradasFinanzas + ventasContado,
		};

		const salidas = {
			finanzas: salidasFinanzas,
			costoMercancia,
			total: salidasFinanzas + costoMercancia,
		};

		const flujoNeto = entradas.total - salidas.total;

		// Saldo inicial = saldo hace N días (aproximado como saldo actual menos flujo neto)
		const saldoActualAgg = await prisma.finanzas.aggregate({
			where: { vendedor_id: vendedorId },
			_sum: { monto: true },
		});
		// Nota: este aggregate simple no diferencia entradas/salidas por signo;
		// asumimos que el usuario registra salidas como montos positivos con tipo 'gasto'.
		// Calculamos saldo actual como entradas totales históricas - salidas totales históricas.
		const todasFinanzas = await prisma.finanzas.findMany({
			where: { vendedor_id: vendedorId },
			select: { tipo: true, monto: true },
		});
		const totalEntradasHist = todasFinanzas
			.filter((f) => isEntrada(f.tipo))
			.reduce((s, f) => s + f.monto, 0);
		const totalSalidasHist = todasFinanzas
			.filter((f) => isSalida(f.tipo))
			.reduce((s, f) => s + f.monto, 0);
		const saldoActual = totalEntradasHist - totalSalidasHist;
		const saldoInicial = saldoActual - flujoNeto;
		const saldoFinal = saldoActual;

		let report = `💵 **FLUJO DE CAJA**\n`;
		report += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
		report += `Período: Últimos ${dias} días\n\n`;

		report += `📥 **ENTRADAS**\n`;
		report += `  Ventas al contado:  ${formatearPrecio(entradas.ventasContado)}\n`;
		report += `  Otros ingresos:     ${formatearPrecio(entradas.finanzas)}\n`;
		report += `  **Total Entradas:   ${formatearPrecio(entradas.total)}**\n\n`;

		report += `📤 **SALIDAS**\n`;
		report += `  Costo mercancía:    ${formatearPrecio(salidas.costoMercancia)}\n`;
		report += `  Otros egresos:      ${formatearPrecio(salidas.finanzas)}\n`;
		report += `  **Total Salidas:    ${formatearPrecio(salidas.total)}**\n\n`;

		report += `💰 **SALDOS**\n`;
		report += `  Saldo inicial:      ${formatearPrecio(saldoInicial)}\n`;
		report += `  Flujo neto:         ${formatearPrecio(flujoNeto)}\n`;
		report += `  **Saldo final:      ${formatearPrecio(saldoFinal)}**\n\n`;

		// Alerta de liquidez
		if (saldoFinal < 1000000) {
			report += `🔴 **ALERTA:** Saldo bajo (< $1M)\n`;
		} else if (saldoFinal < 2000000) {
			report += `⚠️ **Atención:** Liquidez ajustada\n`;
		} else {
			report += `✅ **Liquidez saludable**\n`;
		}

		if (incluirProyeccion && dias > 0) {
			const proyeccion7dias = saldoFinal + (flujoNeto / dias) * 7;
			const proyeccion30dias = saldoFinal + (flujoNeto / dias) * 30;

			report += `\n📈 **PROYECCIONES**\n`;
			report += `  7 días:  ${formatearPrecio(proyeccion7dias)}\n`;
			report += `  30 días: ${formatearPrecio(proyeccion30dias)}\n`;
		}

		return {
			success: true,
			report,
			data: { entradas, salidas, flujoNeto, saldoInicial, saldoFinal },
		};
	},
});
