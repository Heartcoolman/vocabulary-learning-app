# AMAS Online Loop

## 概述

Online Loop 是 AMAS（自适应多维度用户感知智能学习算法）的实时处理核心，负责在用户学习过程中进行快速的状态更新和决策。

## 设计目标

- **实时性**: 端到端延迟 < 50ms
- **用户隔离**: 每个用户拥有独立的认知模型实例
- **可组合**: 支持自定义特征构建器、决策策略、奖励评估器
- **高性能**: 支持高并发处理

## 处理流程

```
┌─────────────┐
│ RawEvent    │ ─┐
│ UserState   │  │
│ Context     │  │
└─────────────┘  │
                 ▼
┌─────────────────────────────────────┐
│     1. FeatureBuilder               │
│     构建特征向量                     │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     2. CognitiveModel               │
│     更新认知状态:                    │
│     - Attention (注意力)            │
│     - Fatigue (疲劳度)              │
│     - Motivation (动机)             │
│     - Cognitive (认知能力)          │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     3. DecisionPolicy               │
│     选择最优学习策略                 │
│     (LinUCB / Thompson Sampling)    │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     4. ImmediateReward              │
│     计算即时反馈                     │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────┐
│ Output      │
│ - Updated   │
│   State     │
│ - Decision  │
│ - Reward    │
│ - Features  │
└─────────────┘
```

## 核心组件

### 1. FeatureBuilder (特征构建器)

负责将原始事件转换为标准化特征向量。

**输入**: `RawEvent`, `userId`
**输出**: `FeatureVector` (10 维特征)

特征维度:

- `z_rt_mean`: 标准化反应时间
- `z_rt_cv`: 反应时间变异系数
- `z_pace_cv`: 答题节奏变异系数
- `z_pause`: 标准化暂停次数
- `z_switch`: 标准化切屏次数
- `z_drift`: 速度漂移
- `z_interaction`: 微交互密度
- `z_focus_loss`: 失焦时长
- `retry_norm`: 重试次数归一化
- `correctness`: 正确性 (+1/-1)

### 2. CognitiveModel (认知模型)

更新用户的认知状态，包括四个维度：

#### AttentionMonitor (注意力监测)

- 输入: 注意力特征 (8 维)
- 输出: 注意力值 [0,1]
- 算法: 加权线性组合 + Sigmoid 激活 + EMA 平滑

#### FatigueEstimator (疲劳度评估)

- 输入: 错误率趋势、反应时增长率、重复错误次数
- 输出: 疲劳度 [0,1]
- 算法: 指数衰减 + 剩余容量折扣

#### MotivationTracker (动机追踪)

- 输入: 成功/失败/退出事件
- 输出: 动机值 [-1,1]
- 算法: 指数加权评分

#### CognitiveProfiler (认知能力评估)

- 输入: 正确率、反应时间、错误方差
- 输出: 认知能力画像 { mem, speed, stability }
- 算法: 短期/长期 EMA 融合

### 3. DecisionPolicy (决策策略)

选择最优学习策略参数。

**默认策略**: LinUCB (线性上置信界算法)

**输入**: `UserState`, `ActionSpace`, `Features`, `DecisionContext`
**输出**: `DecisionResult`

- `action`: 最优动作
- `confidence`: 决策置信度
- `explanation`: 决策解释

**动作空间** (24 个预定义组合):

- `interval_scale`: 间隔缩放因子 [0.5, 0.8, 1.0, 1.2, 1.5]
- `new_ratio`: 新词比例 [0.1, 0.2, 0.3, 0.4]
- `difficulty`: 难度等级 ['easy', 'mid', 'hard']
- `batch_size`: 批量大小 [5, 8, 12, 16]
- `hint_level`: 提示级别 [0, 1, 2]

### 4. ImmediateReward (即时奖励)

计算即时反馈信号。

**输入**: `RawEvent`, `UserState`
**输出**: `RewardDetails`

- `value`: 奖励值 [-1, 1]
- `reason`: 奖励原因
- `breakdown`: 奖励分解

**奖励组成**:

- 基础奖励: 正确 +1, 错误 -1
- 速度奖励: [-0.3, +0.3]
- 难度奖励: [-0.2, +0.2]
- 遗忘曲线调整: [-0.2, +0.2]

## 使用方法

### 基本使用

```typescript
import { OnlineLoop, OnlineLoopInput } from './core/online-loop';

// 1. 创建 OnlineLoop 实例（使用默认配置）
const onlineLoop = new OnlineLoop();

// 2. 构造输入
const input: OnlineLoopInput = {
  event: {
    wordId: 'word_123',
    isCorrect: true,
    responseTime: 2500,
    dwellTime: 1200,
    timestamp: Date.now(),
    pauseCount: 0,
    switchCount: 0,
    retryCount: 0,
    focusLossDuration: 0,
    interactionDensity: 2.5,
  },
  currentState: {
    A: 0.7, // 注意力
    F: 0.3, // 疲劳度
    C: { mem: 0.6, speed: 0.7, stability: 0.65 },
    M: 0.4, // 动机
    conf: 0.8,
    ts: Date.now(),
  },
  userId: 'user_001',
  recentErrorRate: 0.25,
  recentResponseTime: 3000,
  timeBucket: 14,
  interactionCount: 42,
};

// 3. 处理事件
const output = await onlineLoop.process(input);

// 4. 使用输出
console.log('更新后的状态:', output.updatedState);
console.log('推荐动作:', output.decision.action);
console.log('即时奖励:', output.reward.value);
console.log('处理耗时:', output.elapsedTime, 'ms');
```

