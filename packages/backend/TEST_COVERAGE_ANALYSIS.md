# Backend 测试覆盖率深度分析与补充计划

> 生成时间: 2025-12-13
> 分析范围: packages/backend/src/services/\*_/_.service.ts
> 当前测试覆盖: 37/41 服务 (90.2%)

---

## 📊 执行摘要

### 当前状况

- **总服务数量**: 41 个
- **已有测试**: 37 个 (90.2%)
- **缺失测试**: 4 个关键服务
- **总代码行数**: 24,612 行
- **未测试代码**: ~4,053 行 (16.5%)

### 核心风险评估

| 风险等级       | 服务数量 | 技术债务规模 | 业务影响     |
| -------------- | -------- | ------------ | ------------ |
| **🔴 P0 严重** | 2        | 2,401 LOC    | 核心业务流程 |
| **🟡 P1 高**   | 1        | 1,047 LOC    | 关键功能模块 |
| **🟢 P2 中**   | 1        | 373 LOC      | 辅助功能     |

---

## 🔴 第一部分：缺失测试的服务详细分析

### 1. learning-state.service.ts (P0 - 严重)

**文件路径**: `/packages/backend/src/services/learning-state.service.ts`

#### 基本信息

- **代码行数**: 1,354 行
- **复杂度**: ⭐⭐⭐⭐⭐ (极高)
- **依赖数量**: 12+ 个外部依赖
- **核心职责**: 统一管理单词学习状态、分数、掌握度评估

#### 风险评估

**业务影响** (10/10):

- 整合了 WordStateService、WordScoreService、WordMasteryService 三个服务
- 管理核心学习数据：学习状态、掌握等级、复习间隔
- 直接影响学习进度追踪和复习调度
- 使用 EventBus 发布领域事件，影响多个下游服务

**技术复杂度** (10/10):

- 大量数据库事务操作（包含复杂的 Prisma 查询）
- 集成 ACT-R 认知模型和 WordMemoryTracker
- 复杂的缓存策略（多级缓存）
- 批量操作和并发控制
- 事件驱动架构（EventBus）

**未测试的关键代码路径**:

1. **学习状态管理** (300+ LOC)
   - `getWordState()`: 获取单词学习状态（带缓存）
   - `updateWordState()`: 更新学习状态（事务 + 事件发布）
   - `batchGetWordStates()`: 批量获取（N+1 查询优化）
   - `getDueWords()`: 获取到期复习词（复杂过滤逻辑）

2. **分数计算与更新** (200+ LOC)
   - `getWordScore()`: 获取单词得分
   - `updateWordScore()`: 更新得分（多维度加权计算）
   - `batchCalculateScores()`: 批量计算得分
   - 得分权重算法：accuracy(40%) + speed(20%) + stability(20%) + proficiency(20%)

3. **掌握度评估** (400+ LOC)
   - `evaluateWordMastery()`: 掌握度评估（集成 WordMasteryEvaluator）
   - `getMasteryStats()`: 用户掌握度统计
   - `trackReview()`: 复习追踪（集成 WordMemoryTracker）
   - ACT-R 记忆模型集成

4. **事件发布机制** (150+ LOC)
   - `publishWordMasteredEvent()`: 单词掌握事件
   - `publishForgettingRiskEvent()`: 遗忘风险事件
   - 事件总线集成和错误处理

5. **缓存管理** (100+ LOC)
   - 多级缓存策略（内存 + Redis）
   - 缓存失效和更新策略
   - 批量缓存预热

#### 潜在 Bug 风险点

1. **数据一致性**:
   - 事务失败时缓存未清除
   - 并发更新时的竞态条件
   - EventBus 事件发布失败导致状态不一致

2. **性能问题**:
   - N+1 查询在批量操作中
   - 缓存穿透和雪崩
   - 大量 EventBus 事件堆积

3. **边界条件**:
   - 新用户首次学习时状态初始化
   - 单词学习状态迁移（NEW → LEARNING → REVIEWING → MASTERED）
   - 极端掌握度值处理

---

### 2. word-selection.service.ts (P0 - 严重)

**文件路径**: `/packages/backend/src/services/word-selection.service.ts`

#### 基本信息

- **代码行数**: 770 行
- **复杂度**: ⭐⭐⭐⭐ (高)
- **依赖数量**: 8+ 个外部依赖
- **核心职责**: 智能选词策略，支持普通/复习/碎片时间三种模式

#### 风险评估

**业务影响** (9/10):

- 直接决定用户学习内容和顺序
- 整合 AMAS 自适应策略
- 影响学习效率和用户体验
- 复习调度的核心逻辑

**技术复杂度** (8/10):

- 多种选词策略（Normal、Review、MicroSession）
- AMAS 难度映射和策略参数解析
- 复杂的优先级计算和排序算法
- 遗忘曲线集成
- MicroSessionPolicy 策略模式实现

**未测试的关键代码路径**:

1. **策略路由** (100+ LOC)
   - `selectWordsForSession()`: 主入口，根据 sessionType 路由
   - 策略选择逻辑：normal / review / micro

2. **普通选词** (200+ LOC)
   - `selectForNormalSession()`: AMAS 策略集成
   - `fetchWordsWithStrategy()`: 根据 new_ratio 分配新词/复习词
   - 难度映射：easy[0, 0.4], mid[0.2, 0.7], hard[0.5, 1.0]

3. **复习选词** (150+ LOC)
   - `selectWordsForReview()`: 复习词优先级排序
   - `getDueWordsWithPriority()`: 到期词计算和优先级
   - 优先级算法：overdueDays×5 + errorRate权重 + (100-score)×0.3

4. **碎片时间选词** (200+ LOC)
   - `selectWordsForMicroSession()`: MicroSessionPolicy 集成
   - `getCandidatesForMicroSession()`: 候选词筛选
   - `toWordCandidates()`: 格式转换和数据准备

