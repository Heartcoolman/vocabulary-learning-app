# 学习服务合并迁移指南

## 概述

为了简化代码库和提高可维护性，我们将三个独立的学习相关服务合并到了一个统一的服务中：

- `WordStateService` (word-state.service.ts)
- `WordScoreService` (word-score.service.ts)
- `WordMasteryService` (word-mastery.service.ts)

现在所有功能都集成在 `LearningStateService` (learning-state.service.ts) 中。

## 主要变更

### 1. 新的统一服务

**新服务**: `LearningStateService`

- 文件位置: `packages/backend/src/services/learning-state.service.ts`
- 导出: `learningStateService` (单例实例)

### 2. 旧服务标记为废弃

以下服务已被标记为 `@deprecated`，但仍保留以确保向后兼容性：

- `wordStateService` - 单词学习状态管理
- `wordScoreService` - 单词得分管理
- `wordMasteryService` - 掌握度评估管理

## API 迁移映射

### 单词学习状态管理 (WordStateService → LearningStateService)

| 旧 API                                     | 新 API                                         | 说明                                                 |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| `wordStateService.getWordState()`          | `learningStateService.getWordState()`          | 返回 `CompleteWordState`，包含学习状态、分数和掌握度 |
| `wordStateService.batchGetWordStates()`    | `learningStateService.batchGetWordStates()`    | 批量获取单词学习状态                                 |
| `wordStateService.upsertWordState()`       | `learningStateService.upsertWordState()`       | 创建或更新学习状态                                   |
| `wordStateService.batchUpdateWordStates()` | `learningStateService.batchUpdateWordStates()` | 批量更新学习状态                                     |
| `wordStateService.deleteWordState()`       | `learningStateService.deleteWordState()`       | 删除学习状态                                         |
| `wordStateService.getDueWords()`           | `learningStateService.getDueWords()`           | 获取到期需复习的单词                                 |
| `wordStateService.getWordsByState()`       | `learningStateService.getWordsByState()`       | 获取特定状态的单词                                   |
| `wordStateService.getUserStats()`          | `learningStateService.getUserStats()`          | 获取用户学习统计                                     |

### 单词得分管理 (WordScoreService → LearningStateService)

| 旧 API                                    | 新 API                                        | 说明                   |
| ----------------------------------------- | --------------------------------------------- | ---------------------- |
| `wordScoreService.getWordScore()`         | `learningStateService.getWordScore()`         | 获取单词得分           |
| `wordScoreService.batchGetWordScores()`   | `learningStateService.batchGetWordScores()`   | 批量获取单词得分       |
| `wordScoreService.updateScore()`          | `learningStateService.updateWordScore()`      | 更新单词得分           |
| `wordScoreService.getLowScoreWords()`     | `learningStateService.getLowScoreWords()`     | 获取低分单词           |
| `wordScoreService.getHighScoreWords()`    | `learningStateService.getHighScoreWords()`    | 获取高分单词           |
| `wordScoreService.getWordsByScoreRange()` | `learningStateService.getWordsByScoreRange()` | 获取指定得分范围的单词 |
| `wordScoreService.upsertWordScore()`      | `learningStateService.upsertWordScore()`      | 创建或更新单词得分     |
| `wordScoreService.getUserScoreStats()`    | `learningStateService.getUserScoreStats()`    | 获取用户得分统计       |

### 掌握度评估管理 (WordMasteryService → LearningStateService)

| 旧 API                                       | 新 API                                                               | 说明               |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| `wordMasteryService.evaluateWord()`          | `learningStateService.evaluateWord()` 或 `checkMastery()`            | 评估单词掌握度     |
| `wordMasteryService.batchEvaluateWords()`    | `learningStateService.batchEvaluateWords()` 或 `batchCheckMastery()` | 批量评估单词掌握度 |
| `wordMasteryService.recordReview()`          | `learningStateService.recordReview()`                                | 记录复习事件       |
| `wordMasteryService.batchRecordReview()`     | `learningStateService.batchRecordReview()`                           | 批量记录复习事件   |
| `wordMasteryService.getMemoryTrace()`        | `learningStateService.getMemoryTrace()`                              | 获取复习历史轨迹   |
| `wordMasteryService.getWordMemoryState()`    | `learningStateService.getWordMemoryState()`                          | 获取单词记忆状态   |
| `wordMasteryService.predictInterval()`       | `learningStateService.predictInterval()`                             | 预测最佳复习间隔   |
| `wordMasteryService.getUserMasteryStats()`   | `learningStateService.getUserMasteryStats()`                         | 获取用户掌握度统计 |
| `wordMasteryService.updateEvaluatorConfig()` | `learningStateService.updateEvaluatorConfig()`                       | 更新评估器配置     |
| `wordMasteryService.getEvaluatorConfig()`    | `learningStateService.getEvaluatorConfig()`                          | 获取评估器配置     |

## 新增功能

### 1. 统一的完整状态查询

