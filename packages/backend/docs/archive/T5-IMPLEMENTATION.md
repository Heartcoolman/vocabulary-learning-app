# AMAS 后端重构 - T5.3 & T5.4 实现文档

## 概述

本次重构实现了两个关键模块：

1. **T5.3 心流检测器 (FlowDetector)** - 检测用户的心流状态并提供策略调整建议
2. **T5.4 碎片时间适配策略 (MicroSessionPolicy)** - 为碎片时间场景优化单词选择

## 一、心流检测器 (FlowDetector)

### 文件位置

```
packages/backend/src/amas/models/flow-detector.ts
```

### 核心功能

心流检测器基于心流理论（Flow Theory），通过分析用户状态和学习事件来评估学习体验质量。

#### 1. 心流状态分类

- **flow（心流）**: 分数 > 0.7，最佳学习状态
- **anxiety（焦虑）**: 成功率 < 65%，难度过高
- **boredom（无聊）**: 成功率 > 80%，难度过低
- **normal（正常）**: 其他情况

#### 2. 评分机制

```typescript
心流分数 = 成功率因子 × 稳定性因子 × 状态因子
```

**成功率因子**:

- 目标区间: 65%-80%
- 在区间内得分最高（0.8-1.0）
- 偏离区间越远得分越低

**稳定性因子**:

- 基于反应时间的变异系数（CV）
- CV < 0.3: 高稳定性，得1分
- CV 越大表示越不稳定

**状态因子**:

- 结合注意力（60%权重）和动机（40%权重）
- 两者越高，心流可能性越大

#### 3. 策略建议

系统根据检测结果自动生成个性化建议：

- 心流状态 → 保持当前难度
- 焦虑状态 → 降低难度或增加提示
- 无聊状态 → 增加难度或减少提示
- 正常状态 → 微调建议

### 使用示例

```typescript
import { FlowDetector } from './amas/models/flow-detector';
import { UserState, RawEvent } from './amas/types';

const flowDetector = new FlowDetector();

// 用户当前状态
const userState: UserState = {
  A: 0.8,  // 注意力
  F: 0.3,  // 疲劳度
  M: 0.6,  // 动机
  C: { mem: 0.7, speed: 0.8, stability: 0.75 },
  conf: 0.85,
  ts: Date.now()
};

// 最近10-20个学习事件
const recentEvents: RawEvent[] = [...];

// 检测心流状态
const flowState = flowDetector.detectFlow(userState, recentEvents);

console.log(`心流分数: ${flowState.score}`);
console.log(`状态: ${flowState.state}`);
console.log(`建议: ${flowState.recommendation}`);
```

### API 参考

#### `detectFlow(state, recentEvents): FlowState`

检测心流状态。

**参数**:

- `state: UserState` - 用户当前状态
- `recentEvents: RawEvent[]` - 最近的学习事件（建议10-20个）

**返回**:

```typescript
interface FlowState {
  score: number; // 心流分数 [0,1]
  state: 'flow' | 'anxiety' | 'boredom' | 'normal';
  recommendation: string; // 策略调整建议
}
```

#### `detectFlowTimeSeries(state, allEvents, windowSize): FlowState[]`

批量检测多个时间窗口的心流状态，用于分析趋势。

#### `setTargetSuccessRate(min, max): void`

自定义目标成功率区间（默认65%-80%）。

#### `setFlowThresholds(high, medium, low): void`

自定义心流分数阈值。

---

## 二、碎片时间适配策略 (MicroSessionPolicy)

### 文件位置

```
packages/backend/src/amas/policies/micro-session-policy.ts
packages/backend/src/amas/policies/word-selector.interface.ts
```

### 核心功能

碎片时间适配策略专门为5-10分钟的短时学习场景设计，通过智能选词最大化学习效率。

#### 1. 设计原则

- **优先短词**: 减少认知负担，快速完成
- **优先高遗忘风险词**: 最大化复习收益
- **限制数量**: 默认最多5个词，避免认知过载

#### 2. 评分公式

