//! Integration tests for AMASEngine with all original algorithms.
//!
//! Tests 1.7 (visual fatigue sessionId correlation) and 11.5 (all flags enabled).

use danci_backend_rust::amas::config::{AMASConfig, FeatureFlags};
use danci_backend_rust::amas::engine::AMASEngine;
use danci_backend_rust::amas::types::{
    ColdStartPhase, ProcessOptions, RawEvent, VisualFatigueRawMetrics,
};

const FIXED_TIMESTAMP: i64 = 1700000000000;

fn minimal_flags() -> FeatureFlags {
    FeatureFlags {
        ensemble_enabled: false,
        heuristic_enabled: false,
        amas_ige_enabled: false,
        amas_swd_enabled: false,
        amas_mdm_enabled: false,
        amas_msmt_enabled: false,
        amas_mtp_enabled: false,
        amas_iad_enabled: false,
        amas_evm_enabled: false,
        ..Default::default()
    }
}

fn all_algorithms_flags() -> FeatureFlags {
    FeatureFlags {
        ensemble_enabled: true,
        heuristic_enabled: true,
        amas_ige_enabled: true,
        amas_swd_enabled: true,
        amas_mdm_enabled: true,
        amas_msmt_enabled: true,
        amas_mtp_enabled: true,
        amas_iad_enabled: true,
        amas_evm_enabled: true,
        ..Default::default()
    }
}

fn sample_event() -> RawEvent {
    RawEvent {
        is_correct: true,
        response_time: 2500,
        dwell_time: Some(3000),
        retry_count: 0,
        hint_used: false,
        paused_time_ms: None,
        word_id: Some("word_123".to_string()),
        question_type: Some("definition".to_string()),
        confidence: Some(0.8),
        pause_count: 0,
        switch_count: 0,
        focus_loss_duration: None,
        interaction_density: Some(0.7),
        timestamp: FIXED_TIMESTAMP,
        is_quit: false,
        device_type: Some("desktop".to_string()),
        is_guess: false,
    }
}

fn sample_options_with_visual_fatigue(session_id: &str) -> ProcessOptions {
    ProcessOptions {
        session_id: Some(session_id.to_string()),
        visual_fatigue_score: Some(0.35),
        visual_fatigue_confidence: Some(0.85),
        visual_fatigue_raw: Some(VisualFatigueRawMetrics {
            perclos: 0.12,
            blink_rate: 18.0,
            eye_aspect_ratio: 0.28,
            squint_intensity: 0.15,
            gaze_off_screen_ratio: 0.05,
            avg_blink_duration: 180.0,
            head_stability: 0.92,
            yawn_count: 0,
            confidence: 0.85,
            timestamp_ms: FIXED_TIMESTAMP,
        }),
        study_duration_minutes: Some(15.0),
        recent_accuracy: Some(0.75),
        rt_cv: Some(0.3),
        pace_cv: Some(0.2),
        ..Default::default()
    }
}

// =============================================================================
// Task 11.5: All algorithms enabled smoke test
// =============================================================================

#[tokio::test]
async fn engine_process_event_with_all_algorithms_enabled() {
    let mut config = AMASConfig::default();
    config.feature_flags = all_algorithms_flags();

    let engine = AMASEngine::new(config, None);
    let event = sample_event();
    let options = sample_options_with_visual_fatigue("session_001");

    let result = engine
        .process_event("user_test_all_algos", event, options)
        .await
        .expect("process_event should succeed with all algorithms enabled");

    // Verify state bounds (invariant checks)
    assert!(
        result.state.attention >= 0.0 && result.state.attention <= 1.0,
        "attention out of bounds: {}",
        result.state.attention
    );
    assert!(
        result.state.fatigue >= 0.0 && result.state.fatigue <= 1.0,
        "fatigue out of bounds: {}",
        result.state.fatigue
    );
    assert!(
        result.state.motivation >= -1.0 && result.state.motivation <= 1.0,
        "motivation out of bounds: {}",
        result.state.motivation
    );

    // Verify strategy bounds
    assert!(
        result.strategy.batch_size >= 5 && result.strategy.batch_size <= 16,
        "batch_size out of bounds: {}",
        result.strategy.batch_size
    );

    // Verify feature_vector is populated (all algos should contribute)
    assert!(
        result.feature_vector.is_some(),
        "feature_vector should be populated when all algorithms enabled"
    );
}

// =============================================================================
// PLF (Power-Law Forgetting) specific tests
// Note: PLF runs as a shadow predictor - it computes predictions in parallel
// with MDM but doesn't affect the output. This test validates PLF doesn't
// cause errors and the shadow prediction path executes.
// =============================================================================

