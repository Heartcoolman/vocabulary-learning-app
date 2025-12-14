# AMAS 仓储模式重构方案

## 执行摘要

本文档深入分析了 AMAS 引擎与 Prisma 的耦合问题，并提供完整的仓储模式重构方案。通过实施本方案，将显著提升代码的可测试性、可维护性和可扩展性。

**关键发现：**

- 🔴 **高风险区域**：7个文件直接依赖 Prisma，存在严重耦合
- 🟡 **中等风险区域**：2个文件部分耦合但已有仓储模式基础
- 🟢 **已重构区域**：核心引擎已完成仓储模式抽象

---

## 1. 当前状态统计分析

### 1.1 Prisma 依赖分布统计

通过代码扫描，发现以下文件直接使用 Prisma：

| 文件路径                                          | Prisma 使用次数      | 耦合等级 | 优先级 |
| ------------------------------------------------- | -------------------- | -------- | ------ |
| `amas/tracking/word-memory-tracker.ts`            | 11次                 | 🔴 严重  | P0     |
| `amas/services/llm-advisor/llm-weekly-advisor.ts` | 8次                  | 🔴 严重  | P0     |
| `amas/services/llm-advisor/stats-collector.ts`    | 9次                  | 🔴 严重  | P1     |
| `amas/cold-start/global-stats.ts`                 | 1次 (raw query)      | 🔴 严重  | P1     |
| `amas/models/cognitive.ts`                        | 1次                  | 🟡 中等  | P2     |
| `amas/evaluation/word-mastery-evaluator.ts`       | 4次                  | 🟡 中等  | P2     |
| `amas/core/engine.ts`                             | 1次 (reward profile) | 🟢 轻微  | P3     |

**总计：35+ 处直接 Prisma 调用**

### 1.2 反模式识别

#### 反模式 1：业务逻辑层直接查询数据库

```typescript
// ❌ 不好的实践 - word-memory-tracker.ts
async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
  await prisma.wordReviewTrace.create({
    data: {
      userId,
      wordId,
      timestamp: new Date(event.timestamp),
      isCorrect: event.isCorrect,
      responseTime: event.responseTime
    }
  });
}
```

**问题：**

1. 业务逻辑与数据访问耦合
2. 单元测试需要 Mock 整个 Prisma 客户端
3. 无法在不同数据源之间切换
4. 违反依赖倒置原则（DIP）

#### 反模式 2：Raw SQL 查询分散在业务代码中

```typescript
// ❌ 不好的实践 - global-stats.ts
const stats = await prisma.$queryRaw<
  Array<{
    avgaccuracy: number;
    avgresponsetime: number;
  }>
>`
  WITH user_initial_interactions AS (...)
  SELECT AVG(...) FROM ...
`;
```

**问题：**

1. SQL 逻辑无法复用
2. 难以测试
3. 数据库切换困难
4. 类型安全性弱

#### 反模式 3：批量查询逻辑分散

```typescript
// ❌ 不好的实践 - word-mastery-evaluator.ts
const [wordStateRows, wordScoreRows] = await Promise.all([
  prisma.wordLearningState.findMany({ where: { userId, wordId: { in: wordIds } } }),
  prisma.wordScore.findMany({ where: { userId, wordId: { in: wordIds } } }),
]);
```

**问题：**

1. 批量查询逻辑重复
2. N+1 查询风险
3. 缓存策略难以统一

### 1.3 现有仓储模式评估（已实现部分）

✅ **良好实践：核心引擎的仓储抽象**

```typescript
// ✅ 好的实践 - repositories/database-repository.ts
export interface StateRepository {
  loadState(userId: string): Promise<UserState | null>;
  saveState(userId: string, state: UserState): Promise<void>;
}

export class DatabaseStateRepository implements StateRepository {
  async loadState(userId: string): Promise<UserState | null> {
    const record = await prisma.amasUserState.findUnique({ where: { userId } });
    // ... 转换逻辑
  }
}
```

**优势：**

1. 接口与实现分离
2. 支持依赖注入
3. 易于 Mock 测试
4. 已有缓存装饰器实现

---

## 2. 完整仓储模式设计

### 2.1 架构原则

1. **接口隔离原则（ISP）**：每个仓储接口只定义必要的方法
2. **依赖倒置原则（DIP）**：业务层依赖接口，实现层依赖具体技术
3. **单一职责原则（SRP）**：每个仓储只负责一个聚合根
4. **开闭原则（OCP）**：通过扩展新实现而非修改现有代码来适应变化

### 2.2 仓储接口定义

#### 2.2.1 单词复习轨迹仓储

```typescript
/**
 * 单词复习轨迹仓储接口
 *
 * 职责：管理用户的单词复习历史记录
 */
export interface IWordReviewTraceRepository {
  /**
   * 记录单次复习事件
   */
  recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void>;

  /**
   * 批量记录复习事件
   */
  batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>,
  ): Promise<void>;

  /**
   * 获取单词的复习历史轨迹
   */
  getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]>;

  /**
   * 批量获取多个单词的记忆状态
   */
  batchGetMemoryState(userId: string, wordIds: string[]): Promise<Map<string, WordMemoryState>>;

  /**
   * 获取用户复习统计
   */
  getUserReviewStats(userId: string): Promise<ReviewStats>;

  /**
   * 清理过期记录
   */
  cleanupOldRecords(userId: string, olderThanMs: number): Promise<number>;

  /**
   * 限制单词记录数
   */
  trimWordRecords(userId: string, wordId: string, maxRecords?: number): Promise<number>;
}

/**
 * 复习事件数据
 */
export interface ReviewEvent {
  timestamp: number;
  isCorrect: boolean;
  responseTime: number;
}

/**
 * 复习统计数据
 */
export interface ReviewStats {
  totalReviews: number;
  uniqueWords: number;
  correctCount: number;
  incorrectCount: number;
  averageResponseTime: number;
}

/**
 * 单词记忆状态
 */
export interface WordMemoryState {
  wordId: string;
  reviewCount: number;
  lastReviewTs: number;
  trace: ReviewTrace[];
}

/**
 * 复习轨迹（ACT-R 格式）
 */
export interface ReviewTrace {
  secondsAgo: number;
  isCorrect: boolean;
}
```

#### 2.2.2 单词掌握度数据仓储

```typescript
/**
 * 单词掌握度数据仓储接口
 *
 * 职责：管理单词学习状态和评分数据
 */
export interface IWordMasteryRepository {
  /**
   * 获取单词学习状态
   */
  getWordState(userId: string, wordId: string): Promise<WordLearningState | null>;

  /**
   * 批量获取单词学习状态
   */
  batchGetWordStates(userId: string, wordIds: string[]): Promise<Map<string, WordLearningState>>;

  /**
   * 获取单词评分
   */
  getWordScore(userId: string, wordId: string): Promise<WordScore | null>;

  /**
   * 批量获取单词评分
   */
  batchGetWordScores(userId: string, wordIds: string[]): Promise<Map<string, WordScore>>;

  /**
   * 更新单词学习状态
   */
  updateWordState(userId: string, wordId: string, state: Partial<WordLearningState>): Promise<void>;

  /**
   * 批量更新单词状态
   */
  batchUpdateWordStates(
    userId: string,
    updates: Array<{ wordId: string; state: Partial<WordLearningState> }>,
  ): Promise<void>;
}
```

#### 2.2.3 全局统计仓储

```typescript
/**
 * 全局统计仓储接口
 *
 * 职责：提供全局用户行为统计数据
 */
export interface IGlobalStatsRepository {
  /**
   * 计算新用户的初始阶段统计
   *
   * @param initialPhaseLimit 初始阶段交互次数限制
   * @returns 全局统计数据
   */
  computeInitialPhaseStats(initialPhaseLimit: number): Promise<InitialPhaseStats>;

  /**
   * 获取用户类型分布
   */
  getUserTypeDistribution(): Promise<Record<UserType, number>>;

  /**
   * 获取全局准确率趋势
   */
  getAccuracyTrend(daysBack: number): Promise<Array<{ date: Date; accuracy: number }>>;
}

/**
 * 初始阶段统计数据
 */
export interface InitialPhaseStats {
  avgAccuracy: number;
  avgResponseTime: number;
  avgDwellTime: number;
  sampleSize: number;
}

/**
 * 用户类型
 */
export type UserType = 'fast' | 'stable' | 'cautious';
```

#### 2.2.4 LLM 建议仓储

```typescript
/**
 * LLM 建议仓储接口
 *
 * 职责：管理 LLM 生成的学习建议
 */
export interface ILLMSuggestionRepository {
  /**
   * 存储建议
   */
  storeSuggestion(suggestion: LLMSuggestionInput): Promise<StoredSuggestion>;

  /**
   * 获取建议列表
   */
  getSuggestions(options?: SuggestionQueryOptions): Promise<PaginatedSuggestions>;

  /**
   * 获取单个建议
   */
  getSuggestion(id: string): Promise<StoredSuggestion | null>;

  /**
   * 更新建议状态
   */
  updateSuggestionStatus(
    id: string,
    status: SuggestionStatus,
    metadata?: SuggestionMetadata,
  ): Promise<void>;

  /**
   * 统计建议数量
   */
  countSuggestions(filter?: SuggestionFilter): Promise<number>;

  /**
   * 查找最新的待处理建议
   */
  findLatestPendingSuggestion(): Promise<StoredSuggestion | null>;
}

/**
 * 建议查询选项
 */
export interface SuggestionQueryOptions {
  status?: SuggestionStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'weekStart';
  order?: 'asc' | 'desc';
}

/**
 * 分页建议结果
 */
export interface PaginatedSuggestions {
  items: StoredSuggestion[];
  total: number;
  hasMore: boolean;
}
```

