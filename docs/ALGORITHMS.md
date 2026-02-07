# AMAS 原创算法设计文档（规划 / 提案）

## 概述

本文档分析 AMAS 系统中各模块的问题域，评估现有解法的局限性，并提出原创算法设计。

> ⚠️ 说明（请先读）
>
> - 本文档是 AMAS 的**算法规划/提案**：描述目标形态、落地前提与数据依赖，**不代表当前线上实现**。
> - 当前线上/代码中的 baseline 主要位于：`packages/backend-rust/src/amas/`（建模/决策）、`packages/backend-rust/src/routes/amas.rs`（AMAS 入口）、`packages/backend-rust/src/routes/visual_fatigue.rs`（视觉疲劳接入）。
> - 文档中若提到“原创”，更多指面向本项目的工程化组合与约束设计；其中部分方法（IRT、CUSUM、Active Learning、Kalman）属于经典框架，本项目的“原创点”应体现在**特征工程、约束目标、在线校准与系统集成**。

---

## 0. 现状对齐（实现 / 数据）

> 本节用于把“规划”与“已实现”对齐，避免将提案误读为当前实现。

### 0.1 当前 baseline（已实现）

| 模块              | 本文提案算法 | 当前 baseline（代码）                                                                                                                            | 主要差距（落地前必须解决）                           |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| AttentionMonitor  | ADF          | 特征加权 + 自适应平滑（`packages/backend-rust/src/amas/modeling/attention.rs`）                                                                  | 需要明确 `O(t)`、`α(t)` 边界与噪声/持久化策略        |
| FatigueEstimator  | TFM          | 行为疲劳指数衰减 + 简单融合（`packages/backend-rust/src/amas/modeling/fatigue.rs`，`packages/backend-rust/src/amas/modeling/fatigue_fusion.rs`） | 视觉扩展字段未上报/未落库；心理疲劳与退出信号缺失    |
| CognitiveProfiler | BCP          | EMA + 滑动窗口方差（稳定性）（`packages/backend-rust/src/amas/modeling/cognitive.rs`）                                                           | 需要协方差/置信度的状态表示与持久化（`Σ/H/R/Q`）     |
| MotivationTracker | MDS          | 线性递归（正确/错误/退出）（`packages/backend-rust/src/amas/modeling/motivation.rs`）                                                            | 缺少“退出/放弃”事件接入；非线性动力系统参数需标定    |
| TrendAnalyzer     | MTD          | 单窗口斜率 + 方差阈值（`packages/backend-rust/src/amas/modeling/trend.rs`）                                                                      | 缺少多尺度窗口与变点检测（CUSUM）参数/阈值策略       |
| ColdStartManager  | AUC          | 规则打分 + 探测序列（含置信度早停）（`packages/backend-rust/src/amas/decision/coldstart.rs`）                                                    | AUC 需要 IG 所依赖的概率模型与探测题设计             |
| Forgetting Curve  | PLF          | FSRS/UMM（排程/记忆模型；见 `packages/backend-rust/src/routes/amas.rs`、`packages/backend-rust/src/umm/`）                                       | 状态双口径风险：需明确与 FSRS/UMM 的替换/并行策略    |
| Ability Rating    | AIR          | Elo（`abilityElo` / `difficultyElo`；`packages/backend-rust/src/services/elo.rs`）                                                               | IRT 需要题目参数（`β/α`）与置信度/多题型建模与持久化 |

### 0.2 数据获取现状（重要）

#### AMAS 行为事件（`POST /api/amas/process`）

- 后端可接收的字段集合与 `LearningEventInput` 对齐（`wordId/isCorrect/responseTime/sessionId/...`），并用于注意力/疲劳/趋势等建模输入。
- **注意：算法质量强依赖埋点真实性。**例如：`dwellTime`、`retryCount`、`hintUsed`、`focusLossDuration` 若被占位或弱定义，会直接降低 ADF/TFM/MTD 等模块的有效性与可解释性。
- 当前前端答题上报中存在占位/代理字段的情况（例如 `dwellTime` 可能用 `responseTime` 代替、`retryCount` 固定为 0、`hintUsed` 未上报）；在未补齐前应在算法中**降权或禁用**相关特征，避免“用假数据拟合真结论”。

#### 视觉疲劳（`POST /api/visual-fatigue/metrics`）

视觉疲劳在项目中同时存在三份“契约视角”，需要在落地 TFM 前对齐：

- **后端接口可接收**（`VisualFatigueMetricsBody` / `VisualFatigueInput`）：除 `score/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/timestamp/sessionId` 外，还支持 `eyeAspectRatio/avgBlinkDuration/headRoll/headStability/squintIntensity/expressionFatigueScore/gazeOffScreenRatio/browDownIntensity/mouthOpenRatio` 等扩展字段（均为可选）。
- **前端当前实际上报**（`useVisualFatigue`）：仅上报 `score/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/timestamp`（**未携带 `sessionId`，也未上报扩展字段**）。
- **当前数据库落库**（`visual_fatigue_records`）：`score/fusedScore/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/createdAt/sessionId`（**扩展字段未落库**）。

> 关键影响：AMAS 在 `/api/amas/process` 中会按 `sessionId` 查询 30 秒内最新视觉疲劳记录；若视觉疲劳上报不携带同一个 `sessionId`，则视觉疲劳无法进入 AMAS 建模输入（只能得到 `None`）。

---

## 1. 注意力估计 (AttentionMonitor)

### 问题定义

实时估计用户当前注意力水平 $A(t) \in [0, 1]$

### 现有方案

加权平均 + EMA 平滑

### 局限性

- EMA 假设注意力变化是平稳的
- 无法捕捉注意力的**突变**（如分心事件）
- 所有特征线性组合，忽略交互效应

### 原创算法：ADF (Attention Dynamics Filter)

**核心思想**：注意力是一个**状态空间模型**，包含惯性和噪声

**状态方程**：

```
A(t) = α·A(t-1) + (1-α)·O(t) + η(t)
```

其中：

- $O(t)$ = 观测信号（从特征计算）
- $η(t)$ = 过程噪声
- $α$ = 惯性系数，**自适应调整**

**自适应惯性**：

```
α(t) = α_base · (1 - |ΔO(t)|)
```

当观测突变时 (|ΔO| 大)，惯性降低，快速响应；平稳时惯性高，抗噪声。

**观测模型** (替代线性加权)：

```
O(t) = σ(w · tanh(Φ(features)))
```

使用 tanh 捕捉特征饱和效应，σ 归一化。

**优势**：

- 自适应响应速度
- 捕捉突变事件
- 非线性特征交互

---

## 2. 疲劳估计 (FatigueEstimator)

### 问题定义

估计用户累积疲劳度 $F(t) \in [0, 1]$，考虑累积和恢复

