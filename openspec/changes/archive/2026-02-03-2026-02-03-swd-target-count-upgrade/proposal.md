# Proposal: SWD 策略目标数量计算升级

## 需求概述

升级 SWD (Similarity-Weighted Decision) 策略的目标单词数量计算逻辑：

1. **基础计算**: 目标数量 = 用户设定值 + SWD推荐值
2. **动态上限**: 根据学习状态动态设定上限，上限最小值为 20，无最大值
3. **上限约束**: 如果 (用户设定 + SWD推荐) > 上限，则取上限值
4. **用户优先**: 如果用户设定值已超过上限，忽略 SWD 推荐，只取用户设定值
5. **置信度过滤**: 当 SWD 推荐置信度 < 0.5 时，忽略推荐

## 明确约束 (Zero-Decision Constraints)

| 约束项            | 值                                 | 说明                                    |
| ----------------- | ---------------------------------- | --------------------------------------- |
| user_setting 来源 | `daily_word_count`                 | 用户在设置页面配置的每日单词数 (10-100) |
| 动态上限最小值    | 20                                 | `MIN_CAP = 20`                          |
| 动态上限最大值    | 无限制                             | 由算法自然约束                          |
| fatigue 范围      | [0.0, 1.0]                         | 0=无疲劳, 1=极度疲劳                    |
| attention 范围    | [0.0, 1.0]                         | 0=无注意力, 1=完全专注                  |
| motivation 范围   | [-1.0, 1.0]                        | -1=消极, 0=中性, 1=积极                 |
| 疲劳信号选择      | `fused_fatigue.unwrap_or(fatigue)` | 融合疲劳优先                            |
| confidence 阈值   | 0.5                                | `confidence < 0.5` 时忽略 SWD 推荐      |
| SWD 推荐最大值    | 无限制                             | 由动态上限约束                          |
| 冷启动行为        | 返回 `None`                        | 无历史数据时不推荐                      |

## 当前实现分析

### 关键文件

- `packages/backend-rust/src/amas/decision/swd.rs` - SWD 算法实现
- `packages/backend-rust/src/amas/types.rs` - StrategyParams 定义 (batch_size: 5-16)
- `packages/backend-rust/src/services/mastery_learning.rs` - 目标数量计算逻辑
- `packages/backend-rust/src/services/study_config.rs` - 用户配置 (daily_word_count: 10-100)

### 现有流程

```
用户设置 daily_word_count (10-100)
    ↓
AMAS/SWD 推荐 StrategyParams { batch_size: 5-16, ... }
    ↓
effective_batch_size(requested, strategy) → 实际批量大小
    ↓
get_words_for_mastery_mode() 使用 target_count 或 config.daily_mastery_target
```

### 现有约束

- `batch_size` 范围: 5-16 (`types.rs:349`)
- `daily_word_count` 范围: 10-100 (`routes/study_config.rs:113-123`)
- `effective_batch_size` 上限: 1-20 (`mastery_learning.rs:28-29`)

## 设计方案

### 新增数据结构

```rust
// packages/backend-rust/src/amas/types.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwdRecommendation {
    /// SWD 推荐的额外单词数量
    pub recommended_count: i32,
    /// 推荐置信度
    pub confidence: f64,
}

impl StrategyParams {
    // 新增字段
    pub swd_recommendation: Option<SwdRecommendation>,
}
```

### 核心计算逻辑