#### 2.2.5 用户行为统计仓储

```typescript
/**
 * 用户行为统计仓储接口
 *
 * 职责：提供用户学习行为的统计分析数据
 */
export interface IUserBehaviorStatsRepository {
  /**
   * 获取用户总数
   */
  getTotalUserCount(): Promise<number>;

  /**
   * 获取活跃用户统计
   */
  getActiveUserStats(period: { start: Date; end: Date }): Promise<ActiveUserStats>;

  /**
   * 获取答题统计
   */
  getAnswerStats(userId: string, period: { start: Date; end: Date }): Promise<AnswerStats>;

  /**
   * 获取学习会话统计
   */
  getSessionStats(period: { start: Date; end: Date }): Promise<SessionStats>;

  /**
   * 获取用户准确率分布
   */
  getUserAccuracyDistribution(period: { start: Date; end: Date }): Promise<AccuracyDistribution>;

  /**
   * 获取用户小时性能数据
   */
  getHourlyPerformance(userId: string): Promise<Array<HourlyPerformance>>;
}

/**
 * 活跃用户统计
 */
export interface ActiveUserStats {
  totalActive: number;
  newUsers: number;
  returningUsers: number;
}

/**
 * 答题统计
 */
export interface AnswerStats {
  totalAnswers: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  avgResponseTime: number;
  uniqueWordsLearned: number;
}

/**
 * 小时性能数据
 */
export interface HourlyPerformance {
  hour: number;
  performance: number;
  sampleCount: number;
}
```

#### 2.2.6 用户奖励配置仓储

```typescript
/**
 * 用户奖励配置仓储接口
 *
 * 职责：管理用户的奖励配置（用于优化学习反馈）
 */
export interface IUserRewardRepository {
  /**
   * 获取用户奖励配置
   */
  getRewardProfile(userId: string): Promise<RewardProfile | null>;

  /**
   * 更新用户奖励配置
   */
  updateRewardProfile(userId: string, profileId: string): Promise<void>;

  /**
   * 批量获取用户奖励配置
   */
  batchGetRewardProfiles(userIds: string[]): Promise<Map<string, RewardProfile>>;
}

/**
 * 奖励配置
 */
export interface RewardProfile {
  id: string;
  name: string;
  weights: {
    accuracy: number;
    speed: number;
    retention: number;
    consistency: number;
  };
}
```

### 2.3 实现类设计

#### 2.3.1 Prisma 实现类

```typescript
/**
 * 单词复习轨迹 Prisma 仓储实现
 */
export class PrismaWordReviewTraceRepository implements IWordReviewTraceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    await this.prisma.wordReviewTrace.create({
      data: {
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime,
      },
    });
  }

  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>,
  ): Promise<void> {
    await this.prisma.wordReviewTrace.createMany({
      data: events.map(({ wordId, event }) => ({
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime,
      })),
    });
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const now = Date.now();
    const records = await this.prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { timestamp: true, isCorrect: true },
    });

    return records.map((record) => ({
      secondsAgo: Math.floor((now - record.timestamp.getTime()) / 1000),
      isCorrect: record.isCorrect,
    }));
  }

  async batchGetMemoryState(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, WordMemoryState>> {
    if (wordIds.length === 0) return new Map();

    const now = Date.now();
    const records = await this.prisma.wordReviewTrace.findMany({
      where: { userId, wordId: { in: wordIds } },
      orderBy: { timestamp: 'desc' },
      select: { wordId: true, timestamp: true, isCorrect: true },
    });

    // 按 wordId 分组
    const grouped = this.groupRecordsByWordId(records);

    // 转换为 WordMemoryState
    return this.convertToMemoryStates(grouped, wordIds, now);
  }

  async getUserReviewStats(userId: string): Promise<ReviewStats> {
    const [stats, correctCount, uniqueWords] = await Promise.all([
      this.prisma.wordReviewTrace.aggregate({
        where: { userId },
        _count: { id: true },
        _avg: { responseTime: true },
      }),
      this.prisma.wordReviewTrace.count({ where: { userId, isCorrect: true } }),
      this.prisma.wordReviewTrace.groupBy({
        by: ['wordId'],
        where: { userId },
        _count: true,
      }),
    ]);

    return {
      totalReviews: stats._count.id,
      uniqueWords: uniqueWords.length,
      correctCount,
      incorrectCount: stats._count.id - correctCount,
      averageResponseTime: stats._avg.responseTime ?? 0,
    };
  }

  async cleanupOldRecords(userId: string, olderThanMs: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMs);
    const result = await this.prisma.wordReviewTrace.deleteMany({
      where: { userId, timestamp: { lt: cutoffDate } },
    });
    return result.count;
  }

  async trimWordRecords(userId: string, wordId: string, maxRecords: number = 100): Promise<number> {
    const keepRecords = await this.prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: maxRecords,
      select: { id: true },
    });

    if (keepRecords.length === 0) return 0;

    const result = await this.prisma.wordReviewTrace.deleteMany({
      where: {
        userId,
        wordId,
        id: { notIn: keepRecords.map((r) => r.id) },
      },
    });

    return result.count;
  }

  private groupRecordsByWordId(
    records: Array<{ wordId: string; timestamp: Date; isCorrect: boolean }>,
  ): Map<string, Array<{ timestamp: Date; isCorrect: boolean }>> {
    const grouped = new Map<string, Array<{ timestamp: Date; isCorrect: boolean }>>();
    for (const record of records) {
      const existing = grouped.get(record.wordId) ?? [];
      existing.push({ timestamp: record.timestamp, isCorrect: record.isCorrect });
      grouped.set(record.wordId, existing);
    }
    return grouped;
  }

  private convertToMemoryStates(
    grouped: Map<string, Array<{ timestamp: Date; isCorrect: boolean }>>,
    wordIds: string[],
    now: number,
  ): Map<string, WordMemoryState> {
    const result = new Map<string, WordMemoryState>();

    for (const wordId of wordIds) {
      const wordRecords = grouped.get(wordId) ?? [];
      const limitedRecords = wordRecords.slice(0, 100);

      const trace: ReviewTrace[] = limitedRecords.map((r) => ({
        secondsAgo: Math.floor((now - r.timestamp.getTime()) / 1000),
        isCorrect: r.isCorrect,
      }));

      const lastReviewTs = limitedRecords.length > 0 ? limitedRecords[0].timestamp.getTime() : 0;

      result.set(wordId, {
        wordId,
        reviewCount: wordRecords.length,
        lastReviewTs,
        trace,
      });
    }

    return result;
  }
}
```

#### 2.3.2 内存 Mock 实现（用于测试）

```typescript
/**
 * 单词复习轨迹内存仓储实现（用于测试）
 */
export class InMemoryWordReviewTraceRepository implements IWordReviewTraceRepository {
  private readonly records: Map<
    string,
    Array<{
      userId: string;
      wordId: string;
      timestamp: number;
      isCorrect: boolean;
      responseTime: number;
    }>
  > = new Map();

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    const key = `${userId}:${wordId}`;
    const existing = this.records.get(key) ?? [];
    existing.push({
      userId,
      wordId,
      timestamp: event.timestamp,
      isCorrect: event.isCorrect,
      responseTime: event.responseTime,
    });
    this.records.set(key, existing);
  }

  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>,
  ): Promise<void> {
    for (const { wordId, event } of events) {
      await this.recordReview(userId, wordId, event);
    }
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const key = `${userId}:${wordId}`;
    const records = this.records.get(key) ?? [];
    const now = Date.now();

    return records
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((r) => ({
        secondsAgo: Math.floor((now - r.timestamp) / 1000),
        isCorrect: r.isCorrect,
      }));
  }

  async batchGetMemoryState(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, WordMemoryState>> {
    const result = new Map<string, WordMemoryState>();
    const now = Date.now();

    for (const wordId of wordIds) {
      const key = `${userId}:${wordId}`;
      const records = this.records.get(key) ?? [];
      const sortedRecords = records.sort((a, b) => b.timestamp - a.timestamp);

      const trace: ReviewTrace[] = sortedRecords.slice(0, 100).map((r) => ({
        secondsAgo: Math.floor((now - r.timestamp) / 1000),
        isCorrect: r.isCorrect,
      }));

      result.set(wordId, {
        wordId,
        reviewCount: records.length,
        lastReviewTs: sortedRecords.length > 0 ? sortedRecords[0].timestamp : 0,
        trace,
      });
    }

    return result;
  }

  async getUserReviewStats(userId: string): Promise<ReviewStats> {
    let totalReviews = 0;
    let correctCount = 0;
    let totalResponseTime = 0;
    const uniqueWords = new Set<string>();

    for (const [key, records] of this.records.entries()) {
      if (!key.startsWith(`${userId}:`)) continue;

      for (const record of records) {
        totalReviews++;
        if (record.isCorrect) correctCount++;
        totalResponseTime += record.responseTime;
        uniqueWords.add(record.wordId);
      }
    }

    return {
      totalReviews,
      uniqueWords: uniqueWords.size,
      correctCount,
      incorrectCount: totalReviews - correctCount,
      averageResponseTime: totalReviews > 0 ? totalResponseTime / totalReviews : 0,
    };
  }

  async cleanupOldRecords(userId: string, olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;
    let deletedCount = 0;

    for (const [key, records] of this.records.entries()) {
      if (!key.startsWith(`${userId}:`)) continue;

      const filtered = records.filter((r) => r.timestamp >= cutoffTime);
      deletedCount += records.length - filtered.length;

      if (filtered.length === 0) {
        this.records.delete(key);
      } else {
        this.records.set(key, filtered);
      }
    }

    return deletedCount;
  }

  async trimWordRecords(userId: string, wordId: string, maxRecords: number = 100): Promise<number> {
    const key = `${userId}:${wordId}`;
    const records = this.records.get(key) ?? [];

    if (records.length <= maxRecords) return 0;

    const sorted = records.sort((a, b) => b.timestamp - a.timestamp);
    const kept = sorted.slice(0, maxRecords);
    const deletedCount = records.length - kept.length;

    this.records.set(key, kept);

    return deletedCount;
  }

  // 测试辅助方法
  clear(): void {
    this.records.clear();
  }

  getRecordCount(): number {
    let count = 0;
    for (const records of this.records.values()) {
      count += records.length;
    }
    return count;
  }
}
```

