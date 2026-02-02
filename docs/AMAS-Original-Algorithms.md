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
