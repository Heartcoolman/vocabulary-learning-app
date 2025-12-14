# AMAS 离线回放测试框架

## 概述

AMAS 离线回放测试框架 (T0.2) 提供了一个完整的系统来回放历史答题记录，分析决策质量，对比不同策略版本的效果。

## 核心功能

### 1. 离线回放

- **输入**: AnswerRecord 序列 + 策略版本标识
- **输出**: 决策序列 + 奖励序列 + 状态变化轨迹
- **用途**: 重建学习过程，验证算法一致性

### 2. 策略对比

- **对比维度**:
  - 奖励指标：平均奖励、总奖励、奖励标准差
  - 性能指标：决策延迟、P95延迟
  - 稳定性指标：状态方差（注意力、疲劳、动机）
  - 决策差异：逐步对比不同策略的选择
- **显著性检验**: 使用 Cohen's d 效应量判断差异显著性

### 3. 指标分析

- 奖励统计：均值、标准差、累计值
- 延迟统计：平均延迟、P95延迟
- 状态稳定性：注意力、疲劳、动机的方差
- 最终状态：回放结束时的用户状态

## 使用示例

### 基础回放

```typescript
import { AMASReplayEngine } from './amas-replay.test';

const replayEngine = new AMASReplayEngine();

// 构造回放会话
const session: ReplaySession = {
  userId: 'user-123',
  sessionId: 'session-456',
  strategyVersion: 'v1.0',
  answerRecords: [
    {
      id: 'record-1',
      wordId: 'word-1',
      isCorrect: true,
      responseTime: 2000,
      timestamp: Date.now(),
      // 可选的上下文信息
      dwellTime: 2500,
      pauseCount: 1,
      focusLossDuration: 200,
    },
    // ... 更多答题记录
  ],
  // 可选：设置初始状态
  initialState: {
    A: 0.8, // 注意力
    F: 0.2, // 疲劳
    M: 0.7, // 动机
    C: { mem: 0.75, speed: 0.7, stability: 0.8 },
    conf: 0.8,
    ts: Date.now() - 60000,
  },
};

// 执行回放
const result = await replayEngine.replaySession(session);

console.log('回放结果:', {
  totalSteps: result.totalSteps,
  successfulSteps: result.successfulSteps,
  avgReward: result.metrics.avgReward,
  totalReward: result.metrics.totalReward,
  avgLatency: result.metrics.avgLatency,
  finalState: result.metrics.finalState,
});
```

### 策略对比

```typescript
// 对比两个策略版本
const comparisonReport = await replayEngine.compareStrategies(
  session,
  'baseline-v1.0', // 基线版本
  'candidate-v1.1', // 候选版本
);

console.log('策略对比报告:');
console.log('奖励提升:', {
  baseline: comparisonReport.rewardComparison.baselineAvg,
  candidate: comparisonReport.rewardComparison.candidateAvg,
  improvement: comparisonReport.rewardComparison.improvement,
  improvementPercent: comparisonReport.rewardComparison.improvementPercent,
  isSignificant: comparisonReport.rewardComparison.significantDifference,
});

console.log('决策差异数量:', comparisonReport.decisionDifferences.length);

// 分析具体的决策差异
comparisonReport.decisionDifferences.forEach((diff) => {
  console.log(`第 ${diff.step} 步:`, {
    baselineReward: diff.baseline.reward,
    candidateReward: diff.candidate.reward,
    rewardDelta: diff.rewardDelta,
    baselineAction: diff.baseline.action,
    candidateAction: diff.candidate.action,
  });
});
```

### 批量回放测试

```typescript
// 从数据库加载历史会话
const sessions = await loadHistoricalSessions(userId, { limit: 100 });

// 批量回放
const results = [];
for (const session of sessions) {
  const result = await replayEngine.replaySession(session);
  results.push(result);

  // 重置引擎（如需独立回放）
  await replayEngine.reset();
}

// 聚合分析
const aggregatedMetrics = {
  avgReward: results.reduce((sum, r) => sum + r.metrics.avgReward, 0) / results.length,
  avgLatency: results.reduce((sum, r) => sum + r.metrics.avgLatency, 0) / results.length,
  totalSteps: results.reduce((sum, r) => sum + r.totalSteps, 0),
  successRate:
    results.reduce((sum, r) => sum + r.successfulSteps, 0) /
    results.reduce((sum, r) => sum + r.totalSteps, 0),
};

console.log('批量回放结果:', aggregatedMetrics);
```

