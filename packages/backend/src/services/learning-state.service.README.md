# LearningStateService - 学习状态统一管理服务

## 概述

`LearningStateService` 是一个统一的学习状态管理服务，整合了以下三个服务的功能：

- **WordStateService**: 单词学习状态管理
- **WordScoreService**: 单词得分管理
- **WordMasteryService**: 掌握度评估

通过提供高层次的统一接口，简化了学习状态的管理，并自动发布相关的领域事件。

## 核心功能

### 1. 学习状态管理

```typescript
// 获取单词的完整学习状态
const state = await learningStateService.getWordState(userId, wordId, includeMastery);

// 批量获取
const states = await learningStateService.batchGetWordStates(userId, wordIds, includeMastery);

// 更新单词状态
const newState = await learningStateService.updateWordState(userId, wordId, {
  state: WordState.REVIEWING,
  masteryLevel: 6,
  reviewCount: 5,
});

// 批量更新
await learningStateService.batchUpdateWordStates(userId, updates);
```

### 2. 得分管理

```typescript
// 获取单词得分
const score = await learningStateService.getWordScore(userId, wordId);

// 更新得分（根据答题结果）
const newScore = await learningStateService.updateWordScore(userId, wordId, {
  isCorrect: true,
  responseTime: 2000,
});

// 获取低分单词（需要重点学习）
const lowScoreWords = await learningStateService.getLowScoreWords(userId, 40);

// 获取高分单词（已熟练掌握）
const highScoreWords = await learningStateService.getHighScoreWords(userId, 80);
```

### 3. 掌握度评估

```typescript
// 检查单词掌握度
const mastery = await learningStateService.checkMastery(userId, wordId);

// 批量检查
const evaluations = await learningStateService.batchCheckMastery(userId, wordIds);

// 记录复习事件（用于 ACT-R 模型）
await learningStateService.recordReview(userId, wordId, {
  timestamp: Date.now(),
  isCorrect: true,
  responseTime: 1500,
});
```

### 4. 统计查询

```typescript
// 获取用户综合学习统计
const stats = await learningStateService.getUserStats(userId);

// 获取需要复习的单词
const dueWords = await learningStateService.getDueWords(userId);

// 获取特定状态的单词
const learningWords = await learningStateService.getWordsByState(userId, WordState.LEARNING);
```

## 事件发布

服务会自动发布以下领域事件：

### 1. WORD_MASTERED (单词掌握事件)

**触发条件**：

- 单词状态从非 MASTERED 变为 MASTERED
- masteryLevel 达到阈值（>= 5）

**事件数据**：

```typescript
{
  userId: string;
  wordId: string;
  masteryLevel: number;
  evaluationScore: number;
  confidence: number;
  timestamp: Date;
}
```

### 2. FORGETTING_RISK_HIGH (遗忘风险警告事件)

**触发条件**：

- 单词处于 REVIEWING 或 MASTERED 状态
- ACT-R 提取概率 < 0.7

**事件数据**：

```typescript
{
  userId: string;
  wordId: string;
  recallProbability: number;
  riskLevel: 'high' | 'medium' | 'low';
  lastReviewDate?: Date;
  suggestedReviewDate: Date;
  timestamp: Date;
}
```

## 完整使用示例

### 答题流程

```typescript
async function handleUserAnswer(
  userId: string,
  wordId: string,
  isCorrect: boolean,
  responseTime: number,
) {
  // 1. 获取答题前的状态
  const beforeState = await learningStateService.getWordState(userId, wordId);

  // 2. 记录复习事件（用于 ACT-R 模型）
  await learningStateService.recordReview(userId, wordId, {
    timestamp: Date.now(),
    isCorrect,
    responseTime,
  });

  // 3. 更新得分
  await learningStateService.updateWordScore(userId, wordId, {
    isCorrect,
    responseTime,
  });

  // 4. 更新学习状态
  const currentMasteryLevel = beforeState.learningState?.masteryLevel || 0;
  const newMasteryLevel = isCorrect
    ? currentMasteryLevel + 1
    : Math.max(0, currentMasteryLevel - 1);

  const newState = await learningStateService.updateWordState(userId, wordId, {
    masteryLevel: newMasteryLevel,
    reviewCount: (beforeState.learningState?.reviewCount || 0) + 1,
    lastReviewDate: new Date(),
    nextReviewDate: new Date(Date.now() + Math.pow(2, newMasteryLevel) * 24 * 60 * 60 * 1000),
  });

  // 5. 如果达到掌握标准，会自动发布 WORD_MASTERED 事件
  // 如果检测到遗忘风险，会自动发布 FORGETTING_RISK_HIGH 事件

  return newState;
}
```