5. **难度计算** (120+ LOC)
   - `computeWordDifficultyFromScore()`: 基于得分计算难度
   - `computeNewWordDifficulty()`: 新词难度估算
   - `calculateForgettingRisk()`: 遗忘风险评估
   - `calculateMemoryStrength()`: 记忆强度计算

#### 潜在 Bug 风险点

1. **选词逻辑错误**:
   - 难度范围重叠导致选词偏差
   - new_ratio 边界值处理（0, 1）
   - 复习词不足时的补充逻辑

2. **数据不一致**:
   - 学习状态和得分数据不同步
   - 批量查询时的数据时效性
   - excludeIds 过滤失效

3. **性能问题**:
   - 大量候选词时的排序性能
   - 重复查询数据库
   - 遗忘曲线计算耗时

---

### 3. user-profile.service.ts (P1 - 高)

**文件路径**: `/packages/backend/src/services/user-profile.service.ts`

#### 基本信息

- **代码行数**: 1,047 行
- **复杂度**: ⭐⭐⭐⭐ (高)
- **依赖数量**: 10+ 个外部依赖
- **核心职责**: 统一管理用户画像（基础信息、习惯、认知、学习档案）

#### 风险评估

**业务影响** (8/10):

- 整合了 user.service、habit-profile.service、cognitive-profiling.service
- 用户认证和授权依赖此服务
- 个性化学习推荐的数据源
- 影响 AMAS 自适应决策

**技术复杂度** (9/10):

- 多模型集成：HabitRecognizer、ChronotypeDetector、LearningStyleProfiler
- 复杂的缓存策略（内存 + 数据库）
- 认知画像分析算法
- 密码加密和安全性
- EventBus 事件发布

**未测试的关键代码路径**:

1. **用户管理** (200+ LOC)
   - `createUser()`: 用户注册（密码加密）
   - `getUserById()`: 用户查询（带缓存）
   - `updateUser()`: 用户信息更新
   - `authenticateUser()`: 密码验证

2. **习惯画像** (300+ LOC)
   - `getHabitProfile()`: 获取习惯画像（HabitRecognizer）
   - `recordTimeEvent()`: 记录学习时间事件
   - `persistHabitProfile()`: 持久化习惯数据
   - 习惯识别器实例缓存管理

3. **认知画像** (350+ LOC)
   - `getChronotypeProfile()`: 时型画像（ChronotypeDetector）
   - `getLearningStyleProfile()`: 学习风格画像（LearningStyleProfiler）
   - `buildCognitiveProfile()`: 综合认知画像
   - 数据不足错误处理（MIN_PROFILING_RECORDS = 20）

4. **学习档案** (200+ LOC)
   - `getUserLearningProfile()`: 获取学习档案
   - `updateLearningProfile()`: 更新档案
   - 档案数据聚合和统计

#### 潜在 Bug 风险点

1. **安全问题**:
   - 密码加密盐轮次配置（bcrypt rounds）
   - 用户凭证验证漏洞
   - 敏感信息缓存泄露

2. **数据一致性**:
   - 内存缓存与数据库不同步
   - 习惯识别器状态丢失
   - 认知画像缓存过期策略

3. **分析错误**:
   - 数据不足时的降级策略
   - 认知模型分析异常处理
   - 学习风格误判

---

### 4. realtime.service.ts (P2 - 中)

**文件路径**: `/packages/backend/src/services/realtime.service.ts`

#### 基本信息

- **代码行数**: 373 行
- **复杂度**: ⭐⭐⭐ (中)
- **依赖数量**: 3 个外部依赖
- **核心职责**: 实时事件发布-订阅系统（基于 EventEmitter）

#### 风险评估

**业务影响** (6/10):

- 支持实时学习进度推送
- SSE (Server-Sent Events) 通信
- 用户和会话级别的事件订阅
- 非核心功能，但影响用户体验

**技术复杂度** (6/10):

- EventEmitter 发布-订阅模式
- 订阅管理和索引维护
- 事件过滤和路由
- 自动清理过期订阅

**未测试的关键代码路径**:

1. **订阅管理** (150+ LOC)
   - `subscribe()`: 创建订阅（用户/会话索引）
   - `unsubscribe()`: 取消订阅（清理索引）
   - 订阅 ID 生成和管理

2. **事件分发** (150+ LOC)
   - `sendToUser()`: 发送给指定用户
   - `sendToSession()`: 发送给指定会话
   - `broadcast()`: 广播给所有订阅者
   - 事件类型过滤和会话过滤

3. **SSE 支持** (50+ LOC)
   - `formatSSEMessage()`: SSE 格式化
   - 消息 ID 管理

4. **清理机制** (20+ LOC)
   - `cleanupExpiredSubscriptions()`: 定期清理
   - 订阅过期检查（默认 24h TTL）

#### 潜在 Bug 风险点

1. **内存泄漏**:
   - 订阅未正确清理
   - EventEmitter 监听器堆积
   - 索引 Map 未释放

2. **并发问题**:
   - 并发订阅/取消订阅时的竞态
   - 事件分发时订阅列表变化
   - 清理定时器冲突

3. **事件丢失**:
   - 订阅创建前的事件丢失
   - 事件回调异常导致中断
   - 过滤逻辑错误

---

## 📋 第二部分：测试补充计划

### P0 服务测试计划（1 周内完成）

#### 1. learning-state.service.test.ts

**目标覆盖率**: 85%
**测试套件数量**: 12 个
**预计测试用例**: 60+

##### 测试套件结构

