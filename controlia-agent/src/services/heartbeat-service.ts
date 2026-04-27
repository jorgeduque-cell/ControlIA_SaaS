/**
 * Heartbeat / alertas proactivas.
 *
 * Cada 30 minutos el bot revisa 4 condiciones críticas por vendedor y envía
 * un resumen HTML si hay algo que reportar. Si no hay alertas, guarda un
 * registro pero NO spamea al usuario.
 *
 * Las 4 alertas:
 *   1. STOCK_BAJO        — productos con stock_actual <= stock_minimo
 *   2. CXC_VENCIDA       — cuentas_por_cobrar.fecha_vencimiento < hoy y estado != PAGADO
 *   3. PEDIDOS_SIN_DESPACHAR — pedidos con estado "Pendiente" cuya fecha < hace 24h
 *   4. OC_PENDIENTES     — ordenes_compra estado ENVIADA con fecha_esperada pasada
 *
 * Adaptado al schema español snake_case: vendedores.id ES directamente el
 * chat.id de Telegram (no existe columna telegram_chat_id).
 */

import type TelegramBot from "node-telegram-bot-api";
import { prisma } from "../db/client.js";

export type AlertType =
	| "STOCK_BAJO"
	| "CXC_VENCIDA"
	| "PEDIDOS_SIN_DESPACHAR"
	| "OC_PENDIENTES";

export interface AlertCounts {
	stockBajo: number;
	cxcVencida: number;
	pedidosSinDespachar: number;
	ocPendientes: number;
}

export interface AlertDetail {
	type: AlertType;
	count: number;
	/** Top-N ejemplos listos para HTML (bullet list, <= 5 items). */
	examples: string[];
}

export interface HeartbeatResult {
	vendedorId: bigint;
	counts: AlertCounts;
	details: AlertDetail[];
	hasAlerts: boolean;
	summaryHtml: string | null;
}

const HACE_24H = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const HOY_SOLO_FECHA = () => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
};

// ─── Recolección por tipo ───────────────────────────────────────────────────

async function fetchStockBajo(vendedorId: bigint): Promise<AlertDetail> {
	const rows = await prisma.$queryRaw<
		Array<{ nombre: string; stock_actual: number; stock_minimo: number }>
	>`
		SELECT nombre, stock_actual, stock_minimo
		FROM productos
		WHERE vendedor_id = ${vendedorId}
		  AND stock_actual IS NOT NULL
		  AND stock_minimo IS NOT NULL
		  AND stock_actual <= stock_minimo
		ORDER BY (stock_minimo - stock_actual) DESC
		LIMIT 5
	`;

	const countRes = await prisma.$queryRaw<Array<{ count: bigint }>>`
		SELECT COUNT(*)::bigint AS count FROM productos
		WHERE vendedor_id = ${vendedorId}
		  AND stock_actual IS NOT NULL
		  AND stock_minimo IS NOT NULL
		  AND stock_actual <= stock_minimo
	`;
	const count = Number(countRes[0]?.count ?? 0n);

	const examples = rows.map(
		(r) =>
			`• <b>${escapeHtml(r.nombre)}</b> — ${r.stock_actual}/${r.stock_minimo}`,
	);
	return { type: "STOCK_BAJO", count, examples };
}

async function fetchCxcVencida(vendedorId: bigint): Promise<AlertDetail> {
	const hoy = HOY_SOLO_FECHA();
	const rows = await prisma.cuentas_por_cobrar.findMany({
		where: {
			vendedor_id: vendedorId,
			estado: { notIn: ["PAGADO", "ANULADA"] },
			fecha_vencimiento: { lt: hoy },
		},
		orderBy: { fecha_vencimiento: "asc" },
		take: 5,
		select: {
			id: true,
			cliente_id: true,
			monto_pendiente: true,
			fecha_vencimiento: true,
		},
	});

	const count = await prisma.cuentas_por_cobrar.count({
		where: {
			vendedor_id: vendedorId,
			estado: { notIn: ["PAGADO", "ANULADA"] },
			fecha_vencimiento: { lt: hoy },
		},
	});

	const clienteIds = rows
		.map((r) => r.cliente_id)
		.filter((id): id is number => id !== null);
	const clientes = clienteIds.length
		? await prisma.clientes.findMany({
				where: { id: { in: clienteIds } },
				select: { id: true, nombre: true },
			})
		: [];
	const nombrePorId = new Map(clientes.map((c) => [c.id, c.nombre]));

	const examples = rows.map((r) => {
		const nombre = r.cliente_id
			? (nombrePorId.get(r.cliente_id) ?? `Cliente #${r.cliente_id}`)
			: "Cliente sin asignar";
		const diasVencido = Math.floor(
			(hoy.getTime() - r.fecha_vencimiento.getTime()) / (24 * 60 * 60 * 1000),
		);
		return `• <b>${escapeHtml(nombre)}</b> — $${r.monto_pendiente.toFixed(2)} (${diasVencido}d vencida)`;
	});

	return { type: "CXC_VENCIDA", count, examples };
}

