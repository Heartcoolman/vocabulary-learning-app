-- Migration: Ensure morpheme network tables exist
-- Some environments may have 016 marked as applied but still miss the actual tables.
-- This migration re-applies the schema in an idempotent way.

-- 1. morphemes: Dictionary of word roots, prefixes, suffixes
CREATE TABLE IF NOT EXISTS "morphemes" (
    "id" TEXT PRIMARY KEY,
    "surface" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('prefix', 'root', 'suffix')),
    "meaning" TEXT,
    "meaningZh" TEXT,
    "language" TEXT DEFAULT 'latin',
    "etymology" TEXT,
    "aliases" TEXT[] DEFAULT '{}',
    "frequency" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("surface", "type", "language")
);

CREATE INDEX IF NOT EXISTS "idx_morphemes_surface" ON "morphemes"("surface");
CREATE INDEX IF NOT EXISTS "idx_morphemes_type" ON "morphemes"("type");
CREATE INDEX IF NOT EXISTS "idx_morphemes_frequency" ON "morphemes"("frequency" DESC);

-- 2. word_morphemes: Links words to their morphological components
CREATE TABLE IF NOT EXISTS "word_morphemes" (
    "wordId" TEXT NOT NULL,
    "morphemeId" TEXT NOT NULL REFERENCES "morphemes"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL CHECK ("role" IN ('prefix', 'root', 'suffix')),
    "position" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION DEFAULT 1.0,
    "confidence" DOUBLE PRECISION DEFAULT 0.7,
    "source" TEXT DEFAULT 'api',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("wordId", "morphemeId", "role", "position")
);

CREATE INDEX IF NOT EXISTS "idx_word_morphemes_word" ON "word_morphemes"("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_morphemes_morpheme" ON "word_morphemes"("morphemeId");
CREATE INDEX IF NOT EXISTS "idx_word_morphemes_role" ON "word_morphemes"("role");

-- 3. user_morpheme_states: Per-user mastery of morphemes (for algorithm integration)
CREATE TABLE IF NOT EXISTS "user_morpheme_states" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "morphemeId" TEXT NOT NULL REFERENCES "morphemes"("id") ON DELETE CASCADE,
    "masteryLevel" DOUBLE PRECISION DEFAULT 0.0,
    "stability" DOUBLE PRECISION DEFAULT 1.0,
    "difficulty" DOUBLE PRECISION DEFAULT 0.3,
    "exposureCount" INTEGER DEFAULT 0,
    "correctCount" INTEGER DEFAULT 0,
    "lapses" INTEGER DEFAULT 0,
    "reps" INTEGER DEFAULT 0,
    "lastSeenAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "morphemeId")
);

CREATE INDEX IF NOT EXISTS "idx_ums_user" ON "user_morpheme_states"("userId");
CREATE INDEX IF NOT EXISTS "idx_ums_morpheme" ON "user_morpheme_states"("morphemeId");
CREATE INDEX IF NOT EXISTS "idx_ums_mastery" ON "user_morpheme_states"("userId", "masteryLevel" DESC);

-- 4. Helper view: Word family (words sharing same root)
CREATE OR REPLACE VIEW "word_family_view" AS
SELECT
    m."id" AS "morphemeId",
    m."surface" AS "rootSurface",
    m."meaning" AS "rootMeaning",
    m."meaningZh" AS "rootMeaningZh",
    wm."wordId",
    wm."role",
    wm."position"
FROM "morphemes" m
JOIN "word_morphemes" wm ON wm."morphemeId" = m."id"
WHERE m."type" = 'root';

