/**
 * Generación de gráficos PNG con Chart.js (offscreen canvas).
 *
 * Producto de estos helpers = ruta absoluta del PNG listo para enviarse por
 * Telegram (`bot.sendPhoto`). No devolvemos buffers porque el adapter ya sabe
 * leer de disco y porque así el log queda con una ruta trazable.
 *
 * Estilo visual: tema claro, paleta consistente con la marca ControlIA.
 * El ancho por defecto (1000×600) es el sweet-spot para Telegram móvil.
 */

import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";
import { buildDocPath } from "./file-system-service.js";
import type {
	AgingBucket,
	FlujoCajaDia,
	InventarioValorizado,
	TopProducto,
} from "./analytics-queries.js";

const WIDTH = 1000;
const HEIGHT = 600;

const PALETA = {
	primario: "#2563eb", // azul
	secundario: "#10b981", // verde
	alerta: "#f59e0b", // amarillo
	peligro: "#ef4444", // rojo
	neutro: "#6b7280", // gris
	fondo: "#ffffff",
};

const PALETA_SERIE = [
	"#2563eb",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#06b6d4",
	"#ec4899",
	"#84cc16",
	"#f97316",
	"#6366f1",
];

const canvas = new ChartJSNodeCanvas({
	width: WIDTH,
	height: HEIGHT,
	backgroundColour: PALETA.fondo,
	chartCallback: (ChartJS) => {
		ChartJS.defaults.font.family =
			"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
		ChartJS.defaults.font.size = 13;
		ChartJS.defaults.color = "#111827";
	},
});

async function render(
	config: ChartConfiguration,
	fileName: string,
): Promise<string> {
	const buffer = await canvas.renderToBuffer(config, "image/png");
	const outPath = buildDocPath("chart", fileName);
	const fs = await import("node:fs");
	fs.writeFileSync(outPath, buffer);
	return outPath;
}