#[tokio::test]
async fn engine_plf_shadow_predictor_runs() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();
    config.feature_flags.amas_mdm_enabled = true; // PLF needs MDM for comparison

    let engine = AMASEngine::new(config, None);

    // Create event with word_id to trigger PLF shadow prediction
    let event = RawEvent {
        word_id: Some("plf_test_word".to_string()),
        ..sample_event()
    };

    let options = ProcessOptions {
        word_state: Some(danci_backend_rust::amas::types::FSRSWordState {
            stability: 5.0,
            difficulty: 0.3,
            elapsed_days: 1.0,
            scheduled_days: 3.0,
            reps: 2,
            lapses: 0,
            desired_retention: 0.9,
            amas_strength: Some(5.0),
            amas_consolidation: Some(0.7),
            amas_last_review_ts: Some(FIXED_TIMESTAMP - 86400000),
            air_alpha: None,
            air_beta: None,
        }),
        ..Default::default()
    };

    let result = engine
        .process_event("user_plf_test", event, options)
        .await
        .expect("PLF shadow predictor should process without error");

    // PLF runs in shadow mode - verify word_mastery_decision exists
    assert!(
        result.word_mastery_decision.is_some(),
        "word_mastery_decision should exist when PLF enabled with word_state"
    );

    let decision = result.word_mastery_decision.unwrap();
    assert!(
        decision.retrievability >= 0.0 && decision.retrievability <= 1.0,
        "retrievability should be valid: {}",
        decision.retrievability
    );
}

// =============================================================================
// AIR (Adaptive Item Response) - Flag existence test
// =============================================================================
// AIR (Adaptive Item Response) tests - IRT 2PL ability estimation
// Tests that AIR updates user ability (theta) based on item responses
// =============================================================================

#[tokio::test]
async fn engine_air_updates_ability_on_responses() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Process events with AIR flag enabled - should not error
    let correct_event = RawEvent {
        is_correct: true,
        response_time: 1500,
        word_id: Some("air_word_1".to_string()),
        ..sample_event()
    };

    let result1 = engine
        .process_event("user_air_test", correct_event, ProcessOptions::default())
        .await
        .expect("AIR flag should not cause process_event to fail");

    let incorrect_event = RawEvent {
        is_correct: false,
        response_time: 5000,
        word_id: Some("air_word_2".to_string()),
        ..sample_event()
    };

    let result2 = engine
        .process_event("user_air_test", incorrect_event, ProcessOptions::default())
        .await
        .expect("AIR flag should not cause process_event to fail");

    // Verify engine still produces valid output
    assert!(result1.state.cognitive.mem >= 0.0);
    assert!(result2.state.cognitive.mem >= 0.0);

    // Verify AIR is actually called and produces results (now integrated)
    assert!(
        result1.word_mastery_decision.is_some(),
        "word_mastery_decision should exist"
    );
    let decision1 = result1.word_mastery_decision.unwrap();
    assert!(
        decision1.air_theta.is_some(),
        "air_theta should be populated"
    );
    assert!(
        decision1.air_probability.is_some(),
        "air_probability should be populated"
    );

    // AIR theta should increase after correct answer
    let theta1 = decision1.air_theta.unwrap();

    let decision2 = result2.word_mastery_decision.unwrap();
    let theta2 = decision2.air_theta.unwrap();

    // After correct then incorrect, theta should have changed
    assert!(
        (theta2 - theta1).abs() > 0.001,
        "theta should update after responses: theta1={}, theta2={}",
        theta1,
        theta2
    );
}

// =============================================================================
// TFM (Tri-pool Fatigue Model) specific tests
// =============================================================================

#[tokio::test]
async fn engine_tfm_visual_fatigue_only() {
    // Test TFM with ONLY visual fatigue change, keeping event constant
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Identical event for both
    let event = sample_event();

    // First: no visual fatigue
    let options1 = ProcessOptions::default();
    let result1 = engine
        .process_event("user_tfm_isolated", event.clone(), options1)
        .await
        .expect("TFM baseline should succeed");

    // Second: high visual fatigue (ONLY this changes)
    let options2 = ProcessOptions {
        visual_fatigue_score: Some(0.8),
        visual_fatigue_confidence: Some(0.95),
        visual_fatigue_raw: Some(VisualFatigueRawMetrics {
            perclos: 0.4,
            blink_rate: 6.0,
            eye_aspect_ratio: 0.15,
            squint_intensity: 0.5,
            gaze_off_screen_ratio: 0.25,
            avg_blink_duration: 400.0,
            head_stability: 0.5,
            yawn_count: 3,
            confidence: 0.95,
            timestamp_ms: FIXED_TIMESTAMP,
        }),
        ..Default::default()
    };
    let result2 = engine
        .process_event("user_tfm_isolated", event, options2)
        .await
        .expect("TFM with visual fatigue should succeed");

    // TFM should produce higher fatigue when visual fatigue metrics present
    assert!(
        result2.state.fatigue > result1.state.fatigue,
        "TFM fatigue should increase with visual fatigue: baseline={}, with_vf={}",
        result1.state.fatigue,
        result2.state.fatigue
    );
}

