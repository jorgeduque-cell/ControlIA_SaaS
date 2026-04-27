import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../src/db/client.js";
import { markPaidTool } from "../../../src/tools/sales/mark-paid.js";
import { seedTestVendor, cleanupTestData, createTestContext } from "../../setup.js";

const VENDOR_ID = 999999998;

describe("markPaidTool", () => {
  let clientId: number;
  let orderId: number;

  beforeAll(async () => {
    await seedTestVendor(VENDOR_ID);

    const client = await prisma.clientes.create({
      data: {
        vendedor_id: VENDOR_ID,
        nombre: "Cliente Pago Test",
      },
    });
    clientId = client.id;

    const order = await prisma.pedidos.create({
      data: {
        vendedor_id: VENDOR_ID,
        cliente_id: clientId,
        producto: "Aceite Test 5L",
        cantidad: 2,
        precio_venta: 50000,
        precio_compra: 46296,
        estado: "Pendiente",
        estado_pago: "Pendiente",
        fecha: new Date(),
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await cleanupTestData(VENDOR_ID);
    await prisma.$disconnect();
  });

  it("should mark order as paid and record income in finanzas", async () => {
    const result = await markPaidTool.execute(
      { pedidoId: orderId },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("PAGADO");

    const updatedOrder = await prisma.pedidos.findUnique({
      where: { id: orderId },
    });
    expect(updatedOrder?.estado_pago).toBe("Pagado");

    const financeRecord = await prisma.finanzas.findFirst({
      where: { pedido_id: orderId },
    });
    expect(financeRecord).not.toBeNull();
    expect(financeRecord?.tipo).toBe("Ingreso");
    expect(financeRecord?.monto).toBe(100000); // 2 * 50000
  });

  it("should reject marking a non-existent order", async () => {
    const result = await markPaidTool.execute(
      { pedidoId: 999999999 },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("no encontrado");
  });

  it("should reject marking an order from another vendor", async () => {
    const otherVendor = await prisma.vendedores.create({
      data: { id: 777777777, nombre_negocio: "Vendor Ajeno", estado: "Activo" },
    });
    const otherClient = await prisma.clientes.create({
      data: { vendedor_id: otherVendor.id, nombre: "Cliente Ajeno" },
    });
    const otherOrder = await prisma.pedidos.create({
      data: {
        vendedor_id: otherVendor.id,
        cliente_id: otherClient.id,
        producto: "Producto Ajeno",
        cantidad: 1,
        precio_venta: 1000,
        estado: "Pendiente",
        estado_pago: "Pendiente",
        fecha: new Date(),
      },
    });

    const result = await markPaidTool.execute(
      { pedidoId: otherOrder.id },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("sin permisos");

    await prisma.vendedores.delete({ where: { id: otherVendor.id } });
  });
});