```typescript
// 获取单词的完整学习状态（包括学习状态、分数、掌握度）
const completeState = await learningStateService.getWordState(userId, wordId, includeMastery);
// 返回: CompleteWordState { learningState, score, mastery }
```

### 2. 综合学习统计

```typescript
// 获取用户的综合学习统计（包括状态统计、得分统计、掌握度统计）
const stats = await learningStateService.getUserLearningStats(userId);
// 返回: UserLearningStats { stateStats, scoreStats, masteryStats }
```

### 3. 事件发布集成

新服务通过事件总线自动发布以下事件：

- `WORD_MASTERED` - 单词掌握事件
- `FORGETTING_RISK_HIGH` - 遗忘风险警告事件

## 迁移步骤

### 1. 更新导入语句

**之前:**

```typescript
import { wordStateService } from './services/word-state.service';
import { wordScoreService } from './services/word-score.service';
import { wordMasteryService } from './services/word-mastery.service';
```

**之后:**

```typescript
import { learningStateService } from './services/learning-state.service';
// 或从服务索引导入
import { learningStateService } from './services';
```

### 2. 更新函数调用

**示例 1: 获取单词状态**

之前:

```typescript
const learningState = await wordStateService.getWordState(userId, wordId);
const score = await wordScoreService.getWordScore(userId, wordId);
const mastery = await wordMasteryService.evaluateWord(userId, wordId);
```

之后:

```typescript
// 方式1: 分别获取
const learningState = await learningStateService.getWordState(userId, wordId);
const score = await learningStateService.getWordScore(userId, wordId);
const mastery = await learningStateService.evaluateWord(userId, wordId);

// 方式2: 一次获取完整状态（推荐）
const { learningState, score, mastery } = await learningStateService.getWordState(
  userId,
  wordId,
  true, // includeMastery
);
```

**示例 2: 更新学习状态**

之前:

```typescript
await wordStateService.upsertWordState(userId, wordId, updateData);
await wordScoreService.updateScore(userId, wordId, { isCorrect: true });
```

之后:

```typescript
await learningStateService.upsertWordState(userId, wordId, updateData);
await learningStateService.updateWordScore(userId, wordId, { isCorrect: true });

// 或使用统一的更新方法（会自动触发事件）
await learningStateService.updateWordState(userId, wordId, updateData);
```

**示例 3: 批量操作**

之前:

```typescript
const states = await wordStateService.batchGetWordStates(userId, wordIds);
const scores = await wordScoreService.batchGetWordScores(userId, wordIds);
```

之后:

```typescript
// 方式1: 分别获取
const states = await learningStateService.batchGetWordStates(userId, wordIds);
const scores = await learningStateService.batchGetWordScores(userId, wordIds);

// 方式2: 批量获取完整状态（推荐）
const completeStates = await learningStateService.batchGetWordStates_Complete(
  userId,
  wordIds,
  true, // includeMastery
);
```

### 3. 类型更新

**新增类型:**

```typescript
import type {
  CompleteWordState,
  UserStats,
  UserMasteryStats,
  WordStateUpdateData,
  UserLearningStats,
  ReviewEventInput,
  ReviewTraceRecord,
} from './services/learning-state.service';
```

## 路由更新

路由文件已自动更新：

- `packages/backend/src/routes/word-state.routes.ts`
- `packages/backend/src/routes/word-score.routes.ts`
- `packages/backend/src/routes/word-mastery.routes.ts`

所有路由现在使用 `learningStateService`。

## 兼容性

### 向后兼容

- 旧的服务文件 (`word-state.service.ts`, `word-score.service.ts`, `word-mastery.service.ts`) 仍然存在并可用
- 它们已被标记为 `@deprecated`
- 所有现有代码将继续工作，不会破坏性变更

### 未来计划

在确认所有代码迁移完成后，将来可能会：

1. 移除旧服务的导出（保留文件用于参考）
2. 最终删除旧服务文件

## 优势

1. **简化代码库**: 三个服务合并为一个，减少了代码重复
2. **统一接口**: 提供了更一致的 API 接口
3. **性能优化**: 减少了服务间的调用开销
4. **更好的缓存管理**: 统一的缓存失效策略
5. **事件驱动**: 内置事件发布机制，支持解耦的系统架构
6. **更易维护**: 相关功能集中在一起，便于理解和维护

## 测试

已通过的测试：

- ✅ TypeScript 编译通过
- ✅ 所有路由正确引用新服务
- ✅ 类型定义完整且正确

## 需要帮助？

如果在迁移过程中遇到问题：

1. 检查本指南中的 API 映射表
2. 查看旧服务文件中的 `@deprecated` 注释，其中包含迁移提示
3. 参考 `learning-state.service.ts` 中的完整 API 文档
4. 查看已更新的路由文件作为实际示例

## 总结

这次重构将三个独立的学习服务合并为一个统一的 `LearningStateService`，提供了更简洁、高效和易维护的 API。建议逐步迁移代码以使用新服务，但旧服务仍可用于确保平滑过渡。
