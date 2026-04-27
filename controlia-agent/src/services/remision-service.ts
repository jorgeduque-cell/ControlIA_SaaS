/**
 * Servicio de Remisiones.
 *
 * Convierte uno o más `pedidos` en estado "Pendiente" en una remisión formal:
 *   1. Genera número atómico REM-YYYY-NNNN (consecutivo-service).
 *   2. Actualiza estado de los pedidos a "Remisionado" y los agrupa.
 *   3. Registra SALIDA en movimientos_inventario (trazabilidad).
 *   4. Abre cuenta_por_cobrar si la venta es a crédito.
 *   5. Escribe audit_log.
 *
 * Todo en una sola `prisma.$transaction` — todo o nada.
 *
 * También expone `cancelarRemision` para revertir stock + anular CxC.
 */

import { prisma } from "../db/client.js";
import { siguienteConsecutivo } from "./consecutivo-service.js";

export type ConfirmarRemisionParams = {
	vendedorId: bigint;
	pedidoIds: number[];
	esCredito?: boolean;
	diasCredito?: number; // default 30
	notas?: string;
	usuarioId?: string;
};

export type ConfirmarRemisionResult =
	| {
			success: true;
			numero: string;
			pedidoGrupo: string;
			total: number;
			cxcId?: number;
	  }
	| { success: false; message: string };

export async function confirmarRemision(
	params: ConfirmarRemisionParams,
): Promise<ConfirmarRemisionResult> {
	const {
		vendedorId,
		pedidoIds,
		esCredito = false,
		diasCredito = 30,
		notas,
		usuarioId,
	} = params;

	if (pedidoIds.length === 0) {
		return { success: false, message: "Debes indicar al menos un pedido." };
	}

	// Validación previa (fuera de la transacción — rápida, no bloqueante)
	const pedidos = await prisma.pedidos.findMany({
		where: {
			id: { in: pedidoIds },
			vendedor_id: vendedorId,
		},
	});

	if (pedidos.length !== pedidoIds.length) {
		return {
			success: false,
			message: "Alguno(s) de los pedidos no existe(n) o no te pertenecen.",
		};
	}

	const noValidos = pedidos.filter((p) => p.estado !== "Pendiente");
	if (noValidos.length > 0) {
		return {
			success: false,
			message: `No se puede confirmar: ${noValidos.length} pedido(s) no están en estado Pendiente.`,
		};
	}

	const clienteIds = new Set(
		pedidos.map((p) => p.cliente_id).filter((id): id is number => id !== null),
	);
	if (clienteIds.size > 1) {
		return {
			success: false,
			message: "Todos los pedidos de una remisión deben ser del mismo cliente.",
		};
	}
	const clienteId = pedidos[0].cliente_id;

	try {
		const result = await prisma.$transaction(async (tx) => {
			// 1. Número consecutivo REM
			const { codigo: numero } = await siguienteConsecutivo(
				vendedorId,
				"REM",
				new Date().getFullYear(),
				tx,
			);

			// 2. Marcar pedidos como Remisionados + agrupar
			await tx.pedidos.updateMany({
				where: { id: { in: pedidoIds } },
				data: {
					estado: "Remisionado",
					grupo_pedido: numero,
				},
			});

			// 3. Movimientos de inventario (SALIDA) por cada pedido
			let totalVenta = 0;
			for (const p of pedidos) {
				const producto = await tx.productos.findFirst({
					where: {
						vendedor_id: vendedorId,
						nombre: { contains: p.producto, mode: "insensitive" },
					},
				});

				const precio = p.precio_venta ?? 0;
				const precioCosto = p.precio_compra ?? 0;
				totalVenta += precio * p.cantidad;

				if (producto) {
					const stockPost = producto.stock_actual ?? 0;
					await tx.movimientos_inventario.create({
						data: {
							vendedor_id: vendedorId,
							producto_id: producto.id,
							tipo: "SALIDA",
							cantidad: p.cantidad,
							stock_anterior: stockPost + p.cantidad,
							stock_nuevo: stockPost,
							costo_unitario: precioCosto || null,
							referencia: numero,
							referencia_tipo: "PEDIDO",
							motivo: `Remisión ${numero}`,
							usuario_id: usuarioId ?? null,
						},
					});
				}
			}

			// 4. Si es crédito, abrir cuenta por cobrar
			let cxcId: number | undefined;
			if (esCredito && totalVenta > 0) {
				const vencimiento = new Date();
				vencimiento.setDate(vencimiento.getDate() + diasCredito);

				const cxc = await tx.cuentas_por_cobrar.create({
					data: {
						vendedor_id: vendedorId,
						cliente_id: clienteId,
						pedido_grupo: numero,
						monto_original: totalVenta,
						monto_pendiente: totalVenta,
						fecha_vencimiento: vencimiento,
						estado: "PENDIENTE",
						notas: notas ?? null,
					},
				});
				cxcId = cxc.id;
			}

			// 5. Audit log
			await tx.audit_log.create({
				data: {
					vendedor_id: vendedorId,
					accion: "CONFIRM_REMISION",
					entidad: "pedidos",
					entidad_id: numero,
					usuario_id: usuarioId ?? null,
					datos: {
						pedidoIds,
						total: totalVenta,
						esCredito,
						cxcId: cxcId ?? null,
					},
				},
			});

			return { numero, pedidoGrupo: numero, total: totalVenta, cxcId };
		});

		return { success: true, ...result };
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `Error al confirmar remisión: ${msg}`,
		};
	}
}