```typescript
describe('LearningStateService', () => {
  describe('学习状态管理', () => {
    it('应该获取单词学习状态（带缓存）');
    it('应该在缓存失效时查询数据库');
    it('应该正确更新学习状态并清除缓存');
    it('应该在事务中原子更新状态');
    it('应该批量获取学习状态（优化 N+1）');
    it('应该处理不存在的单词ID');
  });

  describe('分数计算与更新', () => {
    it('应该正确计算加权总分');
    it('应该更新各维度得分（accuracy, speed, stability, proficiency）');
    it('应该批量计算并更新得分');
    it('应该处理极端得分值（0, 100）');
  });

  describe('掌握度评估', () => {
    it('应该评估单词掌握度（集成 WordMasteryEvaluator）');
    it('应该根据 ACT-R 模型计算提取概率');
    it('应该追踪复习事件（WordMemoryTracker）');
    it('应该统计用户掌握度分布');
    it('应该识别掌握度阈值（isMastered）');
  });

  describe('到期复习词管理', () => {
    it('应该获取到期复习词列表');
    it('应该按优先级排序复习词');
    it('应该过滤已排除的单词ID');
    it('应该处理无到期复习词的情况');
  });

  describe('事件发布机制', () => {
    it('应该在单词掌握时发布 WORD_MASTERED 事件');
    it('应该在遗忘风险高时发布 FORGETTING_RISK 事件');
    it('应该在事件发布失败时记录错误');
    it('应该发布 USER_STATE_UPDATED 事件');
  });

  describe('缓存策略', () => {
    it('应该在更新后清除相关缓存');
    it('应该批量预热缓存');
    it('应该处理缓存穿透（null 值缓存）');
    it('应该设置正确的 TTL');
  });

  describe('批量操作优化', () => {
    it('应该批量查询避免 N+1');
    it('应该批量更新减少事务次数');
    it('应该并发处理独立操作');
  });

  describe('错误处理', () => {
    it('应该处理数据库连接失败');
    it('应该处理事务超时');
    it('应该处理 Prisma 唯一约束冲突');
    it('应该回退事务并恢复状态');
  });

  describe('用户统计', () => {
    it('应该统计用户学习状态分布');
    it('应该计算平均掌握度');
    it('应该统计需要复习的单词数');
  });

  describe('状态迁移', () => {
    it('应该正确处理 NEW → LEARNING 迁移');
    it('应该正确处理 LEARNING → REVIEWING 迁移');
    it('应该正确处理 REVIEWING → MASTERED 迁移');
    it('应该避免非法状态迁移');
  });

  describe('ACT-R 集成', () => {
    it('应该计算记忆激活度');
    it('应该预测复习间隔');
    it('应该追踪复习轨迹');
  });

  describe('性能测试', () => {
    it('应该在 100ms 内完成单次状态更新');
    it('应该在 500ms 内完成 100 个词的批量查询');
    it('应该在 1s 内完成掌握度统计');
  });
});
```

##### Mock 策略

```typescript
// 1. 数据库 Mock
vi.mock('../../../src/config/database', () => ({
  default: {
    wordLearningState: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    wordScore: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    answerRecord: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mockTx)),
  },
}));

// 2. 缓存 Mock
vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  CacheKeys: {
    /* ... */
  },
}));

// 3. EventBus Mock
vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => ({
    publish: vi.fn(),
  })),
}));

// 4. WordMasteryEvaluator Mock
vi.mock('../../../src/amas/rewards/evaluators', () => ({
  WordMasteryEvaluator: vi.fn(() => ({
    evaluate: vi.fn(),
  })),
}));

// 5. WordMemoryTracker Mock
vi.mock('../../../src/amas/tracking/word-memory-tracker', () => ({
  WordMemoryTracker: vi.fn(() => ({
    trackReview: vi.fn(),
    getMemoryState: vi.fn(),
  })),
}));
```

##### 测试数据准备

```typescript
// 标准测试数据
const mockUserId = 'user-123';
const mockWordId = 'word-456';

const mockWordLearningState = {
  id: 'state-1',
  userId: mockUserId,
  wordId: mockWordId,
  state: 'LEARNING',
  masteryLevel: 3,
  easeFactor: 2.5,
  reviewCount: 5,
  lastReviewDate: new Date('2025-12-10'),
  nextReviewDate: new Date('2025-12-15'),
  currentInterval: 5,
  consecutiveCorrect: 2,
  consecutiveWrong: 0,
  halfLife: 3.5,
};

const mockWordScore = {
  id: 'score-1',
  userId: mockUserId,
  wordId: mockWordId,
  totalScore: 75,
  accuracyScore: 80,
  speedScore: 70,
  stabilityScore: 75,
  proficiencyScore: 75,
  totalAttempts: 10,
  correctAttempts: 8,
};

const mockMasteryEvaluation = {
  isMastered: false,
  score: 0.75,
  confidence: 0.85,
  needsReview: false,
  recallProbability: 0.82,
  retention: 0.78,
};
```

##### 边界条件测试

```typescript
describe('边界条件', () => {
  it('应该处理首次学习（reviewCount = 0）', async () => {
    // 测试新用户首次学习时的状态初始化
  });

  it('应该处理极高掌握度（masteryLevel = 5, stability = 1.0）', async () => {
    // 测试已完全掌握的单词
  });

  it('应该处理极低掌握度（masteryLevel = 0, stability = 0）', async () => {
    // 测试完全未掌握的单词
  });

  it('应该处理空答题历史', async () => {
    // 测试无历史记录时的处理
  });

  it('应该处理大量答题记录（1000+）', async () => {
    // 测试性能和内存使用
  });

  it('应该处理并发状态更新', async () => {
    // 测试竞态条件和事务隔离
  });
});
```

##### 异常场景测试

```typescript
describe('异常场景', () => {
  it('应该处理数据库连接超时', async () => {
    prisma.wordLearningState.findUnique.mockRejectedValueOnce(new Error('Connection timeout'));
    // 应该抛出明确的错误或返回降级结果
  });

  it('应该处理事务死锁', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Deadlock', {
        code: 'P2034',
        clientVersion: '5.0.0',
      }),
    );
    // 应该重试或回滚
  });

  it('应该处理 EventBus 发布失败', async () => {
    eventBus.publish.mockRejectedValueOnce(new Error('Event bus down'));
    // 不应该影响主流程
  });

  it('应该处理缓存服务不可用', async () => {
    cacheService.get.mockRejectedValueOnce(new Error('Redis down'));
    // 应该降级到数据库查询
  });
});
```

