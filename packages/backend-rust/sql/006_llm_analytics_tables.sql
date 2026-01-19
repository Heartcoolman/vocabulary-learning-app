-- 006: LLM and Analytics Tables
-- Creates tables for LLM task management, analytics, and password reset

-- 1. Password Reset Tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP NOT NULL,
    "used" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens("userId");
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens("token");

-- 2. Suggestion Effect Tracking
CREATE TABLE IF NOT EXISTS "suggestion_effect_tracking" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "suggestionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "targetParam" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "metricsBeforeApply" JSONB NOT NULL DEFAULT '{}',
    "metricsAfterApply" JSONB,
    "effectScore" DOUBLE PRECISION,
    "effectAnalysis" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "evaluatedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_set_suggestion ON suggestion_effect_tracking("suggestionId");

-- 3. Word Content Variants (AI-generated content)
CREATE TABLE IF NOT EXISTS "word_content_variants" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "wordId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" JSONB,
    "generatedValue" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "taskId" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wcv_word ON word_content_variants("wordId");
CREATE INDEX IF NOT EXISTS idx_wcv_status ON word_content_variants("status");

-- 4. LLM Analysis Tasks
CREATE TABLE IF NOT EXISTS "llm_analysis_tasks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "taskType" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "tokensUsed" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "startedAt" TIMESTAMP,
    "completedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lat_status ON llm_analysis_tasks("status");
CREATE INDEX IF NOT EXISTS idx_lat_type ON llm_analysis_tasks("taskType");
CREATE INDEX IF NOT EXISTS idx_lat_priority ON llm_analysis_tasks("priority" DESC, "createdAt" ASC);

-- 5. User Behavior Insights
CREATE TABLE IF NOT EXISTS "user_behavior_insights" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "analysisDate" DATE NOT NULL,
    "userSegment" TEXT NOT NULL,
    "patterns" JSONB NOT NULL DEFAULT '{}',
    "insights" JSONB NOT NULL DEFAULT '{}',
    "recommendations" JSONB NOT NULL DEFAULT '{}',
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "dataPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("analysisDate", "userSegment")
);
CREATE INDEX IF NOT EXISTS idx_ubi_date ON user_behavior_insights("analysisDate");

-- 6. Alert Root Cause Analyses
CREATE TABLE IF NOT EXISTS "alert_root_cause_analyses" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "alertRuleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "suggestedFixes" JSONB NOT NULL DEFAULT '[]',
    "relatedMetrics" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL,
    "resolved" BOOLEAN DEFAULT FALSE,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "resolvedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_arca_alert ON alert_root_cause_analyses("alertRuleId");
CREATE INDEX IF NOT EXISTS idx_arca_resolved ON alert_root_cause_analyses("resolved");
