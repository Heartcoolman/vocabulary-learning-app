-- Migration: Add Elo rating system for users and words

-- Add user ability Elo
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "abilityElo" DOUBLE PRECISION DEFAULT 1200.0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "eloGamesPlayed" INTEGER DEFAULT 0;

-- Add word difficulty Elo
ALTER TABLE "words" ADD COLUMN IF NOT EXISTS "difficultyElo" DOUBLE PRECISION DEFAULT 1200.0;
ALTER TABLE "words" ADD COLUMN IF NOT EXISTS "eloGamesPlayed" INTEGER DEFAULT 0;

-- Create indexes for efficient Elo-based queries
CREATE INDEX IF NOT EXISTS "idx_users_ability_elo" ON "users"("abilityElo");
CREATE INDEX IF NOT EXISTS "idx_words_difficulty_elo" ON "words"("difficultyElo");

-- Initialize word Elo based on existing difficulty data
UPDATE "words" SET
  "difficultyElo" = 1100.0 + 400.0 * LEAST(1.0, GREATEST(0.0, (LENGTH("spelling") - 3.0) / 12.0))
                  + 300.0 * LEAST(1.0, GREATEST(0.0, 1.0 - COALESCE("frequency", 0.5)))
WHERE "difficultyElo" = 1200.0;