### 监听事件

```typescript
import { getEventBus } from '../core/event-bus';
import { decisionEventsService } from './decision-events.service';

const eventBus = getEventBus(decisionEventsService);

// 监听单词掌握事件
eventBus.subscribe<WordMasteredPayload>('WORD_MASTERED', (payload) => {
  console.log('单词已掌握:', payload);
  // 触发后续逻辑：发送通知、更新成就等
});

// 监听遗忘风险警告事件
eventBus.subscribe<ForgettingRiskPayload>('FORGETTING_RISK_HIGH', (payload) => {
  console.log('遗忘风险警告:', payload);
  // 触发后续逻辑：复习提醒等
});
```

## 数据类型

### CompleteWordState

```typescript
interface CompleteWordState {
  learningState: WordLearningState | null; // 学习状态
  score: WordScore | null; // 得分信息
  mastery: MasteryEvaluation | null; // 掌握度评估
}
```

### WordStateUpdateData

```typescript
interface WordStateUpdateData {
  state?: WordState; // 学习状态
  masteryLevel?: number; // 掌握度等级
  easeFactor?: number; // 难度因子
  reviewCount?: number; // 复习次数
  lastReviewDate?: Date | null; // 上次复习时间
  nextReviewDate?: Date | null; // 下次复习时间
}
```

### UserLearningStats

```typescript
interface UserLearningStats {
  stateStats: {
    totalWords: number;
    newWords: number;
    learningWords: number;
    reviewingWords: number;
    masteredWords: number;
  };
  scoreStats: {
    averageScore: number;
    highScoreCount: number;
    mediumScoreCount: number;
    lowScoreCount: number;
  };
  masteryStats: UserMasteryStats;
}
```

## 性能优化

### 缓存策略

服务使用了多层缓存来提高性能：

1. **学习状态缓存**：通过 `WordStateService` 实现
2. **得分缓存**：通过 `WordScoreService` 实现
3. **掌握度评估**：按需计算，不默认缓存（较耗时）

### 批量操作

推荐使用批量操作接口来减少数据库查询次数：

```typescript
// 推荐：批量获取
const states = await learningStateService.batchGetWordStates(userId, wordIds);

// 不推荐：循环单个获取
for (const wordId of wordIds) {
  const state = await learningStateService.getWordState(userId, wordId);
}
```

### includeMastery 参数

`getWordState` 和 `batchGetWordStates` 方法的 `includeMastery` 参数默认为 `false`：

- **false**: 只返回学习状态和得分，速度快
- **true**: 包含掌握度评估，较慢但数据完整

根据实际需求选择是否包含掌握度评估。

## 缓存管理

```typescript
// 清除用户的所有学习状态缓存
learningStateService.clearUserCache(userId);

// 清除指定单词的缓存
learningStateService.clearWordCache(userId, wordId);
```

## 架构优势

1. **统一接口**：提供高层次的统一 API，简化调用
2. **事件驱动**：自动发布领域事件，支持解耦和扩展
3. **性能优化**：支持批量操作和缓存策略
4. **类型安全**：完整的 TypeScript 类型定义
5. **易于测试**：清晰的职责划分和依赖注入

## 依赖关系

```
LearningStateService
├── WordStateService (单词学习状态)
├── WordScoreService (单词得分)
├── WordMasteryService (掌握度评估)
└── EventBus (事件总线)
```

## 文件位置

- **服务文件**: `packages/backend/src/services/learning-state.service.ts`
- **示例文件**: `packages/backend/src/services/learning-state.service.example.ts`
- **文档文件**: `packages/backend/src/services/learning-state.service.README.md`

## 更多示例

详见 `learning-state.service.example.ts` 文件，包含 17 个完整的使用示例。

## 注意事项

1. **事件发布是异步的**：事件发布不会阻塞主流程
2. **掌握度评估较耗时**：默认不包含，按需请求
3. **批量操作更高效**：尽量使用批量接口
4. **缓存一致性**：更新操作会自动清除相关缓存
5. **权限校验**：所有操作都会自动进行权限校验
