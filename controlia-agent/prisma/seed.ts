import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Crear vendedor
  await prisma.vendedores.upsert({
    where: { id: 659132607n },
    update: {},
    create: {
      id: 659132607n,
      nombre_negocio: 'Distribuidora de Aceites',
      estado: 'Activo',
      fecha_vencimiento: new Date('2026-12-31'),
      meta_mensual: 10000000,
    },
  });

  // Crear productos
  const productos = [
    { nombre: 'Riosol 900ml', precio_compra: 6200, precio_venta: 6696, stock: 100 },
    { nombre: 'Riosol 2L', precio_compra: 13500, precio_venta: 14580, stock: 80 },
    { nombre: 'Riosol 3L', precio_compra: 19500, precio_venta: 21060, stock: 60 },
    { nombre: 'Riosol 5L', precio_compra: 32000, precio_venta: 34560, stock: 50 },
    { nombre: 'Riosol 18L', precio_compra: 110000, precio_venta: 118800, stock: 30 },
    { nombre: 'Riosol 20L', precio_compra: 122500, precio_venta: 132300, stock: 25 },
    { nombre: 'Oleosoberano Palma 15kg', precio_compra: 98000, precio_venta: 105840, stock: 40 },
    { nombre: 'Oleosoberano Hidrogenado 15kg', precio_compra: 95000, precio_venta: 102600, stock: 35 },
  ];

  for (const p of productos) {
    await prisma.productos.create({
      data: {
        vendedor_id: 659132607n,
        nombre: p.nombre,
        precio_compra: p.precio_compra,
        precio_venta: p.precio_venta,
        stock_actual: p.stock,
        stock_minimo: Math.floor(p.stock * 0.2),
      },
    });

    await prisma.inventario.create({
      data: {
        vendedor_id: 659132607n,
        producto: p.nombre,
        stock_actual: p.stock,
        stock_minimo: Math.floor(p.stock * 0.2),
      },
    });
  }

  console.log('Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