---

#### 2. word-selection.service.test.ts

**目标覆盖率**: 85%
**测试套件数量**: 10 个
**预计测试用例**: 50+

##### 测试套件结构

```typescript
describe('WordSelectionService', () => {
  describe('策略路由', () => {
    it('应该根据 sessionType 选择正确策略');
    it('应该默认使用 normal 策略');
    it('应该处理未知的 sessionType');
  });

  describe('普通选词策略', () => {
    it('应该根据 AMAS new_ratio 分配新词/复习词');
    it('应该按 AMAS difficulty 过滤单词');
    it('应该在复习词不足时用新词补充');
    it('应该排除 excludeIds 中的单词');
    it('应该返回正确数量的单词');
  });

  describe('复习选词策略', () => {
    it('应该按紧急程度排序（urgency mode）');
    it('应该按难度优先排序（difficulty mode）');
    it('应该平衡排序（balanced mode）');
    it('应该计算正确的优先级分数');
    it('应该处理无到期复习词的情况');
  });

  describe('碎片时间选词策略', () => {
    it('应该根据 availableTimeMinutes 限制单词数');
    it('应该优先选择短词');
    it('应该集成 MicroSessionPolicy');
    it('应该转换为 WordCandidate 格式');
  });

  describe('难度计算', () => {
    it('应该正确映射 AMAS difficulty 到数值范围');
    it('应该基于得分计算单词难度');
    it('应该基于拼写和释义计算新词难度');
    it('应该处理极端难度值（0, 1）');
  });

  describe('优先级计算', () => {
    it('应该综合考虑逾期天数、错误率、得分');
    it('应该正确加权各因素');
    it('应该处理 null 得分');
  });

  describe('遗忘风险评估', () => {
    it('应该基于遗忘曲线计算风险');
    it('应该考虑复习次数加成');
    it('应该处理从未复习的单词');
  });

  describe('记忆强度计算', () => {
    it('应该综合复习次数和间隔');
    it('应该正确归一化到 [0, 1]');
  });

  describe('批量操作', () => {
    it('应该批量获取学习状态');
    it('应该批量获取得分');
    it('应该优化数据库查询次数');
  });

  describe('错误处理', () => {
    it('应该处理数据库查询失败');
    it('应该处理空词库');
    it('应该处理无效的 userId');
  });
});
```

##### Mock 策略

```typescript
// 1. AMAS Service Mock
vi.mock('../../../src/services/amas.service', () => ({
  amasService: {
    getCurrentStrategy: vi.fn(),
    getDefaultStrategy: vi.fn(() => ({
      interval_scale: 1.0,
      new_ratio: 0.3,
      difficulty: 'mid',
      batch_size: 10,
      hint_level: 1,
    })),
  },
}));

// 2. Study Config Service Mock
vi.mock('../../../src/services/study-config.service', () => ({
  default: {
    getUserStudyConfig: vi.fn(() => ({
      selectedWordBookIds: ['book-1', 'book-2'],
      studyMode: 'sequential',
    })),
  },
}));

// 3. Difficulty Cache Service Mock
vi.mock('../../../src/services/difficulty-cache.service', () => ({
  default: {
    getDifficulty: vi.fn(),
    setDifficulty: vi.fn(),
  },
}));

// 4. 遗忘曲线 Mock
vi.mock('../../../src/amas/models/forgetting-curve', () => ({
  calculateForgettingFactor: vi.fn((params) => 0.8),
}));

// 5. MicroSessionPolicy Mock
vi.mock('../../../src/amas/policies/micro-session-policy', () => ({
  MicroSessionPolicy: vi.fn(() => ({
    selectWords: vi.fn((candidates, context) => ({
      selectedWordIds: candidates.slice(0, context.targetCount).map((c) => c.wordId),
      reason: 'Micro session selection',
    })),
    setMaxWords: vi.fn(),
    getConfig: vi.fn(),
  })),
}));
```

##### 测试数据准备

```typescript
const mockStrategy = {
  interval_scale: 1.2,
  new_ratio: 0.3,
  difficulty: 'mid' as const,
  batch_size: 10,
  hint_level: 1,
};

const mockDueWords = [
  {
    id: 'word-1',
    spelling: 'hello',
    phonetic: '/həˈləʊ/',
    meanings: ['你好'],
    examples: ['Hello, world!'],
    audioUrl: null,
    difficulty: 0.3,
    isNew: false,
    priority: 25, // 高优先级（逾期）
  },
  {
    id: 'word-2',
    spelling: 'goodbye',
    phonetic: '/ɡʊdˈbaɪ/',
    meanings: ['再见'],
    examples: ['Goodbye!'],
    audioUrl: null,
    difficulty: 0.5,
    isNew: false,
    priority: 15,
  },
];

const mockNewWords = [
  {
    id: 'word-3',
    spelling: 'cat',
    phonetic: '/kæt/',
    meanings: ['猫'],
    examples: ['I have a cat.'],
    audioUrl: null,
    difficulty: 0.2,
    isNew: true,
  },
];
```

##### 边界条件测试

```typescript
describe('边界条件', () => {
  it('应该处理 new_ratio = 0（仅复习）', async () => {
    mockStrategy.new_ratio = 0;
    // 应该返回全部复习词
  });

  it('应该处理 new_ratio = 1（仅新词）', async () => {
    mockStrategy.new_ratio = 1;
    // 应该返回全部新词
  });

  it('应该处理空词库', async () => {
    prisma.word.findMany.mockResolvedValueOnce([]);
    // 应该返回空数组并记录警告
  });

  it('应该处理请求数量超过可用单词', async () => {
    // count = 100, 但只有 10 个可用词
    // 应该返回全部可用词
  });

  it('应该处理全部单词在 excludeIds 中', async () => {
    // 应该返回空数组
  });
});
```

