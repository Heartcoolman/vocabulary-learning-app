# AMAS 技术文档

## Adaptive Multi-dimensional Aware System
### 自适应多维度用户感知智能学习算法

---

## 1. 概述

AMAS (Adaptive Multi-dimensional Aware System) 是一个为词汇学习应用设计的自适应学习算法系统。它通过实时感知用户的学习状态，动态调整学习策略，以优化学习效果和用户体验。

### 1.1 核心目标

- **个性化学习**：根据用户实时状态调整学习策略
- **疲劳管理**：防止用户过度学习导致的效率下降
- **动机维护**：通过适当的难度和节奏保持用户学习动力
- **长期效果**：平衡短期记忆与长期记忆巩固

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AMAS Engine                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │  感知层     │  │  建模层     │  │  学习层     │  │ 决策层  │ │
│  │ Perception  │→│  Modeling   │→│  Learning   │→│ Decision │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
│        ↑                                                   ↓     │
│   RawEvent                                          StrategyParams│
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心数据结构

### 2.1 用户状态向量 (UserState)

用户状态是AMAS的核心数据结构，包含四个主要维度：

```typescript
interface UserState {
  /** 注意力 [0,1] - 0=完全分心, 1=高度专注 */
  A: number;
  
  /** 疲劳度 [0,1] - 0=精力充沛, 1=极度疲劳 */
  F: number;
  
  /** 认知能力画像 */
  C: CognitiveProfile;
  
  /** 动机 [-1,1] - -1=极度受挫, 1=高度积极 */
  M: number;
  
  /** 学习习惯画像 (扩展版) */
  H?: HabitProfile;
  
  /** 长期趋势: 'up' | 'flat' | 'stuck' | 'down' */
  T?: TrendState;
  
  /** 状态置信度 [0,1] */
  conf: number;
  
  /** 时间戳 */
  ts: number;
}
```

### 2.2 认知能力画像 (CognitiveProfile)

```typescript
interface CognitiveProfile {
  /** 记忆力 [0,1] - 基于正确率的EMA */
  mem: number;
  
  /** 速度 [0,1] - 归一化的反应速度 */
  speed: number;
  
  /** 稳定性 [0,1] - 1 - 归一化错误率方差 */
  stability: number;
}
```

### 2.3 原始学习事件 (RawEvent)

```typescript
interface RawEvent {
  wordId: string;           // 单词ID
  isCorrect: boolean;       // 是否正确
  responseTime: number;     // 反应时间(ms)
  dwellTime: number;        // 停留时长(ms)
  timestamp: number;        // 事件时间戳
  pauseCount: number;       // 暂停次数
  switchCount: number;      // 切屏次数
  retryCount: number;       // 重试次数
  focusLossDuration: number; // 失焦累计时长(ms)
  interactionDensity: number; // 微交互密度(events/s)
}
```

### 2.4 策略参数 (StrategyParams)

```typescript
interface StrategyParams {
  /** 间隔缩放因子: 0.5 | 0.8 | 1.0 | 1.2 | 1.5 */
  interval_scale: number;
  
  /** 新词比例: 0.1 | 0.2 | 0.3 | 0.4 */
  new_ratio: number;
  
  /** 难度等级: 'easy' | 'mid' | 'hard' */
  difficulty: DifficultyLevel;
  
  /** 批量大小: 5 | 8 | 12 | 16 */
  batch_size: number;
  
  /** 提示级别: 0 | 1 | 2 */
  hint_level: number;
}
```

---

## 3. 感知层 (Perception Layer)

### 3.1 特征构建器 (FeatureBuilder)

感知层负责将原始学习事件转换为标准化的特征向量。

#### 输入处理流程

```
RawEvent → 数据清洗 → 异常检测 → 特征提取 → Z-Score标准化 → FeatureVector
```

#### 特征维度 (10维)

| 索引 | 特征名 | 描述 | 归一化方法 |
|------|--------|------|-----------|
| 0 | z_rt_mean | 反应时间均值 | Z-Score |
| 1 | z_rt_cv | 反应时间变异系数 | 窗口统计 |
| 2 | z_pace_cv | 答题节奏变异系数 | 窗口统计 |
| 3 | z_pause | 暂停次数 | Z-Score |
| 4 | z_switch | 切屏次数 | Z-Score |
| 5 | z_drift | 速度漂移 | Z-Score |
| 6 | z_interaction | 微交互密度 | Z-Score |
| 7 | z_focus_loss | 失焦时长 | Z-Score |
| 8 | retry_norm | 重试次数归一化 | [0,1] |
| 9 | correctness | 正确性 | {-1, 1} |

#### 归一化配置

