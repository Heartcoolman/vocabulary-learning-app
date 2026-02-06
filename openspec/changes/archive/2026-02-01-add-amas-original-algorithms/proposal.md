# Change: Implement AMAS Original Algorithms

## Why

The current AMAS (Adaptive Multi-dimensional Assessment System) uses baseline implementations that have significant limitations: linear EMA smoothing for attention (cannot capture sudden attention shifts), single-pool exponential decay for fatigue (no dimension separation), point estimates without confidence for cognitive profiling, and linear recursion for motivation (no bistability dynamics). The document `docs/AMAS-Original-Algorithms.md` proposes 8 advanced algorithms with stronger theoretical foundations and better modeling capabilities. This change implements these algorithms to improve learning adaptation quality.

## What Changes

### P0 - Data Alignment & Foundation (Must complete first)

1. **Visual Fatigue Data Pipeline Fix**
   - Frontend must send `sessionId` with visual fatigue metrics (currently missing)
   - Frontend must send extended fields: `eyeAspectRatio`, `avgBlinkDuration`, `headStability`, `squintIntensity`, `gazeOffScreenRatio`
   - Database schema update for extended visual fatigue fields
   - AMAS engine must correctly correlate visual fatigue with learning events via `sessionId`

2. **PLF (Power-Law Forgetting)** - Replace exponential decay with power-law
   - Formula: `R(t,n,S,D) = (1 + t/(S·f(n)))^(-D)` where `f(n) = 1 + α·ln(1+n)`
   - Shadow predictor mode first, then optional replacement of FSRS/UMM core

3. **AIR (Adaptive Item Response)** - IRT-based ability rating
   - Formula: `P(correct|θ,β,α) = 1/(1 + exp(-α(θ-β)))`
   - Ability update: `θ' = θ + η·α·(y-P)` with confidence `SE(θ) = 1/sqrt(ΣI_i)`
   - Requires item parameters `β` (difficulty) and `α` (discrimination) persistence

### P1 - Core Modeling Upgrades

4. **TFM (Tri-pool Fatigue Model)** - Three-dimension dual-layer fatigue
   - Cognitive, Visual, Mental dimensions with fast/slow recovery pools
   - Spill mechanism: `spill_d(t) = max(0, F_d_fast(t-1) - θ_d_spill)`
   - Dimension-specific parameters: `r_fast`, `r_slow`, `τ_fast`, `τ_slow`
   - **BREAKING**: Requires `is_quit` signal detection for mental fatigue

5. **MDS (Motivation Dynamics System)** - Bistable motivation dynamics
   - Double-well potential: `V(M) = -a·M² + b·M⁴`
   - Update: `M(t) = M(t-1) + η·(2a·M - 4b·M³ + S(t))`
   - **BREAKING**: Requires `is_quit` event propagation from frontend

### P2 - Enhancement Algorithms

6. **ADF (Attention Dynamics Filter)** - State-space attention model
   - Adaptive inertia: `α(t) = α_base·(1 - |ΔO(t)|)`
   - Nonlinear observation: `O(t) = σ(w·tanh(Φ(features)))`

7. **BCP (Bayesian Cognitive Profiling)** - Kalman filter cognitive estimation
   - State: `C ~ N(μ, Σ)` with 3×3 covariance matrix
   - Kalman update: `μ' = μ + K·(z - H·μ)`, `Σ' = (I - K·H)·Σ`
   - **BREAKING**: Persistence schema must support matrix storage

8. **MTD (Multi-scale Trend Detector)** - CUSUM change-point detection
   - Multi-scale slopes: `window ∈ {5, 15, 30}`
   - CUSUM: `S_high(t) = max(0, S_high(t-1) + x(t) - μ - k)`

### P3 - Cold Start Enhancement

9. **AUC (Active User Classification)** - Information-gain based probe selection
   - Probabilistic classification: `P(type|history) ∝ P(history|type)·P(type)`
   - Information gain: `IG(d) = H(type) - E[H(type|response(d))]`

## Impact

- **Affected specs**: New `amas-algorithms` capability, modified `amas-persistence`
- **Affected code**:
  - `packages/backend-rust/src/amas/modeling/` - All 5 modeling modules
  - `packages/backend-rust/src/amas/decision/coldstart.rs` - AUC integration
  - `packages/backend-rust/src/amas/persistence.rs` - Matrix storage support
  - `packages/backend-rust/src/amas/types.rs` - New state structures
  - `packages/backend-rust/src/amas/config.rs` - New configuration parameters
  - `packages/backend-rust/src/routes/amas.rs` - is_quit signal handling
  - `packages/backend-rust/src/routes/visual_fatigue.rs` - Extended fields
  - `packages/web/src/hooks/useVisualFatigue.ts` - sessionId + extended fields
- **Database migrations**:
  - `visual_fatigue_records` - Add extended biometric columns
  - `amas_user_states` - Support JSON matrix storage for BCP covariance
  - `word_parameters` - Add IRT parameters `β`, `α` for AIR

## Dependencies

- PLF depends on: Data alignment (P0)
- AIR depends on: Data alignment (P0), word parameter schema
- TFM depends on: Visual fatigue pipeline fix (P0), is_quit signal
- MDS depends on: is_quit signal detection
- BCP depends on: Persistence matrix storage upgrade
- ADF, MTD: Independent, can proceed after P0
- AUC depends on: AIR (for probability model)
