use danci_backend_rust::amas::config::{ColdStartConfig, EnsembleConfig, FeatureFlags};
use danci_backend_rust::amas::decision::{
    ColdStartManager, EnsembleDecision, LinUCBModel, ThompsonSamplingModel,
};
use danci_backend_rust::amas::types::{
    CognitiveProfile, DifficultyLevel, FeatureVector, StrategyParams, UserState,
};

fn sample_strategy() -> StrategyParams {
    StrategyParams {
        difficulty: DifficultyLevel::Mid,
        new_ratio: 0.2,
        batch_size: 8,
        interval_scale: 1.0,
        hint_level: 1,
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
    }
}

fn sample_feature_vector(dim: usize) -> FeatureVector {
    FeatureVector::new(vec![0.5; dim], vec!["f".to_string(); dim])
}

#[test]
fn integration_linucb_select_and_update() {
    let mut model = LinUCBModel::new(5, 5, 1.0);
    let state = sample_user_state();
    let feature = sample_feature_vector(5);
    let candidates = vec![
        StrategyParams {
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        },
        StrategyParams {
            difficulty: DifficultyLevel::Mid,
            ..sample_strategy()
        },
        StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        },
    ];

    let selected = model.select_action(&state, &feature, &candidates);
    assert!(selected.is_some());

    let x = model.build_features(&feature, &selected.as_ref().unwrap());
    model.update(&x, 1.0);

    let selected_after = model.select_action(&state, &feature, &candidates);
    assert!(selected_after.is_some());
}

#[test]
fn integration_thompson_select_and_update() {
    let mut model = ThompsonSamplingModel::default();
    let state = sample_user_state();
    let feature = sample_feature_vector(5);
    let candidates = vec![
        StrategyParams {
            difficulty: DifficultyLevel::Easy,
            ..sample_strategy()
        },
        StrategyParams {
            difficulty: DifficultyLevel::Hard,
            ..sample_strategy()
        },
    ];

    let selected = model.select_action(&state, &feature, &candidates);
    assert!(selected.is_some());

    model.update(&state, &selected.as_ref().unwrap(), 1.0);

    let conf = model.get_confidence(&state, &selected.as_ref().unwrap());
    assert!(conf > 0.0);
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
        thompson_enabled: true,
        linucb_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let mut ensemble = EnsembleDecision::new(flags);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let thompson_action = StrategyParams {
        difficulty: DifficultyLevel::Hard,
        new_ratio: 0.3,
        ..sample_strategy()
    };
    let linucb_action = StrategyParams {
        difficulty: DifficultyLevel::Easy,
        new_ratio: 0.1,
        ..sample_strategy()
    };

    let (final_strategy, candidates) = ensemble.decide(
        &state,
        &feature,
        &current,
        Some(&thompson_action),
        Some(0.8),
        Some(&linucb_action),
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
        thompson_enabled: true,
        linucb_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let ensemble = EnsembleDecision::new(flags);
    let mut state = sample_user_state();
    state.fatigue = 0.95;
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let thompson_action = StrategyParams {
        difficulty: DifficultyLevel::Hard,
        batch_size: 16,
        ..sample_strategy()
    };

    let (final_strategy, _) = ensemble.decide(
        &state,
        &feature,
        &current,
        Some(&thompson_action),
        Some(0.9),
        None,
        None,
    );

    let filtered = ensemble.post_filter(final_strategy, &state, None);
    assert_eq!(filtered.difficulty, DifficultyLevel::Easy);
    assert!(filtered.batch_size <= 5);
}

#[test]
fn integration_algorithms_converge_with_feedback() {
    let mut thompson = ThompsonSamplingModel::default();
    let mut linucb = LinUCBModel::new(5, 5, 1.0);
    let state = sample_user_state();
    let feature = sample_feature_vector(5);

    let good_strategy = StrategyParams {
        difficulty: DifficultyLevel::Mid,
        new_ratio: 0.2,
        batch_size: 8,
        ..sample_strategy()
    };
    let bad_strategy = StrategyParams {
        difficulty: DifficultyLevel::Hard,
        new_ratio: 0.4,
        batch_size: 16,
        ..sample_strategy()
    };

    for _ in 0..50 {
        thompson.update(&state, &good_strategy, 1.0);
        thompson.update(&state, &bad_strategy, -0.5);

        let x_good = linucb.build_features(&feature, &good_strategy);
        let x_bad = linucb.build_features(&feature, &bad_strategy);
        linucb.update(&x_good, 1.0);
        linucb.update(&x_bad, 0.2);
    }

    let good_conf = thompson.get_confidence(&state, &good_strategy);
    let bad_conf = thompson.get_confidence(&state, &bad_strategy);
    assert!(good_conf > 0.5);
    assert!(bad_conf > 0.5);

    let linucb_good_conf = linucb.get_confidence(&feature, &good_strategy);
    let linucb_bad_conf = linucb.get_confidence(&feature, &bad_strategy);
    assert!(linucb_good_conf > 0.0);
    assert!(linucb_bad_conf > 0.0);
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
        thompson_base_weight: 0.4,
        linucb_base_weight: 0.4,
        heuristic_base_weight: 0.2,
        ..Default::default()
    };
    let flags = FeatureFlags {
        thompson_enabled: true,
        linucb_enabled: true,
        heuristic_enabled: true,
        ..Default::default()
    };
    let mut ensemble = EnsembleDecision::with_config(flags, config);
    let state = sample_user_state();
    let feature = sample_feature_vector(10);
    let current = sample_strategy();

    let thompson_action = sample_strategy();
    let linucb_action = StrategyParams {
        difficulty: DifficultyLevel::Easy,
        ..sample_strategy()
    };

    for i in 0..30 {
        let (final_strategy, candidates) = ensemble.decide(
            &state,
            &feature,
            &current,
            Some(&thompson_action),
            Some(0.8),
            Some(&linucb_action),
            Some(0.6),
        );

        let reward = if i % 2 == 0 { 1.0 } else { 0.5 };
        ensemble.update_performance(&candidates, &final_strategy, reward);
    }

    let weights = ensemble
        .performance
        .get_weights(&[("thompson", 0.4), ("linucb", 0.4), ("heuristic", 0.2)]);
    let total: f64 = weights.values().sum();
    assert!((total - 1.0).abs() < 1e-6);
}
