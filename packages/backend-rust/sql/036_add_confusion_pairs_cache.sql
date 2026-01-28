-- 036_add_confusion_pairs_cache.sql
-- Precomputed confusion pairs cache for O(1) lookup

CREATE TABLE IF NOT EXISTS "confusion_pairs_cache" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "word1Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "word2Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "wordBookId" TEXT NOT NULL REFERENCES "word_books"("id") ON DELETE CASCADE,
    "clusterId" TEXT REFERENCES "word_clusters"("id") ON DELETE SET NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE ("word1Id", "word2Id", "model")
);

CREATE INDEX IF NOT EXISTS "idx_confusion_cache_cluster_distance"
    ON "confusion_pairs_cache" ("clusterId", "distance");

CREATE INDEX IF NOT EXISTS "idx_confusion_cache_wordbook_distance"
    ON "confusion_pairs_cache" ("wordBookId", "distance");

CREATE INDEX IF NOT EXISTS "idx_confusion_cache_word1"
    ON "confusion_pairs_cache" ("word1Id");

CREATE INDEX IF NOT EXISTS "idx_confusion_cache_word2"
    ON "confusion_pairs_cache" ("word2Id");
