-- 修复 learning_sessions 表中 totalQuestions 和 actualMasteryCount 为 NULL 或为 0 的问题

-- 1. 更新已有数据：将 NULL 值设为 0
UPDATE "learning_sessions" SET "totalQuestions" = 0 WHERE "totalQuestions" IS NULL;
UPDATE "learning_sessions" SET "actualMasteryCount" = 0 WHERE "actualMasteryCount" IS NULL;

-- 2. 为现有会话填充正确的 totalQuestions（基于 answer_records 表统计）
UPDATE "learning_sessions" ls
SET "totalQuestions" = COALESCE((
    SELECT COUNT(*) FROM "answer_records" ar WHERE ar."sessionId" = ls."id"
), 0)
WHERE ls."totalQuestions" = 0
  AND EXISTS (SELECT 1 FROM "answer_records" ar WHERE ar."sessionId" = ls."id");

-- 3. 为现有会话填充 actualMasteryCount（基于 answer_records 中达到掌握阈值的单词数）
-- 掌握判定：masteryLevelAfter >= 3（对应 mastery >= 0.6）
UPDATE "learning_sessions" ls
SET "actualMasteryCount" = COALESCE((
    SELECT COUNT(DISTINCT ar."wordId")
    FROM "answer_records" ar
    WHERE ar."sessionId" = ls."id"
      AND ar."masteryLevelAfter" >= 3
), 0)
WHERE ls."actualMasteryCount" = 0
  AND EXISTS (
    SELECT 1 FROM "answer_records" ar
    WHERE ar."sessionId" = ls."id" AND ar."masteryLevelAfter" >= 3
  );

-- 4. 添加默认值约束，确保新记录不会再出现 NULL
ALTER TABLE "learning_sessions" ALTER COLUMN "totalQuestions" SET DEFAULT 0;
ALTER TABLE "learning_sessions" ALTER COLUMN "actualMasteryCount" SET DEFAULT 0;
