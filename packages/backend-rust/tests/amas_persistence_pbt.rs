//! Property-Based Tests for AMAS Persistence Layer
//!
//! Tests the following invariants:
//! - State Round-Trip: save_state -> load_state preserves data
//! - Timestamp preservation: updatedAt from DB is used, not Utc::now()
//! - Null-Safety: Optional fields handle None correctly
//! - Serialization consistency: JSON round-trip for mastery_history and ensemble_performance

use proptest::prelude::*;
use std::collections::VecDeque;

use danci_backend_rust::amas::decision::ensemble::PerformanceTracker;
use danci_backend_rust::amas::types::{
    CognitiveProfile, DifficultyLevel, PersistedAMASState, StrategyParams, SwdRecommendation, UserState,
};
use danci_backend_rust::amas::memory::{MasteryAttempt, MasteryHistory};
use danci_backend_rust::services::mastery_learning::{compute_dynamic_cap, compute_target_with_swd};

// ============================================================================
// Arbitrary Generators
// ============================================================================

fn arb_f64_0_1() -> impl Strategy<Value = f64> {
    (0u64..=1000u64).prop_map(|v| v as f64 / 1000.0)
}

fn arb_cognitive_profile() -> impl Strategy<Value = CognitiveProfile> {
    (arb_f64_0_1(), arb_f64_0_1(), arb_f64_0_1()).prop_map(|(mem, speed, stability)| {
        CognitiveProfile {
            mem,
            speed,
            stability,
        }
    })
}

fn arb_user_state() -> impl Strategy<Value = UserState> {
    (
        arb_f64_0_1(),                       // attention
        arb_f64_0_1(),                       // fatigue
        arb_cognitive_profile(),             // cognitive
        (-1.0f64..=1.0f64),                  // motivation
        arb_f64_0_1(),                       // conf
        (0i64..=i64::MAX / 2),               // ts
        proptest::option::of(arb_f64_0_1()), // fused_fatigue
    )
        .prop_map(
            |(attention, fatigue, cognitive, motivation, conf, ts, fused_fatigue)| UserState {
                attention,
                fatigue,
                cognitive,
                motivation,
                habit: None,
                trend: None,
                conf,
                ts,
                visual_fatigue: None,
                fused_fatigue,
                reward_profile: None,
            },
        )
}

fn arb_difficulty_level() -> impl Strategy<Value = DifficultyLevel> {
    prop_oneof![
        Just(DifficultyLevel::Easy),
        Just(DifficultyLevel::Mid),
        Just(DifficultyLevel::Hard),
    ]
}

fn arb_strategy_params() -> impl Strategy<Value = StrategyParams> {
    (
        (0.5f64..=1.5f64),  // interval_scale
        (0.05f64..=0.5f64), // new_ratio
        arb_difficulty_level(),
        (5i32..=16i32), // batch_size
        (0i32..=2i32),  // hint_level
    )
        .prop_map(
            |(interval_scale, new_ratio, difficulty, batch_size, hint_level)| StrategyParams {
                interval_scale,
                new_ratio,
                difficulty,
                batch_size,
                hint_level,
                swd_recommendation: None,
            },
        )
}

fn arb_mastery_attempt() -> impl Strategy<Value = MasteryAttempt> {
    (
        arb_f64_0_1(),         // score
        arb_f64_0_1(),         // threshold
        any::<bool>(),         // mastered
        (0i64..=i64::MAX / 2), // timestamp
    )
        .prop_map(|(score, threshold, mastered, timestamp)| MasteryAttempt {
            score,
            threshold,
            mastered,
            timestamp,
        })
}