```rust
// packages/backend-rust/src/services/mastery_learning.rs

/// 计算动态上限，基于用户学习状态
///
/// # 算法说明
/// - 无固定基础值，完全由学习状态决定
/// - 正向因子：attention (35%), motivation (30%), stability (20%), speed (15%)
/// - 负向因子：fatigue 作为惩罚项降低容量
/// - 输出范围：[MIN_CAP, ∞)，实际受状态值约束在 [20, 100]
fn compute_dynamic_cap(user_state: &UserState) -> i32 {
    const MIN_CAP: i32 = 20;
    const MAX_ADDITIONAL: f64 = 80.0; // 最大额外容量

    // 使用融合疲劳，回退到原始疲劳
    let effective_fatigue = user_state.fused_fatigue.unwrap_or(user_state.fatigue);

    // motivation [-1, 1] 归一化到 [0, 1]
    let normalized_motivation = (user_state.motivation + 1.0) / 2.0;

    // 正向因子加权求和 (范围 0-1)
    let base_capacity =
        user_state.attention * 0.35
        + normalized_motivation * 0.30
        + user_state.cognitive.stability * 0.20
        + user_state.cognitive.speed * 0.15;

    // 疲劳惩罚 (最多降低 50% 容量)
    let fatigue_penalty = effective_fatigue * 0.5;

    // 净容量 (下限 0)
    let net_capacity = (base_capacity - fatigue_penalty).max(0.0);

    // 映射到上限值
    let cap = MIN_CAP as f64 + net_capacity * MAX_ADDITIONAL;

    cap.round() as i32
}

/// 计算最终目标数量（SWD参与时）
///
/// # 规则
/// 1. 无 SWD 推荐 → 返回用户设定
/// 2. SWD 置信度 < 0.5 → 忽略推荐，返回用户设定
/// 3. 用户设定 > 动态上限 → 用户优先，忽略 SWD
/// 4. 否则 → min(用户设定 + SWD推荐, 动态上限)
fn compute_target_with_swd(
    user_target: i64,
    swd_recommendation: Option<&SwdRecommendation>,
    dynamic_cap: i32,
) -> i64 {
    match swd_recommendation {
        Some(rec) if rec.confidence >= 0.5 && rec.recommended_count > 0 => {
            // 用户设定已超过上限 → 忽略 SWD，取用户设定
            if user_target > dynamic_cap as i64 {
                return user_target;
            }
            // 计算合并值，受上限约束
            let combined = user_target + rec.recommended_count as i64;
            combined.min(dynamic_cap as i64)
        }
        _ => user_target, // 无 SWD 推荐或置信度不足时，直接使用用户设定
    }
}
```

### SWD 推荐数量计算

```rust
// packages/backend-rust/src/amas/decision/swd.rs

impl SwdModel {
    /// 基于历史表现推荐额外单词数量
    ///
    /// # 返回值
    /// - `None`: 冷启动（无历史数据）或证据不足
    /// - `Some(SwdRecommendation)`: 推荐结果，含置信度
    pub fn recommend_additional_count(&self, context: &[f64]) -> Option<SwdRecommendation> {
        // 冷启动：无历史数据时返回 None
        if self.history.is_empty() {
            return None;
        }

        // 计算当前上下文的加权平均奖励
        let mut weighted_reward = 0.0;
        let mut weight_total = 0.0;

        for (i, entry) in self.history.iter().rev().enumerate() {
            let sim = Self::cosine_similarity(context, &entry.context);
            let recency = GAMMA.powi(i as i32);
            let weight = (sim + 1.0) / 2.0 * recency;
            weighted_reward += weight * entry.reward;
            weight_total += weight;
        }

        if weight_total < EPSILON {
            return None;
        }

        let avg_reward = weighted_reward / weight_total;

        // 置信度：基于权重总和和历史数量
        let confidence = (weight_total / self.history.len() as f64).min(1.0);

        // avg_reward 范围 [0, 1]，映射到推荐数量（无上限）
        let recommendation = (avg_reward * 10.0).round() as i32;

        if recommendation > 0 {
            Some(SwdRecommendation {
                recommended_count: recommendation, // 无最大值限制
                confidence,
            })
        } else {
            None
        }
    }
}
```

## 修改清单

| 文件                                                     | 修改内容                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/backend-rust/src/amas/types.rs`                | 新增 `SwdRecommendation` 结构体，`StrategyParams` 添加可选字段                                   |
| `packages/backend-rust/src/amas/decision/swd.rs`         | 新增 `recommend_additional_count()` 方法                                                         |
| `packages/backend-rust/src/amas/engine.rs`               | 在策略决策时调用 SWD 推荐，填充 `swd_recommendation`                                             |
| `packages/backend-rust/src/services/mastery_learning.rs` | 新增 `compute_dynamic_cap()` 和 `compute_target_with_swd()`，修改 `get_words_for_mastery_mode()` |

## 验收标准

1. **基础功能**: 当 SWD 推荐数量时，目标数 = 用户设定 + SWD推荐
2. **上限约束**: 合并后的目标数不超过动态上限
3. **最小上限**: 动态上限最小值为 20
4. **用户优先**: 用户设定超过上限时，忽略 SWD 推荐
5. **无 SWD 时**: 无推荐时直接使用用户设定值
6. **向后兼容**: 不影响现有 API 接口

## 测试用例

```rust
#[test]
fn test_target_with_swd_basic() {
    // 用户设定 15，SWD 推荐 5 (置信度 0.8)，上限 30 → 结果 20
    let rec = SwdRecommendation { recommended_count: 5, confidence: 0.8 };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 30), 20);
}

