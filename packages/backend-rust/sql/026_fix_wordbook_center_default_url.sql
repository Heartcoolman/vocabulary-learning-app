-- 026_fix_wordbook_center_default_url.sql
-- 修复词库中心默认 URL，将 localhost 开发环境配置更新为生产默认值

UPDATE "wordbook_center_config"
SET "centerUrl" = 'https://cdn.jsdelivr.net/gh/Heartcoolman/wordbook-center@main',
    "updatedAt" = NOW()
WHERE "id" = 'default'
  AND ("centerUrl" IS NULL
       OR "centerUrl" = ''
       OR "centerUrl" LIKE 'http://localhost%'
       OR "centerUrl" LIKE 'http://127.0.0.1%');

-- 确保默认记录存在
INSERT INTO "wordbook_center_config" ("id", "centerUrl", "updatedAt")
VALUES ('default', 'https://cdn.jsdelivr.net/gh/Heartcoolman/wordbook-center@main', NOW())
ON CONFLICT ("id") DO NOTHING;
