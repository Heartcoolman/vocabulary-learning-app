## 1. Data Pipeline Prerequisites (P0-Blocker)

- [x] 1.1 Add `sessionId` parameter to frontend `useVisualFatigue.ts` hook (frontend task)
- [x] 1.2 Add extended visual fields extraction in frontend (frontend task)
- [x] 1.3 Create database migration for `visual_fatigue_records` extended columns
- [x] 1.4 Update backend `VisualFatigueMetricsBody` to persist extended fields
- [x] 1.5 Implement `is_quit` signal detection in AMAS engine
- [x] 1.6 Add frontend quit event emission on session abort (frontend task)
- [x] 1.7 Write integration test: visual fatigue sessionId correlation ✓ (`amas_engine_tests.rs`)

## 2. Persistence Layer Upgrade (P0-Blocker)

- [x] 2.1 Add types support for algorithm internal states (`algorithm_states` JSONB)
- [x] 2.2 Update `PersistedAMASState` to include `algorithm_states` field
- [x] 2.3 Update persistence serialization to handle algorithm states
- [x] 2.4 Add database migration `044_add_algorithm_states.sql`
- [x] 2.5 Update all test fixtures for new `algorithm_states` field

## 3. PLF (Power-Law Forgetting) Implementation (P0)

- [x] 3.1 Create `packages/backend-rust/src/amas/modeling/plf.rs` module
- [x] 3.2 Implement `PlForgettingCurve` struct with `R(t,n,S,D)` formula
- [x] 3.3 Add `PlForgettingConfig` (α, S_base, D_base parameters)
- [x] 3.4 Create shadow predictor integration in AMAS engine
- [x] 3.5 Add logging for PLF vs MDM prediction comparison
- [x] 3.6 Write unit tests for PLF retrievability calculation (8 tests)
- [x] 3.7 Write property-based tests for PLF bounds (R ∈ [0, 1])

## 4. AIR (Adaptive Item Response) Implementation (P0)

- [x] 4.1 Create `packages/backend-rust/src/amas/modeling/air.rs` module
- [x] 4.2 Implement `AdaptiveItemResponse` with IRT probability calculation
- [x] 4.3 Implement ability update with online learning
- [x] 4.4 Implement Fisher information confidence calculation
- [x] 4.5 Add `AirConfig` (η*base, α_default, α*η, β_η)
- [x] 4.6 Implement `AirItemParams::from_elo` for Elo conversion
- [x] 4.7 Write unit tests for AIR ability updates (10 tests)
- [x] 4.8 Write tests for AIR confidence calculation

## 5. TFM (Tri-pool Fatigue Model) Implementation (P1)

- [x] 5.1 Create `packages/backend-rust/src/amas/modeling/tfm.rs` module
- [x] 5.2 Implement `FatiguePool` struct with fast/slow recovery
- [x] 5.3 Implement `TriPoolFatigue` with cognitive/visual/mental dimensions
- [x] 5.4 Add spill mechanism between pools
- [x] 5.5 Implement visual load calculation using `VisualFatigueRawMetrics`
- [x] 5.6 Implement mental load calculation using is_quit signal
- [x] 5.7 Add `TfmConfig` (r_fast, r_slow, τ, weights per dimension)
- [x] 5.8 Update `FatigueEstimator` to delegate to TFM when enabled
- [x] 5.9 Write unit tests for TFM recovery dynamics (7 tests)
- [x] 5.10 Write tests for TFM visual load with low confidence (graceful degradation)

## 6. MDS (Motivation Dynamics System) Implementation (P1)

- [x] 6.1 Create `packages/backend-rust/src/amas/modeling/mds.rs` module
- [x] 6.2 Implement bistable potential function `V(M) = -a·M² + b·M⁴`
- [x] 6.3 Implement discrete update equation with stimulus
- [x] 6.4 Add `MdsConfig` (a, b, η, κ, λ, μ)
- [x] 6.5 Update `MotivationTracker` to delegate to MDS when enabled
- [x] 6.6 Wire is_quit signal to MDS stimulus
- [x] 6.7 Write unit tests for MDS bistability behavior (6 tests)
- [x] 6.8 Write tests verifying high/low motivation stability

## 7. ADF (Attention Dynamics Filter) Implementation (P2)

- [x] 7.1 Create `packages/backend-rust/src/amas/modeling/adf.rs` module
- [x] 7.2 Implement adaptive inertia calculation `α(t) = α_base·(1-|ΔO|)`
- [x] 7.3 Implement nonlinear observation model with tanh saturation
- [x] 7.4 Add process noise parameter
- [x] 7.5 Add `AdfConfig` (α_base, process_noise)
- [x] 7.6 Update `AttentionMonitor` to delegate to ADF when enabled
- [x] 7.7 Write unit tests for ADF sudden attention shift detection (4 tests)
- [x] 7.8 Write tests for ADF stability under noise

## 8. BCP (Bayesian Cognitive Profiling) Implementation (P2)