### 现有方案

指数衰减累积：$F(t) = F(t-1) \cdot e^{-k} + \Delta F$

### 局限性

- 恢复假设为指数衰减，但实际恢复是**非线性**的（短休息恢复快，长疲劳恢复慢）
- 未区分**认知疲劳**与**视觉疲劳**

### 原创算法：TFM (Tri-pool Fatigue Model)

**核心思想**：疲劳分为三个独立维度，各有快/慢恢复特性

**三维疲劳模型**：

```
┌─────────────────────────────────────────────────────────────┐
│  认知疲劳 (Cognitive)  │  视觉疲劳 (Visual)  │  心理疲劳 (Mental)  │
│  - 错误率上升          │  - 阅读时间增加      │  - 动机下降          │
│  - 反应时间变长        │  - 眨眼频率变化      │  - 主动退出          │
│  - 重复错误            │  - 注视点漂移        │  - 连续失败          │
└─────────────────────────────────────────────────────────────┘
```

**每个维度的双池结构**：

```
对于 d ∈ {cognitive, visual, mental}:

F_d_fast(t) = F_d_fast(t-1) · r_d_fast + load_d(t)
F_d_slow(t) = F_d_slow(t-1) · r_d_slow + spill_d(t)

spill_d(t) = max(0, F_d_fast(t-1) - θ_d_spill)
F_d(t) = w_fast · F_d_fast + w_slow · F_d_slow
```

**维度特定参数**：

```
认知疲劳 (Cognitive):
  r_fast = 0.7,  r_slow = 0.95
  τ_fast = 2min, τ_slow = 15min
  load = f(error_rate_trend, rt_increase, repeat_errors)

视觉疲劳 (Visual):
  r_fast = 0.8,  r_slow = 0.97  // 视觉恢复更慢
  τ_fast = 3min, τ_slow = 20min

  // 目标数据（接口可接收，但当前链路需补齐；详见「0.2 数据获取现状」）
  load = f(
    perclos,              // 眼睛闭合时间百分比 [0,1]
    blinkRate,            // 眨眼频率 (次/分钟)
    eyeAspectRatio,       // 眼睛纵横比 EAR
    squintIntensity,      // 眯眼强度
    gazeOffScreenRatio    // 视线离屏比例
  )

心理疲劳 (Mental):
  r_fast = 0.6,  r_slow = 0.90  // 心理恢复更快但也更易波动
  τ_fast = 1min, τ_slow = 10min
  load = f(consecutive_failures, quit_events, frustration_signals)
```

**视觉疲劳负载计算**（基于目标数据：接口可接收，但当前链路需补齐）：

```
// 数据来源: POST /api/visual-fatigue/metrics
struct VisualInput {
    perclos: f64,              // 眼睛闭合时间百分比 [0,1]
    blinkRate: f64,            // 眨眼频率 (次/分钟)
    eyeAspectRatio: f64,       // EAR，越小越疲劳
    squintIntensity: f64,      // 眯眼强度 [0,1]
    gazeOffScreenRatio: f64,   // 视线离屏比例 [0,1]
    avgBlinkDuration: f64,     // 平均眨眼时长 (ms)
    headStability: f64,        // 头部稳定性 [0,1]
    confidence: f64,           // 检测置信度 [0,1]
}

// 视觉负载公式
load_visual = w1 * perclos                           // PERCLOS 是核心指标
            + w2 * blink_deviation(blinkRate)        // 眨眼偏离基线
            + w3 * (1 - ear_normalized)              // EAR 反向
            + w4 * squintIntensity                   // 眯眼
            + w5 * gazeOffScreenRatio                // 视线离屏

// 眨眼偏离 (正常 15-20 次/分钟)
blink_deviation(rate) = |rate - baseline| / baseline
baseline = user_baseline ?? 17.0

// 权重 (基于眼科研究)
w1 = 0.35  // PERCLOS 最重要
w2 = 0.20  // 眨眼
w3 = 0.20  // EAR
w4 = 0.15  // 眯眼
w5 = 0.10  // 视线离屏
```

**置信度加权融合**：

```
if confidence >= 0.2:
    F_visual = confidence * load_visual + (1 - confidence) * F_visual_prev
else:
    F_visual = F_visual_prev  // 低置信度时保持上一状态
```

**总疲劳输出**：

```
F_total = w_cog · F_cognitive + w_vis · F_visual + w_men · F_mental

// 动态权重（根据任务类型）
阅读任务: w_vis ↑
计算任务: w_cog ↑
长时间学习: w_men ↑
```

**休息恢复**：

```
if break_minutes > 0:
    for d in {cognitive, visual, mental}:
        F_d_fast *= exp(-break / τ_d_fast)
        F_d_slow *= exp(-break / τ_d_slow)
```

**与现有 fatigue_fusion.rs 的对比**：

```
现有方案 (简单加权):
  fused = 0.4 * behavioral + 0.4 * visual + 0.2 * temporal
  temporal = 1 - exp(-0.05 * max(0, duration - 30))

TFM (三池双层):
  每个维度独立建模快/慢恢复
  视觉疲劳使用完整的前端数据计算
  支持跨维度溢出和恢复动态
```

**数据契约现状（必须对齐）**：

- 后端接口可接收：除 `score/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/timestamp/sessionId` 外，支持多种扩展字段（EAR、眯眼、头稳、表情等）。
- 前端当前实际上报：仅包含 `score/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/timestamp`（未携带 `sessionId`，未上报扩展字段）。
- DB 当前落库：`score/fusedScore/perclos/blinkRate/yawnCount/headPitch/headYaw/confidence/createdAt/sessionId`（扩展字段未落库）。

因此，文档中 TFM 的 `load_visual` 可被理解为**目标版本**：需要先补齐“上报字段 + 会话对齐 + 可回放落库”三件事，才能在后端稳定复现并用于在线建模。

**优势**：

- 区分三种疲劳来源，精准干预
- 充分利用前端视觉检测的完整数据
- 心理疲劳与动机系统联动
- 解释"眼睛累但脑子还清醒"的场景
- 支持任务类型自适应权重

---

## 3. 认知画像 (CognitiveProfiler)

### 问题定义

估计用户认知能力向量 $C = [mem, speed, stability]$

### 现有方案

EMA 平滑 + 滑动窗口方差

### 局限性

- 点估计，无置信度
- 假设能力稳定，忽略学习成长
- 三维独立估计，忽略相关性

### 原创算法：BCP (Bayesian Cognitive Profiling)

**核心思想**：认知能力是**概率分布**，随证据更新

**状态表示**：

```
C ~ N(μ, Σ)  // 三维高斯分布
μ = [μ_mem, μ_speed, μ_stability]
Σ = 3x3 协方差矩阵
```

