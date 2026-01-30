-- Migration 043: Add AMAS runtime state columns
-- Purpose: Persist visual fatigue, fused fatigue, mastery history, habit samples, and ensemble performance

ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "visualFatigue" DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "fusedFatigue" DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "masteryHistory" JSONB DEFAULT '[]';
ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "habitSamples" JSONB DEFAULT '[]';
ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "ensemblePerformance" JSONB DEFAULT '{}';
