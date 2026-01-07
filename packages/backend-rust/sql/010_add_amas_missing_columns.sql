-- Migration: Add missing columns to amas_user_models and decision_records

-- Add modelType column to amas_user_models
ALTER TABLE "amas_user_models"
ADD COLUMN IF NOT EXISTS "modelType" VARCHAR(64) NOT NULL DEFAULT 'default';

-- Add emotionLabel and flowScore columns to decision_records
ALTER TABLE "decision_records"
ADD COLUMN IF NOT EXISTS "emotionLabel" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "flowScore" DOUBLE PRECISION;