**贝叶斯更新**：

```
观测: z = [accuracy, 1/rt_norm, consistency]
似然: P(z|C) = N(z; H·C, R)
后验: μ' = μ + K·(z - H·μ)
       Σ' = (I - K·H)·Σ
K = Σ·H'·(H·Σ·H' + R)^(-1)  // Kalman 增益
```

**能力漂移**（学习成长）：

```
μ(t) = μ(t-1) + drift_rate · Δt
Σ(t) = Σ(t-1) + Q  // 过程噪声
```

**输出**：

- 能力均值 μ
- 置信度 = 1 / trace(Σ)
- 相关性信息（如 mem-speed 相关）

**优势**：

- 提供置信区间
- 捕捉能力间相关性
- 建模能力成长

---

## 4. 动机追踪 (MotivationTracker)

### 问题定义

追踪用户学习动机 $M(t) \in [-1, 1]$

### 现有方案

线性递归：$M(t) = ρ \cdot M(t-1) ± κ$

### 局限性

- 线性模型无法捕捉动机的**非线性动态**
- 忽略**动机惯性**（高动机时更容易保持高动机）
- 未建模**动机恢复**（从低谷反弹）

### 原创算法：MDS (Motivation Dynamics System)

**核心思想**：动机是一个**双稳态系统**，有两个吸引子（高/低）

**动力学方程**：

```
dM/dt = -∂V/∂M + stimulus(t)

V(M) = -a·M² + b·M⁴  // 双井势能
```

其中 $a, b > 0$，形成两个稳定点（高动机/低动机）

**离散近似**：

```
M(t) = M(t-1) + η · (-∂V/∂M + S(t))
     = M(t-1) + η · (2a·M - 4b·M³ + S(t))

S(t) = +κ (正确) / -λ (错误) / -μ (退出)
```

**参数**：

```
a = 0.5   // 双稳态强度
b = 0.5   // 约束项
η = 0.1   // 学习率
κ = 0.3, λ = 0.2, μ = 0.5
```

**特性**：

- 高动机时更稳定（需要多次失败才跌落）
- 低动机时也稳定（需要连续成功才爬升）
- 中间区域不稳定（容易向两端滑动）

**优势**：

- 符合心理学"动机惯性"观察
- 解释"连续成功后信心爆棚"
- 解释"连续失败后放弃"

---

## 5. 趋势分析 (TrendAnalyzer)

### 问题定义

检测学习趋势 $T \in \{Up, Down, Flat, Stuck\}$

### 现有方案

线性回归斜率 + 方差阈值

### 局限性

- 线性假设，无法检测**非线性趋势**
- 无法检测**变点**（趋势突变）
- 固定窗口，无法适应不同时间尺度

### 原创算法：MTD (Multi-scale Trend Detector)

**核心思想**：多尺度分析 + 变点检测

**多尺度斜率**：

```
slope_short = linear_slope(window=5)
slope_medium = linear_slope(window=15)
slope_long = linear_slope(window=30)
```

**趋势一致性**：

```
consistency = sign(slope_short) == sign(slope_medium) == sign(slope_long)
```

**变点检测** (CUSUM)：

```
S_high(t) = max(0, S_high(t-1) + x(t) - μ - k)
S_low(t) = max(0, S_low(t-1) - x(t) + μ - k)

change_detected = S_high > h OR S_low > h
```

**状态判定**：

```
if change_detected:
    return ChangePoint
elif consistency AND |slope_medium| > θ_up:
    return Up if slope_medium > 0 else Down
elif variance < θ_stuck AND |slope_medium| < θ_flat:
    return Stuck
else:
    return Flat
```

**优势**：

- 多尺度避免噪声干扰
- 变点检测捕捉趋势突变
- 区分"平稳"和"卡住"

---

## 6. 冷启动管理 (ColdStartManager)

### 问题定义

快速分类新用户并初始化策略

### 现有方案

累积评分 + 状态机

### 局限性

- 被动收集数据，效率低
- 分类边界固定，无法自适应
- 未考虑分类不确定性

### 原创算法：AUC (Active User Classification)

**核心思想**：**主动学习** - 选择最有信息量的问题来加速分类

**概率分类**：

```
P(type|history) ∝ P(history|type) · P(type)

type ∈ {Fast, Stable, Cautious}
```

**信息增益选择**：

```
next_probe = argmax_difficulty IG(difficulty)

IG(d) = H(type) - E[H(type | response(d))]
```

选择能最大程度减少分类不确定性的难度。

**自适应阈值**：

```
if max(P(type|history)) > θ_confident:
    classify(argmax type)
elif entropy(P) < θ_entropy:
    classify(argmax type)
elif n_samples > max_samples:
    classify(argmax type)
```

**早停条件**：

- 单一类型概率 > 0.8
- 熵 < 0.5
- 样本数达到上限

**优势**：

- 主动探测，减少分类所需样本数
- 概率输出，提供置信度
- 自适应早停

---

## 7. 遗忘曲线

### 问题定义

建模记忆保持率 $R(t)$ 随时间的衰减

### 现有方案

Ebbinghaus 指数衰减：$R(t) = e^{-t/S}$

### 替代方案对比

| 模型              | 公式             | 长期行为   | 实验支持     |
| ----------------- | ---------------- | ---------- | ------------ |
| 指数 (Ebbinghaus) | $e^{-t/S}$       | 快速趋近 0 | 短期实验     |
| 幂律 (Wixted)     | $(1 + t/S)^{-d}$ | 缓慢衰减   | 长期实验支持 |
| ACT-R             | $B \cdot t^{-d}$ | 幂律衰减   | 认知架构验证 |

### 原创算法：PLF (Power-Law Forgetting)

**采用幂律衰减**（有更强实验支持）：

```
R(t, n, S, D) = (1 + t / (S · f(n)))^(-D)

f(n) = 1 + α · ln(1 + n)  // 复习次数增益
S = 基础稳定性
D = 难度相关衰减率
```

**与当前系统（FSRS/UMM）的关系**：

- 当前系统的排程/状态更新基于 FSRS（并在部分路径引入 UMM/MDM 等模型）；PLF 若引入，需要明确与现有体系的关系，避免“双口径”。
- 推荐的落地顺序：先做 **影子预测器**（不影响排程，仅做评估/解释），稳定后再考虑替换核心遗忘曲线或作为 UMM 子组件。

---

## 8. 能力评分

### 问题定义

估计用户能力 $θ$ 和题目难度 $β$

### 现有方案

ELO：$ΔR = K(S - E)$，$E = 1/(1 + 10^{(R_b - R_a)/400})$

### 局限性

- 无评分可靠性指标
- 假设能力稳定
- 二元结果，无法处理部分正确

### 原创算法：AIR (Adaptive Item Response)

