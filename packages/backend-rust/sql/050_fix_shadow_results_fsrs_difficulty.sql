-- Migration: Fix FSRS difficulty column typo in shadow results table
-- Background: Migration 040 accidentally created "frssDifficulty" (typo). Code expects "fsrsDifficulty".
-- This migration is idempotent and handles both pre-047 (umm_*) and post-047 (amas_*) table names.

-- Rename typo column where possible
DO $$
BEGIN
    -- amas_shadow_results: frssDifficulty -> fsrsDifficulty
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'amas_shadow_results' AND column_name = 'frssDifficulty'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'amas_shadow_results' AND column_name = 'fsrsDifficulty'
    ) THEN
        ALTER TABLE "amas_shadow_results" RENAME COLUMN "frssDifficulty" TO "fsrsDifficulty";
    END IF;

    -- umm_shadow_results: frssDifficulty -> fsrsDifficulty (in case 047 wasn't applied yet)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'umm_shadow_results' AND column_name = 'frssDifficulty'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'umm_shadow_results' AND column_name = 'fsrsDifficulty'
    ) THEN
        ALTER TABLE "umm_shadow_results" RENAME COLUMN "frssDifficulty" TO "fsrsDifficulty";
    END IF;
END $$;

-- If the column is still missing (e.g. table created externally), add it with a safe default.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'amas_shadow_results')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'amas_shadow_results' AND column_name = 'fsrsDifficulty'
       ) THEN
        ALTER TABLE "amas_shadow_results"
            ADD COLUMN "fsrsDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.3;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'umm_shadow_results')
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'umm_shadow_results' AND column_name = 'fsrsDifficulty'
       ) THEN
        ALTER TABLE "umm_shadow_results"
            ADD COLUMN "fsrsDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.3;
    END IF;
END $$;

