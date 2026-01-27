-- 033_add_word_embeddings.sql
-- pgvector extension + word embeddings table for semantic search

-- Enable pgvector extension (requires PostgreSQL with pgvector installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Word embeddings table
CREATE TABLE IF NOT EXISTS "word_embeddings" (
    "wordId" TEXT PRIMARY KEY REFERENCES "words"("id") ON DELETE CASCADE,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for model filtering
CREATE INDEX IF NOT EXISTS "idx_word_embeddings_model"
    ON "word_embeddings" ("model");

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "idx_word_embeddings_embedding_hnsw"
    ON "word_embeddings"
    USING hnsw ("embedding" vector_cosine_ops);

-- Index for content hash to avoid recomputing unchanged words
CREATE INDEX IF NOT EXISTS "idx_word_embeddings_content_hash"
    ON "word_embeddings" ("contentHash");
