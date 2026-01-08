-- Migration: 012_fix_missing_columns.sql
-- Fix missing columns causing backend errors

-- 1. Add missing columns to anomaly_flags table
ALTER TABLE "anomaly_flags"
ADD COLUMN IF NOT EXISTS "recordId" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "idx_anomaly_flags_status" ON "anomaly_flags"("status");

-- 2. Add updatedAt column to llm_advisor_suggestions if not exists
ALTER TABLE "llm_advisor_suggestions"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Add skippedItems column to llm_advisor_suggestions if not exists
ALTER TABLE "llm_advisor_suggestions"
ADD COLUMN IF NOT EXISTS "skippedItems" JSONB;

-- 4. Add missing columns to answer_records table
ALTER TABLE "answer_records"
ADD COLUMN IF NOT EXISTS "questionType" TEXT NOT NULL DEFAULT 'quiz',
ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "hintUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "answerGiven" TEXT;

-- 5. Add missing columns to learning_sessions table
ALTER TABLE "learning_sessions"
ADD COLUMN IF NOT EXISTS "flowPeakScore" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "avgCognitiveLoad" DOUBLE PRECISION;