#[test]
fn test_target_with_swd_cap_applied() {
    // 用户设定 15，SWD 推荐 10，上限 20 → 结果 20 (受上限约束)
    let rec = SwdRecommendation { recommended_count: 10, confidence: 0.8 };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 20), 20);
}

#[test]
fn test_target_user_exceeds_cap() {
    // 用户设定 25，SWD 推荐 5，上限 20 → 结果 25 (用户优先)
    let rec = SwdRecommendation { recommended_count: 5, confidence: 0.8 };
    assert_eq!(compute_target_with_swd(25, Some(&rec), 20), 25);
}

#[test]
fn test_target_no_swd() {
    // 用户设定 15，无 SWD 推荐 → 结果 15
    assert_eq!(compute_target_with_swd(15, None, 30), 15);
}

#[test]
fn test_target_low_confidence() {
    // 用户设定 15，SWD 推荐 5 但置信度 0.3 → 结果 15 (忽略低置信度推荐)
    let rec = SwdRecommendation { recommended_count: 5, confidence: 0.3 };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 30), 15);
}

#[test]
fn test_dynamic_cap_minimum() {
    // 极端疲劳状态下，上限不低于 20
    let tired_state = UserState {
        fatigue: 1.0,
        attention: 0.0,
        motivation: -1.0,
        cognitive: CognitiveProfile { mem: 0.0, speed: 0.0, stability: 0.0 },
        fused_fatigue: Some(1.0),
        ..Default::default()
    };
    assert_eq!(compute_dynamic_cap(&tired_state), 20);
}

#[test]
fn test_dynamic_cap_optimal() {
    // 最佳状态下，上限为 100
    let optimal_state = UserState {
        fatigue: 0.0,
        attention: 1.0,
        motivation: 1.0,
        cognitive: CognitiveProfile { mem: 1.0, speed: 1.0, stability: 1.0 },
        fused_fatigue: Some(0.0),
        ..Default::default()
    };
    assert_eq!(compute_dynamic_cap(&optimal_state), 100);
}

#[test]
fn test_dynamic_cap_average() {
    // 平均状态下，上限约 72
    let avg_state = UserState {
        fatigue: 0.0,
        attention: 0.7,
        motivation: 0.5,
        cognitive: CognitiveProfile { mem: 0.5, speed: 0.5, stability: 0.5 },
        fused_fatigue: None,
        ..Default::default()
    };
    let cap = compute_dynamic_cap(&avg_state);
    assert!(cap >= 70 && cap <= 75, "Expected ~72, got {}", cap);
}
```

## Property-Based Testing (PBT) 属性

### 不变量定义

```rust
use proptest::prelude::*;

// 状态值生成器
fn arb_user_state_for_cap() -> impl Strategy<Value = UserState> {
    (
        0.0f64..=1.0,           // attention
        0.0f64..=1.0,           // fatigue
        -1.0f64..=1.0,          // motivation
        0.0f64..=1.0,           // stability
        0.0f64..=1.0,           // speed
        proptest::option::of(0.0f64..=1.0), // fused_fatigue
    ).prop_map(|(attention, fatigue, motivation, stability, speed, fused_fatigue)| {
        UserState {
            attention,
            fatigue,
            motivation,
            cognitive: CognitiveProfile { mem: 0.5, speed, stability },
            fused_fatigue,
            ..Default::default()
        }
    })
}

// PBT-1: 动态上限下界不变量
// ∀ state: compute_dynamic_cap(state) >= MIN_CAP
proptest! {
    #[test]
    fn pbt_dynamic_cap_minimum_bound(state in arb_user_state_for_cap()) {
        let cap = compute_dynamic_cap(&state);
        prop_assert!(cap >= 20, "Cap {} violated minimum bound 20", cap);
    }
}

// PBT-2: 疲劳单调性
// ∀ state, f1 < f2: compute_dynamic_cap(state{fatigue=f1}) >= compute_dynamic_cap(state{fatigue=f2})
proptest! {
    #[test]
    fn pbt_fatigue_monotonicity(
        base_state in arb_user_state_for_cap(),
        f1 in 0.0f64..=0.5,
        f2 in 0.5f64..=1.0,
    ) {
        let mut state1 = base_state.clone();
        let mut state2 = base_state;
        state1.fused_fatigue = Some(f1);
        state2.fused_fatigue = Some(f2);

        let cap1 = compute_dynamic_cap(&state1);
        let cap2 = compute_dynamic_cap(&state2);
        prop_assert!(cap1 >= cap2, "Fatigue monotonicity violated: cap({})={} < cap({})={}", f1, cap1, f2, cap2);
    }
}