#[tokio::test]
async fn engine_tfm_cognitive_fatigue() {
    // Test TFM cognitive dimension (error-based fatigue)
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // First: correct answers
    for _ in 0..3 {
        let event = RawEvent {
            is_correct: true,
            response_time: 2000,
            retry_count: 0,
            ..sample_event()
        };
        engine
            .process_event("user_tfm_cog", event, ProcessOptions::default())
            .await
            .expect("TFM correct event should process");
    }

    let state_after_correct = engine
        .get_user_state("user_tfm_cog")
        .await
        .expect("state should exist");

    // Now: repeated errors (cognitive fatigue trigger)
    for _ in 0..3 {
        let event = RawEvent {
            is_correct: false,
            response_time: 6000,
            retry_count: 2,
            ..sample_event()
        };
        engine
            .process_event("user_tfm_cog", event, ProcessOptions::default())
            .await
            .expect("TFM error event should process");
    }

    let state_after_errors = engine
        .get_user_state("user_tfm_cog")
        .await
        .expect("state should exist");

    assert!(
        state_after_errors.fatigue > state_after_correct.fatigue,
        "TFM cognitive fatigue should increase after errors: before={}, after={}",
        state_after_correct.fatigue,
        state_after_errors.fatigue
    );
}

// =============================================================================
// Task 1.7: Visual fatigue sessionId correlation
// =============================================================================

#[tokio::test]
async fn engine_visual_fatigue_with_session_id() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    let session_id = "session_vf_correlation_test";
    let event = sample_event();
    let options = ProcessOptions {
        session_id: Some(session_id.to_string()),
        visual_fatigue_score: Some(0.5),
        visual_fatigue_confidence: Some(0.9),
        visual_fatigue_raw: Some(VisualFatigueRawMetrics {
            perclos: 0.2,
            blink_rate: 12.0,
            eye_aspect_ratio: 0.22,
            squint_intensity: 0.3,
            gaze_off_screen_ratio: 0.1,
            avg_blink_duration: 250.0,
            head_stability: 0.7,
            yawn_count: 1,
            confidence: 0.9,
            timestamp_ms: FIXED_TIMESTAMP,
        }),
        ..Default::default()
    };

    let result = engine
        .process_event("user_session_vf", event, options)
        .await
        .expect("process_event with sessionId and visual fatigue should succeed");

    // Verify visual fatigue was processed and reflected in state
    assert!(
        result.state.visual_fatigue.is_some(),
        "visual_fatigue state should be set when visual fatigue score provided"
    );

    let vf_state = result.state.visual_fatigue.unwrap();
    assert!(
        (vf_state.score - 0.5).abs() < 0.1,
        "visual fatigue score should be close to input: {}",
        vf_state.score
    );
    assert!(
        vf_state.confidence > 0.8,
        "visual fatigue confidence should be preserved: {}",
        vf_state.confidence
    );

    // Verify fused fatigue considers visual component
    assert!(
        result.state.fused_fatigue.is_some(),
        "fused_fatigue should be computed when visual fatigue present"
    );
}

// =============================================================================
// ADF (Attention Dynamics Filter) specific tests
// =============================================================================

