/**
 * Regenera el xlsx de rutas con los datos vivos de la DB. Las columnas
 * Visitado/Resultado/Interés/Próxima acción/Notas se rellenan con la
 * última visita registrada de cada prospecto.
 *
 * Salida: <docsRoot>/excel/YYYY/MM/Rutas_Prospeccion_<vendedor>_<fecha>.xlsx
 */

import { createTool } from "@voltagent/core";
import xlsx from "xlsx";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import { buildDocPath } from "../../services/file-system-service.js";

export const exportRutasTool = createTool({
	name: "export_rutas_xlsx",
	description:
		"Genera un Excel actualizado del plan de rutas de prospección con todas las visitas registradas. Se envía por Telegram al usuario.",
	tags: ["sales", "prospeccion", "export", "excel"],

	parameters: z.object({}),

	execute: async (_params, options) => {
		const context = options?.context;
		const vendedorIdStr =
			context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			return { success: false, message: "Contexto de vendedor no disponible." };
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const rutas = await prisma.rutas_prospeccion.findMany({
			where: { vendedor_id: vendedorId },
			orderBy: { numero: "asc" },
			include: {
				prospectos: {
					orderBy: { id: "asc" },
					include: {
						visitas: {
							orderBy: { fecha: "desc" },
							take: 1,
						},
					},
				},
			},
		});

		const wb = xlsx.utils.book_new();

		// Resumen
		const resumen: Array<(string | number)[]> = [
			["PLAN DE RUTAS DE PROSPECCIÓN — VENCO OIL"],
			[
				"#",
				"Zona / Sector",
				"Total",
				"Pendientes",
				"Visitados",
				"Compraron",
				"% Conversión",
			],
		];
		for (const r of rutas) {
			const total = r.prospectos.length;
			const visitados = r.prospectos.filter((p) => p.estado === "VISITADO")
				.length;
			const pendientes = r.prospectos.filter((p) => p.estado === "PENDIENTE")
				.length;
			const compraron = r.prospectos.filter(
				(p) => p.visitas[0]?.resultado === "COMPRO",
			).length;
			const conv =
				visitados > 0 ? `${Math.round((compraron / visitados) * 100)}%` : "—";
			resumen.push([
				r.numero,
				`${r.zona}${r.sector ? ` — ${r.sector}` : ""}`,
				total,
				pendientes,
				visitados,
				compraron,
				conv,
			]);
		}
		const wsResumen = xlsx.utils.aoa_to_sheet(resumen);
		xlsx.utils.book_append_sheet(wb, wsResumen, "Resumen");

		// Una hoja por ruta
		for (const r of rutas) {
			const aoa: Array<(string | number)[]> = [
				[`RUTA ${String(r.numero).padStart(2, "0")} — ${r.zona}`],
				[`Clientes: ${r.prospectos.length}${r.sector ? ` | ${r.sector}` : ""}`],
				[],
				[
					"#",
					"Nombre / Razón Social",
					"Dirección",
					"Teléfono",
					"Vendedor Histórico",
					"Estado",
					"Última visita",
					"Resultado",
					"Interés",
					"Próxima acción",
					"Notas",
				],
			];
			r.prospectos.forEach((p, i) => {
				const v = p.visitas[0];
				aoa.push([
					i + 1,
					p.nombre,
					p.direccion ?? "",
					p.telefono ?? "",
					p.vendedor_historico ?? "",
					p.estado,
					p.ultima_visita ? p.ultima_visita.toISOString().slice(0, 10) : "",
					v?.resultado ?? "",
					v?.interes ?? "",
					v?.proxima_accion ?? "",
					v?.notas ?? "",
				]);
			});
			const ws = xlsx.utils.aoa_to_sheet(aoa);
			const sheetName = `Ruta ${String(r.numero).padStart(2, "0")}`.slice(0, 31);
			xlsx.utils.book_append_sheet(wb, ws, sheetName);
		}

		// Hoja de históricos sin ruta
		const sinRuta = await prisma.prospectos.findMany({
			where: { vendedor_id: vendedorId, ruta_id: null },
			orderBy: { nombre: "asc" },
			include: { visitas: { orderBy: { fecha: "desc" }, take: 1 } },
		});
		if (sinRuta.length > 0) {
			const aoa: Array<(string | number)[]> = [
				[`HISTÓRICOS SIN RUTA ASIGNADA — ${sinRuta.length} clientes`],
				[],
				[
					"Nombre",
					"NIT",
					"Dirección",
					"Teléfono",
					"Email",
					"Departamento",
					"Municipio",
					"Localidad",
					"Tipo",
					"Vendedor",
					"Estado",
					"Resultado última visita",
				],
			];
			for (const p of sinRuta) {
				const v = p.visitas[0];
				aoa.push([
					p.nombre,
					p.nit ?? "",
					p.direccion ?? "",
					p.telefono ?? "",
					p.email ?? "",
					p.departamento ?? "",
					p.municipio ?? "",
					p.localidad ?? "",
					p.tipo ?? "",
					p.vendedor_historico ?? "",
					p.estado,
					v?.resultado ?? "",
				]);
			}
			xlsx.utils.book_append_sheet(
				wb,
				xlsx.utils.aoa_to_sheet(aoa),
				"Históricos",
			);
		}

		const fecha = new Date();
		const stamp = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}`;
		const fileName = `Rutas_Prospeccion_${vendedorIdStr}_${stamp}.xlsx`;
		const filePath = buildDocPath("excel", fileName, fecha);

		xlsx.writeFile(wb, filePath);

		if (context) {
			context.set("lastPdfPath", filePath); // adapter envía cualquier archivo en lastPdfPath
			context.set("lastPdfName", fileName);
		}

		const totales = rutas.reduce((s, r) => s + r.prospectos.length, 0);
		return {
			success: true,
			message: `📊 Excel actualizado: ${rutas.length} rutas, ${totales} prospectos${sinRuta.length ? ` + ${sinRuta.length} históricos` : ""}.`,
			filePath,
			fileName,
		};
	},
});