### 2.4 缓存装饰器设计

```typescript
/**
 * 带缓存的单词复习轨迹仓储装饰器
 *
 * 使用 Cache-Aside Pattern
 */
export class CachedWordReviewTraceRepository implements IWordReviewTraceRepository {
  private readonly TRACE_TTL = 60; // 60秒
  private readonly STATS_TTL = 300; // 5分钟

  constructor(
    private readonly inner: IWordReviewTraceRepository,
    private readonly cache: ICacheService,
  ) {}

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    // 写入数据
    await this.inner.recordReview(userId, wordId, event);

    // 失效相关缓存
    await this.invalidateWordCache(userId, wordId);
    await this.invalidateUserStatsCache(userId);
  }

  async batchRecordReview(
    userId: string,
    events: Array<{ wordId: string; event: ReviewEvent }>,
  ): Promise<void> {
    await this.inner.batchRecordReview(userId, events);

    // 批量失效缓存
    await Promise.all([
      ...events.map((e) => this.invalidateWordCache(userId, e.wordId)),
      this.invalidateUserStatsCache(userId),
    ]);
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const cacheKey = `word_trace:${userId}:${wordId}:${limit}`;

    // 尝试从缓存获取
    const cached = await this.cache.get<ReviewTrace[]>(cacheKey);
    if (cached) return cached;

    // 缓存未命中，查询数据库
    const trace = await this.inner.getReviewTrace(userId, wordId, limit);

    // 写入缓存
    await this.cache.set(cacheKey, trace, this.TRACE_TTL);

    return trace;
  }

  async batchGetMemoryState(
    userId: string,
    wordIds: string[],
  ): Promise<Map<string, WordMemoryState>> {
    // 批量查询通常不缓存（数据量大且查询模式多样）
    return this.inner.batchGetMemoryState(userId, wordIds);
  }

  async getUserReviewStats(userId: string): Promise<ReviewStats> {
    const cacheKey = `user_review_stats:${userId}`;

    const cached = await this.cache.get<ReviewStats>(cacheKey);
    if (cached) return cached;

    const stats = await this.inner.getUserReviewStats(userId);

    await this.cache.set(cacheKey, stats, this.STATS_TTL);

    return stats;
  }

  async cleanupOldRecords(userId: string, olderThanMs: number): Promise<number> {
    const count = await this.inner.cleanupOldRecords(userId, olderThanMs);
    // 清理后失效所有用户缓存
    await this.invalidateUserCache(userId);
    return count;
  }

  async trimWordRecords(userId: string, wordId: string, maxRecords?: number): Promise<number> {
    const count = await this.inner.trimWordRecords(userId, wordId, maxRecords);
    await this.invalidateWordCache(userId, wordId);
    return count;
  }

  private async invalidateWordCache(userId: string, wordId: string): Promise<void> {
    const patterns = [`word_trace:${userId}:${wordId}:*`, `word_memory:${userId}:${wordId}`];
    await Promise.all(patterns.map((p) => this.cache.deletePattern(p)));
  }

  private async invalidateUserStatsCache(userId: string): Promise<void> {
    await this.cache.delete(`user_review_stats:${userId}`);
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cache.deletePattern(`*:${userId}:*`);
  }
}
```

### 2.5 依赖注入配置

```typescript
/**
 * 仓储工厂
 *
 * 职责：根据环境创建和配置仓储实例
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: ICacheService,
    private readonly config: RepositoryConfig,
  ) {}

  static initialize(
    prisma: PrismaClient,
    cache: ICacheService,
    config: RepositoryConfig = {},
  ): void {
    if (RepositoryFactory.instance) {
      throw new Error('RepositoryFactory already initialized');
    }
    RepositoryFactory.instance = new RepositoryFactory(prisma, cache, config);
  }

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      throw new Error('RepositoryFactory not initialized');
    }
    return RepositoryFactory.instance;
  }

  /**
   * 创建单词复习轨迹仓储
   */
  createWordReviewTraceRepository(): IWordReviewTraceRepository {
    const base = new PrismaWordReviewTraceRepository(this.prisma);

    // 根据配置决定是否启用缓存
    if (this.config.enableCache !== false) {
      return new CachedWordReviewTraceRepository(base, this.cache);
    }

    return base;
  }

  /**
   * 创建单词掌握度仓储
   */
  createWordMasteryRepository(): IWordMasteryRepository {
    const base = new PrismaWordMasteryRepository(this.prisma);

    if (this.config.enableCache !== false) {
      return new CachedWordMasteryRepository(base, this.cache);
    }

    return base;
  }

  /**
   * 创建全局统计仓储
   */
  createGlobalStatsRepository(): IGlobalStatsRepository {
    return new PrismaGlobalStatsRepository(this.prisma);
  }

  /**
   * 创建 LLM 建议仓储
   */
  createLLMSuggestionRepository(): ILLMSuggestionRepository {
    return new PrismaLLMSuggestionRepository(this.prisma);
  }

  /**
   * 创建用户行为统计仓储
   */
  createUserBehaviorStatsRepository(): IUserBehaviorStatsRepository {
    return new PrismaUserBehaviorStatsRepository(this.prisma);
  }

  /**
   * 创建用户奖励配置仓储
   */
  createUserRewardRepository(): IUserRewardRepository {
    const base = new PrismaUserRewardRepository(this.prisma);

    if (this.config.enableCache !== false) {
      return new CachedUserRewardRepository(base, this.cache);
    }

    return base;
  }

  /**
   * 创建测试用的内存仓储集合
   */
  static createInMemoryRepositories(): RepositoryCollection {
    return {
      wordReviewTrace: new InMemoryWordReviewTraceRepository(),
      wordMastery: new InMemoryWordMasteryRepository(),
      globalStats: new InMemoryGlobalStatsRepository(),
      llmSuggestion: new InMemoryLLMSuggestionRepository(),
      userBehaviorStats: new InMemoryUserBehaviorStatsRepository(),
      userReward: new InMemoryUserRewardRepository(),
    };
  }
}

/**
 * 仓储配置
 */
export interface RepositoryConfig {
  /** 是否启用缓存（默认 true） */
  enableCache?: boolean;
  /** 缓存 TTL 配置 */
  cacheTTL?: {
    trace?: number;
    stats?: number;
    mastery?: number;
  };
}

/**
 * 仓储集合
 */
export interface RepositoryCollection {
  wordReviewTrace: IWordReviewTraceRepository;
  wordMastery: IWordMasteryRepository;
  globalStats: IGlobalStatsRepository;
  llmSuggestion: ILLMSuggestionRepository;
  userBehaviorStats: IUserBehaviorStatsRepository;
  userReward: IUserRewardRepository;
}

/**
 * 全局仓储实例（单例）
 */
let repositories: RepositoryCollection | null = null;

/**
 * 初始化仓储
 */
export function initializeRepositories(
  prisma: PrismaClient,
  cache: ICacheService,
  config?: RepositoryConfig,
): void {
  RepositoryFactory.initialize(prisma, cache, config);

  const factory = RepositoryFactory.getInstance();
  repositories = {
    wordReviewTrace: factory.createWordReviewTraceRepository(),
    wordMastery: factory.createWordMasteryRepository(),
    globalStats: factory.createGlobalStatsRepository(),
    llmSuggestion: factory.createLLMSuggestionRepository(),
    userBehaviorStats: factory.createUserBehaviorStatsRepository(),
    userReward: factory.createUserRewardRepository(),
  };
}

/**
 * 获取仓储实例
 */
export function getRepositories(): RepositoryCollection {
  if (!repositories) {
    throw new Error('Repositories not initialized. Call initializeRepositories first.');
  }
  return repositories;
}
```

---

## 3. 重构成本与收益分析

### 3.1 重构成本评估

