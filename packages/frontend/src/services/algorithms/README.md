# 智能间隔重复学习算法

本目录包含算法配置服务，核心算法实现已迁移至 Rust 后端。

## 架构说明

### 迁移状态

核心算法引擎已迁移至 Rust AMAS 后端（2024-12），前端通过 API 调用后端服务：

| 原前端模块               | 迁移目标                                    | 状态      |
| ------------------------ | ------------------------------------------- | --------- |
| SpacedRepetitionEngine   | `backend-rust/services/learning_state.rs`   | ✅ 已迁移 |
| WordScoreCalculator      | `backend-rust/services/mastery_learning.rs` | ✅ 已迁移 |
| PriorityQueueScheduler   | `backend-rust/services/plan.rs`             | ✅ 已迁移 |
| AdaptiveDifficultyEngine | AMAS 系统                                   | ✅ 已迁移 |
| WordStateManager         | `backend-rust/services/word_states.rs`      | ✅ 已迁移 |
| SpacedRepetitionService  | `backend-rust/services/learning_state.rs`   | ✅ 已迁移 |

### 当前保留的组件

#### AlgorithmConfigService

- **位置**: `src/services/algorithms/AlgorithmConfigService.ts`
- **功能**:
  - `getConfig` - 获取当前算法配置
  - `updateConfig` - 更新算法配置
  - `resetToDefault` - 重置配置为默认值
  - `getConfigHistory` - 获取配置历史记录
  - `validateConfig` - 验证配置的合法性

## 使用方式

### 前端调用后端 API

```typescript
import ApiClient from '../client';

// 提交答题（后端 AMAS 处理）
const result = await ApiClient.processLearningEvent({
  wordId,
  isCorrect,
  responseTime,
  dwellTime,
});

// 获取到期单词
const dueWords = await ApiClient.getDueWords();

// 获取学习趋势
const trend = await ApiClient.getCurrentTrend();

// 标记为已掌握
await ApiClient.markWordAsMastered(wordId);

// 批量更新状态
await ApiClient.batchUpdateWordStates(wordIds, 'mastered');
```

### 使用 LearningService

```typescript
import LearningService from './LearningService';

// 开始学习会话
const session = await LearningService.startSession(wordIds, userId);

// 提交答题
const feedback = await LearningService.submitAnswer(
  wordId,
  answer,
  isCorrect,
  responseTime,
  dwellTime,
  userId,
);

// 获取单词状态
const wordState = await LearningService.getWordState(userId, wordId);

// 获取学习趋势
const trend = await LearningService.getTrendAnalysis();
```

### 管理算法配置

```typescript
import { AlgorithmConfigService } from './algorithms';

const configService = new AlgorithmConfigService();

// 获取当前配置
const config = await configService.getConfig();

// 更新配置
const newConfig = await configService.updateConfig(
  {
    consecutiveCorrectThreshold: 6,
    priorityWeights: {
      newWord: 50,
      errorRate: 25,
      overdueTime: 15,
      wordScore: 10,
    },
  },
  adminUserId,
  '调整优先级权重',
);

// 验证配置
const validation = configService.validateConfig(newConfig);
```

## 后端 API 端点

### 学习相关

| 端点                  | 方法 | 功能         |
| --------------------- | ---- | ------------ |
| `/api/learning/event` | POST | 处理学习事件 |
| `/api/learning/trend` | GET  | 获取学习趋势 |

### 单词状态

| 端点                                           | 方法 | 功能         |
| ---------------------------------------------- | ---- | ------------ |
| `/api/word-states/batch`                       | POST | 批量获取状态 |
| `/api/word-states/due/list`                    | GET  | 获取到期单词 |
| `/api/word-states/by-state/:state`             | GET  | 按状态查询   |
| `/api/word-states/:wordId/mark-mastered`       | POST | 标记已掌握   |
| `/api/word-states/:wordId/mark-needs-practice` | POST | 标记需练习   |
| `/api/word-states/:wordId/reset`               | POST | 重置进度     |
| `/api/word-states/batch-update`                | POST | 批量更新     |

## 数据模型

### WordLearningState

```typescript
interface WordLearningState {
  id: string;
  userId: string;
  wordId: string;
  state: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';
  masteryLevel: number; // 0-5
  easeFactor: number; // 1.3-2.5
  reviewCount: number;
  lastReviewDate: number | null;
  nextReviewDate: number | null;
  currentInterval: number; // 天数
  consecutiveCorrect: number;
  consecutiveWrong: number;
}
```

### WordScore

```typescript
interface WordScore {
  id: string;
  userId: string;
  wordId: string;
  totalScore: number; // 0-100
  accuracyScore: number; // 0-40
  speedScore: number; // 0-30
  stabilityScore: number; // 0-20
  proficiencyScore: number; // 0-10
}
```
