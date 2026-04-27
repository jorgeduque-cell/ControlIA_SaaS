import { createTool } from "@voltagent/core";
import { z } from "zod";
import { prisma } from "../../db/client.js";
import {
	type PedidoData,
	generatePedidoPDF,
} from "../../services/pdf-generator.js";

export const createOrderTool = createTool({
	name: "create_order",
	description:
		"Crear un nuevo pedido para un cliente. Registra el producto, cantidad y actualiza inventario de forma atómica.",
	tags: ["sales", "write", "order"],

	parameters: z.object({
		clienteId: z
			.number()
			.int()
			.describe("ID del cliente que realiza el pedido"),
		items: z
			.array(
				z.object({
					producto: z.string().describe("Nombre del producto"),
					cantidad: z.number().int().min(1).describe("Cantidad solicitada"),
					precioUnitario: z
						.number()
						.nullish()
						.describe(
							"Precio unitario opcional (de una cotización). Si no se da, usa el precio_venta del catálogo.",
						),
				}),
			)
			.describe("Lista de productos y cantidades"),
	}),

	execute: async (params, options) => {
		const context = options?.context;
		const vendedorNombre =
			(context?.get("vendedorNombre") as string | undefined) ?? "Vendedor";
		const vendedorIdStr = context?.get("userId") || context?.get("vendedorId");
		if (!vendedorIdStr) {
			throw new Error("Contexto de vendedor no disponible");
		}
		const vendedorId = BigInt(vendedorIdStr as string);

		const client = await prisma.clientes.findUnique({
			where: { id: params.clienteId },
		});

		if (!client || client.vendedor_id !== vendedorId) {
			return {
				success: false,
				message: "Cliente no encontrado o sin permisos.",
			};
		}

		// ── Validación previa: resolver todos los productos y precios ANTES de escribir ──
		type Resolved = {
			item: {
				producto: string;
				cantidad: number;
				precioUnitario?: number | null;
			};
			product: {
				id: number;
				nombre: string;
				precio_compra: number | null;
				precio_venta: number | null;
				stock_actual: number | null;
			};
			precioVenta: number;
			precioCompra: number;
		};
		const resolved: Resolved[] = [];

		for (const item of params.items) {
			const product = await prisma.productos.findFirst({
				where: {
					vendedor_id: vendedorId,
					nombre: { contains: item.producto, mode: "insensitive" },
				},
			});

			if (!product) {
				return {
					success: false,
					message: `❌ Producto "${item.producto}" no encontrado en tu catálogo. Regístralo en Inventario antes de crear el pedido.`,
				};
			}

			const precioVenta = item.precioUnitario ?? product.precio_venta ?? 0;
			if (precioVenta <= 0) {
				return {
					success: false,
					message: `❌ El producto "${product.nombre}" no tiene precio de venta configurado. Actualízalo en Inventario o pasa precioUnitario explícito.`,
				};
			}

			const stock = product.stock_actual ?? 0;
			if (stock < item.cantidad) {
				return {
					success: false,
					message: `❌ Stock insuficiente para "${product.nombre}": disponible ${stock}, pedido ${item.cantidad}.`,
				};
			}

			resolved.push({
				item,
				product: product as any,
				precioVenta,
				precioCompra: product.precio_compra ?? 0,
			});
		}

		// ── Escritura atómica: todos los pedidos + actualizaciones de stock en una transacción ──
		const createdOrders = await prisma.$transaction(async (tx) => {
			const orders = [];
			for (const r of resolved) {
				const order = await tx.pedidos.create({
					data: {
						vendedor_id: vendedorId,
						cliente_id: params.clienteId,
						producto: r.item.producto,
						cantidad: r.item.cantidad,
						precio_compra: r.precioCompra,
						precio_venta: r.precioVenta,
						estado: "Pendiente",
						estado_pago: "Pendiente",
						fecha: new Date(),
					},
				});

				const updateResult = await tx.productos.updateMany({
					where: { id: r.product.id, stock_actual: { gte: r.item.cantidad } },
					data: { stock_actual: { decrement: r.item.cantidad } },
				});
				if (updateResult.count === 0) {
					throw new Error(
						`❌ Stock insuficiente para "${r.product.nombre}" durante la transacción.`,
					);
				}

				orders.push(order);
			}
			return orders;
		});

		const totalVenta = resolved.reduce(
			(sum, r) => sum + r.precioVenta * r.item.cantidad,
			0,
		);

		const formatter = new Intl.NumberFormat("es-CO", {
			style: "currency",
			currency: "COP",
			minimumFractionDigits: 0,
		});

		// PDF de PEDIDO (no cotización). Se genera automáticamente y el adapter
		// de Telegram lo envía al detectar lastPdfPath en contexto.
		const fecha = new Date();
		const pedidoPrimario = createdOrders[0];
		const numeroPedido = `PED-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}-${String(Number(pedidoPrimario.id)).padStart(4, "0")}`;

		const pedidoData: PedidoData = {
			numero: numeroPedido,
			fecha,
			estado: pedidoPrimario.estado ?? "Pendiente",
			estadoPago: pedidoPrimario.estado_pago ?? "Pendiente",
			cliente: {
				nombre: client.nombre,
				telefono: client.telefono ?? undefined,
				direccion: client.direccion ?? undefined,
			},
			vendedor: { nombre: vendedorNombre },
			items: resolved.map((r) => ({
				producto: r.product.nombre,
				cantidad: r.item.cantidad,
				precioUnitario: r.precioVenta,
				subtotal: r.precioVenta * r.item.cantidad,
			})),
			subtotal: totalVenta,
			total: totalVenta,
		};

		let pdfPath: string | null = null;
		try {
			pdfPath = await generatePedidoPDF(pedidoData);
			if (context) {
				context.set("lastPdfPath", pdfPath);
				context.set("lastPdfName", `${numeroPedido}.pdf`);
			}
		} catch (e) {
			console.warn(
				"[CreateOrder] No se pudo generar PDF del pedido:",
				e instanceof Error ? e.message : e,
			);
		}

		return {
			success: true,
			message: `✅ Pedido ${numeroPedido} creado para "${client.nombre}". Total: ${formatter.format(totalVenta)}.${pdfPath ? `\n📄 PDF del pedido generado.` : ""}`,
			numero: numeroPedido,
			pdfPath,
			orders: createdOrders.map((o) => ({
				...o,
				id: Number(o.id),
				vendedor_id: Number(o.vendedor_id),
				cliente_id: o.cliente_id ? Number(o.cliente_id) : null,
			})),
		};
	},
});