**基于 IRT 但简化**：

```
P(correct | θ, β, α) = 1 / (1 + exp(-α(θ - β)))

θ = 用户能力
β = 题目难度
α = 题目区分度
```

**能力更新** (近似 EAP)：

```
θ' = θ + η · α · (y - P)

y = 1 (正确) / 0 (错误)
η = learning_rate / (1 + n_responses)  // 递减学习率
```

**置信度**：

```
SE(θ) = 1 / sqrt(Σ I_i)
I_i = α² · P · (1 - P)  // Fisher 信息
confidence = 1 / (1 + SE)
```

**优势**：

- 提供能力置信度
- 支持题目区分度
- 理论基础更强 (IRT)

### 与当前系统（Elo）的关系

- 当前项目已实现 Elo 能力评分（用户 `abilityElo` / 单词 `difficultyElo`），AIR 若落地需要：题目参数 `β/α` 的估计与持久化，以及与 Elo 的迁移/并行策略。
- 推荐优先用 AIR 作为**解释/诊断层**（输出 `θ` 与置信度）或在少量题型/子集上 A/B，再决定是否替换 Elo。

---

## 算法命名汇总

| 模块              | 原创算法名 | 全称                         |
| ----------------- | ---------- | ---------------------------- |
| AttentionMonitor  | **ADF**    | Attention Dynamics Filter    |
| FatigueEstimator  | **TFM**    | Tri-pool Fatigue Model       |
| CognitiveProfiler | **BCP**    | Bayesian Cognitive Profiling |
| MotivationTracker | **MDS**    | Motivation Dynamics System   |
| TrendAnalyzer     | **MTD**    | Multi-scale Trend Detector   |
| ColdStartManager  | **AUC**    | Active User Classification   |
| Forgetting Curve  | **PLF**    | Power-Law Forgetting         |
| Ability Rating    | **AIR**    | Adaptive Item Response       |

---

## 实现优先级建议

> 优先级建议需要同时考虑：影响、数据就绪度、与现有 FSRS/UMM/Elo 的冲突成本。
> 在落地前建议先完成“数据对齐”（尤其是视觉疲劳 `sessionId` 与关键埋点真实性）。

| 优先级 | 算法                                                 | 理由                                   |
| ------ | ---------------------------------------------------- | -------------------------------------- |
| P0     | 数据对齐（埋点真实性 + sessionId 对齐 + 可回放落库） | 不对齐数据，复杂模型会退化为噪声放大器 |
| P0     | PLF                                                  | 遗忘曲线是核心，幂律有实验支持         |
| P0     | AIR                                                  | 能力评分影响难度选择                   |
| P1     | TFM                                                  | 疲劳影响学习效率                       |
| P1     | MDS                                                  | 动机影响留存                           |
| P2     | ADF                                                  | 注意力精细化                           |
| P2     | BCP                                                  | 认知画像精细化                         |
| P2     | MTD                                                  | 趋势检测优化                           |
| P3     | AUC                                                  | 冷启动优化                             |

---

## 参考文献

1. Wixted, J. T., & Ebbesen, E. B. (1991). On the form of forgetting. _Psychological Science_, 2(6), 409-415.
2. Anderson, J. R., & Lebiere, C. (1998). _The atomic components of thought_. Lawrence Erlbaum.
3. van der Linden, W. J., & Hambleton, R. K. (2013). _Handbook of item response theory_. Springer.
4. Settles, B. (2012). _Active learning_. Morgan & Claypool.
5. Page, E. S. (1954). Continuous inspection schemes. _Biometrika_, 41(1/2), 100-115. (CUSUM)

---

# UMM 完全原创算法设计文档

**核心原则**：不借用任何现有算法（如 FSRS、Thompson Sampling、LinUCB、ACT-R），从第一性原理推导，用不同的数学方法实现相同目标。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        UMM Engine                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    核心记忆模型层                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │     MDM     │  │     IGE     │  │     SWD     │       │  │
│  │  │  记忆动力学  │  │ 信息增益探索 │  │ 相似度决策  │       │  │
│  │  │ (替代FSRS)  │  │(替代Thompson)│  │(替代LinUCB) │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │         │                │                │               │  │
│  │         └────────────────┼────────────────┘               │  │
│  │                          │                                │  │
│  │                   ┌──────┴──────┐                         │  │
│  │                   │    MSMT     │                         │  │
│  │                   │ 多尺度记忆  │                         │  │
│  │                   │(替代ACT-R)  │                         │  │
│  │                   └─────────────┘                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    词汇学习特化层                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │     MTP     │  │     IAD     │  │     EVM     │       │  │
│  │  │  形态迁移   │  │  干扰衰减   │  │ 编码变异    │       │  │
│  │  │  传播模型   │  │  计数模型   │  │  度量模型   │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 统一公式（与项目现有数据结构对齐）

> 说明：当前项目的记忆调度输出以“可提取性/回忆概率 (0-1)”和“下一次复习间隔（天）”为核心（见 `packages/backend-rust/src/amas/engine.rs` 中 `WordMasteryDecision`）。因此 UMM 统一把各模块的输出归一化为**可组合的乘子**，并显式处理边界/截断，避免实现中出现负数、除零或间隔爆炸。

**基础可提取性（MDM 输出）**：

```
R_base(w, Δt_days) = MDM.retrievability(w, Δt_days)         // ∈ (0, 1]
```

**词汇特化加成/惩罚（输出均为无量纲）**：

```
bonus_mtp(w)              ∈ [0, 0.30]   // 形态迁移加成（MTP）
penalty_iad(w, H)         ∈ [0, 0.50]   // 干扰惩罚（IAD）
bonus_evm(w, contexts(w)) ∈ [0, 0.15]   // 编码变异加成（EVM）
```

**组合后的最终可提取性**：

```
mult(w, H) = (1 + bonus_mtp(w)) × (1 + bonus_evm(w)) × (1 - penalty_iad(w, H))
R(w, Δt, H) = clamp(R_base(w, Δt) × mult(w, H), 0, 1)
```

**最优复习间隔（以目标保持率 R_target 为准）**：

```
R_base_target = clamp(R_target / max(mult(w, H), ε), R_min, R_max)
interval_days(w) = MDM.interval_for_target(w, R_base_target)
```

- `R_target`：调度目标保持率；建议沿用项目现有 `desiredRetention` 的区间（默认 0.9，且上限 < 1.0）
- `ε = 1e-6`：避免除零
- `R_min = 0.05`, `R_max = 0.97`：避免极端值导致间隔爆炸或趋近 0（可在实现中调参）

### 与现有项目的对接（替换目标与落点）

当前项目（Rust 后端）相关算法落点（用于对齐输入/输出，而不是复用数学）：

