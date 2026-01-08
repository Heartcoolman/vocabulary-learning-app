-- 007_optimization_causal_tables.sql
-- 贝叶斯优化器和因果推断相关表

-- 贝叶斯优化器状态表
CREATE TABLE IF NOT EXISTS "bayesian_optimizer_state" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "observations" JSONB NOT NULL DEFAULT '[]',
    "bestParams" JSONB,
    "bestValue" DOUBLE PRECISION,
    "evaluationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 因果观察表
CREATE TABLE IF NOT EXISTS "causal_observations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "treatment" INTEGER NOT NULL CHECK (treatment IN (0, 1)),
    "outcome" DOUBLE PRECISION NOT NULL CHECK (outcome >= -1 AND outcome <= 1),
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_co_user ON causal_observations("userId");
CREATE INDEX IF NOT EXISTS idx_co_treatment ON causal_observations("treatment");

-- A/B 实验元数据表
CREATE TABLE IF NOT EXISTS "ab_experiments" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trafficAllocation" TEXT NOT NULL DEFAULT 'EVEN',
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "significanceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "minimumDetectableEffect" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "autoDecision" BOOLEAN DEFAULT FALSE,
    "startedAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- A/B 实验变体表
CREATE TABLE IF NOT EXISTS "ab_variants" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "experimentId" UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isControl" BOOLEAN DEFAULT FALSE,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abv_experiment ON ab_variants("experimentId");

-- A/B 用户分配表
CREATE TABLE IF NOT EXISTS "ab_user_assignments" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "experimentId" UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL,
    "variantId" UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
    "assignedAt" TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE("experimentId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_abua_user ON ab_user_assignments("userId");
CREATE INDEX IF NOT EXISTS idx_abua_experiment ON ab_user_assignments("experimentId");

-- A/B 实验指标表 (Welford's online algorithm)
CREATE TABLE IF NOT EXISTS "ab_experiment_metrics" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "experimentId" UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    "variantId" UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sumReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sumRewardSquared" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "m2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE("experimentId", "variantId")
);
CREATE INDEX IF NOT EXISTS idx_abem_experiment ON ab_experiment_metrics("experimentId");
