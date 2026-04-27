-- Marca entradas de context_memory que ya fueron consolidadas en un resumen
ALTER TABLE context_memory ADD COLUMN IF NOT EXISTS consolidado BOOLEAN NOT NULL DEFAULT false;

-- Índice para que el job de consolidación encuentre rápido las entradas pendientes
CREATE INDEX IF NOT EXISTS idx_context_memory_consolidado
  ON context_memory (vendedor_id, cliente_id, consolidado)
  WHERE consolidado = false;
