-- Migration: 014_complete_schema_sync.sql
-- Description: Complete schema synchronization between Prisma and Rust backend
-- Created: 2024-12-30
-- Purpose: Create all missing tables and add missing columns for full backend compatibility

-- ============================================================================
-- PART 1: CREATE MISSING ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "BadgeCategory" AS ENUM ('STREAK', 'ACCURACY', 'COGNITIVE', 'MILESTONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "LogLevel" AS ENUM ('TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "LogSource" AS ENUM ('BACKEND', 'FRONTEND', 'WORKER', 'SCHEDULER', 'MIGRATION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- PART 2: CREATE MISSING TABLES
-- ============================================================================

-- 1. study_plans table (Rust content.rs:364)
CREATE TABLE IF NOT EXISTS "study_plans" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordBookId" TEXT NOT NULL,
    "dailyNewWords" INTEGER NOT NULL DEFAULT 20,
    "dailyReviewWords" INTEGER NOT NULL DEFAULT 50,
    "startDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "endDate" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "wordBookId")
);
CREATE INDEX IF NOT EXISTS "idx_study_plans_user" ON "study_plans"("userId");
CREATE INDEX IF NOT EXISTS "idx_study_plans_active" ON "study_plans"("userId", "isActive");

-- 2. user_word_book_progress table (Rust content.rs:418)
CREATE TABLE IF NOT EXISTS "user_word_book_progress" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordBookId" TEXT NOT NULL,
    "learnedCount" INTEGER NOT NULL DEFAULT 0,
    "masteredCount" INTEGER NOT NULL DEFAULT 0,
    "totalWords" INTEGER NOT NULL DEFAULT 0,
    "lastStudyAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "wordBookId")
);
CREATE INDEX IF NOT EXISTS "idx_uwbp_user" ON "user_word_book_progress"("userId");

-- 3. user_learning_profiles table (Rust user.rs:77)
CREATE TABLE IF NOT EXISTS "user_learning_profiles" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "theta" DOUBLE PRECISION DEFAULT 0,
    "thetaVariance" DOUBLE PRECISION DEFAULT 1,
    "attention" DOUBLE PRECISION DEFAULT 0.7,
    "fatigue" DOUBLE PRECISION DEFAULT 0,
    "motivation" DOUBLE PRECISION DEFAULT 0.5,
    "emotionBaseline" TEXT DEFAULT 'neutral',
    "lastReportedEmotion" TEXT,
    "flowScore" DOUBLE PRECISION DEFAULT 0,
    "flowBaseline" DOUBLE PRECISION DEFAULT 0.5,
    "activePolicyVersion" TEXT DEFAULT 'v1',
    "forgettingParams" JSONB DEFAULT '{}',
    "learningSpeed" DOUBLE PRECISION DEFAULT 1.0,
    "retentionRate" DOUBLE PRECISION DEFAULT 0.8,
    "preferredDifficulty" DOUBLE PRECISION DEFAULT 0.5,
    "optimalBatchSize" INTEGER DEFAULT 10,
    "fatigueThreshold" DOUBLE PRECISION DEFAULT 0.7,
    "recoveryRate" DOUBLE PRECISION DEFAULT 0.1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_ulp_user" ON "user_learning_profiles"("userId");

-- 4. user_state_history table (Rust user.rs:113)
CREATE TABLE IF NOT EXISTS "user_state_history" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATE,
    "attention" DOUBLE PRECISION,
    "fatigue" DOUBLE PRECISION,
    "motivation" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "stability" DOUBLE PRECISION,
    "trendState" TEXT,
    "stateSnapshot" JSONB,
    "triggerEvent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "date")
);
CREATE INDEX IF NOT EXISTS "idx_ush_user" ON "user_state_history"("userId");
CREATE INDEX IF NOT EXISTS "idx_ush_date" ON "user_state_history"("userId", "date");

