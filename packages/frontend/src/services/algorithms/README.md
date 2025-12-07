# 智能间隔重复学习算法 - 实现文档

本目录包含智能间隔重复学习算法的核心实现。

## 已实现的组件

### 1. 数据层基础设施 ✅

#### 1.1 数据模型和类型定义 ✅

- 位置：`src/types/models.ts`
- 新增类型：
  - `WordState` - 单词状态枚举（new, learning, reviewing, mastered）
  - `WordLearningState` - 单词学习状态接口
  - `WordScore` - 单词综合评分接口
  - `AlgorithmConfig` - 算法配置接口
  - `ConfigHistory` - 配置历史记录接口
- 扩展类型：
  - `AnswerRecord` - 添加了 responseTime、dwellTime、sessionId、masteryLevelBefore、masteryLevelAfter 字段

#### 1.2 数据库迁移和存储服务扩展 ✅

- 位置：`backend/prisma/schema.prisma`
- 新增表：
  - `WordLearningState` - 单词学习状态表
  - `WordScore` - 单词得分表
  - `AlgorithmConfig` - 算法配置表
  - `ConfigHistory` - 配置历史表
- 扩展表：
  - `AnswerRecord` - 添加了新字段
- 存储服务扩展：
  - 位置：`src/services/StorageService.ts`
  - 实现了状态、得分、配置的 CRUD 方法，通过后端 API 完成数据持久化

### 2. 核心算法引擎实现 ✅

#### 2.1 间隔重复算法引擎（SpacedRepetitionEngine）✅

- 位置：`src/services/algorithms/SpacedRepetitionEngine.ts`
- 功能：
  - `calculateNextReviewDate` - 计算下次复习时间
  - `updateMasteryLevel` - 更新掌握程度
  - `processCorrectAnswer` - 处理答对的情况
  - `processWrongAnswer` - 处理答错的情况
- 遗忘曲线公式：`nextReview = lastReview + interval * easeFactor`
- 支持可配置的复习间隔序列（默认：1, 3, 7, 15, 30天）

#### 2.2 单词综合评分引擎（WordScoreCalculator）✅

- 位置：`src/services/algorithms/WordScoreCalculator.ts`
- 功能：
  - `calculateScore` - 计算综合得分
  - `calculateAccuracyScore` - 计算正确率得分（0-40分）
  - `calculateSpeedScore` - 计算答题速度得分（0-30分）
  - `calculateStabilityScore` - 计算稳定性得分（0-20分）
  - `calculateProficiencyScore` - 计算熟练度得分（0-10分）
  - `updateScoreStatistics` - 更新得分统计数据
  - `needsIntensivePractice` - 判断是否需要重点学习（得分 < 40）
  - `isMastered` - 判断是否已熟练掌握（得分 > 80 且连续3次）
- 评分公式：`总分 = 正确率×40 + 速度×30 + 稳定性×20 + 熟练度×10`

#### 2.3 优先级队列调度引擎（PriorityQueueScheduler）✅

- 位置：`src/services/algorithms/PriorityQueueScheduler.ts`
- 功能：
  - `generateLearningQueue` - 生成学习队列
  - `calculatePriority` - 计算单词优先级
  - `mixNewAndReviewWords` - 混合新单词和复习单词
  - `getDueWords` - 获取到期需要复习的单词
  - `getUpcomingWords` - 获取即将到期的单词
- 排序规则：新单词 > 逾期复习 > 高错误率 > 正常复习
- 支持可配置的优先级权重和新单词比例

#### 2.4 自适应难度引擎（AdaptiveDifficultyEngine）✅

- 位置：`src/services/algorithms/AdaptiveDifficultyEngine.ts`
- 功能：
  - `adjustDifficulty` - 根据连续答对/答错调整难度
  - `calculateNewWordRatio` - 根据正确率调整新单词比例
  - `recordSessionStats` - 记录会话统计
  - `analyzeTrend` - 分析学习趋势
  - `getRecommendedWordCount` - 获取建议的单词数量
- 调整规则：
  - 连续答对5次 → 增加单词数量（最多+50%）
  - 连续答错3次 → 减少单词数量（最少5个）
  - 最小调整间隔：1个会话

#### 2.5 单词状态管理器（WordStateManager）✅

- 位置：`src/services/algorithms/WordStateManager.ts`
- 功能：
  - `initializeWordState` - 初始化单词状态
  - `getState` - 获取单词状态
  - `updateState` - 更新单词状态
  - `batchGetStates` - 批量获取单词状态
  - `getWordsByState` - 按状态获取单词
  - `getDueWords` - 获取到期需要复习的单词
- 特性：
  - 内存缓存，提高访问速度
  - 支持批量操作
  - 抽象存储接口，支持多种存储实现

### 3. 服务层整合和业务逻辑 ✅

#### 3.1 核心服务（SpacedRepetitionService）✅

- 位置：`src/services/algorithms/SpacedRepetitionService.ts`
- 功能：
  - `startSession` - 开始学习会话
  - `submitAnswer` - 提交答题
  - `endSession` - 结束学习会话
  - `getWordState` - 获取单词状态
  - `getWordScore` - 获取单词得分
  - `getDueWords` - 获取到期需要复习的单词
  - `getWordsByState` - 获取按状态分类的单词
  - `getTrendAnalysis` - 获取学习趋势分析
  - `getRecommendedWordCount` - 获取建议的单词数量
