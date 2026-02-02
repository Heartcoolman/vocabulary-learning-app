-- Migration: Rename UMM to AMAS for unified algorithm system consolidation
-- Changes: Table, column, and index names from umm_* to amas_*
-- This migration is idempotent (safe to run multiple times)

-- 1. Rename table umm_shadow_results -> amas_shadow_results
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'umm_shadow_results')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'amas_shadow_results') THEN
        ALTER TABLE "umm_shadow_results" RENAME TO "amas_shadow_results";
    END IF;
END $$;

-- 2. Rename columns in word_learning_states
-- ummStrength -> amasStrength
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'ummStrength')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'amasStrength') THEN
        ALTER TABLE "word_learning_states" RENAME COLUMN "ummStrength" TO "amasStrength";
    END IF;
END $$;

-- ummConsolidation -> amasConsolidation
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'ummConsolidation')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'amasConsolidation') THEN
        ALTER TABLE "word_learning_states" RENAME COLUMN "ummConsolidation" TO "amasConsolidation";
    END IF;
END $$;

-- ummLastReviewTs -> amasLastReviewTs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'ummLastReviewTs')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'word_learning_states' AND column_name = 'amasLastReviewTs') THEN
        ALTER TABLE "word_learning_states" RENAME COLUMN "ummLastReviewTs" TO "amasLastReviewTs";
    END IF;
END $$;

-- 3. Rename indexes
-- idx_wls_umm_strength -> idx_wls_amas_strength
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_wls_umm_strength')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_wls_amas_strength') THEN
        ALTER INDEX "idx_wls_umm_strength" RENAME TO "idx_wls_amas_strength";
    END IF;
END $$;

-- idx_umm_shadow_user_word -> idx_amas_shadow_user_word
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_umm_shadow_user_word')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_amas_shadow_user_word') THEN
        ALTER INDEX "idx_umm_shadow_user_word" RENAME TO "idx_amas_shadow_user_word";
    END IF;
END $$;

-- idx_umm_shadow_created -> idx_amas_shadow_created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_umm_shadow_created')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_amas_shadow_created') THEN
        ALTER INDEX "idx_umm_shadow_created" RENAME TO "idx_amas_shadow_created";
    END IF;
END $$;
