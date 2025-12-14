-- 数据库安全加固迁移脚本
-- 阶段 1：添加软删除字段（向后兼容，无风险）

-- ============================================
-- 核心用户表
-- ============================================
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "users_is_deleted_idx" ON "users"("is_deleted");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
COMMENT ON COLUMN "users"."deleted_at" IS '软删除时间戳';
COMMENT ON COLUMN "users"."is_deleted" IS '是否已软删除';

-- ============================================
-- 词库相关表
-- ============================================
ALTER TABLE "word_books" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_books" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "word_books_is_deleted_idx" ON "word_books"("is_deleted");
CREATE INDEX "word_books_deleted_at_idx" ON "word_books"("deleted_at");

ALTER TABLE "words" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "words" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "words_is_deleted_idx" ON "words"("is_deleted");
CREATE INDEX "words_deleted_at_idx" ON "words"("deleted_at");

-- ============================================
-- 学习数据表
-- ============================================
ALTER TABLE "answer_records" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "answer_records" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "answer_records_is_deleted_idx" ON "answer_records"("is_deleted");
CREATE INDEX "answer_records_deleted_at_idx" ON "answer_records"("deleted_at");

ALTER TABLE "word_learning_states" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_learning_states" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "word_learning_states_is_deleted_idx" ON "word_learning_states"("is_deleted");
CREATE INDEX "word_learning_states_deleted_at_idx" ON "word_learning_states"("deleted_at");

ALTER TABLE "word_scores" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_scores" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "word_scores_is_deleted_idx" ON "word_scores"("is_deleted");
CREATE INDEX "word_scores_deleted_at_idx" ON "word_scores"("deleted_at");

ALTER TABLE "learning_sessions" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "learning_sessions" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "learning_sessions_is_deleted_idx" ON "learning_sessions"("is_deleted");
CREATE INDEX "learning_sessions_deleted_at_idx" ON "learning_sessions"("deleted_at");

ALTER TABLE "word_review_traces" ADD COLUMN "deleted_at" TIMESTAMP;
ALTER TABLE "word_review_traces" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "word_review_traces_is_deleted_idx" ON "word_review_traces"("is_deleted");

-- ============================================
-- 复合索引（提升查询性能）
-- ============================================
CREATE INDEX "users_id_is_deleted_idx" ON "users"("id", "is_deleted");
CREATE INDEX "word_books_user_id_is_deleted_idx" ON "word_books"("user_id", "is_deleted");
CREATE INDEX "words_word_book_id_is_deleted_idx" ON "words"("word_book_id", "is_deleted");
CREATE INDEX "answer_records_user_id_is_deleted_idx" ON "answer_records"("user_id", "is_deleted");
CREATE INDEX "answer_records_word_id_is_deleted_idx" ON "answer_records"("word_id", "is_deleted");
CREATE INDEX "word_learning_states_user_id_is_deleted_idx" ON "word_learning_states"("user_id", "is_deleted");
CREATE INDEX "word_learning_states_word_id_is_deleted_idx" ON "word_learning_states"("word_id", "is_deleted");

-- ============================================
-- 清理索引（用于定期清理软删除数据）
-- ============================================
CREATE INDEX "users_is_deleted_deleted_at_idx" ON "users"("is_deleted", "deleted_at") WHERE "is_deleted" = true;
CREATE INDEX "word_books_is_deleted_deleted_at_idx" ON "word_books"("is_deleted", "deleted_at") WHERE "is_deleted" = true;
CREATE INDEX "words_is_deleted_deleted_at_idx" ON "words"("is_deleted", "deleted_at") WHERE "is_deleted" = true;

-- ============================================
-- 统计视图（监控软删除数据）
-- ============================================
CREATE OR REPLACE VIEW soft_delete_stats AS
SELECT
  'users' as table_name,
  COUNT(*) as total_records,
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) as deleted_records,
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as deleted_percentage,
  MIN(deleted_at) as oldest_deletion,
  MAX(deleted_at) as newest_deletion
FROM users
UNION ALL
SELECT
  'word_books',
  COUNT(*),
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
  MIN(deleted_at),
  MAX(deleted_at)
FROM word_books
UNION ALL
SELECT
  'words',
  COUNT(*),
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
  MIN(deleted_at),
  MAX(deleted_at)
