import { createTool } from "@voltagent/core";
import { z } from "zod";
import { formatearPrecio } from "../../config/oil-products.js";

export const profitabilityAnalysisTool = createTool({
	name: "analyze_profitability",
	description:
		"Analizar rentabilidad por producto, cliente y calcular punto de equilibrio.",
	tags: ["finance", "profitability", "break-even"],

	parameters: z.object({
		analisis: z.enum(["producto", "cliente", "general"]).default("general"),
	}),

	execute: async (params) => {
		const { analisis } = params;

		// Datos con margen del 8%
		const productos = [
			{
				sku: "RIOSOL-20L",
				nombre: "Riosol 20L",
				unidades: 120,
				costo: 122500,
				venta: 132300,
				margen: 8,
			},
			{
				sku: "RIOSOL-18L",
				nombre: "Riosol 18L",
				unidades: 85,
				costo: 110000,
				venta: 118800,
				margen: 8,
			},
			{
				sku: "RIOSOL-5L",
				nombre: "Riosol 5L",
				unidades: 200,
				costo: 32000,
				venta: 34560,
				margen: 8,
			},
			{
				sku: "RIOSOL-3L",
				nombre: "Riosol 3L",
				unidades: 150,
				costo: 19500,
				venta: 21060,
				margen: 8,
			},
			{
				sku: "RIOSOL-2L",
				nombre: "Riosol 2L",
				unidades: 180,
				costo: 13500,
				venta: 14580,
				margen: 8,
			},
			{
				sku: "RIOSOL-900ML",
				nombre: "Riosol 900ml",
				unidades: 300,
				costo: 6200,
				venta: 6696,
				margen: 8,
			},
			{
				sku: "OLEOSOB-PALMA-15KG",
				nombre: "Oleosoberano 15kg",
				unidades: 95,
				costo: 98000,
				venta: 105840,
				margen: 8,
			},
		];

		const gastosFijos = 2500000; // Mensual

		let report = `📈 **ANÁLISIS DE RENTABILIDAD**\n`;
		report += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

		if (analisis === "producto" || analisis === "general") {
			report += `🏷️ **POR PRODUCTO** (Margen objetivo: 8%)\n\n`;

			const productosRanking = productos
				.map((p) => ({
					...p,
					utilidadUnidad: p.venta - p.costo,
					utilidadTotal: (p.venta - p.costo) * p.unidades,
				}))
				.sort((a, b) => b.utilidadTotal - a.utilidadTotal);

			productosRanking.forEach((p, i) => {
				const emoji = i < 3 ? "🥇" : "  ";
				report += `${emoji} ${p.nombre}\n`;
				report += `   Margen/unidad: ${formatearPrecio(p.utilidadUnidad)}\n`;
				report += `   Utilidad total: ${formatearPrecio(p.utilidadTotal)}\n`;
				report += `   Unidades vendidas: ${p.unidades}\n\n`;
			});
		}

		const totalUtilidad = productos.reduce(
			(sum, p) => sum + (p.venta - p.costo) * p.unidades,
			0,
		);
		const totalVentas = productos.reduce(
			(sum, p) => sum + p.venta * p.unidades,
			0,
		);

		report += `📊 **RESUMEN**\n`;
		report += `  Total ventas:     ${formatearPrecio(totalVentas)}\n`;
		report += `  Utilidad bruta:   ${formatearPrecio(totalUtilidad)}\n`;
		report += `  Gastos fijos:     ${formatearPrecio(gastosFijos)}\n`;
		report += `  **Utilidad neta:  ${formatearPrecio(totalUtilidad - gastosFijos)}**\n\n`;

		// Punto de equilibrio
		const margenContribucion = totalUtilidad / totalVentas;
		const puntoEquilibrio = gastosFijos / margenContribucion;

		report += `⚖️ **PUNTO DE EQUILIBRIO**\n`;
		report += `  Ventas necesarias: ${formatearPrecio(puntoEquilibrio)}\n`;
		report += `  Margen contribución: ${(margenContribucion * 100).toFixed(1)}%\n`;

		const exceso = totalVentas - puntoEquilibrio;
		if (exceso > 0) {
			report += `  ✅ Estás ${formatearPrecio(exceso)} por encima del PE\n`;
		} else {
			report += `  🔴 Faltan ${formatearPrecio(Math.abs(exceso))} para alcanzar PE\n`;
		}

		return {
			success: true,
			report,
			data: {
				totalVentas,
				utilidadBruta: totalUtilidad,
				utilidadNeta: totalUtilidad - gastosFijos,
				margenPromedio: margenContribucion * 100,
				puntoEquilibrio,
				productoTop: "Riosol 20L",
			},
		};
	},
});
