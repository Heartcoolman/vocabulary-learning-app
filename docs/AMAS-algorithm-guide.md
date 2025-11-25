# 自适应多维度用户感知智能学习算法

## AMAS (Adaptive Multi-dimensional Aware System)

## 算法概述

这是一套能够实时感知用户状态、自主学习最优策略、动态调整学习参数的智能算法系统。核心特点：

- ✅ **多维度感知**：注意力、疲劳、能力、习惯、动机、趋势
- ✅ **自主学习**：无需人工调参，从用户行为中自动优化
- ✅ **轻量高效**：前端实时运行，单次决策 < 100ms，模型 < 1MB
- ✅ **高度可解释**：每个决策都能向用户解释原因
- ✅ **隐私优先**：所有计算本地完成，不上传原始数据
- ✅ **渐进演化**：MVP → 扩展版 → 完整版的实施路线

---

## 一、核心架构设计

### 四层架构

```
┌─────────────────────────────────────────────────────────┐
│  用户交互层                                              │
│  (答题、暂停、切屏等行为)                               │
└───────────────┬─────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  感知层 (Perception Layer)                               │
│  • 采集行为数据:反应时、正确率、暂停、切屏、微交互      │
│  • 特征工程:清洗、归一化、异常处理                      │
│  • 输出:标准化特征向量 x_t                              │
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
│  • 输出:用户状态向量 S_t = {A, F, C, H, M, T}            │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  学习层 (Learning Layer)                                 │
│  • Contextual Bandit (LinUCB/LinTS)                      │
│  • 探索-利用平衡                                         │
│  • 在线增量更新                                          │
│  • 输出:最优动作分布 π(a|S_t)                           │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│  决策层 (Decision Layer)                                 │
│  • 动作映射:间隔缩放、新词比例、难度等级、批量大小       │
│  • 约束检查:安全边界、平滑过渡                          │
│  • 可解释性生成                                          │
│  • 输出:具体策略参数 + 解释文本                          │
└───────────────┬───────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────────────────┐
│  执行层                                                  │
│  • 调用现有算法引擎 (SpacedRepetition, Priority...)    │
│  • 收集反馈奖励                                          │
│  • 记录日志用于在线更新                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 二、多维度用户状态建模

### 1. 注意力监测模型 (Attention Monitor)

**定义**：用户当前的专注程度，0 = 完全分心，1 = 高度专注

**输入特征**：
- `z_rt_mean`: 反应时间均值(标准化)
- `z_rt_cv`: 反应时间变异系数
- `z_pace_cv`: 答题节奏变异系数
- `z_pause`: 暂停次数(标准化)
- `z_switch`: 切屏次数(标准化)
- `z_drift`: 速度漂移(最近 vs 基线)
- `interaction_density`: 微交互密度(鼠标/键盘事件率)
- `focus_loss_duration`: 失焦累计时长

**数学模型**：

```
A_raw = sigmoid(-w · f_attention)
A_t = β · A_{t-1} + (1 - β) · A_raw

其中:
- w = [-0.25, -0.35, -0.2, -0.15, -0.2, -0.15, -0.3, -0.4]
- β = 0.8 (平滑系数)
- sigmoid(x) = 1 / (1 + e^(-x))
```

**改进点**：
- 增加微交互密度检测（鼠标移动稀疏度、键盘节奏）
- 提供"学习相关切出"标记按钮（查词典、记笔记）
- 停顿分类：< 3s 视为思考，3-20s 减弱权重，> 20s 计入分心

**决策影响**：
- `A < 0.3`：降低新词比例至 10-15%，缩短批量至 5-8 个，增加提示级别
- `A < 0.5`：适度降低难度，延长复习间隔衰减

### 2. 疲劳度评估模型 (Fatigue Estimator)

**定义**：用户当前的疲劳程度，0 = 精力充沛，1 = 极度疲劳

**输入特征**：
- `session_duration`: 会话时长(分钟)
- `error_rate_trend`: 错误率趋势(上升/下降)
- `rt_increase_rate`: 反应时上升率
- `repeat_errors`: 重复错误次数

**数学模型（非线性恢复）**：

```
// 学习中累积
F_accumulate = β·Δerr + γ·Δrt + δ·repeat

// 休息时指数衰减
F_decay = F_t · exp(-k · Δt_minutes)