##### 异常场景测试

```typescript
describe('异常场景', () => {
  it('应该处理 AMAS 策略获取失败', async () => {
    amasService.getCurrentStrategy.mockRejectedValueOnce(new Error('AMAS down'));
    // 应该使用默认策略
  });

  it('应该处理数据库查询超时', async () => {
    prisma.wordLearningState.findMany.mockRejectedValueOnce(new Error('Timeout'));
    // 应该抛出明确错误或返回降级结果
  });

  it('应该处理 MicroSessionPolicy 异常', async () => {
    microSessionPolicy.selectWords.mockImplementationOnce(() => {
      throw new Error('Policy error');
    });
    // 应该回退到简单选词
  });
});
```

---

### P1 服务测试计划（2-4 周完成）

#### 3. user-profile.service.test.ts

**目标覆盖率**: 80%
**测试套件数量**: 11 个
**预计测试用例**: 55+

##### 测试套件结构

```typescript
describe('UserProfileService', () => {
  describe('用户管理', () => {
    it('应该创建新用户（密码加密）');
    it('应该验证用户密码');
    it('应该更新用户信息');
    it('应该删除用户');
    it('应该处理重复用户名');
  });

  describe('习惯画像', () => {
    it('应该初始化习惯识别器');
    it('应该记录学习时间事件');
    it('应该累积习惯样本');
    it('应该持久化习惯画像');
    it('应该从数据库恢复习惯画像');
  });

  describe('时型画像', () => {
    it('应该分析用户学习时间偏好');
    it('应该识别早型/晚型时型');
    it('应该缓存时型画像');
    it('应该在数据不足时抛出 InsufficientDataError');
  });

  describe('学习风格画像', () => {
    it('应该分析学习风格倾向');
    it('应该识别视觉/听觉/动觉偏好');
    it('应该缓存学习风格画像');
  });

  describe('综合认知画像', () => {
    it('应该整合时型和学习风格');
    it('应该计算认知状态指标');
    it('应该处理部分数据缺失');
  });

  describe('学习档案', () => {
    it('应该创建学习档案');
    it('应该更新档案数据');
    it('应该聚合学习统计');
  });

  describe('事件发布', () => {
    it('应该在画像更新时发布 PROFILE_UPDATED 事件');
    it('应该在事件发布失败时记录错误');
  });

  describe('缓存管理', () => {
    it('应该缓存用户基础信息');
    it('应该缓存认知画像（6h TTL）');
    it('应该在更新后清除缓存');
  });

  describe('数据验证', () => {
    it('应该验证邮箱格式');
    it('应该验证密码强度');
    it('应该验证必填字段');
  });

  describe('安全性', () => {
    it('应该使用 bcrypt 加密密码');
    it('应该使用合适的盐轮次（10+）');
    it('应该不返回密码哈希');
  });

  describe('错误处理', () => {
    it('应该处理数据库连接失败');
    it('应该处理认知模型分析异常');
    it('应该处理缓存服务不可用');
  });
});
```

##### Mock 策略

```typescript
// 1. bcrypt Mock
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: vi.fn((password, hash) => Promise.resolve(hash === `hashed_${password}`)),
  },
}));

// 2. 认知模型 Mock
vi.mock('../../../src/amas/models/cognitive', () => ({
  HabitRecognizer: vi.fn(() => ({
    recordEvent: vi.fn(),
    getProfile: vi.fn(() => mockHabitProfile),
  })),
  ChronotypeDetector: vi.fn(() => ({
    analyze: vi.fn(() => mockChronotypeProfile),
  })),
  LearningStyleProfiler: vi.fn(() => ({
    analyze: vi.fn(() => mockLearningStyleProfile),
  })),
}));

// 3. EventBus Mock
vi.mock('../../../src/core/event-bus', () => ({
  getEventBus: vi.fn(() => ({
    publish: vi.fn(),
  })),
}));
```

##### 测试数据准备

```typescript
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hashed_password123',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-12-13'),
};

const mockHabitProfile = {
  preferredTimes: [9, 14, 20], // 9am, 2pm, 8pm
  avgSessionDuration: 25, // 25 minutes
  consistency: 0.75,
  samples: {
    timeEvents: 50,
    durationEvents: 30,
  },
};

const mockChronotypeProfile = {
  type: 'evening' as const,
  confidence: 0.85,
  peakHours: [20, 21, 22],
  troughHours: [6, 7, 8],
};

const mockLearningStyleProfile = {
  visual: 0.6,
  auditory: 0.3,
  kinesthetic: 0.1,
  dominant: 'visual' as const,
  confidence: 0.78,
};
```

---

### P2 服务测试计划（持续改进）

#### 4. realtime.service.test.ts

**目标覆盖率**: 75%
**测试套件数量**: 8 个
**预计测试用例**: 40+

##### 测试套件结构

```typescript
describe('RealtimeService', () => {
  describe('订阅管理', () => {
    it('应该创建新订阅');
    it('应该生成唯一订阅 ID');
    it('应该建立用户索引');
    it('应该建立会话索引');
    it('应该返回取消订阅函数');
    it('应该正确取消订阅');
  });

  describe('事件分发', () => {
    it('应该发送事件给指定用户');
    it('应该发送事件给指定会话');
    it('应该广播事件给所有订阅者');
    it('应该过滤事件类型');
    it('应该过滤会话');
  });

  describe('SSE 格式化', () => {
    it('应该格式化 SSE 消息');
    it('应该包含事件类型');
    it('应该包含消息 ID');
    it('应该以空行结尾');
  });

  describe('清理机制', () => {
    it('应该定期清理过期订阅');
    it('应该正确计算订阅过期时间');
    it('应该清除过期订阅的索引');
  });

  describe('统计信息', () => {
    it('应该返回订阅统计');
    it('应该统计活跃用户数');
    it('应该统计活跃会话数');
  });

  describe('并发控制', () => {
    it('应该处理并发订阅');
    it('应该处理并发取消订阅');
    it('应该处理事件分发时的订阅变化');
  });

  describe('错误处理', () => {
    it('应该捕获回调异常');
    it('应该继续分发后续事件');
    it('应该记录错误日志');
  });

  describe('关闭流程', () => {
    it('应该清理所有订阅');
    it('应该停止清理定时器');
    it('应该清除所有索引');
  });
});
```