```typescript
const DEFAULT_PERCEPTION_CONFIG = {
  rt: { mean: 3200, std: 800 },        // 反应时间
  pause: { mean: 0.3, std: 0.6 },      // 暂停次数
  focusLoss: { mean: 3000, std: 2500 }, // 失焦时长
  switches: { mean: 0.2, std: 0.5 },   // 切屏次数
  dwell: { mean: 1800, std: 600 },     // 停留时长
  interactionDensity: { mean: 2.0, std: 1.2 }, // 交互密度
  maxResponseTime: 120000,              // 最大反应时间阈值
  maxPauseCount: 20,
  maxSwitchCount: 20,
  maxFocusLoss: 600000
};
```

### 3.2 滑动窗口统计

每个用户维护独立的滑动窗口（默认大小10），用于计算变异系数(CV)等窗口级特征：

```typescript
CV = σ / μ  // 标准差 / 均值
```

### 3.3 异常检测

系统会自动检测并过滤异常事件：

- 反应时间 ≤ 0 或非有限数
- 停留时长 < 0
- 时间戳无效
- 反应时间超过阈值 (120s)
- 失焦时长超过阈值 (10min)

---

## 4. 建模层 (Modeling Layer)

### 4.1 注意力监测 (AttentionMonitor)

**数学模型**：

```
A_raw = sigmoid(-w · f_attention)
A_t = β · A_{t-1} + (1 - β) · A_raw
```

**权重配置**：

```typescript
const DEFAULT_ATTENTION_WEIGHTS = {
  rt_mean: 0.15,      // 反应时间均值权重
  rt_cv: 0.15,        // 反应时间变异系数权重
  pace_cv: 0.10,      // 节奏变异系数权重
  pause: 0.20,        // 暂停次数权重
  switch: 0.15,       // 切屏次数权重
  drift: 0.10,        // 速度漂移权重
  interaction: -0.05, // 微交互密度权重 (负权重)
  focus_loss: 0.10    // 失焦时长权重
};
```

**EMA平滑系数**：β = 0.7

### 4.2 疲劳估计 (FatigueEstimator)

**数学模型**：

```
F_accumulate = β·Δerr + γ·Δrt + δ·repeat
F_decay = F_t · exp(-k · Δt_minutes)
F_{t+1} = max(F_accumulate, F_decay)
```

**参数配置**：

```typescript
const DEFAULT_FATIGUE_PARAMS = {
  beta: 0.4,      // 错误率权重
  gamma: 0.3,     // 反应时权重
  delta: 0.3,     // 重复错误权重
  k: 0.05,        // 衰减系数
  longBreakThreshold: 30  // 长休息重置阈值(分钟)
};
```

**疲劳阈值**：

- F > 0.6：建议休息
- F > 0.8：强制休息

### 4.3 认知能力评估 (CognitiveProfiler)

**数学模型**：

```
C_short = stats(window_k)
C_long = β · C_long + (1 - β) · new_value
C = λ · C_long + (1 - λ) · C_short
λ = 1 - exp(-n / k0)
```

**参数配置**：

```typescript
const COGNITIVE_LONG_TERM_BETA = 0.95;  // 长期EMA系数
const COGNITIVE_FUSION_K0 = 50;          // 融合系数衰减常数
```

**能力维度计算**：

| 维度 | 计算方法 |
|------|---------|
| mem (记忆力) | 正确率 |
| speed (速度) | 参考时间 / 实际反应时间 |
| stability (稳定性) | 1 - 归一化错误率方差 |

### 4.4 动机追踪 (MotivationTracker)

**数学模型**：

```
M_t = clip(ρ·M_{t-1} + κ·succ - λ·fail - μ·quit, -1, 1)
```

**参数配置**：

```typescript
const DEFAULT_MOTIVATION_PARAMS = {
  rho: 0.9,     // 记忆系数
  kappa: 0.2,   // 成功奖励
  lambda: 0.3,  // 失败惩罚
  mu: 0.5       // 退出惩罚
};
```

**动机状态判定**：

- M < -0.3：挫折状态
- M > 0.5：高动机状态
- M < 0 持续10次：长期低动机

---

## 5. 学习层 (Learning Layer)

### 5.1 LinUCB 算法

AMAS使用 LinUCB (Linear Upper Confidence Bound) 算法进行在线策略学习。

**核心公式**：

```
θ_a = A_a^(-1) b_a
score_a = θ_a^T x + α √(x^T A_a^(-1) x)
a* = argmax_a score_a
```

其中：
- A：协方差矩阵 (d×d)
- b：奖励向量 (d)
- α：探索系数
- x：上下文特征向量

### 5.2 特征向量构建 (22维)