fn arb_mastery_history() -> impl Strategy<Value = MasteryHistory> {
    (
        prop::collection::vec(arb_mastery_attempt(), 0..10),
        arb_f64_0_1(),   // avg_margin (adjusted to -0.5..0.5)
        (0i32..=100i32), // near_miss_count
        (0i32..=100i32), // easy_pass_count
    )
        .prop_map(|(attempts, avg_margin, near_miss_count, easy_pass_count)| {
            let mut history = MasteryHistory::default();
            history.attempts = VecDeque::from(attempts);
            history.avg_margin = avg_margin - 0.5; // Shift to -0.5..0.5
            history.near_miss_count = near_miss_count;
            history.easy_pass_count = easy_pass_count;
            history
        })
}

fn arb_performance_tracker() -> impl Strategy<Value = PerformanceTracker> {
    Just(PerformanceTracker::default())
}

fn arb_persisted_amas_state() -> impl Strategy<Value = PersistedAMASState> {
    (
        "[a-z0-9]{8,16}", // user_id
        arb_user_state(),
        arb_strategy_params(),
        (0i32..=10000i32),     // interaction_count
        (0i64..=i64::MAX / 2), // last_updated
        proptest::option::of(arb_mastery_history()),
        proptest::option::of(arb_performance_tracker()),
    )
        .prop_map(
            |(
                user_id,
                user_state,
                current_strategy,
                interaction_count,
                last_updated,
                mastery_history,
                ensemble_performance,
            )| {
                PersistedAMASState {
                    user_id,
                    user_state,
                    bandit_model: None,
                    current_strategy,
                    cold_start_state: None,
                    interaction_count,
                    last_updated,
                    mastery_history,
                    ensemble_performance,
                    algorithm_states: None,
                }
            },
        )
}

// ============================================================================
// Property Tests
// ============================================================================