async function fetchPedidosSinDespachar(
	vendedorId: bigint,
): Promise<AlertDetail> {
	const corte = HACE_24H();
	const rows = await prisma.pedidos.findMany({
		where: {
			vendedor_id: vendedorId,
			estado: "Pendiente",
			fecha: { lt: corte },
		},
		orderBy: { fecha: "asc" },
		take: 5,
		select: {
			id: true,
			producto: true,
			cantidad: true,
			fecha: true,
			clientes: { select: { nombre: true } },
		},
	});

	const count = await prisma.pedidos.count({
		where: {
			vendedor_id: vendedorId,
			estado: "Pendiente",
			fecha: { lt: corte },
		},
	});

	const ahora = Date.now();
	const examples = rows.map((r) => {
		const cliente = r.clientes?.nombre ?? "Cliente sin asignar";
		const horas = r.fecha
			? Math.floor((ahora - r.fecha.getTime()) / (60 * 60 * 1000))
			: null;
		const hace = horas !== null ? `${horas}h` : "?";
		return `• <b>${escapeHtml(cliente)}</b> — ${r.cantidad}× ${escapeHtml(r.producto)} (${hace})`;
	});

	return { type: "PEDIDOS_SIN_DESPACHAR", count, examples };
}

async function fetchOcPendientes(vendedorId: bigint): Promise<AlertDetail> {
	const hoy = HOY_SOLO_FECHA();
	const rows = await prisma.ordenes_compra.findMany({
		where: {
			vendedor_id: vendedorId,
			estado: { in: ["ENVIADA", "CONFIRMADA", "RECIBIDA_PARCIAL"] },
			fecha_esperada: { lt: hoy },
		},
		orderBy: { fecha_esperada: "asc" },
		take: 5,
		select: {
			numero: true,
			total: true,
			fecha_esperada: true,
			proveedor: { select: { nombre: true } },
		},
	});

	const count = await prisma.ordenes_compra.count({
		where: {
			vendedor_id: vendedorId,
			estado: { in: ["ENVIADA", "CONFIRMADA", "RECIBIDA_PARCIAL"] },
			fecha_esperada: { lt: hoy },
		},
	});

	const examples = rows.map((r) => {
		const proveedor = r.proveedor?.nombre ?? "Proveedor";
		const diasAtraso = r.fecha_esperada
			? Math.floor(
					(hoy.getTime() - r.fecha_esperada.getTime()) /
						(24 * 60 * 60 * 1000),
				)
			: 0;
		return `• <b>${r.numero}</b> ${escapeHtml(proveedor)} — $${r.total.toFixed(2)} (${diasAtraso}d atraso)`;
	});

	return { type: "OC_PENDIENTES", count, examples };
}

// ─── Orquestación ───────────────────────────────────────────────────────────

export async function checkAlerts(vendedorId: bigint): Promise<HeartbeatResult> {
	const [stock, cxc, pedidos, oc] = await Promise.all([
		fetchStockBajo(vendedorId),
		fetchCxcVencida(vendedorId),
		fetchPedidosSinDespachar(vendedorId),
		fetchOcPendientes(vendedorId),
	]);

	const details = [stock, cxc, pedidos, oc];
	const counts: AlertCounts = {
		stockBajo: stock.count,
		cxcVencida: cxc.count,
		pedidosSinDespachar: pedidos.count,
		ocPendientes: oc.count,
	};
	const hasAlerts = details.some((d) => d.count > 0);
	const summaryHtml = hasAlerts ? formatAlertSummary(details) : null;

	return { vendedorId, counts, details, hasAlerts, summaryHtml };
}

