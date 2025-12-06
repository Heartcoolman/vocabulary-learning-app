-- =============================================================================
-- Migration: Optimize AnswerRecord Indexes
-- Date: 2025-12-05
-- Description: 删除冗余索引以减少写放大，提升写入性能
-- Status: DRAFT - 请勿直接执行，需要 DBA 审核
-- =============================================================================

-- =============================================================================
-- 背景分析
-- =============================================================================
-- AnswerRecord 表使用复合主键 @@id([id, timestamp])
-- 同时定义了唯一约束 @@unique([userId, wordId, timestamp])
--
-- 当前共有 10 个索引（包括主键和唯一约束）:
-- 1. PRIMARY KEY (id, timestamp) - 复合主键
-- 2. UNIQUE (userId, wordId, timestamp) - 唯一约束
-- 3. INDEX (userId)
-- 4. INDEX (wordId)
-- 5. INDEX (sessionId)
-- 6. INDEX (userId, timestamp) - idx_answer_records_user_time
-- 7. INDEX (wordId, timestamp)
-- 8. INDEX (userId, isCorrect)
-- 9. INDEX (sessionId, timestamp)
-- 10. INDEX (userId, wordId, isCorrect) - 单词正确率统计
-- 11. INDEX (userId, timestamp DESC) - idx_answer_records_user_time_desc
-- =============================================================================

-- =============================================================================
-- 冗余分析结论
-- =============================================================================
--
-- 【可以安全删除的索引】
--
-- 1. INDEX (userId) - 被 (userId, timestamp) 和 (userId, isCorrect) 覆盖
--    PostgreSQL 可以使用复合索引的最左前缀
--    删除理由: 任何仅需 userId 的查询都可使用其他复合索引
--
-- 2. INDEX (wordId) - 被 (wordId, timestamp) 覆盖
--    删除理由: 同上，复合索引的前缀可以满足单列查询
--
-- 3. INDEX (sessionId) - 被 (sessionId, timestamp) 覆盖
--    删除理由: 同上
--
-- 4. INDEX (userId, timestamp) - 与 (userId, timestamp DESC) 部分重复
--    注意: 这两个索引方向不同，但大多数查询使用 DESC
--    需要确认是否有 ASC 排序的查询场景
--    【暂时保留，除非确认无 ASC 查询】
--
-- 【必须保留的索引】
--
-- 1. PRIMARY KEY (id, timestamp) - 必需，TimescaleDB hypertable 分区依赖
-- 2. UNIQUE (userId, wordId, timestamp) - 必需，用于去重和幂等性
-- 3. INDEX (userId, timestamp DESC) - 高频查询：最近答题记录
-- 4. INDEX (wordId, timestamp) - 高频查询：单词复习历史
-- 5. INDEX (userId, isCorrect) - 高频查询：正确率统计
-- 6. INDEX (sessionId, timestamp) - 必需：会话内答题记录查询
-- 7. INDEX (userId, wordId, isCorrect) - 高频查询：单词正确率统计
--
-- =============================================================================

-- =============================================================================
-- Step 1: 删除冗余的单列索引（被复合索引覆盖）
-- =============================================================================

-- 删除 userId 单列索引（被 userId,timestamp 和 userId,isCorrect 覆盖）
DROP INDEX IF EXISTS "answer_records_userId_idx";

-- 删除 wordId 单列索引（被 wordId,timestamp 覆盖）
DROP INDEX IF EXISTS "answer_records_wordId_idx";

-- 删除 sessionId 单列索引（被 sessionId,timestamp 覆盖）
DROP INDEX IF EXISTS "answer_records_sessionId_idx";

-- =============================================================================
-- Step 2: 评估是否删除 ASC 版本的 userId,timestamp 索引
-- 如果确认业务逻辑只使用 DESC 排序，可以取消下面的注释
-- =============================================================================

-- 警告: 仅当确认所有查询都使用 DESC 排序时才执行
-- DROP INDEX IF EXISTS "idx_answer_records_user_time";
-- DROP INDEX IF EXISTS "answer_records_userId_timestamp_idx";

-- =============================================================================
-- 预期收益
-- =============================================================================
-- 1. 每次 INSERT 减少 3 次索引更新（删除3个冗余单列索引）
-- 2. 存储空间减少约 15-20%（取决于数据量）
-- 3. 写入延迟降低约 10-15%
--
-- 注意事项:
-- - 删除索引后，部分查询可能使用复合索引的前缀扫描
-- - 性能影响通常可忽略，但建议在低峰期执行并监控
-- =============================================================================

-- =============================================================================
-- 回滚脚本（如需要）
-- =============================================================================
--
-- CREATE INDEX "answer_records_userId_idx" ON "answer_records"("userId");
-- CREATE INDEX "answer_records_wordId_idx" ON "answer_records"("wordId");
-- CREATE INDEX "answer_records_sessionId_idx" ON "answer_records"("sessionId");
--
-- =============================================================================