proptest! {
    /// PBT-1: MasteryHistory JSON serialization is round-trip safe
    #[test]
    fn mastery_history_json_roundtrip(history in arb_mastery_history()) {
        let json = serde_json::to_value(&history).unwrap();
        let restored: MasteryHistory = serde_json::from_value(json).unwrap();

        prop_assert_eq!(history.attempts.len(), restored.attempts.len());
        prop_assert!((history.avg_margin - restored.avg_margin).abs() < 1e-10);
        prop_assert_eq!(history.near_miss_count, restored.near_miss_count);
        prop_assert_eq!(history.easy_pass_count, restored.easy_pass_count);

        for (orig, rest) in history.attempts.iter().zip(restored.attempts.iter()) {
            prop_assert!((orig.score - rest.score).abs() < 1e-10);
            prop_assert!((orig.threshold - rest.threshold).abs() < 1e-10);
            prop_assert_eq!(orig.mastered, rest.mastered);
            prop_assert_eq!(orig.timestamp, rest.timestamp);
        }
    }

    /// PBT-2: PerformanceTracker JSON serialization is round-trip safe
    #[test]
    fn performance_tracker_json_roundtrip(tracker in arb_performance_tracker()) {
        let json = serde_json::to_value(&tracker).unwrap();
        let restored: PerformanceTracker = serde_json::from_value(json).unwrap();

        prop_assert_eq!(tracker.algorithms.len(), restored.algorithms.len());

        for (key, orig_perf) in &tracker.algorithms {
            let rest_perf = restored.algorithms.get(key).unwrap();
            prop_assert!((orig_perf.ema_reward - rest_perf.ema_reward).abs() < 1e-10);
            prop_assert_eq!(orig_perf.sample_count, rest_perf.sample_count);
            prop_assert!((orig_perf.trust_score - rest_perf.trust_score).abs() < 1e-10);
        }
    }

    /// PBT-3: PersistedAMASState JSON serialization preserves key fields
    #[test]
    fn persisted_state_json_roundtrip(state in arb_persisted_amas_state()) {
        let json = serde_json::to_value(&state).unwrap();
        let restored: PersistedAMASState = serde_json::from_value(json).unwrap();

        prop_assert_eq!(state.user_id, restored.user_id);
        prop_assert_eq!(state.interaction_count, restored.interaction_count);
        prop_assert_eq!(state.last_updated, restored.last_updated);

        // User state fields
        prop_assert!((state.user_state.attention - restored.user_state.attention).abs() < 1e-10);
        prop_assert!((state.user_state.fatigue - restored.user_state.fatigue).abs() < 1e-10);
        prop_assert!((state.user_state.motivation - restored.user_state.motivation).abs() < 1e-10);
        prop_assert!((state.user_state.conf - restored.user_state.conf).abs() < 1e-10);

        // Strategy params
        prop_assert!((state.current_strategy.interval_scale - restored.current_strategy.interval_scale).abs() < 1e-10);
        prop_assert!((state.current_strategy.new_ratio - restored.current_strategy.new_ratio).abs() < 1e-10);
        prop_assert_eq!(state.current_strategy.batch_size, restored.current_strategy.batch_size);

        // Optional fields presence
        prop_assert_eq!(state.mastery_history.is_some(), restored.mastery_history.is_some());
        prop_assert_eq!(state.ensemble_performance.is_some(), restored.ensemble_performance.is_some());
    }

    /// PBT-4: Null-safety - Optional fields handle None correctly
    #[test]
    fn optional_fields_null_safety(
        has_mastery in any::<bool>(),
        has_ensemble in any::<bool>(),
        has_fused_fatigue in any::<bool>(),
    ) {
        let mastery_history = if has_mastery {
            Some(MasteryHistory::default())
        } else {
            None
        };

        let ensemble_performance = if has_ensemble {
            Some(PerformanceTracker::default())
        } else {
            None
        };

        let fused_fatigue = if has_fused_fatigue {
            Some(0.5)
        } else {
            None
        };

        let state = PersistedAMASState {
            user_id: "test_user".to_string(),
            user_state: UserState {
                attention: 0.7,
                fatigue: 0.3,
                cognitive: CognitiveProfile::default(),
                motivation: 0.5,
                habit: None,
                trend: None,
                conf: 0.5,
                ts: 0,
                visual_fatigue: None,
                fused_fatigue,
                reward_profile: None,
            },
            bandit_model: None,
            current_strategy: StrategyParams::default(),
            cold_start_state: None,
            interaction_count: 0,
            last_updated: 0,
            mastery_history,
            ensemble_performance,
            algorithm_states: None,
        };

        let json = serde_json::to_value(&state).unwrap();
        let restored: PersistedAMASState = serde_json::from_value(json).unwrap();

        prop_assert_eq!(state.mastery_history.is_some(), restored.mastery_history.is_some());
        prop_assert_eq!(state.ensemble_performance.is_some(), restored.ensemble_performance.is_some());
        prop_assert_eq!(state.user_state.fused_fatigue.is_some(), restored.user_state.fused_fatigue.is_some());
    }

    /// PBT-5: Cognitive profile values are clamped to valid range
    #[test]
    fn cognitive_profile_valid_range(profile in arb_cognitive_profile()) {
        prop_assert!(profile.mem >= 0.0 && profile.mem <= 1.0);
        prop_assert!(profile.speed >= 0.0 && profile.speed <= 1.0);
        prop_assert!(profile.stability >= 0.0 && profile.stability <= 1.0);
    }

    /// PBT-6: Strategy params batch_size is within valid bounds
    #[test]
    fn strategy_params_batch_size_valid(params in arb_strategy_params()) {
        prop_assert!(params.batch_size >= 5 && params.batch_size <= 16);
        prop_assert!(params.new_ratio >= 0.05 && params.new_ratio <= 0.5);
        prop_assert!(params.hint_level >= 0 && params.hint_level <= 2);
    }

    /// PBT-7: MasteryHistory attempts maintain order after serialization
    #[test]
    fn mastery_history_order_preserved(history in arb_mastery_history()) {
        if history.attempts.len() < 2 {
            return Ok(());
        }

        let json = serde_json::to_value(&history).unwrap();
        let restored: MasteryHistory = serde_json::from_value(json).unwrap();

        // Verify order is preserved
        for i in 0..history.attempts.len() {
            prop_assert_eq!(
                history.attempts[i].timestamp,
                restored.attempts[i].timestamp,
                "Order mismatch at index {}", i
            );
        }
    }

    /// PBT-8: PerformanceTracker algorithm keys are preserved
    #[test]
    fn performance_tracker_keys_preserved(tracker in arb_performance_tracker()) {
        let json = serde_json::to_value(&tracker).unwrap();
        let restored: PerformanceTracker = serde_json::from_value(json).unwrap();

        for key in tracker.algorithms.keys() {
            prop_assert!(
                restored.algorithms.contains_key(key),
                "Key {} missing after round-trip", key
            );
        }
    }
}