```typescript
const FEATURE_LABELS = [
  // 状态特征 (5维)
  'state.A',           // 注意力
  'state.F',           // 疲劳度
  'state.C.mem',       // 记忆力
  'state.C.speed',     // 速度
  'state.M',           // 动机
  
  // 错误率 (1维)
  'recentErrorRate',
  
  // 动作特征 (5维)
  'interval_scale',
  'new_ratio',
  'difficulty',
  'hint_level',
  'batch_norm',
  
  // 交互特征 (1维)
  'rt_norm',
  
  // 时间特征 (3维)
  'time_norm',
  'time_sin',
  'time_cos',
  
  // 交叉特征 (6维)
  'attn_fatigue',       // A × (1-F)
  'motivation_fatigue', // M × (1-F)
  'pace_match',         // speed × interval
  'memory_new_ratio',   // mem × new_ratio
  'fatigue_latency',    // F × rt
  'new_ratio_motivation', // new_ratio × motivation
  
  // bias项 (1维)
  'bias'
];
```

### 5.3 冷启动策略

根据交互次数动态调整探索系数α：

| 交互次数 | 阶段 | 探索系数α |
|---------|------|----------|
| < 15 | classify | 0.5 (低探索，安全策略) |
| 15-50 | explore | 1.0-2.0 (条件探索) |
| > 50 | normal | 0.7 (正常运行) |

### 5.4 奖励计算

```typescript
reward = correct × correctValue 
       - fatigue × fatiguePenalty 
       + speed × speedGain 
       - frustration × frustrationValue

// 权重配置
const REWARD_WEIGHTS = {
  correct: 1.0,      // 正确性权重
  fatigue: 0.6,      // 疲劳惩罚权重
  speed: 0.4,        // 速度奖励权重
  frustration: 0.8   // 挫折惩罚权重
};
```

### 5.5 模型更新

使用增量式Cholesky分解优化矩阵更新：

```
A += x x^T
b += r × x
L = cholesky(A)  // 重新分解
```

---

## 6. 决策层 (Decision Layer)

### 6.1 动作空间

预定义24个策略组合，覆盖不同用户状态：

```typescript
const ACTION_SPACE = [
  // 保守策略 (低注意力/低动机/高疲劳)
  { interval_scale: 0.5, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
  
  // 标准策略 (正常状态)
  { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 },
  
  // 高挑战策略 (高能力/高动机)
  { interval_scale: 1.5, new_ratio: 0.4, difficulty: 'hard', batch_size: 16, hint_level: 0 },
  // ... 共24种组合
];
```

### 6.2 安全约束 (Guardrails)

系统自动应用多重安全保护：

#### 疲劳保护

| 条件 | 约束 |
|------|------|
| F > 0.6 | interval_scale ≥ 1.0, new_ratio ≤ 0.2, batch_size ≤ 8 |
| F > 0.8 | difficulty = 'easy', hint_level ≥ 1, new_ratio ≤ 0.1, batch_size ≤ 5 |

#### 动机保护

| 条件 | 约束 |
|------|------|
| M < -0.3 | difficulty = 'easy', hint_level ≥ 1, new_ratio ≤ 0.2 |
| M < -0.5 | hint_level = 2, new_ratio ≤ 0.1, batch_size ≤ 5 |

#### 注意力保护

| 条件 | 约束 |
|------|------|
| A < 0.4 | new_ratio ≤ 0.15, batch_size ≤ 6, hint_level ≥ 1 |

### 6.3 策略平滑

为避免策略突变，应用平滑系数：

```typescript
const STRATEGY_SMOOTHING = 0.5;
```

---

## 7. 延迟奖励机制

### 7.1 设计原理

学习效果需要时间验证，因此AMAS采用延迟奖励机制：

1. 记录当前决策的特征向量
2. 等待下次复习时评估效果
3. 根据实际表现反馈更新模型

### 7.2 到期时间计算

```typescript
优先级:
1. WordLearningState.nextReviewDate
2. currentInterval × 24小时
3. 默认配置 (24小时)

最小延迟: 60秒
```

### 7.3 特征向量持久化

保存用于延迟奖励的特征向量：

```typescript
interface PersistableFeatureVector {
  values: number[];      // 特征值数组
  version: number;       // 特征版本号
  normMethod: string;    // 归一化方法
  ts: number;           // 时间戳
  labels: string[];     // 特征标签
}
```

---

## 8. 性能与可靠性

### 8.1 超时保护

- 决策超时阈值：100ms
- 超时后使用智能降级策略

### 8.2 熔断器

采用Circuit Breaker模式防止级联故障：

- 记录成功/失败次数
- 超过阈值时触发熔断
- 熔断期间使用降级策略