| 阶段                          | 工作项 | 工时估算                  | 风险等级 |
| ----------------------------- | ------ | ------------------------- | -------- |
| **阶段1：设计与准备**         |        |                           |          |
| - 接口设计评审                | 4小时  | 🟢 低                     |
| - Mock 实现编写               | 8小时  | 🟢 低                     |
| - 工厂模式实现                | 4小时  | 🟢 低                     |
| **阶段2：核心仓储实现**       |        |                           |          |
| - WordReviewTrace 仓储        | 12小时 | 🟡 中                     |
| - WordMastery 仓储            | 10小时 | 🟡 中                     |
| - GlobalStats 仓储            | 8小时  | 🟡 中                     |
| - LLMSuggestion 仓储          | 6小时  | 🟢 低                     |
| - UserBehaviorStats 仓储      | 10小时 | 🟡 中                     |
| - UserReward 仓储             | 4小时  | 🟢 低                     |
| **阶段3：缓存装饰器**         |        |                           |          |
| - 缓存装饰器实现              | 12小时 | 🟡 中                     |
| - 失效策略设计                | 4小时  | 🟡 中                     |
| **阶段4：业务层迁移**         |        |                           |          |
| - word-memory-tracker 迁移    | 6小时  | 🟡 中                     |
| - word-mastery-evaluator 迁移 | 6小时  | 🟡 中                     |
| - llm-weekly-advisor 迁移     | 8小时  | 🟡 中                     |
| - cognitive 模型迁移          | 4小时  | 🟢 低                     |
| - global-stats 迁移           | 4小时  | 🟢 低                     |
| - engine 迁移                 | 2小时  | 🟢 低                     |
| **阶段5：测试**               |        |                           |          |
| - 单元测试编写                | 20小时 | 🟡 中                     |
| - 集成测试编写                | 12小时 | 🟡 中                     |
| - 性能测试                    | 8小时  | 🟡 中                     |
| **阶段6：部署与监控**         |        |                           |          |
| - 灰度发布配置                | 4小时  | 🟡 中                     |
| - 监控指标添加                | 4小时  | 🟢 低                     |
| - 文档更新                    | 6小时  | 🟢 低                     |
| **总计**                      |        | **146小时** (~18个工作日) |          |

### 3.2 收益分析

#### 3.2.1 可测试性提升（量化）

**重构前：**

- 需要 Mock 整个 Prisma 客户端（复杂度高）
- 每个测试文件平均 Mock 代码 ~50 行
- 测试执行需要数据库环境或复杂的 Mock 设置
- 测试运行时间：~3秒/测试套件（需要初始化 Prisma）

**重构后：**

- 使用轻量级内存仓储实现
- Mock 代码减少 80%（从 50 行降至 ~10 行）
- 测试运行时间：~0.3秒/测试套件（减少 90%）
- 测试覆盖率提升潜力：+25%

**示例对比：**

```typescript
// ❌ 重构前 - 复杂的 Prisma Mock
describe('WordMemoryTracker', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = {
      wordReviewTrace: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as any;

    // ... 更多 Mock 设置（~50行）
  });

  it('should record review', async () => {
    mockPrisma.wordReviewTrace.create.mockResolvedValue(/* ... */);
    // ... 测试逻辑
  });
});

// ✅ 重构后 - 简洁的内存仓储
describe('WordMemoryTracker', () => {
  let repository: IWordReviewTraceRepository;
  let tracker: WordMemoryTracker;

  beforeEach(() => {
    repository = new InMemoryWordReviewTraceRepository();
    tracker = new WordMemoryTracker(repository);
  });

  it('should record review', async () => {
    await tracker.recordReview('user1', 'word1', {
      timestamp: Date.now(),
      isCorrect: true,
      responseTime: 1000,
    });

    const trace = await repository.getReviewTrace('user1', 'word1');
    expect(trace).toHaveLength(1);
    expect(trace[0].isCorrect).toBe(true);
  });
});
```

#### 3.2.2 可维护性提升

| 维度             | 重构前                     | 重构后           | 提升  |
| ---------------- | -------------------------- | ---------------- | ----- |
| **代码复用**     | Prisma 查询分散在多处      | 集中在仓储层     | ⬆️ 高 |
| **修改影响范围** | 数据库查询变更影响多个文件 | 只影响仓储实现   | ⬆️ 高 |
| **新功能开发**   | 需要理解 Prisma + 业务逻辑 | 只需理解仓储接口 | ⬆️ 中 |
| **错误追踪**     | 数据访问错误难以定位       | 明确的仓储边界   | ⬆️ 中 |

#### 3.2.3 可扩展性提升

**重构后支持的扩展场景：**

1. **多数据源支持**：
   - 实现 MongoDB 仓储（同接口）
   - 实现 Redis 仓储（用于临时数据）
   - 实现混合仓储（热数据 Redis，冷数据 Postgres）

2. **性能优化**：
   - 添加批量查询优化
   - 实现查询结果缓存
   - 添加读写分离支持

3. **监控与分析**：
   - 装饰器模式轻松添加查询日志
   - 统计查询性能指标
   - 实现慢查询告警

**示例 - 添加查询日志装饰器：**

```typescript
export class LoggingWordReviewTraceRepository implements IWordReviewTraceRepository {
  constructor(
    private readonly inner: IWordReviewTraceRepository,
    private readonly logger: Logger,
  ) {}

  async getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]> {
    const startTime = Date.now();

    try {
      const result = await this.inner.getReviewTrace(userId, wordId, limit);
      const duration = Date.now() - startTime;

      this.logger.info('Query executed', {
        method: 'getReviewTrace',
        userId,
        wordId,
        limit,
        resultCount: result.length,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      this.logger.error('Query failed', {
        method: 'getReviewTrace',
        userId,
        wordId,
        error,
      });
      throw error;
    }
  }

  // ... 其他方法类似
}

// 使用：在工厂中组合装饰器
const base = new PrismaWordReviewTraceRepository(prisma);
const logged = new LoggingWordReviewTraceRepository(base, logger);
const cached = new CachedWordReviewTraceRepository(logged, cache);
```

#### 3.2.4 性能提升潜力

| 优化项           | 当前性能           | 优化后性能       | 提升     |
| ---------------- | ------------------ | ---------------- | -------- |
| **批量查询合并** | N 次查询           | 1 次查询         | ⬆️ N倍   |
| **查询结果缓存** | 每次查询数据库     | 缓存命中率 ~70%  | ⬆️ 3倍   |
| **连接池优化**   | 分散的查询难以优化 | 集中管理易于优化 | ⬆️ 1.5倍 |
| **读写分离**     | 主库承担所有负载   | 读操作分流到从库 | ⬆️ 2倍   |

### 3.3 风险评估与缓解

| 风险               | 影响 | 概率 | 缓解措施                                                |
| ------------------ | ---- | ---- | ------------------------------------------------------- |
| **数据迁移错误**   | 高   | 中   | 1. 充分的集成测试<br>2. 灰度发布<br>3. 数据校验脚本     |
| **性能回归**       | 中   | 低   | 1. 性能基准测试<br>2. 性能监控<br>3. 压力测试           |
| **接口设计不足**   | 中   | 中   | 1. 设计评审<br>2. 预留扩展点<br>3. 版本化接口           |
| **缓存一致性问题** | 中   | 中   | 1. 明确的失效策略<br>2. 版本号机制<br>3. 监控缓存命中率 |
| **团队学习曲线**   | 低   | 高   | 1. 详细文档<br>2. 代码示例<br>3. 团队培训               |

---

## 4. 分阶段迁移计划

### 阶段 0：准备阶段（1-2 天）

**目标：** 完成设计评审和基础设施准备

**任务清单：**

- [ ] 设计评审会议（所有接口定义）
- [ ] 创建仓储接口文件 `src/amas/repositories/interfaces/`
- [ ] 实现内存 Mock 仓储（用于测试）
- [ ] 实现仓储工厂和依赖注入配置
- [ ] 编写迁移指南文档

**输出物：**

- 接口定义文件（6个）
- 内存仓储实现（6个）
- 仓储工厂实现
- 迁移指南文档

### 阶段 1：高优先级仓储实现（3-4 天）

**目标：** 实现最常用的仓储（覆盖 70% 的使用场景）

**任务清单：**

- [ ] 实现 `PrismaWordReviewTraceRepository`
  - [ ] 基础 CRUD 方法
  - [ ] 批量查询优化
  - [ ] 单元测试（使用内存仓储验证逻辑）
- [ ] 实现 `PrismaWordMasteryRepository`
  - [ ] 状态和评分查询
  - [ ] 批量更新支持
  - [ ] 单元测试
- [ ] 实现缓存装饰器
  - [ ] `CachedWordReviewTraceRepository`
  - [ ] `CachedWordMasteryRepository`
  - [ ] 缓存失效策略测试

**验收标准：**

- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 集成测试通过（连接真实数据库）
- [ ] 性能测试：查询延迟 ≤ 当前实现的 110%

### 阶段 2：业务层迁移（第一批）（3-4 天）

**目标：** 迁移核心追踪和评估逻辑

**任务清单：**

- [ ] 迁移 `word-memory-tracker.ts`

  ```typescript
  // 重构前
  class WordMemoryTracker {
    async recordReview(...) {
      await prisma.wordReviewTrace.create(...);
    }
  }

  // 重构后
  class WordMemoryTracker {
    constructor(private readonly repo: IWordReviewTraceRepository) {}

    async recordReview(...) {
      await this.repo.recordReview(...);
    }
  }
  ```

- [ ] 迁移 `word-mastery-evaluator.ts`
  - 注入 `IWordMasteryRepository`
  - 移除直接 Prisma 调用
  - 更新测试文件
- [ ] 更新依赖注入配置
  - 在服务层注入仓储实例
  - 确保向后兼容

**验收标准：**

