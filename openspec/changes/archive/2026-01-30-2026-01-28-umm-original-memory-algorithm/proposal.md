# Proposal: UMM - Unified Memory Model (完全原创记忆算法系统)

## Why

当前 AMAS 系统的核心算法缺乏原创性，直接移植自学术界/开源社区：

| 现有算法          | 来源                | 调用位置                                                            |
| ----------------- | ------------------- | ------------------------------------------------------------------- |
| FSRS              | Jarrett Ye 开源项目 | `services/fsrs.rs` → `engine.rs::fsrs_next_interval_with_root`      |
| Thompson Sampling | 1933年经典算法      | `decision/thompson.rs` → `engine.rs::models.thompson.select_action` |
| LinUCB            | Li et al. 2010      | `decision/linucb.rs` → `engine.rs::models.linucb.select_action`     |
| ACT-R Memory      | John Anderson CMU   | `native/src/actr/mod.rs` → `engine.rs::compute_actr_memory`         |

**核心原则**：不借用任何现有算法，从第一性原理推导，用不同的数学方法实现相同目标。

## What Changes

实现 **UMM (Unified Memory Model)** —— 7个完全原创的记忆算法模块：

### 核心记忆模型层（替代现有算法）

| 原创模块                               | 替代目标          | 核心创新                                         |
| -------------------------------------- | ----------------- | ------------------------------------------------ |
| **MDM** (Memory Dynamics Model)        | FSRS              | 微分方程推导 `dM/dt = -λ(M,C)×M`，非幂律衰减     |
| **IGE** (Information Gain Exploration) | Thompson Sampling | 信息增益驱动，确定性选择（无随机采样）           |
| **SWD** (Similarity-Weighted Decision) | LinUCB            | 相似度加权 k-NN，无矩阵求逆                      |
| **MSMT** (Multi-Scale Memory Trace)    | ACT-R             | 多尺度痕迹分离（短期/中期/长期 τ=[1h,24h,168h]） |

### 词汇学习特化层（原创应用）

| 原创模块                                       | 功能         | 数据来源                             |
| ---------------------------------------------- | ------------ | ------------------------------------ |
| **MTP** (Morphological Transfer Propagation)   | 形态迁移加成 | `morphemes` + `user_morpheme_states` |
| **IAD** (Interference Attenuation by Distance) | 干扰惩罚     | `confusion_pairs_cache`              |
| **EVM** (Encoding Variability Metric)          | 编码变异加成 | `RawEvent.question_type/timestamp`   |

### 统一公式

```
R_base(w, Δt) = MDM.retrievability(w, Δt)              // ∈ (0, 1]
bonus_mtp(w) ∈ [0, 0.30]
penalty_iad(w, H) ∈ [0, 0.50]
bonus_evm(w) ∈ [0, 0.15]

mult(w, H) = (1 + bonus_mtp) × (1 + bonus_evm) × (1 - penalty_iad)
R(w, Δt, H) = clamp(R_base × mult, 0, 1)

interval_days = MDM.interval_for_target(R_target / mult)
```

## Impact

### Affected Specs

- **NEW**: `umm-memory-dynamics` - MDM + MSMT 记忆模型
- **NEW**: `umm-decision-layer` - IGE + SWD 决策算法
- **NEW**: `umm-vocabulary-specialization` - MTP + IAD + EVM 词汇特化

### Affected Code

**新增模块** (`packages/backend-rust/src/umm/`):

- `mdm.rs` - Memory Dynamics Model
- `ige.rs` - Information Gain Exploration
- `swd.rs` - Similarity-Weighted Decision
- `msmt.rs` - Multi-Scale Memory Trace
- `mtp.rs` - Morphological Transfer Propagation
- `iad.rs` - Interference Attenuation by Distance
- `evm.rs` - Encoding Variability Metric
- `engine.rs` - UMM 统一引擎

**修改模块**:

- `amas/engine.rs` - 集成 UMM 作为可选后端（feature flag 切换）
- `amas/metrics.rs` - 新增 UMM AlgorithmId 变体
- `amas/config.rs` - 新增 UMM feature flags

### Database Changes

**新增字段** (`word_learning_states` 表):

- `umm_strength` DOUBLE PRECISION - MDM 记忆强度 M
- `umm_consolidation` DOUBLE PRECISION - MDM 巩固度 C
- `umm_last_review_ts` BIGINT - MDM 上次复习时间戳

**新增表** (可选，Phase 6 A/B 测试时):

- `umm_shadow_results` - 影子计算结果用于对照评估

## Success Criteria

1. **MDM**: 可提取性预测准确率 ≥ FSRS 基线
2. **IGE/SWD**: 策略选择收敛速度 ≥ Thompson/LinUCB
3. **MSMT**: 回忆概率预测与 ACT-R 对齐
4. **MTP**: 含已知词素的新词首次正确率提升 > 10%
5. **IAD**: 易混淆词对的混淆率下降 > 15%
6. **EVM**: 长期保持率 (30天后) 提升 > 8%

## Research Contribution

1. **论文**: "UMM: A Unified Memory Model for Vocabulary Learning with Original Algorithms"
2. **专利**: MDM、IGE、SWD、MSMT、MTP、IAD 独立算法
3. **开源**: 完全原创的词汇学习算法库
