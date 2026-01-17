-- 025_wordbook_center_user_config.sql
-- 用户个人词库中心配置表

CREATE TABLE IF NOT EXISTS "wordbook_center_user_config" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
    "centerUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_wordbook_center_user_config_userId"
    ON "wordbook_center_user_config" ("userId");

-- 初始化默认全局 URL（仅当为空时更新）
INSERT INTO "wordbook_center_config" ("id", "centerUrl", "updatedAt")
VALUES ('default', 'https://cdn.jsdelivr.net/gh/Heartcoolman/wordbook-center@main', NOW())
ON CONFLICT ("id") DO UPDATE
SET "centerUrl" = EXCLUDED."centerUrl", "updatedAt" = EXCLUDED."updatedAt"
WHERE "wordbook_center_config"."centerUrl" IS NULL OR "wordbook_center_config"."centerUrl" = '';