### 自定义配置

```typescript
import { OnlineLoop } from './core/online-loop';
import { LinUCBAdapter } from './adapters/linucb-adapter';
import { ImmediateRewardEvaluator } from './rewards/immediate-reward';

// 自定义配置
const onlineLoop = new OnlineLoop({
  // 自定义决策策略
  decisionPolicy: new LinUCBAdapter({
    alpha: 1.5, // 探索系数
    lambda: 1.0, // 正则化系数
  }),

  // 自定义奖励评估器
  rewardEvaluator: new ImmediateRewardEvaluator(),

  // 性能监控配置
  enablePerformanceMonitoring: true,
  performanceWarningThreshold: 50, // ms
});
```

### 延迟奖励更新

```typescript
// 1. 处理事件，保存特征向量
const output = await onlineLoop.process(input);
const { features, decision } = output;

// 2. 稍后接收到延迟奖励，更新模型
const delayedReward = 0.8;

onlineLoop.updateModel(decision.action, delayedReward, features, {
  recentErrorRate: input.recentErrorRate,
  recentResponseTime: input.recentResponseTime,
  timeBucket: input.timeBucket,
  userId: input.userId,
});
```

## 性能优化

### 用户隔离

每个用户拥有独立的认知模型实例，避免跨用户污染：

```typescript
// 系统会自动为每个 userId 创建独立的模型实例
// 无需手动管理

// 重置用户模型（测试或用户重新开始）
onlineLoop.resetUserModels('user_001');

// 清理不活跃用户（内存管理）
onlineLoop.cleanupInactiveUsers(['user_002', 'user_003']);
```

### 性能监控

```typescript
// 获取性能统计
const stats = onlineLoop.getPerformanceStats();
console.log('活跃用户数:', stats.activeUsers);
console.log('特征窗口数:', stats.featureBuilderWindows);

// 获取活跃用户数
const activeUserCount = onlineLoop.getActiveUserCount();
```

### 内存管理

```typescript
// FeatureBuilder 会自动清理过期用户窗口
// - 默认 TTL: 30 分钟
// - 默认最大用户数: 10000
// - 清理间隔: 5 分钟

// 手动销毁实例（清理所有资源）
onlineLoop.destroy();
```

## 性能指标

在生产环境中的性能表现：

| 指标     | 目标    | 实际              |
| -------- | ------- | ----------------- |
| P50 延迟 | < 20ms  | ~15ms             |
| P95 延迟 | < 50ms  | ~35ms             |
| P99 延迟 | < 100ms | ~60ms             |
| 并发用户 | 10000+  | 支持              |
| 内存占用 | < 500MB | ~300MB (10k 用户) |

## 示例

完整的使用示例请参考 `online-loop.example.ts`

运行示例：

```bash
npx ts-node src/amas/core/online-loop.example.ts
```

## 架构集成

Online Loop 与 AMAS 系统的其他组件协同工作：