export type CancelarRemisionParams = {
	vendedorId: bigint;
	pedidoGrupo: string; // REM-YYYY-NNNN
	motivo: string;
	usuarioId?: string;
};

export type CancelarRemisionResult =
	| { success: true; pedidosCancelados: number }
	| { success: false; message: string };

export async function cancelarRemision(
	params: CancelarRemisionParams,
): Promise<CancelarRemisionResult> {
	const { vendedorId, pedidoGrupo, motivo, usuarioId } = params;

	const pedidos = await prisma.pedidos.findMany({
		where: {
			vendedor_id: vendedorId,
			grupo_pedido: pedidoGrupo,
		},
	});

	if (pedidos.length === 0) {
		return {
			success: false,
			message: `No se encontró la remisión ${pedidoGrupo}.`,
		};
	}

	const yaCanceladas = pedidos.every((p) => p.estado === "Cancelado");
	if (yaCanceladas) {
		return {
			success: false,
			message: `La remisión ${pedidoGrupo} ya está cancelada.`,
		};
	}

	try {
		await prisma.$transaction(async (tx) => {
			// 1. Devolver stock + registrar AJUSTE_POSITIVO
			for (const p of pedidos) {
				if (p.estado === "Cancelado") continue;

				const producto = await tx.productos.findFirst({
					where: {
						vendedor_id: vendedorId,
						nombre: { contains: p.producto, mode: "insensitive" },
					},
				});

				if (producto) {
					const stockActual = producto.stock_actual ?? 0;
					const stockNuevo = stockActual + p.cantidad;

					await tx.productos.update({
						where: { id: producto.id },
						data: { stock_actual: stockNuevo },
					});

					await tx.movimientos_inventario.create({
						data: {
							vendedor_id: vendedorId,
							producto_id: producto.id,
							tipo: "AJUSTE_POSITIVO",
							cantidad: p.cantidad,
							stock_anterior: stockActual,
							stock_nuevo: stockNuevo,
							referencia: pedidoGrupo,
							referencia_tipo: "AJUSTE",
							motivo: `Cancelación remisión: ${motivo}`,
							usuario_id: usuarioId ?? null,
						},
					});
				}
			}

			// 2. Marcar pedidos como Cancelado
			await tx.pedidos.updateMany({
				where: { vendedor_id: vendedorId, grupo_pedido: pedidoGrupo },
				data: { estado: "Cancelado" },
			});

			// 3. Anular CxC si existe
			await tx.cuentas_por_cobrar.updateMany({
				where: { vendedor_id: vendedorId, pedido_grupo: pedidoGrupo },
				data: { estado: "ANULADO", monto_pendiente: 0 },
			});

			// 4. Audit log
			await tx.audit_log.create({
				data: {
					vendedor_id: vendedorId,
					accion: "CANCEL_REMISION",
					entidad: "pedidos",
					entidad_id: pedidoGrupo,
					usuario_id: usuarioId ?? null,
					datos: { motivo, pedidosCount: pedidos.length },
				},
			});
		});

		return { success: true, pedidosCancelados: pedidos.length };
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `Error al cancelar remisión: ${msg}`,
		};
	}
}
