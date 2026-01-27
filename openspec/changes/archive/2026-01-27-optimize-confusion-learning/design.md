# Design: optimize-confusion-learning

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
├─────────────────────────────────────────────────────────────────┤
│  ConfusionWordsPage                    │  LearningPage          │
│  ├─ 按主题分组展示混淆词对              │  ├─ 混淆词队列管理     │
│  │   (复用 word_clusters)              │  ├─ 对比展示模式       │
│  ├─ 用户选择主题 → 展开该主题内词对     │  ├─ 用户控制学习数量   │
│  ├─ 用户自选学习数量(滑块/输入)         │  └─ 进度 + 跳过/结束   │
│  └─ 快速加载(查缓存表)                  │                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend API                              │
├─────────────────────────────────────────────────────────────────┤
│  GET /api/semantic/confusion-by-cluster (按聚类查混淆词对)       │
│  GET /api/semantic/confusion-pairs (查缓存表，含 clusterId)      │
│  POST /api/semantic/confusion-pairs/refresh (触发增量刷新)       │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Database                                 │
├─────────────────────────────────────────────────────────────────┤
│  confusion_pairs_cache                                          │
│  ├─ word1_id, word2_id, distance, word_book_id, cluster_id      │
│  ├─ INDEX (cluster_id, distance) ← 新增聚类索引                  │
│  ├─ INDEX (word_book_id, distance)                              │
│  └─ updated_at (用于增量刷新)                                    │
│                                                                  │
│  word_clusters (已有)                                            │
│  ├─ themeLabel: "📚 winter - 冬天相关"                           │
│  └─ wordIds: 该主题下的所有词                                    │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Background Worker                             │
├─────────────────────────────────────────────────────────────────┤
│  ConfusionPairsCacheWorker                                      │
│  ├─ 首次全量计算 (关联 cluster_id)                               │
│  ├─ 监听 embedding 变更事件                                      │
│  └─ 增量更新受影响词对                                           │
└─────────────────────────────────────────────────────────────────┘
```

## 核心交互流程

```
用户进入易混淆词页面
        │
        ▼
┌───────────────────────────────┐
│  显示主题列表(来自 word_clusters) │
│  如: 🐾 动物类 (12对混淆词)      │
│      🔢 数字类 (8对混淆词)       │
│      ❄️ 冬季类 (6对混淆词)       │
└───────────────────────────────┘
        │ 用户点击某主题
        ▼
┌───────────────────────────────┐
│  展开该主题内的混淆词对列表      │
│  + 数量选择器: [学习 _5_ 对]    │
│  + [开始学习] 按钮              │
└───────────────────────────────┘
        │ 用户设置数量并开始
        ▼
┌───────────────────────────────┐
│  进入学习页，队列包含用户选的    │
│  N 对词，全部来自同一主题        │
└───────────────────────────────┘
```

## Design Decisions

### DD1: 预计算缓存 vs 实时计算

**选项 A**：预计算缓存（选中）

- 优点：查询 O(1)，前端体验流畅
- 缺点：需要额外存储，需要维护一致性

**选项 B**：pgvector 索引优化

- 优点：无额外存储
- 缺点：O(n²) 本质无法解决，向量索引不支持 pair-wise 查询

**结论**：选择 A，因为混淆词对相对稳定，预计算收益大。

### DD2: 按主题分组 vs 自由勾选

**选项 A**：按主题分组（选中）

- 用户选择一个主题（如"动物类"），系统展示该主题内的混淆词对
- 用户通过滑块/输入框选择学习数量（1~N对）
- 优点：一批词对有内在语义关联，学习效果更好
- 缺点：需要预先完成聚类

**选项 B**：自由勾选任意词对

- 用户在全局列表中任意勾选
- 缺点：选出的词对可能毫无关联，学习效率低

**结论**：选择 A，复用现有 `word_clusters` 聚类结果，确保同批词对有主题关联。

### DD3: 用户控制学习数量

**方案**：主题展开后提供数量选择器

- 滑块或数字输入，范围 1 ~ 该主题内的总对数
- 默认值：min(5, 总对数)
- 系统按相似度排序，优先推荐最易混淆的 N 对

**理由**：满足用户自主控制需求，同时提供合理默认值。

### DD4: 批量学习的队列设计

**方案**：复用现有 `seedWords` 机制

- `seedSource: 'confusion-batch'` 区分单对/批量模式
- 扩展 `LearningSeedState` 增加 `confusionPairs` 和 `themeLabel` 字段
- 学习页根据 source 类型渲染对比模式 UI

**理由**：最小改动，复用现有 WordQueueManager 基础设施。

### DD5: 缓存刷新策略

采用**增量更新**：

1. 新增 embedding 时：计算该词与同词书所有词的距离，关联所属 cluster_id
2. 删除 embedding 时：删除缓存表中相关记录
3. 聚类更新时：批量更新受影响词对的 cluster_id
4. 定时任务：每日凌晨全量校验一次（可选）

**阈值处理**：缓存表存储所有 distance < 0.3 的词对，前端按需过滤。

**cluster_id 关联**：词对的 cluster_id 取两词共同所属的聚类（若有多个取第一个）。

## Data Model

### 新增表: confusion_pairs_cache

```sql
CREATE TABLE "confusion_pairs_cache" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "word1Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "word2Id" TEXT NOT NULL REFERENCES "words"("id") ON DELETE CASCADE,
    "wordBookId" TEXT NOT NULL REFERENCES "word_books"("id") ON DELETE CASCADE,
    "clusterId" TEXT REFERENCES "word_clusters"("id") ON DELETE SET NULL,  -- 所属主题聚类
    "distance" DOUBLE PRECISION NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE ("word1Id", "word2Id", "model")
);

-- 按主题查询混淆词对（核心索引）
CREATE INDEX "idx_confusion_cache_cluster_distance"
ON "confusion_pairs_cache" ("clusterId", "distance");

-- 按词书查询（兼容旧逻辑）
CREATE INDEX "idx_confusion_cache_wordbook_distance"
ON "confusion_pairs_cache" ("wordBookId", "distance");
```

## Component Changes

### Frontend

1. **ConfusionWordsPage** - 重构为主题分组模式
   - 显示主题列表（来自 word_clusters + 各主题内混淆词对数）
   - 点击主题展开：显示该主题内的混淆词对列表
   - 数量选择器：滑块或输入框，用户自选学习几对
   - "开始学习" 按钮，传递选定数量的 pairs + themeLabel
   - 加载状态优化：skeleton + 分页

2. **LearningPage**
   - 识别 `seedSource === 'confusion-batch'`
   - 显示主题标签 + 当前是第几组/共几组
   - 对比模式 UI（可选：并排显示两词）

3. **新增 hooks**
   - `useConfusionByCluster`: 按聚类查询混淆词对
   - `useConfusionQueue`: 管理批量混淆词学习状态

### Backend

1. **新增 API**: `GET /api/semantic/confusion-by-cluster`
   - 返回各主题聚类及其内部混淆词对数量
   - 用于渲染主题列表

2. **新增 API**: `GET /api/semantic/confusion-pairs/cached`
   - 直接查询缓存表
   - 参数：clusterId, threshold, limit（用户指定数量）
   - 按 distance 升序返回，优先返回最易混淆的

3. **新增 Worker**: `ConfusionCacheWorker`
   - 监听 `embedding_created` / `embedding_deleted` 事件
   - 计算时关联 cluster_id
   - 执行增量计算

## Migration Path

1. 部署 migration 创建缓存表
2. 运行一次性脚本填充历史数据
3. 部署新 Worker 开始增量更新
4. 切换前端到新 API