// 综合
F_{t+1} = max(F_accumulate, F_decay)
F_{t+1} = clip(F_{t+1}, 0.05, 1.0)

参数推荐:
- β = 0.3 (错误率权重)
- γ = 0.25 (反应时权重)
- δ = 0.2 (重复错误权重)
- k = 0.08 (衰减系数，5分钟后剩 ~67%，60分钟后剩 ~1%)
```

**改进点**：
- 使用指数时间衰减而非固定系数
- 区分短休息（指数衰减）和长休息（> 30分钟重置为 0.1）
- 使用 `max(F_raw, F_recovered)` 体现坚持学习时的累积效应

**决策影响**：
- `F > 0.6`：启动保护模式，降低难度，缩减批量，延长休息提示
- `F > 0.8`：强制建议休息，暂停新词推送

### 3. 认知能力评估模型 (Cognitive Profiler)

**定义**：用户的学习能力画像，包含记忆力、速度、稳定性三个维度

**数学模型（长短期融合）**：

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

**三个维度**：
- `mem`: 记忆力 = 正确率的EMA
- `speed`: 速度 = normalize(1 / 平均反应时)
- `stability`: 稳定性 = 1 - normalize(错误率方差)

**决策影响**：
- `mem` 高：增加新词比例，延长间隔
- `speed` 快：缩短批量间隔，增加单次数量
- `stability` 低：降低难度，增加重复次数

### 4. 学习习惯识别模型 (Habit Recognizer)

**定义**：用户的学习时间偏好、节奏偏好、批量偏好

**数学模型**：
- `time_pref`: 24小时直方图，识别活跃时间段
- `pace_pref`: 会话长度分布的中位数和众数
- `batch_pref`: 单次学习单词数的中位数

**决策影响**：
- 在 `time_pref` 峰值时段推送学习提醒
- 根据 `pace_pref` 调整默认会话时长
- 根据 `batch_pref` 设置默认批量大小

### 5. 情绪/动机追踪模型 (Motivation Tracker)

**定义**：用户的学习动机和情绪状态，-1 = 极度受挫，1 = 高度积极

**数学模型（指数打分）**：

```
M_t = clip(ρ·M_{t-1} + κ·succ - λ·fail - μ·quit, -1, 1)

参数:
- ρ = 0.85 (记忆系数)
- κ = 0.3 (成功奖励)
- λ = 0.4 (失败惩罚)
- μ = 0.6 (退出惩罚)
```

**区分短期挫折和长期低动机**：
- 短期挫折：单次失败后快速恢复
- 长期低动机：M 持续 < 0 超过 10 次交互

**决策影响**：
- `M < 0`：降低难度，增加正反馈提示，减少新词
- `M > 0.5`：增加挑战性，提升新词比例

### 6. 长期趋势分析模型 (Trend Analyzer)

**定义**：用户能力的长期变化趋势

**数学模型（分段线性 + 突变检测）**：

```
slope = linear_regression(能力指标, 时间窗口=30天)

if slope > τ_pos: T = "进步"
elif slope < τ_neg: T = "退步"
elif 近零 && 低波动: T = "平稳"
else: T = "停滞"

参数:
- τ_pos = 0.01 / 天
- τ_neg = -0.005 / 天
```

**决策影响**：
- 退步/停滞：插入巩固练习，错题回顾，降低新词比例
- 进步：适度增加挑战

---

## 三、自主学习机制 (Contextual Bandit)

### 核心算法：LinUCB/LinTS

**选择理由**：
- 在线学习，无需大量历史数据
- 轻量级，满足前端实时要求（< 100ms，< 1MB）
- 可解释，基于线性模型
- 有理论保证（regret bound）

### LinUCB 伪代码

```javascript
// 初始化
function initLinUCB(d, lambda, alpha):
    A = I_d × lambda          // d×d 单位矩阵 × 正则化系数
    b = zeros(d)              // d×1 向量
    L = cholesky(A)           // Cholesky 分解，L L^T = A
    return {A, b, L, lambda, alpha}

