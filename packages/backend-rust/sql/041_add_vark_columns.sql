-- Migration 041: Add VARK Learning Style columns
-- Purpose: Support VARK four-dimensional learning style model with ML scoring

-- 1. answer_records table: Add VARK interaction tracking columns
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageViewCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageZoomCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageLongPressMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioPlayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioReplayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioSpeedAdjust" BOOLEAN DEFAULT false;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "definitionReadMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "exampleReadMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "noteWriteCount" INTEGER DEFAULT 0;

-- 2. user_interaction_stats table: Add VARK aggregated stats
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "avgSessionDurationMs" BIGINT DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "sessionBreakCount" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "preferredReviewInterval" INTEGER DEFAULT 24;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalImageInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalAudioInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalReadingMs" BIGINT DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalWritingActions" INTEGER DEFAULT 0;

-- 3. user_vark_models table: Store ML model weights per user
CREATE TABLE IF NOT EXISTS "user_vark_models" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "sampleCount" INTEGER DEFAULT 0,
    "isMLEnabled" BOOLEAN DEFAULT false,
    "visualWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "auditoryWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "readingWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "kinestheticWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "visualBias" DOUBLE PRECISION DEFAULT 0,
    "auditoryBias" DOUBLE PRECISION DEFAULT 0,
    "readingBias" DOUBLE PRECISION DEFAULT 0,
    "kinestheticBias" DOUBLE PRECISION DEFAULT 0,
    "lastCalibration" INTEGER DEFAULT 0,
    "lastTrainedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_user_vark_models_userId" ON "user_vark_models"("userId");
