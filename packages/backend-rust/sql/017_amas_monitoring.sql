-- AMAS Monitoring Tables
-- Migration 017: Add tables for AMAS health monitoring and LLM analysis

-- 1. Raw monitoring events (sampled storage)
CREATE TABLE IF NOT EXISTS "amas_monitoring_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'process_event',
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    "latencyMs" INTEGER NOT NULL,
    "isAnomaly" BOOLEAN NOT NULL DEFAULT FALSE,
    "invariantViolations" JSONB DEFAULT '[]',
    "userState" JSONB NOT NULL,
    "strategy" JSONB NOT NULL,
    "reward" JSONB NOT NULL,
    "coldStartPhase" TEXT,
    "constraintsSatisfied" BOOLEAN,
    "objectiveScore" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_ame_timestamp ON "amas_monitoring_events"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_ame_user ON "amas_monitoring_events"("userId");
CREATE INDEX IF NOT EXISTS idx_ame_anomaly ON "amas_monitoring_events"("isAnomaly") WHERE "isAnomaly" = TRUE;

-- 2. 15-minute aggregates
CREATE TABLE IF NOT EXISTS "amas_monitoring_aggregates_15m" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "periodStart" TIMESTAMP NOT NULL,
    "periodEnd" TIMESTAMP NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "invariantViolationCount" INTEGER NOT NULL DEFAULT 0,
    "latencyP50" INTEGER,
    "latencyP95" INTEGER,
    "latencyP99" INTEGER,
    "latencyMax" INTEGER,
    "avgAttention" DOUBLE PRECISION,
    "avgFatigue" DOUBLE PRECISION,
    "avgMotivation" DOUBLE PRECISION,
    "avgConfidence" DOUBLE PRECISION,
    "constraintsSatisfiedRate" DOUBLE PRECISION,
    "coldStartExploreCount" INTEGER DEFAULT 0,
    "coldStartClassifyCount" INTEGER DEFAULT 0,
    "alertLevel" TEXT NOT NULL DEFAULT 'ok',
    "alertReasons" TEXT[] DEFAULT '{}',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ama15_period ON "amas_monitoring_aggregates_15m"("periodStart");
CREATE INDEX IF NOT EXISTS idx_ama15_alert ON "amas_monitoring_aggregates_15m"("alertLevel") WHERE "alertLevel" != 'ok';

-- 3. Daily aggregates
CREATE TABLE IF NOT EXISTS "amas_monitoring_aggregates_daily" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "totalEvents" BIGINT NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "totalAnomalies" INTEGER NOT NULL DEFAULT 0,
    "latencyDistribution" JSONB NOT NULL DEFAULT '{}',
    "stateMetrics" JSONB NOT NULL DEFAULT '{}',
    "constraintHealth" JSONB NOT NULL DEFAULT '{}',
    "coldStartFunnel" JSONB NOT NULL DEFAULT '{}',
    "warnPeriods" INTEGER NOT NULL DEFAULT 0,
    "criticalPeriods" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_amad_date ON "amas_monitoring_aggregates_daily"("date");

-- 4. Weekly aggregates
CREATE TABLE IF NOT EXISTS "amas_monitoring_aggregates_weekly" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "totalEvents" BIGINT NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "totalAnomalies" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyP95" DOUBLE PRECISION,
    "avgConstraintRate" DOUBLE PRECISION,
    "warnPeriods" INTEGER NOT NULL DEFAULT 0,
    "criticalPeriods" INTEGER NOT NULL DEFAULT 0,
    "dailyTrend" JSONB NOT NULL DEFAULT '[]',
    "healthScore" DOUBLE PRECISION,
    "healthStatus" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_amaw_week ON "amas_monitoring_aggregates_weekly"("weekStart");

-- 5. LLM health reports
CREATE TABLE IF NOT EXISTS "amas_health_reports" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL,
    "healthStatus" TEXT NOT NULL,
    "insights" JSONB NOT NULL DEFAULT '{}',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ahr_week ON "amas_health_reports"("weekStart" DESC);
CREATE INDEX IF NOT EXISTS idx_ahr_status ON "amas_health_reports"("healthStatus");
