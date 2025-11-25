# AMAS 自适应多维度用户感知智能学习算法
## Adaptive Multi-dimensional Aware System

**版本**: 1.0
**日期**: 2025-01-24
**状态**: 设计完成，待实现

---

## 目录

1. [算法概述](#一算法概述)
2. [核心架构设计](#二核心架构设计)
3. [多维度用户状态建模](#三多维度用户状态建模)
4. [自主学习机制](#四自主学习机制)
5. [智能决策引擎](#五智能决策引擎)
6. [工程实现方案](#六工程实现方案)
7. [实施路线图](#七实施路线图)
8. [评估体系](#八评估体系)
9. [附录](#九附录)

---

## 一、算法概述

### 1.1 核心目标

AMAS 是一套能够**实时感知用户状态、自主学习最优策略、动态调整学习参数**的智能算法系统。

### 1.2 核心特点

- ✅ **多维度感知**: 注意力、疲劳、能力、习惯、动机、趋势
- ✅ **自主学习**: 无需人工调参，从用户行为中自动优化
- ✅ **轻量高效**: 前端实时运行，单次决策 < 100ms，模型 < 1MB
- ✅ **高度可解释**: 每个决策都能向用户解释原因
- ✅ **隐私优先**: 所有计算本地完成，不上传原始数据
- ✅ **渐进演化**: MVP → 扩展版 → 完整版的实施路线

### 1.3 与现有算法的关系

AMAS 不是替代现有算法，而是作为**智能调度层**增强现有系统：

```
AMAS (调度层)
    ↓ 输出策略参数
现有算法引擎
    - SpacedRepetitionEngine (间隔重复)
    - WordScoreCalculator (单词评分)
    - PriorityQueueScheduler (优先级队列)
    - AdaptiveDifficultyEngine (自适应难度)
```

---

## 二、核心架构设计

### 2.1 四层架构

```
┌─────────────────────────────────────────────────────────┐
│  用户交互层                                              │
│  (答题、暂停、切屏等行为)                               │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  感知层 (Perception Layer)                               │
│  • 采集行为数据: 反应时、正确率、暂停、切屏、微交互      │
│  • 特征工程: 清洗、归一化、异常处理                      │
│  • 输出: 标准化特征向量 x_t                              │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  建模层 (Modeling Layer)                                 │
│  • 注意力模型 A ∈ [0,1]                                  │
│  • 疲劳度模型 F ∈ [0,1]                                  │
│  • 认知能力模型 C = {mem, speed, stability}              │
│  • 学习习惯模型 H = {time, pace, batch}                  │
│  • 动机追踪模型 M ∈ [-1,1]                               │
│  • 长期趋势模型 T ∈ {进步,平稳,停滞,退步}                │
│  • 输出: 用户状态向量 S_t = {A, F, C, H, M, T}            │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  学习层 (Learning Layer)                                 │
│  • Contextual Bandit (LinUCB/LinTS)                      │
│  • 探索-利用平衡                                         │
│  • 在线增量更新                                          │
│  • 输出: 最优动作分布 π(a|S_t)                           │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  决策层 (Decision Layer)                                 │
│  • 动作映射: 间隔缩放、新词比例、难度等级、批量大小       │
│  • 约束检查: 安全边界、平滑过渡                          │
│  • 可解释性生成                                          │
│  • 输出: 具体策略参数 + 解释文本                          │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│  执行层                                                  │
│  • 调用现有算法引擎 (SpacedRepetition, Priority...)    │
│  • 收集反馈奖励                                          │
│  • 记录日志用于在线更新                                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户行为
  → 特征提取 (感知层)
  → 状态推断 (建模层)
  → 动作选择 (学习层)
  → 策略映射 (决策层)
  → 执行反馈
  → 在线更新 (学习层)
```

### 2.3 接口设计

```typescript
// 特征接口
interface FeatureBundle {
    values: Float32Array;  // 特征向量
    ts: number;            // 时间戳
    labels: string[];      // 特征名称
}

// 状态接口
interface UserState {
    A: number;             // 注意力 [0,1]
    F: number;             // 疲劳度 [0,1]
    C: CognitiveProfile;   // 认知能力
    H: HabitProfile;       // 学习习惯
    M: number;             // 动机 [-1,1]
    T: TrendState;         // 趋势
    conf: number;          // 置信度 [0,1]
    ts: number;            // 时间戳
}

// 动作接口
interface Action {
    interval_scale: number;
    new_ratio: number;
    difficulty: DifficultyLevel;
    batch_size: number;
    hint_level: number;
}

// 奖励接口
interface Reward {
    value: number;         // 奖励值 [-1,1]
    reason: string;        // 奖励来源
    ts: number;            // 时间戳
}
```

---

## 三、多维度用户状态建模

### 3.1 注意力监测模型 (Attention Monitor)

#### 定义
用户当前的专注程度，0 = 完全分心，1 = 高度专注

#### 输入特征

```typescript
interface AttentionFeatures {
    z_rt_mean: number;          // 反应时间均值(标准化)
    z_rt_cv: number;            // 反应时间变异系数
    z_pace_cv: number;          // 答题节奏变异系数
    z_pause: number;            // 暂停次数(标准化)
    z_switch: number;           // 切屏次数(标准化)
    z_drift: number;            // 速度漂移(最近 vs 基线)
    interaction_density: number; // 微交互密度(鼠标/键盘事件率)
    focus_loss_duration: number; // 失焦累计时长
}
```

#### 数学模型

```
A_raw = sigmoid(-w · f_attention)
A_t = β · A_{t-1} + (1 - β) · A_raw

其中:
- w = [-0.25, -0.35, -0.2, -0.15, -0.2, -0.15, -0.3, -0.4]
- β = 0.8 (平滑系数)
- sigmoid(x) = 1 / (1 + e^(-x))
```

#### 伪代码

```typescript
class AttentionMonitor {
    private weights: Float32Array;
    private beta: number = 0.8;
    private prevAttention: number = 0.7;

    update(features: AttentionFeatures): number {
        // 计算加权和
        const weightedSum =
            this.weights[0] * features.z_rt_mean +
            this.weights[1] * features.z_rt_cv +
            this.weights[2] * features.z_pace_cv +
            this.weights[3] * features.z_pause +
            this.weights[4] * features.z_switch +
            this.weights[5] * features.z_drift +
            this.weights[6] * features.interaction_density +
            this.weights[7] * features.focus_loss_duration;

        // Sigmoid 激活
        const A_raw = 1 / (1 + Math.exp(-(-weightedSum)));

        // 指数平滑
        const A_t = this.beta * this.prevAttention + (1 - this.beta) * A_raw;

        this.prevAttention = A_t;
        return A_t;
    }
}
```

#### 决策影响

| 注意力范围 | 策略调整 |
|-----------|---------|
| A < 0.3   | 降低新词比例至 10-15%，缩短批量至 5-8 个，增加提示级别 |
| 0.3 ≤ A < 0.5 | 适度降低难度，延长复习间隔衰减 |
| A ≥ 0.5   | 正常策略 |

---

### 3.2 疲劳度评估模型 (Fatigue Estimator)

#### 定义
用户当前的疲劳程度，0 = 精力充沛，1 = 极度疲劳

#### 输入特征

```typescript
interface FatigueFeatures {
    session_duration: number;     // 会话时长(分钟)
    error_rate_trend: number;     // 错误率趋势(上升/下降)
    rt_increase_rate: number;     // 反应时上升率
    repeat_errors: number;        // 重复错误次数
    last_break_duration: number;  // 距离上次休息时长(分钟)
}
```

#### 数学模型（非线性恢复）

```
// 学习中累积
F_accumulate = β·Δerr + γ·Δrt + δ·repeat

// 休息时指数衰减
F_decay = F_t · exp(-k · Δt_minutes)

// 综合（体现坚持学习的累积效应）
F_{t+1} = max(F_accumulate, F_decay)

// 限幅
F_{t+1} = clip(F_{t+1}, 0.05, 1.0)

参数推荐:
- β = 0.3 (错误率权重)
- γ = 0.25 (反应时权重)
- δ = 0.2 (重复错误权重)
- k = 0.08 (衰减系数，5分钟后剩 ~67%，60分钟后剩 ~1%)
```

#### 重置条件

- 长休息（> 30分钟）: F = 0.1
- 会话重新开始: F = 0.1
- 短休息（< 30分钟）: 仅指数衰减

#### 伪代码

```typescript
class FatigueEstimator {
    private F: number = 0.1;
    private beta: number = 0.3;
    private gamma: number = 0.25;
    private delta: number = 0.2;
    private k: number = 0.08;
    private lastUpdateTime: number;

    update(features: FatigueFeatures, currentTime: number): number {
        // 计算休息时长
        const breakMinutes = (currentTime - this.lastUpdateTime) / 60000;

        // 休息时指数衰减
        const F_decay = this.F * Math.exp(-this.k * breakMinutes);

        // 学习中累积
        const F_accumulate =
            this.beta * features.error_rate_trend +
            this.gamma * features.rt_increase_rate +
            this.delta * features.repeat_errors;

        // 取最大值（体现累积效应）
        this.F = Math.max(F_accumulate, F_decay);

        // 限幅
        this.F = Math.max(0.05, Math.min(1.0, this.F));

        // 长休息重置
        if (breakMinutes > 30) {
            this.F = 0.1;
        }

        this.lastUpdateTime = currentTime;
        return this.F;
    }
}
```

#### 决策影响

| 疲劳度范围 | 策略调整 |
|-----------|---------|
| F > 0.8   | 强制建议休息，暂停新词推送 |
| 0.6 < F ≤ 0.8 | 启动保护模式，降低难度，缩减批量 |
| F ≤ 0.6   | 正常策略 |

---

### 3.3 认知能力评估模型 (Cognitive Profiler)

#### 定义
用户的学习能力画像，包含记忆力、速度、稳定性三个维度

#### 数学模型（长短期融合）

```
// 短期能力（最近 k 次）
C_short = stats(window_k)

// 长期能力（指数移动平均）
C_long = β · C_long + (1 - β) · new_value  (β = 0.98)

// 融合
C = λ · C_long + (1 - λ) · C_short

// λ 自适应
λ = 1 - exp(-n / k0)  (k0 = 50)
// 样本少时更依赖短期，样本多时更依赖长期
```

#### 三个维度

```typescript
interface CognitiveProfile {
    mem: number;       // 记忆力 = 正确率的EMA [0,1]
    speed: number;     // 速度 = normalize(1 / 平均反应时) [0,1]
    stability: number; // 稳定性 = 1 - normalize(错误率方差) [0,1]
}
```

#### 伪代码

```typescript
class CognitiveProfiler {
    private C_long: CognitiveProfile;
    private beta: number = 0.98;
    private k0: number = 50;
    private sampleCount: number = 0;

    update(recentStats: Stats): CognitiveProfile {
        // 短期能力
        const C_short: CognitiveProfile = {
            mem: recentStats.accuracy,
            speed: this.normalizeSpeed(recentStats.avgResponseTime),
            stability: 1 - this.normalizeVariance(recentStats.errorVariance)
        };

        // 更新长期能力（EMA）
        this.C_long.mem = this.beta * this.C_long.mem + (1 - this.beta) * C_short.mem;
        this.C_long.speed = this.beta * this.C_long.speed + (1 - this.beta) * C_short.speed;
        this.C_long.stability = this.beta * this.C_long.stability + (1 - this.beta) * C_short.stability;

        // 自适应融合系数
        this.sampleCount++;
        const lambda = 1 - Math.exp(-this.sampleCount / this.k0);

        // 融合
        const C: CognitiveProfile = {
            mem: lambda * this.C_long.mem + (1 - lambda) * C_short.mem,
            speed: lambda * this.C_long.speed + (1 - lambda) * C_short.speed,
            stability: lambda * this.C_long.stability + (1 - lambda) * C_short.stability
        };

        return C;
    }

    private normalizeSpeed(rt: number): number {
        // 速度越快分数越高
        // 假设基准反应时 5000ms
        return Math.max(0, Math.min(1, 5000 / Math.max(rt, 1000)));
    }

    private normalizeVariance(variance: number): number {
        // 归一化方差到 [0, 1]
        return Math.min(1, variance / 0.25);
    }
}
```

#### 决策影响

| 维度 | 高值策略 | 低值策略 |
|-----|---------|---------|
| mem | 增加新词比例，延长间隔 | 减少新词，缩短间隔 |
| speed | 缩短批量间隔，增加单次数量 | 延长思考时间，减少批量 |
| stability | 正常难度 | 降低难度，增加重复 |

---

### 3.4 学习习惯识别模型 (Habit Recognizer)

#### 定义
用户的学习时间偏好、节奏偏好、批量偏好

#### 数学模型

```typescript
interface HabitProfile {
    timePref: number[];   // 24小时直方图，识别活跃时间段
    pacePref: number;     // 会话长度分布的中位数(分钟)
    batchPref: number;    // 单次学习单词数的中位数
}
```

#### 时间偏好识别

```typescript
class HabitRecognizer {
    private timeHistogram: number[] = new Array(24).fill(0);

    updateTimePref(hour: number): void {
        this.timeHistogram[hour]++;
    }

    getPreferredTimeSlots(): number[] {
        // 找到活跃时间段（高于平均值的小时）
        const mean = this.timeHistogram.reduce((a, b) => a + b) / 24;
        return this.timeHistogram
            .map((count, hour) => ({ hour, count }))
            .filter(item => item.count > mean * 1.5)
            .map(item => item.hour);
    }
}
```

#### 决策影响

- 在 `timePref` 峰值时段推送学习提醒
- 根据 `pacePref` 调整默认会话时长
- 根据 `batchPref` 设置默认批量大小

---

### 3.5 情绪/动机追踪模型 (Motivation Tracker)

#### 定义
用户的学习动机和情绪状态，-1 = 极度受挫，1 = 高度积极

#### 数学模型（指数打分）

```
M_t = clip(ρ·M_{t-1} + κ·succ - λ·fail - μ·quit, -1, 1)

参数:
- ρ = 0.85 (记忆系数)
- κ = 0.3 (成功奖励)
- λ = 0.4 (失败惩罚)
- μ = 0.6 (退出惩罚)
```

#### 区分短期挫折和长期低动机

- **短期挫折**: 单次失败后快速恢复（M 仍 > 0）
- **长期低动机**: M 持续 < 0 超过 10 次交互

#### 伪代码

```typescript
class MotivationTracker {
    private M: number = 0.5;
    private rho: number = 0.85;
    private kappa: number = 0.3;
    private lambda: number = 0.4;
    private mu: number = 0.6;
    private lowMotivationCount: number = 0;

    update(event: { success: boolean; quit: boolean; retry: number }): number {
        const succ = event.success ? 1 : 0;
        const fail = event.success ? 0 : 1;
        const quit = event.quit ? 1 : 0;

        // 更新动机
        this.M =
            this.rho * this.M +
            this.kappa * succ -
            this.lambda * fail -
            this.mu * quit;

        // 限幅
        this.M = Math.max(-1, Math.min(1, this.M));

        // 追踪低动机持续时长
        if (this.M < 0) {
            this.lowMotivationCount++;
        } else {
            this.lowMotivationCount = 0;
        }

        return this.M;
    }

    isLongTermLowMotivation(): boolean {
        return this.lowMotivationCount > 10;
    }
}
```

#### 决策影响

| 动机范围 | 策略调整 |
|---------|---------|
| M < -0.5 | 大幅降低难度，增加鼓励性提示，减少新词 |
| -0.5 ≤ M < 0 | 适度降低难度，增加正反馈 |
| 0 ≤ M < 0.5 | 正常策略 |
| M ≥ 0.5 | 增加挑战性，提升新词比例 |

---

### 3.6 长期趋势分析模型 (Trend Analyzer)

#### 定义
用户能力的长期变化趋势

#### 数学模型（分段线性 + 突变检测）

```
slope = linear_regression(能力指标, 时间窗口=30天)

if slope > τ_pos:       T = "进步" (up)
elif slope < τ_neg:     T = "退步" (down)
elif 近零 && 低波动:     T = "平稳" (flat)
else:                   T = "停滞" (stuck)

参数:
- τ_pos = 0.01 / 天
- τ_neg = -0.005 / 天
```

#### 伪代码

```typescript
type TrendState = 'up' | 'flat' | 'stuck' | 'down';

class TrendAnalyzer {
    private history: { time: number; ability: number }[] = [];
    private windowDays: number = 30;

    update(ability: number, timestamp: number): TrendState {
        this.history.push({ time: timestamp, ability });

        // 保留最近30天数据
        const cutoff = timestamp - this.windowDays * 24 * 3600 * 1000;
        this.history = this.history.filter(h => h.time > cutoff);

        if (this.history.length < 10) {
            return 'flat';  // 数据不足
        }

        // 线性回归计算斜率
        const slope = this.linearRegressionSlope();
        const variance = this.computeVariance();

        // 判断趋势
        if (slope > 0.01) {
            return 'up';
        } else if (slope < -0.005) {
            return 'down';
        } else if (Math.abs(slope) < 0.002 && variance < 0.01) {
            return 'flat';
        } else {
            return 'stuck';
        }
    }

    private linearRegressionSlope(): number {
        const n = this.history.length;
        const x = this.history.map((_, i) => i);
        const y = this.history.map(h => h.ability);

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    private computeVariance(): number {
        const abilities = this.history.map(h => h.ability);
        const mean = abilities.reduce((a, b) => a + b, 0) / abilities.length;
        const variance = abilities.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / abilities.length;
        return variance;
    }
}
```

#### 决策影响

| 趋势状态 | 策略调整 |
|---------|---------|
| up (进步) | 适度增加挑战，可引入新内容 |
| flat (平稳) | 正常策略 |
| stuck (停滞) | 插入巩固练习，多样化内容 |
| down (退步) | 降低难度，增加复习，错题回顾 |

---

## 四、自主学习机制

### 4.1 算法选择：Contextual Bandit

#### 为什么选择 Contextual Bandit？

| 特性 | 优势 |
|------|------|
| 在线学习 | 无需大量历史数据，边用边学 |
| 轻量级 | 模型参数少，满足前端运行要求 |
| 可解释 | 基于线性模型，决策透明 |
| 理论保证 | 有 regret bound，收敛性有保证 |
| 探索-利用平衡 | 自动平衡探索新策略和利用已知最优策略 |

#### LinUCB vs LinTS

| 算法 | 优势 | 劣势 | 推荐场景 |
|------|------|------|---------|
| LinUCB | 确定性，易调试 | 需要手动调整 α | MVP 版本 |
| LinTS | 自动平衡探索，贝叶斯优雅 | 需要采样，计算稍复杂 | 扩展版本 |

**建议**: MVP 使用 LinUCB，扩展版提供 LinTS 作为选项。

---

### 4.2 LinUCB 详细设计

#### 数学原理

```
对于每个动作 a，维护:
- A_a ∈ R^(d×d): 协方差矩阵
- b_a ∈ R^d: 奖励向量

估计参数:
θ_a = A_a^(-1) b_a

置信上界 (UCB):
score_a = θ_a^T x + α √(x^T A_a^(-1) x)

选择动作:
a* = argmax_a score_a
```

#### 完整伪代码

```typescript
interface LinUCBModel {
    A: Float32Array;        // d×d 协方差矩阵（扁平化）
    b: Float32Array;        // d 奖励向量
    L: Float32Array;        // Cholesky 分解 L（lower triangular）
    lambda: number;         // 正则化系数
    alpha: number;          // 探索系数
    d: number;              // 特征维度
    updateCount: number;    // 更新次数
}

class LinUCBAgent {
    private model: LinUCBModel;

    constructor(d: number, lambda: number = 1.0, alpha: number = 1.0) {
        // 初始化
        const A = new Float32Array(d * d);
        for (let i = 0; i < d; i++) {
            A[i * d + i] = lambda;  // A = λI
        }

        this.model = {
            A: A,
            b: new Float32Array(d),
            L: this.cholesky(A, d),
            lambda: lambda,
            alpha: alpha,
            d: d,
            updateCount: 0
        };
    }

    // 特征构造
    buildContextVector(state: UserState, action: Action): Float32Array {
        const d = this.model.d;
        const x = new Float32Array(d);

        // 状态特征 (8维)
        x[0] = state.A;                    // 注意力
        x[1] = state.F;                    // 疲劳度
        x[2] = state.C.mem;                // 记忆力
        x[3] = state.C.speed;              // 速度
        x[4] = state.M;                    // 动机
        x[5] = this.getRecentErrorRate(); // 近期错误率
        x[6] = this.getRecentRT();         // 近期反应时
        x[7] = this.getTimeBucket();       // 时间桶

        // 交叉项 (1维)
        x[8] = state.A * state.F;          // 注意力×疲劳

        // bias (1维)
        x[9] = 1.0;

        // 归一化
        return this.normalize(x);
    }

    // 动作选择
    selectAction(state: UserState, actions: Action[]): Action {
        let bestScore = -Infinity;
        let bestAction: Action | null = null;

        for (const action of actions) {
            const x = this.buildContextVector(state, action);

            // 解线性方程 A θ = b
            const theta = this.solve(x);

            // UCB 分数 = 预期奖励 + 置信上界
            const exploitation = this.dot(theta, x);
            const confidence = this.model.alpha * Math.sqrt(this.computeConfidence(x));
            const ucbScore = exploitation + confidence;

            if (ucbScore > bestScore) {
                bestScore = ucbScore;
                bestAction = action;
            }
        }

        return bestAction!;
    }

    // 模型更新
    update(state: UserState, action: Action, reward: number): void {
        const x = this.buildContextVector(state, action);

        // 更新 A += x x^T
        for (let i = 0; i < this.model.d; i++) {
            for (let j = 0; j < this.model.d; j++) {
                this.model.A[i * this.model.d + j] += x[i] * x[j];
            }
        }

        // 更新 b += r x
        for (let i = 0; i < this.model.d; i++) {
            this.model.b[i] += reward * x[i];
        }

        this.model.updateCount++;

        // 每 K 次或条件数过大时重新分解
        if (this.model.updateCount % 200 === 0 || this.needsRecompute()) {
            this.model.L = this.cholesky(this.model.A, this.model.d);
        }
    }

    // Cholesky 分解 (A = L L^T)
    private cholesky(A: Float32Array, d: number): Float32Array {
        const L = new Float32Array(d * d);

        for (let i = 0; i < d; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i * d + k] * L[j * d + k];
                }

                if (i === j) {
                    L[i * d + j] = Math.sqrt(Math.max(0, A[i * d + i] - sum));
                } else {
                    L[i * d + j] = (A[i * d + j] - sum) / Math.max(1e-10, L[j * d + j]);
                }
            }
        }

        return L;
    }

    // 解线性方程 A θ = b (通过 Cholesky 分解)
    private solve(x: Float32Array): Float32Array {
        const d = this.model.d;
        const y = new Float32Array(d);
        const theta = new Float32Array(d);

        // Forward substitution: L y = b
        for (let i = 0; i < d; i++) {
            let sum = this.model.b[i];
            for (let j = 0; j < i; j++) {
                sum -= this.model.L[i * d + j] * y[j];
            }
            y[i] = sum / this.model.L[i * d + i];
        }

        // Backward substitution: L^T θ = y
        for (let i = d - 1; i >= 0; i--) {
            let sum = y[i];
            for (let j = i + 1; j < d; j++) {
                sum -= this.model.L[j * d + i] * theta[j];
            }
            theta[i] = sum / this.model.L[i * d + i];
        }

        return theta;
    }

    // 计算置信度 x^T A^(-1) x
    private computeConfidence(x: Float32Array): number {
        const d = this.model.d;
        const Ainv_x = new Float32Array(d);

        // 通过 Cholesky 分解求解 A^(-1) x
        // ...（类似 solve 方法）

        return this.dot(x, Ainv_x);
    }

    // 辅助函数
    private dot(a: Float32Array, b: Float32Array): number {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }

    private normalize(x: Float32Array): Float32Array {
        const norm = Math.sqrt(this.dot(x, x));
        const result = new Float32Array(x.length);
        for (let i = 0; i < x.length; i++) {
            result[i] = x[i] / Math.max(norm, 1e-10);
        }
        return result;
    }

    private needsRecompute(): boolean {
        // 检查条件数是否过大（简化版）
        return false;  // 实际实现需要计算条件数
    }
}
```

---

### 4.3 奖励函数设计

#### 多目标奖励

```typescript
function computeReward(
    event: Event,
    state: UserState,
    action: Action
): number {
    // 权重（可根据用户偏好调整）
    const w1 = 1.0;   // 正确性
    const w2 = 0.6;   // 疲劳惩罚
    const w3 = 0.4;   // 速度奖励
    const w4 = 0.8;   // 挫折惩罚

    // 1. 正确性奖励
    const correct = event.isCorrect ? 1 : -1;

    // 2. 疲劳惩罚（疲劳度越高惩罚越大）
    const fatiguePenalty = state.F;

    // 3. 速度奖励（比参考速度快则奖励）
    const referenceRT = 5000;  // 5秒
    const speedGain = Math.max(-1, Math.min(1, referenceRT / event.responseTime - 1));

    // 4. 挫折惩罚（重试次数多或动机低）
    const frustration = (event.retryCount > 1 || state.M < 0) ? 1 : 0;

    // 即时奖励
    const r_immediate =
        w1 * correct
        - w2 * fatiguePenalty
        + w3 * speedGain
        - w4 * frustration;

    // 归一化到 [-1, 1]
    return Math.max(-1, Math.min(1, r_immediate / 3));
}
```

#### 延迟奖励处理

```typescript
interface DelayedReward {
    episodeId: string;
    recall_1d: number;     // 次日回忆率 [0,1]
    recall_7d: number;     // 7天回忆率 [0,1]
    timestamp: number;
}

class RewardManager {
    private pendingEpisodes: Map<string, Episode> = new Map();

    // 记录当前 episode
    recordEpisode(
        episodeId: string,
        state: UserState,
        action: Action,
        immediateReward: number
    ): void {
        this.pendingEpisodes.set(episodeId, {
            state,
            action,
            immediateReward,
            timestamp: Date.now()
        });
    }

    // 异步补记延迟奖励
    async updateDelayedReward(delayed: DelayedReward): Promise<void> {
        const episode = this.pendingEpisodes.get(delayed.episodeId);
        if (!episode) return;

        // 延迟奖励权重
        const w5 = 1.0;
        const r_delayed = w5 * (delayed.recall_1d - 0.7);

        // 融合（gamma = 0.3）
        const gamma = 0.3;
        const r_total = (1 - gamma) * episode.immediateReward + gamma * r_delayed;

        // 使用融合后的奖励更新模型
        await this.agent.update(episode.state, episode.action, r_total);

        // 清理
        this.pendingEpisodes.delete(delayed.episodeId);
    }
}
```

---

### 4.4 冷启动策略

#### 三阶段策略

```typescript
class ColdStartManager {
    private interactionCount: number = 0;
    private userType: 'fast' | 'stable' | 'cautious' | null = null;

    // 阶段 1: 快速分类 (前 10-15 题)
    phase1SafeStrategy(): StrategyParams {
        return {
            interval_scale: 1.0,
            new_ratio: 0.15,
            difficulty: 'easy',
            batch_size: 8,
            hint_level: 1
        };
    }

    // 阶段 2: 用户分类
    classifyUser(stats: Stats): 'fast' | 'stable' | 'cautious' {
        const avgRT = stats.avgResponseTime;
        const accuracy = stats.accuracy;

        // 快速型：反应时 < P30，正确率 > 0.8
        if (avgRT < this.getGlobalPercentile(30) && accuracy > 0.8) {
            return 'fast';
        }
        // 稳定型：正确率 > 0.7，反应时适中
        else if (accuracy > 0.7) {
            return 'stable';
        }
        // 谨慎型：反应时长，需要更多思考时间
        else {
            return 'cautious';
        }
    }

    // 加载对应先验模型
    loadPrior(userType: 'fast' | 'stable' | 'cautious'): LinUCBModel {
        // 根据用户类型加载预训练的先验参数
        const priors = {
            fast: { /* 参数 */ },
            stable: { /* 参数 */ },
            cautious: { /* 参数 */ }
        };
        return priors[userType];
    }

    // 阶段 3: 动态探索率
    getExplorationRate(state: UserState): number {
        if (this.interactionCount < 15) {
            return 0.5;  // 低探索
        } else if (this.interactionCount < 50) {
            // 表现触发探索
            if (state.C.mem > 0.75 && state.F < 0.5) {
                return 2.0;  // 高探索
            } else {
                return 1.0;  // 中等探索
            }
        } else {
            return 0.7;  // 正常运行，低探索
        }
    }

    update(event: Event, state: UserState): void {
        this.interactionCount++;

        // 在第 12 次交互时进行分类
        if (this.interactionCount === 12) {
            this.userType = this.classifyUser(this.computeStats());
        }
    }
}
```

---

## 五、智能决策引擎

### 5.1 决策空间定义

```typescript
interface Action {
    interval_scale: 0.5 | 0.8 | 1.0 | 1.2 | 1.5;  // 5档
    new_ratio: 0.1 | 0.2 | 0.3 | 0.4;              // 4档
    difficulty: 'easy' | 'mid' | 'hard';           // 3档
    batch_size: 5 | 8 | 12 | 16;                   // 4档
    hint_level: 0 | 1 | 2;                         // 3档
}

// 总动作数 = 5 × 4 × 3 × 4 × 3 = 720 种组合
// 实际使用时剪枝到 20-50 个常用组合
```

#### 动作空间剪枝

```typescript
function generateActionSpace(): Action[] {
    const actions: Action[] = [];

    // 预定义常用组合
    const presets = [
        // 保守策略（新手/低动机）
        { interval_scale: 0.8, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },
        { interval_scale: 1.0, new_ratio: 0.1, difficulty: 'easy', batch_size: 8, hint_level: 1 },

        // 标准策略（正常状态）
        { interval_scale: 1.0, new_ratio: 0.2, difficulty: 'mid', batch_size: 8, hint_level: 1 },
        { interval_scale: 1.0, new_ratio: 0.3, difficulty: 'mid', batch_size: 12, hint_level: 0 },

        // 激进策略（高能力/高动机）
        { interval_scale: 1.2, new_ratio: 0.3, difficulty: 'mid', batch_size: 12, hint_level: 0 },
        { interval_scale: 1.5, new_ratio: 0.4, difficulty: 'hard', batch_size: 16, hint_level: 0 },

        // 疲劳保护策略
        { interval_scale: 1.2, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 1 },

        // 注意力不佳策略
        { interval_scale: 0.8, new_ratio: 0.1, difficulty: 'easy', batch_size: 5, hint_level: 2 },

        // ... 更多组合
    ];

    return presets as Action[];
}
```

---

### 5.2 决策映射

#### 从动作到策略参数

```typescript
class DecisionEngine {
    private currentParams: StrategyParams;

    mapActionToStrategy(
        action: Action,
        state: UserState
    ): StrategyParams {
        // 基础映射
        let newParams: StrategyParams = {
            interval_scale: action.interval_scale,
            new_ratio: action.new_ratio,
            difficulty: action.difficulty,
            batch_size: action.batch_size,
            hint_level: action.hint_level
        };

        // 平滑过渡（避免突变）
        const tau = 0.5;
        newParams.interval_scale = this.smooth(
            this.currentParams.interval_scale,
            newParams.interval_scale,
            tau
        );
        newParams.batch_size = Math.round(this.smooth(
            this.currentParams.batch_size,
            newParams.batch_size,
            tau
        ));

        // 应用安全约束
        newParams = this.applySafetyConstraints(newParams, state);

        this.currentParams = newParams;
        return newParams;
    }

    // 安全约束
    private applySafetyConstraints(
        params: StrategyParams,
        state: UserState
    ): StrategyParams {
        // 高疲劳保护
        if (state.F > 0.6) {
            params.interval_scale = Math.max(params.interval_scale, 1.0);
            params.new_ratio = Math.min(params.new_ratio, 0.2);
            params.batch_size = Math.min(params.batch_size, 8);
        }

        // 低动机保护
        if (state.M < -0.3) {
            params.difficulty = 'easy';
            params.hint_level = Math.max(params.hint_level, 1);
        }

        // 低注意力保护
        if (state.A < 0.3) {
            params.new_ratio = Math.min(params.new_ratio, 0.15);
            params.batch_size = Math.min(params.batch_size, 6);
        }

        // 退步趋势保护
        if (state.T === 'down') {
            params.new_ratio = Math.min(params.new_ratio, 0.1);
            params.difficulty = 'easy';
        }

        return params;
    }

    // 平滑函数
    private smooth(prev: number, target: number, tau: number): number {
        return tau * prev + (1 - tau) * target;
    }
}
```

---

### 5.3 可解释性生成

```typescript
class ExplainabilityEngine {
    generateExplanation(
        state: UserState,
        action: Action,
        oldParams: StrategyParams,
        newParams: StrategyParams
    ): string {
        // 1. 识别主要影响因素
        const contributions: Array<{
            factor: string;
            value: number;
            impact: string;
            percentage: number;
        }> = [];

        if (state.A < 0.5) {
            contributions.push({
                factor: "注意力",
                value: state.A,
                impact: state.A < 0.3 ? "严重下降" : "下降",
                percentage: (1 - state.A) * 100
            });
        }

        if (state.F > 0.5) {
            contributions.push({
                factor: "疲劳度",
                value: state.F,
                impact: state.F > 0.7 ? "较高" : "中等",
                percentage: state.F * 100
            });
        }

        if (state.M < 0) {
            contributions.push({
                factor: "动机",
                value: state.M,
                impact: "偏低",
                percentage: Math.abs(state.M) * 100
            });
        }

        if (state.C.mem < 0.6) {
            contributions.push({
                factor: "记忆力",
                value: state.C.mem,
                impact: "需要巩固",
                percentage: (1 - state.C.mem) * 100
            });
        }

        // 2. 生成状态描述
        const stateDesc = contributions
            .slice(0, 3)  // 只显示前3个主要因素
            .map(c => `${c.factor}${c.impact} ${c.percentage.toFixed(0)}%`)
            .join("，");

        // 3. 生成策略变化描述
        const changes: string[] = [];

        if (newParams.new_ratio < oldParams.new_ratio) {
            changes.push(
                `新词比例从 ${(oldParams.new_ratio * 100).toFixed(0)}% 降至 ${(newParams.new_ratio * 100).toFixed(0)}%`
            );
        } else if (newParams.new_ratio > oldParams.new_ratio) {
            changes.push(
                `新词比例从 ${(oldParams.new_ratio * 100).toFixed(0)}% 提升至 ${(newParams.new_ratio * 100).toFixed(0)}%`
            );
        }

        if (newParams.batch_size < oldParams.batch_size) {
            changes.push(`批量从 ${oldParams.batch_size} 降至 ${newParams.batch_size}`);
        } else if (newParams.batch_size > oldParams.batch_size) {
            changes.push(`批量从 ${oldParams.batch_size} 提升至 ${newParams.batch_size}`);
        }

        if (newParams.hint_level > oldParams.hint_level) {
            changes.push(`提示级别提升至 ${newParams.hint_level}`);
        }

        if (newParams.interval_scale > oldParams.interval_scale) {
            const percentage = ((newParams.interval_scale - 1) * 100).toFixed(0);
            changes.push(`复习间隔延长 ${percentage}%`);
        } else if (newParams.interval_scale < oldParams.interval_scale) {
            const percentage = ((1 - newParams.interval_scale) * 100).toFixed(0);
            changes.push(`复习间隔缩短 ${percentage}%`);
        }

        if (newParams.difficulty !== oldParams.difficulty) {
            const diffMap = { easy: '简单', mid: '中等', hard: '困难' };
            changes.push(
                `难度从${diffMap[oldParams.difficulty]}调整为${diffMap[newParams.difficulty]}`
            );
        }

        // 4. 组合最终解释
        if (contributions.length === 0 && changes.length === 0) {
            return "当前状态良好，维持现有策略。";
        }

        const changesDesc = changes.length > 0
            ? changes.join("，")
            : "维持现有策略";

        if (stateDesc) {
            return `检测到${stateDesc}。已${changesDesc}。`;
        } else {
            return `已${changesDesc}。`;
        }
    }
}
```

---

## 六、工程实现方案

### 6.1 完整的数据结构定义

```typescript
// ==================== 核心数据结构 ====================

// 用户状态
interface UserState {
    A: number;                 // 注意力 [0,1]
    F: number;                 // 疲劳度 [0,1]
    C: CognitiveProfile;       // 认知能力
    H: HabitProfile;           // 学习习惯
    M: number;                 // 动机 [-1,1]
    T: TrendState;             // 趋势
    ts: number;                // 时间戳
    conf: number;              // 置信度 [0,1]
}

// 认知能力画像
interface CognitiveProfile {
    mem: number;               // 记忆力 [0,1]
    speed: number;             // 速度 [0,1]
    stability: number;         // 稳定性 [0,1]
}

// 学习习惯画像
interface HabitProfile {
    timePref: number[];        // 24小时时间偏好分布
    pacePref: number;          // 节奏偏好(分钟)
    batchPref: number;         // 批量偏好(个数)
}

// 趋势状态
type TrendState = 'up' | 'flat' | 'stuck' | 'down';

// Bandit 模型
interface BanditModel {
    A: Float32Array;           // d×d 协方差矩阵（扁平化）
    b: Float32Array;           // d 奖励向量
    L: Float32Array;           // Cholesky 分解 L
    lambda: number;            // 正则化系数
    alpha: number;             // UCB 探索系数
    d: number;                 // 特征维度
    updateCount: number;       // 更新次数
}

// 特征向量
interface FeatureVector {
    values: Float32Array;      // d维特征
    ts: number;                // 时间戳
    labels: string[];          // 特征名称(用于解释)
}

// 动作
interface Action {
    interval_scale: number;    // 0.5 | 0.8 | 1.0 | 1.2 | 1.5
    new_ratio: number;         // 0.1 | 0.2 | 0.3 | 0.4
    difficulty: DifficultyLevel;
    batch_size: number;        // 5 | 8 | 12 | 16
    hint_level: number;        // 0 | 1 | 2
}

type DifficultyLevel = 'easy' | 'mid' | 'hard';

// 策略参数
interface StrategyParams {
    interval_scale: number;
    new_ratio: number;
    difficulty: DifficultyLevel;
    batch_size: number;
    hint_level: number;
}

// 原始事件
interface RawEvent {
    wordId: string;
    isCorrect: boolean;
    responseTime: number;      // 毫秒
    dwellTime: number;         // 停留时长
    timestamp: number;
    pauseCount: number;
    switchCount: number;
    retryCount: number;
    focusLossDuration: number; // 失焦时长
    interactionDensity: number;// 微交互密度
}

// 历史缓冲区
interface CircularBuffer<T> {
    data: T[];
    maxSize: number;
    currentIndex: number;

    push(item: T): void;
    lastK(k: number): T[];
    mean(key: keyof T): number;
    std(key: keyof T): number;
    all(): T[];
}

// Episode（用于延迟奖励）
interface Episode {
    episodeId: string;
    state: UserState;
    action: Action;
    immediateReward: number;
    timestamp: number;
}

// 延迟奖励
interface DelayedReward {
    episodeId: string;
    recall_1d: number;         // 次日回忆率 [0,1]
    recall_7d: number;         // 7天回忆率 [0,1]
    timestamp: number;
}
```

### 6.2 性能优化

#### 避免矩阵求逆

```typescript
// 使用 Cholesky 分解代替直接求逆
class MatrixOptimizer {
    // Cholesky 分解: A = L L^T
    static cholesky(A: Float32Array, d: number): Float32Array {
        const L = new Float32Array(d * d);

        for (let i = 0; i < d; i++) {
            for (let j = 0; j <= i; j++) {
                let sum = 0;
                for (let k = 0; k < j; k++) {
                    sum += L[i * d + k] * L[j * d + k];
                }

                if (i === j) {
                    L[i * d + j] = Math.sqrt(Math.max(0, A[i * d + i] - sum));
                } else {
                    L[i * d + j] = (A[i * d + j] - sum) / Math.max(1e-10, L[j * d + j]);
                }
            }
        }

        return L;
    }

    // 解线性方程 A x = b (通过 Cholesky 分解)
    static solve(L: Float32Array, b: Float32Array, d: number): Float32Array {
        const y = new Float32Array(d);
        const x = new Float32Array(d);

        // Forward substitution: L y = b
        for (let i = 0; i < d; i++) {
            let sum = b[i];
            for (let j = 0; j < i; j++) {
                sum -= L[i * d + j] * y[j];
            }
            y[i] = sum / L[i * d + i];
        }

        // Backward substitution: L^T x = y
        for (let i = d - 1; i >= 0; i--) {
            let sum = y[i];
            for (let j = i + 1; j < d; j++) {
                sum -= L[j * d + i] * x[j];
            }
            x[i] = sum / L[i * d + i];
        }

        return x;
    }
}
```

#### 预分配内存

```typescript
class MemoryPool {
    private vectors: Map<number, Float32Array[]> = new Map();
    private matrices: Map<number, Float32Array[]> = new Map();

    // 获取向量（复用）
    getVector(size: number): Float32Array {
        if (!this.vectors.has(size)) {
            this.vectors.set(size, []);
        }

        const pool = this.vectors.get(size)!;
        if (pool.length > 0) {
            return pool.pop()!;
        }

        return new Float32Array(size);
    }

    // 释放向量
    releaseVector(vec: Float32Array): void {
        const size = vec.length;
        if (!this.vectors.has(size)) {
            this.vectors.set(size, []);
        }

        // 清零
        vec.fill(0);

        // 返回池中
        this.vectors.get(size)!.push(vec);
    }

    // 类似地实现矩阵池
    getMatrix(rows: number, cols: number): Float32Array {
        const size = rows * cols;
        // ... 类似实现
    }
}
```

### 6.3 隐私保护

```typescript
class PrivacyProtectedStorage {
    private encryptionKey: CryptoKey | null = null;

    // 初始化加密密钥
    async init(): Promise<void> {
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        this.encryptionKey = key;
    }

    // 加密存储用户状态
    async saveUserState(state: UserState): Promise<void> {
        const data = JSON.stringify(state);
        const encrypted = await this.encrypt(data);
        localStorage.setItem('amas_user_state', encrypted);
    }

    // 加载用户状态
    async loadUserState(): Promise<UserState | null> {
        const encrypted = localStorage.getItem('amas_user_state');
        if (!encrypted) return null;

        const decrypted = await this.decrypt(encrypted);
        return JSON.parse(decrypted);
    }

    // 加密
    private async encrypt(data: string): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.encryptionKey,
            encoded
        );

        // 组合 IV 和密文
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        return this.arrayBufferToBase64(combined);
    }

    // 解密
    private async decrypt(encryptedData: string): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }

        const combined = this.base64ToArrayBuffer(encryptedData);
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            this.encryptionKey,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    }

    // 辅助函数
    private arrayBufferToBase64(buffer: Uint8Array): string {
        return btoa(String.fromCharCode(...buffer));
    }

    private base64ToArrayBuffer(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // 上传匿名化聚合统计（可选）
    async uploadAggregatedStats(): Promise<void> {
        const stats = {
            avg_accuracy: this.computeAverage('accuracy'),
            avg_session_length: this.computeAverage('session_length'),
            total_words_learned: this.getTotalCount(),
            // 不包含具体的单词、时间、答题记录等
        };

        // 添加差分隐私噪声（可选）
        const noisyStats = this.addDifferentialPrivacyNoise(stats);

        // 上传
        await fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noisyStats)
        });
    }

    // 差分隐私噪声
    private addDifferentialPrivacyNoise(stats: any): any {
        // 添加拉普拉斯噪声
        const epsilon = 0.1;  // 隐私预算
        const sensitivity = 0.1;

        return {
            ...stats,
            avg_accuracy: stats.avg_accuracy + this.laplaceNoise(sensitivity / epsilon),
            avg_session_length: stats.avg_session_length + this.laplaceNoise(sensitivity / epsilon)
        };
    }

    private laplaceNoise(scale: number): number {
        const u = Math.random() - 0.5;
        return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    }
}
```

### 6.4 容错机制

```typescript
class FaultTolerantAMAS {
    private agent: LinUCBAgent;
    private fallbackStrategy: StrategyParams;
    private errorCount: number = 0;
    private maxErrors: number = 5;

    constructor() {
        // 默认安全策略
        this.fallbackStrategy = {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: 'mid',
            batch_size: 8,
            hint_level: 1
        };
    }

    // 安全包装的决策函数
    async makeDecision(state: UserState): Promise<StrategyParams> {
        try {
            // 超时保护（100ms）
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Decision timeout')), 100)
            );

            const decisionPromise = this.agent.selectAction(state, this.getActionSpace());

            const action = await Promise.race([decisionPromise, timeoutPromise]);

            // 重置错误计数
            this.errorCount = 0;

            return this.mapActionToStrategy(action, state);
        } catch (error) {
            console.error('AMAS decision error:', error);

            this.errorCount++;

            // 错误次数过多，降级到纯规则策略
            if (this.errorCount >= this.maxErrors) {
                console.warn('AMAS degraded to fallback strategy');
                return this.getFallbackStrategy(state);
            }

            // 使用上一次成功的策略
            return this.getLastSuccessfulStrategy();
        }
    }

    // 基于状态的降级策略
    private getFallbackStrategy(state: UserState): StrategyParams {
        const strategy = { ...this.fallbackStrategy };

        // 基于简单规则调整
        if (state.F > 0.6) {
            strategy.batch_size = 5;
            strategy.new_ratio = 0.1;
        }

        if (state.M < 0) {
            strategy.difficulty = 'easy';
            strategy.hint_level = 2;
        }

        return strategy;
    }

    // 数据验证
    private validateState(state: UserState): boolean {
        return (
            state.A >= 0 && state.A <= 1 &&
            state.F >= 0 && state.F <= 1 &&
            state.M >= -1 && state.M <= 1 &&
            state.C.mem >= 0 && state.C.mem <= 1 &&
            state.C.speed >= 0 && state.C.speed <= 1 &&
            state.C.stability >= 0 && state.C.stability <= 1
        );
    }

    // 异常检测
    private detectAnomaly(state: UserState): boolean {
        // 检测状态是否异常（例如全为极值）
        const isAllZero =
            state.A === 0 &&
            state.F === 0 &&
            state.M === 0;

        const isAllMax =
            state.A === 1 &&
            state.F === 1 &&
            Math.abs(state.M) === 1;

        return isAllZero || isAllMax;
    }
}
```

---

## 七、实施路线图

### MVP 版本 (2-4 周)

#### 目标
验证核心算法可行性，建立基础架构

#### 功能清单

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 感知层 | 采集反应时、正确率、暂停、切屏 | P0 |
| | 基础特征工程（归一化、异常处理） | P0 |
| 建模层 | 注意力模型 A（简化版） | P0 |
| | 疲劳度模型 F（线性累积） | P0 |
| | 认知能力模型 C（仅 mem 和 speed） | P0 |
| | 动机模型 M（简化指数打分） | P1 |
| 学习层 | LinUCB，特征维度 d = 10 | P0 |
| | 冷启动保护策略 | P0 |
| 决策层 | 小动作空间（20个预定义组合） | P0 |
| | 安全约束检查 | P0 |
| | 模板化解释文本 | P1 |
| 评估 | 短期指标监控 | P0 |
| | 日志记录 | P0 |

#### 不包含
- ❌ 习惯模型 H
- ❌ 趋势模型 T
- ❌ 微交互采集
- ❌ 延迟奖励管道
- ❌ 复杂可解释性

#### 技术选型
- TypeScript + Float32Array
- 本地 IndexedDB 存储
- Cholesky 分解 + 定期重分解

#### 成功标准
- 决策延迟 < 100ms（P95）
- 模型大小 < 500KB
- 短期指标（正确率、完成率）与基线持平或提升 5%

---

### 扩展版 (4-8 周，在 MVP 基础上)

#### 新增功能

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 感知层 | 微交互采集（鼠标、键盘密度） | P1 |
| | 失焦时长精确追踪 | P1 |
| 建模层 | 习惯模型 H（时间偏好、节奏偏好） | P1 |
| | 趋势模型 T（长期进步曲线） | P1 |
| | 疲劳度非线性恢复 | P1 |
| 学习层 | 特征扩展到 d = 20-30（交叉项） | P1 |
| | LinTS 作为备选算法 | P2 |
| 决策层 | 动态权重个性化 | P1 |
| | 细化可解释性（特征贡献度） | P2 |
| 奖励 | 延迟奖励异步补记 | P1 |
| | 多目标权重调整 | P2 |

#### 优化重点
- 提升探索效率
- 增强数值稳定性
- 完善安全约束

#### 成功标准
- 7天回忆率提升 8-10%
- 用户满意度提升（通过问卷）
- 系统稳定性（错误率 < 0.1%）

---

### 完整版 (> 8 周，在扩展版基础上)

#### 高级功能

| 模块 | 功能 | 优先级 |
|------|------|--------|
| 学习层 | 非线性 Bandit（Neural Linear） | P2 |
| | 元学习（跨用户迁移） | P2 |
| | 用户自动分群 | P2 |
| 决策层 | SHAP 值特征归因 | P3 |
| | 多目标 Pareto 前沿 | P3 |
| 评估 | 离线重放评估 | P2 |
| | 反事实分析 | P3 |
| | 自动化 A/B 测试平台 | P2 |
| 工程 | 模型版本管理 | P2 |
| | 异常检测和自动降级 | P1 |
| | 完整的监控告警系统 | P1 |

#### 成功标准
- 30天留存率提升 15%
- 学习效率（单位时间掌握量）提升 20%
- 系统可用性 > 99.9%

---

## 八、评估体系

### 8.1 评估指标

#### 短期指标 (天级)

| 指标 | 定义 | 目标 | 监控频率 |
|------|------|------|---------|
| 即时正确率 | 当次答题正确的比例 | ≥ 70% | 实时 |
| 平均反应时 | 平均答题用时 | < 6s | 实时 |
| 会话完成率 | 完成学习计划的比例 | ≥ 85% | 每日 |
| 退出率 | 中途退出的比例 | < 15% | 每日 |
| 疲劳度均值 | 平均疲劳度 | < 0.5 | 每日 |
| 决策延迟 | 算法决策耗时（P95） | < 100ms | 实时 |

#### 中期指标 (周级)

| 指标 | 定义 | 目标 | 监控频率 |
|------|------|------|---------|
| 首次通过率 | 首次见面即掌握的比例 | ≥ 60% | 每周 |
| 7天回忆率 | 7天后仍能正确回忆的比例 | ≥ 75% | 每周 |
| 错误重现率 | 之前错误再次出现的比例 | < 20% | 每周 |
| 学习频率 | 每周学习次数 | ≥ 4 次/周 | 每周 |
| 用户活跃度 | 活跃天数占比 | ≥ 70% | 每周 |

#### 长期指标 (月级)

| 指标 | 定义 | 目标 | 监控频率 |
|------|------|------|---------|
| 30天留存率 | 30天后仍在使用的比例 | ≥ 60% | 每月 |
| 单位时间掌握量 | 每小时掌握的单词数 | ≥ 15 个/时 | 每月 |
| 长期回忆率 | 30天后的回忆率 | ≥ 70% | 每月 |
| 用户满意度 | NPS 评分 | ≥ 8/10 | 每月 |
| 学习目标达成率 | 完成学习目标的比例 | ≥ 80% | 每月 |

---

### 8.2 A/B 测试设计

#### 测试配置

```typescript
interface ABTestConfig {
    name: string;                    // 测试名称
    description: string;             // 测试描述
    control: 'baseline' | 'current'; // 对照组策略
    treatment: 'AMAS';               // 实验组策略
    splitRatio: number;              // 分流比例（0-1）
    stratification: 'activity' | 'ability' | 'random';  // 分层策略
    metrics: string[];               // 评估指标
    minSampleSize: number;           // 最小样本量
    minDuration: number;             // 最短运行天数
    startDate: Date;
    endDate?: Date;
}
```

#### 示例配置

```typescript
const abTest: ABTestConfig = {
    name: 'AMAS_MVP_Test_v1',
    description: '测试 AMAS MVP 版本对学习效果的影响',
    control: 'current',
    treatment: 'AMAS',
    splitRatio: 0.5,
    stratification: 'activity',  // 按活跃度分层
    metrics: [
        'recall_1d',
        'recall_7d',
        'session_completion_rate',
        'exit_rate',
        'avg_fatigue',
        'user_satisfaction'
    ],
    minSampleSize: 1000,
    minDuration: 14,
    startDate: new Date('2025-02-01')
};
```

#### 分层随机化

```typescript
class StratifiedRandomization {
    assign(userId: string, userProfile: UserProfile): 'control' | 'treatment' {
        // 按活跃度分层
        const activityLevel = this.getActivityLevel(userProfile);

        // 使用用户ID的哈希值保证一致性
        const hash = this.hashUserId(userId);
        const threshold = 0.5;  // 50% 分流

        // 在每个层内随机分配
        return (hash % 100) / 100 < threshold ? 'control' : 'treatment';
    }

    private getActivityLevel(profile: UserProfile): 'low' | 'mid' | 'high' {
        const sessionsPerWeek = profile.sessionsLastWeek;
        if (sessionsPerWeek < 2) return 'low';
        if (sessionsPerWeek < 5) return 'mid';
        return 'high';
    }

    private hashUserId(userId: string): number {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = ((hash << 5) - hash) + userId.charCodeAt(i);
            hash = hash & hash;  // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
}
```

#### 统计检验

```typescript
class StatisticalTest {
    // t-test
    tTest(control: number[], treatment: number[]): {
        tStatistic: number;
        pValue: number;
        significant: boolean;
    } {
        const n1 = control.length;
        const n2 = treatment.length;

        const mean1 = this.mean(control);
        const mean2 = this.mean(treatment);

        const var1 = this.variance(control);
        const var2 = this.variance(treatment);

        // Welch's t-test
        const tStatistic =
            (mean1 - mean2) /
            Math.sqrt(var1 / n1 + var2 / n2);

        const df = Math.floor(
            Math.pow(var1 / n1 + var2 / n2, 2) /
            (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1))
        );

        const pValue = this.tDistribution(tStatistic, df);

        return {
            tStatistic,
            pValue,
            significant: pValue < 0.05
        };
    }

    // 贝叶斯 A/B 测试
    bayesianABTest(
        control: number[],
        treatment: number[]
    ): {
        probability: number;  // treatment 优于 control 的概率
        expectedLift: number; // 预期提升
    } {
        // 使用 Beta 分布建模成功率
        const alpha_c = control.filter(x => x > 0.7).length + 1;
        const beta_c = control.length - alpha_c + 1;

        const alpha_t = treatment.filter(x => x > 0.7).length + 1;
        const beta_t = treatment.length - alpha_t + 1;

        // Monte Carlo 采样
        const samples = 10000;
        let treatmentBetter = 0;
        let totalLift = 0;

        for (let i = 0; i < samples; i++) {
            const p_c = this.betaSample(alpha_c, beta_c);
            const p_t = this.betaSample(alpha_t, beta_t);

            if (p_t > p_c) {
                treatmentBetter++;
                totalLift += (p_t - p_c) / p_c;
            }
        }

        return {
            probability: treatmentBetter / samples,
            expectedLift: totalLift / samples
        };
    }
}
```

---

### 8.3 持续优化机制

```typescript
class ContinuousOptimization {
    // 监控指标
    async monitorMetrics(): Promise<MetricsReport> {
        const metrics = await this.collectMetrics();

        // 检测异常
        const anomalies = this.detectAnomalies(metrics);

        if (anomalies.length > 0) {
            await this.handleAnomalies(anomalies);
        }

        return {
            metrics,
            anomalies,
            recommendations: this.generateRecommendations(metrics)
        };
    }

    // 异常检测
    private detectAnomalies(metrics: Metrics): Anomaly[] {
        const anomalies: Anomaly[] = [];

        // 检测指标下降
        if (metrics.recall_1d < 0.65) {
            anomalies.push({
                type: 'metric_drop',
                metric: 'recall_1d',
                value: metrics.recall_1d,
                threshold: 0.65,
                severity: 'high'
            });
        }

        // 检测系统错误率
        if (metrics.error_rate > 0.01) {
            anomalies.push({
                type: 'system_error',
                metric: 'error_rate',
                value: metrics.error_rate,
                threshold: 0.01,
                severity: 'critical'
            });
        }

        return anomalies;
    }

    // 自动调整参数
    private async autoTuneParameters(metrics: Metrics): Promise<void> {
        // 根据指标表现自动调整探索率、权重等
        if (metrics.exploration_efficiency < 0.5) {
            // 探索效率低，降低探索率
            this.adjustExplorationRate(0.8);
        }

        if (metrics.user_satisfaction < 7.5) {
            // 用户满意度低，增加体验权重
            this.adjustRewardWeights({
                effectiveness: 0.4,
                experience: 0.4,
                efficiency: 0.2
            });
        }
    }

    // 生成优化建议
    private generateRecommendations(metrics: Metrics): Recommendation[] {
        const recommendations: Recommendation[] = [];

        if (metrics.decision_latency_p95 > 80) {
            recommendations.push({
                priority: 'high',
                category: 'performance',
                description: '决策延迟接近阈值，建议优化算法或降低特征维度'
            });
        }

        if (metrics.model_convergence < 0.8) {
            recommendations.push({
                priority: 'medium',
                category: 'algorithm',
                description: '模型收敛性不足，建议增加探索或调整正则化'
            });
        }

        return recommendations;
    }
}
```

---

## 九、附录

### 9.1 参考文献

1. **Contextual Bandit**
   - Li, L., Chu, W., Langford, J., & Schapire, R. E. (2010). A contextual-bandit approach to personalized news article recommendation. In WWW.
   - Agrawal, S., & Goyal, N. (2013). Thompson sampling for contextual bandits with linear payoffs. In ICML.

2. **记忆与学习科学**
   - Ebbinghaus, H. (1885). Memory: A contribution to experimental psychology.
   - Bjork, R. A., & Bjork, E. L. (1992). A new theory of disuse and an old theory of stimulus fluctuation.

3. **间隔重复算法**
   - Wozniak, P. A., & Gorzelanczyk, E. J. (1994). Optimization of repetition spacing in the practice of learning.
   - Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. In ACL.

4. **用户建模**
   - Rich, E. (1979). User modeling via stereotypes. Cognitive science, 3(4), 329-354.
   - Kobsa, A. (2001). Generic user modeling systems. User modeling and user-adapted interaction, 11(1-2), 49-63.

### 9.2 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| 注意力 | Attention | 用户当前的专注程度 [0,1] |
| 疲劳度 | Fatigue | 用户当前的疲劳程度 [0,1] |
| 认知能力 | Cognitive Ability | 用户的学习能力画像 {mem, speed, stability} |
| 动机 | Motivation | 用户的学习动机 [-1,1] |
| 趋势 | Trend | 长期能力变化趋势 {up, flat, stuck, down} |
| Contextual Bandit | 上下文老虎机 | 在线学习算法，根据上下文选择最优动作 |
| LinUCB | Linear UCB | 线性上界置信算法 |
| LinTS | Linear Thompson Sampling | 线性 Thompson 采样算法 |
| 探索-利用 | Exploration-Exploitation | 平衡尝试新策略和利用已知最优策略 |
| 冷启动 | Cold Start | 新用户数据不足时的初始化策略 |
| 间隔重复 | Spaced Repetition | 根据遗忘曲线调整复习间隔的学习方法 |

### 9.3 常见问题 FAQ

**Q1: AMAS 与现有算法是什么关系？**
A: AMAS 是增强层，不是替代。它作为智能调度层，动态调整现有算法的参数。

**Q2: 算法需要多少数据才能有效工作？**
A: MVP 版本在 50 次交互后基本可用，200 次交互后效果稳定。使用冷启动策略和迁移学习可以加速。

**Q3: 如何保证用户隐私？**
A: 所有计算在本地完成，数据加密存储。可选上传的仅为匿名化聚合统计，且添加了差分隐私噪声。

**Q4: 算法会不会让学习变得太简单或太难？**
A: 有完善的安全约束机制，不会让难度偏离合理范围。同时会根据用户反馈持续调整。

**Q5: 如果算法出错怎么办？**
A: 有多层容错机制：超时保护、异常检测、自动降级到安全策略。

**Q6: 算法的决策可以解释吗？**
A: 可以。每个决策都会生成自然语言解释，告诉用户"为什么这样调整"。

**Q7: 不同用户的算法会不同吗？**
A: 是的。算法会自主学习每个用户的特点，实现真正的个性化。

**Q8: 算法需要联网吗？**
A: 不需要。所有计算在本地完成，离线也能正常工作。

---

## 结语

AMAS（自适应多维度用户感知智能学习算法）是一套经过深入设计、充分讨论和多轮优化的完整算法系统。它不仅具有理论创新性，更注重工程可行性和用户体验。

通过渐进式的实施路线（MVP → 扩展版 → 完整版），可以在控制风险的同时，逐步验证和完善算法，最终为用户提供真正智能、个性化的学习体验。

**核心优势**：
- ✅ 真正的自适应：无需人工调参
- ✅ 多维度感知：全面理解用户状态
- ✅ 轻量高效：前端实时运行
- ✅ 高度可解释：每个决策都透明
- ✅ 隐私优先：本地计算，数据安全
- ✅ 渐进演化：清晰的实施路线

期待这套算法能够真正改善用户的学习体验，帮助更多人高效地掌握知识！

---

**文档版本**: 1.0
**最后更新**: 2025-01-24
**作者**: AI 算法设计团队
**状态**: 设计完成，待实现
