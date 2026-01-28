# Constraints: optimize-confusion-learning

## Decision Log

所有实现决策均已明确，实现阶段无需任何判断。

### C1: Worker 触发机制

- **选择**: 新增变更日志表 `embedding_changes`
- **约束**:
  - embedding 写入时记录变更事件到 `embedding_changes` 表
  - Worker 消费该表，处理后标记已消费
  - 字段: `id`, `word_id`, `word_book_id`, `action` (INSERT/UPDATE/DELETE), `created_at`, `processed_at`

### C2: 并发控制

- **选择**: 任务队列（按 wordBookId 分区）
- **约束**:
  - 每个 wordBookId 作为独立任务单元
  - 不同 wordBookId 可并行处理
  - 同一 wordBookId 串行处理，避免竞争

### C3: 失败恢复

- **选择**: 状态表追踪进度
- **约束**:
  - 新增 `confusion_cache_status` 表
  - 字段: `word_book_id`, `last_processed_change_id`, `status` (pending/processing/completed), `updated_at`
  - 崩溃后从 `last_processed_change_id` 继续

### C4: 阈值超限处理

- **选择**: 钳制到 0.3 并返回部分数据
- **约束**:
  - API 接收 threshold 参数时，若 > 0.3 则钳制为 0.3
  - 响应中包含 `thresholdClamped: true` 标识
  - 前端 UI 滑块最大值限制为 0.3

### C5: dim 列

- **选择**: 仅按 model 区分
- **约束**:
  - 唯一约束: `UNIQUE (word1Id, word2Id, model)`
  - 不存储 dim 列，当前模型固定 1536 维

### C6: UPSERT 策略

- **选择**: `DO UPDATE SET distance`
- **约束**:
  - `ON CONFLICT (word1Id, word2Id, model) DO UPDATE SET distance = EXCLUDED.distance, "updatedAt" = NOW()`

### C7: 无聚类词处理

- **选择**: 存储 NULL，按 wordBookId 降级
- **约束**:
  - 缓存表 clusterId 允许 NULL
  - API `confusion-by-cluster` 返回一个特殊的 "未分类" 组 (clusterId = null)
  - 前端按 wordBookId 维度降级展示

### C8: 删除索引

- **选择**: 添加 word1Id, word2Id 索引
- **约束**:
  - `CREATE INDEX idx_confusion_cache_word1 ON confusion_pairs_cache("word1Id")`
  - `CREATE INDEX idx_confusion_cache_word2 ON confusion_pairs_cache("word2Id")`

### C9: 队列持久化

- **选择**: 服务端持久化
- **约束**:
  - 新增 `confusion_learning_sessions` 表
  - 字段: `id`, `user_id`, `cluster_id`, `theme_label`, `pair_ids` (JSON array), `current_index`, `status`, `created_at`, `updated_at`
  - 刷新页面后从服务端恢复状态

### C10: 初始缓存填充

- **选择**: 应用启动时自动检测
- **约束**:
  - Worker 启动时检查 `confusion_cache_status` 是否为空
  - 若为空，自动触发全量构建
  - 全量构建按 wordBookId 分批处理

### C11: 性能 SLA

- **选择**: 标准 SLA
- **约束**:
  - `GET /api/semantic/confusion-pairs/cached`: < 500ms (P95)
  - `GET /api/semantic/confusion-by-cluster`: < 200ms (P95)
  - `GET /api/semantic/confusion-cache/status`: < 200ms (P95)
  - 测试数据集: 10,000 词，500 个聚类

---

## API Schema

### GET /api/semantic/confusion-by-cluster

按主题聚类获取混淆词对数量统计。

**Request Query Parameters:**

```typescript
{
  wordBookId?: string;  // 可选，按词书过滤
}
```

**Response:**

```typescript
{
  success: boolean;
  data: {
    clusters: Array<{
      clusterId: string | null; // null 表示未分类
      themeLabel: string; // 主题标签，未分类时为 "未分类"
      confusionPairCount: number; // 该主题内混淆词对数量
      representativeWord: {
        id: string;
        spelling: string;
        meanings: string[];
      } | null; // 代表词，未分类时为 null
    }>;
    totalPairs: number; // 总混淆词对数
  }
}
```

### GET /api/semantic/confusion-pairs/cached

从缓存查询混淆词对。

**Request Query Parameters:**

```typescript
{
  clusterId?: string;      // 按主题过滤（传 "null" 查未分类）
  wordBookId?: string;     // 按词书过滤
  threshold?: number;      // 阈值上限，默认 0.15，最大 0.3
  limit?: number;          // 返回数量，默认 20，最大 100
  offset?: number;         // 分页偏移，默认 0
}
```

**Response:**

```typescript
{
  success: boolean;
  data: {
    pairs: Array<{
      word1: WordResult;
      word2: WordResult;
      distance: number;
      clusterId: string | null;
    }>;
    total: number; // 符合条件的总数
    thresholdClamped: boolean; // 阈值是否被钳制
  }
}
```

### GET /api/semantic/confusion-cache/status

查询缓存构建状态。

**Response:**

```typescript
{
  success: boolean;
  data: {
    status: 'empty' | 'building' | 'ready';
    wordBooks: Array<{
      wordBookId: string;
      wordBookName: string;
      status: 'pending' | 'processing' | 'completed';
      pairCount: number;
      lastUpdated: string; // ISO8601
    }>;
    totalPairs: number;
    lastFullRebuild: string | null; // ISO8601
  }
}
```

### POST /api/semantic/confusion-sessions

