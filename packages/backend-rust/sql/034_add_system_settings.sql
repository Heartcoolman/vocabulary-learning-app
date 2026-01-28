-- 034_add_system_settings.sql
-- System-level key-value settings with audit trail

CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedBy" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_system_settings_category"
    ON "system_settings" ("category");

-- Insert default embedding settings (empty values, admin must configure)
INSERT INTO "system_settings" ("key", "value", "description", "category", "isSecret")
VALUES
    ('embedding.api_key', '', 'Embedding API 密钥', 'embedding', true),
    ('embedding.api_endpoint', 'https://api.openai.com/v1', 'Embedding API 端点', 'embedding', false),
    ('embedding.model', 'text-embedding-3-small', 'Embedding 模型名称', 'embedding', false),
    ('embedding.dimension', '1536', '向量维度', 'embedding', false),
    ('embedding.timeout_ms', '60000', '请求超时(毫秒)', 'embedding', false)
ON CONFLICT ("key") DO NOTHING;
