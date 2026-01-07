-- Migration: 013_fix_suggestion_effect_tracking.sql
-- Fix missing columns and tables for AMAS pipeline

-- 1. Fix suggestion_effect_tracking missing columns
ALTER TABLE "suggestion_effect_tracking"
ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "effectEvaluated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Create decision_insights table if not exists (defined in Prisma but missing in SQL migrations)
CREATE TABLE IF NOT EXISTS "decision_insights" (
    "id" TEXT PRIMARY KEY,
    "decision_id" TEXT NOT NULL UNIQUE,
    "user_id" TEXT NOT NULL,
    "state_snapshot" JSONB NOT NULL,
    "difficulty_factors" JSONB NOT NULL,
    "triggers" TEXT[] DEFAULT '{}',
    "feature_vector_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_decision_insights_user_decision" ON "decision_insights"("user_id", "decision_id");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_hash" ON "decision_insights"("feature_vector_hash");
CREATE INDEX IF NOT EXISTS "idx_decision_insights_created" ON "decision_insights"("created_at");

-- 3. Create pipeline_stages table if not exists (Rust code uses TEXT, not enum)
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
    "id" TEXT PRIMARY KEY,
    "decisionRecordId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "endedAt" TIMESTAMPTZ,
    "durationMs" INTEGER,
    "inputSummary" JSONB,
    "outputSummary" JSONB,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_record_stage" ON "pipeline_stages"("decisionRecordId", "stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_stage" ON "pipeline_stages"("stage");
CREATE INDEX IF NOT EXISTS "idx_pipeline_stages_status" ON "pipeline_stages"("status");