### 8.3 用户隔离

- 每用户独立的模型实例
- 用户级锁防止并发冲突
- 内存清理机制（LRU + TTL）

```typescript
const DEFAULT_CLEANUP_CONFIG = {
  maxUsers: 10000,           // 最大用户数
  ttlMs: 30 * 60 * 1000,     // 30分钟过期
  cleanupIntervalMs: 5 * 60 * 1000  // 5分钟清理一次
};
```

### 8.4 数值稳定性

- Cholesky分解失败时回退到正则化单位矩阵
- A矩阵对角线元素检查
- NaN/Infinity值过滤

---

## 9. API 接口

### 9.1 主要方法

```typescript
class AMASEngine {
  // 处理学习事件
  async processEvent(
    userId: string,
    rawEvent: RawEvent,
    opts?: ProcessOptions
  ): Promise<ProcessResult>
  
  // 获取用户状态
  async getState(userId: string): Promise<UserState | null>
  
  // 重置用户
  async resetUser(userId: string): Promise<void>
  
  // 获取冷启动阶段
  getColdStartPhase(userId: string): ColdStartPhase
  
  // 应用延迟奖励更新
  async applyDelayedRewardUpdate(
    userId: string,
    featureVector: number[],
    reward: number
  ): Promise<{ success: boolean; error?: string }>
}
```

### 9.2 处理结果

```typescript
interface ProcessResult {
  strategy: StrategyParams;     // 输出策略参数
  action: Action;               // 选择的动作
  explanation: string;          // 决策解释
  state: UserState;             // 用户状态
  reward: number;               // 奖励值
  suggestion: string | null;    // 建议文本
  shouldBreak: boolean;         // 是否建议休息
  featureVector?: PersistableFeatureVector; // 特征向量
}
```

---

## 10. 配置参数汇总

### 10.1 默认策略

```typescript
const DEFAULT_STRATEGY = {
  interval_scale: 1.0,
  new_ratio: 0.2,
  difficulty: 'mid',
  batch_size: 8,
  hint_level: 1
};
```

### 10.2 冷启动策略

```typescript
const COLD_START_STRATEGY = {
  interval_scale: 1.0,
  new_ratio: 0.15,
  difficulty: 'easy',
  batch_size: 8,
  hint_level: 1
};
```

### 10.3 阈值配置

```typescript
const MIN_ATTENTION = 0.4;
const HIGH_FATIGUE = 0.6;
const CRITICAL_FATIGUE = 0.8;
const LOW_MOTIVATION = -0.3;
const CRITICAL_MOTIVATION = -0.5;
```

---

## 11. 文件结构

```
backend/src/amas/
├── engine.ts                 # 核心引擎
├── types.ts                  # 类型定义
├── index.ts                  # 导出入口
├── config/
│   └── action-space.ts       # 配置和动作空间
├── perception/
│   └── feature-builder.ts    # 特征构建器
├── modeling/
│   ├── attention-monitor.ts  # 注意力监测
│   ├── fatigue-estimator.ts  # 疲劳估计
│   ├── cognitive-profiler.ts # 认知能力评估
│   └── motivation-tracker.ts # 动机追踪
├── learning/
│   └── linucb.ts            # LinUCB算法
├── decision/
│   ├── mapper.ts            # 策略映射
│   ├── guardrails.ts        # 安全约束
│   ├── explain.ts           # 决策解释
│   └── fallback.ts          # 降级策略
├── common/
│   ├── circuit-breaker.ts   # 熔断器
│   └── telemetry.ts         # 遥测
└── repositories/
    └── index.ts             # 持久化仓库
```

---

## 12. 版本信息

- **特征版本**: v2 (22维特征向量)
- **算法版本**: LinUCB with Delayed Reward
- **文档更新日期**: 2024年

---

## 附录A: 数学符号表

| 符号 | 含义 | 范围 |
|------|------|------|
| A | 注意力 | [0, 1] |
| F | 疲劳度 | [0, 1] |
| M | 动机 | [-1, 1] |
| C | 认知能力 | [0, 1]³ |
| α | UCB探索系数 | > 0 |
| β | EMA平滑系数 | [0, 1] |
| λ | 正则化系数 | > 0 |
| θ | 模型参数向量 | ℝᵈ |
| x | 特征向量 | ℝᵈ |
| r | 奖励 | [-1, 1] |

---

## 附录B: 参考文献

1. Li, L., et al. "A Contextual-Bandit Approach to Personalized News Article Recommendation." WWW 2010.
2. Ebbinghaus, H. "Memory: A Contribution to Experimental Psychology." 1885.
3. Leitner, S. "So lernt man lernen." 1972.