| 现有模块                      | 位置（现有实现）                                                                                                       | UMM 替换模块        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| FSRS（单词间隔与可提取性）    | `packages/backend-rust/src/services/fsrs.rs`（在 `packages/backend-rust/src/amas/engine.rs` 调用）                     | MDM + (MTP/IAD/EVM) |
| Thompson Sampling（策略探索） | `packages/backend-rust/src/amas/decision/thompson.rs`                                                                  | IGE                 |
| LinUCB（策略决策）            | `packages/backend-rust/src/amas/decision/linucb.rs`                                                                    | SWD                 |
| ACT-R Memory（回忆概率）      | `packages/native/src/actr/mod.rs`（在 `packages/backend-rust/src/amas/engine.rs::compute_actr_memory` 调用）           | MSMT                |
| 词根/词素数据与掌握度         | `packages/backend-rust/sql/016_add_morphemes.sql` + `packages/backend-rust/src/services/etymology.rs`                  | MTP 的数据来源      |
| 易混淆词缓存（基于向量距离）  | `packages/backend-rust/sql/036_add_confusion_pairs_cache.sql` + `packages/backend-rust/src/workers/confusion_cache.rs` | IAD 的数据来源      |

UMM 的目标是替换“算法内核”，但保持对外 API/数据流尽量不变（例如仍输出 `interval_days`、`retrievability`，并能在 `AMASEngine` 里被 `track_algorithm!` 统计）。

---

## Part I: 核心记忆模型（替代现有算法）

### 模块1: MDM - 记忆动力学模型 (Memory Dynamics Model)

**替代目标**: FSRS 遗忘曲线

**项目对接（替换 FSRS）**：

- 当前 FSRS 调用点：`packages/backend-rust/src/amas/engine.rs` 中 `fsrs_next_interval_with_root(...)`，并且 FSRS 状态来自 `ProcessOptions.word_state`（`packages/backend-rust/src/amas/types.rs` / `packages/backend-rust/src/services/learning_state.rs`）。
- MDM 需要提供同等最小输出：`retrievability ∈ (0,1]` 与 `interval_days`，以便继续填充 `WordMasteryDecision` 并驱动 `nextReviewDate`。
- 状态持久化建议：在 `word_learning_states` 新增 UMM 字段（或新表），至少包含 `strength (M)`, `consolidation (C)`, `lastReviewAt`, `reviewCount`（可先与 FSRS 并行“影子计算”做对照，再切主路由）。

**原理推导**：

从第一性原理出发：记忆是一个动态系统，遵循"衰减-强化"动力学。

核心微分方程：

```
dM/dt = -λ(M, C) × M + reinforcement(t)
```

其中衰减率 `λ(M, C)` 随记忆强度和巩固程度变化：

- 弱记忆衰减快
- 强记忆衰减慢（巩固效应）

**与 FSRS 的本质区别**：

| FSRS                      | MDM (原创)                     |
| ------------------------- | ------------------------------ |
| 幂律衰减 `(1+t/S)^(-0.5)` | 指数衰减 + 动态衰减率          |
| 17个固定参数              | 少量物理意义明确的参数（~5个） |
| 稳定性 S 是抽象概念       | 记忆强度 M 和巩固度 C 分离     |
| 经验公式                  | 从微分方程推导                 |

**数据结构**：

```rust
/// 记忆动力学模型状态
pub struct MemoryDynamics {
    pub strength: f64,      // M: 记忆强度 [0, ∞)
    pub consolidation: f64, // C: 巩固程度 [0, 1]
    pub last_review: i64,   // 上次复习时间戳
    pub review_count: i32,  // 复习次数
}
```

**核心算法**：

1. **时间单位**：
   - 项目侧 `elapsed_days/scheduled_days` 使用“天”，因此 MDM 默认以 `Δt_days` 为时间单位（`Δt_days ≈ (now_ms - last_review_ms) / 86_400_000`）。

2. **衰减率函数**（正值且有下界）：

   ```
   λ(M, C) = λ_0 / (1 + α × M × C)
   ```

   - `λ_0 = 0.3`: 基础衰减率
   - `α = 0.5`: 巩固系数
   - 物理意义：记忆越强、巩固越深，衰减越慢

3. **间隔内遗忘（实现推荐：分段常数 λ）**：

   > 为了与项目现有“给定目标保持率 -> 直接算间隔”的接口一致，MDM-v1 采用分段常数近似：每次复习后冻结 `λ_eff = λ(M_last, C_last)`，在两次复习之间按指数衰减。

   ```
   M_now = M_last × exp(-λ_eff × Δt_days)
   R_base(Δt_days) = exp(-λ_eff × Δt_days)
   ```

   - 这使得 `interval_for_target` 有闭式解，并避免每次都做数值求根。

   **（可选严格解）**：若把 `λ(M,C)` 视为随 `M(t)` 连续变化（且 C 在间隔内常数），则满足隐式解：

   ```
   ln M(t) + (αC)·M(t) = ln M_0 + (αC)·M_0 - λ_0·t
   ```

   可用 Newton / Lambert W 求 `M(t)`，但实现复杂度更高。

4. **可提取性与概率解释**：
   - 在本框架中 `R_base` 直接作为“基础回忆概率/可提取性”（0-1），后续再叠加 MTP/IAD/EVM 的乘子并 clamp。

5. **复习强化（离散更新，含饱和）**：

   ```
   ΔM = η × (1 - M/M_max) × quality
   ```

   - `η = 0.4`: 学习率
   - `M_max = 10.0`: 记忆强度上限
   - `(1 - M/M_max)`: 饱和效应，记忆越强增益越小
   - `quality ∈ [0,1]`：由答题质量映射（可沿用项目 `Rating::from_correct` 的思想：正确且快 → 更高质量）
   - 失败/遗忘可通过 `quality=0` + 单独惩罚项建模（例如 `M ← M × (1 - ζ)`，`ζ ∈ (0,1)`）

6. **巩固度更新（闭合模型所必需）**：

   ```
   C ← C + κ × (1 - C) × quality          // 正确时上升，越靠近1越难再提高
   C ← C × (1 - μ)                        // 错误时衰减（μ∈(0,1)）
   C ← clamp(C, 0, 1)
   ```

   - `κ`: 巩固学习率（建议 0.1~0.3）
   - `μ`: 错误惩罚系数（建议 0.1~0.4）

7. **最优复习间隔（与统一公式对齐）**：

   ```
   interval_days = -ln(R_base_target) / λ(M, C)
   ```

   - `R_base_target` 由统一公式中的 `R_target / mult` 得到并 clamp，避免 0 或 1 导致的数值问题

---

### 模块2: IGE - 信息增益探索模型 (Information Gain Exploration)

**替代目标**: Thompson Sampling

**项目对接（替换 Thompson）**：