// 特征构造
function buildContextVector(state, action):
    // 状态特征 (d_s ≈ 8)
    state_vec = [
        state.A,              // 注意力
        state.F,              // 疲劳度
        state.C.mem,          // 记忆力
        state.C.speed,        // 速度
        state.M,              // 动机
        recent_error_rate,    // 近期错误率
        recent_rt,            // 近期反应时
        time_bucket           // 时间桶 (one-hot)
    ]

    // 动作特征 (d_a ≈ 2)
    action_vec = [
        action.interval_scale,
        action.new_ratio
    ]

    // 交叉项 (避免过多特征，仅选关键交叉)
    cross_vec = [
        state.A × state.F     // 注意力×疲劳
    ]

    // 拼接并归一化
    x = normalize(concat(state_vec, action_vec, cross_vec))
    return x  // 总维度 d ≈ 10-12

// 动作选择 (LinUCB)
function selectActionUCB(state, actions, model):
    best_score = -∞
    best_action = null

    for action in actions:
        x = buildContextVector(state, action)

        // 解线性方程 A θ = b (避免直接求逆)
        θ = solve(model.L, model.b)  // 通过 Cholesky 分解求解

        // UCB 分数 = 预期奖励 + 置信上界
        exploitation = θ · x
        confidence = model.alpha × sqrt(x^T · solve(model.L, x))
        ucb_score = exploitation + confidence

        if ucb_score > best_score:
            best_score = ucb_score
            best_action = action

    return best_action

// 模型更新 (Cholesky rank-1 update)
function updateLinUCB(model, state, action, reward):
    x = buildContextVector(state, action)

    // 更新
    model.A += x x^T
    model.b += reward × x

    // 每 K 次或条件数过大时重新分解
    model.update_count += 1
    if model.update_count % 200 == 0 or condition_number(model.A) > 1e6:
        model.L = cholesky(model.A)
    else:
        // Cholesky rank-1 update (更高效)
        model.L = cholesky_rank1_update(model.L, x)

    return model
```

### LinTS (Thompson Sampling) 伪代码

```javascript
// 动作选择 (Thompson Sampling)
function selectActionTS(state, actions, model):
    // 求解 μ = A^(-1) b
    μ = solve(model.L, model.b)

    // 从后验分布采样 θ ~ N(μ, A^(-1))
    θ = sample_multivariate_normal(μ, model.L)

    // 选择使 θ · x 最大的动作
    best_action = argmax(
        action in actions,
        θ · buildContextVector(state, action)
    )

    return best_action
```

### 奖励函数设计

```javascript
function computeReward(event, state, action):
    // 权重 (可根据用户偏好调整)
    w1 = 1.0   // 正确性
    w2 = 0.6   // 疲劳惩罚
    w3 = 0.4   // 速度奖励
    w4 = 0.8   // 挫折惩罚

    // 即时奖励
    correct = event.isCorrect ? 1 : -1
    fatigue_penalty = state.F
    speed_gain = clamp(reference_rt / event.responseTime - 1, -1, 1)
    frustration = (event.retryCount > 1 or state.M < 0) ? 1 : 0

    r_immediate =
        w1 × correct
        - w2 × fatigue_penalty
        + w3 × speed_gain
        - w4 × frustration

    // 延迟奖励 (次日回忆率，异步补记)
    // r_delayed = w5 × (recall_1d - 0.7)  (w5 = 1.0)
    // r_total = (1 - gamma) × r_immediate + gamma × r_delayed

    // 暂时只返回即时奖励，延迟奖励异步补记
    return normalize(r_immediate, -2, 2)  // 归一化到 [-1, 1]
```

### 冷启动策略

```javascript
function coldStart(user):
    // 阶段1: 快速分类 (前 10-15 题)
    if interaction_count < 15:
        // 使用保守安全策略
        strategy = {
            interval_scale: 1.0,
            new_ratio: 0.15,
            difficulty: 'easy',
            batch_size: 8,
            hint_level: 1
        }

        // 低探索率
        alpha = 0.5

        // 收集数据进行分类
        if interaction_count == 12:
            user_type = classifyUser(stats)  // 快速型/稳定型/谨慎型
            // 加载对应的先验模型
            model = loadPrior(user_type)

    // 阶段2: 渐进探索 (15-50 题)
    elif interaction_count < 50:
        // 表现触发探索
        if recent_accuracy > 0.75 and state.F < 0.5:
            alpha = 2.0  // 高探索
        else:
            alpha = 1.0  // 中等探索

    // 阶段3: 正常运行 (> 50 题)
    else:
        alpha = 0.7  // 低探索，主要利用