function timestampTag(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ── 1. Aging CxC (doughnut) ────────────────────────────────────────────────

export async function renderAgingChart(
	vendedorId: bigint,
	buckets: AgingBucket[],
): Promise<string> {
	const labels = buckets.map((b) => b.rango);
	const totals = buckets.map((b) => b.total);
	const counts = buckets.map((b) => b.cantidad);

	const config: ChartConfiguration = {
		type: "doughnut",
		data: {
			labels,
			datasets: [
				{
					data: totals,
					backgroundColor: [
						PALETA.secundario,
						PALETA.alerta,
						"#f97316",
						PALETA.peligro,
						"#991b1b",
					],
					borderColor: "#ffffff",
					borderWidth: 2,
				},
			],
		},
		options: {
			plugins: {
				title: {
					display: true,
					text: "Aging de Cuentas por Cobrar",
					font: { size: 18, weight: "bold" },
					padding: { top: 10, bottom: 20 },
				},
				legend: {
					position: "right",
					labels: {
						generateLabels: (chart) => {
							const data = chart.data;
							return (data.labels ?? []).map((label, i) => {
								const monto = totals[i] ?? 0;
								const cantidad = counts[i] ?? 0;
								return {
									text: `${label}: $${monto.toLocaleString()} (${cantidad})`,
									fillStyle: (
										data.datasets[0].backgroundColor as string[]
									)[i],
									strokeStyle: "#ffffff",
									lineWidth: 2,
									index: i,
								};
							});
						},
					},
				},
			},
		},
	};

	return render(config, `aging-${vendedorId}-${timestampTag()}.png`);
}

// ── 2. Top productos (bar horizontal) ──────────────────────────────────────

export async function renderTopProductosChart(
	vendedorId: bigint,
	top: TopProducto[],
): Promise<string> {
	const labels = top.map((t) => t.producto);
	const ingresos = top.map((t) => t.ingresos);

	const config: ChartConfiguration = {
		type: "bar",
		data: {
			labels,
			datasets: [
				{
					label: "Ingresos",
					data: ingresos,
					backgroundColor: PALETA.primario,
					borderRadius: 4,
				},
			],
		},
		options: {
			indexAxis: "y",
			plugins: {
				title: {
					display: true,
					text: "Top Productos por Ingresos",
					font: { size: 18, weight: "bold" },
					padding: { top: 10, bottom: 20 },
				},
				legend: { display: false },
			},
			scales: {
				x: {
					ticks: {
						callback: (v) => `$${Number(v).toLocaleString()}`,
					},
					grid: { color: "#e5e7eb" },
				},
				y: { grid: { display: false } },
			},
		},
	};

	return render(config, `top-productos-${vendedorId}-${timestampTag()}.png`);
}

// ── 3. Flujo de caja diario (line) ─────────────────────────────────────────

export async function renderFlujoCajaChart(
	vendedorId: bigint,
	dias: FlujoCajaDia[],
): Promise<string> {
	const labels = dias.map((d) => d.fecha.slice(5)); // MM-DD
	const ingresos = dias.map((d) => d.ingresos);
	const egresos = dias.map((d) => d.egresos);
	const neto = dias.map((d) => d.neto);

	const config: ChartConfiguration = {
		type: "line",
		data: {
			labels,
			datasets: [
				{
					label: "Ingresos",
					data: ingresos,
					borderColor: PALETA.secundario,
					backgroundColor: "rgba(16, 185, 129, 0.1)",
					tension: 0.3,
					fill: true,
				},
				{
					label: "Egresos",
					data: egresos,
					borderColor: PALETA.peligro,
					backgroundColor: "rgba(239, 68, 68, 0.1)",
					tension: 0.3,
					fill: true,
				},
				{
					label: "Neto",
					data: neto,
					borderColor: PALETA.primario,
					borderDash: [6, 4],
					tension: 0.3,
					fill: false,
				},
			],
		},
		options: {
			plugins: {
				title: {
					display: true,
					text: "Flujo de Caja Diario",
					font: { size: 18, weight: "bold" },
					padding: { top: 10, bottom: 20 },
				},
				legend: { position: "bottom" },
			},
			scales: {
				y: {
					ticks: {
						callback: (v) => `$${Number(v).toLocaleString()}`,
					},
					grid: { color: "#e5e7eb" },
				},
				x: { grid: { display: false } },
			},
		},
	};

	return render(config, `flujo-caja-${vendedorId}-${timestampTag()}.png`);
}

// ── 4. Inventario valorizado top N (bar vertical) ─────────────────────────

export async function renderInventarioChart(
	vendedorId: bigint,
	data: InventarioValorizado,
	topN: number = 10,
): Promise<string> {
	const items = [...data.items]
		.sort((a, b) => b.valorVenta - a.valorVenta)
		.slice(0, topN);
	const labels = items.map((i) => i.nombre);
	const compra = items.map((i) => i.valorCompra);
	const venta = items.map((i) => i.valorVenta);

	const config: ChartConfiguration = {
		type: "bar",
		data: {
			labels,
			datasets: [
				{
					label: "Valor costo",
					data: compra,
					backgroundColor: PALETA.neutro,
					borderRadius: 4,
				},
				{
					label: "Valor venta",
					data: venta,
					backgroundColor: PALETA.primario,
					borderRadius: 4,
				},
			],
		},
		options: {
			plugins: {
				title: {
					display: true,
					text: `Inventario Valorizado — Top ${topN}`,
					font: { size: 18, weight: "bold" },
					padding: { top: 10, bottom: 20 },
				},
				legend: { position: "bottom" },
			},
			scales: {
				y: {
					ticks: {
						callback: (v) => `$${Number(v).toLocaleString()}`,
					},
					grid: { color: "#e5e7eb" },
				},
				x: { grid: { display: false }, ticks: { maxRotation: 30 } },
			},
		},
	};

	return render(config, `inventario-${vendedorId}-${timestampTag()}.png`);
}

export const _paletaSerie = PALETA_SERIE; // expuesto por si un tool necesita alinear colores