- 当前 Thompson 调用点：`packages/backend-rust/src/amas/engine.rs` 中 `models.thompson.select_action(...)` / `update(...)` / `get_confidence_with_params(...)`，实现位于 `packages/backend-rust/src/amas/decision/thompson.rs`。
- IGE 需要提供相同的最小接口形态：在候选 `StrategyParams` 上做选择、在每次交互后用 `reward ∈ [-1, 1]` 更新统计，并输出置信度供 `EnsembleDecision` 加权（见 `packages/backend-rust/src/amas/decision/ensemble.rs`）。
- 为了与现有“上下文分桶”机制兼容（Thompson 当前使用 attention/fatigue/motivation/cognitive/time_pref 组合签名），IGE 可复用相同 `context_signature(state)`，维护 global + context 两套统计并做线性混合（无随机性，仍然是确定性选择）。

**原理推导**：

核心思想：选择能**最大化信息增益**的策略，而非从概率分布采样。

**与 Thompson Sampling 的本质区别**：

| Thompson Sampling | IGE (原创)             |
| ----------------- | ---------------------- |
| 从 Beta 分布采样  | 确定性选择（无随机性） |
| 隐式平衡探索利用  | 显式信息增益项         |
| 需要概率论知识    | 基于方差的简单统计     |
| 采样可能不稳定    | 选择是确定性的         |

**数据结构**：

```rust
/// 策略统计信息（对齐项目：策略用 key 而不是整数 id）
pub struct StrategyStats {
    pub sum_reward: f64,      // 累积奖励
    pub sum_sq_reward: f64,   // 累积奖励平方（用于计算方差）
    pub count: u32,           // 使用次数
}

/// IGE 模型（可选：global + context 两层统计）
pub struct IGEModel {
    pub context_weight: f64, // 0..1，越大越偏向 context stats
    // HashMap<StrategyKey, StrategyStats>
    pub global: HashMap<String, StrategyStats>,
    // HashMap<ContextKey, HashMap<StrategyKey, StrategyStats>>
    pub by_context: HashMap<String, HashMap<String, StrategyStats>>,
}
```

**核心算法**：

0. **奖励归一化（对齐现有 reward 约定）**：
   - 项目里 Thompson 会将 `reward ∈ [-1,1]` clamp 后映射到 `[0,1]` 更新参数，因此 IGE 也建议使用同样的归一化：

   ```
   r = clamp(reward, -1, 1)
   r01 = (r + 1) / 2         // ∈ [0, 1]
   ```

1. **预期奖励**（带冷启动先验，避免 count=0）：

   ```
   E[r] = (sum_reward + n0 * μ0) / (count + n0)
   ```

   - `μ0 = 0.5`：先验均值（中性）
   - `n0 = 1`：先验伪计数（保证可除）

2. **奖励方差**（不确定性度量）：

   ```
   E[r²] = (sum_sq_reward + n0 * (μ0² + σ0²)) / (count + n0)
   Var[r] = max(0, E[r²] - E[r]²)
   ```

   - `σ0²`：先验方差（例如 0.25）
   - `max(0, ·)`：避免浮点误差导致的极小负数

3. **信息增益估计**：

   ```
   IG = Var[r] / (count + n0 + 1)
   ```

   使用次数越少、方差越大，信息增益越高

4. **策略选择得分**：

   ```
   Score = E[r] + β × IG
   ```

   - `β` 控制探索强度
   - 选择得分最高的策略（确定性）

5. **置信度（给集成层加权）**：
   - 置信度建议沿用 Thompson 的“有效样本数 -> 饱和增长”形式，便于与现有 `confidence_map` 对齐：
   ```
   n_eff = count + n0
   conf_raw = n_eff / (n_eff + ess_k)
   confidence = min_conf + (max_conf - min_conf) * conf_raw
   ```

---

### 模块3: SWD - 相似度加权决策模型 (Similarity-Weighted Decision)

**替代目标**: LinUCB

**项目对接（替换 LinUCB）**：

- 当前 LinUCB 调用点：`packages/backend-rust/src/amas/engine.rs` 中 `models.linucb.select_action(...)` / `update(...)` / `get_confidence_with_params(...)`，实现位于 `packages/backend-rust/src/amas/decision/linucb.rs`。
- SWD 需要在同一组候选 `StrategyParams` 上输出“选中的策略 + 置信度”，并支持用 `reward ∈ [-1,1]` 做在线更新；以便继续被 `EnsembleDecision` 作为一个候选来源融合。
- 项目里已有上下文向量 `FeatureVector`（见 `packages/backend-rust/src/amas/types.rs`），SWD 直接把它当作情境表征，无需学习全局参数矩阵。

**原理推导**：

核心思想：不学习全局参数，而是基于历史相似情境做决策（类似 k-NN）。

**与 LinUCB 的本质区别**：

| LinUCB             | SWD (原创)             |
| ------------------ | ---------------------- |
| 学习全局线性参数 θ | 不学习参数，基于相似度 |
| 矩阵求逆 O(d³)     | 相似度计算 O(n×d)      |
| 假设线性关系       | 非参数方法，无假设     |
| 需要正则化         | 自然处理稀疏数据       |

**数据结构**：

```rust
/// 上下文记录
pub struct ContextRecord {
    pub context: Vec<f64>,      // 上下文特征向量
    pub strategy_key: String,   // 使用的策略（对齐项目：StrategyParams -> key）
    pub reward: f64,            // 获得的奖励
    pub ts: i64,                // 时间戳（可选：用于近期加权）
}

/// 相似度加权决策模型
pub struct SWDModel {
    history: Vec<ContextRecord>,
    max_history: usize,
}
```

**核心算法**：

0. **边界约束（必须做，否则会出现除零/负置信度）**：
   - 若 `|a|` 或 `|b|` 为 0（全零向量），定义 `sim=0`（或在范数上加 `ε`）。
   - 余弦相似度可能为负；为保证权重与置信度可解释，建议只使用正相似度：

   ```
   sim_pos = max(0, sim)
   ```

1. **相似度计算**（余弦相似度 + ε）：

   ```
   sim(a, b) = (a · b) / (|a| × |b| + ε)
   ```

2. **按策略分组的奖励预测**：

   ```
   r_pred(s) = Σ(sim_pos(c, c_i) × r_i) / (Σ(sim_pos(c, c_i)) + ε)
              where record_i.strategy_key == key(s)
   ```

   - 对每个候选策略 `s` 单独计算 `r_pred(s)`，再选得分最高者
   - 若该策略历史为空，则回退到全局均值/启发式默认值

