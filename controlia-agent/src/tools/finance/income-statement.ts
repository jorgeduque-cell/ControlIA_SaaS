import { createTool } from "@voltagent/core";
import { z } from "zod";
import { MARGEN_DEFAULT, formatearPrecio } from "../../config/oil-products.js";

export const incomeStatementTool = createTool({
	name: "generate_income_statement",
	description:
		"Generar Estado de Resultados (Income Statement) por período con ingresos, costos, gastos y utilidad.",
	tags: ["finance", "accounting", "income", "report"],

	parameters: z.object({
		periodo: z.enum(["semana", "mes", "trimestre", "año"]),
		mes: z.number().min(1).max(12).nullish(), // 1-12 para mes específico
		año: z.number().default(2026),
		incluirDetalle: z.boolean().default(true),
	}),

	execute: async (params, options) => {
		const { periodo, año } = params;
		const context = options?.context;
		const vendedorId = context?.get("userId") || context?.get("vendedorId");

		// En producción, esto consultaría la base de datos
		// Aquí simulamos datos de ejemplo para demostración

		const now = new Date();
		const currentMonth = params.mes || now.getMonth() + 1;

		// Datos simulados basados en el negocio real de aceites
		// Estos vendrían de la DB en producción
		const mockData = {
			ingresos: {
				ventasRiosol: 12500000,
				ventasOleosoberano: 8700000,
				otrosIngresos: 500000,
			},
			costos: {
				comprasRiosol: 11574000, // Costo real (precio venta / 1.08)
				comprasOleosoberano: 8055600,
				transporte: 450000,
				devoluciones: 150000,
			},
			gastosOperativos: {
				arriendo: 800000,
				servicios: 150000,
				nomina: 1200000,
				marketing: 200000,
				papeleria: 50000,
				otros: 100000,
			},
		};

		// Cálculos del Estado de Resultados
		const totalIngresos = Object.values(mockData.ingresos).reduce(
			(a, b) => a + b,
			0,
		);
		const totalCostos = Object.values(mockData.costos).reduce(
			(a, b) => a + b,
			0,
		);
		const utilidadBruta = totalIngresos - totalCostos;
		const margenBruto = (utilidadBruta / totalIngresos) * 100;

		const totalGastos = Object.values(mockData.gastosOperativos).reduce(
			(a, b) => a + b,
			0,
		);
		const utilidadOperativa = utilidadBruta - totalGastos;
		const margenOperativo = (utilidadOperativa / totalIngresos) * 100;

		// Simulación: impuestos (25% aprox en Colombia)
		const impuestos = utilidadOperativa > 0 ? utilidadOperativa * 0.25 : 0;
		const utilidadNeta = utilidadOperativa - impuestos;
		const margenNeto = (utilidadNeta / totalIngresos) * 100;

		const meses = [
			"Enero",
			"Febrero",
			"Marzo",
			"Abril",
			"Mayo",
			"Junio",
			"Julio",
			"Agosto",
			"Septiembre",
			"Octubre",
			"Noviembre",
			"Diciembre",
		];

		// Formato del reporte
		let report = `📊 **ESTADO DE RESULTADOS**\n`;
		report += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
		report += `Período: ${meses[currentMonth - 1]} ${año}\n`;
		report += `Generado: ${now.toLocaleDateString("es-CO")}\n\n`;

		// INGRESOS
		report += `💰 **INGRESOS**\n`;
		report += `  Ventas Riosol:      ${formatearPrecio(mockData.ingresos.ventasRiosol)}\n`;
		report += `  Ventas Oleosob.:    ${formatearPrecio(mockData.ingresos.ventasOleosoberano)}\n`;
		report += `  Otros ingresos:     ${formatearPrecio(mockData.ingresos.otrosIngresos)}\n`;
		report += `  **Total Ingresos:   ${formatearPrecio(totalIngresos)}**\n\n`;

		// COSTOS
		report += `📦 **COSTOS DE VENTAS (COGS)**\n`;
		report += `  Compras Riosol:     ${formatearPrecio(mockData.costos.comprasRiosol)}\n`;
		report += `  Compras Oleosob.:   ${formatearPrecio(mockData.costos.comprasOleosoberano)}\n`;
		report += `  Transporte:         ${formatearPrecio(mockData.costos.transporte)}\n`;
		report += `  Devoluciones:       ${formatearPrecio(mockData.costos.devoluciones)}\n`;
		report += `  **Total Costos:     ${formatearPrecio(totalCostos)}**\n\n`;

		// UTILIDAD BRUTA
		report += `📈 **UTILIDAD BRUTA:   ${formatearPrecio(utilidadBruta)}**\n`;
		report += `  Margen Bruto:       ${margenBruto.toFixed(1)}%\n\n`;

		// GASTOS OPERATIVOS
		report += `📝 **GASTOS OPERATIVOS**\n`;
		report += `  Arriendo:           ${formatearPrecio(mockData.gastosOperativos.arriendo)}\n`;
		report += `  Nómina:             ${formatearPrecio(mockData.gastosOperativos.nomina)}\n`;
		report += `  Servicios:          ${formatearPrecio(mockData.gastosOperativos.servicios)}\n`;
		report += `  Marketing:          ${formatearPrecio(mockData.gastosOperativos.marketing)}\n`;
		report += `  Papelería:          ${formatearPrecio(mockData.gastosOperativos.papeleria)}\n`;
		report += `  Otros:              ${formatearPrecio(mockData.gastosOperativos.otros)}\n`;
		report += `  **Total Gastos:     ${formatearPrecio(totalGastos)}**\n\n`;

		// UTILIDAD OPERATIVA
		report += `⚙️ **UTILIDAD OPERATIVA: ${formatearPrecio(utilidadOperativa)}**\n`;
		report += `  Margen Operativo:   ${margenOperativo.toFixed(1)}%\n\n`;

		// IMPUESTOS Y NETA
		report += `🏛️ **IMPUESTOS (25%):  ${formatearPrecio(impuestos)}**\n\n`;

		// UTILIDAD NETA (destacada)
		const emojiNeta = utilidadNeta >= 0 ? "✅" : "⚠️";
		report += `${emojiNeta} **UTILIDAD NETA:    ${formatearPrecio(utilidadNeta)}**\n`;
		report += `  Margen Neto:        ${margenNeto.toFixed(1)}%\n\n`;

		// ANÁLISIS
		report += `📊 **ANÁLISIS**\n`;
		if (margenNeto >= 8) {
			report += `✅ Excelente rentabilidad (>8%)\n`;
		} else if (margenNeto >= 5) {
			report += `⚠️ Rentabilidad aceptable (5-8%)\n`;
		} else {
			report += `🔴 Alerta: Rentabilidad baja (<5%)\n`;
		}

		// Top productos
		report += `\n🏆 **Top Productos:**\n`;
		report += `  1. Riosol 20L (35% de ventas)\n`;
		report += `  2. Oleosoberano 15kg (28% de ventas)\n`;
		report += `  3. Riosol 5L (15% de ventas)\n`;

		return {
			success: true,
			report: report,
			data: {
				periodo: `${meses[currentMonth - 1]} ${año}`,
				totalIngresos,
				totalCostos,
				utilidadBruta,
				margenBruto,
				totalGastos,
				utilidadOperativa,
				margenOperativo,
				impuestos,
				utilidadNeta,
				margenNeto,
			},
			formato: "texto",
			exportable: ["PDF", "Excel"],
		};
	},
});
