-- Migration: Add missing columns to amas_user_models and decision_records

-- Create amas_user_models table if not exists
CREATE TABLE IF NOT EXISTS "amas_user_models" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "modelType" VARCHAR(64) NOT NULL DEFAULT 'default',
    "modelData" TEXT,
    "parameters" JSONB DEFAULT '{}',
    "version" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "modelType")
);

CREATE INDEX IF NOT EXISTS "idx_amas_user_models_userId" ON "amas_user_models"("userId");

-- Add modelType column to amas_user_models (for existing tables)
ALTER TABLE "amas_user_models"
ADD COLUMN IF NOT EXISTS "modelType" VARCHAR(64) NOT NULL DEFAULT 'default';

-- Add emotionLabel and flowScore columns to decision_records
ALTER TABLE "decision_records"
ADD COLUMN IF NOT EXISTS "emotionLabel" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "flowScore" DOUBLE PRECISION;