- 手动调整功能：
  - `markAsMastered` - 标记单词为已掌握
  - `markAsNeedsPractice` - 标记单词为需要重点学习
  - `resetProgress` - 重置单词学习进度
  - `batchUpdateWords` - 批量更新单词状态
- 特性：
  - 整合所有算法引擎
  - 完整的答题后状态更新流程
  - 自动记录手动调整的时间和原因

#### 3.2 LearningService 集成新算法 ✅

- 位置：`src/services/LearningService.ts`
- 重构内容：
  - `startSession` - 使用优先级队列生成学习列表
  - `submitAnswer` - 记录响应时间和停留时长，更新单词状态和得分
  - `nextWord` - 应用自适应难度调整
- 新增方法：
  - `getWordState` - 获取单词学习状态
  - `getWordScore` - 获取单词得分
  - `getDueWords` - 获取到期需要复习的单词
  - `getTrendAnalysis` - 获取学习趋势分析
  - `getRecommendedWordCount` - 获取建议的单词数量
  - `recordDwellTime` - 记录单词停留时长
- 特性：
  - 保持向后兼容性
  - 可选启用智能算法（通过传入 userId）
  - 自动回退到原有逻辑（如果智能算法失败）

#### 3.3 算法配置服务（AlgorithmConfigService）✅

- 位置：`src/services/algorithms/AlgorithmConfigService.ts`
- 功能：
  - `getConfig` - 获取当前算法配置
  - `updateConfig` - 更新算法配置
  - `resetToDefault` - 重置配置为默认值
  - `getConfigHistory` - 获取配置历史记录
  - `validateConfig` - 验证配置的合法性
- 验证规则：
  - 权重总和为100%
  - 阈值在合理范围内
  - 复习间隔递增
  - 级别连续
- 特性：
  - 自动记录配置历史
  - 完整的配置验证
  - 支持配置缓存

## 使用示例

### 使用 SpacedRepetitionService

```typescript
import { SpacedRepetitionService } from './algorithms/SpacedRepetitionService';
import { AlgorithmConfigService } from './algorithms/AlgorithmConfigService';

// 获取算法配置
const configService = new AlgorithmConfigService();
const config = await configService.getConfig();

// 创建服务实例
const srService = new SpacedRepetitionService(config, storageAdapter);

// 开始学习会话
const session = await srService.startSession(
  userId,
  availableWordIds,
  20, // 目标单词数量
  0.75, // 用户整体正确率
);

// 提交答题
const result = await srService.submitAnswer(
  userId,
  wordId,
  isCorrect,
  responseTime,
  dwellTime,
  selectedAnswer,
  correctAnswer,
);

console.log('答题结果:', {
  掌握程度: result.wordState.masteryLevel,
  得分: result.wordScore.totalScore,
  下次复习: new Date(result.nextReviewDate).toLocaleString(),
});

// 结束会话
const sessionStats = await srService.endSession();
```

### 使用 LearningService（集成版）

```typescript
import LearningService from './LearningService';

// 开始学习会话（启用智能算法）
const session = await LearningService.startSession(
  wordIds,
  userId, // 传入 userId 启用智能算法
  20, // 目标单词数量
);

// 提交答题（启用智能算法）
await LearningService.submitAnswer(
  wordId,
  answer,
  isCorrect,
  userId, // 传入 userId 启用智能算法
);

// 获取单词状态
const wordState = await LearningService.getWordState(userId, wordId);

// 获取学习趋势
const trend = LearningService.getTrendAnalysis();
console.log('学习趋势:', trend);
```

### 手动调整单词状态

```typescript
// 标记为已掌握
await srService.markAsMastered(userId, wordId, '用户已经完全掌握');

// 标记为需要重点学习
await srService.markAsNeedsPractice(userId, wordId, '用户反馈需要加强');

// 重置学习进度
await srService.resetProgress(userId, wordId, '用户要求重新学习');

// 批量操作
await srService.batchUpdateWords(
  userId,
  [wordId1, wordId2, wordId3],
  'mastered',
  '批量标记为已掌握',
);
```

### 管理算法配置

```typescript
import { AlgorithmConfigService } from './algorithms/AlgorithmConfigService';

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
  '调整优先级权重，增加新单词比例',
);

// 验证配置
const validation = configService.validateConfig(newConfig);
if (!validation.isValid) {
  console.error('配置验证失败:', validation.errors);
}

// 查看配置历史
const history = await configService.getConfigHistory(10);

// 重置为默认配置
await configService.resetToDefault(adminUserId);
```

## 注意事项

1. **存储接口实现**：`WordStateManager` 需要一个实现了 `WordStateStorage` 接口的存储适配器
2. **配置管理**：算法配置应该从后端 API 加载，支持管理员动态调整
3. **性能优化**：使用内存缓存减少数据库查询，批量操作提高效率
4. **错误处理**：所有异步操作都应该有适当的错误处理
5. **日志记录**：关键操作应该记录日志，便于调试和监控
6. **向后兼容**：LearningService 保持向后兼容，可选启用智能算法

## 实现状态

- [x] 实现后端 API 接口
- [x] 实现前端 UI 组件
- [x] 添加单元测试和集成测试
- [x] 性能优化和缓存策略
- [x] 管理员配置界面
