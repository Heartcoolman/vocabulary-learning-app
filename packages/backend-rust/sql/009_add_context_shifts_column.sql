-- Migration: Add contextShifts column to learning_sessions

ALTER TABLE "learning_sessions"
ADD COLUMN IF NOT EXISTS "contextShifts" INTEGER NOT NULL DEFAULT 0;
