-- Migration: Add AIR (Adaptive Item Response) columns to word_learning_states
-- AIR uses IRT-based ability estimation with item-specific parameters

-- Add AIR item parameters (per user-word combination)
-- α (discrimination): how well the item distinguishes between ability levels
-- β (difficulty): IRT difficulty parameter (converted from Elo scale)
ALTER TABLE "word_learning_states"
ADD COLUMN IF NOT EXISTS "airAlpha" DOUBLE PRECISION DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS "airBeta" DOUBLE PRECISION;

-- Add AIR user state columns to users table
-- θ (theta): user ability estimate
-- fisher_info_sum: accumulated Fisher information for confidence calculation
-- air_response_count: total AIR responses for learning rate decay
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "airTheta" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "airFisherInfoSum" DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "airResponseCount" INTEGER DEFAULT 0;

-- Initialize airBeta from word's difficultyElo (if available)
-- Formula: β = (elo - 1200) / 400, clamped to [-3, 3]
UPDATE "word_learning_states" wls
SET "airBeta" = GREATEST(-3.0, LEAST(3.0, (w."difficultyElo" - 1200.0) / 400.0))
FROM "words" w
WHERE wls."wordId" = w."id"
  AND wls."airBeta" IS NULL
  AND w."difficultyElo" IS NOT NULL;

-- Default airBeta to 0.0 for words without Elo
UPDATE "word_learning_states"
SET "airBeta" = 0.0
WHERE "airBeta" IS NULL;

-- Create index for AIR queries
CREATE INDEX IF NOT EXISTS "idx_wls_air_params" ON "word_learning_states"("userId", "airAlpha", "airBeta");
CREATE INDEX IF NOT EXISTS "idx_users_air_theta" ON "users"("airTheta");