function formatAlertSummary(details: AlertDetail[]): string {
	const lines: string[] = ["🔔 <b>Resumen de ControlIA</b>", ""];

	const byType = new Map(details.map((d) => [d.type, d]));

	const section = (
		titulo: string,
		type: AlertType,
		singular: string,
		plural: string,
	) => {
		const d = byType.get(type);
		if (!d || d.count === 0) return;
		const header = `${titulo} — ${d.count} ${d.count === 1 ? singular : plural}`;
		lines.push(header);
		lines.push(...d.examples);
		if (d.count > d.examples.length) {
			lines.push(`  <i>…y ${d.count - d.examples.length} más</i>`);
		}
		lines.push("");
	};

	section("📦 Stock bajo", "STOCK_BAJO", "producto", "productos");
	section("💰 Cuentas vencidas", "CXC_VENCIDA", "cliente", "clientes");
	section(
		"🚚 Pedidos sin despachar (>24h)",
		"PEDIDOS_SIN_DESPACHAR",
		"pedido",
		"pedidos",
	);
	section("📑 Órdenes de compra atrasadas", "OC_PENDIENTES", "OC", "OCs");

	lines.push("<i>Usa /briefing para refrescar o pide detalle en lenguaje natural.</i>");
	return lines.join("\n");
}

// ─── Ejecución con envío ────────────────────────────────────────────────────

export async function runHeartbeatForVendor(
	vendedorId: bigint,
	chatId: string,
	bot: TelegramBot,
	trigger: "cron" | "manual" | "startup" = "cron",
): Promise<HeartbeatResult> {
	const result = await checkAlerts(vendedorId);

	let messageId: string | null = null;
	if (result.hasAlerts && result.summaryHtml) {
		try {
			const sent = await bot.sendMessage(chatId, result.summaryHtml, {
				parse_mode: "HTML",
			});
			messageId = String(sent.message_id);
		} catch (err) {
			console.error(
				`[Heartbeat] No se pudo enviar a vendedor_id=${vendedorId}:`,
				err,
			);
		}
	}

	// Siempre registramos la ejecución (aún sin alertas) para trazabilidad.
	try {
		await prisma.heartbeat_log.create({
			data: {
				vendedor_id: vendedorId,
				chat_id: chatId,
				message_id: messageId,
				alerts_sent: result.counts as unknown as object,
				summary_text: result.summaryHtml,
				trigger,
			},
		});
	} catch (err) {
		console.error("[Heartbeat] Error guardando log:", err);
	}

	return result;
}

export async function runHeartbeatForAll(bot: TelegramBot): Promise<{
	procesados: number;
	conAlertas: number;
}> {
	const activos = await prisma.vendedores.findMany({
		where: { estado: { not: "Inactivo" } },
		select: { id: true },
	});

	let procesados = 0;
	let conAlertas = 0;

	// Batches de 5 para no reventar rate limits de Telegram ni del pool Prisma.
	const BATCH = 5;
	for (let i = 0; i < activos.length; i += BATCH) {
		const chunk = activos.slice(i, i + BATCH);
		const results = await Promise.allSettled(
			chunk.map((v) =>
				runHeartbeatForVendor(v.id, v.id.toString(), bot, "cron"),
			),
		);
		for (const r of results) {
			if (r.status === "fulfilled") {
				procesados++;
				if (r.value.hasAlerts) conAlertas++;
			} else {
				console.error("[Heartbeat] Vendedor falló:", r.reason);
			}
		}
	}

	console.log(
		`[Heartbeat] Barrida completa: ${procesados}/${activos.length} ok, ${conAlertas} con alertas`,
	);
	return { procesados, conAlertas };
}

// ── Cierre de día de prospección ───────────────────────────────────────────
//
// Una vez por día por vendedor, alrededor de la hora local configurada
// (default 18 = 6 PM Bogotá), si quedaron prospectos en estado EN_RUTA sin
// visita registrada hoy, el bot los lista y le pregunta al vendedor uno por
// uno. Idempotente: usa heartbeat_log.trigger='cierre_dia' como marcador.

const CIERRE_HOUR = Number(process.env.CIERRE_HOUR ?? "18");
const CIERRE_TZ_OFFSET_MIN = Number(
	process.env.CIERRE_TZ_OFFSET_MIN ?? "-300", // Bogotá UTC-5
);

function bogotaHourNow(): number {
	const now = new Date();
	const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
	const localMin = (utcMin + CIERRE_TZ_OFFSET_MIN + 24 * 60) % (24 * 60);
	return Math.floor(localMin / 60);
}