```

---

## 四、智能决策引擎

### 决策空间定义

```typescript
interface Action {
    interval_scale: 0.5 | 0.8 | 1.0 | 1.2 | 1.5  // 5档
    new_ratio: 0.1 | 0.2 | 0.3 | 0.4               // 4档
    difficulty: 'easy' | 'mid' | 'hard'            // 3档
    batch_size: 5 | 8 | 12 | 16                    // 4档
    hint_level: 0 | 1 | 2                          // 3档
}

// 总动作数 = 5 × 4 × 3 × 4 × 3 = 720 种组合
// 实际使用时可剪枝到 20-50 个常用组合
```

### 决策映射（从动作到策略参数）

```javascript
function mapActionToStrategy(action, current_params, state):
    // 基础映射
    new_params = {
        interval_scale: action.interval_scale,
        new_ratio: action.new_ratio,
        difficulty: action.difficulty,
        batch_size: action.batch_size,
        hint_level: action.hint_level
    }

    // 平滑过渡 (避免突变)
    tau = 0.5
    new_params.interval_scale = smooth(
        current_params.interval_scale,
        new_params.interval_scale,
        tau
    )
    new_params.batch_size = round(smooth(
        current_params.batch_size,
        new_params.batch_size,
        tau
    ))

    // 安全约束
    if state.F > 0.6:  // 高疲劳
        new_params.interval_scale = max(new_params.interval_scale, 1.0)
        new_params.new_ratio = min(new_params.new_ratio, 0.2)
        new_params.batch_size = min(new_params.batch_size, 8)

    if state.M < -0.3:  // 低动机
        new_params.difficulty = 'easy'
        new_params.hint_level = max(new_params.hint_level, 1)

    if state.A < 0.3:  // 低注意力
        new_params.new_ratio = min(new_params.new_ratio, 0.15)
        new_params.batch_size = min(new_params.batch_size, 6)

    return new_params

function smooth(prev, target, tau):
    return tau × prev + (1 - tau) × target
```

### 可解释性生成

```javascript
function generateExplanation(state, action, features, old_params, new_params):
    // 1. 识别主要影响因素
    contributions = []

    if state.A < 0.5:
        contributions.push({
            factor: "注意力",
            value: state.A,
            impact: "下降",
            percentage: (1 - state.A) × 100
        })

    if state.F > 0.5:
        contributions.push({
            factor: "疲劳度",
            value: state.F,
            impact: "中等",
            percentage: state.F × 100
        })

    if state.M < 0:
        contributions.push({
            factor: "动机",
            value: state.M,
            impact: "偏低",
            percentage: abs(state.M) × 100
        })

    // 2. 生成状态描述
    state_desc = contributions
        .slice(0, 3)
        .map(c => `${c.factor}${c.impact} ${c.percentage.toFixed(0)}%`)
        .join("，")

    // 3. 生成策略变化描述
    changes = []

    if new_params.new_ratio < old_params.new_ratio:
        changes.push(`新词比例从 ${old_params.new_ratio×100}% 降至 ${new_params.new_ratio×100}%`)

    if new_params.batch_size < old_params.batch_size:
        changes.push(`批量从 ${old_params.batch_size} 降至 ${new_params.batch_size}`)

    if new_params.hint_level > old_params.hint_level:
        changes.push(`提示级别提升至 ${new_params.hint_level}`)

    if new_params.interval_scale > old_params.interval_scale:
        changes.push(`复习间隔延长 ${((new_params.interval_scale-1)×100).toFixed(0)}%`)

    changes_desc = changes.join("，")

    // 4. 组合最终解释
    explanation = `检测到${state_desc}。已${changes_desc}。`

    return explanation
}
```

---

## 五、完整的工程实现方案

### 数据结构定义 (TypeScript)

```typescript
// 用户状态
interface UserState {
    A: number;                 // 注意力 [0,1]
    F: number;                 // 疲劳度 [0,1]
    C: {
        mem: number;          // 记忆力 [0,1]
        speed: number;        // 速度 [0,1]
        stability: number;    // 稳定性 [0,1]
    };
    H: {
        timePref: number[];   // 24小时时间偏好分布
        pacePref: number;     // 节奏偏好(分钟)
        batchPref: number;    // 批量偏好(个数)
    };
    M: number;                // 动机 [-1,1]
    T: 'up' | 'flat' | 'stuck' | 'down';  // 趋势
    ts: number;               // 时间戳
    conf: number;             // 置信度 [0,1]
}

