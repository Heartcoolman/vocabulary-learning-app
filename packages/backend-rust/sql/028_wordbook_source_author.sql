-- 028_wordbook_source_author.sql
-- 给词书添加导入来源作者字段

ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceAuthor" TEXT;
