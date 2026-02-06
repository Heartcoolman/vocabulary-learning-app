-- 048_add_micro_behavior_tables.sql
-- 微观行为数据采集：犹豫系数、按键特征、蒙题标记、状态打卡

-- 扩展 answer_records 表
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "isGuess" BOOLEAN DEFAULT FALSE;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "indecisionIndex" REAL;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "reactionLatencyMs" INTEGER;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "keystrokeFluency" REAL;

-- 原始微观行为事件存储表
CREATE TABLE IF NOT EXISTS "micro_behavior_events" (
    "id" TEXT PRIMARY KEY,
    "answerRecordId" TEXT NOT NULL,
    "eventType" VARCHAR(32) NOT NULL,
    "eventData" JSONB NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_mbe_answer_record" ON "micro_behavior_events"("answerRecordId");
CREATE INDEX IF NOT EXISTS "idx_mbe_event_type" ON "micro_behavior_events"("eventType");

COMMENT ON TABLE "micro_behavior_events" IS '存储原始微观行为事件序列，用于后续分析和模型训练';
COMMENT ON COLUMN "micro_behavior_events"."eventType" IS '事件类型: trajectory, hover, keystroke';
COMMENT ON COLUMN "micro_behavior_events"."eventData" IS '事件数据 JSON，结构取决于 eventType';

-- 扩展 learning_sessions 表
ALTER TABLE "learning_sessions" ADD COLUMN IF NOT EXISTS "selfReportedEnergy" VARCHAR(16);

COMMENT ON COLUMN "learning_sessions"."selfReportedEnergy" IS '用户自报告的精力状态: high, normal, low';