async function alreadySentCierreToday(vendedorId: bigint): Promise<boolean> {
	const inicioHoy = new Date();
	inicioHoy.setHours(0, 0, 0, 0);
	const log = await prisma.heartbeat_log.findFirst({
		where: {
			vendedor_id: vendedorId,
			trigger: "cierre_dia",
			executed_at: { gte: inicioHoy },
		},
		select: { id: true },
	});
	return !!log;
}

async function runCierreForVendor(
	vendedorId: bigint,
	chatId: string,
	bot: TelegramBot,
): Promise<{ enviado: boolean; pendientes: number }> {
	if (await alreadySentCierreToday(vendedorId)) {
		return { enviado: false, pendientes: 0 };
	}

	const enRuta = await prisma.prospectos.findMany({
		where: { vendedor_id: vendedorId, estado: "EN_RUTA" },
		orderBy: { id: "asc" },
	});
	if (enRuta.length === 0) return { enviado: false, pendientes: 0 };

	const inicioHoy = new Date();
	inicioHoy.setHours(0, 0, 0, 0);
	const visitasHoy = await prisma.visitas_prospeccion.findMany({
		where: {
			vendedor_id: vendedorId,
			prospecto_id: { in: enRuta.map((p) => p.id) },
			fecha: { gte: inicioHoy },
		},
		select: { prospecto_id: true },
	});
	const ya = new Set(visitasHoy.map((v) => v.prospecto_id));
	const pendientes = enRuta.filter((p) => !ya.has(p.id));
	if (pendientes.length === 0) return { enviado: false, pendientes: 0 };

	let msg = `📋 <b>CIERRE DEL DÍA</b>\nTienes ${pendientes.length} prospecto${pendientes.length === 1 ? "" : "s"} de la ruta de hoy sin feedback:\n\n`;
	pendientes.forEach((p, i) => {
		msg += `<b>${i + 1}.</b> ${p.nombre}`;
		if (p.direccion) msg += ` — ${p.direccion}`;
		msg += "\n";
	});
	msg +=
		'\n¿Qué pasó con cada uno? Respóndeme en lenguaje natural — ej: "el 1 compró 3 garrafas, el 2 no atendió, el 3 muy interesado".';

	try {
		const sent = await bot.sendMessage(Number(chatId), msg, {
			parse_mode: "HTML",
		});
		await prisma.heartbeat_log.create({
			data: {
				vendedor_id: vendedorId,
				chat_id: chatId,
				message_id: String(sent.message_id),
				alerts_sent: { cierreDia: pendientes.length } as unknown as object,
				summary_text: msg,
				trigger: "cierre_dia",
			},
		});
		return { enviado: true, pendientes: pendientes.length };
	} catch (err) {
		console.error("[CierreDia] Error enviando:", err);
		return { enviado: false, pendientes: pendientes.length };
	}
}

/**
 * Barrida diaria de cierre. Se invoca desde el cron del heartbeat. Sólo
 * actúa si la hora local está dentro de la ventana CIERRE_HOUR..CIERRE_HOUR+1
 * y la dedup por heartbeat_log evita repeticiones.
 */
export async function runCierreDiaForAll(
	bot: TelegramBot,
): Promise<{ enviados: number }> {
	const hora = bogotaHourNow();
	if (hora !== CIERRE_HOUR) return { enviados: 0 };

	const activos = await prisma.vendedores.findMany({
		where: { estado: { not: "Inactivo" } },
		select: { id: true },
	});

	let enviados = 0;
	for (const v of activos) {
		try {
			const r = await runCierreForVendor(v.id, v.id.toString(), bot);
			if (r.enviado) enviados++;
		} catch (err) {
			console.error("[CierreDia] Vendedor falló:", err);
		}
	}
	if (enviados > 0) {
		console.log(`[CierreDia] Enviados ${enviados} cierres a las ${hora}h`);
	}
	return { enviados };
}

export async function runHeartbeatManual(
	vendedorId: bigint,
	chatId: string,
	bot: TelegramBot,
): Promise<string> {
	const result = await runHeartbeatForVendor(
		vendedorId,
		chatId,
		bot,
		"manual",
	);
	if (!result.hasAlerts) {
		return [
			"✅ <b>Todo en orden</b>",
			"",
			"No hay alertas activas:",
			"• Stock arriba del mínimo",
			"• Cuentas al día",
			"• Pedidos despachados",
			"• Órdenes de compra al día",
		].join("\n");
	}
	// El summary ya fue enviado por runHeartbeatForVendor; devolvemos confirmación corta.
	return "📬 Resumen enviado arriba.";
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
