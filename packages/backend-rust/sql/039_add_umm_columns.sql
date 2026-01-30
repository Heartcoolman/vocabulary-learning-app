-- Migration: Add UMM (Unified Memory Model) columns and tables
-- UMM is an original memory algorithm system with MDM, IGE, SWD, MSMT, MTP, IAD, EVM modules

-- Add UMM columns to word_learning_states
ALTER TABLE "word_learning_states"
ADD COLUMN IF NOT EXISTS "ummStrength" DOUBLE PRECISION DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS "ummConsolidation" DOUBLE PRECISION DEFAULT 0.1,
ADD COLUMN IF NOT EXISTS "ummLastReviewTs" BIGINT DEFAULT NULL;

-- Create context_history table for EVM (Encoding Variability Metric)
CREATE TABLE IF NOT EXISTS "context_history" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "wordId" TEXT NOT NULL,
    "hourOfDay" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_context_history_user_word"
ON "context_history"("userId", "wordId");

CREATE INDEX IF NOT EXISTS "idx_context_history_timestamp"
ON "context_history"("userId", "timestamp" DESC);

-- Create index for UMM queries on word_learning_states
CREATE INDEX IF NOT EXISTS "idx_wls_umm_strength"
ON "word_learning_states"("userId", "ummStrength");
