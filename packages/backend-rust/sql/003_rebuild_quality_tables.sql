-- Migration: Rebuild quality management tables
-- Created: 2024-12-25
-- Description: Simplify quality management from 3 tables to 2 tables

-- Drop old tables (cascade to handle foreign keys)
DROP TABLE IF EXISTS "content_variants" CASCADE;
DROP TABLE IF EXISTS "content_issues" CASCADE;
DROP TABLE IF EXISTS "quality_checks" CASCADE;

-- Table 1: quality_tasks (unified task tracking for check and enhance)
CREATE TABLE "quality_tasks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "wordbookId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL CHECK ("taskType" IN ('check', 'enhance')),
    "checkType" TEXT CHECK ("checkType" IN ('FULL', 'SPELLING', 'MEANING', 'EXAMPLE')),
    "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "issuesFound" INTEGER NOT NULL DEFAULT 0,
    "currentItem" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "completedAt" TIMESTAMP,
    CONSTRAINT "fk_quality_task_wordbook" FOREIGN KEY ("wordbookId") REFERENCES "word_books"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_quality_tasks_wordbook_status" ON "quality_tasks" ("wordbookId", "status");
CREATE INDEX "idx_quality_tasks_created" ON "quality_tasks" ("createdAt" DESC);

-- Table 2: word_issues (merged issues and suggestions)
CREATE TABLE "word_issues" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "taskId" UUID REFERENCES "quality_tasks"("id") ON DELETE SET NULL,
    "wordbookId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "field" TEXT NOT NULL CHECK ("field" IN ('spelling', 'phonetic', 'meanings', 'examples')),
    "severity" TEXT NOT NULL DEFAULT 'warning' CHECK ("severity" IN ('error', 'warning', 'suggestion')),
    "message" TEXT NOT NULL,
    "suggestion" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'fixed', 'ignored')),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "fk_word_issue_wordbook" FOREIGN KEY ("wordbookId") REFERENCES "word_books"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_word_issue_word" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_word_issues_wordbook_status" ON "word_issues" ("wordbookId", "status");
CREATE INDEX "idx_word_issues_word" ON "word_issues" ("wordId");
CREATE INDEX "idx_word_issues_task" ON "word_issues" ("taskId");
CREATE INDEX "idx_word_issues_severity" ON "word_issues" ("severity") WHERE "status" = 'open';
