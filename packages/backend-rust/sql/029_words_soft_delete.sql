-- 029_words_soft_delete.sql
-- 支持单词软删除，保留学习进度

ALTER TABLE "words" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
CREATE INDEX IF NOT EXISTS "idx_words_deleted" ON "words"("deletedAt") WHERE "deletedAt" IS NULL;
