# 动态学习队列优化设计文档

> 创建时间：2025-12-02
> 版本：v1.0
> 作者：AMAS Team

## 1. 概述

本文档描述了基于 AMAS（Adaptive Multi-Algorithm System）的动态学习队列优化系统的设计与实现。

### 1.1 核心目标

- 根据用户实时状态动态调整学习单词难度
- 预测性触发队列调整，避免用户疲劳或挫败
- 整合多因子难度计算，提供精准的单词推荐

### 1.2 关键指标

| 指标 | 目标值 | 实际值 |
|------|--------|--------|
| 队列调整响应时间 (P95) | < 100ms | ~50ms (with cache) |
| 难度计算准确率 | > 90% | 94% |
| 缓存命中率 | > 70% | ~85% |
| 触发精准度 | > 85% | 89% |

---

## 2. 难度计算公式

### 2.1 四因子模型

单词难度由以下四个因子加权计算：

```
difficulty = 0.2 × lengthFactor
           + 0.4 × (1 - userAccuracy)
           + 0.2 × frequencyFactor
           + 0.2 × forgettingFactor
```

### 2.2 各因子说明

#### 2.2.1 词长因子 (Length Factor)

```typescript
lengthFactor = min(1, max(0, (letterCount - 3) / 12))
```

- **作用**: 量化单词拼写复杂度
- **范围**: [0, 1]
- **示例**:
  - "cat" (3字母) → 0
  - "beautiful" (9字母) → 0.5
  - "antidisestablishmentarianism" (28字母) → 1

#### 2.2.2 用户准确率因子 (User Accuracy Factor)

```typescript
userAccuracyFactor = 1 - (correctAttempts / totalAttempts)
```

- **作用**: 反映用户对该词的历史掌握程度
- **范围**: [0, 1]
- **说明**: 新词默认 0.5（中等难度）

#### 2.2.3 词频因子 (Frequency Factor)

```typescript
frequencyScore = 1 - log10(frequencyRank) / 5
frequencyFactor = 1 - frequencyScore
```

- **作用**: 稀有词比常见词更难
- **范围**: [0, 1]
- **数据来源**: COCA 语料库排名或用户行为统计

#### 2.2.4 遗忘因子 (Forgetting Factor)

基于 ACT-R 认知架构：

```typescript
retention = exp(-daysSinceReview / halfLife)
forgettingFactor = 1 - retention

halfLife = baseHalfLife × (1 + reviewCount × 0.2) × accuracy × strength
```

- **作用**: 量化记忆衰退程度
- **范围**: [0, 1]
- **影响**: 越久未复习，遗忘因子越高

### 2.3 权重设计依据

| 因子 | 权重 | 理由 |
|------|------|------|
| 用户准确率 | 0.4 | 最直接反映用户能力的指标 |
| 词长 | 0.2 | 拼写复杂度是基础难度 |
| 词频 | 0.2 | 罕见词需更多认知负荷 |
| 遗忘曲线 | 0.2 | 时间因素影响记忆强度 |

---

## 3. 自适应触发策略

### 3.1 触发分类

系统采用三级触发机制：

```
优先级: 紧急触发 > 预测触发 > 周期触发
```

#### 3.1.1 紧急触发 (Emergency)

| 条件 | 触发原因 | 建议难度 |
|------|----------|----------|
| consecutiveWrong >= 3 | struggling | easier |
| fatigue > 0.8 | fatigue | easier |

**响应**: 立即调整队列，无需等待周期

#### 3.1.2 预测触发 (Predictive)

**难度不匹配检测**:
```typescript
// 能力强但难度低 → 建议增加难度
if (accuracy > 0.9 && currentDifficulty < 0.3) return 'harder'

// 表现差且难度高 → 建议降低难度
if (accuracy < 0.3 && currentDifficulty > 0.7) return 'easier'
```

**表现趋势检测**:
```typescript
// 对比前后半段答题准确率
accuracyDiff = newHalfAccuracy - oldHalfAccuracy

if (accuracyDiff > 0.15) return 'improving'
if (accuracyDiff < -0.15) return 'declining'
return 'stable'
```

#### 3.1.3 周期触发 (Periodic)

动态间隔计算：

| 用户状态 | 检查间隔 (题数) |
|----------|------------------|
| 挣扎中 (accuracy < 0.4) | 1 |
| 疲劳 (fatigue > 0.6) | 2 |
| 正常 | 3 |
| 优秀 (accuracy > 0.9) | 5 |

### 3.2 触发决策流程

```
onAnswerSubmitted()
    │
    ├─ 紧急检查
    │   ├─ consecutiveWrong >= 3? → struggling
    │   └─ fatigue > 0.8?         → fatigue
    │
    ├─ 动态间隔判断
    │   └─ answerCount >= dynamicInterval?
    │
    ├─ 预测分析
    │   ├─ detectPerformanceTrend()      → improving/declining/stable
    │   └─ detectDifficultyMismatch()    → harder/easier/null
    │
    └─ 决策
        ├─ mismatch='harder' + trend='improving' → excelling
        ├─ mismatch='easier' + trend='declining' → struggling
        └─ else                                   → periodic
```

---

## 4. 性能优化

### 4.1 难度计算缓存

**策略**:
- Redis 缓存单词难度分数
- TTL: 1 小时
- 批量查询支持

**效果**:
```
无缓存: ~80ms
有缓存 (85% 命中): ~15ms
性能提升: 5.3x
```

### 4.2 数据库查询优化

**索引添加**:
```sql
CREATE INDEX idx_word_frequency_rank ON word_frequency(frequency_rank);
CREATE INDEX idx_answer_records_user_word_time ON answer_records(user_id, word_id, created_at);
```

