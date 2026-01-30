# Spec: Database Migration for VARK

## Overview

数据库迁移脚本，添加 VARK 模型所需的新字段。

## Migration SQL

**文件**: `packages/backend-rust/sql/041_add_vark_columns.sql`

```sql
-- VARK Learning Style: Add interaction tracking columns

-- 1. answer_records 表扩展
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageViewCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageZoomCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "imageLongPressMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioPlayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioReplayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "audioSpeedAdjust" BOOLEAN DEFAULT false;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "definitionReadMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "exampleReadMs" BIGINT DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "noteWriteCount" INTEGER DEFAULT 0;

-- 2. user_interaction_stats 表扩展
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "avgSessionDurationMs" BIGINT DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "sessionBreakCount" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "preferredReviewInterval" INTEGER DEFAULT 24;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalImageInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalAudioInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalReadingMs" BIGINT DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN IF NOT EXISTS "totalWritingActions" INTEGER DEFAULT 0;

-- 3. 用户 VARK 模型权重存储表
CREATE TABLE IF NOT EXISTS "user_vark_models" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "sampleCount" INTEGER DEFAULT 0,
    "isMLEnabled" BOOLEAN DEFAULT false,
    "visualWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "auditoryWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "readingWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "kinestheticWeights" DOUBLE PRECISION[] DEFAULT '{}',
    "lastTrainedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_user_vark_models_userId" ON "user_vark_models"("userId");
```

## Constraints

| 约束                                  | 说明                                  |
| ------------------------------------- | ------------------------------------- |
| 所有新列均为可空或有默认值            | 确保向后兼容，旧记录不受影响          |
| `user_vark_models` 表存储 ML 模型权重 | 使用 DOUBLE PRECISION[] 存储权重向量  |
| `isMLEnabled` 标记用户是否启用 ML     | 由冷启动阈值 (sampleCount >= 50) 触发 |

## SQLite Fallback

**文件**: `packages/backend-rust/sql/sqlite_fallback_schema.sql` (追加)

```sql
-- VARK Learning Style columns for SQLite

-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS directly
-- These need to be wrapped in a migration check

ALTER TABLE "answer_records" ADD COLUMN "imageViewCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "imageZoomCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "imageLongPressMs" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "audioPlayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "audioReplayCount" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "audioSpeedAdjust" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "definitionReadMs" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "exampleReadMs" INTEGER DEFAULT 0;
ALTER TABLE "answer_records" ADD COLUMN "noteWriteCount" INTEGER DEFAULT 0;

-- user_interaction_stats extensions
ALTER TABLE "user_interaction_stats" ADD COLUMN "avgSessionDurationMs" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN "sessionBreakCount" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN "preferredReviewInterval" INTEGER DEFAULT 24;
ALTER TABLE "user_interaction_stats" ADD COLUMN "totalImageInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN "totalAudioInteractions" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN "totalReadingMs" INTEGER DEFAULT 0;
ALTER TABLE "user_interaction_stats" ADD COLUMN "totalWritingActions" INTEGER DEFAULT 0;

-- VARK model storage
CREATE TABLE IF NOT EXISTS "user_vark_models" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "sampleCount" INTEGER DEFAULT 0,
    "isMLEnabled" INTEGER DEFAULT 0,
    "visualWeights" TEXT DEFAULT '[]',
    "auditoryWeights" TEXT DEFAULT '[]',
    "readingWeights" TEXT DEFAULT '[]',
    "kinestheticWeights" TEXT DEFAULT '[]',
    "lastTrainedAt" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS "idx_user_vark_models_userId" ON "user_vark_models"("userId");
```