```typescript
优先级分数 = 遗忘风险 × 0.5 + 短词奖励 × 0.3 + 记忆薄弱度 × 0.2
```

**遗忘风险** (0.5权重):

- 基于最后复习时间和复习次数
- 未学习过的词风险最高

**短词奖励** (0.3权重):

- 长度 ≤ 8: 满分（1.0）
- 长度 9-12: 线性递减（0.75-0.25）
- 长度 > 12: 低分（< 0.25）

**记忆薄弱度** (0.2权重):

- 基于记忆强度或复习次数
- 越薄弱越需要复习

### 接口设计

#### IWordSelector 接口

所有选词策略的统一接口：

```typescript
interface IWordSelector {
  selectWords(
    candidates: WordCandidate[],
    context: SelectionContext,
  ): Promise<SelectionResult> | SelectionResult;

  getName(): string;
}
```

#### 类型定义

```typescript
interface WordCandidate {
  wordId: string;
  length?: number; // 单词长度
  difficulty?: 'easy' | 'mid' | 'hard';
  forgettingRisk?: number; // 遗忘风险 [0,1]
  lastReviewTime?: number; // 最后复习时间
  reviewCount?: number; // 复习次数
  memoryStrength?: number; // 记忆强度 [0,1]
  priorityScore?: number; // 预计算优先级
}

interface SelectionContext {
  userId: string;
  availableTimeMinutes?: number;
  isMicroSession?: boolean;
  targetCount?: number;
  timestamp?: number;
  fatigue?: number;
  attention?: number;
}

interface SelectionResult {
  selectedWordIds: string[]; // 按优先级排序
  reason?: string; // 选词理由
  scores?: Map<string, number>; // 每个词的分数
}
```

### 使用示例

```typescript
import { MicroSessionPolicy } from './amas/policies/micro-session-policy';
import { WordCandidate, SelectionContext } from './amas/policies/word-selector.interface';

// 创建策略实例（最多选5个词）
const policy = new MicroSessionPolicy(5);

// 准备候选单词
const candidates: WordCandidate[] = [
  {
    wordId: 'word1',
    length: 5,
    forgettingRisk: 0.8,
    reviewCount: 1,
    memoryStrength: 0.3,
  },
  // ... 更多候选词
];

// 选词上下文
const context: SelectionContext = {
  userId: 'user123',
  availableTimeMinutes: 5,
  isMicroSession: true,
  targetCount: 5,
  timestamp: Date.now(),
};

// 执行选词
const result = policy.selectWords(candidates, context);

console.log('选中的单词:', result.selectedWordIds);
console.log('选词理由:', result.reason);

// 查看每个词的优先级分数
result.selectedWordIds.forEach((wordId) => {
  const score = result.scores?.get(wordId);
  console.log(`${wordId}: ${score}`);
});
```

### API 参考

#### `selectWords(candidates, context): SelectionResult`

选择最适合碎片时间学习的单词。

#### `scoreAll(candidates, context): Array<ScoreDetail>`

为所有候选词评分，用于调试和分析：

```typescript
const allScores = policy.scoreAll(candidates, context);
allScores.forEach((item) => {
  console.log(`${item.wordId}:`);
  console.log(`  总分: ${item.score}`);
  console.log(`  遗忘风险: ${item.details.forgettingRisk}`);
  console.log(`  短词奖励: ${item.details.shortWordBonus}`);
  console.log(`  记忆薄弱度: ${item.details.memoryWeakness}`);
});
```

#### `setMaxWords(maxWords): void`

动态调整最大单词数量（1-10范围）。

#### `getConfig(): ConfigObject`

获取当前配置（权重、阈值等）。

---

## 三、集成指南

### 1. 在 AMAS 引擎中使用心流检测

```typescript
import { defaultFlowDetector } from './amas/models/flow-detector';

// 在学习会话中定期检测
const flowState = defaultFlowDetector.detectFlow(
  currentUserState,
  recentEvents.slice(-15), // 最近15个事件
);

// 根据心流状态调整策略
if (flowState.state === 'anxiety') {
  // 降低难度
  adjustDifficulty('easier');
} else if (flowState.state === 'boredom') {
  // 增加难度
  adjustDifficulty('harder');
}
```

