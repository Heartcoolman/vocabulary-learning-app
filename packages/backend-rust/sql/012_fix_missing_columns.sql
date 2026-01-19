-- Migration: 012_fix_missing_columns.sql
-- Fix missing columns causing backend errors
-- NOTE: Tables that don't exist yet will be handled in later migrations

-- 1. anomaly_flags modifications moved to 014 (table created there)

-- 2. llm_advisor_suggestions modifications (table created in 006)
DO $$ BEGIN
    ALTER TABLE "llm_advisor_suggestions"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "llm_advisor_suggestions"
    ADD COLUMN IF NOT EXISTS "skippedItems" JSONB;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 3. Add missing columns to answer_records table
ALTER TABLE "answer_records"
ADD COLUMN IF NOT EXISTS "questionType" TEXT NOT NULL DEFAULT 'quiz',
ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "hintUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "answerGiven" TEXT;

-- 4. Add missing columns to learning_sessions table
ALTER TABLE "learning_sessions"
ADD COLUMN IF NOT EXISTS "flowPeakScore" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "avgCognitiveLoad" DOUBLE PRECISION;
