-- Enable pgvector extension (required for vector(1536) type)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to context_memory (nullable — rows without embedding use text search)
ALTER TABLE context_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_context_memory_embedding
  ON context_memory USING hnsw (embedding vector_cosine_ops);