- [ ] 原有单元测试全部通过（使用内存仓储）
- [ ] 集成测试通过
- [ ] 无性能回归（基准测试对比）

### 阶段 3：统计与建议仓储实现（2-3 天）

**目标：** 实现统计分析相关仓储

**任务清单：**

- [ ] 实现 `PrismaGlobalStatsRepository`
  - [ ] 复杂查询封装（原 Raw SQL）
  - [ ] 缓存支持
- [ ] 实现 `PrismaLLMSuggestionRepository`
  - [ ] 建议存储和查询
  - [ ] 状态更新
- [ ] 实现 `PrismaUserBehaviorStatsRepository`
  - [ ] 用户统计查询
  - [ ] 性能优化（批量查询）

**验收标准：**

- [ ] 单元测试覆盖率 ≥ 80%
- [ ] Raw SQL 查询全部封装
- [ ] 查询性能不劣于原实现

### 阶段 4：业务层迁移（第二批）（2-3 天）

**目标：** 迁移统计和建议相关逻辑

**任务清单：**

- [ ] 迁移 `global-stats.ts`
  - 注入 `IGlobalStatsRepository`
  - 移除 Raw SQL 查询
- [ ] 迁移 `llm-weekly-advisor.ts`
  - 注入 `ILLMSuggestionRepository`
  - 注入 `IUserBehaviorStatsRepository`
  - 更新测试
- [ ] 迁移 `stats-collector.ts`
  - 注入 `IUserBehaviorStatsRepository`
- [ ] 迁移 `cognitive.ts` 中的 Prisma 调用
  - 注入 `IUserBehaviorStatsRepository`

**验收标准：**

- [ ] 所有直接 Prisma 调用已移除
- [ ] 测试全部通过
- [ ] 代码审查通过

### 阶段 5：剩余仓储与优化（2 天）

**目标：** 完成剩余仓储并进行整体优化

**任务清单：**

- [ ] 实现 `PrismaUserRewardRepository`
  - [ ] 奖励配置管理
  - [ ] 缓存支持
- [ ] 迁移 `engine.ts` 中的 Prisma 调用
  - 注入 `IUserRewardRepository`
- [ ] 性能优化
  - [ ] 识别并优化慢查询
  - [ ] 添加查询日志装饰器
  - [ ] 批量查询优化
- [ ] 添加监控指标
  - [ ] 仓储查询延迟
  - [ ] 缓存命中率
  - [ ] 错误率

**验收标准：**

- [ ] 所有 Prisma 直接调用已移除
- [ ] 性能基准测试通过
- [ ] 监控指标正常采集

### 阶段 6：测试与部署（2-3 天）

**目标：** 全面测试并灰度部署

**任务清单：**

- [ ] 集成测试套件
  - [ ] 端到端测试覆盖核心流程
  - [ ] 数据一致性验证
- [ ] 性能测试
  - [ ] 压力测试（并发 1000 用户）
  - [ ] 查询延迟对比
  - [ ] 内存使用分析
- [ ] 灰度发布
  - [ ] 1% 流量灰度（监控 24h）
  - [ ] 10% 流量（监控 48h）
  - [ ] 50% 流量（监控 24h）
  - [ ] 100% 流量
- [ ] 文档更新
  - [ ] 仓储使用指南
  - [ ] 新增仓储开发规范
  - [ ] API 文档更新

**验收标准：**

- [ ] 测试覆盖率 ≥ 80%
- [ ] 灰度期间无严重问题
- [ ] 性能指标达标
- [ ] 文档完整

### 阶段里程碑与决策点

| 阶段   | 完成标志                 | Go/No-Go 决策                  |
| ------ | ------------------------ | ------------------------------ |
| 阶段 0 | 所有接口和 Mock 实现完成 | ✓ 设计评审通过                 |
| 阶段 1 | 核心仓储实现并测试通过   | ✓ 性能无回归                   |
| 阶段 2 | 核心业务逻辑迁移完成     | ✓ 所有测试通过<br>✓ 无功能回归 |
| 阶段 3 | 统计仓储实现完成         | ✓ Raw SQL 全部封装             |
| 阶段 4 | 统计逻辑迁移完成         | ✓ Prisma 调用清零              |
| 阶段 5 | 性能优化完成             | ✓ 性能指标达标                 |
| 阶段 6 | 灰度发布完成             | ✓ 生产环境稳定                 |

---

## 5. 重构前后代码对比

### 5.1 示例 1：单词复习追踪

#### 重构前（❌ 直接依赖 Prisma）

```typescript
// src/amas/tracking/word-memory-tracker.ts
import prisma from '../../config/database';

export class WordMemoryTracker {
  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    await prisma.wordReviewTrace.create({
      data: {
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime,
      },
    });
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const now = Date.now();
    const records = await prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { timestamp: true, isCorrect: true },
    });

    return records.map((record) => ({
      secondsAgo: Math.floor((now - record.timestamp.getTime()) / 1000),
      isCorrect: record.isCorrect,
    }));
  }
}

// 测试文件（需要复杂的 Prisma Mock）
describe('WordMemoryTracker', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      wordReviewTrace: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    vi.mock('../../config/database', () => ({ default: mockPrisma }));
  });

  it('should record review', async () => {
    mockPrisma.wordReviewTrace.create.mockResolvedValue({});
    const tracker = new WordMemoryTracker();
    await tracker.recordReview('user1', 'word1', {
      /* ... */
    });
    expect(mockPrisma.wordReviewTrace.create).toHaveBeenCalled();
  });
});
```

**问题：**

1. 业务逻辑与数据访问耦合
2. 测试需要 Mock Prisma 客户端（复杂且脆弱）
3. 无法轻松切换数据源
4. 缓存策略难以统一实施

#### 重构后（✅ 依赖仓储接口）

```typescript
// src/amas/repositories/interfaces/word-review-trace.repository.ts
export interface IWordReviewTraceRepository {
  recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void>;
  getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]>;
  // ... 其他方法
}

// src/amas/repositories/implementations/prisma-word-review-trace.repository.ts
export class PrismaWordReviewTraceRepository implements IWordReviewTraceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    await this.prisma.wordReviewTrace.create({
      data: {
        userId,
        wordId,
        timestamp: new Date(event.timestamp),
        isCorrect: event.isCorrect,
        responseTime: event.responseTime,
      },
    });
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const now = Date.now();
    const records = await this.prisma.wordReviewTrace.findMany({
      where: { userId, wordId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { timestamp: true, isCorrect: true },
    });

    return records.map((record) => ({
      secondsAgo: Math.floor((now - record.timestamp.getTime()) / 1000),
      isCorrect: record.isCorrect,
    }));
  }
}

// src/amas/tracking/word-memory-tracker.ts
export class WordMemoryTracker {
  constructor(private readonly repository: IWordReviewTraceRepository) {}

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    // 可以在这里添加业务逻辑验证
    if (event.responseTime < 0) {
      throw new Error('Invalid response time');
    }

    await this.repository.recordReview(userId, wordId, event);
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    return this.repository.getReviewTrace(userId, wordId, limit);
  }
}

// 测试文件（使用内存仓储，简洁且快速）
describe('WordMemoryTracker', () => {
  let repository: IWordReviewTraceRepository;
  let tracker: WordMemoryTracker;

  beforeEach(() => {
    repository = new InMemoryWordReviewTraceRepository();
    tracker = new WordMemoryTracker(repository);
  });

  it('should record review', async () => {
    const event: ReviewEvent = {
      timestamp: Date.now(),
      isCorrect: true,
      responseTime: 1000,
    };

    await tracker.recordReview('user1', 'word1', event);

    const trace = await repository.getReviewTrace('user1', 'word1');
    expect(trace).toHaveLength(1);
    expect(trace[0].isCorrect).toBe(true);
  });

  it('should reject invalid response time', async () => {
    const event: ReviewEvent = {
      timestamp: Date.now(),
      isCorrect: true,
      responseTime: -100, // 无效
    };

    await expect(tracker.recordReview('user1', 'word1', event)).rejects.toThrow(
      'Invalid response time',
    );
  });
});
```

**改进：**

1. ✅ 业务逻辑与数据访问分离
2. ✅ 测试简洁且快速（内存仓储）
3. ✅ 易于扩展（缓存、日志等装饰器）
4. ✅ 符合 SOLID 原则

### 5.2 示例 2：全局统计

#### 重构前（❌ Raw SQL 分散）

```typescript
// src/amas/cold-start/global-stats.ts
import prisma from '../../config/database';

export class GlobalStatsService {
  async computeGlobalStats(): Promise<GlobalUserStats> {
    // Raw SQL 直接嵌入业务逻辑
    const stats = await prisma.$queryRaw<
      Array<{
        avgaccuracy: number;
        avgresponsetime: number;
        avgdwelltime: number;
        samplesize: bigint;
      }>
    >`
      WITH user_initial_interactions AS (
        SELECT
          "userId",
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY timestamp) as seq_num,
          "isCorrect",
          "responseTime",
          "dwellTime"
        FROM "answer_records"
      )
      SELECT
        AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) as avgAccuracy,
        AVG("responseTime") as avgResponseTime,
        AVG("dwellTime") as avgDwellTime,
        COUNT(*) as sampleSize
      FROM user_initial_interactions
      WHERE seq_num <= ${this.initialPhaseLimit}
    `;

    const result =
      stats[0] ||
      {
        /* defaults */
      };
    // ... 处理逻辑
  }
}
```

**问题：**