---

## 🎯 第三部分：测试模板和示例

### 完整测试套件示例：amas.service.test.ts (参考现有)

```typescript
/**
 * AMAS Service 完整测试套件
 *
 * 展示：
 * - Mock 依赖管理
 * - 异步逻辑测试
 * - 复杂业务流程测试
 * - 错误处理和边界条件
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { amasService } from '../../../src/services/amas.service';
import prisma from '../../../src/config/database';
import { cacheService } from '../../../src/services/cache.service';

// ============ Mock 配置 ============
vi.mock('../../../src/config/database');
vi.mock('../../../src/services/cache.service');
vi.mock('../../../src/services/delayed-reward.service');

describe('AMASService - processLearningEvent', () => {
  const mockUserId = 'user-123';
  const mockSessionId = 'session-456';

  beforeEach(() => {
    vi.clearAllMocks();

    // 配置常见 mock 返回值
    prisma.answerRecord.create.mockResolvedValue({
      id: 'answer-1',
      userId: mockUserId,
      wordId: 'word-1',
      isCorrect: true,
      responseTime: 2000,
      timestamp: new Date(),
    });

    cacheService.get.mockResolvedValue(null);
  });

  describe('基础流程', () => {
    it('应该处理正确答题事件', async () => {
      const event = {
        wordId: 'word-1',
        isCorrect: true,
        responseTime: 2000,
        dwellTime: 1500,
      };

      const result = await amasService.processLearningEvent(mockUserId, event, mockSessionId);

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.reward).toBeTypeOf('number');
    });

    it('应该处理错误答题事件', async () => {
      const event = {
        wordId: 'word-1',
        isCorrect: false,
        responseTime: 5000,
      };

      const result = await amasService.processLearningEvent(mockUserId, event);

      expect(result.reward).toBeLessThan(0);
    });
  });

  describe('答题记录存储', () => {
    it('应该创建答题记录', async () => {
      const event = {
        wordId: 'word-1',
        isCorrect: true,
        responseTime: 2000,
      };

      await amasService.processLearningEvent(mockUserId, event, mockSessionId);

      expect(prisma.answerRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            wordId: 'word-1',
            isCorrect: true,
            sessionId: mockSessionId,
          }),
        }),
      );
    });

    it('应该处理重复答题记录', async () => {
      // Mock 唯一约束冲突
      prisma.answerRecord.create.mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['userId', 'wordId', 'timestamp'] },
      });

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };

      // 不应该抛出错误
      await expect(amasService.processLearningEvent(mockUserId, event)).resolves.toBeDefined();
    });
  });

  describe('学习状态更新', () => {
    it('应该更新单词学习状态', async () => {
      const mockTx = {
        wordLearningState: {
          upsert: vi.fn().mockResolvedValue({
            id: 'state-1',
            userId: mockUserId,
            wordId: 'word-1',
            masteryLevel: 3,
            reviewCount: 5,
          }),
          update: vi.fn(),
          findUnique: vi.fn().mockResolvedValue({ halfLife: 2.5 }),
        },
        wordScore: {
          upsert: vi.fn(),
        },
        answerRecord: {
          groupBy: vi.fn().mockResolvedValue([
            { isCorrect: true, _count: { id: 8 } },
            { isCorrect: false, _count: { id: 2 } },
          ]),
        },
      };

      prisma.$transaction.mockImplementationOnce((callback) => callback(mockTx));

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event);

      expect(mockTx.wordLearningState.upsert).toHaveBeenCalled();
      expect(mockTx.wordScore.upsert).toHaveBeenCalled();
    });

    it('应该正确计算掌握等级', async () => {
      // 测试掌握等级映射逻辑
      // mem=0.9, stability=0.85, speed=0.8
      // blended = 0.6*0.9 + 0.3*0.85 + 0.1*0.8 = 0.875
      // 应该映射到 masteryLevel = 4
      // 实现具体测试...
    });
  });

  describe('延迟奖励', () => {
    it('应该计算正确的到期时间', async () => {
      prisma.wordLearningState.findUnique.mockResolvedValueOnce({
        nextReviewDate: new Date('2025-12-15'),
        currentInterval: 5,
      });

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event);

      // 验证 delayedRewardService.enqueueDelayedReward 被调用
      // 并且 dueTs 基于 nextReviewDate
    });

    it('应该使用默认延迟时间（无学习状态）', async () => {
      prisma.wordLearningState.findUnique.mockResolvedValueOnce(null);

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event);

      // 验证使用默认 24h 延迟
    });
  });

  describe('特征向量持久化', () => {
    it('应该持久化特征向量', async () => {
      prisma.featureVector.upsert.mockResolvedValueOnce({
        id: 'fv-1',
        answerRecordId: 'answer-1',
        sessionId: mockSessionId,
      });

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      const result = await amasService.processLearningEvent(mockUserId, event, mockSessionId);

      expect(result.featureVector).toBeDefined();
      expect(prisma.featureVector.upsert).toHaveBeenCalled();
    });

    it('应该在 sessionId 缺失时跳过持久化', async () => {
      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event); // 无 sessionId

      expect(prisma.featureVector.upsert).not.toHaveBeenCalled();
    });
  });

  describe('缓存管理', () => {
    it('应该在更新后清除相关缓存', async () => {
      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event);

      expect(cacheService.delete).toHaveBeenCalledWith(expect.stringContaining('user-123:word-1'));
    });
  });

  describe('错误处理', () => {
    it('应该处理数据库事务失败', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('Transaction failed'));

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };

      // 主流程不应该因为状态更新失败而中断
      await expect(amasService.processLearningEvent(mockUserId, event)).resolves.toBeDefined();
    });

    it('应该处理缓存服务异常', async () => {
      cacheService.get.mockRejectedValueOnce(new Error('Redis down'));

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };

      // 应该降级到无缓存模式
      await expect(amasService.processLearningEvent(mockUserId, event)).resolves.toBeDefined();
    });
  });

  describe('性能测试', () => {
    it('应该在 200ms 内完成单次事件处理', async () => {
      const start = Date.now();

      const event = { wordId: 'word-1', isCorrect: true, responseTime: 2000 };
      await amasService.processLearningEvent(mockUserId, event, mockSessionId);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });
});
```

