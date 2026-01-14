-- Migration: Add word_review_traces table for FSRS algorithm debugging
-- This table tracks detailed review state changes for algorithm analysis

CREATE TABLE IF NOT EXISTS "word_review_traces" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "reviewType" TEXT,
    "beforeMastery" DOUBLE PRECISION DEFAULT 0,
    "afterMastery" DOUBLE PRECISION DEFAULT 0,
    "beforeInterval" DOUBLE PRECISION DEFAULT 0,
    "afterInterval" DOUBLE PRECISION DEFAULT 0,
    "quality" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_wrt_user_word" ON "word_review_traces"("userId", "wordId");
CREATE INDEX IF NOT EXISTS "idx_wrt_created" ON "word_review_traces"("createdAt" DESC);
