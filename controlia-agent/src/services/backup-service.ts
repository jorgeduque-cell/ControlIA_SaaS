/**
 * Servicio de backups diarios en JSON.
 *
 * Cada 24 h exporta todos los datos del tenant actual a un archivo
 * en `<docsRoot>/backups/YYYY-MM-DD/<vendedor>-backup.json`.
 *
 * Uso: en index.ts, llamar `startDailyBackups(vendedorId)` una vez
 * después de inicializar Prisma.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/client.js";
import { buildDocPath } from "./file-system-service.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let backupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Ejecuta un backup inmediato. Devuelve la ruta del archivo escrito.
 */
export async function runBackup(vendedorId: bigint): Promise<string> {
	const [
		clientes,
		productos,
		pedidos,
		finanzas,
		cotizaciones,
		itemsCotizacion,
		cuentasPorCobrar,
		pagosCxc,
		proveedores,
		ordenesCompra,
		itemsOrdenCompra,
		cuentasPorPagar,
		movimientosInventario,
		movimientosCaja,
		consecutivos,
	] = await Promise.all([
		prisma.clientes.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.productos.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.pedidos.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.finanzas.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.cotizaciones.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.items_cotizacion.findMany({
			where: { cotizacion: { vendedor_id: vendedorId } },
		}),
		prisma.cuentas_por_cobrar.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.pagos_cxc.findMany({
			where: { cxc: { vendedor_id: vendedorId } },
		}),
		prisma.proveedores.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.ordenes_compra.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.items_orden_compra.findMany({
			where: { orden: { vendedor_id: vendedorId } },
		}),
		prisma.cuentas_por_pagar.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.movimientos_inventario.findMany({
			where: { vendedor_id: vendedorId },
		}),
		prisma.movimientos_caja.findMany({ where: { vendedor_id: vendedorId } }),
		prisma.consecutivos.findMany({ where: { vendedor_id: vendedorId } }),
	]);

	const payload = {
		backupVersion: 1,
		generatedAt: new Date().toISOString(),
		vendedorId: vendedorId.toString(),
		data: {
			clientes,
			productos,
			pedidos,
			finanzas,
			cotizaciones,
			itemsCotizacion,
			cuentasPorCobrar,
			pagosCxc,
			proveedores,
			ordenesCompra,
			itemsOrdenCompra,
			cuentasPorPagar,
			movimientosInventario,
			movimientosCaja,
			consecutivos,
		},
	};

	const fileName = `${vendedorId.toString()}-backup.json`;
	const fullPath = buildDocPath("backup", fileName);

	// JSON.stringify no soporta BigInt — usar replacer.
	const json = JSON.stringify(
		payload,
		(_key, value) => (typeof value === "bigint" ? value.toString() : value),
		2,
	);

	fs.writeFileSync(fullPath, json, "utf-8");
	console.log(`[Backup] ✅ Escrito ${fullPath}`);
	return fullPath;
}

/**
 * Programa backups diarios. Idempotente: llamarlo varias veces no duplica
 * el intervalo.
 */
export function startDailyBackups(vendedorId: bigint): void {
	if (backupInterval) return;

	// Primer backup al arrancar (ejecutar en background, no bloquear)
	runBackup(vendedorId).catch((err) => {
		console.error("[Backup] Error en backup inicial:", err);
	});

	backupInterval = setInterval(() => {
		runBackup(vendedorId).catch((err) => {
			console.error("[Backup] Error en backup programado:", err);
		});
	}, ONE_DAY_MS);

	console.log("[Backup] 🗓️ Backups diarios activados");
}

export function stopDailyBackups(): void {
	if (backupInterval) {
		clearInterval(backupInterval);
		backupInterval = null;
		console.log("[Backup] Backups diarios detenidos");
	}
}

/**
 * Limpia backups más antiguos que `diasRetencion` (default: 30).
 */
export function cleanOldBackups(diasRetencion: number = 30): number {
	const backupsRoot = path.dirname(path.dirname(buildDocPath("backup", "x")));
	if (!fs.existsSync(backupsRoot)) return 0;

	const limite = Date.now() - diasRetencion * ONE_DAY_MS;
	let eliminados = 0;

	for (const entry of fs.readdirSync(backupsRoot)) {
		const fullDir = path.join(backupsRoot, entry);
		try {
			const stat = fs.statSync(fullDir);
			if (stat.isDirectory() && stat.mtimeMs < limite) {
				fs.rmSync(fullDir, { recursive: true, force: true });
				eliminados += 1;
			}
		} catch {
			// ignorar entradas que no se puedan leer
		}
	}

	console.log(`[Backup] 🧹 ${eliminados} carpetas antiguas eliminadas`);
	return eliminados;
}