---

## 📅 第四部分：实施时间表

### Week 1（2025-12-16 ~ 2025-12-22）

**目标**: 完成 P0 服务测试

- **Day 1-2**: `learning-state.service.test.ts`
  - 学习状态管理 (6h)
  - 分数计算 (4h)

- **Day 3-4**: `learning-state.service.test.ts` (续)
  - 掌握度评估 (6h)
  - 事件发布和缓存 (4h)

- **Day 5-7**: `word-selection.service.test.ts`
  - 策略路由和普通选词 (6h)
  - 复习选词和碎片时间选词 (6h)
  - 难度计算和优先级 (6h)

**交付物**:

- 2 个完整测试文件
- 110+ 测试用例
- 覆盖率报告

---

### Week 2-4（2025-12-23 ~ 2026-01-12）

**目标**: 完成 P1 服务测试

- **Week 2**: `user-profile.service.test.ts`
  - 用户管理和认证 (12h)
  - 习惯画像和时型画像 (8h)

- **Week 3**: `user-profile.service.test.ts` (续)
  - 学习风格和综合认知画像 (8h)
  - 安全性和错误处理 (6h)
  - 代码审查和重构 (6h)

- **Week 4**: 测试优化和文档
  - 性能测试 (4h)
  - 边界条件补充 (4h)
  - 测试文档编写 (4h)
  - 代码覆盖率优化 (8h)

**交付物**:

- 1 个完整测试文件
- 55+ 测试用例
- 测试最佳实践文档

---

### Week 5+（2026-01-13 ~）

**目标**: 完成 P2 服务测试和持续改进

- **Week 5**: `realtime.service.test.ts`
  - 订阅管理 (6h)
  - 事件分发和 SSE (6h)
  - 清理机制和错误处理 (4h)

- **持续改进**:
  - 补充边界条件测试
  - 提升覆盖率到 80%+
  - 性能基准测试
  - 集成测试增强

**交付物**:

- 1 个完整测试文件
- 40+ 测试用例
- 性能基准报告

---

## 📈 第五部分：覆盖率目标和工作量估算

### 覆盖率目标

| 阶段               | 目标覆盖率 | 当前覆盖率 | 增量     | 新增测试用例  |
| ------------------ | ---------- | ---------- | -------- | ------------- |
| **Phase 0 (当前)** | 68%        | 68%        | -        | 37 个文件     |
| **Phase 1 (P0)**   | 78%        | 68%        | +10%     | +110 用例     |
| **Phase 2 (P1)**   | 82%        | 78%        | +4%      | +55 用例      |
| **Phase 3 (P2)**   | 85%        | 82%        | +3%      | +40 用例      |
| **最终目标**       | **85%+**   | -          | **+17%** | **+205 用例** |

### 工作量估算

#### 按服务拆分

| 服务                       | 代码行数  | 测试用例 | 编码时间 | 调试时间 | 总时间   |
| -------------------------- | --------- | -------- | -------- | -------- | -------- |
| **learning-state.service** | 1,354     | 60       | 24h      | 8h       | **32h**  |
| **word-selection.service** | 770       | 50       | 18h      | 6h       | **24h**  |
| **user-profile.service**   | 1,047     | 55       | 20h      | 7h       | **27h**  |
| **realtime.service**       | 373       | 40       | 16h      | 4h       | **20h**  |
| **总计**                   | **3,544** | **205**  | **78h**  | **25h**  | **103h** |

#### 按阶段拆分

| 阶段             | 时间跨度 | 工作量   | 人力      | 关键里程碑                               |
| ---------------- | -------- | -------- | --------- | ---------------------------------------- |
| **Phase 1 (P0)** | 1 周     | 56h      | 1.5人     | learning-state + word-selection 测试完成 |
| **Phase 2 (P1)** | 3 周     | 27h      | 0.5人     | user-profile 测试完成                    |
| **Phase 3 (P2)** | 1 周+    | 20h      | 0.5人     | realtime 测试完成，覆盖率 85%+           |
| **总计**         | **5 周** | **103h** | **1.5人** | 4 个服务测试完成                         |

### 达到 80% 覆盖率所需工作量

**核心结论**:

- **Phase 1 完成后** 即可达到 **78% 覆盖率**
- **Phase 2 完成后** 可达到 **82% 覆盖率**（超过 80% 目标）
- **总工作量**: 约 **83 小时**（Phase 1 + Phase 2 前半段）
- **时间跨度**: 约 **3 周**（1 人全职）

---

## 🎓 第六部分：测试最佳实践

### 1. Mock 策略最佳实践

**原则**: 只 Mock 外部依赖，不 Mock 被测试单元的内部逻辑

```typescript
// ✅ 好的做法：Mock 数据库和外部服务
vi.mock('../../../src/config/database');
vi.mock('../../../src/services/cache.service');

// ❌ 坏的做法：Mock 被测试服务的内部方法
vi.spyOn(service, 'privateMethod');
```

### 2. 测试数据管理