1. SQL 逻辑无法复用
2. 难以测试（需要真实数据库）
3. 类型安全性弱（手动类型断言）
4. 数据库切换困难

#### 重构后（✅ 仓储封装）

```typescript
// src/amas/repositories/interfaces/global-stats.repository.ts
export interface IGlobalStatsRepository {
  computeInitialPhaseStats(initialPhaseLimit: number): Promise<InitialPhaseStats>;
}

export interface InitialPhaseStats {
  avgAccuracy: number;
  avgResponseTime: number;
  avgDwellTime: number;
  sampleSize: number;
}

// src/amas/repositories/implementations/prisma-global-stats.repository.ts
export class PrismaGlobalStatsRepository implements IGlobalStatsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async computeInitialPhaseStats(initialPhaseLimit: number): Promise<InitialPhaseStats> {
    const stats = await this.prisma.$queryRaw<
      Array<{
        avgaccuracy: number;
        avgresponsetime: number;
        avgdwelltime: number;
        samplesize: bigint;
      }>
    >`
      WITH user_initial_interactions AS (
        SELECT
          "userId",
          ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY timestamp) as seq_num,
          "isCorrect",
          "responseTime",
          "dwellTime"
        FROM "answer_records"
      )
      SELECT
        AVG(CASE WHEN "isCorrect" THEN 1.0 ELSE 0.0 END) as avgAccuracy,
        AVG("responseTime") as avgResponseTime,
        AVG("dwellTime") as avgDwellTime,
        COUNT(*) as sampleSize
      FROM user_initial_interactions
      WHERE seq_num <= ${initialPhaseLimit}
    `;

    const result = stats[0];
    if (!result) {
      return {
        avgAccuracy: 0.6,
        avgResponseTime: 5000,
        avgDwellTime: 3000,
        sampleSize: 0,
      };
    }

    return {
      avgAccuracy: Number(result.avgaccuracy),
      avgResponseTime: Number(result.avgresponsetime),
      avgDwellTime: Number(result.avgdwelltime),
      sampleSize: Number(result.samplesize),
    };
  }
}

// src/amas/repositories/implementations/inmemory-global-stats.repository.ts
export class InMemoryGlobalStatsRepository implements IGlobalStatsRepository {
  private answerRecords: Array<{
    userId: string;
    timestamp: Date;
    isCorrect: boolean;
    responseTime: number;
    dwellTime: number;
  }> = [];

  async computeInitialPhaseStats(initialPhaseLimit: number): Promise<InitialPhaseStats> {
    // 按用户分组
    const userRecords = new Map<string, typeof this.answerRecords>();
    for (const record of this.answerRecords) {
      const existing = userRecords.get(record.userId) ?? [];
      existing.push(record);
      userRecords.set(record.userId, existing);
    }

    // 计算每个用户的前 N 条记录
    const initialRecords: typeof this.answerRecords = [];
    for (const records of userRecords.values()) {
      const sorted = records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      initialRecords.push(...sorted.slice(0, initialPhaseLimit));
    }

    if (initialRecords.length === 0) {
      return {
        avgAccuracy: 0.6,
        avgResponseTime: 5000,
        avgDwellTime: 3000,
        sampleSize: 0,
      };
    }

    // 计算统计
    const correctCount = initialRecords.filter((r) => r.isCorrect).length;
    const avgResponseTime =
      initialRecords.reduce((sum, r) => sum + r.responseTime, 0) / initialRecords.length;
    const avgDwellTime =
      initialRecords.reduce((sum, r) => sum + r.dwellTime, 0) / initialRecords.length;

    return {
      avgAccuracy: correctCount / initialRecords.length,
      avgResponseTime,
      avgDwellTime,
      sampleSize: initialRecords.length,
    };
  }

  // 测试辅助方法
  addAnswerRecord(record: {
    userId: string;
    timestamp: Date;
    isCorrect: boolean;
    responseTime: number;
    dwellTime: number;
  }): void {
    this.answerRecords.push(record);
  }

  clear(): void {
    this.answerRecords = [];
  }
}

// src/amas/cold-start/global-stats.ts
export class GlobalStatsService {
  constructor(
    private readonly repository: IGlobalStatsRepository,
    private readonly initialPhaseLimit: number = 10,
  ) {}

  async computeGlobalStats(): Promise<GlobalUserStats> {
    // 缓存检查
    if (this.cachedStats && Date.now() - this.cacheTimestamp < this.cacheLifetime) {
      return this.cachedStats;
    }

    // 查询统计数据
    const stats = await this.repository.computeInitialPhaseStats(this.initialPhaseLimit);

    // 推导其他数据
    const globalStats: GlobalUserStats = {
      initialAccuracy: stats.avgAccuracy,
      initialResponseTime: stats.avgResponseTime,
      initialDwellTime: stats.avgDwellTime,
      recommendedStartStrategy: this.deriveStartStrategy(stats.avgAccuracy),
      sampleSize: stats.sampleSize,
      userTypePriors: this.deriveUserTypePriors(stats.avgAccuracy, stats.avgResponseTime),
    };

    // 更新缓存
    this.cachedStats = globalStats;
    this.cacheTimestamp = Date.now();

    return globalStats;
  }

  private deriveStartStrategy(globalAccuracy: number): StrategyParams {
    // ... 业务逻辑（不变）
  }

  private deriveUserTypePriors(
    globalAccuracy: number,
    globalResponseTime: number,
  ): Record<UserTypeGlobal, number> {
    // ... 业务逻辑（不变）
  }
}

// 测试文件（使用内存仓储）
describe('GlobalStatsService', () => {
  let repository: InMemoryGlobalStatsRepository;
  let service: GlobalStatsService;

  beforeEach(() => {
    repository = new InMemoryGlobalStatsRepository();
    service = new GlobalStatsService(repository, 10);
  });

  it('should compute global stats from answer records', async () => {
    // 准备测试数据
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 15; j++) {
        repository.addAnswerRecord({
          userId: `user${i}`,
          timestamp: new Date(now.getTime() + j * 1000),
          isCorrect: j % 2 === 0, // 50% 准确率
          responseTime: 3000 + Math.random() * 2000,
          dwellTime: 2000 + Math.random() * 1000,
        });
      }
    }

    const stats = await service.computeGlobalStats();

    expect(stats.initialAccuracy).toBeCloseTo(0.5, 1);
    expect(stats.initialResponseTime).toBeGreaterThan(3000);
    expect(stats.sampleSize).toBe(30); // 3个用户 * 前10条记录
  });

  it('should cache stats for configured lifetime', async () => {
    const stats1 = await service.computeGlobalStats();
    const stats2 = await service.computeGlobalStats();

    expect(stats1).toBe(stats2); // 同一个对象实例（从缓存返回）
  });
});
```

**改进：**

1. ✅ SQL 逻辑封装在仓储层
2. ✅ 业务逻辑清晰（只关注推导算法）
3. ✅ 测试简单（内存仓储模拟数据）
4. ✅ 易于扩展（如添加更多统计维度）

### 5.3 示例 3：添加缓存装饰器（新能力）

#### 重构后可轻松添加装饰器

```typescript
// src/amas/repositories/decorators/cached-word-review-trace.repository.ts
export class CachedWordReviewTraceRepository implements IWordReviewTraceRepository {
  constructor(
    private readonly inner: IWordReviewTraceRepository,
    private readonly cache: ICacheService,
    private readonly ttl: number = 60,
  ) {}

  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    // 写入数据
    await this.inner.recordReview(userId, wordId, event);

    // 失效缓存
    await this.invalidateCache(userId, wordId);
  }

  async getReviewTrace(userId: string, wordId: string, limit: number = 50): Promise<ReviewTrace[]> {
    const cacheKey = `trace:${userId}:${wordId}:${limit}`;

    // 尝试从缓存获取
    const cached = await this.cache.get<ReviewTrace[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，查询数据
    const trace = await this.inner.getReviewTrace(userId, wordId, limit);

    // 写入缓存
    await this.cache.set(cacheKey, trace, this.ttl);

    return trace;
  }

  private async invalidateCache(userId: string, wordId: string): Promise<void> {
    const pattern = `trace:${userId}:${wordId}:*`;
    await this.cache.deletePattern(pattern);
  }

  // ... 其他方法
}

// 使用：在工厂中组合
const factory = RepositoryFactory.getInstance();
const base = new PrismaWordReviewTraceRepository(prisma);
const cached = new CachedWordReviewTraceRepository(base, cacheService);

// 或者：通过工厂方法
const repository = factory.createWordReviewTraceRepository(); // 自动带缓存
```

**优势：**

- 🎯 缓存逻辑独立，易于测试
- 🎯 可以灵活启用/禁用缓存
- 🎯 支持多层装饰器组合（日志 + 缓存 + 监控）

---

## 6. 监控与运维指南

### 6.1 关键监控指标

#### 6.1.1 仓储性能指标