## 核心类型

### ReplaySession

```typescript
interface ReplaySession {
  userId: string;
  sessionId: string;
  answerRecords: AnswerRecordWithContext[];
  initialState?: UserState;
  strategyVersion?: string;
}
```

### AnswerRecordWithContext

```typescript
interface AnswerRecordWithContext {
  id: string;
  wordId: string;
  isCorrect: boolean;
  responseTime: number;
  timestamp: number;
  dwellTime?: number;
  pauseCount?: number;
  switchCount?: number;
  retryCount?: number;
  focusLossDuration?: number;
  interactionDensity?: number;
  currentParams?: StrategyParams;
}
```

### ReplayResult

```typescript
interface ReplayResult {
  sessionId: string;
  userId: string;
  strategyVersion?: string;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  steps: ReplayStepResult[];
  metrics: ReplayMetrics;
}
```

### ReplayMetrics

```typescript
interface ReplayMetrics {
  avgReward: number;
  rewardStdDev: number;
  totalReward: number;
  avgLatency: number;
  p95Latency: number;
  finalState: UserState;
  stateStability: {
    attention: number;
    fatigue: number;
    motivation: number;
  };
}
```

### StrategyComparisonReport

```typescript
interface StrategyComparisonReport {
  sessionId: string;
  userId: string;
  baselineVersion: string;
  candidateVersion: string;
  rewardComparison: {
    baselineAvg: number;
    candidateAvg: number;
    improvement: number;
    improvementPercent: number;
    significantDifference: boolean;
  };
  latencyComparison: {
    baselineAvg: number;
    candidateAvg: number;
    difference: number;
  };
  stabilityComparison: {
    baselineStability: number;
    candidateStability: number;
    improvement: number;
  };
  decisionDifferences: DecisionDifference[];
}
```

## 应用场景

### 1. 回归测试

确保算法改动不会降低历史表现：

```bash
# 运行回归测试
npm test -- tests/regression/amas-replay.test.ts
```

测试覆盖：

- ✅ 决策一致性：相同输入产生一致决策
- ✅ 奖励计算：正确/错误答案的奖励符合预期
- ✅ 状态转换：状态演化符合物理规律
- ✅ 边界情况：异常输入的鲁棒性

### 2. A/B 测试

对比不同策略版本的效果：

```typescript
// 对比新旧策略
const report = await replayEngine.compareStrategies(
  session,
  'current-production',
  'experimental-feature',
);

// 判断是否值得上线
if (report.rewardComparison.significantDifference && report.rewardComparison.improvement > 0.05) {
  console.log('新策略显著优于当前版本，建议上线');
}
```

### 3. 调试分析

重放问题场景定位 bug：

```typescript
// 加载用户反馈的问题会话
const problematicSession = await loadSession(sessionId);

// 逐步回放并检查
const result = await replayEngine.replaySession(problematicSession);

// 定位问题步骤
result.steps.forEach((step, index) => {
  if (step.error || step.reward < -0.5 || step.state.F > 0.9) {
    console.log(`问题发现于第 ${index} 步:`, {
      error: step.error,
      reward: step.reward,
      state: step.state,
      action: step.action,
    });
  }
});
```

### 4. 性能分析

监控决策延迟和系统性能：

```typescript
const result = await replayEngine.replaySession(largeSession);

console.log('性能指标:', {
  avgLatency: result.metrics.avgLatency,
  p95Latency: result.metrics.p95Latency,
  totalTime: result.steps.reduce((sum, s) => sum + s.latencyMs, 0),
  slowSteps: result.steps.filter((s) => s.latencyMs > 100).length,
});

// 检测性能回归
if (result.metrics.p95Latency > 100) {
  console.warn('警告：P95延迟超过100ms，可能存在性能问题');
}
```

## 测试结果示例