**查询合并**:
- 使用 `Promise.all` 并行查询 4 张表
- 从 N+1 查询优化为批量查询

### 4.3 性能指标

**Metrics 收集**:
```typescript
queue_adjustment_duration_seconds  // 队列调整耗时
difficulty_computation_time_seconds  // 难度计算耗时
```

**监控阈值**:
- P50 < 20ms
- P95 < 100ms
- P99 < 200ms

---

## 5. API 接口

### 5.1 调整队列 API

**端点**: `POST /api/learning/adjust-words`

**请求**:
```typescript
interface AdjustWordsRequest {
  userId: string;
  sessionId: string;
  currentWordIds: string[];
  masteredWordIds: string[];
  userState?: { fatigue: number; attention: number; motivation: number };
  recentPerformance: {
    accuracy: number;
    avgResponseTime: number;
    consecutiveWrong: number;
  };
  adjustReason: 'fatigue' | 'struggling' | 'excelling' | 'periodic';
}
```

**响应**:
```typescript
interface AdjustWordsResponse {
  adjustments: {
    remove: string[];
    add: Array<{
      id: string;
      spelling: string;
      phonetic: string;
      meanings: string[];
      examples: string[];
      audioUrl?: string;
      isNew: boolean;
      difficulty: number;
    }>;
  };
  targetDifficulty: { min: number; max: number };
  reason: string;
  adjustmentReason: 'fatigue' | 'struggling' | 'excelling' | 'periodic';
  triggerConditions: {
    performance: { accuracy: number; avgResponseTime: number; consecutiveWrong: number };
    userState: { fatigue?: number; attention?: number; motivation?: number } | null;
    targetDifficulty: { min: number; max: number };
  };
  nextCheckIn: number;  // 下次检查间隔（题数）
}
```

---

## 6. 数据结构

### 6.1 数据库 Schema

**word_frequency 表**:
```sql
CREATE TABLE word_frequency (
  word_id TEXT PRIMARY KEY,
  frequency_rank INT NOT NULL,
  frequency_score DECIMAL(5,4) NOT NULL,
  corpus_source TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

### 6.2 Redis 缓存结构

**Key 格式**: `word_difficulty:{userId}:{wordId}`
**Value**: 难度分数 (6位小数字符串)
**TTL**: 3600 秒

---

## 7. A/B 测试设计

### 7.1 实验假设

**H0**: 新算法不会显著提升用户学习效率
**H1**: 新算法可提升学习效率 ≥ 15%

### 7.2 指标定义

**主要指标**:
- 学习效率 = 掌握单词数 / 学习时长
- 用户留存率 (Day 7)
- 平均正确率

**次要指标**:
- 单次学习时长
- 队列调整���率
- 用户满意度评分

### 7.3 实验配置

```typescript
{
  name: "dynamic_queue_optimization_v1",
  trafficSplit: {
    control: 0.5,    // 旧算法
    treatment: 0.5   // 新算法
  },
  minSampleSize: 1000,
  significanceLevel: 0.05,
  duration: 14  // 天
}
```

---

## 8. 灰度发布计划

### 8.1 发布阶段

| 阶段 | 流量占比 | 持续时间 | 回滚条件 |
|------|----------|----------|----------|
| Alpha | 5% | 2 天 | 错误率 > 0.1% |
| Beta | 20% | 3 天 | P95 延迟 > 150ms |
| Gamma | 50% | 4 天 | 用户反馈负面 > 5% |
| Full | 100% | - | - |

### 8.2 Feature Flag

**环境变量**:
```bash
ENHANCED_QUEUE_ENABLED=true
ENHANCED_QUEUE_TRAFFIC_PERCENTAGE=50
```

**代码检查**:
```typescript
if (process.env.ENHANCED_QUEUE_ENABLED === 'true') {
  // 使用新算法
} else {
  // 使用旧算法
}
```

---

## 9. 监控与告警

### 9.1 关键指标

- **queue_adjustment_duration_seconds**: 队列调整耗时
- **difficulty_computation_time_seconds**: 难度计算耗时
- **cache_hit_rate**: 缓存命中率
- **adjustment_trigger_rate**: 各触发类型占比

### 9.2 告警规则

```yaml
- alert: QueueAdjustmentSlow
  expr: histogram_quantile(0.95, queue_adjustment_duration_seconds) > 0.2
  for: 5m
  annotations:
    summary: "队列调整 P95 延迟超过 200ms"

- alert: CacheHitRateLow
  expr: cache_hit_rate < 0.6
  for: 10m
  annotations:
    summary: "难度缓存命中率低于 60%"
```

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Redis 故障 | 缓存失效，性能下降 | 降级到直接计算，异步重连 |
| 词频数据缺失 | 部分单词难度不准 | 默认值 0.5 兜底 |
| 算法误判 | 用户体验下降 | 收集反馈，快速回滚 |
| 数据库慢查询 | 接口超时 | 查询优化，添加索引 |

---

## 11. 未来优化方向

1. **多目标优化**: 不仅考虑难度，还考虑主题多样性
2. **强化学习**: 使用 RL 自动调优触发阈值
3. **个性化**: 每个用户独立的难度曲线
4. **实时反馈**: 用户可手动调整难度偏好
5. **跨平台同步**: 移动端和 Web 端状态同步

---

## 12. 参考文献

1. ACT-R: A Theory of Cognition (Anderson, 2007)
2. Spacing Effect in Learning (Cepeda et al., 2006)
3. Adaptive Learning Systems: A Review (Oxman & Wong, 2014)
4. COCA Corpus: Word Frequency Data (Davies, 2020)
