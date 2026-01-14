-- 024_wordbook_tags_and_import.sql
-- 给词书添加 tags 和导入追踪字段

ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceVersion" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_word_books_tags" ON "word_books" USING GIN ("tags");
CREATE INDEX IF NOT EXISTS "idx_word_books_sourceUrl" ON "word_books" ("sourceUrl");

-- 词库中心配置表
CREATE TABLE IF NOT EXISTS "wordbook_center_config" (
    "id" TEXT PRIMARY KEY DEFAULT 'default',
    "centerUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedBy" TEXT
);
