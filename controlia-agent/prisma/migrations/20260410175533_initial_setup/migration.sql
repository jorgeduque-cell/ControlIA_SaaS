-- CreateTable
CREATE TABLE "baseClientes" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baseClientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "tipo_negocio" TEXT,
    "estado" TEXT DEFAULT 'Prospecto',
    "fecha_registro" DATE,
    "ultima_interaccion" DATE,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "dia_visita" TEXT,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finanzas" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "tipo" TEXT NOT NULL,
    "concepto" TEXT,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" DATE,
    "pedido_id" INTEGER,

    CONSTRAINT "finanzas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "producto" TEXT NOT NULL,
    "stock_actual" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "ultima_actualizacion" DATE,

    CONSTRAINT "inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" BIGSERIAL NOT NULL,
    "place_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "rating" DECIMAL,
    "location" geography,
    "zone_tag" TEXT,
    "status" TEXT DEFAULT 'new',
    "created_at" TIMESTAMPTZ(6) DEFAULT timezone('utc'::text, now()),
    "category" TEXT,
    "clean_phone" TEXT,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads_fijos" (
    "id" BIGSERIAL NOT NULL,
    "place_id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "clean_phone" TEXT,
    "address" TEXT,
    "rating" DECIMAL,
    "location" geography,
    "zone_tag" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT timezone('utc'::text, now()),

    CONSTRAINT "leads_fijos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "producto" TEXT NOT NULL,
    "meta_unidades" INTEGER NOT NULL DEFAULT 0,
    "mes" TEXT NOT NULL,
    "fecha_creacion" DATE,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_cliente" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" DATE,

    CONSTRAINT "notas_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_compra" DOUBLE PRECISION,
    "precio_venta" DOUBLE PRECISION,
    "estado" TEXT DEFAULT 'Pendiente',
    "estado_pago" TEXT DEFAULT 'Pendiente',
    "fecha" DATE,
    "grupo_pedido" TEXT,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_compra" DOUBLE PRECISION DEFAULT 0,
    "precio_venta" DOUBLE PRECISION DEFAULT 0,
    "stock_actual" INTEGER DEFAULT 0,
    "fecha_creacion" DATE DEFAULT CURRENT_DATE,
    "stock_minimo" INTEGER DEFAULT 0,
    "ultima_actualizacion" DATE,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" BIGINT NOT NULL,
    "nombre_negocio" TEXT NOT NULL DEFAULT 'Mi Negocio',
    "estado" TEXT NOT NULL DEFAULT 'Inactivo',
    "fecha_vencimiento" DATE,
    "telefono_soporte" TEXT,
    "fecha_registro" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "logo_base64" TEXT,
    "meta_mensual" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_memory" (
    "id" BIGSERIAL NOT NULL,
    "vendedor_id" BIGINT NOT NULL,
    "cliente_id" INTEGER,
    "tipo" VARCHAR(50) NOT NULL,
    "contenido" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_clientes_vendedor" ON "clientes"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_finanzas_vendedor" ON "finanzas"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_inventario_vendedor" ON "inventario"("vendedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_place_id_key" ON "leads"("place_id");

-- CreateIndex
CREATE INDEX "leads_geo_index" ON "leads" USING GIST ("location");

-- CreateIndex
CREATE UNIQUE INDEX "leads_fijos_place_id_key" ON "leads_fijos"("place_id");

-- CreateIndex
CREATE INDEX "leads_fijos_geo_index" ON "leads_fijos" USING GIST ("location");

-- CreateIndex
CREATE INDEX "idx_metas_vendedor" ON "metas"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_notas_vendedor" ON "notas_cliente"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_pedidos_vendedor" ON "pedidos"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_productos_vendedor" ON "productos"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_context_memory_vendedor" ON "context_memory"("vendedor_id");

-- CreateIndex
CREATE INDEX "idx_context_memory_cliente" ON "context_memory"("cliente_id");

-- CreateIndex
CREATE INDEX "idx_context_memory_tipo" ON "context_memory"("tipo");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finanzas" ADD CONSTRAINT "finanzas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finanzas" ADD CONSTRAINT "finanzas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notas_cliente" ADD CONSTRAINT "notas_cliente_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_memory" ADD CONSTRAINT "context_memory_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "context_memory" ADD CONSTRAINT "context_memory_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