3. **置信度（0..1，随“相似证据量”饱和增长）**：

   ```
   evidence(s) = Σ(sim_pos(c, c_i))        where record_i.strategy_key == key(s)
   conf(s) = evidence(s) / (evidence(s) + k)
   ```

   - `k` 是平滑常数（控制“多少证据才算可信”）
   - 天然避免负值，并且不会因 `n` 变化导致符号翻转

4. **策略选择**：
   ```
   Score(s) = r_pred(s) + γ × (1 - conf(s))
   ```
   预测奖励 + 探索项（低置信度时探索）

---

### 模块4: MSMT - 多尺度记忆痕迹模型 (Multi-Scale Memory Trace)

**替代目标**: ACT-R Memory

**项目对接（替换 ACT-R Memory）**：

- 当前 ACT-R 调用点：`packages/backend-rust/src/amas/engine.rs::compute_actr_memory`，它从 `ProcessOptions.word_review_history` 构造痕迹并调用 `danci_algo::ACTRMemoryNative`（`packages/native/src/actr/mod.rs`）得到 `recall_probability`。
- MSMT 的输出同样定义为 `recall_probability ∈ [0,1]`，从而可直接替换上述调用，并继续与 `CognitiveProfiler` 的 `mem` 做融合（当前实现是 `0.6 * cognitive.mem + 0.4 * actr_recall`）。
- 由于项目已传入历史事件（`seconds_ago`），MSMT 可以先以“无状态重建”的方式实现：不依赖持久化 traces，只用历史事件逐步叠加即可（后续若要提速，再引入 stateful traces 缓存）。

**原理推导**：

核心思想：记忆不是单一强度，而是多个时间尺度上的痕迹叠加。

**与 ACT-R 的本质区别**：

| ACT-R            | MSMT (原创)                |
| ---------------- | -------------------------- |
| 单一激活值       | 多尺度痕迹分离             |
| 对数求和公式     | 指数衰减 + 加权组合        |
| 基于认知架构假设 | 基于多时间尺度记忆理论     |
| 参数来自认知实验 | 参数有物理意义（时间常数） |

**数据结构**：

```rust
/// 多尺度记忆痕迹
pub struct MSMTModel {
    /// 三个时间尺度的痕迹
    /// traces[0]: 短期 (τ = 1小时)
    /// traces[1]: 中期 (τ = 1天)
    /// traces[2]: 长期 (τ = 7天)
    traces: [f64; 3],

    /// 各尺度的时间常数（小时）
    tau: [f64; 3],  // [1.0, 24.0, 168.0]

    /// 上次更新时间
    last_update: i64,
}
```

**核心算法**：

0. **时间单位对齐**：
   - MSMT 的 `τ` 以“小时”为单位；项目输入历史为 `seconds_ago`，因此：

   ```
   t_hours = seconds_ago / 3600
   ```

1. **无状态重建（推荐接入方式：直接从历史算到 now）**：

   > 等价于“每次复习时先衰减再加痕迹”，但不需要持久化 `traces/last_update`。

   ```
   trace_i(now) = Σ_j (gain_i × strength_j × weight_j) × exp(-t_j / τ_i)
   ```

   - `t_j`：第 j 次复习距今的小时数
   - `gain = [1.0, 0.5, 0.2]`：短/中/长三个尺度的增益
   - `weight_j`：正确性权重（例如 correct=1.0, wrong=0.2）
   - `strength_j`：本次复习输入强度（可先取常数 1.0，后续再由题型/质量映射）

2. **激活水平**：

   ```
   activation = Σ(w_i × trace_i)
   ```

   加权组合：`w = [0.5, 0.3, 0.2]`

3. **可提取性（回忆概率）**：

   ```
   retrievability = sigmoid(activation - threshold)
   ```

   - `threshold` 控制“多大激活算可回忆”，实现中建议 clamp 到 `[0,1]` 以便与现有接口一致

---

## Part II: 词汇学习特化模块（原创应用）

### 模块5: MTP - 形态迁移传播模型 (Morphological Transfer Propagation)

**创新点**: 量化词素（词根/词缀）掌握度对新词学习的迁移效应

**理论基础**:

- 形态学习理论 (Morphological Learning Theory)
- 知识迁移原理

**与现有词根加成的区别**:

| 现有实现                          | MTP (原创)             |
| --------------------------------- | ---------------------- |
| 简单平均 `avg_root_mastery / 5.0` | 传播规则学习的迁移权重 |
| 仅考虑词根                        | 词根 + 词缀 + 词源关系 |
| 固定加成系数                      | 动态学习的迁移系数     |

**项目对接（利用现有词素网络）**：

- 词素网络与用户词素掌握度已存在：见 `packages/backend-rust/sql/016_add_morphemes.sql`（`morphemes` / `word_morphemes` / `user_morpheme_states`）。
- 后端已有特征计算：`packages/backend-rust/src/services/etymology.rs::compute_root_features` 可提供 root_count / avg_root_mastery 等（当前 AMAS 在 `packages/backend-rust/src/amas/engine.rs` 用 `avg_root_mastery / 5.0` 做简单加成）。
- MTP 要做的是把“root-only 的静态加成”升级为“按词素覆盖度 + 用户词素 mastery 的动态加成”，并输出 `bonus_mtp ∈ [0, 0.30]` 给统一公式使用。

**数据结构**：

```rust
/// 词素掌握度
pub struct MorphemeMastery {
    pub morpheme: String,
    pub mastery: f64,
    pub word_count: u32,  // 包含该词素的已学单词数
}
```

**核心算法**：

1. **迁移加成计算**：

   ```
   bonus_mtp(w) = α × Σ(mastery_norm(m) × coverage(m, w))
                  m ∈ morphemes(w)
   ```

   - `mastery_norm(m)`: 词素 m 的掌握度归一化到 `[0,1]`（例如 `masteryLevel/5` 后 clamp）
   - `coverage(m, w)`: 词素 m 在目标词中的覆盖比例/权重（可用 `word_morphemes.weight` 归一化）
   - `α = 0.1`: 迁移系数

2. **词素掌握度更新**：

   ```
   mastery_m = (mastery_m × exposure_count + word_mastery_signal) / (exposure_count + 1)
   ```

   当学会/复习一个包含该词素的单词时更新（可映射到 `user_morpheme_states.exposureCount/correctCount`）

3. **最大加成限制**：
   ```
   bonus_mtp = min(bonus_mtp, 0.3)  // 最多30%加成
   ```

---

### 模块6: IAD - 干扰衰减计数模型 (Interference Attenuation by Distance)

**创新点**: 显式建模易混淆词之间的相互干扰，优化学习间隔

**项目对接（利用现有易混淆词缓存）**：