```
┌─────────────────────────────────────────────────┐
│              AMAS Engine (核心引擎)              │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐        ┌──────────────────┐  │
│  │ Online Loop  │◄──────►│ Offline Loop     │  │
│  │ (实时处理)    │        │ (异步处理)        │  │
│  │ <50ms        │        │ 分钟级            │  │
│  └──────────────┘        └──────────────────┘  │
│         │                         │             │
│         │                         │             │
│         ▼                         ▼             │
│  ┌──────────────────────────────────────────┐  │
│  │        Persistence Layer (持久化层)       │  │
│  │  - DatabaseRepository                    │  │
│  │  - CachedRepository                      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

# AMAS Offline Loop

## 概述

Offline Loop 是 AMAS 的异步处理核心，负责延迟奖励的多时间尺度评估和模型参数更新。与 Online Loop 的实时处理不同，Offline Loop 在后台定期执行（分钟级），处理需要时间验证的学习效果。

## 设计目标

- **多时间尺度评估**: 在多个时间点（即时、1小时、24小时、7天）评估学习效果
- **质量控制**: 过滤低质量奖励，防止模型污染
- **异步处理**: 不阻塞主流程，定时批量处理
- **可配置性**: 支持自定义时间表、评估阈值等

## 核心组件

### 1. DelayedRewardProcessor（延迟奖励处理器）

管理延迟奖励队列，支持多时间尺度的奖励计算。

**时间尺度配置（默认）：**
| 尺度 | 延迟 | 权重 | 含义 |
|------|------|------|------|
| 即时 | 0s | 30% | 当下表现 |
| 1小时 | 1h | 20% | 短期记忆 |
| 6小时 | 6h | 15% | 工作记忆巩固 |
| 24小时 | 24h | 20% | 睡眠巩固效果 |
| 7天 | 7d | 15% | 长期记忆保持 |

### 2. RewardEvaluator（奖励评估器）

评估奖励质量，过滤低质量奖励。

**评估策略：**

- 正奖励：基于置信度和阈值过滤
- 负奖励：总是接受（失败是重要的学习信号）
- 零奖励：总是拒绝（无效信号）
- 疲劳度影响：高疲劳时降低置信度

### 3. ParamUpdater（参数更新器）

将有效奖励应用到用户模型，更新 LinUCB/LinTS 参数。

## 处理流程

```
┌──────────────────────┐
│  学习事件发生         │
│  (用户答题)          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  添加延迟奖励事件     │
│  addReward()         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  定时触发处理         │
│  (每分钟/自定义)      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Step 1: DelayedRewardProcessor          │
│  - 聚合到期的延迟奖励                     │
│  - 计算多时间尺度的增量                   │
│  - 按用户分组                            │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Step 2: RewardEvaluator                 │
│  - 获取用户状态（疲劳度等）               │
│  - 评估奖励质量和置信度                   │
│  - 过滤低质量和高疲劳用户                 │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  Step 3: ParamUpdater                    │
│  - 应用有效奖励到模型                     │
│  - 更新 LinUCB/LinTS 参数                │
│  - 记录更新统计                          │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  完成并记录日志       │
└──────────────────────┘
```

## 使用方法

### 基本使用

```typescript
import { OfflineLoop, RewardApplier } from './core/offline-loop';
import { amasService } from '../../services/amas.service';

// 1. 实现奖励应用器
const rewardApplier: RewardApplier = {
  async applyReward(userId: string, reward: number) {
    await amasService.applyDelayedReward(userId, reward);
  },
};

// 2. 创建 Offline Loop 实例
const offlineLoop = new OfflineLoop(rewardApplier);

// 3. 添加延迟奖励事件
offlineLoop.addReward('user-123', 0.8, {
  featureVector: {
    /* ... */
  },
  actionIndex: 5,
});

// 4. 启动定时任务（每分钟执行）
offlineLoop.start();

// 5. 应用关闭时停止
process.on('SIGTERM', () => {
  offlineLoop.stop();
});
```

### 自定义配置

```typescript
const offlineLoop = new OfflineLoop(rewardApplier, userStateProvider, {
  // 自定义奖励时间表
  rewardSchedule: [
    { delaySec: 0, weight: 0.4, label: 'immediate' },
    { delaySec: 3600, weight: 0.3, label: '1h' },
    { delaySec: 86400, weight: 0.3, label: '24h' },
  ],
  // 评估配置
  evaluationThreshold: 0.3,
  enableQualityControl: true,
  fatigueThreshold: 0.8,
  // 处理配置
  batchSize: 50,
  cronSchedule: '* * * * *',
  verboseLogging: false,
});
```

### 手动触发处理

```typescript
// 手动触发一次处理（不启动定时任务）
const result = await offlineLoop.processOnce();

console.log('Processing result:', {
  totalUsers: result.totalUsers,
  totalRewards: result.totalRewards,
  successCount: result.successCount,
  failureCount: result.failureCount,
  filteredCount: result.filteredCount,
});
```

## 性能指标

- **处理延迟**：分钟级（可配置）
- **批处理大小**：默认 50 个用户/次（可配置）
- **队列容量**：10000 个事件（自动修剪）
- **事件保留时间**：8 天（自动清理）

## 示例

完整的使用示例请参考 `offline-loop.example.ts`

---

## 相关模块

- **Online Loop**: `./online-loop.ts` - 实时处理循环
- **Offline Loop**: `./offline-loop.ts` - 异步处理循环
- **FeatureBuilder**: `../perception/feature-builder.ts` - 特征构建
- **Adapters**: `../adapters/` - 决策策略适配器
- **Rewards**: `../rewards/` - 奖励评估器
- **Modeling**: `../modeling/` - 认知模型
- **Evaluation**: `../evaluation/` - 延迟奖励和掌握度评估

## 技术栈

- TypeScript 5.x
- Node.js 18+
- 依赖项:
  - `pino` - 日志记录
  - `node-cron` - 定时任务
  - AMAS 核心模块

## 测试

```bash
# 运行单元测试
npm test src/amas/core/online-loop.test.ts
npm test src/amas/core/offline-loop.test.ts

# 运行集成测试
npm test src/amas/core/online-loop.integration.test.ts
npm test src/amas/core/offline-loop.integration.test.ts

# 运行性能测试
npm run perf:online-loop
npm run perf:offline-loop
```

## 许可证

参见项目根目录的 LICENSE 文件