**使用 Factory 模式**:

```typescript
// tests/factories/user.factory.ts
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  createdAt: new Date(),
  ...overrides,
});

// 使用
const user = createMockUser({ username: 'customuser' });
```

### 3. 异步测试

**处理 Promise 和 async/await**:

```typescript
// ✅ 好的做法
it('应该异步处理事件', async () => {
  const result = await service.processEvent(event);
  expect(result).toBeDefined();
});

// ❌ 坏的做法：忘记 await
it('应该异步处理事件', () => {
  const result = service.processEvent(event); // 返回 Promise，未等待
  expect(result).toBeDefined(); // 测试 Promise 对象，而非结果
});
```

### 4. 错误处理测试

**使用 toThrow 和 rejects**:

```typescript
// 同步错误
it('应该抛出错误', () => {
  expect(() => service.invalidMethod()).toThrow('Error message');
});

// 异步错误
it('应该拒绝 Promise', async () => {
  await expect(service.asyncMethod()).rejects.toThrow('Error message');
});
```

### 5. 测试隔离

**每个测试应该独立**:

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // 清除所有 mock 调用历史
  // 重置测试数据
});

afterEach(() => {
  vi.restoreAllMocks(); // 恢复所有 mock
});
```

### 6. 测试覆盖率指标

**不同类型代码的覆盖率目标**:

| 代码类型     | 目标覆盖率 | 说明                 |
| ------------ | ---------- | -------------------- |
| 核心业务逻辑 | 90%+       | AMAS、选词、状态管理 |
| 辅助工具函数 | 85%+       | 计算、转换、验证     |
| 错误处理     | 80%+       | try-catch、边界条件  |
| 接口适配层   | 75%+       | 数据转换、格式化     |
| UI 相关代码  | 60%+       | 展示逻辑、格式化     |

---

## 🚀 第七部分：快速启动指南

### 1. 环境准备

```bash
# 安装依赖
cd packages/backend
npm install

# 运行现有测试（验证环境）
npm run test

# 生成覆盖率报告
npm run test:coverage
```

### 2. 创建测试文件

```bash
# 使用模板创建新测试文件
cp tests/unit/services/amas.service.test.ts \
   tests/unit/services/learning-state.service.test.ts

# 编辑测试文件
code tests/unit/services/learning-state.service.test.ts
```

### 3. 运行单个测试文件

```bash
# 运行特定测试文件
npm run test -- learning-state.service.test.ts

# 监听模式（开发时使用）
npm run test -- --watch learning-state.service.test.ts
```

### 4. 调试测试

```typescript
// 在测试中添加调试信息
it('应该处理事件', async () => {
  console.log('测试开始');
  const result = await service.processEvent(event);
  console.log('结果:', result);
  expect(result).toBeDefined();
});
```

### 5. 查看覆盖率

```bash
# 生成覆盖率报告
npm run test:coverage

# 在浏览器中查看详细报告
open coverage/index.html
```

---

## 📝 第八部分：技术债务评估

### 技术债务规模

| 维度         | 评分 | 说明                               |
| ------------ | ---- | ---------------------------------- |
| **规模**     | 8/10 | 4,053 行未测试代码                 |
| **复杂度**   | 9/10 | 涉及事务、缓存、事件总线、认知模型 |
| **关键性**   | 9/10 | 核心业务流程依赖这些服务           |
| **技术风险** | 8/10 | 并发、数据一致性、性能问题         |
| **业务风险** | 9/10 | 直接影响学习体验和数据准确性       |

**综合评估**: **高风险技术债务** (43/50)

### 债务来源分析

1. **历史原因** (40%):
   - 早期快速迭代，测试被延后
   - 服务重构后测试未同步更新

2. **复杂度** (35%):
   - 服务间依赖复杂，Mock 难度高
   - 集成外部模型（ACT-R、AMAS）

3. **资源限制** (25%):
   - 开发人力不足
   - 优先级倾向新功能开发

### 债务偿还策略

1. **渐进式偿还**:
   - 优先 P0 服务（风险最高）
   - 并行进行新功能测试

2. **重构与测试结合**:
   - 在重构时补充测试
   - 通过测试驱动重构（TDD）

3. **自动化保障**:
   - CI/CD 强制覆盖率阈值
   - PR 必须包含测试

---

## ✅ 执行检查清单

### Phase 1 完成标准

- [ ] `learning-state.service.test.ts` 完成（60+ 用例）
- [ ] `word-selection.service.test.ts` 完成（50+ 用例）
- [ ] 所有测试通过（绿色）
- [ ] 覆盖率达到 78%+
- [ ] 代码审查通过
- [ ] 文档更新

### Phase 2 完成标准

- [ ] `user-profile.service.test.ts` 完成（55+ 用例）
- [ ] 所有测试通过
- [ ] 覆盖率达到 82%+
- [ ] 性能测试通过
- [ ] 安全性测试通过

### Phase 3 完成标准

- [ ] `realtime.service.test.ts` 完成（40+ 用例）
- [ ] 所有测试通过
- [ ] 覆盖率达到 85%+
- [ ] 内存泄漏测试通过
- [ ] 并发测试通过

---

## 📚 附录

### A. 相关资源

- **Vitest 文档**: https://vitest.dev/
- **Testing Library**: https://testing-library.com/
- **测试金字塔**: https://martinfowler.com/articles/practical-test-pyramid.html
- **TDD 实践**: https://testdriven.io/

### B. 联系方式

- **技术负责人**: [待补充]
- **测试工程师**: [待补充]
- **Slack 频道**: #testing

### C. 变更日志

| 日期       | 版本 | 变更说明               |
| ---------- | ---- | ---------------------- |
| 2025-12-13 | v1.0 | 初始版本，完成深度分析 |

---

**最后更新**: 2025-12-13
**文档维护**: Backend Team
**下次审查**: 2026-01-13 (Phase 1 完成后)