- 项目里已有可直接复用的数据源：`confusion_pairs_cache` 表（见 `packages/backend-rust/sql/036_add_confusion_pairs_cache.sql`），由 worker `packages/backend-rust/src/workers/confusion_cache.rs` 预计算（基于 embedding distance）。
- IAD 的 `is_confusable(w, w_i)` 可以先用“是否在 cache 中”作为布尔判定；后续再把 cache 的 `distance` 纳入权重（越近越干扰）。
- `H`（学习历史窗口）可从会话内最近学习的单词列表构建；或由后端从答题记录查询构建（取最近 N 个 wordId）。

**理论基础**:

- 相似性干扰理论 (Similarity-Based Interference)
- 心理语言学研究

**与现有易混淆词功能的区别**:

| 现有实现       | IAD (原创)           |
| -------------- | -------------------- |
| 仅展示混淆词对 | 动态调整学习间隔     |
| 无调度优化     | 最小化干扰的调度策略 |
| 静态相似度     | 多维度相似度融合     |

**数据结构**：

```rust
/// 学习历史窗口
pub struct LearningWindow {
    recent_words: VecDeque<String>,  // 最近学习的单词
    window_size: usize,              // 窗口大小
}
```

**核心算法**：

1. **干扰惩罚计算**：

   ```
   penalty_iad(w, H) = Σ(1 / (lag_i + 1)) × confusable_weight(w, w_i)
                       w_i ∈ H
   ```

   - `lag_i`: `w_i` 在历史窗口 H 中距离当前位置的步数（0 表示刚刚出现）
   - `confusable_weight(w, w_i)`: 干扰权重（最小实现可取 0/1；进阶可用 embedding distance 映射到 0..1）

2. **惩罚上限（与统一公式对齐）**：

   ```
   penalty_iad = min(penalty_iad, 0.5)
   ```

   - 最终 `penalty_iad` 进入统一公式：`mult = ... × (1 - penalty_iad)`，并通过 `R_base_target = R_target / mult` 影响间隔

---

### 模块7: EVM - 编码变异度量模型 (Encoding Variability Metric)

**创新点**: 量化学习情境多样性，将其纳入调度目标函数

**理论基础**:

- 编码变异性原理 (Encoding Variability Principle)
- 情境依赖记忆 (Context-Dependent Memory)

**项目对接（可从现有事件字段逐步落地）**：

- `hour_of_day` / `day_of_week`：可由 `RawEvent.timestamp` 派生（见 `packages/backend-rust/src/amas/types.rs`）。
- `question_type`：项目事件里已有 `RawEvent.question_type`。
- `session_length`：可先用 `ProcessOptions.study_duration_minutes`（见 `packages/backend-rust/src/amas/types.rs`），或回退到 `session_stats` 推断。
- `device_type`：当前 AMAS 事件未显式携带；建议由前端上报（或从 UA 推断）后再纳入模型。
- 历史 contexts：初期可从会话内缓冲/答题记录查询构建；后续可落表以支持长期统计。

**数据结构**：

```rust
/// 学习情境记录
pub struct LearningContext {
    pub hour_of_day: u8,      // 0-23
    pub day_of_week: u8,      // 0-6
    pub question_type: u8,    // 题型编码
    pub device_type: u8,      // 设备类型
    pub session_length: u8,   // 会话长度分桶
}

/// 情境历史
pub struct ContextHistory {
    contexts: Vec<LearningContext>,
    max_size: usize,
}
```

**核心算法**：

1. **多样性计算**（基于唯一值比例）：

   ```
   diversity_dim = unique_values / total_count
   ```

   每个维度独立计算

2. **综合多样性**：

   ```
   diversity = mean(diversity_hour, diversity_type, diversity_device, ...)
   ```

3. **编码加成**：

   ```
   bonus_evm(w) = min(β × diversity(contexts(w)), 0.15)
   ```

   - `β = 0.15`: 多样性系数
   - 多样性越高，记忆越稳固；最终进入统一公式时使用乘子 `(1 + bonus_evm)`

---

## Summary

UMM 原创算法框架包含两个层次：

### 核心记忆模型层（替代现有算法）

| 原创模块 | 替代目标          | 核心创新                 |
| -------- | ----------------- | ------------------------ |
| MDM      | FSRS              | 微分方程推导，非幂律衰减 |
| IGE      | Thompson Sampling | 信息增益驱动，确定性选择 |
| SWD      | LinUCB            | 相似度加权，非参数方法   |
| MSMT     | ACT-R             | 多尺度痕迹分离           |

### 词汇学习特化层（原创应用）

| 原创模块 | 功能     | 核心创新             |
| -------- | -------- | -------------------- |
| MTP      | 形态迁移 | 词素掌握度传播规则   |
| IAD      | 干扰调度 | 计数器模型建模干扰   |
| EVM      | 编码变异 | 唯一值比例度量多样性 |

**原创性保证**：

- 不使用 Beta 分布、高斯过程、神经网络等现有技术
- 所有公式从第一性原理推导
- 参数具有明确物理意义
- 迁移期允许与现有算法并行“影子运行”仅用于对照评估，不作为最终内核的一部分

---

## 实现计划

| 阶段    | 模块                         | 依赖                | 产出                                                                       |
| ------- | ---------------------------- | ------------------- | -------------------------------------------------------------------------- |
| Phase 0 | 接入准备                     | 无                  | 新增 feature flags / AlgorithmId / 持久化字段（支持影子计算与对照）        |
| Phase 1 | MSMT                         | 无                  | 替换 `compute_actr_memory`：从历史直接输出 recall_probability              |
| Phase 2 | IGE + SWD                    | Phase 0             | 替换 AMAS 决策层的 Thompson/LinUCB（保持 `EnsembleDecision` 融合接口不变） |
| Phase 3 | MTP + IAD + EVM（只读/影子） | 现有词素/混淆词数据 | 计算 `bonus_mtp / penalty_iad / bonus_evm` 并落日志/指标（可先不影响调度） |
| Phase 4 | MDM（影子 + 切主）           | Phase 0/3           | 替换 FSRS 为 MDM，并用统一公式组合 MTP/IAD/EVM；保留 FSRS 影子输出用于回归 |
| Phase 5 | 统一引擎收敛                 | Phase 1-4           | 完整 UMM：统一输出 `retrievability/interval_days`，并完善异常/边界处理     |
| Phase 6 | A/B 测试                     | Phase 5             | 效果验证（保持率/负担/学习效率/混淆率）                                    |

---

## 研究贡献

1. **论文**: "UMM: A Unified Memory Model for Vocabulary Learning with Original Algorithms"
2. **专利**:
   - 记忆动力学模型 (MDM)
   - 信息增益探索算法 (IGE)
   - 相似度加权决策 (SWD)
   - 多尺度记忆痕迹模型 (MSMT)
   - 形态迁移传播模型 (MTP)
   - 干扰衰减计数模型 (IAD)
3. **开源**: 完全原创的词汇学习算法库