创建批量学习会话。

**Request Body:**

```typescript
{
  clusterId: string | null;   // 主题 ID
  pairIds: string[];          // 选中的词对 ID 列表
  themeLabel: string;         // 主题标签（用于显示）
}
```

**Response:**

```typescript
{
  success: boolean;
  data: {
    sessionId: string;
    pairs: Array<{
      id: string;
      word1: WordResult;
      word2: WordResult;
      distance: number;
    }>;
    currentIndex: number; // 0
    totalPairs: number;
  }
}
```

### GET /api/semantic/confusion-sessions/:sessionId

获取学习会话状态。

### PATCH /api/semantic/confusion-sessions/:sessionId

更新学习进度。

**Request Body:**

```typescript
{
  currentIndex?: number;      // 推进到某位置
  status?: 'completed' | 'abandoned';
}
```

---

## Database Schema

### Table: confusion_pairs_cache

```sql
CREATE TABLE "confusion_pairs_cache" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "word1Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "word2Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "wordBookId" TEXT NOT NULL REFERENCES "word_books"("id") ON DELETE CASCADE,
    "clusterId" TEXT REFERENCES "word_clusters"("id") ON DELETE SET NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT "confusion_pairs_cache_ordering" CHECK ("word1Id" < "word2Id"),
    UNIQUE ("word1Id", "word2Id", "model")
);

CREATE INDEX "idx_confusion_cache_cluster_distance"
ON "confusion_pairs_cache" ("clusterId", "distance");

CREATE INDEX "idx_confusion_cache_wordbook_distance"
ON "confusion_pairs_cache" ("wordBookId", "distance");

CREATE INDEX "idx_confusion_cache_word1"
ON "confusion_pairs_cache" ("word1Id");

CREATE INDEX "idx_confusion_cache_word2"
ON "confusion_pairs_cache" ("word2Id");
```

### Table: embedding_changes

```sql
CREATE TABLE "embedding_changes" (
    "id" BIGSERIAL PRIMARY KEY,
    "wordId" TEXT NOT NULL,
    "wordBookId" TEXT NOT NULL,
    "action" TEXT NOT NULL CHECK ("action" IN ('INSERT', 'UPDATE', 'DELETE')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "processedAt" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_embedding_changes_unprocessed"
ON "embedding_changes" ("wordBookId", "id")
WHERE "processedAt" IS NULL;
```

### Table: confusion_cache_status

```sql
CREATE TABLE "confusion_cache_status" (
    "wordBookId" TEXT PRIMARY KEY REFERENCES "word_books"("id") ON DELETE CASCADE,
    "lastProcessedChangeId" BIGINT DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'completed')),
    "pairCount" INTEGER DEFAULT 0,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Table: confusion_learning_sessions

```sql
CREATE TABLE "confusion_learning_sessions" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "clusterId" TEXT REFERENCES "word_clusters"("id") ON DELETE SET NULL,
    "themeLabel" TEXT NOT NULL,
    "pairIds" JSONB NOT NULL DEFAULT '[]',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'completed', 'abandoned')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX "idx_confusion_sessions_user_active"
ON "confusion_learning_sessions" ("userId", "status")
WHERE "status" = 'active';
```

---

## PBT Properties

### P1: Worker Idempotency

- **INVARIANT**: 重复处理相同的 `embedding_changes` 批次产生相同的缓存状态
- **FALSIFICATION**: 生成随机 embeddings，以不同顺序重放变更日志，断言缓存行数和距离值相同

### P2: Cache Consistency

- **INVARIANT**: 同步后，缓存包含所有 distance < 0.3 的对，不包含 >= 0.3 的对
- **FALSIFICATION**: 生成 embeddings，计算真实距离，运行 worker，比较缓存与真实值的集合相等性

### P3: Progress Monotonicity

- **INVARIANT**: `last_processed_change_id` 只增不减
- **FALSIFICATION**: 随机注入崩溃/重启，断言进度值单调递增

### P4: Distance Bounds

- **INVARIANT**: 所有缓存的 distance ∈ [0.0, 0.3]
- **FALSIFICATION**: 生成边界距离值 (0.2999, 0.3000, 0.3001)，断言缓存排除 >= 0.3

### P5: Canonical Ordering

- **INVARIANT**: 所有缓存行满足 word1Id < word2Id
- **FALSIFICATION**: 随机顺序插入词对，断言数据库约束强制规范化

### P6: Delete Idempotency

- **INVARIANT**: 删除同一 embedding 两次，缓存状态不变
- **FALSIFICATION**: 生成缓存，执行两次删除，断言第二次无额外行被删除

### P7: NULL Cluster Fallback

- **INVARIANT**: clusterId = NULL 的对通过 wordBookId 查询可达
- **FALSIFICATION**: 生成无聚类分配的对，验证按 clusterId 查不到，按 wordBookId 能查到

### P8: Queue Round-trip

- **INVARIANT**: 学习会话状态序列化/反序列化后逻辑等价
- **FALSIFICATION**: 生成随机会话状态，存入 DB，读出，断言 currentIndex 和 pairIds 相等

### P9: Learning Count Bounds

- **INVARIANT**: 会话 pairIds 长度 ∈ [1, totalAvailablePairs]
- **FALSIFICATION**: 请求负数、0、超大数量，断言服务端正确钳制

### P10: Initial Fill Consistency

- **INVARIANT**: 启动时全量填充结果 = 从空变更日志增量重放结果
- **FALSIFICATION**: 生成 embeddings，分别运行全量初始化和增量重放，比较缓存内容
