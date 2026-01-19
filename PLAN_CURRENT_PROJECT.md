# 当前项目实施计划 - 词库中心集成

## 概述

在现有项目中新增词库浏览/下载功能，支持从外部词库中心导入词书。

---

## 第一部分：数据库变更

### 迁移文件 (024_wordbook_tags_and_import.sql)

```sql
-- 给词书添加 tags 和导入追踪字段
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceVersion" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_word_books_tags" ON "word_books" USING GIN ("tags");
CREATE INDEX IF NOT EXISTS "idx_word_books_sourceUrl" ON "word_books" ("sourceUrl");
```

---

## 第二部分：API 设计

### 新增 API

| 方法 | 路径                              | 说明                       |
| ---- | --------------------------------- | -------------------------- |
| GET  | `/api/wordbook-center/config`     | 获取词库中心 URL           |
| PUT  | `/api/wordbook-center/config`     | 配置词库中心 URL（管理员） |
| GET  | `/api/wordbook-center/browse`     | 代理词库中心列表           |
| GET  | `/api/wordbook-center/browse/:id` | 代理词书详情               |
| POST | `/api/wordbook-center/import/:id` | 导入词书到本地             |

### 导入请求

```json
{
  "targetType": "SYSTEM" | "USER"
}
```

---

## 第三部分：前端组件

### 新增页面

- `WordBookCenterPage.tsx` - 词库中心浏览页

### 新增组件

```
components/wordbook-center/
├── CenterWordBookCard.tsx     # 词书卡片
├── CenterWordBookDetail.tsx   # 词书详情模态框
├── TagFilter.tsx              # 标签筛选
└── ImportProgress.tsx         # 导入进度
```

---

## 第四部分：实施顺序

### Phase 1: 数据库与类型定义

1. 创建迁移文件 `024_wordbook_tags_and_import.sql`
2. 更新 `packages/shared/src/types/word.ts` 添加 tags、sourceUrl 等字段

### Phase 2: 后端改动

1. 更新 `wordbooks.rs` 添加 tags 字段支持
2. 更新 `admin/wordbooks.rs` 支持 tags
3. 新建 `wordbook_center.rs` 模块

### Phase 3: 前端开发

1. `WordBookCenterClient.ts` - API 客户端
2. 组件开发
3. 页面集成

---

## 第五部分：关键修改文件

### 后端

| 文件                                   | 变更           |
| -------------------------------------- | -------------- |
| `sql/024_wordbook_tags_and_import.sql` | 新建迁移       |
| `src/routes/mod.rs`                    | 注册新路由     |
| `src/routes/wordbooks.rs`              | 添加 tags 字段 |
| `src/routes/admin/wordbooks.rs`        | 支持 tags      |
| `src/routes/wordbook_center.rs`        | 新建模块       |

### 前端

| 文件                                         | 变更         |
| -------------------------------------------- | ------------ |
| `packages/shared/src/types/word.ts`          | 添加类型定义 |
| `packages/shared/src/schemas/word.schema.ts` | 更新 Schema  |
| `src/pages/WordBookCenterPage.tsx`           | 新建页面     |

---

## 验证方案

1. **数据库**：运行迁移后检查 tags 字段是否正确添加
2. **集成测试**：
   - 配置词库中心 URL
   - 浏览词书列表
   - 导入一本词书，验证数据完整性
   - 检查重复导入是否被正确阻止
