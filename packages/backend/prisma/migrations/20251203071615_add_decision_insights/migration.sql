-- CreateTable: decision_insights
-- AMAS决策洞察表，用于解释性读写与缓存

CREATE TABLE "decision_insights" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state_snapshot" JSONB NOT NULL,
    "difficulty_factors" JSONB NOT NULL,
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feature_vector_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_insights_decision_id_key" ON "decision_insights"("decision_id");

-- CreateIndex
CREATE INDEX "decision_insights_user_id_decision_id_idx" ON "decision_insights"("user_id", "decision_id");

-- CreateIndex
CREATE INDEX "decision_insights_feature_vector_hash_idx" ON "decision_insights"("feature_vector_hash");

-- CreateIndex
CREATE INDEX "decision_insights_created_at_idx" ON "decision_insights"("created_at");

-- Comment
COMMENT ON TABLE "decision_insights" IS 'AMAS决策洞察表：存储决策的状态快照、难度因素和触发器，用于快速解释性查询';
COMMENT ON COLUMN "decision_insights"."state_snapshot" IS '用户状态快照（attention, fatigue, motivation等）';
COMMENT ON COLUMN "decision_insights"."difficulty_factors" IS '难度因素分析（认知负荷、遗忘风险等）';
COMMENT ON COLUMN "decision_insights"."feature_vector_hash" IS 'SHA-256哈希（前16字符），用于状态去重';