// PBT-3: 注意力单调性
// ∀ state, a1 < a2: compute_dynamic_cap(state{attention=a1}) <= compute_dynamic_cap(state{attention=a2})
proptest! {
    #[test]
    fn pbt_attention_monotonicity(
        base_state in arb_user_state_for_cap(),
        a1 in 0.0f64..=0.5,
        a2 in 0.5f64..=1.0,
    ) {
        let mut state1 = base_state.clone();
        let mut state2 = base_state;
        state1.attention = a1;
        state2.attention = a2;

        let cap1 = compute_dynamic_cap(&state1);
        let cap2 = compute_dynamic_cap(&state2);
        prop_assert!(cap1 <= cap2, "Attention monotonicity violated: cap({})={} > cap({})={}", a1, cap1, a2, cap2);
    }
}

// PBT-4: 目标计算幂等性
// ∀ inputs: compute_target_with_swd(t, r, c) == compute_target_with_swd(t, r, c)
proptest! {
    #[test]
    fn pbt_target_idempotent(
        user_target in 10i64..=100,
        rec_count in 0i32..=10,
        confidence in 0.0f64..=1.0,
        cap in 20i32..=100,
    ) {
        let rec = SwdRecommendation { recommended_count: rec_count, confidence };
        let result1 = compute_target_with_swd(user_target, Some(&rec), cap);
        let result2 = compute_target_with_swd(user_target, Some(&rec), cap);
        prop_assert_eq!(result1, result2);
    }
}

// PBT-5: 用户优先不变量
// ∀ user_target > cap: compute_target_with_swd(user_target, _, cap) == user_target
proptest! {
    #[test]
    fn pbt_user_priority_invariant(
        cap in 20i32..=50,
        excess in 1i64..=50,
        rec_count in 1i32..=10,
    ) {
        let user_target = cap as i64 + excess;
        let rec = SwdRecommendation { recommended_count: rec_count, confidence: 0.9 };
        let result = compute_target_with_swd(user_target, Some(&rec), cap);
        prop_assert_eq!(result, user_target, "User priority violated: expected {}, got {}", user_target, result);
    }
}

// PBT-6: 上限约束不变量
// ∀ user_target <= cap, rec: compute_target_with_swd(user_target, rec, cap) <= cap
proptest! {
    #[test]
    fn pbt_cap_constraint_invariant(
        user_target in 10i64..=50,
        rec_count in 0i32..=10,
        confidence in 0.5f64..=1.0,
        cap in 50i32..=100,
    ) {
        let rec = SwdRecommendation { recommended_count: rec_count, confidence };
        let result = compute_target_with_swd(user_target, Some(&rec), cap);
        prop_assert!(result <= cap as i64, "Cap constraint violated: {} > {}", result, cap);
    }
}

// PBT-7: 置信度阈值不变量
// ∀ rec.confidence < 0.5: compute_target_with_swd(t, rec, c) == t
proptest! {
    #[test]
    fn pbt_confidence_threshold_invariant(
        user_target in 10i64..=100,
        rec_count in 1i32..=10,
        confidence in 0.0f64..0.5,
        cap in 50i32..=100,
    ) {
        let rec = SwdRecommendation { recommended_count: rec_count, confidence };
        let result = compute_target_with_swd(user_target, Some(&rec), cap);
        prop_assert_eq!(result, user_target, "Low confidence should be ignored: expected {}, got {}", user_target, result);
    }
}

// PBT-8: 冷启动安全性
// ∀ empty_model: recommend_additional_count(empty_model, _) == None
#[test]
fn pbt_cold_start_returns_none() {
    let empty_model = SwdModel::new();
    let context = vec![0.5; 10];
    assert!(empty_model.recommend_additional_count(&context).is_none());
}
```

### 伪造策略 (Falsification Strategies)

| 属性             | 伪造方法                                                 |
| ---------------- | -------------------------------------------------------- |
| PBT-1 下界       | 生成极端负面状态 (fatigue=1, attention=0, motivation=-1) |
| PBT-2 疲劳单调   | 固定其他参数，仅变化 fatigue，验证 cap 递减              |
| PBT-3 注意力单调 | 固定其他参数，仅变化 attention，验证 cap 递增            |
| PBT-5 用户优先   | 生成 user_target > cap 的边界情况                        |
| PBT-6 上限约束   | 生成 user_target + rec > cap 的情况                      |
| PBT-7 置信度阈值 | 生成 confidence ∈ [0, 0.5) 的边界值                      |
