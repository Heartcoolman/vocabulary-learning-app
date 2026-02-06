use danci_backend_rust::amas::config::{ColdStartConfig, EnsembleConfig, FeatureFlags};
use danci_backend_rust::amas::decision::{ColdStartManager, EnsembleDecision};
use danci_backend_rust::amas::types::{
    CognitiveProfile, DifficultyLevel, FeatureVector, StrategyParams, SwdRecommendation, UserState,
};
use danci_backend_rust::services::mastery_learning::{
    compute_dynamic_cap, compute_target_with_swd,
};

fn sample_strategy() -> StrategyParams {
    StrategyParams {
        difficulty: DifficultyLevel::Mid,
        new_ratio: 0.2,
        batch_size: 8,
        interval_scale: 1.0,
        hint_level: 1,
        swd_recommendation: None,
    }
}

fn sample_user_state() -> UserState {
    UserState {
        attention: 0.7,
        fatigue: 0.3,
        cognitive: CognitiveProfile::default(),
        motivation: 0.5,
        habit: None,
        trend: None,
        conf: 0.5,
        ts: 0,
        visual_fatigue: None,
        fused_fatigue: None,
        reward_profile: None,
    }
}

fn sample_feature_vector(dim: usize) -> FeatureVector {
    FeatureVector::new(vec![0.5; dim], vec!["f".to_string(); dim])
}

#[test]
fn integration_coldstart_full_lifecycle() {
    let config = ColdStartConfig {
        classify_samples: 3,
        explore_samples: 3,
        min_classify_samples: 2,
        min_explore_samples: 2,
        ..Default::default()
    };
    let mut manager = ColdStartManager::new(config);

    for _ in 0..3 {
        let strategy = manager.update(0.9, 1500);
        assert!(strategy.is_some());
    }

    assert!(manager.user_type().is_some());

    for _ in 0..3 {
        let strategy = manager.update(0.85, 2000);
        assert!(strategy.is_some());
    }

    assert!(manager.is_complete());
    assert!(manager.settled_strategy().is_some());
}

