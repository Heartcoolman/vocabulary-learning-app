-- 023_fix_schema_issues.sql
-- Fix schema issues discovered during deployment

-- 1. Create word_scores table if not exists
CREATE TABLE IF NOT EXISTS "word_scores" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION DEFAULT 0,
    "accuracyScore" DOUBLE PRECISION DEFAULT 0,
    "speedScore" DOUBLE PRECISION DEFAULT 0,
    "stabilityScore" DOUBLE PRECISION DEFAULT 0,
    "proficiencyScore" DOUBLE PRECISION DEFAULT 0,
    "totalAttempts" INTEGER DEFAULT 0,
    "correctAttempts" INTEGER DEFAULT 0,
    "averageResponseTime" DOUBLE PRECISION DEFAULT 0,
    "averageDwellTime" DOUBLE PRECISION DEFAULT 0,
    "recentAccuracy" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("userId", "wordId")
);

CREATE INDEX IF NOT EXISTS "idx_word_scores_userId" ON "word_scores" ("userId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_wordId" ON "word_scores" ("wordId");
CREATE INDEX IF NOT EXISTS "idx_word_scores_totalScore" ON "word_scores" ("totalScore");
CREATE INDEX IF NOT EXISTS "idx_word_scores_userId_totalScore" ON "word_scores" ("userId", "totalScore");

-- 2. Fix bayesian_optimizer_state table - recreate with TEXT id
DO $$
BEGIN
    -- Check if id column is uuid type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bayesian_optimizer_state'
        AND column_name = 'id'
        AND data_type = 'uuid'
    ) THEN
        -- Backup, drop, recreate
        CREATE TABLE IF NOT EXISTS "bayesian_optimizer_state_backup" AS
        SELECT * FROM "bayesian_optimizer_state";

        DROP TABLE "bayesian_optimizer_state";

        CREATE TABLE "bayesian_optimizer_state" (
            "id" TEXT PRIMARY KEY,
            "observations" JSONB NOT NULL DEFAULT '[]',
            "bestParams" JSONB,
            "bestValue" DOUBLE PRECISION,
            "evaluationCount" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );

        DROP TABLE IF EXISTS "bayesian_optimizer_state_backup";
    END IF;
END $$;

-- Ensure global record exists
INSERT INTO "bayesian_optimizer_state" ("id", "observations", "evaluationCount")
VALUES ('global', '[]'::jsonb, 0)
ON CONFLICT ("id") DO NOTHING;

-- 3. Insert default algorithm config if not exists
INSERT INTO "algorithm_configs" (
    "id", "name", "description", "reviewIntervals",
    "consecutiveCorrectThreshold", "consecutiveWrongThreshold",
    "difficultyAdjustmentInterval", "priorityWeightNewWord",
    "priorityWeightErrorRate", "priorityWeightOverdueTime", "priorityWeightWordScore",
    "scoreWeightAccuracy", "scoreWeightSpeed", "scoreWeightStability", "scoreWeightProficiency",
    "speedThresholdExcellent", "speedThresholdGood", "speedThresholdAverage", "speedThresholdSlow",
    "newWordRatioDefault", "newWordRatioHighAccuracy", "newWordRatioLowAccuracy",
    "newWordRatioHighAccuracyThreshold", "newWordRatioLowAccuracyThreshold",
    "masteryThresholds", "isDefault", "createdAt", "updatedAt"
) VALUES (
    'default', '默认配置', '系统默认的算法配置', ARRAY[1,3,7,15,30],
    5, 3, 1, 40, 30, 20, 10, 40, 30, 20, 10,
    3000, 5000, 8000, 15000,
    0.3, 0.5, 0.1, 0.85, 0.65,
    '[{"level":1,"requiredCorrectStreak":2,"minAccuracy":0.6,"minScore":40},{"level":2,"requiredCorrectStreak":3,"minAccuracy":0.7,"minScore":50},{"level":3,"requiredCorrectStreak":4,"minAccuracy":0.75,"minScore":60},{"level":4,"requiredCorrectStreak":5,"minAccuracy":0.8,"minScore":70},{"level":5,"requiredCorrectStreak":6,"minAccuracy":0.85,"minScore":80}]'::jsonb,
    true, NOW(), NOW()
) ON CONFLICT ("name") DO NOTHING;
