-- Migration: Add FSRS algorithm columns to word_learning_states
-- FSRS (Free Spaced Repetition Scheduler) requires word-level stability and difficulty tracking

-- Add FSRS columns
ALTER TABLE "word_learning_states"
ADD COLUMN IF NOT EXISTS "stability" DOUBLE PRECISION DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS "difficulty" DOUBLE PRECISION DEFAULT 0.3,
ADD COLUMN IF NOT EXISTS "desiredRetention" DOUBLE PRECISION DEFAULT 0.9,
ADD COLUMN IF NOT EXISTS "lapses" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reps" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "scheduledDays" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "elapsedDays" DOUBLE PRECISION DEFAULT 0.0;

-- Migrate existing data to FSRS format
UPDATE "word_learning_states" SET
  "stability" = CASE
    WHEN "reviewCount" >= 10 AND "state" = 'MASTERED' THEN 30.0
    WHEN "reviewCount" >= 5 THEN 10.0
    WHEN "reviewCount" >= 2 THEN 3.0
    ELSE 1.0
  END,
  "difficulty" = CASE
    WHEN "easeFactor" IS NOT NULL THEN GREATEST(0.1, LEAST(1.0, (3.0 - "easeFactor") / 1.5 + 0.3))
    ELSE 0.3
  END,
  "lapses" = CASE WHEN "state" = 'LEARNING' THEN 1 ELSE 0 END,
  "reps" = "reviewCount"
WHERE "stability" = 1.0 AND "reviewCount" > 0;

-- Create index for FSRS-based queries
CREATE INDEX IF NOT EXISTS "idx_wls_stability" ON "word_learning_states"("userId", "stability");
CREATE INDEX IF NOT EXISTS "idx_wls_fsrs_review" ON "word_learning_states"("userId", "scheduledDays", "nextReviewDate");
