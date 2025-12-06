-- Migration: fix_schema_issues
-- Description: 修复 Schema 设计问题（外键、主键、索引、唯一约束）

-- ============================================
-- 1. 数据清洗（迁移前准备）
-- ============================================

-- 清理 AnswerRecord 中无效的 sessionId（指向不存在的 LearningSession）
UPDATE "answer_records"
SET "sessionId" = NULL
WHERE "sessionId" IS NOT NULL
  AND "sessionId" NOT IN (SELECT "id" FROM "learning_sessions");

-- 清理 FeatureVector 中的重复记录（保留最新的）
DELETE FROM "feature_vectors" fv1
WHERE EXISTS (
  SELECT 1 FROM "feature_vectors" fv2
  WHERE fv1."sessionId" = fv2."sessionId"
    AND fv1."featureVersion" = fv2."featureVersion"
    AND fv1."createdAt" < fv2."createdAt"
);

-- ============================================
-- 2. 索引修改
-- ============================================

-- 移除冗余索引（UserStateHistory 的 userId+date 索引与唯一约束重复）
DROP INDEX IF EXISTS "user_state_history_userId_date_idx";

-- ============================================
-- 3. FeatureVector 主键修改
-- ============================================

-- 删除旧的主键约束
ALTER TABLE "feature_vectors" DROP CONSTRAINT IF EXISTS "feature_vectors_pkey";

-- 创建新的复合主键
ALTER TABLE "feature_vectors" ADD CONSTRAINT "feature_vectors_pkey" PRIMARY KEY ("sessionId", "featureVersion");

-- ============================================
-- 4. 外键约束
-- ============================================

-- AnswerRecord 添加 session 外键（可空，删除时置空）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'answer_records_sessionId_fkey'
  ) THEN
    ALTER TABLE "answer_records" ADD CONSTRAINT "answer_records_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================
-- 5. 新增索引
-- ============================================

-- UserBadge 添加 badgeId 索引（加速按徽章查询）
CREATE INDEX IF NOT EXISTS "user_badges_badgeId_idx" ON "user_badges"("badgeId");

-- ============================================
-- 6. 唯一约束
-- ============================================

-- BadgeDefinition 添加 (name, tier) 唯一约束
-- 先检查是否有重复数据
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "name", "tier", COUNT(*) as cnt
    FROM "badge_definitions"
    GROUP BY "name", "tier"
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '存在重复的徽章定义 (name, tier)，请先清理数据';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "badge_definitions_name_tier_key" ON "badge_definitions"("name", "tier");

-- AlgorithmConfig 添加 name 唯一约束
-- 先检查是否有重复数据
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "name", COUNT(*) as cnt
    FROM "algorithm_configs"
    GROUP BY "name"
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '存在重复的算法配置名称，请先清理数据';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "algorithm_configs_name_key" ON "algorithm_configs"("name");
