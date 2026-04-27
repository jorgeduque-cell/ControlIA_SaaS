CREATE TABLE IF NOT EXISTS "historico_precios" (
  "id" SERIAL PRIMARY KEY,
  "sku" TEXT NOT NULL,
  "precio_costo" DOUBLE PRECISION NOT NULL,
  "precio_venta" DOUBLE PRECISION NOT NULL,
  "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "historico_precios_sku_idx" ON "historico_precios"("sku");
