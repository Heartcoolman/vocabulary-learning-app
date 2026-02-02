## Context

This change implements 8 original algorithms proposed in `docs/AMAS-Original-Algorithms.md` to replace baseline implementations in the AMAS (Adaptive Multi-dimensional Assessment System). The current baseline uses simple linear models that cannot capture complex learning dynamics.

### Current State Analysis (from codebase exploration)

| Module            | Current Baseline                                         | Proposed Algorithm                    | Key Gap                                     |
| ----------------- | -------------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| AttentionMonitor  | 18-feature weighted sum + adaptive EMA (α ∈ [0.15, 0.7]) | ADF (state-space + tanh nonlinearity) | No process noise, no saturation             |
| FatigueEstimator  | Single exponential decay + 3-way fusion                  | TFM (3D × 2-layer pools)              | No dimension separation, visual data broken |
| CognitiveProfiler | EMA scalar + variance                                    | BCP (Kalman filter + 3×3 Σ)           | No confidence, no drift                     |
| MotivationTracker | Linear recursion (ρ=0.9)                                 | MDS (bistable potential)              | is_quit never triggered                     |
| TrendAnalyzer     | Single-window slope + variance                           | MTD (multi-scale + CUSUM)             | No change-point detection                   |
| ColdStartManager  | Rule-based scoring + probe sequence                      | AUC (information gain selection)      | No probabilistic model                      |
| Forgetting        | FSRS/UMM (exponential)                                   | PLF (power-law)                       | Theory mismatch                             |
| Ability Rating    | Elo                                                      | AIR (IRT)                             | No confidence, no discrimination            |

### Data Pipeline Issues (Must Fix First)

1. **Visual Fatigue sessionId Missing**: Frontend `useVisualFatigue` doesn't send `sessionId`. Backend queries 30-sec window which often fails.
2. **Extended Visual Fields Not Sent**: Backend can receive `eyeAspectRatio`, `squintIntensity`, etc. but frontend doesn't send them.
3. **is_quit Event Hardcoded**: `engine.rs` always passes `is_quit=false` to MotivationTracker.
4. **Matrix Persistence Not Supported**: `PersistedAMASState` stores only scalars; BCP needs 3×3 covariance matrix.

## Goals / Non-Goals

### Goals

1. Fix data pipeline blockers (visual fatigue, is_quit signal)
2. Implement all 8 algorithms with configurable parameters
3. Maintain backward compatibility via feature flags
4. Provide shadow/A-B testing capability for PLF vs FSRS
5. Support gradual rollout (algorithm-by-algorithm)

### Non-Goals

1. Optimize for performance (correctness first)
2. Replace existing algorithms in production immediately
3. Implement UI for algorithm visualization
4. Build separate analytics dashboard

## Decisions

### D1: Algorithm Implementation Order

**Decision**: P0 → P1 → P2 → P3 based on dependency graph and impact.

**Rationale**:

- P0 (Data Alignment + PLF + AIR): Foundation; other algorithms degrade without proper data
- P1 (TFM + MDS): High impact on fatigue/motivation modeling; depends on P0
- P2 (ADF + BCP + MTD): Refinement algorithms; lower ROI
- P3 (AUC): Cold start optimization; affects only new users

### D2: Persistence Strategy for Matrix Storage

**Decision**: Store covariance matrix as JSON blob in existing `amas_user_states.user_state` column.

**Alternatives Considered**:

1. Separate table for matrix data → More complex queries, migration overhead
2. Flatten to 9 scalar columns → Schema bloat, rigid structure
3. **JSON blob (chosen)** → Flexible, backward compatible, minor size increase

**Trade-offs**: JSON parsing overhead (~10μs) acceptable for correctness.

### D3: Feature Flag Approach

**Decision**: Use `AMASConfig.feature_flags` with per-algorithm toggles.

```rust
pub struct AlgorithmFeatureFlags {
    pub use_adf: bool,      // AttentionMonitor
    pub use_tfm: bool,      // FatigueEstimator
    pub use_bcp: bool,      // CognitiveProfiler
    pub use_mds: bool,      // MotivationTracker
    pub use_mtd: bool,      // TrendAnalyzer
    pub use_auc: bool,      // ColdStartManager
    pub use_plf: bool,      // Forgetting curve
    pub use_air: bool,      // Ability rating
}
```

**Rationale**: Allows gradual rollout, A/B testing, and quick rollback.

### D4: PLF Integration Strategy

**Decision**: Shadow predictor mode parallel to FSRS/UMM, not replacement.

**Rationale**:

- Current FSRS/UMM already integrated with MDM
- PLF predictions logged for comparison
- After validation period, can switch via feature flag

### D5: is_quit Signal Detection

**Decision**: Detect quit via session timeout (>30 min idle) or explicit frontend event.

**Detection Logic**:

```rust
fn detect_quit_signal(event: &RawEvent, session: &SessionInfo) -> bool {
    // Explicit quit event from frontend
    if event.is_quit_event { return true; }

    // Session timeout detection
    if let Some(last_event_ts) = session.last_event_ts {
        let idle_minutes = (event.ts - last_event_ts) / 60000;
        if idle_minutes > 30 { return true; }
    }

    // High frustration signal (consecutive failures + low motivation)
    if session.consecutive_failures >= 5 && event.motivation < -0.5 {
        return true;
    }

    false
}
```

### D6: Visual Fatigue Extended Fields

**Decision**: Add optional fields to frontend, graceful degradation if missing.

**Schema Update**:

```sql
ALTER TABLE visual_fatigue_records ADD COLUMN eye_aspect_ratio REAL;
ALTER TABLE visual_fatigue_records ADD COLUMN avg_blink_duration REAL;
ALTER TABLE visual_fatigue_records ADD COLUMN head_stability REAL;
ALTER TABLE visual_fatigue_records ADD COLUMN squint_intensity REAL;
ALTER TABLE visual_fatigue_records ADD COLUMN gaze_off_screen_ratio REAL;
```

**Frontend Changes**: `useVisualFatigue.ts` must:

1. Include `sessionId` from context
2. Extract extended metrics from face detection API (if available)

## Risks / Trade-offs

| Risk                                                        | Severity | Mitigation                                       |
| ----------------------------------------------------------- | -------- | ------------------------------------------------ |
| BCP matrix storage increases JSON size                      | Low      | Compress with msgpack if >1KB                    |
| MDS bistability may cause stuck states                      | Medium   | Add momentum decay and bounds checking           |
| PLF power-law may diverge from FSRS predictions             | High     | Shadow mode first; validate with user study      |
| is_quit detection false positives                           | Medium   | Tune timeout threshold; add confidence score     |
| Frontend visual fatigue API may not support extended fields | Medium   | Feature detection; graceful degradation          |
| Algorithm parameter tuning requires real data               | High     | Use conservative defaults; A/B testing framework |

## Migration Plan

### Phase 1: Data Pipeline Fix (Week 1)

1. Deploy frontend with sessionId + extended visual fields
2. Apply database migration for extended columns
3. Verify visual fatigue correlation in AMAS

### Phase 2: P0 Algorithms (Week 2)

1. Deploy PLF shadow predictor
2. Deploy AIR with existing Elo fallback
3. Monitor prediction accuracy metrics

### Phase 3: P1 Algorithms (Week 3)

1. Deploy is_quit signal detection
2. Deploy TFM (behind feature flag)
3. Deploy MDS (behind feature flag)

### Phase 4: P2 Algorithms (Week 4)

1. Deploy BCP with matrix persistence
2. Deploy ADF
3. Deploy MTD

### Phase 5: P3 Algorithms (Week 5)

1. Deploy AUC

### Rollback Strategy

- Each algorithm has independent feature flag
- Rollback = disable flag + deploy
- State persistence backward compatible (old code ignores new fields)

## Open Questions

All open questions have been resolved:

1. **Q: Should PLF replace MDM or run parallel?**
   - **RESOLVED**: Parallel (shadow mode) until validation complete. PLF uses FSRS stability as S source.

2. **Q: What face detection API does frontend use for extended visual fields?**
   - **RESOLVED**: Frontend extracts available fields; backend degrades gracefully. Extended fields transported via ProcessOptions.visual_fatigue_raw.

3. **Q: How to calibrate algorithm parameters?**
   - **RESOLVED**: Use defaults from literature (specified in amas-algorithms spec), A/B test via feature flags.

4. **Q: Should AUC replace current cold start or augment it?**
   - **RESOLVED**: Augment (provide IG-based probe suggestions via AUC state in ColdStartState).

5. **Q: Matrix precision for BCP - f32 or f64?**
   - **RESOLVED**: f64 for numerical stability. Stored as nested JSON arrays in cognitive_profile.covariance.

## Additional Resolved Decisions (from Planning Phase)

| Decision                | Choice                       | Rationale                                         |
| ----------------------- | ---------------------------- | ------------------------------------------------- |
| PLF S source            | FSRS stability (converted)   | Leverage existing scheduling data                 |
| PLF n definition        | FSRS reps                    | Consistent with existing review tracking          |
| AIR item params mode    | Online update                | User chose dynamic calibration                    |
| Visual data path        | ProcessOptions extension     | Clean API boundary, route layer responsibility    |
| BCP Σ storage           | cognitive_profile JSON       | Minimal schema change, backward compatible        |
| BCP Σ_initial           | diag(0.25, 0.25, 0.25)       | Medium uncertainty for new users                  |
| is_quit API             | Extend ProcessEventRequest   | Single endpoint, timeout inference in route layer |
| is_quit timeout         | 30 minutes                   | Balance between session gaps and true abandonment |
| Feature flags structure | Extend existing FeatureFlags | Avoid parallel config plumbing                    |
| Numeric error handling  | Clamp + Fallback             | Graceful degradation, continue processing         |
| Concurrency model       | Single-writer per user       | Simple, no merge logic needed                     |
| TFM sleep reset         | Fast=0, Slow decay 6h        | Natural fatigue reset after sleep                 |