// Bandit 模型
interface BanditModel {
    A: Float32Array;          // d×d 矩阵 (flattened)
    b: Float32Array;          // d×1 向量
    L: Float32Array;          // Cholesky 分解 L (lower triangular)
    lambda: number;           // 正则化系数
    alpha: number;            // UCB 探索系数
    d: number;                // 特征维度
    update_count: number;     // 更新次数
}

// 特征向量
interface FeatureVector {
    values: Float32Array;     // d维特征
    ts: number;               // 时间戳
    labels: string[];         // 特征名称(用于解释)
}

// 动作
interface Action {
    interval_scale: number;   // 0.5 | 0.8 | 1.0 | 1.2 | 1.5
    new_ratio: number;        // 0.1 | 0.2 | 0.3 | 0.4
    difficulty: 'easy' | 'mid' | 'hard';
    batch_size: number;       // 5 | 8 | 12 | 16
    hint_level: number;       // 0 | 1 | 2
}

// 策略参数
interface StrategyParams {
    interval_scale: number;
    new_ratio: number;
    difficulty: 'easy' | 'mid' | 'hard';
    batch_size: number;
    hint_level: number;
}

// 原始事件
interface RawEvent {
    wordId: string;
    isCorrect: boolean;
    responseTime: number;     // 毫秒
    dwellTime: number;        // 停留时长
    timestamp: number;
    pauseCount: number;
    switchCount: number;
    retryCount: number;
    focusLossDuration: number; // 失焦时长
    interactionDensity: number; // 微交互密度
}

// 历史缓冲区
interface CircularBuffer<T> {
    data: T[];
    maxSize: number;
    push(item: T): void;
    lastK(k: number): T[];
    mean(key: keyof T): number;
    std(key: keyof T): number;
}
```

### 性能优化技巧

```javascript
// 1. 避免矩阵求逆 - 使用 Cholesky 分解
function solveLinearSystem(L: Float32Array, b: Float32Array, d: number): Float32Array {
    // Forward substitution: L y = b
    const y = new Float32Array(d);
    for (let i = 0; i < d; i++) {
        let sum = b[i];
        for (let j = 0; j < i; j++) {
            sum -= L[i * d + j] * y[j];
        }
        y[i] = sum / L[i * d + i];
    }

    // Backward substitution: L^T x = y
    const x = new Float32Array(d);
    for (let i = d - 1; i >= 0; i--) {
        let sum = y[i];
        for (let j = i + 1; j < d; j++) {
            sum -= L[j * d + i] * x[j];
        }
        x[i] = sum / L[i * d + i];
    }

    return x;
}

// 2. Cholesky rank-1 update (避免每次完全重分解)
function choleskyRank1Update(L: Float32Array, x: Float32Array, d: number): Float32Array {
    // 实现 Cholesky rank-1 update algorithm
    // L_new L_new^T = L L^T + x x^T
    // 详细算法见 LINPACK 库
    // 时间复杂度: O(d^2) vs 完全分解 O(d^3)
}

// 3. 预分配内存，避免 GC
class BanditOptimized {
    private tempVector: Float32Array;
    private tempMatrix: Float32Array;

    constructor(d: number) {
        this.tempVector = new Float32Array(d);
        this.tempMatrix = new Float32Array(d * d);
    }

    // 复用临时数组，避免频繁分配
    computeUCB(x: Float32Array): number {
        // 使用 this.tempVector 作为临时存储
        // ...
    }
}

// 4. 特征拼接使用视图，避免拷贝
function buildContextVectorOptimized(
    state: Float32Array,
    action: Float32Array,
    output: Float32Array
): void {
    // 直接写入output，避免创建中间数组
    output.set(state, 0);
    output.set(action, state.length);
}
```

### 隐私保护方案

```typescript
class PrivacyProtectedStorage {
    // 所有数据本地加密存储
    async saveUserState(state: UserState): Promise<void> {
        const encrypted = await this.encrypt(JSON.stringify(state));
        localStorage.setItem('user_state', encrypted);
    }

