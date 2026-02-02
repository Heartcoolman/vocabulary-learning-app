# Design: AMAS Baseline Algorithm Cleanup

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AMASEngine                              │
│                                                              │
│  UserModels {                                                │
│    attention: AttentionMonitor,    ← BASELINE (to remove)   │
│    fatigue: FatigueEstimator,      ← BASELINE (to remove)   │
│    cognitive: CognitiveProfiler,   ← BASELINE (to remove)   │
│    motivation: MotivationTracker,  ← BASELINE (to remove)   │
│    trend: TrendAnalyzer,           ← BASELINE (to remove)   │
│    cold_start: ColdStartManager,   ← KEEP (uses AUC)        │
│    ige: IgeModel,                  ← KEEP                   │
│    swd: SwdModel,                  ← KEEP                   │
│  }                                                           │
│                                                              │
│  update_modeling() {                                         │
│    attention = baseline.update()                             │
│    if use_adf { attention = adf.update() }  ← DELEGATION    │
│    ...                                                       │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AMASEngine                              │
│                                                              │
│  UserModels {                                                │
│    cold_start: ColdStartManager,                            │
│    ige: IgeModel,                                           │
│    swd: SwdModel,                                           │
│  }                                                           │
│                                                              │
│  update_modeling() {                                         │
│    attention = adf.update()         ← DIRECT CALL           │
│    fatigue = tfm.update()           ← DIRECT CALL           │
│    cognitive = bcp.update()         ← DIRECT CALL           │
│    motivation = mds.update()        ← DIRECT CALL           │
│    trend = mtd.update()             ← DIRECT CALL           │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

## Key Changes

### 1. UserModels Simplification

Before:

```rust
struct UserModels {
    attention: AttentionMonitor,
    fatigue: FatigueEstimator,
    cognitive: CognitiveProfiler,
    motivation: MotivationTracker,
    trend: TrendAnalyzer,
    cold_start: Option<ColdStartManager>,
    ige: IgeModel,
    swd: SwdModel,
}
```

After:

```rust
struct UserModels {
    cold_start: Option<ColdStartManager>,
    ige: IgeModel,
    swd: SwdModel,
}
```

### 2. Engine Logic Simplification

Before (delegation pattern):

```rust
let attention = track_algorithm!(
    AlgorithmId::AttentionMonitor,
    models.attention.update(...)
);

let attention = if config.feature_flags.use_adf {
    let adf = AttentionDynamicsFilter::default();
    let mut adf_state = restore_algorithm_state(...);
    let adf_output = track_algorithm!(AlgorithmId::Adf, adf.update(...));
    adf_output
} else {
    attention
};
```

After (direct call):

```rust
let adf = AttentionDynamicsFilter::default();
let mut adf_state = restore_algorithm_state(...);
let attention = track_algorithm!(AlgorithmId::Adf, adf.update(...));
```

### 3. Feature Flags Cleanup

Remove from `FeatureFlags`:

- `use_adf: bool`
- `use_tfm: bool`
- `use_bcp: bool`
- `use_mds: bool`
- `use_mtd: bool`
- `use_auc: bool`
- `use_plf: bool`
- `use_air: bool`

Keep:

- `ensemble_enabled: bool`
- `heuristic_enabled: bool`
- `umm_*` flags (for UMM algorithms)

## State Persistence

Algorithm states continue to be stored in `algorithm_internal_states` JSON column:

- `adf` → AdfState
- `tfm` → TriPoolFatigueState
- `bcp` → BcpState
- `mds` → (motivation value in UserState)
- `mtd` → MtdState
- `auc` → AucState

No database schema changes required.

## Backward Compatibility

- Existing user states remain compatible
- Algorithm state JSON keys unchanged
- Only internal implementation simplified

**Breaking Changes (Accepted)**:

- `FeatureFlags` struct loses 8 fields (`use_adf/tfm/bcp/mds/mtd/auc/plf/air`)
- `AlgorithmId` enum loses 5 variants (AttentionMonitor, FatigueEstimator, CognitiveProfiler, MotivationTracker, TrendAnalyzer)
- `set_feature_flags()` API simplified (only accepts remaining flags)

## Explicit Constraints (Zero-Decision)

### C1: Feature Flags Strategy

- **Decision**: Delete all `use_*` algorithm flags
- **Behavior**: All new algorithms (ADF, TFM, BCP, MDS, MTD, AUC, PLF, AIR) unconditionally enabled
- **No runtime toggle**: Algorithms cannot be disabled at runtime

### C2: set_feature_flags() API

- **Decision**: Keep method but simplify
- **Accepted fields**: `ensemble_enabled`, `heuristic_enabled`, `umm_*` flags only
- **Rejected fields**: Any `use_*` algorithm flags silently ignored or cause compile error

### C3: AlgorithmId Cleanup

- **Decision**: Complete removal of baseline variants
- **Removed**: `AttentionMonitor`, `FatigueEstimator`, `CognitiveProfiler`, `MotivationTracker`, `TrendAnalyzer`
- **No aliases**: Legacy IDs not preserved for backward compatibility
- **Impact**: Dashboard/UI must update to use new algorithm names

### C4: Layer Classification

- **Decision**: Keep `amas_original` layer for all new algorithms
- **Rationale**: Maintains consistency with existing monitoring/observability

### C5: State Persistence

- **Decision**: Always persist all algorithm states after every event
- **States**: AdfState, TriPoolFatigueState, BcpState, MdsState, MtdState, AucState, PlfState, AirState
- **Trigger**: Every `update_modeling()` call persists all states unconditionally

### C6: Streak Signal Handling

- **Decision**: MDS computes streak internally
- **No dependency**: MDS does not rely on baseline MotivationTracker.streak()
- **Source**: MDS derives streak from UserState.consecutive_days or internal tracking

### C7: AIR/PLF/AUC Status

- **Decision**: Unconditionally enabled (same as other new algorithms)
- **PLF role**: Formally integrated into decision flow (no longer shadow predictor)
- **Output guarantee**: All three algorithms produce outputs on every event