```typescript
// src/amas/repositories/decorators/metrics-repository.decorator.ts
export class MetricsWordReviewTraceRepository implements IWordReviewTraceRepository {
  constructor(
    private readonly inner: IWordReviewTraceRepository,
    private readonly metrics: IMetricsService,
  ) {}

  async getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]> {
    const startTime = Date.now();
    const method = 'getReviewTrace';

    try {
      const result = await this.inner.getReviewTrace(userId, wordId, limit);
      const duration = Date.now() - startTime;

      // 记录成功指标
      this.metrics.histogram('repository_query_duration_ms', duration, {
        repository: 'WordReviewTrace',
        method,
        status: 'success',
      });

      this.metrics.counter('repository_query_total', 1, {
        repository: 'WordReviewTrace',
        method,
        status: 'success',
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // 记录失败指标
      this.metrics.histogram('repository_query_duration_ms', duration, {
        repository: 'WordReviewTrace',
        method,
        status: 'error',
      });

      this.metrics.counter('repository_query_total', 1, {
        repository: 'WordReviewTrace',
        method,
        status: 'error',
      });

      throw error;
    }
  }

  // ... 其他方法类似
}
```

#### 6.1.2 监控仪表板

**Prometheus 查询示例：**

```promql
# 平均查询延迟
avg(repository_query_duration_ms) by (repository, method)

# 查询错误率
sum(rate(repository_query_total{status="error"}[5m])) by (repository, method)
/
sum(rate(repository_query_total[5m])) by (repository, method)

# P95 查询延迟
histogram_quantile(0.95, sum(rate(repository_query_duration_ms_bucket[5m])) by (le, repository))

# 缓存命中率
sum(rate(repository_cache_hit_total[5m]))
/
sum(rate(repository_cache_query_total[5m]))
```

**Grafana 仪表板布局：**

| 面板       | 指标        | 告警阈值    |
| ---------- | ----------- | ----------- |
| 查询延迟   | P50/P95/P99 | P99 > 500ms |
| 错误率     | 错误数/总数 | > 1%        |
| 缓存命中率 | 命中数/总数 | < 70%       |
| 查询 QPS   | 每秒查询数  | -           |

### 6.2 告警规则

```yaml
# prometheus-alerts.yml
groups:
  - name: amas_repository
    interval: 30s
    rules:
      - alert: HighRepositoryQueryLatency
        expr: histogram_quantile(0.99, sum(rate(repository_query_duration_ms_bucket[5m])) by (le, repository)) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: '仓储查询延迟过高'
          description: '{{ $labels.repository }} 的 P99 查询延迟超过 500ms'

      - alert: HighRepositoryErrorRate
        expr: |
          sum(rate(repository_query_total{status="error"}[5m])) by (repository)
          /
          sum(rate(repository_query_total[5m])) by (repository)
          > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: '仓储查询错误率过高'
          description: '{{ $labels.repository }} 的错误率超过 1%'

      - alert: LowCacheHitRate
        expr: |
          sum(rate(repository_cache_hit_total[5m]))
          /
          sum(rate(repository_cache_query_total[5m]))
          < 0.7
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: '仓储缓存命中率过低'
          description: '缓存命中率低于 70%，可能需要调整缓存策略'
```

### 6.3 故障排查指南

#### 问题 1：查询延迟突然增加

**可能原因：**

1. 数据库连接池耗尽
2. 缓存失效导致大量数据库查询
3. 数据量增长导致查询变慢
4. 数据库锁等待

**排查步骤：**

1. 检查数据库连接池状态

   ```typescript
   const poolStats = await prisma.$pool.stats();
   console.log('Active connections:', poolStats.active);
   console.log('Idle connections:', poolStats.idle);
   ```

2. 检查缓存命中率

   ```typescript
   const cacheStats = await cacheService.getStats();
   console.log('Hit rate:', cacheStats.hitRate);
   ```

3. 检查慢查询日志

   ```sql
   SELECT * FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

4. 添加查询日志装饰器（临时调试）
   ```typescript
   const logged = new LoggingWordReviewTraceRepository(base, logger);
   ```

#### 问题 2：缓存一致性问题

**可能原因：**

1. 缓存失效策略不完善
2. 并发更新导致竞态条件
3. 缓存与数据库数据不一致

**排查步骤：**

1. 检查缓存失效逻辑

   ```typescript
   // 确保所有写操作都失效了相关缓存
   async recordReview(...) {
     await this.inner.recordReview(...);
     await this.invalidateWordCache(userId, wordId); // ✓
     await this.invalidateUserStatsCache(userId);   // ✓
   }
   ```

2. 使用版本号机制

   ```typescript
   interface VersionedData<T> {
     data: T;
     version: number;
   }

   // 只有当新版本更大时才更新缓存
   ```

3. 添加数据一致性验证
   ```typescript
   async validateConsistency(userId: string, wordId: string): Promise<boolean> {
     const cached = await this.cache.get<ReviewTrace[]>(`trace:${userId}:${wordId}`);
     const fresh = await this.inner.getReviewTrace(userId, wordId);
     return JSON.stringify(cached) === JSON.stringify(fresh);
   }
   ```

#### 问题 3：内存泄漏

**可能原因：**

1. 缓存数据未正确清理
2. 仓储实例未正确销毁
3. 事件监听器未移除

**排查步骤：**

1. 使用 Node.js 堆快照分析

   ```bash
   node --inspect dist/index.js
   # 在 Chrome DevTools 中分析堆快照
   ```

2. 检查缓存大小

   ```typescript
   const cacheStats = await cacheService.getStats();
   console.log('Cache size:', cacheStats.size);
   console.log('Memory usage:', cacheStats.memoryUsage);
   ```

3. 添加缓存清理定时任务
   ```typescript
   setInterval(async () => {
     await cacheService.cleanup();
   }, 3600_000); // 每小时清理一次
   ```

---

## 7. 最佳实践与反模式

### 7.1 最佳实践

#### ✅ 实践 1：接口优先设计

```typescript
// ✓ 先定义接口，明确契约
export interface IWordReviewTraceRepository {
  recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void>;
  getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]>;
}

// ✓ 然后实现多个版本
class PrismaWordReviewTraceRepository implements IWordReviewTraceRepository {
  /* ... */
}
class InMemoryWordReviewTraceRepository implements IWordReviewTraceRepository {
  /* ... */
}
class MongoWordReviewTraceRepository implements IWordReviewTraceRepository {
  /* ... */
}
```

#### ✅ 实践 2：使用依赖注入

```typescript
// ✓ 通过构造函数注入依赖
class WordMemoryTracker {
  constructor(private readonly repository: IWordReviewTraceRepository) {}
}

// ✓ 在工厂或容器中配置
const repository = repositoryFactory.createWordReviewTraceRepository();
const tracker = new WordMemoryTracker(repository);
```

#### ✅ 实践 3：装饰器模式组合能力

```typescript
// ✓ 通过装饰器组合多个关注点
const base = new PrismaWordReviewTraceRepository(prisma);
const logged = new LoggingWordReviewTraceRepository(base, logger);
const cached = new CachedWordReviewTraceRepository(logged, cache);
const monitored = new MetricsWordReviewTraceRepository(cached, metrics);

// 最终实例具备：数据访问 + 日志 + 缓存 + 监控
```

#### ✅ 实践 4：仓储只返回领域对象

```typescript
// ✓ 仓储返回领域模型，而非数据库模型
interface IWordReviewTraceRepository {
  getReviewTrace(userId: string, wordId: string): Promise<ReviewTrace[]>;
  //                                                       ^^^^^^^^^^^^
  //                                                       领域对象
}

// ✗ 避免返回 Prisma 模型
interface IBadRepository {
  getReviewTrace(userId: string, wordId: string): Promise<PrismaWordReviewTrace[]>;
  //                                                       ^^^^^^^^^^^^^^^^^^^^^^
  //                                                       数据库模型泄漏
}
```

#### ✅ 实践 5：批量操作优化

```typescript
// ✓ 提供批量查询接口
interface IWordReviewTraceRepository {
  // 单个查询
  getReviewTrace(userId: string, wordId: string): Promise<ReviewTrace[]>;

  // 批量查询（避免 N+1 问题）
  batchGetMemoryState(userId: string, wordIds: string[]): Promise<Map<string, WordMemoryState>>;
}

// ✓ 实现时使用 IN 查询
async batchGetMemoryState(userId: string, wordIds: string[]): Promise<Map<string, WordMemoryState>> {
  const records = await this.prisma.wordReviewTrace.findMany({
    where: {
      userId,
      wordId: { in: wordIds } // 一次查询所有
    }
  });
  // ... 分组处理
}
```

### 7.2 反模式

#### ❌ 反模式 1：仓储中包含业务逻辑

```typescript
// ❌ 不要在仓储中实现业务规则
class BadWordReviewTraceRepository implements IWordReviewTraceRepository {
  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    // ❌ 业务逻辑不应该在仓储中
    if (event.responseTime < 500) {
      // 如果响应时间太快，标记为可疑
      event.isCorrect = false;
    }

    await this.prisma.wordReviewTrace.create({
      /* ... */
    });
  }
}

