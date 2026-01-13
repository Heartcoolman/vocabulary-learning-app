-- Migration: Add missing tables for backend-rust

-- 1. notifications table
DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'ACHIEVEMENT', 'REMINDER', 'ALERT', 'INFO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "notifications_userId_idx" ON "notifications"("userId");
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications"("status");

-- 2. user_preferences table
CREATE TABLE IF NOT EXISTS "user_preferences" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "preferredStudyTimeStart" TEXT DEFAULT '09:00',
    "preferredStudyTimeEnd" TEXT DEFAULT '21:00',
    "preferredDifficulty" TEXT DEFAULT 'adaptive',
    "dailyGoalEnabled" BOOLEAN DEFAULT true,
    "dailyGoalWords" INTEGER DEFAULT 20,
    "enableForgettingAlerts" BOOLEAN DEFAULT true,
    "enableAchievements" BOOLEAN DEFAULT true,
    "enableReminders" BOOLEAN DEFAULT true,
    "enableSystemNotif" BOOLEAN DEFAULT true,
    "reminderFrequency" TEXT DEFAULT 'daily',
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '08:00',
    "theme" TEXT DEFAULT 'light',
    "language" TEXT DEFAULT 'zh-CN',
    "soundEnabled" BOOLEAN DEFAULT true,
    "animationEnabled" BOOLEAN DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "user_preferences_userId_idx" ON "user_preferences"("userId");

-- 3. word_contexts table
CREATE TABLE IF NOT EXISTS "word_contexts" (
    "id" TEXT PRIMARY KEY,
    "wordId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "word_contexts_wordId_idx" ON "word_contexts"("wordId");

-- 4. visual_fatigue_records table
CREATE TABLE IF NOT EXISTS "visual_fatigue_records" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fusedScore" DOUBLE PRECISION,
    "perclos" DOUBLE PRECISION,
    "blinkRate" DOUBLE PRECISION,
    "yawnCount" INTEGER,
    "headPitch" DOUBLE PRECISION,
    "headYaw" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "visual_fatigue_records_userId_idx" ON "visual_fatigue_records"("userId");

-- 5. user_visual_fatigue_configs table
CREATE TABLE IF NOT EXISTS "user_visual_fatigue_configs" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "enabled" BOOLEAN DEFAULT false,
    "detectionFps" INTEGER DEFAULT 5,
    "uploadIntervalMs" INTEGER DEFAULT 30000,
    "vlmAnalysisEnabled" BOOLEAN DEFAULT false,
    "personalBaselineData" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "user_visual_fatigue_configs_userId_idx" ON "user_visual_fatigue_configs"("userId");

-- 6. system_insights table
CREATE TABLE IF NOT EXISTS "system_insights" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT NOT NULL,
    "segment" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "metrics" JSONB,
    "recommendations" JSONB,
    "status" TEXT DEFAULT 'ACTIVE',
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. system_weekly_reports table
CREATE TABLE IF NOT EXISTS "system_weekly_reports" (
    "id" TEXT PRIMARY KEY,
    "weekStart" TIMESTAMP(3),
    "weekEnd" TIMESTAMP(3),
    "summary" TEXT,
    "healthScore" DOUBLE PRECISION,
    "keyMetrics" JSONB,
    "userMetrics" JSONB,
    "learningMetrics" JSONB,
    "systemMetrics" JSONB,
    "highlights" JSONB,
    "concerns" JSONB,
    "recommendations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. forgetting_alerts table
CREATE TABLE IF NOT EXISTS "forgetting_alerts" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "predictedForgetAt" TIMESTAMP(3),
    "recallProbability" DOUBLE PRECISION,
    "status" TEXT DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId", "wordId")
);
CREATE INDEX IF NOT EXISTS "forgetting_alerts_userId_idx" ON "forgetting_alerts"("userId");

-- 9. llm_analysis table
CREATE TABLE IF NOT EXISTS "llm_analysis" (
    "id" TEXT PRIMARY KEY,
    "summary" TEXT,
    "suggestions" JSONB,
    "confidence" DOUBLE PRECISION,
    "dataQuality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. optimization_event table
CREATE TABLE IF NOT EXISTS "optimization_event" (
    "id" TEXT PRIMARY KEY,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "optimizedUsers" INTEGER DEFAULT 0,
    "skippedUsers" INTEGER DEFAULT 0,
    "errorCount" INTEGER DEFAULT 0,
    "durationMs" BIGINT DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. word_frequencies table (required for word_frequency view)
CREATE TABLE IF NOT EXISTS "word_frequencies" (
    "word_id" TEXT PRIMARY KEY,
    "frequency_rank" INTEGER NOT NULL DEFAULT 0,
    "frequency_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "corpus_source" TEXT NOT NULL DEFAULT 'default',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Create view/alias for table name differences (word_frequency -> word_frequencies)
CREATE OR REPLACE VIEW "word_frequency" AS SELECT "word_id", "frequency_score" FROM "word_frequencies";

-- 12. algorithm_config view (singular alias for algorithm_configs)
CREATE OR REPLACE VIEW "algorithm_config" AS SELECT * FROM "algorithm_configs";