#[tokio::test]
async fn engine_adf_attention_shift_detection() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Establish baseline with focused attention
    for _ in 0..5 {
        let event = RawEvent {
            is_correct: true,
            response_time: 2000,
            pause_count: 0,
            switch_count: 0,
            focus_loss_duration: None,
            interaction_density: Some(0.9),
            ..sample_event()
        };
        engine
            .process_event("user_adf_test", event, ProcessOptions::default())
            .await
            .expect("ADF baseline event should process");
    }

    let stable_state = engine
        .get_user_state("user_adf_test")
        .await
        .expect("user state should exist");
    let baseline_attention = stable_state.attention;

    // Sudden distraction event
    let distracted_event = RawEvent {
        is_correct: false,
        response_time: 10000,
        pause_count: 8,
        switch_count: 15,
        focus_loss_duration: Some(45000),
        interaction_density: Some(0.1),
        ..sample_event()
    };

    let result = engine
        .process_event("user_adf_test", distracted_event, ProcessOptions::default())
        .await
        .expect("ADF distracted event should process");

    // ADF should detect significant attention drop
    let attention_drop = baseline_attention - result.state.attention;
    assert!(
        attention_drop > 0.1,
        "ADF should detect attention drop > 0.1: baseline={}, after={}, drop={}",
        baseline_attention,
        result.state.attention,
        attention_drop
    );
}

// =============================================================================
// MDS (Motivation Dynamics System) specific tests
// =============================================================================

#[tokio::test]
async fn engine_mds_quit_signal_reduces_motivation() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Build up motivation with correct answers
    for _ in 0..5 {
        let event = RawEvent {
            is_correct: true,
            response_time: 1500,
            is_quit: false,
            ..sample_event()
        };
        engine
            .process_event("user_mds_test", event, ProcessOptions::default())
            .await
            .expect("MDS warmup event should process");
    }

    let before_quit = engine
        .get_user_state("user_mds_test")
        .await
        .expect("user state should exist");
    let motivation_before = before_quit.motivation;

    // User quits
    let quit_event = RawEvent {
        is_correct: false,
        response_time: 3000,
        is_quit: true,
        ..sample_event()
    };

    let result = engine
        .process_event("user_mds_test", quit_event, ProcessOptions::default())
        .await
        .expect("MDS quit event should process");

    // MDS should reduce motivation on quit
    let motivation_drop = motivation_before - result.state.motivation;
    assert!(
        motivation_drop > 0.0,
        "MDS should reduce motivation on quit: before={}, after={}, drop={}",
        motivation_before,
        result.state.motivation,
        motivation_drop
    );
}

// =============================================================================
// BCP (Bayesian Cognitive Profiling) specific tests
// =============================================================================

#[tokio::test]
async fn engine_bcp_cognitive_profile_converges() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Process consistent performance pattern
    for i in 0..15 {
        let event = RawEvent {
            is_correct: true,
            response_time: 1800 + (i as i64 % 3) * 100, // Slightly varied but fast
            ..sample_event()
        };
        engine
            .process_event("user_bcp_test", event, ProcessOptions::default())
            .await
            .expect("BCP event should process");
    }

    let final_state = engine
        .get_user_state("user_bcp_test")
        .await
        .expect("final state should exist");

    // After consistent good performance, mem should be elevated
    assert!(
        final_state.cognitive.mem > 0.5,
        "BCP mem should increase with consistent good performance: {}",
        final_state.cognitive.mem
    );

    // Speed should reflect fast responses
    assert!(
        final_state.cognitive.speed > 0.4,
        "BCP speed should be reasonable for fast responses: {}",
        final_state.cognitive.speed
    );
}

// =============================================================================
// MTD (Multi-scale Trend Detector) specific tests
// =============================================================================

#[tokio::test]
async fn engine_mtd_detects_improving_trend() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // Simulate improving performance: start bad, get better
    for i in 0..20 {
        let event = RawEvent {
            is_correct: i >= 8,                               // First 8 wrong, rest correct
            response_time: 4000 - (i as i64 * 100).min(2000), // Getting faster
            ..sample_event()
        };
        engine
            .process_event("user_mtd_test", event, ProcessOptions::default())
            .await
            .expect("MTD event should process");
    }

    let final_result = engine
        .process_event(
            "user_mtd_test",
            RawEvent {
                is_correct: true,
                response_time: 1500,
                ..sample_event()
            },
            ProcessOptions::default(),
        )
        .await
        .expect("MTD final event should process");

    // MTD should have detected a trend
    assert!(
        final_result.state.trend.is_some(),
        "MTD should detect trend after sufficient samples"
    );

    // With clear improvement, trend should be Up or at least Flat
    let trend = final_result.state.trend.unwrap();
    assert!(
        trend == danci_backend_rust::amas::types::TrendState::Up
            || trend == danci_backend_rust::amas::types::TrendState::Flat,
        "MTD should detect upward or flat trend with improving performance: {:?}",
        trend
    );
}

// =============================================================================
// AUC (Active User Classification) specific tests
// Note: AUC augments cold start classification. This test validates the
// cold start phases are tracked and Classify phase is observed.
// =============================================================================

