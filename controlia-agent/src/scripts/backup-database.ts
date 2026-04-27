/**
 * Simple PostgreSQL backup script for ControlIA
 *
 * Creates a pg_dump backup in the ./backups folder,
 * keeping only the last 7 backups to avoid disk bloat.
 *
 * Run manually:
 *   npm run backup
 *
 * Or schedule daily via Windows Task Scheduler:
 *   .\setup-daily-backup.ps1
 */

import "dotenv/config";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { prisma } from "../db/client.js";

const execFileAsync = promisify(execFile);

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = path.join(process.cwd(), "backups");
const MAX_BACKUPS = 7;

function getTimestamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function pgDumpExists(): Promise<boolean> {
	try {
		await execFileAsync("pg_dump", ["--version"]);
		return true;
	} catch {
		return false;
	}
}

async function dockerExists(): Promise<boolean> {
	try {
		await execFileAsync("docker", ["--version"]);
		return true;
	} catch {
		return false;
	}
}

async function rotateBackups() {
	const entries = fs
		.readdirSync(BACKUP_DIR)
		.filter(
			(f) =>
				f.startsWith("backup-") && (f.endsWith(".sql") || f.endsWith(".json")),
		)
		.map((f) => ({
			name: f,
			path: path.join(BACKUP_DIR, f),
			mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
		}))
		.sort((a, b) => b.mtime - a.mtime);

	const toDelete = entries.slice(MAX_BACKUPS);
	for (const entry of toDelete) {
		try {
			fs.unlinkSync(entry.path);
			console.log(`[Backup] 🗑️  Deleted old backup: ${entry.name}`);
		} catch (err) {
			console.error(`[Backup] ⚠️  Failed to delete ${entry.name}:`, err);
		}
	}
}

async function runPgDumpBackup(filePath: string) {
	const hasPgDump = await pgDumpExists();
	const hasDocker = await dockerExists();

	if (hasPgDump) {
		console.log("[Backup] Using local pg_dump");
		await execFileAsync("pg_dump", [DATABASE_URL!, "-f", filePath], {
			timeout: 300_000,
		});
		return;
	}

	if (hasDocker) {
		console.log("[Backup] Local pg_dump not found, using Docker fallback");
		const { stdout } = await execFileAsync(
			"docker",
			["run", "--rm", "postgres:latest", "pg_dump", DATABASE_URL!],
			{ timeout: 300_000, maxBuffer: 1024 * 1024 * 50 },
		);
		fs.writeFileSync(filePath, stdout, "utf-8");
		return;
	}

	throw new Error("pg_dump and docker unavailable");
}

async function runPrismaJsonBackup(filePath: string) {
	console.log(
		"[Backup] Using Prisma JSON fallback (pg_dump/Docker unavailable)",
	);

	const data = {
		exportedAt: new Date().toISOString(),
		source: "prisma-json-fallback",
		tables: {} as Record<string, unknown[]>,
	};

	// Query all main tables
	data.tables.vendedores = await prisma.vendedores.findMany();
	data.tables.clientes = await prisma.clientes.findMany();
	data.tables.productos = await prisma.productos.findMany();
	data.tables.inventario = await prisma.inventario.findMany();
	data.tables.pedidos = await prisma.pedidos.findMany();
	data.tables.finanzas = await prisma.finanzas.findMany();
	data.tables.notas_cliente = await prisma.notas_cliente.findMany();
	data.tables.metas = await prisma.metas.findMany();
	data.tables.context_memory = await prisma.context_memory.findMany();
	data.tables.baseClientes = await prisma.baseClientes.findMany();
	data.tables.historico_precios = await prisma.historico_precios.findMany();

	// Custom replacer to handle BigInt
	const json = JSON.stringify(
		data,
		(_key, value) => {
			if (typeof value === "bigint") return value.toString();
			return value;
		},
		2,
	);

	fs.writeFileSync(filePath, json, "utf-8");
}

async function main() {
	if (!DATABASE_URL) {
		console.error("[Backup] ❌ DATABASE_URL is not set in .env");
		process.exit(1);
	}

	if (!fs.existsSync(BACKUP_DIR)) {
		fs.mkdirSync(BACKUP_DIR, { recursive: true });
		console.log(`[Backup] 📁 Created backup directory: ${BACKUP_DIR}`);
	}

	const timestamp = getTimestamp();
	const sqlFileName = `backup-${timestamp}.sql`;
	const sqlFilePath = path.join(BACKUP_DIR, sqlFileName);
	const jsonFileName = `backup-${timestamp}.json`;
	const jsonFilePath = path.join(BACKUP_DIR, jsonFileName);

	let usedFilePath: string;

	try {
		await runPgDumpBackup(sqlFilePath);
		usedFilePath = sqlFilePath;
	} catch (pgError) {
		try {
			await runPrismaJsonBackup(jsonFilePath);
			usedFilePath = jsonFilePath;
		} catch (jsonError: any) {
			console.error("[Backup] ❌ All backup methods failed.");
			console.error("pg_dump error:", (pgError as Error).message);
			console.error("Prisma JSON error:", jsonError.message);
			process.exit(1);
		}
	}

	const stats = fs.statSync(usedFilePath);
	const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

	console.log(
		`[Backup] ✅ Success: ${path.basename(usedFilePath)} (${sizeMB} MB)`,
	);

	await rotateBackups();
	console.log("[Backup] 🎉 Backup process complete");

	// Disconnect Prisma cleanly
	await prisma.$disconnect();
}

main();