// ✓ 业务逻辑应该在服务层
class WordMemoryTracker {
  async recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void> {
    // ✓ 业务规则在服务层
    if (event.responseTime < 500) {
      throw new Error('Response time too fast, possible cheating');
    }

    // 仓储只负责持久化
    await this.repository.recordReview(userId, wordId, event);
  }
}
```

#### ❌ 反模式 2：仓储接口过于宽泛

```typescript
// ❌ 通用仓储反模式
interface IBadRepository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: T): Promise<T>;
  update(id: string, entity: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// 问题：
// 1. 不符合业务语义（如 "记录复习" vs "创建实体"）
// 2. 缺少特定领域的查询方法
// 3. 难以优化和扩展

// ✓ 领域特定的仓储接口
interface IWordReviewTraceRepository {
  // ✓ 使用业务语言
  recordReview(userId: string, wordId: string, event: ReviewEvent): Promise<void>;
  getReviewTrace(userId: string, wordId: string, limit?: number): Promise<ReviewTrace[]>;
  getUserReviewStats(userId: string): Promise<ReviewStats>;

  // ✓ 领域特定的方法
  trimWordRecords(userId: string, wordId: string, maxRecords?: number): Promise<number>;
}
```

#### ❌ 反模式 3：仓储间直接依赖

```typescript
// ❌ 仓储之间不应该直接依赖
class BadWordMasteryRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reviewTraceRepo: IWordReviewTraceRepository, // ❌
  ) {}

  async getWordMastery(userId: string, wordId: string): Promise<MasteryEvaluation> {
    const state = await this.prisma.wordLearningState.findUnique({
      /* ... */
    });
    const trace = await this.reviewTraceRepo.getReviewTrace(userId, wordId); // ❌
    // ... 合并数据
  }
}

// ✓ 仓储应该独立，由服务层协调
class WordMasteryEvaluator {
  constructor(
    private readonly masteryRepo: IWordMasteryRepository,
    private readonly traceRepo: IWordReviewTraceRepository,
  ) {}

  async evaluate(userId: string, wordId: string): Promise<MasteryEvaluation> {
    // ✓ 服务层协调多个仓储
    const [state, trace] = await Promise.all([
      this.masteryRepo.getWordState(userId, wordId),
      this.traceRepo.getReviewTrace(userId, wordId),
    ]);
    // ... 业务逻辑
  }
}
```

#### ❌ 反模式 4：在仓储中处理缓存

```typescript
// ❌ 缓存逻辑不应该直接嵌入基础仓储
class BadPrismaWordReviewTraceRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: ICacheService, // ❌
  ) {}

  async getReviewTrace(userId: string, wordId: string): Promise<ReviewTrace[]> {
    // ❌ 缓存逻辑混在基础实现中
    const cacheKey = `trace:${userId}:${wordId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const records = await this.prisma.wordReviewTrace.findMany({
      /* ... */
    });
    await this.cache.set(cacheKey, records);
    return records;
  }
}

// ✓ 使用装饰器模式分离关注点
class PrismaWordReviewTraceRepository {
  constructor(private readonly prisma: PrismaClient) {} // ✓ 只依赖 Prisma

  async getReviewTrace(userId: string, wordId: string): Promise<ReviewTrace[]> {
    // ✓ 只关注数据访问
    return this.prisma.wordReviewTrace.findMany({
      /* ... */
    });
  }
}

class CachedWordReviewTraceRepository {
  constructor(
    private readonly inner: IWordReviewTraceRepository,
    private readonly cache: ICacheService,
  ) {}

  async getReviewTrace(userId: string, wordId: string): Promise<ReviewTrace[]> {
    const cacheKey = `trace:${userId}:${wordId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.inner.getReviewTrace(userId, wordId);
    await this.cache.set(cacheKey, result);
    return result;
  }
}
```

---

## 8. 总结与建议

### 8.1 核心价值

通过实施仓储模式重构，AMAS 引擎将获得：

1. **可测试性提升 90%**：
   - 测试运行时间从 ~3秒 降至 ~0.3秒
   - Mock 代码减少 80%
   - 测试覆盖率提升潜力 +25%

2. **可维护性显著增强**：
   - 数据访问逻辑集中管理
   - 修改影响范围明确
   - 代码复用率提高

3. **可扩展性大幅改善**：
   - 支持多数据源（Prisma、MongoDB、Redis）
   - 易于添加新能力（缓存、日志、监控）
   - 装饰器模式灵活组合

4. **性能优化空间**：
   - 批量查询优化
   - 缓存命中率提升至 70%
   - 读写分离支持

### 8.2 实施建议

#### 立即执行（P0）

1. **启动阶段 0-1**（1周内）
   - 完成接口设计评审
   - 实现内存 Mock 仓储
   - 实施核心仓储（WordReviewTrace、WordMastery）

#### 近期执行（P1）

2. **完成阶段 2-3**（2-3周）
   - 迁移核心业务逻辑
   - 实施统计仓储
   - 移除所有直接 Prisma 调用

#### 持续优化（P2）

3. **阶段 4-6**（长期）
   - 性能优化和监控
   - 灰度发布和验证
   - 文档完善和团队培训

### 8.3 风险控制

#### 关键成功因素

- ✅ 充分的测试覆盖（≥ 80%）
- ✅ 灰度发布策略
- ✅ 实时监控和告警
- ✅ 快速回滚机制

#### 退出策略

如果重构遇到严重问题：

1. **阶段 1 失败**：回滚接口设计，保留当前实现
2. **阶段 2-3 失败**：保留已迁移部分，暂停新迁移
3. **阶段 4-6 失败**：保持双模式运行（新旧共存）

### 8.4 长期愿景

完成重构后，AMAS 引擎将具备：

```typescript
// 未来的可扩展架构
const base = new PrismaWordReviewTraceRepository(prisma);
const cached = new CachedWordReviewTraceRepository(base, redisCache);
const monitored = new MetricsWordReviewTraceRepository(cached, prometheus);
const logged = new LoggingWordReviewTraceRepository(monitored, logger);
const rateLimited = new RateLimitedWordReviewTraceRepository(logged, rateLimiter);

// 装饰器链：数据访问 → 缓存 → 监控 → 日志 → 限流
```

**能力清单：**

- ✅ 单元测试运行时间 < 1秒
- ✅ 支持 3+ 数据源（Prisma、MongoDB、Redis）
- ✅ 缓存命中率 ≥ 70%
- ✅ 查询延迟 P99 < 500ms
- ✅ 零停机切换数据源
- ✅ 实时性能监控和告警
- ✅ 完善的故障排查工具

---

## 附录

### A. 快速参考

#### A.1 仓储接口清单

| 接口                           | 职责                | 优先级 | 实现状态  |
| ------------------------------ | ------------------- | ------ | --------- |
| `IWordReviewTraceRepository`   | 复习轨迹管理        | P0     | ⏳ 待实现 |
| `IWordMasteryRepository`       | 单词掌握度数据      | P0     | ⏳ 待实现 |
| `IGlobalStatsRepository`       | 全局统计            | P1     | ⏳ 待实现 |
| `ILLMSuggestionRepository`     | LLM 建议管理        | P1     | ⏳ 待实现 |
| `IUserBehaviorStatsRepository` | 用户行为统计        | P1     | ⏳ 待实现 |
| `IUserRewardRepository`        | 奖励配置管理        | P2     | ⏳ 待实现 |
| `StateRepository`              | 用户状态（已有）    | -      | ✅ 已完成 |
| `ModelRepository`              | LinUCB 模型（已有） | -      | ✅ 已完成 |

#### A.2 重构检查清单

**阶段 0：准备**

- [ ] 接口设计评审通过
- [ ] 内存仓储实现完成
- [ ] 工厂模式配置完成

**阶段 1：核心仓储**

- [ ] `PrismaWordReviewTraceRepository` 实现
- [ ] `PrismaWordMasteryRepository` 实现
- [ ] 缓存装饰器实现
- [ ] 单元测试覆盖率 ≥ 80%

**阶段 2：业务迁移（第一批）**

- [ ] `word-memory-tracker.ts` 迁移完成
- [ ] `word-mastery-evaluator.ts` 迁移完成
- [ ] 所有测试通过
- [ ] 无性能回归

**阶段 3：统计仓储**

- [ ] `PrismaGlobalStatsRepository` 实现
- [ ] `PrismaLLMSuggestionRepository` 实现
- [ ] `PrismaUserBehaviorStatsRepository` 实现
- [ ] Raw SQL 全部封装

**阶段 4：业务迁移（第二批）**

- [ ] `global-stats.ts` 迁移完成
- [ ] `llm-weekly-advisor.ts` 迁移完成
- [ ] `stats-collector.ts` 迁移完成
- [ ] `cognitive.ts` 迁移完成

**阶段 5：优化**

- [ ] `PrismaUserRewardRepository` 实现
- [ ] `engine.ts` Prisma 调用移除
- [ ] 所有 Prisma 直接调用清零
- [ ] 性能优化完成

**阶段 6：部署**

- [ ] 集成测试全部通过
- [ ] 性能测试达标
- [ ] 1% 灰度成功
- [ ] 10% 灰度成功
- [ ] 50% 灰度成功
- [ ] 100% 全量发布

#### A.3 命令速查

```bash
# 运行单元测试
npm test -- --grep "Repository"

# 运行集成测试
npm run test:integration

# 性能基准测试
npm run test:perf

# 生成测试覆盖率报告
npm run test:coverage

# 检查 Prisma 直接调用（应该为 0）
grep -r "prisma\." src/amas --exclude-dir=repositories

# 检查类型错误
npm run type-check
```

### B. 相关文档链接

- [仓储模式（Repository Pattern）](https://martinfowler.com/eaaCatalog/repository.html) - Martin Fowler
- [依赖注入（Dependency Injection）](https://en.wikipedia.org/wiki/Dependency_injection) - Wikipedia
- [装饰器模式（Decorator Pattern）](https://refactoring.guru/design-patterns/decorator) - Refactoring Guru
- [SOLID 原则](https://en.wikipedia.org/wiki/SOLID) - Wikipedia

---

**文档版本：** 1.0
**创建日期：** 2025-01-XX
**最后更新：** 2025-01-XX
**负责人：** AMAS 团队