#[test]
fn integration_ensemble_decision_flow() {
    let flags = FeatureFlags {
        amas_ige_enabled: true,
        amas_swd_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let mut ensemble = EnsembleDecision::new(flags);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let ige_action = StrategyParams {
        difficulty: DifficultyLevel::Hard,
        new_ratio: 0.3,
        ..sample_strategy()
    };
    let swd_action = StrategyParams {
        difficulty: DifficultyLevel::Easy,
        new_ratio: 0.1,
        ..sample_strategy()
    };

    let (final_strategy, candidates) = ensemble.decide(
        &state,
        &feature,
        &current,
        Some(&ige_action),
        Some(0.8),
        Some(&swd_action),
        Some(0.7),
    );

    assert!(!candidates.is_empty());
    assert!(candidates.len() >= 2);

    let filtered = ensemble.post_filter(final_strategy.clone(), &state, None);
    assert!(filtered.batch_size >= 5 && filtered.batch_size <= 16);
    assert!(filtered.new_ratio >= 0.05 && filtered.new_ratio <= 0.5);

    ensemble.update_performance(&candidates, &final_strategy, 0.8);
}

#[test]
fn integration_ensemble_with_fatigue() {
    let flags = FeatureFlags {
        amas_ige_enabled: true,
        amas_swd_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let ensemble = EnsembleDecision::new(flags);
    let mut state = sample_user_state();
    state.fatigue = 0.95;
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let ige_action = StrategyParams {
        difficulty: DifficultyLevel::Hard,
        batch_size: 16,
        ..sample_strategy()
    };

    let (final_strategy, _) = ensemble.decide(
        &state,
        &feature,
        &current,
        Some(&ige_action),
        Some(0.9),
        None,
        None,
    );

    let filtered = ensemble.post_filter(final_strategy, &state, None);
    assert_eq!(filtered.difficulty, DifficultyLevel::Easy);
    assert!(filtered.batch_size <= 5);
}

#[test]
fn integration_coldstart_to_ensemble_handoff() {
    let coldstart_config = ColdStartConfig {
        classify_samples: 2,
        explore_samples: 2,
        min_classify_samples: 1,
        min_explore_samples: 1,
        ..Default::default()
    };
    let mut coldstart = ColdStartManager::new(coldstart_config);

    for _ in 0..4 {
        coldstart.update(0.85, 2000);
    }

    assert!(coldstart.is_complete());
    let settled = coldstart.settled_strategy().unwrap().clone();

    let flags = FeatureFlags::default();
    let ensemble = EnsembleDecision::new(flags);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);

    let (final_strategy, candidates) =
        ensemble.decide(&state, &feature, &settled, None, None, None, None);

    assert!(!candidates.is_empty());
    assert!(final_strategy.batch_size >= 5);
}

#[test]
fn integration_performance_tracker_adapts_weights() {
    let config = EnsembleConfig {
        heuristic_base_weight: 1.0,
        ..Default::default()
    };
    let flags = FeatureFlags {
        amas_ige_enabled: true,
        amas_swd_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let mut ensemble = EnsembleDecision::with_config(flags, config);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let ige_action = sample_strategy();
    let swd_action = StrategyParams {
        difficulty: DifficultyLevel::Easy,
        ..sample_strategy()
    };

    for i in 0..30 {
        let (final_strategy, candidates) = ensemble.decide(
            &state,
            &feature,
            &current,
            Some(&ige_action),
            Some(0.8),
            Some(&swd_action),
            Some(0.6),
        );

        let reward = if i % 2 == 0 { 1.0 } else { 0.5 };
        ensemble.update_performance(&candidates, &final_strategy, reward);
    }

    let weights =
        ensemble
            .performance
            .get_weights(&[("ige", 0.4), ("swd", 0.4), ("heuristic", 0.2)]);
    let total: f64 = weights.values().sum();
    assert!((total - 1.0).abs() < 1e-6);
}

#[test]
fn integration_all_original_algorithms_shadow_mode() {
    // Test that decision flow works with all original algorithm flags enabled.
    // These algorithms run in shadow/parallel mode alongside baseline models.
    let flags = FeatureFlags {
        amas_ige_enabled: true,
        amas_swd_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let ensemble = EnsembleDecision::new(flags);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    // Decision flow should work normally with all shadow algorithms enabled
    let (final_strategy, candidates) =
        ensemble.decide(&state, &feature, &current, None, None, None, None);

    // Verify the decision flow completes and produces valid output
    assert!(candidates.len() >= 1);
    assert!(final_strategy.batch_size >= 5 && final_strategy.batch_size <= 16);
    assert!(final_strategy.new_ratio >= 0.05 && final_strategy.new_ratio <= 0.5);

    // Post-filter should also work with these flags
    let filtered = ensemble.post_filter(final_strategy.clone(), &state, None);
    assert!(filtered.batch_size >= 5 && filtered.batch_size <= 16);
}

// ============================================
// SWD Target Count Upgrade Tests
// ============================================

#[test]
fn test_target_with_swd_basic() {
    let rec = SwdRecommendation {
        recommended_count: 5,
        confidence: 0.8,
    };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 30), 20);
}

#[test]
fn test_target_with_swd_cap_applied() {
    let rec = SwdRecommendation {
        recommended_count: 10,
        confidence: 0.8,
    };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 20), 20);
}

#[test]
fn test_target_user_exceeds_cap() {
    let rec = SwdRecommendation {
        recommended_count: 5,
        confidence: 0.8,
    };
    assert_eq!(compute_target_with_swd(25, Some(&rec), 20), 25);
}

#[test]
fn test_target_no_swd() {
    assert_eq!(compute_target_with_swd(15, None, 30), 15);
}

#[test]
fn test_target_low_confidence() {
    let rec = SwdRecommendation {
        recommended_count: 5,
        confidence: 0.3,
    };
    assert_eq!(compute_target_with_swd(15, Some(&rec), 30), 15);
}

#[test]
fn test_dynamic_cap_minimum() {
    let tired_state = UserState {
        fatigue: 1.0,
        attention: 0.0,
        motivation: -1.0,
        cognitive: CognitiveProfile {
            mem: 0.0,
            speed: 0.0,
            stability: 0.0,
        },
        fused_fatigue: Some(1.0),
        ..Default::default()
    };
    assert_eq!(compute_dynamic_cap(&tired_state), 20);
}

#[test]
fn test_dynamic_cap_optimal() {
    let optimal_state = UserState {
        fatigue: 0.0,
        attention: 1.0,
        motivation: 1.0,
        cognitive: CognitiveProfile {
            mem: 1.0,
            speed: 1.0,
            stability: 1.0,
        },
        fused_fatigue: Some(0.0),
        ..Default::default()
    };
    assert_eq!(compute_dynamic_cap(&optimal_state), 100);
}

#[test]
fn test_dynamic_cap_average() {
    let avg_state = UserState {
        fatigue: 0.0,
        attention: 0.7,
        motivation: 0.5,
        cognitive: CognitiveProfile {
            mem: 0.5,
            speed: 0.5,
            stability: 0.5,
        },
        fused_fatigue: None,
        ..Default::default()
    };
    let cap = compute_dynamic_cap(&avg_state);
    assert!(cap >= 70 && cap <= 75, "Expected ~72, got {}", cap);
}
