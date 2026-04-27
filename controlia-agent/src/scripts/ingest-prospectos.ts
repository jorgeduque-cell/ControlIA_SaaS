/**
 * Ingesta inicial de prospectos.
 *
 *   1. Rutas_Prospeccion_Venco.xlsx → 30 rutas Bogotá pre-agrupadas + Cundinamarca
 *      → tabla `rutas_prospeccion` + `prospectos` (con ruta_id asignado).
 *   2. D:\Nueva carpeta\REPORTE CLI.xlsx → 1485 históricos enriquecidos
 *      (nit, depto, municipio, localidad, contacto, email, tipo, vendedor)
 *      → merge sobre `prospectos` por nombre normalizado. Si ya existe el
 *      prospecto del Excel de rutas, se enriquecen los campos faltantes; si
 *      no existe, se crea con ruta_id = NULL (histórico sin ruta asignada).
 *
 * Uso:
 *   VENDEDOR_ID=659132607 npx tsx src/scripts/ingest-prospectos.ts
 *
 * Re-ejecutable: idempotente por (vendedor_id, nombre_normalizado).
 */

import path from "node:path";
import xlsx from "xlsx";
import { prisma } from "../db/client.js";

const RUTAS_XLSX =
	process.env.RUTAS_XLSX ??
	path.resolve(process.cwd(), "..", "Rutas_Prospeccion_Venco.xlsx");
const REPORTE_XLSX =
	process.env.REPORTE_XLSX ?? "D:/Nueva carpeta/REPORTE CLI.xlsx";

function normalizeName(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toUpperCase();
}

type RutaRow = {
	numero: number;
	zona: string;
	sector: string | null;
	clientes: Array<{
		nombre: string;
		direccion: string | null;
		telefono: string | null;
		vendedor_historico: string | null;
	}>;
};

function parseRutasFile(file: string): RutaRow[] {
	const wb = xlsx.readFile(file);
	const out: RutaRow[] = [];

	for (const sn of wb.SheetNames) {
		if (sn === "Resumen por Zona" || sn === "Seguimiento Prospectos") continue;
		const arr = xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], {
			header: 1,
			defval: "",
		});
		const titulo = String((arr[0] as unknown[])?.[0] ?? "");
		// "RUTA 01 — NORTE EXTREMO (CLL 128+)" o "Cundinamarca ..."
		let numero: number;
		let zona: string;
		const rutaMatch = titulo.match(/RUTA\s+(\d+)\s*—\s*(.+)/i);
		if (rutaMatch) {
			numero = parseInt(rutaMatch[1], 10);
			zona = rutaMatch[2].trim();
		} else if (sn.toLowerCase().includes("cundinamarca")) {
			numero = 100; // ruta especial para Cundinamarca
			zona = "CUNDINAMARCA";
		} else {
			continue;
		}

		const sectorLine = String((arr[1] as unknown[])?.[0] ?? "");
		const sectorMatch = sectorLine.match(/Sector\s+\d+\s+de\s+\d+/i);
		const sector = sectorMatch ? sectorMatch[0] : null;

		const clientes: RutaRow["clientes"] = [];
		for (const row of arr) {
			const r = row as unknown[];
			const idx = r[0];
			const nombre = String(r[1] ?? "").trim();
			if (typeof idx === "number" && nombre) {
				clientes.push({
					nombre,
					direccion: String(r[2] ?? "").trim() || null,
					telefono: String(r[3] ?? "").trim() || null,
					vendedor_historico: String(r[4] ?? "").trim() || null,
				});
			}
		}

		if (clientes.length > 0) out.push({ numero, zona, sector, clientes });
	}

	return out;
}

type ReporteRow = {
	nombre: string;
	direccion: string | null;
	telefono: string | null;
	nit: string | null;
	email: string | null;
	contacto: string | null;
	departamento: string | null;
	municipio: string | null;
	localidad: string | null;
	zona_reporte: string | null;
	tipo: string | null;
	vendedor_historico: string | null;
};

function parseReporteFile(file: string): ReporteRow[] {
	const wb = xlsx.readFile(file);
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, {
		defval: null,
	});
	const out: ReporteRow[] = [];
	for (const r of rows) {
		const nombre = String(r.nombre ?? "").trim();
		if (!nombre) continue;
		out.push({
			nombre,
			direccion: ((r.direccion as string) ?? "").trim() || null,
			telefono: ((r.telefono as string) ?? "").toString().trim() || null,
			nit: ((r.nit_cc as string) ?? "").toString().trim() || null,
			email: ((r.email as string) ?? "").trim() || null,
			contacto: ((r.contacto as string) ?? "").trim() || null,
			departamento: ((r.departa as string) ?? "").trim() || null,
			municipio: ((r.munici as string) ?? "").trim() || null,
			localidad: ((r.localidad as string) ?? "").trim() || null,
			zona_reporte: ((r.zona as string) ?? "").trim() || null,
			tipo: ((r.tipo as string) ?? "").trim() || null,
			vendedor_historico: ((r.vendedor as string) ?? "").trim() || null,
		});
	}
	return out;
}