```
✓ 基础回放功能
  ✓ 应该成功回放单个会话 (20ms)
  ✓ 应该正确处理初始状态 (1ms)
  ✓ 应该记录错误但继续回放 (1ms)

✓ 决策一致性测试
  ✓ 相同输入应产生一致的决策 (6ms)
  ✓ 应该正确传递策略参数 (8ms)

✓ 奖励计算正确性
  ✓ 正确答案应产生正奖励 (2ms)
  ✓ 错误答案应产生负奖励或较低奖励 (1ms)
  ✓ 应该正确计算累积奖励 (5ms)

✓ 状态转换正确性
  ✓ 连续正确应提升动机降低疲劳 (11ms)
  ✓ 连续错误应降低动机增加疲劳 (15ms)
  ✓ 状态应保持在有效范围内 (11ms)

✓ 策略对比功能
  ✓ 应该生成完整的对比报告 (11ms)
  ✓ 相同策略版本应产生接近的结果 (14ms)
  ✓ 应该识别显著的性能提升 (22ms)

✓ 回放性能
  ✓ 应该在合理时间内完成回放 (14ms)
  ✓ 应该报告延迟指标 (14ms)

✓ 边界情况处理
  ✓ 应该处理空会话 (2ms)
  ✓ 应该处理单步会话 (1ms)
  ✓ 应该处理极端响应时间 (1ms)
  ✓ 应该处理完整的上下文信息 (2ms)

Test Files  1 passed (1)
Tests  20 passed (20)
Duration  208ms
```

## 技术细节

### 回放引擎架构

```
AMASReplayEngine
├── replaySession()     # 回放单个会话
│   ├── loadState()     # 加载初始状态
│   ├── replayStep()    # 逐步回放
│   │   ├── buildRawEvent()
│   │   ├── engine.processEvent()
│   │   └── recordResult()
│   └── calculateMetrics()
│
├── compareStrategies() # 对比两个策略
│   ├── replaySession() [baseline]
│   ├── reset()
│   ├── replaySession() [candidate]
│   └── generateComparisonReport()
│
└── reset()            # 重置引擎状态
```

### 性能优化

1. **内存管理**: 使用 MemoryStateRepository 避免数据库 I/O
2. **并行回放**: 不同会话可以并行处理（需要独立引擎实例）
3. **增量分析**: 支持分批回放大规模历史数据
4. **错误容忍**: 单步失败不中断整体回放

### 扩展性

框架设计支持以下扩展：

1. **自定义指标**: 在 ReplayMetrics 中添加新的分析维度
2. **数据源适配**: 支持从不同数据源加载 AnswerRecord
3. **对比算法**: 扩展显著性检验方法
4. **可视化**: 集成图表库展示回放轨迹

## 最佳实践

1. **定期回归测试**: 每次算法改动后运行完整测试套件
2. **版本标记**: 为每个策略版本添加清晰的标识符
3. **样本选择**: 选择有代表性的会话进行对比测试
4. **结果归档**: 保存对比报告用于长期性能追踪
5. **错误处理**: 记录并分析回放失败的原因

## 注意事项

1. **确定性**: 确保相同输入产生相同输出（避免随机性）
2. **版本兼容**: 注意特征向量维度变化带来的兼容性问题
3. **性能影响**: 大规模回放可能消耗较多内存和CPU
4. **时间依赖**: 注意时间戳相关的逻辑（如时间段偏好）

## 故障排查

### 问题：回放结果不一致

**原因**: 算法中存在随机性（如 Thompson Sampling）
**解决**:

- 检查 feature-flags 配置，确保一致
- 使用固定随机种子
- 对比多次回放的平均结果

### 问题：内存溢出

**原因**: 回放会话数量过大
**解决**:

- 分批处理：每次回放少量会话后重置引擎
- 减少保留的历史数据：只保留必要的步骤信息

### 问题：延迟过高

**原因**: 决策计算复杂度高
**解决**:

- 检查特征向量维度
- 优化 LinUCB 矩阵运算
- 使用性能分析工具定位瓶颈

## 相关文档

- [AMAS Engine 核心文档](../../src/amas/engine/README.md)
- [决策记录服务](../../src/amas/services/decision-recorder.service.ts)
- [状态历史追踪](../../src/services/state-history.service.ts)

## 版本历史

- **v1.0** (2025-12-12): 初始版本，支持基础回放和策略对比
  - 决策一致性测试
  - 奖励计算验证
  - 状态转换正确性
  - 策略对比分析
  - 性能监控
