# 词库中心实现计划

## 概述

创建一个独立的"词库中心"服务，现有项目可从中下载词书。

**架构**：

- 新项目：独立 Rust + Axum 服务 + Vue 3 管理后台（词库中心）
- 现有项目：新增词库浏览/下载功能

**词库中心管理后台功能**：

- 词书管理（创建、编辑、删除）
- 单词管理（批量上传、编辑、删除）
- 标签管理

---

## 第一部分：数据库变更

### 1.1 现有项目迁移 (024_wordbook_tags_and_import.sql)

```sql
-- 给词书添加 tags 和导入追踪字段
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "sourceVersion" TEXT;
ALTER TABLE "word_books" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_word_books_tags" ON "word_books" USING GIN ("tags");
CREATE INDEX IF NOT EXISTS "idx_word_books_sourceUrl" ON "word_books" ("sourceUrl");
```

### 1.2 词库中心 Schema

```sql
CREATE TABLE IF NOT EXISTS "center_wordbooks" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT '{}',
    "wordCount" INTEGER DEFAULT 0,
    "coverImage" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "center_words" (
    "id" TEXT PRIMARY KEY,
    "wordBookId" TEXT NOT NULL REFERENCES "center_wordbooks"("id") ON DELETE CASCADE,
    "spelling" TEXT NOT NULL,
    "phonetic" TEXT NOT NULL,
    "meanings" JSONB NOT NULL,
    "examples" JSONB NOT NULL,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE("wordBookId", "spelling")
);

CREATE TABLE IF NOT EXISTS "center_admins" (
    "id" TEXT PRIMARY KEY,
    "username" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 第二部分：API 设计

### 2.1 词库中心 API（公开，无需认证）

| 方法 | 路径                 | 说明                             |
| ---- | -------------------- | -------------------------------- |
| GET  | `/api/wordbooks`     | 词书列表（支持 tags 筛选、分页） |
| GET  | `/api/wordbooks/:id` | 词书详情（含所有单词）           |
| GET  | `/api/tags`          | 所有标签及数量                   |

### 2.2 词库中心管理 API（需认证）

| 方法   | 路径                                   | 说明         |
| ------ | -------------------------------------- | ------------ |
| POST   | `/api/admin/wordbooks`                 | 创建词书     |
| PUT    | `/api/admin/wordbooks/:id`             | 更新词书     |
| DELETE | `/api/admin/wordbooks/:id`             | 删除词书     |
| POST   | `/api/admin/wordbooks/:id/words/batch` | 批量添加单词 |

### 2.3 现有项目新增 API

| 方法 | 路径                              | 说明                       |
| ---- | --------------------------------- | -------------------------- |
| GET  | `/api/wordbook-center/config`     | 获取词库中心 URL           |
| PUT  | `/api/wordbook-center/config`     | 配置词库中心 URL（管理员） |
| GET  | `/api/wordbook-center/browse`     | 代理词库中心列表           |
| GET  | `/api/wordbook-center/browse/:id` | 代理词书详情               |
| POST | `/api/wordbook-center/import/:id` | 导入词书到本地             |

导入请求：

```json
{
  "targetType": "SYSTEM" | "USER"
}
```

---

## 第三部分：前端组件

### 3.1 词库中心管理后台（新项目前端）

**页面结构**：

```
views/
├── LoginView.vue              # 管理员登录
├── DashboardView.vue          # 仪表盘（词书统计）
├── WordBooksView.vue          # 词书列表管理
├── WordBookEditView.vue       # 词书编辑（含单词管理）
└── TagsView.vue               # 标签管理
```

**核心功能**：

- 词书 CRUD（名称、描述、封面、标签）
- 单词批量导入（支持 JSON/CSV 上传）
- 单词在线编辑（拼写、音标、释义、例句）
- 版本管理（发布新版本）

### 3.2 现有项目新增页面

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

### Phase 2: 现有后端改动

1. 更新 `wordbooks.rs` 添加 tags 字段支持
2. 更新 `admin/wordbooks.rs` 支持 tags
3. 新建 `wordbook_center.rs` 模块

### Phase 3: 新建词库中心后端

1. 项目初始化（Cargo.toml、目录结构）
2. 数据库层
3. 公开 API 路由（词书列表、详情）
4. 管理 API 路由（CRUD、批量导入）

### Phase 4: 词库中心管理后台（新项目前端）

1. 项目初始化（Vite + Vue 3 + Element Plus）
2. 登录页与认证
3. 词书管理页面
4. 单词批量上传功能（支持 JSON/CSV）
5. 单词在线编辑功能

### Phase 5: 现有项目前端

1. `WordBookCenterClient.ts`
2. 组件开发
3. 页面集成

### Phase 6: 部署

1. Docker 化（后端 + 前端）
2. docker-compose 配置

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
2. **词库中心**：启动服务后通过 curl 测试公开 API
3. **现有项目**：
   - 配置词库中心 URL
   - 浏览词书列表
   - 导入一本词书，验证数据完整性
   - 检查重复导入是否被正确阻止
