-- 035_add_word_clusters.sql
-- Word clusters table for semantic theme grouping

CREATE TABLE IF NOT EXISTS "word_clusters" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "themeLabel" TEXT NOT NULL,
    "representativeWordId" TEXT NOT NULL
        REFERENCES "words"("id") ON DELETE CASCADE,
    "wordIds" TEXT[] NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "avgCohesion" FLOAT8 NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_word_clusters_model_dim"
    ON "word_clusters" ("model", "dim");

CREATE INDEX IF NOT EXISTS "idx_word_clusters_updated"
    ON "word_clusters" ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_word_clusters_word_ids_gin"
    ON "word_clusters" USING GIN ("wordIds");
