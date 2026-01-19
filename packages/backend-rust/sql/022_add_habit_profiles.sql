-- Migration: Add habit_profiles table
-- Created: 2026-01-14
-- Description: Add missing habit_profiles table for user habit tracking

CREATE TABLE IF NOT EXISTS "habit_profiles" (
    "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "timePref" JSONB,
    "rhythmPref" JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_habit_profiles_updated" ON "habit_profiles" ("updatedAt" DESC);