-- 5. user_interaction_stats table (Rust user.rs:192)
CREATE TABLE IF NOT EXISTS "user_interaction_stats" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "pronunciationClicks" INTEGER DEFAULT 0,
    "pauseCount" INTEGER DEFAULT 0,
    "pageSwitchCount" INTEGER DEFAULT 0,
    "totalInteractions" INTEGER DEFAULT 0,
    "totalSessionDuration" BIGINT DEFAULT 0,
    "lastActivityTime" TIMESTAMPTZ DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_uis_user" ON "user_interaction_stats"("userId");

-- 6. llm_advisor_suggestions table (Rust llm_advisor.rs:1793)
CREATE TABLE IF NOT EXISTS "llm_advisor_suggestions" (
    "id" TEXT PRIMARY KEY,
    "weekStart" TIMESTAMPTZ NOT NULL,
    "weekEnd" TIMESTAMPTZ NOT NULL,
    "statsSnapshot" JSONB NOT NULL,
    "rawResponse" TEXT,
    "parsedSuggestion" JSONB,
    "status" TEXT DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNotes" TEXT,
    "appliedItems" JSONB,
    "skippedItems" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_las_status" ON "llm_advisor_suggestions"("status");
CREATE INDEX IF NOT EXISTS "idx_las_created" ON "llm_advisor_suggestions"("createdAt");

-- 7. algorithm_configs table (Rust amas_config.rs:589)
CREATE TABLE IF NOT EXISTS "algorithm_configs" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT UNIQUE,
    "description" TEXT,
    "reviewIntervals" INTEGER[],
    "consecutiveCorrectThreshold" INTEGER DEFAULT 5,
    "consecutiveWrongThreshold" INTEGER DEFAULT 3,
    "difficultyAdjustmentInterval" INTEGER DEFAULT 1,
    "priorityWeightNewWord" INTEGER DEFAULT 40,
    "priorityWeightErrorRate" INTEGER DEFAULT 30,
    "priorityWeightOverdueTime" INTEGER DEFAULT 20,
    "priorityWeightWordScore" INTEGER DEFAULT 10,
    "scoreWeightAccuracy" INTEGER DEFAULT 40,
    "scoreWeightSpeed" INTEGER DEFAULT 30,
    "scoreWeightStability" INTEGER DEFAULT 20,
    "scoreWeightProficiency" INTEGER DEFAULT 10,
    "speedThresholdExcellent" INTEGER DEFAULT 3000,
    "speedThresholdGood" INTEGER DEFAULT 5000,
    "speedThresholdAverage" INTEGER DEFAULT 10000,
    "speedThresholdSlow" INTEGER DEFAULT 10000,
    "newWordRatioDefault" DOUBLE PRECISION DEFAULT 0.3,
    "newWordRatioHighAccuracy" DOUBLE PRECISION DEFAULT 0.5,
    "newWordRatioLowAccuracy" DOUBLE PRECISION DEFAULT 0.1,
    "newWordRatioHighAccuracyThreshold" DOUBLE PRECISION DEFAULT 0.85,
    "newWordRatioLowAccuracyThreshold" DOUBLE PRECISION DEFAULT 0.65,
    "masteryThresholds" JSONB,
    "isDefault" BOOLEAN DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_ac_default" ON "algorithm_configs"("isDefault");

-- 8. config_history table (Rust amas_config.rs:619)
CREATE TABLE IF NOT EXISTS "config_history" (
    "id" TEXT PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_ch_config" ON "config_history"("configId");
CREATE INDEX IF NOT EXISTS "idx_ch_changed_by" ON "config_history"("changedBy");
CREATE INDEX IF NOT EXISTS "idx_ch_timestamp" ON "config_history"("timestamp");

-- 9. badge_definitions table (Rust badge.rs)
CREATE TABLE IF NOT EXISTS "badge_definitions" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tier" INTEGER DEFAULT 1,
    "condition" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("name", "tier")
);

-- 10. user_badges table (Rust badge.rs:178)
CREATE TABLE IF NOT EXISTS "user_badges" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "tier" INTEGER DEFAULT 1,
    "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "badgeId", "tier")
);
CREATE INDEX IF NOT EXISTS "idx_ub_user" ON "user_badges"("userId");
CREATE INDEX IF NOT EXISTS "idx_ub_badge" ON "user_badges"("badgeId");

