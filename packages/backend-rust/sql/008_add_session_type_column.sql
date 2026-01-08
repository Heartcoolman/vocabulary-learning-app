-- Migration: Add sessionType column to learning_sessions
-- Fix: column "sessionType" of relation "learning_sessions" does not exist

-- Create SessionType enum if not exists
DO $$ BEGIN
    CREATE TYPE "SessionType" AS ENUM ('NORMAL', 'SPACED_REPETITION', 'INTENSIVE', 'QUIZ');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add sessionType column with default value
ALTER TABLE "learning_sessions"
ADD COLUMN IF NOT EXISTS "sessionType" "SessionType" NOT NULL DEFAULT 'NORMAL';

-- Create index for sessionType
CREATE INDEX IF NOT EXISTS "learning_sessions_sessionType_idx" ON "learning_sessions"("sessionType");
