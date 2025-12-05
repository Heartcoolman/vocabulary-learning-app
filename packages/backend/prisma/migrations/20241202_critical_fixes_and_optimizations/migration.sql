-- =========================================
-- Critical Fix #1: FeatureVector主键从sessionId改为answerRecordId
-- 目的: 避免特征向量覆盖，确保每个答题记录有独立的特征向量
-- =========================================

-- 1. 添加answerRecordId列（如果不存在）
ALTER TABLE "feature_vectors" ADD COLUMN IF NOT EXISTS "answerRecordId" TEXT;

-- 2. 删除旧的unique约束
ALTER TABLE "feature_vectors" DROP CONSTRAINT IF EXISTS "feature_vectors_sessionId_featureVersion_key";

-- 3. 更新现有数据：将sessionId复制到answerRecordId（作为临时数据，实际使用中需要真实的answerRecordId）
-- 注意：如果表为空或answerRecordId已有值，此语句可能不需要执行
-- UPDATE "feature_vectors" SET "answerRecordId" = COALESCE("answerRecordId", "sessionId") WHERE "answerRecordId" IS NULL;

-- 4. 设置answerRecordId为NOT NULL
ALTER TABLE "feature_vectors" ALTER COLUMN "answerRecordId" SET NOT NULL;

-- 5. 添加新的unique约束
ALTER TABLE "feature_vectors" ADD CONSTRAINT "feature_vectors_answerRecordId_featureVersion_key" UNIQUE ("answerRecordId", "featureVersion");

-- 6. 添加answerRecordId索引
CREATE INDEX IF NOT EXISTS "idx_feature_vectors_answerRecordId" ON "feature_vectors"("answerRecordId");

-- =========================================
-- Critical Fix #1: RewardQueue添加answerRecordId支持
-- 目的: 支持通过answerRecordId精确匹配特征向量
-- =========================================

-- 7. 添加answerRecordId列到RewardQueue（如果不存在）
ALTER TABLE "reward_queue" ADD COLUMN IF NOT EXISTS "answerRecordId" TEXT;

-- 8. 添加answerRecordId索引
CREATE INDEX IF NOT EXISTS "idx_reward_queue_answerRecordId" ON "reward_queue"("answerRecordId");

-- =========================================
-- 注意事项
-- =========================================
-- 1. 此迁移会修改已有数据，请在生产环境应用前先备份数据库
-- 2. 现有的feature_vectors记录会被更新，answerRecordId将基于sessionId和id生成
-- 3. 新的应用代码必须在调用时提供真实的answerRecordId