-- 11. learning_plans table (Rust plan.rs:678)
CREATE TABLE IF NOT EXISTS "learning_plans" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "dailyTarget" INTEGER NOT NULL,
    "estimatedCompletionDate" TIMESTAMPTZ NOT NULL,
    "wordbookDistribution" JSONB NOT NULL,
    "weeklyMilestones" JSONB NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "totalWords" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_lp_user" ON "learning_plans"("userId");

-- 12. user_learning_objectives table (Rust learning_objectives.rs:818)
CREATE TABLE IF NOT EXISTS "user_learning_objectives" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "mode" TEXT DEFAULT 'daily',
    "primaryObjective" TEXT DEFAULT 'accuracy',
    "minAccuracy" DOUBLE PRECISION,
    "maxDailyTime" INTEGER,
    "targetRetention" DOUBLE PRECISION,
    "weightShortTerm" DOUBLE PRECISION DEFAULT 0.4,
    "weightLongTerm" DOUBLE PRECISION DEFAULT 0.4,
    "weightEfficiency" DOUBLE PRECISION DEFAULT 0.2,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_ulo_user" ON "user_learning_objectives"("userId");

-- 13. objective_history table (Rust learning_objectives.rs:907)
CREATE TABLE IF NOT EXISTS "objective_history" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeMetrics" JSONB NOT NULL,
    "afterMetrics" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_oh_user" ON "objective_history"("userId");
CREATE INDEX IF NOT EXISTS "idx_oh_objective" ON "objective_history"("objectiveId");
CREATE INDEX IF NOT EXISTS "idx_oh_timestamp" ON "objective_history"("timestamp");

-- 14. log_alert_rules table (Rust admin/logs.rs:400)
CREATE TABLE IF NOT EXISTS "log_alert_rules" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN DEFAULT true,
    "levels" TEXT[],
    "module" TEXT,
    "messagePattern" TEXT,
    "threshold" INTEGER NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "webhookUrl" TEXT,
    "cooldownMinutes" INTEGER DEFAULT 30,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_lar_enabled" ON "log_alert_rules"("enabled");

-- 15. system_logs table (Rust logs.rs:222)
CREATE TABLE IF NOT EXISTS "system_logs" (
    "id" TEXT PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "module" TEXT,
    "source" TEXT DEFAULT 'BACKEND',
    "context" JSONB,
    "error" JSONB,
    "requestId" TEXT,
    "userId" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "app" TEXT,
    "env" TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_sl_timestamp" ON "system_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "idx_sl_level" ON "system_logs"("level");
CREATE INDEX IF NOT EXISTS "idx_sl_module" ON "system_logs"("module");
CREATE INDEX IF NOT EXISTS "idx_sl_source" ON "system_logs"("source");
CREATE INDEX IF NOT EXISTS "idx_sl_user" ON "system_logs"("userId");
CREATE INDEX IF NOT EXISTS "idx_sl_request" ON "system_logs"("requestId");

-- 16. anomaly_flags table (Rust admin.rs:1169)
CREATE TABLE IF NOT EXISTS "anomaly_flags" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "recordId" TEXT,
    "flaggedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "flaggedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "resolved" BOOLEAN DEFAULT false,
    "resolvedAt" TIMESTAMPTZ,
    "resolvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "wordId")
);
CREATE INDEX IF NOT EXISTS "idx_af_user" ON "anomaly_flags"("userId");
CREATE INDEX IF NOT EXISTS "idx_af_word" ON "anomaly_flags"("wordId");
CREATE INDEX IF NOT EXISTS "idx_af_flagged_at" ON "anomaly_flags"("flaggedAt");
CREATE INDEX IF NOT EXISTS "idx_af_status" ON "anomaly_flags"("status");