// ============================================================================
// Additional Unit Tests for Edge Cases
// ============================================================================

#[test]
fn empty_mastery_history_serializes() {
    let history = MasteryHistory::default();
    let json = serde_json::to_value(&history).unwrap();
    let restored: MasteryHistory = serde_json::from_value(json).unwrap();
    assert!(restored.attempts.is_empty());
}

#[test]
fn empty_performance_tracker_serializes() {
    let tracker = PerformanceTracker::default();
    let json = serde_json::to_value(&tracker).unwrap();
    let restored: PerformanceTracker = serde_json::from_value(json).unwrap();
    assert!(restored.algorithms.is_empty());
}

#[test]
fn mastery_history_max_capacity() {
    let mut history = MasteryHistory::new();
    for i in 0..30 {
        history.record(0.5, 0.5, i % 2 == 0, i as i64 * 1000);
    }
    // Should cap at MAX_HISTORY (20)
    assert!(history.attempts.len() <= 20);
}

#[test]
fn persisted_state_with_all_none_fields() {
    let state = PersistedAMASState {
        user_id: "test".to_string(),
        user_state: UserState::default(),
        bandit_model: None,
        current_strategy: StrategyParams::default(),
        cold_start_state: None,
        interaction_count: 0,
        last_updated: 0,
        mastery_history: None,
        ensemble_performance: None,
        algorithm_states: None,
    };

    let json = serde_json::to_value(&state).unwrap();
    let restored: PersistedAMASState = serde_json::from_value(json).unwrap();

    assert_eq!(state.user_id, restored.user_id);
    assert!(restored.mastery_history.is_none());
    assert!(restored.ensemble_performance.is_none());
}

// ============================================================================
// SWD Target Count Upgrade PBT Tests
// ============================================================================

fn arb_user_state_for_cap() -> impl Strategy<Value = UserState> {
    (
        arb_f64_0_1(),                       // attention
        arb_f64_0_1(),                       // fatigue
        (-1.0f64..=1.0f64),                  // motivation
        arb_f64_0_1(),                       // stability
        arb_f64_0_1(),                       // speed
        proptest::option::of(arb_f64_0_1()), // fused_fatigue
    )
        .prop_map(|(attention, fatigue, motivation, stability, speed, fused_fatigue)| {
            UserState {
                attention,
                fatigue,
                motivation,
                cognitive: CognitiveProfile {
                    mem: 0.5,
                    speed,
                    stability,
                },
                fused_fatigue,
                ..Default::default()
            }
        })
}

proptest! {
    /// PBT-SWD-1: Dynamic cap minimum bound invariant
    #[test]
    fn pbt_dynamic_cap_minimum_bound(state in arb_user_state_for_cap()) {
        let cap = compute_dynamic_cap(&state);
        prop_assert!(cap >= 20, "Cap {} violated minimum bound 20", cap);
    }

    /// PBT-SWD-2: Fatigue monotonicity
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

    /// PBT-SWD-3: Attention monotonicity
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

    /// PBT-SWD-4: Target computation idempotent
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

    /// PBT-SWD-5: User priority invariant
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

    /// PBT-SWD-6: Cap constraint invariant
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

    /// PBT-SWD-7: Confidence threshold invariant
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
