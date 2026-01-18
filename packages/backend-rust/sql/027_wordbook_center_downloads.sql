-- 027_wordbook_center_downloads.sql
-- 词库中心下载计数表，用于本地统计导入次数

CREATE TABLE IF NOT EXISTS "wordbook_center_downloads" (
    "id" TEXT PRIMARY KEY,
    "centerUrl" TEXT NOT NULL,
    "centerWordbookId" TEXT NOT NULL,
    "importCount" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("centerUrl", "centerWordbookId")
);
