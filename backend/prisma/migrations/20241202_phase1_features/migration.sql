-- AlterTable (Add rewardProfile column if not exists)
-- This field stores the user's selected reward profile for multi-objective optimization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'rewardProfile'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "rewardProfile" TEXT NOT NULL DEFAULT 'standard';
    END IF;
END $$;

-- Add index for faster rewardProfile lookups (optional optimization)
CREATE INDEX IF NOT EXISTS "users_rewardProfile_idx" ON "users"("rewardProfile");

-- Comment on column
COMMENT ON COLUMN "users"."rewardProfile" IS 'User learning mode: standard, cram, or relaxed (Multi-Objective Optimization)';