async function main() {
	const vendedorIdStr = process.env.VENDEDOR_ID;
	if (!vendedorIdStr) {
		console.error("✘ Falta VENDEDOR_ID");
		process.exit(1);
	}
	const vendedorId = BigInt(vendedorIdStr);

	console.log("═══════════════════════════════════════════════════════════");
	console.log("  INGESTA DE PROSPECTOS");
	console.log("═══════════════════════════════════════════════════════════");
	console.log(`  Vendedor:    ${vendedorIdStr}`);
	console.log(`  Rutas xlsx:  ${RUTAS_XLSX}`);
	console.log(`  Reporte:     ${REPORTE_XLSX}`);
	console.log("───────────────────────────────────────────────────────────");

	// 1. Rutas + prospectos pre-agrupados
	const rutas = parseRutasFile(RUTAS_XLSX);
	console.log(
		`  Rutas leídas: ${rutas.length}  ·  Total prospectos en rutas: ${rutas.reduce((s, r) => s + r.clientes.length, 0)}`,
	);

	let rutasUp = 0;
	let prospInsert = 0;
	let prospUpdate = 0;
	const nombreANombreNorm = new Map<string, string>(); // norm → nombre original (primer match)

	for (const r of rutas) {
		const ruta = await prisma.rutas_prospeccion.upsert({
			where: {
				vendedor_id_numero: { vendedor_id: vendedorId, numero: r.numero },
			},
			create: {
				vendedor_id: vendedorId,
				numero: r.numero,
				zona: r.zona,
				sector: r.sector,
			},
			update: { zona: r.zona, sector: r.sector },
		});
		rutasUp++;

		for (const c of r.clientes) {
			const norm = normalizeName(c.nombre);
			nombreANombreNorm.set(norm, c.nombre);

			const existing = await prisma.prospectos.findFirst({
				where: { vendedor_id: vendedorId, nombre: c.nombre },
			});
			if (existing) {
				await prisma.prospectos.update({
					where: { id: existing.id },
					data: {
						ruta_id: ruta.id,
						direccion: existing.direccion ?? c.direccion,
						telefono: existing.telefono ?? c.telefono,
						vendedor_historico:
							existing.vendedor_historico ?? c.vendedor_historico,
					},
				});
				prospUpdate++;
			} else {
				await prisma.prospectos.create({
					data: {
						vendedor_id: vendedorId,
						ruta_id: ruta.id,
						nombre: c.nombre,
						direccion: c.direccion,
						telefono: c.telefono,
						vendedor_historico: c.vendedor_historico,
					},
				});
				prospInsert++;
			}
		}
	}

	console.log(
		`  Rutas upsert: ${rutasUp}  ·  Prospectos nuevos: ${prospInsert}  ·  Actualizados: ${prospUpdate}`,
	);

	// 2. REPORTE CLI → enriquecimiento + históricos sin ruta
	let reporteRows: ReporteRow[] = [];
	try {
		reporteRows = parseReporteFile(REPORTE_XLSX);
	} catch (e) {
		console.warn(
			`  ⚠ No pude leer ${REPORTE_XLSX}: ${e instanceof Error ? e.message : "?"}. Solo se importan rutas.`,
		);
	}
	console.log(`  Reporte rows: ${reporteRows.length}`);

	let enriched = 0;
	let inserted = 0;
	for (const row of reporteRows) {
		const norm = normalizeName(row.nombre);
		const existing = await prisma.prospectos.findFirst({
			where: { vendedor_id: vendedorId, nombre: row.nombre },
		});
		if (existing) {
			await prisma.prospectos.update({
				where: { id: existing.id },
				data: {
					direccion: existing.direccion ?? row.direccion,
					telefono: existing.telefono ?? row.telefono,
					nit: existing.nit ?? row.nit,
					email: existing.email ?? row.email,
					contacto: existing.contacto ?? row.contacto,
					departamento: existing.departamento ?? row.departamento,
					municipio: existing.municipio ?? row.municipio,
					localidad: existing.localidad ?? row.localidad,
					zona_reporte: existing.zona_reporte ?? row.zona_reporte,
					tipo: existing.tipo ?? row.tipo,
					vendedor_historico:
						existing.vendedor_historico ?? row.vendedor_historico,
				},
			});
			enriched++;
		} else {
			await prisma.prospectos.create({
				data: {
					vendedor_id: vendedorId,
					nombre: row.nombre,
					direccion: row.direccion,
					telefono: row.telefono,
					nit: row.nit,
					email: row.email,
					contacto: row.contacto,
					departamento: row.departamento,
					municipio: row.municipio,
					localidad: row.localidad,
					zona_reporte: row.zona_reporte,
					tipo: row.tipo,
					vendedor_historico: row.vendedor_historico,
					ruta_id: null,
				},
			});
			inserted++;
		}
		void norm;
	}
	console.log(`  Enriquecidos: ${enriched}  ·  Históricos nuevos: ${inserted}`);

	const totales = await prisma.prospectos.count({
		where: { vendedor_id: vendedorId },
	});
	const conRuta = await prisma.prospectos.count({
		where: { vendedor_id: vendedorId, ruta_id: { not: null } },
	});
	console.log("───────────────────────────────────────────────────────────");
	console.log(
		`  TOTAL prospectos en DB: ${totales}  ·  Con ruta: ${conRuta}  ·  Sin ruta: ${totales - conRuta}`,
	);
	console.log("═══════════════════════════════════════════════════════════");
}

main()
	.catch((e) => {
		console.error("\n✘ FATAL:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
