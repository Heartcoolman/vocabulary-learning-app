# 单词掌握度评估系统 - 设计说明文档

## 1. 概述

本文档描述了一个融合多种技术方案的单词掌握度评估系统，旨在让 AMAS 引擎能够智能判断用户是否真正学会了某个单词。

## 2. 现状分析

### 2.1 现有系统职责

| 系统 | 职责 | 局限性 |
|------|------|--------|
| **SRS（间隔重复系统）** | 追踪 masteryLevel、正确率、复习间隔 | 基于规则，无认知模型支撑 |
| **AMAS 引擎** | 感知用户状态（注意力/疲劳/认知/动机） | 不追踪单词级别数据 |
| **ACT-R 记忆模型** | 计算记忆激活度 | 仅作为 Ensemble 学习器，未充分利用 |

### 2.2 问题

1. **无法预测遗忘**：SRS 只知道"用户答对了几次"，不知道"用户现在还能不能想起来"
2. **数据孤岛**：SRS 和 AMAS 各自独立，没有融合判断
3. **缺乏置信度**：没有考虑用户当前状态对记忆提取的影响

## 3. 融合方案架构

### 3.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    服务层 (Service Layer)                    │
│  WordMasteryEvaluator - 融合判断，对外提供统一接口            │
│  ├── 输入: userId, wordId                                   │
│  └── 输出: { isLearned, confidence, factors, suggestion }   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    追踪层 (Tracking Layer)                   │
│  WordMemoryTracker - 管理单词级状态，缓存和持久化             │
│  ├── 维护每个单词的 reviewTrace[]                           │
│  ├── 存储 strength, stability, lastReviewTs                │
│  └── 提供批量查询接口                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    计算层 (Computation Layer)                │
│  ACT-R Memory Model - 纯计算引擎，无状态                     │
│  ├── computeActivation(trace) → 记忆激活度                  │
│  ├── retrievalProbability(activation) → 提取概率            │
│  └── predictOptimalInterval(trace) → 最佳复习间隔           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    数据层 (Data Layer)                       │
│  SRS WordState + WordScore - 现有数据复用                   │
│  ├── masteryLevel, consecutiveCorrect                      │
│  ├── totalScore, recentAccuracy                            │
│  └── nextReviewDate                                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 各层职责

| 层次 | 模块 | 职责 | 状态管理 |
|------|------|------|----------|
| **服务层** | WordMasteryEvaluator | 融合多源数据，输出决策 | 无状态 |
| **追踪层** | WordMemoryTracker | 管理复习历史，缓存状态 | 有状态（需持久化） |
| **计算层** | ACTRMemoryModel | 纯数学计算，预测记忆 | 无状态 |
| **数据层** | SRS Services | 提供基础数据 | 已有持久化 |

## 4. 核心算法

### 4.1 ACT-R 记忆激活度公式

基于 ACT-R 认知架构的基础级激活度（Base-Level Activation）：

```
B_i = ln(∑_{j=1}^{n} t_j^{-d})
```

其中：
- `B_i`: 记忆项 i 的基础激活度
- `t_j`: 第 j 次复习距今的时间（秒）
- `d`: 衰减率（默认 0.5）
- `n`: 复习次数

### 4.2 记忆提取概率

```
P(recall) = 1 / (1 + e^{-(B_i - τ)/s})
```

其中：
- `τ`: 提取阈值（默认 -0.5）
- `s`: 噪声参数（默认 0.3）

### 4.3 融合评分公式

```
score = w_srs × (masteryLevel / 5) 
      + w_actr × actrRecall 
      + w_recent × recentAccuracy

confidence = 1 - fatigue × 0.3

isLearned = (score × confidence) >= threshold
```

默认权重：
- `w_srs = 0.3`（SRS 掌握等级权重）
- `w_actr = 0.5`（ACT-R 预测权重）
- `w_recent = 0.2`（近期正确率权重）
- `threshold = 0.7`（学会阈值）

## 5. 数据流

### 5.1 答题时数据流

```
用户答题
    │
    ▼
┌─────────────────┐
│ SRS 更新        │ ← 现有逻辑不变
│ masteryLevel++  │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Tracker 记录    │ ← 新增
│ reviewTrace[]   │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Evaluator 评估  │ ← 新增（可选/按需）
│ isLearned?      │
└─────────────────┘
```

### 5.2 查询时数据流

```
查询单词是否学会
    │
    ▼
┌─────────────────────────────────────┐
│ WordMasteryEvaluator.evaluate()     │
└─────────────────────────────────────┘
    │
    ├──► SRS: 获取 masteryLevel, accuracy
    │
    ├──► Tracker: 获取 reviewTrace[]
    │
    ├──► ACT-R: 计算 recallProbability
    │
    └──► AMAS: 获取 userState (fatigue)
    │
    ▼
┌─────────────────────────────────────┐
│ 返回融合评估结果                      │
│ { isLearned, confidence, factors }  │
└─────────────────────────────────────┘
```

## 6. 与现有系统集成

### 6.1 不修改现有逻辑

- SRS 的 `WordStateManager` 继续独立工作
- AMAS Engine 的核心流程不变
- 新系统作为**增强层**叠加在现有系统之上

### 6.2 数据复用

| 现有数据 | 来源 | 用途 |
|----------|------|------|
| masteryLevel | SRS WordState | 融合评分因子 |
| recentAccuracy | SRS WordScore | 融合评分因子 |
| userState.F | AMAS Engine | 置信度折扣 |
| reviewTrace | **新增** WordMemoryTracker | ACT-R 计算输入 |

## 7. 应用场景

### 7.1 智能单词选择

```typescript
// 选择下一批学习单词时，优先选择"快要忘记"的
const candidates = await wordMasteryEvaluator.batchEvaluate(userId, wordIds);
const needReview = candidates
  .filter(c => c.actrRecall < 0.5 && c.srsLevel >= 2)
  .sort((a, b) => a.actrRecall - b.actrRecall);
```

### 7.2 学习完成判断

```typescript
// 判断用户是否完成了词书学习
const allWords = await getWordbookWords(wordbookId);
const evaluations = await wordMasteryEvaluator.batchEvaluate(userId, allWords);
const masteredCount = evaluations.filter(e => e.isLearned).length;
const completionRate = masteredCount / allWords.length;
```

### 7.3 个性化建议

```typescript
// 根据遗忘预测给出建议
if (evaluation.actrRecall < 0.3) {
  return "这个单词快要忘记了，建议立即复习";
} else if (evaluation.actrRecall < 0.6) {
  return "记忆有所衰退，建议今天内复习";
}
```

## 8. 技术优势

1. **认知科学支撑**：ACT-R 是经过验证的认知架构，遗忘曲线预测准确
2. **多源融合**：不依赖单一指标，综合多个维度判断
3. **状态感知**：考虑用户疲劳度等实时状态
4. **渐进增强**：不破坏现有系统，可逐步启用
5. **可解释性**：返回各因子贡献，便于调试和优化

## 9. 后续扩展

- 支持不同单词的难度系数影响衰减率
- 基于用户历史数据个性化调整 ACT-R 参数
- 集成到单词选择算法（PriorityQueueScheduler）
- 添加可视化面板展示记忆强度变化