FROM words
UNION ALL
SELECT
  'answer_records',
  COUNT(*),
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
  MIN(deleted_at),
  MAX(deleted_at)
FROM answer_records
UNION ALL
SELECT
  'word_learning_states',
  COUNT(*),
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
  MIN(deleted_at),
  MAX(deleted_at)
FROM word_learning_states
UNION ALL
SELECT
  'learning_sessions',
  COUNT(*),
  SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2),
  MIN(deleted_at),
  MAX(deleted_at)
FROM learning_sessions;

-- ============================================
-- 审计日志表（记录删除操作）
-- ============================================
CREATE TABLE IF NOT EXISTS "deletion_audit_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "table_name" VARCHAR(100) NOT NULL,
  "record_id" VARCHAR(100) NOT NULL,
  "deleted_by" VARCHAR(100),
  "deletion_type" VARCHAR(20) NOT NULL CHECK (deletion_type IN ('soft', 'hard', 'restored')),
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "deletion_audit_log_table_name_idx" ON "deletion_audit_log"("table_name");
CREATE INDEX "deletion_audit_log_record_id_idx" ON "deletion_audit_log"("record_id");
CREATE INDEX "deletion_audit_log_deleted_by_idx" ON "deletion_audit_log"("deleted_by");
CREATE INDEX "deletion_audit_log_created_at_idx" ON "deletion_audit_log"("created_at");

COMMENT ON TABLE "deletion_audit_log" IS '删除操作审计日志';
COMMENT ON COLUMN "deletion_audit_log"."deletion_type" IS '删除类型：soft=软删除, hard=硬删除, restored=恢复';

-- ============================================
-- 触发器：自动记录删除操作到审计日志
-- ============================================

-- 用户表审计触发器
CREATE OR REPLACE FUNCTION audit_user_deletion() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    INSERT INTO deletion_audit_log (table_name, record_id, deletion_type, metadata)
    VALUES ('users', NEW.id, 'soft', jsonb_build_object('email', NEW.email));
  ELSIF NEW.is_deleted = false AND OLD.is_deleted = true THEN
    INSERT INTO deletion_audit_log (table_name, record_id, deletion_type, metadata)
    VALUES ('users', NEW.id, 'restored', jsonb_build_object('email', NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_deletion_audit
AFTER UPDATE ON users
FOR EACH ROW
WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION audit_user_deletion();

-- ============================================
-- 清理函数：删除超过 90 天的软删除数据
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_soft_deleted_records(days_threshold INT DEFAULT 90)
RETURNS TABLE (
  table_name TEXT,
  records_deleted BIGINT
) AS $$
DECLARE
  cutoff_date TIMESTAMP;
  deleted_count BIGINT;
BEGIN
  cutoff_date := CURRENT_TIMESTAMP - (days_threshold || ' days')::INTERVAL;

  -- Users
  DELETE FROM users
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'users';
  records_deleted := deleted_count;
  RETURN NEXT;

  -- Word Books
  DELETE FROM word_books
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'word_books';
  records_deleted := deleted_count;
  RETURN NEXT;

  -- Words
  DELETE FROM words
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'words';
  records_deleted := deleted_count;
  RETURN NEXT;

  -- Answer Records
  DELETE FROM answer_records
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'answer_records';
  records_deleted := deleted_count;
  RETURN NEXT;

  -- Word Learning States
  DELETE FROM word_learning_states
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'word_learning_states';
  records_deleted := deleted_count;
  RETURN NEXT;

  -- Learning Sessions
  DELETE FROM learning_sessions
  WHERE is_deleted = true
    AND deleted_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  table_name := 'learning_sessions';
  records_deleted := deleted_count;
  RETURN NEXT;

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_soft_deleted_records IS '清理超过指定天数的软删除记录';

-- ============================================
-- 使用示例
-- ============================================

-- 查看软删除统计
-- SELECT * FROM soft_delete_stats;

-- 清理 90 天前的软删除数据
-- SELECT * FROM cleanup_old_soft_deleted_records(90);

-- 查看审计日志
-- SELECT * FROM deletion_audit_log ORDER BY created_at DESC LIMIT 100;