-- 17. feature_vectors table (Rust amas.rs:263)
CREATE TABLE IF NOT EXISTS "feature_vectors" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "answerRecordId" TEXT,
    "featureVersion" INTEGER DEFAULT 1,
    "vector" DOUBLE PRECISION[],
    "labels" JSONB,
    "features" JSONB,
    "normMethod" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("answerRecordId", "featureVersion")
);
CREATE INDEX IF NOT EXISTS "idx_fv_user" ON "feature_vectors"("userId");
CREATE INDEX IF NOT EXISTS "idx_fv_session" ON "feature_vectors"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_fv_answer" ON "feature_vectors"("answerRecordId");

-- 18. reward_queue table (Rust delayed_reward.rs:89)
CREATE TABLE IF NOT EXISTS "reward_queue" (
    "id" TEXT PRIMARY KEY,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "answerRecordId" TEXT,
    "dueTs" TIMESTAMPTZ NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "status" TEXT DEFAULT 'PENDING',
    "idempotencyKey" TEXT UNIQUE,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_rq_due_status" ON "reward_queue"("dueTs", "status");
CREATE INDEX IF NOT EXISTS "idx_rq_user" ON "reward_queue"("userId");
CREATE INDEX IF NOT EXISTS "idx_rq_session" ON "reward_queue"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_rq_user_status_due" ON "reward_queue"("userId", "status", "dueTs");
CREATE INDEX IF NOT EXISTS "idx_rq_answer" ON "reward_queue"("answerRecordId");

-- ============================================================================
-- PART 3: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- suggestion_effect_tracking (covered by 013, but ensure completeness)
ALTER TABLE "suggestion_effect_tracking"
ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "effectEvaluated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- amas_user_states
ALTER TABLE "amas_user_states"
ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION DEFAULT 0.5;

-- amas_user_models
ALTER TABLE "amas_user_models"
ADD COLUMN IF NOT EXISTS "parameters" JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;

-- decision_records
ALTER TABLE "decision_records"
ADD COLUMN IF NOT EXISTS "actionRationale" TEXT,
ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT NOW();

-- user_preferences
ALTER TABLE "user_preferences"
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- llm_analysis_tasks
ALTER TABLE "llm_analysis_tasks"
ADD COLUMN IF NOT EXISTS "retryCount" INTEGER DEFAULT 0;

-- notifications
ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;

-- forgetting_alerts
ALTER TABLE "forgetting_alerts"
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ;

-- system_weekly_reports
ALTER TABLE "system_weekly_reports"
ADD COLUMN IF NOT EXISTS "rawLLMResponse" TEXT,
ADD COLUMN IF NOT EXISTS "tokensUsed" INTEGER;

-- alert_root_cause_analyses
ALTER TABLE "alert_root_cause_analyses"
ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- PART 4: CREATE VIEWS AND ALIASES
-- ============================================================================

-- algorithm_config view (singular alias for worker compatibility)
CREATE OR REPLACE VIEW "algorithm_config" AS SELECT * FROM "algorithm_configs";

-- ============================================================================
-- PART 5: ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_wls_user_mastery" ON "word_learning_states"("userId", "masteryLevel");
CREATE INDEX IF NOT EXISTS "idx_wls_next_review" ON "word_learning_states"("nextReviewDate");
CREATE INDEX IF NOT EXISTS "idx_ar_user_timestamp" ON "answer_records"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_dr_session" ON "decision_records"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_dr_simulation" ON "decision_records"("isSimulation");
CREATE INDEX IF NOT EXISTS "idx_ls_user_started" ON "learning_sessions"("userId", "startedAt");
