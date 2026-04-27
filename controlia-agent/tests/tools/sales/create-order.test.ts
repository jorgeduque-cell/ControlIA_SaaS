import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../src/db/client.js";
import { createOrderTool } from "../../../src/tools/sales/create-order.js";
import { seedTestVendor, cleanupTestData, createTestContext } from "../../setup.js";

const VENDOR_ID = 999999999;

describe("createOrderTool", () => {
  let clienteId: number;
  let productId: number;

  beforeAll(async () => {
    await seedTestVendor(VENDOR_ID);

    const client = await prisma.clientes.create({
      data: {
        vendedor_id: VENDOR_ID,
        nombre: "Cliente Test",
        telefono: "3001234567",
      },
    });
    clienteId = client.id;

    const product = await prisma.productos.create({
      data: {
        vendedor_id: VENDOR_ID,
        nombre: "Aceite Test 1L",
        precio_compra: 10000,
        precio_venta: 10800,
        stock_actual: 10,
        stock_minimo: 2,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await cleanupTestData(VENDOR_ID);
    await prisma.$disconnect();
  });

  it("should create an order and deduct stock atomically", async () => {
    const result = await createOrderTool.execute(
      {
        clienteId,
        items: [{ producto: "Aceite Test 1L", cantidad: 3 }],
      },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(true);
    expect(result.orders).toHaveLength(1);

    const order = result.orders![0];
    expect(order.cantidad).toBe(3);
    expect(order.precio_venta).toBe(10800);

    const product = await prisma.productos.findUnique({ where: { id: productId } });
    expect(product?.stock_actual).toBe(7);
  });

  it("should reject order when stock is insufficient", async () => {
    const result = await createOrderTool.execute(
      {
        clienteId,
        items: [{ producto: "Aceite Test 1L", cantidad: 999 }],
      },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Stock insuficiente");

    // Ensure stock was NOT modified
    const product = await prisma.productos.findUnique({ where: { id: productId } });
    expect(product?.stock_actual).toBe(7);
  });

  it("should reject order for non-existent product", async () => {
    const result = await createOrderTool.execute(
      {
        clienteId,
        items: [{ producto: "Producto Inventado", cantidad: 1 }],
      },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("no encontrado");
  });

  it("should reject order for a client belonging to another vendor", async () => {
    // Create a different vendor and client
    const otherVendor = await prisma.vendedores.create({
      data: { id: 888888888, nombre_negocio: "Otro Vendor", estado: "Activo" },
    });
    const otherClient = await prisma.clientes.create({
      data: { vendedor_id: otherVendor.id, nombre: "Cliente Ajeno" },
    });

    const result = await createOrderTool.execute(
      {
        clienteId: otherClient.id,
        items: [{ producto: "Aceite Test 1L", cantidad: 1 }],
      },
      { context: createTestContext(VENDOR_ID) }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("sin permisos");

    await prisma.vendedores.delete({ where: { id: otherVendor.id } });
  });
});