    // 仅上传聚合统计（可选）
    async uploadAggregatedStats(): Promise<void> {
        const stats = {
            avg_accuracy: this.computeAverage('accuracy'),
            avg_session_length: this.computeAverage('session_length'),
            total_words_learned: this.getTotalCount(),
            // 不包含具体的单词、时间、答题记录等
        };

        // 差分隐私噪声（可选）
        const noisyStats = this.addDifferentialPrivacyNoise(stats);

        await this.api.upload(noisyStats);
    }

    private async encrypt(data: string): Promise<string> {
        // 使用 Web Crypto API
        const key = await this.getEncryptionKey();
        const encoded = new TextEncoder().encode(data);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: this.getIV() },
            key,
            encoded
        );
        return this.arrayBufferToBase64(encrypted);
    }
}
```

---

## 六、实施路线图

### MVP 版本 (2-4 周)

**核心功能**：
- ✅ 感知层：采集反应时、正确率、暂停、切屏、微交互
- ✅ 建模层：A(注意力)、F(疲劳)、C(能力)、M(动机) - 简化版
- ✅ 学习层：LinTS，特征维度 d ≈ 10
- ✅ 决策层：小动作空间（20-30个预定义组合）
- ✅ 可解释性：模板化解释文本
- ✅ 冷启动：新手保护 + 快速分类
- ✅ 评估：短期指标监控

**不包含**：
- ❌ 习惯模型 H
- ❌ 趋势模型 T
- ❌ 高维特征扩展
- ❌ 延迟奖励管道
- ❌ 复杂可解释性（SHAP）

**技术选型**：
- TypeScript + Float32Array
- 本地 IndexedDB 存储
- Cholesky 分解 + rank-1 update

### 扩展版 (4-8 周，在 MVP 基础上)

**新增功能**：
- ✅ 习惯模型 H：时间偏好、节奏偏好识别
- ✅ 趋势模型 T：长期进步曲线分析
- ✅ 特征扩展：交叉项、二次项（d ≈ 20-30）
- ✅ 延迟奖励：次日回忆率异步补记
- ✅ 动态权重：用户偏好个性化
- ✅ 灰度发布：高数据用户优先启用

**优化**：
- 提升探索效率
- 细化安全约束
- 增强数值稳定性

### 完整版 (> 8 周，在扩展版基础上)

**高级功能**：
- ✅ 非线性 Bandit：Neural Linear (可选)
- ✅ 元学习：跨用户迁移学习
- ✅ 细粒度可解释性：SHAP 值、特征归因
- ✅ 自动分群：用户类型自动识别
- ✅ 离线评估：重放评估、反事实分析
- ✅ 多目标优化：Pareto 前沿近似

**工程完善**：
- 完整的监控和告警系统
- 自动化 A/B 测试平台
- 模型版本管理
- 异常检测和自动降级

---

## 七、评估体系

### 短期指标 (天级)

- 即时正确率
- 平均反应时
- 会话完成率
- 退出率
- 疲劳度均值

### 中期指标 (周级)

- 首次通过率
- 7 天回忆率
- 错误重现率
- 学习频率
- 用户活跃度

### 长期指标 (月级)

- 30 天留存率
- 单位时间掌握量
- 长期回忆率
- 用户满意度

### A/B 测试设计

```typescript
interface ABTestConfig {
    name: string;
    control: 'baseline' | 'current';
    treatment: 'AMAS';
    splitRatio: 0.5;  // 50% 用户
    metrics: [
        'recall_1d',
        'recall_7d',
        'session_completion_rate',
        'exit_rate',
        'avg_fatigue'
    ];
    minSampleSize: 1000;
    minDuration: 14;  // 天
}
```

---

## 八、总结

这套 AMAS (Adaptive Multi-dimensional Aware System) 算法系统具备以下优势：

1. **真正的自适应**：无需人工调参，从用户行为中自动学习最优策略
2. **多维度感知**：全面理解用户的注意力、疲劳、能力、习惯、动机、趋势
3. **轻量高效**：前端实时运行，< 100ms 决策，< 1MB 模型
4. **高度可解释**：每个决策都能清楚地告诉用户"为什么"
5. **隐私优先**：所有计算本地完成，不上传原始数据
6. **渐进演化**：MVP → 扩展版 → 完整版的清晰路线图
7. **工程可行**：经过与 Codex 的深入讨论和多轮优化，确保可落地

这是一个创新、实用、可落地的智能学习算法系统，将为用户提供真正个性化、智能化的学习体验！
