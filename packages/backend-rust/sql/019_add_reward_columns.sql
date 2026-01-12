-- Add reward tracking columns to word_learning_states
ALTER TABLE "word_learning_states" ADD COLUMN IF NOT EXISTS "lastRewardApplied" DOUBLE PRECISION;
ALTER TABLE "word_learning_states" ADD COLUMN IF NOT EXISTS "cumulativeReward" DOUBLE PRECISION DEFAULT 0;
