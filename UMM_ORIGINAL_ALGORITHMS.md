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