- [x] 8.1 Create `packages/backend-rust/src/amas/modeling/bcp.rs` module
- [x] 8.2 Implement 3×3 covariance matrix operations
- [x] 8.3 Implement Kalman gain calculation
- [x] 8.4 Implement Bayesian update for μ and Σ
- [x] 8.5 Implement drift modeling for ability growth
- [x] 8.6 Add `BcpConfig` (drift_rate, process_noise_diag, observation_noise_diag)
- [x] 8.7 Update `CognitiveProfiler` to delegate to BCP when enabled
- [x] 8.8 Write unit tests for BCP covariance convergence (7 tests)
- [x] 8.9 Write tests for confidence calculation

## 9. MTD (Multi-scale Trend Detector) Implementation (P2)

- [x] 9.1 Create `packages/backend-rust/src/amas/modeling/mtd.rs` module
- [x] 9.2 Implement multi-scale slope calculation (window=5,15,30)
- [x] 9.3 Implement CUSUM change-point detection
- [x] 9.4 Implement trend consistency check across scales
- [x] 9.5 Add `MtdTrendState::ChangePoint` variant
- [x] 9.6 Add `MtdConfig` (cusum_k, cusum_h, windows, thresholds)
- [x] 9.7 Update `TrendAnalyzer` to delegate to MTD when enabled
- [x] 9.8 Write unit tests for MTD change-point detection (5 tests)
- [x] 9.9 Write tests for MTD multi-scale consistency

## 10. AUC (Active User Classification) Implementation (P3)

- [x] 10.1 Create `packages/backend-rust/src/amas/modeling/auc.rs` module
- [x] 10.2 Implement probabilistic user type classification
- [x] 10.3 Implement information gain calculation for probe selection
- [x] 10.4 Implement entropy-based early stopping
- [x] 10.5 Add `AucConfig` (theta_confident, theta_entropy, max_samples)
- [x] 10.6 Update `ColdStartManager` to use AUC classification when enabled
- [x] 10.7 Write unit tests for AUC information gain calculation (7 tests)
- [x] 10.8 Write tests for AUC early stopping conditions

## 11. Feature Flags & Integration

- [x] 11.1 Add feature flags to `FeatureFlags` struct (use_plf, use_air, use_tfm, use_mds, use_adf, use_bcp, use_mtd, use_auc)
- [x] 11.2 Add `AlgorithmId` variants for all 8 algorithms
- [x] 11.3 Add feature flag configuration to debug routes
- [x] 11.4 Integrate PLF shadow predictor with feature flag check
- [x] 11.5 Write integration tests with all flags enabled ✓ (`amas_engine_tests.rs`: 10 tests)

## 12. Documentation & Validation

- [x] 12.1 All 8 algorithm modules created with complete implementations
- [x] 12.2 Algorithm configs with default parameters
- [x] 12.3 Run `cargo test --lib` - 224 tests pass ✓
- [x] 12.4 Run property-based tests - 12 PBT tests pass ✓
- [x] 12.5 All tests pass: 259 total (224 lib + 6 decision + 10 engine + 12 PBT + 7 integration)

## Summary

**Completed:**

- 8 algorithm modules: PLF, AIR, TFM, MDS, ADF, BCP, MTD, AUC
- 66+ unit tests across all modules
- 13 engine integration tests covering all algorithm flags
- Feature flags infrastructure
- Database migration for algorithm states
- PLF shadow predictor integration
- Frontend visual fatigue sessionId + extended fields integration
- Frontend quit event emission for MDS motivation dynamics
- Backend VisualFatigueMetricsBody extended field persistence
- All 262 tests passing ✓

**Integration Status:**
| Algorithm | Flag | Engine Integration | Test Coverage |
|-----------|------|-------------------|---------------|
| PLF | use_plf | Shadow predictor ✓ | Shadow path validated |
| AIR | use_air | Full IRT integration ✓ | Theta update + DB persistence |
| TFM | use_tfm | Delegation ✓ | Visual + cognitive fatigue |
| MDS | use_mds | Delegation ✓ | Quit signal tested |
| ADF | use_adf | Delegation ✓ | Attention shift tested |
| BCP | use_bcp | Delegation ✓ | Convergence tested |
| MTD | use_mtd | Delegation ✓ | Trend detection tested |
| AUC | use_auc | Cold start augment ✓ | Phase tracking tested |

**AIR Integration Details:**

- Per-user ability estimation (θ) via IRT 2PL model
- Per-item parameter updates (α discrimination, β difficulty)
- Database migration 046 adds airAlpha/airBeta columns to word_learning_states
- Database migration 046 adds airTheta/airFisherInfoSum/airResponseCount columns to users
- Full persistence chain: Engine → WordMasteryDecision → WordStateUpdateData → SQL

## Dependency Graph

```
[1. Data Pipeline] ──────┬──────────────────────────────────────────┐
                         │                                          │
[2. Persistence]  ───────┤                                          │
                         │                                          │
                         ▼                                          ▼
              [3. PLF] ─────────────────┐              [4. AIR] ────┤
                                        │                           │
                                        ▼                           │
                              [5. TFM] ◄────────── [6. MDS] ◄───────┘
                                   │         │
                                   │         └──────────────────────┐
                                   ▼                                ▼
                              [7. ADF]                         [8. BCP]
                                   │                                │
                                   ▼                                ▼
                              [9. MTD]                         [10. AUC]
                                   │                                │
                                   └────────────┬───────────────────┘
                                                ▼
                                   [11. Feature Flags & Integration]
                                                │
                                                ▼
                                   [12. Documentation & Validation]
```