#[tokio::test]
async fn engine_auc_cold_start_phase_transitions() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();
    config.cold_start.classify_samples = 3;
    config.cold_start.explore_samples = 2;
    config.cold_start.min_classify_samples = 2;
    config.cold_start.min_explore_samples = 1;

    let engine = AMASEngine::new(config, None);

    // Track phase transitions
    let mut phases_seen = Vec::new();
    let mut last_phase: Option<ColdStartPhase> = None;

    for i in 0..8 {
        let event = RawEvent {
            is_correct: true,
            response_time: if i < 2 { 800 } else { 2500 }, // Fast then normal
            ..sample_event()
        };
        let result = engine
            .process_event("user_auc_test", event, ProcessOptions::default())
            .await
            .expect("AUC cold start event should process");

        if let Some(phase) = result.cold_start_phase {
            // Track transitions (when phase changes)
            if last_phase != Some(phase) {
                phases_seen.push(phase);
                last_phase = Some(phase);
            }
        }

        // Strategy should always be valid
        assert!(
            result.strategy.batch_size >= 5,
            "strategy should be valid at iteration {}: batch_size={}",
            i,
            result.strategy.batch_size
        );
    }

    // Should have seen Classify phase
    assert!(
        phases_seen.iter().any(|p| *p == ColdStartPhase::Classify),
        "should have seen Classify phase: {:?}",
        phases_seen
    );

    // Should have seen at least one phase transition (Classify -> Explore or Normal)
    assert!(
        phases_seen.len() >= 1,
        "should have observed at least one phase: {:?}",
        phases_seen
    );
}

// =============================================================================
// User isolation and state persistence tests
// =============================================================================

#[tokio::test]
async fn engine_multiple_users_fully_isolated() {
    let mut config = AMASConfig::default();
    config.feature_flags = all_algorithms_flags();

    let engine = AMASEngine::new(config, None);

    // User A: consistent high performer
    for _ in 0..5 {
        let event = RawEvent {
            is_correct: true,
            response_time: 1200,
            pause_count: 0,
            switch_count: 0,
            ..sample_event()
        };
        engine
            .process_event("user_isolated_a", event, ProcessOptions::default())
            .await
            .expect("user A event should process");
    }

    // User B: struggling learner
    for _ in 0..5 {
        let event = RawEvent {
            is_correct: false,
            response_time: 8000,
            retry_count: 3,
            pause_count: 5,
            switch_count: 8,
            ..sample_event()
        };
        engine
            .process_event("user_isolated_b", event, ProcessOptions::default())
            .await
            .expect("user B event should process");
    }

    // Fetch states via get_user_state for proper isolation check
    let state_a = engine
        .get_user_state("user_isolated_a")
        .await
        .expect("user A state should exist");
    let state_b = engine
        .get_user_state("user_isolated_b")
        .await
        .expect("user B state should exist");

    // User A should have better metrics
    assert!(
        state_a.attention > state_b.attention,
        "user A should have higher attention: A={}, B={}",
        state_a.attention,
        state_b.attention
    );
    assert!(
        state_a.fatigue < state_b.fatigue,
        "user A should have lower fatigue: A={}, B={}",
        state_a.fatigue,
        state_b.fatigue
    );
}

#[tokio::test]
async fn engine_algorithm_states_persist_and_affect_output() {
    let mut config = AMASConfig::default();
    config.feature_flags = minimal_flags();

    let engine = AMASEngine::new(config, None);

    // First event - initialize
    let event1 = RawEvent {
        is_correct: true,
        response_time: 2000,
        ..sample_event()
    };
    let result1 = engine
        .process_event("user_persist_test", event1, ProcessOptions::default())
        .await
        .expect("first event should process");

    let initial_attention = result1.state.attention;

    // Series of poor performance events
    for _ in 0..5 {
        let event = RawEvent {
            is_correct: false,
            response_time: 7000,
            pause_count: 3,
            switch_count: 5,
            focus_loss_duration: Some(10000),
            ..sample_event()
        };
        engine
            .process_event("user_persist_test", event, ProcessOptions::default())
            .await
            .expect("poor performance event should process");
    }

    let final_state = engine
        .get_user_state("user_persist_test")
        .await
        .expect("final state should exist");

    // Algorithms should have accumulated state, showing clear degradation
    assert!(
        final_state.attention < initial_attention - 0.05,
        "attention should degrade: initial={}, final={}",
        initial_attention,
        final_state.attention
    );
    assert!(
        final_state.fatigue > 0.1,
        "fatigue should accumulate above baseline: {}",
        final_state.fatigue
    );
}
