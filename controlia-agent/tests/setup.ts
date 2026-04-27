import { prisma } from "../src/db/client.js";

export const TEST_VENDOR_ID = 999999999;

export async function seedTestVendor(vendorId: number = TEST_VENDOR_ID) {
  try {
    await prisma.vendedores.upsert({
      where: { id: vendorId },
      update: {},
      create: {
        id: vendorId,
        nombre_negocio: "Test Vendor",
        estado: "Activo",
      },
    });
  } catch {
    // If upsert races in parallel tests, the row likely already exists
    const existing = await prisma.vendedores.findUnique({ where: { id: vendorId } });
    if (!existing) throw new Error(`Failed to seed test vendor ${vendorId}`);
  }
}

export async function cleanupTestData(vendorId: number = TEST_VENDOR_ID) {
  await prisma.vendedores.deleteMany({
    where: { id: vendorId },
  });
}

export function createTestContext(vendorId: number = TEST_VENDOR_ID) {
  const ctx = new Map<string, unknown>();
  ctx.set("userId", String(vendorId));
  ctx.set("vendedorId", String(vendorId));
  return ctx;
}