### 2. 在选词服务中使用碎片时间策略

```typescript
import { createMicroSessionPolicy } from './amas/policies/micro-session-policy';

// 检测是否为碎片时间场景
const isMicroSession = availableTimeMinutes <= 10;

if (isMicroSession) {
  const policy = createMicroSessionPolicy(5);
  const result = policy.selectWords(allCandidates, {
    userId,
    availableTimeMinutes,
    isMicroSession: true,
    targetCount: 5,
    timestamp: Date.now(),
  });

  return result.selectedWordIds;
} else {
  // 使用其他策略
  return regularWordSelection(allCandidates);
}
```

### 3. 扩展自定义策略

实现 `IWordSelector` 接口创建新策略：

```typescript
import { BaseWordSelector } from './amas/policies/word-selector.interface';

class CustomPolicy extends BaseWordSelector {
  constructor() {
    super('CustomPolicy');
  }

  selectWords(candidates, context) {
    // 自定义选词逻辑
    return {
      selectedWordIds: [...],
      reason: '自定义策略选词'
    };
  }
}
```

---

## 四、测试与验证

### 运行示例代码

```bash
cd packages/backend
npx ts-node src/amas/policies/usage-examples.ts
```

### 类型检查

```bash
npx tsc --noEmit src/amas/models/flow-detector.ts
npx tsc --noEmit src/amas/policies/micro-session-policy.ts
```

### 单元测试（TODO）

建议为以下场景编写测试：

**FlowDetector**:

- ✓ 不同成功率下的状态分类
- ✓ 反应时间稳定性对分数的影响
- ✓ 用户状态（注意力、动机）对分数的影响
- ✓ 边界条件（样本不足、极端值）

**MicroSessionPolicy**:

- ✓ 短词优先排序
- ✓ 高遗忘风险词优先
- ✓ 数量限制
- ✓ 评分权重验证
- ✓ 候选词不足的处理

---

## 五、配置与调优

### 心流检测器调优

```typescript
const flowDetector = new FlowDetector();

// 调整目标成功率区间（适应不同难度偏好）
flowDetector.setTargetSuccessRate(0.6, 0.75); // 更宽松
flowDetector.setTargetSuccessRate(0.7, 0.85); // 更严格

// 调整心流阈值
flowDetector.setFlowThresholds(0.75, 0.5, 0.25);
```

### 碎片时间策略调优

```typescript
const policy = new MicroSessionPolicy(3); // 减少到3个词

// 或动态调整
if (userFatigue > 0.7) {
  policy.setMaxWords(3); // 疲劳时减少
} else {
  policy.setMaxWords(5); // 精力充沛时正常
}
```

---

## 六、性能考虑

### FlowDetector

- **时间复杂度**: O(n)，n = 事件数量
- **空间复杂度**: O(1)
- **建议**: 使用最近10-20个事件，无需全部历史

### MicroSessionPolicy

- **时间复杂度**: O(n log n)，n = 候选词数量（排序）
- **空间复杂度**: O(n)
- **建议**: 预先过滤候选词，控制在100个以内

---

## 七、未来扩展

### 心流检测器

- [ ] 支持长期心流趋势分析
- [ ] 集成机器学习模型微调阈值
- [ ] 多维度心流可视化

### 碎片时间策略

- [ ] 基于用户历史偏好的权重自适应
- [ ] 结合时间段（通勤、午休）的场景识别
- [ ] 支持协作过滤推荐

---

## 八、相关文档

- [AMAS 核心类型定义](../types.ts)
- [AMAS 建模层](../modeling/)
- [策略注册表](./policy-registry.ts)
- [使用示例](./usage-examples.ts)

---

**实现完成日期**: 2025-12-12
**实现者**: Claude (后端重构代理)
**任务编号**: T5.3, T5.4
