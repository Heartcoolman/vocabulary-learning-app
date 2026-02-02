# amas-algorithms Specification

## Purpose

TBD - created by archiving change add-amas-original-algorithms. Update Purpose after archive.

## Requirements

### Requirement: Global Numeric Error Handling

All algorithms SHALL implement consistent numeric error handling via the **Clamp + Fallback** strategy.

#### Policy

- **WHEN** a calculation produces NaN, Infinity, or out-of-range value
- **THEN** system SHALL clamp to valid range or substitute previous valid state
- **AND** log warning with algorithm ID, input values, and fallback action
- **AND** continue processing (do not fail request)

#### Scenario: NaN propagation prevention

- **WHEN** any intermediate calculation produces NaN (e.g., 0/0, sqrt(-1))
- **THEN** output SHALL be clamped to domain bounds
- **AND** state update SHALL use previous valid value
- **AND** metrics SHALL record NaN occurrence count

### Requirement: Concurrency Control

The system SHALL implement **single-writer mode** for per-user state updates.

#### Policy

- **WHEN** multiple events arrive for the same user concurrently
- **THEN** events SHALL be serialized via user_id-based lock
- **AND** each event processes the latest persisted state
- **AND** no state merge logic is required

#### Scenario: Concurrent session handling

- **WHEN** user has active sessions on multiple devices
- **THEN** events are processed in arrival order (FIFO per user)
- **AND** last writer's state persists
- **AND** no lost-update detection is required

### Requirement: Power-Law Forgetting Curve (PLF)

The system SHALL implement a power-law forgetting model as defined in `docs/AMAS-Original-Algorithms.md` Section 7, using the formula `R(t,n,S,D) = (1 + t/(S·f(n)))^(-D)` where `f(n) = 1 + α·ln(1+n)`.

#### Configuration Parameters

| Parameter            | Default  | Range        | Description                                        |
| -------------------- | -------- | ------------ | -------------------------------------------------- |
| `α` (review gain)    | 0.2      | [0.0, 1.0]   | Review count benefit factor                        |
| `S_base` (stability) | 86400000 | [3600000, ∞) | Fallback stability in milliseconds (1 day default) |
| `D_base` (decay)     | 0.5      | [0.1, 2.0]   | Difficulty-related decay rate                      |
| `time_unit`          | ms       | -            | **Canonical time unit: milliseconds**              |

#### Variable Definitions

| Variable | Source                                  | Unit   | Description                                    |
| -------- | --------------------------------------- | ------ | ---------------------------------------------- |
| `t`      | `now_ts - FSRSWordState.last_review_ts` | ms     | Elapsed time since last review                 |
| `n`      | `FSRSWordState.reps`                    | count  | Total completed review count from FSRS         |
| `S`      | `FSRSWordState.stability * 86400000`    | ms     | Stability from FSRS (days → ms conversion)     |
| `D`      | `D_base * (1 + 0.1 * (difficulty - 5))` | scalar | Decay rate derived from FSRS difficulty [1-10] |

#### Numerical Stability

- **Computation**: Use `exp(-D * ln1p(t / (S * f(n))))` instead of direct power
- **Overflow protection**: Clamp `t / (S * f(n))` to [0, 1e12]
- **Fallback**: If S ≤ 0, use `S_base`; if n < 0, use n = 0

#### Scenario: Retrievability calculation with review history

- **WHEN** a word has been reviewed `n` times with stability `S` and difficulty decay `D`
- **AND** elapsed time since last review is `t` milliseconds
- **THEN** retrievability R SHALL be calculated as `(1 + t/(S·f(n)))^(-D)`
- **AND** R SHALL always be in range [0, 1]
- **AND** if `S ≤ 0` or `D ≤ 0` or `t < 0` or `n < 0`, system SHALL use fallback defaults

#### Scenario: Review count benefit

- **WHEN** a word has 5 prior reviews vs 0 reviews
- **AND** all other parameters are equal
- **THEN** the 5-review word SHALL have higher retrievability due to `f(n) = 1 + α·ln(1+5) > 1`

#### Scenario: Shadow mode operation

- **WHEN** PLF feature flag is enabled
- **AND** a scheduling decision is requested
- **THEN** PLF prediction SHALL be logged alongside MDM prediction
- **AND** MDM prediction SHALL still be used for actual scheduling

#### Scenario: Shadow mode promotion criteria

- **WHEN** PLF shadow mode has collected ≥ 1000 comparison samples
- **AND** MAE (Mean Absolute Error) between PLF and actual recall outcomes < 0.1
- **THEN** PLF MAY be promoted to production mode
- **AND** promotion decision SHALL require explicit operator approval

#### PBT Properties

- **[INV-PLF-RANGE]** ∀ valid inputs: `0 ≤ R(t,n,S,D) ≤ 1`
- **[INV-PLF-MONOTONIC-T]** ∀ t1 < t2: `R(t2,n,S,D) ≤ R(t1,n,S,D)` (retrievability decreases over time)
- **[INV-PLF-MONOTONIC-N]** ∀ n1 < n2: `R(t,n2,S,D) ≥ R(t,n1,S,D)` (more reviews → higher retrievability)
- **[INV-PLF-INITIAL]** `R(0,n,S,D) = 1.0` (perfect recall at t=0)

### Requirement: Adaptive Item Response (AIR)

The system SHALL implement IRT-based ability rating as defined in `docs/AMAS-Original-Algorithms.md` Section 8, providing ability estimates with confidence intervals.

#### Configuration Parameters

| Parameter          | Default              | Range       | Description                                                   |
| ------------------ | -------------------- | ----------- | ------------------------------------------------------------- |
| `θ_initial`        | 0.0                  | [-3.0, 3.0] | Initial user ability (medium ability)                         |
| `α_default`        | 1.0                  | [0.5, 2.5]  | Default item discrimination                                   |
| `β_conversion`     | `(elo - 1200) / 400` | [-3.0, 3.0] | Elo to IRT difficulty conversion                              |
| `η_base`           | 0.3                  | [0.1, 0.5]  | Base learning rate for ability update                         |
| `item_params_mode` | **online**           | -           | Item parameters (α, β) are updated online after each response |
| `α_η`              | 0.05                 | [0.01, 0.1] | Learning rate for item discrimination update                  |
| `β_η`              | 0.1                  | [0.05, 0.2] | Learning rate for item difficulty update                      |

#### Variable Definitions

| Variable      | Source                             | Storage                                                             | Description                     |
| ------------- | ---------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| `θ`           | UserState.ability_theta            | `amas_user_states.ability_theta` (new column)                       | User ability estimate           |
| `n_responses` | UserState.air_response_count       | `amas_user_states.air_response_count` (new column)                  | Total AIR responses for η decay |
| `α`           | WordParameters.item_discrimination | `words.item_discrimination` (new column, default 1.0)               | Item discrimination parameter   |
| `β`           | WordParameters.item_difficulty     | `words.item_difficulty` (new column, or derived from difficultyElo) | Item difficulty parameter       |
| `Σ_I`         | UserState.fisher_info_sum          | `amas_user_states.fisher_info_sum` (new column)                     | Accumulated Fisher information  |

#### Online Update Rules

**User ability update** (after each response):

```
η = η_base / (1 + n_responses)
P = 1 / (1 + exp(-α·(θ-β)))  // clamp α·(θ-β) to [-20, 20]
θ' = clamp(θ + η·α·(y-P), -3.0, 3.0)
```

**Item parameter update** (after each response):

```
α' = clamp(α + α_η·(y-P)·(θ-β), 0.5, 2.5)
β' = clamp(β - β_η·(y-P), -3.0, 3.0)
```

**Fisher information accumulation**:

````
I_i = α²·P·(1-P)
Σ_I' = Σ_I + I_i
SE(θ) = 1/sqrt(max(0.01, Σ_I'))
confidence = 1/(1+SE)
``` |

#### Scenario: Probability calculation

- **WHEN** user ability θ=1.0 and item difficulty β=0.5 and discrimination α=1.5
- **THEN** probability of correct response SHALL be `1/(1 + exp(-1.5·(1.0-0.5))) ≈ 0.68`
- **AND** exp() SHALL be computed with overflow protection: clamp `α·(θ-β)` to [-20, 20]

#### Scenario: Ability update on correct response

- **WHEN** user answers correctly (y=1)
- **AND** predicted probability P=0.6
- **THEN** ability SHALL increase by `η·α·(1-0.6) = η·α·0.4`
- **AND** learning rate η SHALL be `η_base / (1 + n_responses)` where n_responses is total user responses
- **AND** item difficulty β SHALL decrease by `β_η·(1-0.6) = β_η·0.4`
- **AND** item discrimination α SHALL update by `α_η·(1-0.6)·(θ-β)`

#### Scenario: Confidence calculation

- **WHEN** user has answered N items
- **AND** Fisher information I_i is computed for each item
- **THEN** standard error SE(θ) SHALL be `1/sqrt(max(ε, Σ I_i))` where ε=0.01
- **AND** confidence SHALL be `1/(1+SE)`
- **AND** at N=0, confidence SHALL be 0.0 (no information)

#### Scenario: Default item parameters

- **WHEN** a word has no IRT parameters stored
- **THEN** system SHALL use default discrimination α=1.0
- **AND** difficulty β SHALL be computed from Elo: `β = clamp((difficultyElo - 1200) / 400, -3.0, 3.0)`
- **AND** if difficultyElo is missing, β SHALL default to 0.0

#### Scenario: Item parameter online update

- **WHEN** AIR processes a response
- **THEN** item parameters (α, β) SHALL be updated online using the update rules above
- **AND** updated parameters SHALL be persisted to `words` table
- **AND** concurrent updates to same word SHALL be handled via single-writer mode

#### PBT Properties

- **[INV-AIR-PROB-RANGE]** ∀ valid inputs: `0 < P(θ,β,α) < 1` (probability is bounded)
- **[INV-AIR-MONOTONIC-θ]** ∀ θ1 < θ2: `P(θ2,β,α) > P(θ1,β,α)` (higher ability → higher P)
- **[INV-AIR-ABILITY-BOUNDS]** ∀ updates: `θ ∈ [-3.0, 3.0]` (clamped)
- **[INV-AIR-CONFIDENCE-RANGE]** ∀ N ≥ 0: `confidence ∈ [0, 1]`
- **[INV-AIR-FISHER-POSITIVE]** ∀ valid P: `I = α²·P·(1-P) ≥ 0`
- **[INV-AIR-ITEM-BOUNDS]** ∀ updates: `α ∈ [0.5, 2.5]`, `β ∈ [-3.0, 3.0]`
- **[INV-AIR-ROUNDTRIP]** Serialize/deserialize (θ, Σ_I, n_responses) preserves next-step ability update within f64 epsilon

### Requirement: Tri-pool Fatigue Model (TFM)

The system SHALL implement three-dimensional fatigue modeling with dual-layer recovery as defined in `docs/AMAS-Original-Algorithms.md` Section 2.

#### Configuration Parameters

| Parameter | Cognitive | Visual | Mental | Description |
|-----------|-----------|--------|--------|-------------|
| `r_fast` | 0.7 | 0.8 | 0.6 | Fast pool decay rate per event |
| `r_slow` | 0.95 | 0.97 | 0.90 | Slow pool decay rate per event |
| `τ_fast` (ms) | 120000 | 180000 | 60000 | Fast pool recovery time constant |
| `τ_slow` (ms) | 900000 | 1200000 | 600000 | Slow pool recovery time constant |
| `θ_spill` | 0.7 | 0.7 | 0.7 | Spill threshold from fast to slow pool |
| `w_fast` | 0.6 | 0.6 | 0.6 | Fast pool weight in dimension total |
| `w_slow` | 0.4 | 0.4 | 0.4 | Slow pool weight in dimension total |
| `sleep_reset_threshold` (ms) | 21600000 | - | - | 6 hours: trigger Sleep Reset |
| `w_cog` | 0.4 | - | - | Cognitive dimension weight in F_total |
| `w_vis` | 0.35 | - | - | Visual dimension weight in F_total |
| `w_men` | 0.25 | - | - | Mental dimension weight in F_total |

#### Visual Fatigue Data Transport

Visual fatigue extended fields SHALL be transported via **ProcessOptions extension**:

```rust
pub struct VisualFatigueRawMetrics {
    pub perclos: Option<f64>,           // [0, 1]
    pub blink_rate: Option<f64>,        // per minute
    pub eye_aspect_ratio: Option<f64>,  // EAR, typically [0.1, 0.5]
    pub squint_intensity: Option<f64>,  // [0, 1]
    pub gaze_off_screen_ratio: Option<f64>, // [0, 1]
    pub avg_blink_duration: Option<f64>,    // ms
    pub head_stability: Option<f64>,        // [0, 1]
    pub confidence: f64,                // detection confidence [0, 1]
    pub timestamp_ms: i64,              // collection timestamp
}

pub struct ProcessOptions {
    // ... existing fields ...
    pub visual_fatigue_raw: Option<VisualFatigueRawMetrics>,
}
````

Route layer SHALL populate `visual_fatigue_raw` from `visual_fatigue_records` when sessionId matches within 30-second window.

#### Update Step Order

For each dimension d ∈ {cognitive, visual, mental}, the update order SHALL be:

1. **Time-based recovery** (apply first):

   ```
   Δt = current_ts - last_event_ts
   F_d_fast *= exp(-Δt / τ_d_fast)
   F_d_slow *= exp(-Δt / τ_d_slow)
   ```

2. **Sleep Reset** (if Δt > 6 hours):

   ```
   F_d_fast = 0.0  // Fast pools fully reset
   F_d_slow *= exp(-21600000 / τ_d_slow)  // Slow pools decay by 6 hours
   ```

3. **Load accumulation**:

   ```
   F_d_fast = clamp(F_d_fast * r_d_fast + load_d, 0.0, 1.0)
   ```

4. **Spill mechanism** (after load accumulation):

   ```
   spill_d = max(0, F_d_fast - θ_d_spill)
   F_d_slow = clamp(F_d_slow * r_d_slow + spill_d, 0.0, 1.0)
   ```

5. **Dimension total**:

   ```
   F_d = w_fast * F_d_fast + w_slow * F_d_slow
   ```

6. **Global total** (with renormalization if visual dropped):
   ```
   if visual_available:
       F_total = w_cog * F_cog + w_vis * F_vis + w_men * F_men
   else:
       w_cog' = w_cog / (w_cog + w_men)
       w_men' = w_men / (w_cog + w_men)
       F_total = w_cog' * F_cog + w_men' * F_men
   ```

#### Load Formulas

**Cognitive Load** (load_cognitive):

```
error_rate_trend = clamp(session_error_count / max(1, session_total_count), 0.0, 1.0)
rt_increase_ratio = clamp((current_rt - session_baseline_rt) / session_baseline_rt, 0.0, 1.0)
repeat_error_ratio = clamp(retry_count / 3.0, 0.0, 1.0)

load_cognitive = 0.4 * error_rate_trend + 0.3 * rt_increase_ratio + 0.3 * repeat_error_ratio
```

Where `session_baseline_rt` is the median RT of first 5 events in session.

**Mental Load** (load_mental):

```
consecutive_failures_norm = clamp(consecutive_failures / 5.0, 0.0, 1.0)
quit_penalty = 1.0 if is_quit else 0.0
frustration_signal = clamp((1.0 - (M + 1.0) / 2.0), 0.0, 1.0) if M < 0.0 else 0.0

load_mental = 0.3 * consecutive_failures_norm + 0.4 * quit_penalty + 0.3 * frustration_signal
```

Where `consecutive_failures` resets on correct answer, `M` is motivation from MDS.

**Visual Load** (load_visual):

```
// Core metrics (always available if visual data present)
perclos_norm = clamp(perclos, 0.0, 1.0)
blink_deviation = clamp(abs(blink_rate - user_baseline_blink) / user_baseline_blink, 0.0, 1.0)
  where user_baseline_blink defaults to 17.0 per minute

// Extended metrics (optional, graceful degradation)
ear_norm = clamp(1.0 - (eye_aspect_ratio - 0.15) / 0.25, 0.0, 1.0) if eye_aspect_ratio else 0.0
squint_norm = clamp(squint_intensity, 0.0, 1.0) if squint_intensity else 0.0
gaze_norm = clamp(gaze_off_screen_ratio, 0.0, 1.0) if gaze_off_screen_ratio else 0.0

// Weights (renormalize if extended metrics missing)
if all extended metrics available:
    load_visual = 0.35 * perclos_norm + 0.20 * blink_deviation + 0.20 * ear_norm
                + 0.15 * squint_norm + 0.10 * gaze_norm
else (core only):
    load_visual = 0.6 * perclos_norm + 0.4 * blink_deviation
```

#### Missing Visual Data Policy

- **WHEN** visual fatigue data is unavailable or stale (> 30 seconds)
- **THEN** visual dimension SHALL be dropped entirely
- **AND** dimension weights SHALL renormalize: `w_cog' = w_cog / (w_cog + w_men)`, `w_men' = w_men / (w_cog + w_men)`
- **AND** F_total SHALL be computed from cognitive and mental only

#### Scenario: Dimension separation

- **WHEN** user exhibits high visual fatigue indicators (PERCLOS > 0.3)
- **BUT** cognitive indicators are normal (error rate stable)
- **THEN** visual fatigue dimension SHALL increase
- **AND** cognitive fatigue dimension SHALL remain stable
- **AND** total fatigue SHALL reflect weighted combination

#### Scenario: Fast pool recovery

- **WHEN** user takes a 2-minute break
- **THEN** fast pool fatigue SHALL decay by `exp(-120000/τ_fast)` per dimension
- **AND** slow pool fatigue SHALL decay by `exp(-120000/τ_slow)` (slower decay)

#### Scenario: Spill mechanism

- **WHEN** fast pool fatigue exceeds threshold θ_spill
- **THEN** excess fatigue `spill = max(0, F_fast - θ_spill)` SHALL transfer to slow pool
- **AND** slow pool SHALL accumulate: `F_slow' = F_slow * r_slow + spill`

#### Scenario: Mental fatigue from quit events

- **WHEN** user triggers quit event (session abort, high frustration)
- **THEN** mental fatigue load SHALL increase by quit_penalty = 1.0
- **AND** consecutive failures count SHALL factor into mental load

#### PBT Properties

- **[INV-TFM-POOL-RANGE]** ∀ pools: `F_fast, F_slow ∈ [0, 1]` (clamped after each update step)
- **[INV-TFM-DIMENSION-RANGE]** ∀ dimensions: `F_d ∈ [0, 1]`
- **[INV-TFM-TOTAL-RANGE]** `F_total ∈ [0, 1]`
- **[INV-TFM-RECOVERY]** ∀ break_ms > 0: `F_d(after_break) ≤ F_d(before_break)` (break reduces fatigue)
- **[INV-TFM-SPILL-POSITIVE]** `spill_d ≥ 0` (spill is non-negative)
- **[INV-TFM-WEIGHT-SUM]** `w_cog + w_vis + w_men = 1.0` (or renormalized when visual dropped)
- **[INV-TFM-SLEEP-RESET]** After Δt > 6h: `F_fast = 0` for all dimensions
- **[INV-TFM-LOAD-BOUNDED]** ∀ load computations: `load_d ∈ [0, 1]`
- **[INV-TFM-ROUNDTRIP]** Serialize/deserialize all 6 pool values preserves next update within f64 epsilon

#### TFM State Persistence

TFM internal state SHALL be persisted within `amas_user_states`:

```json
{
  "tfm_pools": {
    "cognitive": { "fast": 0.0, "slow": 0.0 },
    "visual": { "fast": 0.0, "slow": 0.0 },
    "mental": { "fast": 0.0, "slow": 0.0 }
  },
  "tfm_last_event_ts": 1706745600000,
  "tfm_consecutive_failures": 0,
  "tfm_session_baseline_rt": 1500
}
```

Storage location: new `tfm_state` JSON column in `amas_user_states` or embedded in `algorithm_internal_states`.

### Requirement: Motivation Dynamics System (MDS)

The system SHALL implement bistable motivation dynamics as defined in `docs/AMAS-Original-Algorithms.md` Section 4, using double-well potential `V(M) = -a·M² + b·M⁴`.

#### Configuration Parameters

| Parameter | Default | Range       | Description                     |
| --------- | ------- | ----------- | ------------------------------- |
| `a`       | 0.5     | [0.1, 1.0]  | Bistable strength (well depth)  |
| `b`       | 0.5     | [0.1, 1.0]  | Quartic constraint (well width) |
| `η`       | 0.1     | [0.05, 0.2] | Update step size                |
| `κ`       | 0.3     | [0.1, 0.5]  | Correct answer stimulus         |
| `λ`       | 0.2     | [0.1, 0.4]  | Incorrect answer penalty        |
| `μ`       | 0.5     | [0.3, 0.8]  | Quit event penalty              |

#### Update Equation

```
S(t) = κ (if correct) | -λ (if incorrect) | -μ (if is_quit)
M(t) = clamp(M(t-1) + η·(2a·M(t-1) - 4b·M(t-1)³ + S(t)), -1.0, 1.0)
```

#### Bistable Properties

The equation has three equilibria (with S=0):

- Stable: M\* = +√(a/2b) ≈ +0.707 (high motivation attractor)
- Stable: M\* = -√(a/2b) ≈ -0.707 (low motivation attractor)
- Unstable: M\* = 0 (saddle point)

This creates "motivation inertia": many failures needed to drop from high, many successes needed to climb from low.

#### Scenario: High motivation stability

- **WHEN** user motivation M is high (M > 0.7)
- **AND** user makes 2 consecutive errors
- **THEN** motivation SHALL decrease but remain above 0.5 (hysteresis)
- **AND** multiple failures SHALL be required to drop to low motivation state

#### Scenario: Low motivation stability

- **WHEN** user motivation M is low (M < -0.5)
- **AND** user makes 2 consecutive correct answers
- **THEN** motivation SHALL increase slightly but remain negative
- **AND** sustained success SHALL be required to climb to high motivation

#### Scenario: Quit event penalty

- **WHEN** user triggers quit event
- **THEN** motivation stimulus S(t) SHALL be -μ (negative stimulus)
- **AND** motivation SHALL shift toward low stable state

#### PBT Properties

- **[INV-MDS-RANGE]** ∀ updates: `M ∈ [-1, 1]` (clamped)
- **[INV-MDS-FINITE]** ∀ updates: `is_finite(M)` (no NaN/Inf)
- **[INV-MDS-MONOTONIC-STIMULUS]** For fixed M\_{t-1}, if S1 < S2 then M(S1) ≤ M(S2) (monotonic in stimulus)
- **[INV-MDS-FIXED-POINTS]** With S=0, M∈{0, ±√(a/2b)} are fixed points within tolerance
- **[INV-MDS-BASIN-SEPARATION]** With S=0 and |M_0|>ε, sign(M_t) never flips (stays in basin)
- **[INV-MDS-CONVERGENCE]** Under constant S=+κ for 1000 steps, M converges to positive attractor or clamps at +1
- **[INV-MDS-ROUNDTRIP]** Serialize/deserialize M preserves next update within f64 epsilon

#### Numerical Stability

- Step size η SHALL satisfy `η < 1/(12·b·M_max²)` for local stability
- With default params: `η < 1/(12·0.5·1²) = 0.167`, default η=0.1 is safe
- If M escapes bounds before clamp, apply clamp immediately

### Requirement: Attention Dynamics Filter (ADF)

The system SHALL implement state-space attention modeling as defined in `docs/AMAS-Original-Algorithms.md` Section 1, with adaptive inertia and nonlinear observation.

#### Configuration Parameters

| Parameter | Default | Range       | Description                        |
| --------- | ------- | ----------- | ---------------------------------- |
| `α_base`  | 0.4     | [0.1, 0.8]  | Base inertia coefficient           |
| `α_min`   | 0.05    | [0.01, 0.2] | Minimum inertia (fast response)    |
| `α_max`   | 0.95    | [0.8, 0.99] | Maximum inertia (strong smoothing) |

#### Update Equations

```
// Observation model (normalized features → tanh → sigmoid)
Φ(features) = w_1·rt_norm + w_2·accuracy + w_3·(1-focus_loss) + ...  // weighted sum
O(t) = sigmoid(tanh(Φ(features))) = 1/(1 + exp(-tanh(Φ)))

// Adaptive inertia (responds faster to sudden changes)
ΔO(t) = O(t) - O(t-1)
α(t) = clamp(α_base · (1 - |ΔO(t)|), α_min, α_max)

// State update (convex combination)
A(t) = α(t) · A(t-1) + (1 - α(t)) · O(t)
```

#### Feature Normalization

All features SHALL be normalized to [0, 1] before entering Φ:

- `rt_norm = clamp(1 - response_time / max_response_time, 0, 1)`
- `accuracy = 1.0 if is_correct else 0.0`
- `focus_loss_norm = clamp(focus_loss_ms / 60000, 0, 1)`
- Features with missing values use 0.5 (neutral)

#### ADF State Persistence

ADF SHALL persist `O(t-1)` to compute `ΔO(t)` on next event:

```json
{
  "adf_prev_observation": 0.65,
  "adf_prev_attention": 0.72
}
```

Storage: embedded in `algorithm_internal_states` JSON column.

#### Scenario: Adaptive inertia on sudden change

- **WHEN** observed attention signal changes rapidly (|ΔO| > 0.3)
- **THEN** inertia coefficient α SHALL decrease toward α_base·0.7
- **AND** attention estimate SHALL respond quickly to change

#### Scenario: Noise resistance during stable period

- **WHEN** observed attention signal is stable (|ΔO| < 0.05)
- **THEN** inertia coefficient α SHALL remain near α_base
- **AND** attention estimate SHALL smooth out noise

#### Scenario: Feature saturation

- **WHEN** multiple features indicate low attention (e.g., high RT, low accuracy, focus loss)
- **THEN** observation O(t) SHALL saturate via tanh (bounded contribution)
- **AND** extreme feature values SHALL not cause unbounded attention drop

#### PBT Properties

- **[INV-ADF-RANGE]** ∀ updates: `A(t) ∈ [0, 1]`
- **[INV-ADF-ALPHA-RANGE]** ∀ updates: `α(t) ∈ [α_min, α_max]`
- **[INV-ADF-OBSERVATION-RANGE]** ∀ inputs: `O(t) ∈ [0, 1]` (sigmoid guarantees)
- **[INV-ADF-CONVEX]** `A(t) ∈ [min(A(t-1), O(t)), max(A(t-1), O(t))]` (convex combination)
- **[INV-ADF-MONOTONIC-O]** For fixed A(t-1) and α: if O1 ≤ O2 then A(O1) ≤ A(O2)
- **[INV-ADF-IDEMPOTENT]** If A(t-1) = O(t) then A(t) = A(t-1) for any α
- **[INV-ADF-CONVERGENCE]** Under constant O(t)=O*, |A(t)-O*| is non-increasing
- **[INV-ADF-FINITE]** ∀ inputs (including NaN-replaced defaults): `is_finite(A(t))`
- **[INV-ADF-ROUNDTRIP]** Serialize/deserialize (O(t-1), A(t-1)) preserves next update

### Requirement: Bayesian Cognitive Profiling (BCP)

The system SHALL implement Bayesian cognitive estimation as defined in `docs/AMAS-Original-Algorithms.md` Section 3, maintaining 3×3 covariance matrix for uncertainty tracking.

#### Configuration Parameters

| Parameter        | Default                | Range        | Description                                      |
| ---------------- | ---------------------- | ------------ | ------------------------------------------------ |
| `drift_rate`     | 0.001                  | [0, 0.01]    | Ability drift per hour (growth modeling)         |
| `Q_diag`         | 0.001                  | [0, 0.01]    | Process noise diagonal (uncertainty growth rate) |
| `R_diag`         | 0.1                    | [0.01, 0.5]  | Observation noise diagonal                       |
| `jitter_epsilon` | 1e-6                   | [1e-8, 1e-4] | Regularization for matrix inversion              |
| `μ_initial`      | [0.5, 0.5, 0.5]        | [0, 1]³      | Initial ability mean                             |
| `Σ_initial`      | diag(0.25, 0.25, 0.25) | PSD          | Initial covariance (medium uncertainty)          |

#### State Representation

```
μ = [μ_mem, μ_speed, μ_stability] ∈ [0, 1]³  // clamped after update
Σ ∈ R^(3×3), symmetric positive semi-definite
```

#### Observation Model

```
z = [accuracy, 1/max(0.1, rt_norm), consistency]  // observation vector
H = I_3  // identity observation matrix (direct observation)
R = diag(R_diag, R_diag, R_diag)  // observation noise
```

Where:

- `accuracy = 1.0 if is_correct else 0.0`
- `rt_norm = clamp(response_time / max_response_time, 0.1, 2.0)`
- `consistency = 1.0 - error_variance` (derived from recent accuracy variance)

#### Kalman Update Equations

```
// Prediction step (time update)
Δt_hours = (current_ts - last_update_ts) / 3600000
μ_pred = μ + drift_rate * Δt_hours * [1, 1, 1]  // uniform drift
Σ_pred = Σ + Q * Δt_hours  // Q = diag(Q_diag, Q_diag, Q_diag)

// Measurement step
S = H * Σ_pred * H' + R  // innovation covariance
S_reg = S + jitter_epsilon * I_3  // regularization for stability
K = Σ_pred * H' * inv(S_reg)  // Kalman gain (use Cholesky)
μ' = μ_pred + K * (z - H * μ_pred)
Σ' = (I - K * H) * Σ_pred

// Post-processing
μ' = clamp(μ', 0.0, 1.0)  // component-wise
Σ' = (Σ' + Σ'') / 2  // symmetrize
Σ' = enforce_psd(Σ', jitter_epsilon)  // eigenvalue clamp
```

#### Confidence Calculation

```
confidence = clamp(1.0 / (1.0 + trace(Σ)), 0.0, 1.0)
```

Note: With Σ_initial = diag(0.25, 0.25, 0.25), initial confidence ≈ 0.57.

#### BCP State Persistence

BCP state SHALL be stored in `cognitive_profile` JSON field within `amas_user_states`:

```json
{
  "mem": 0.65,
  "speed": 0.72,
  "stability": 0.58,
  "covariance": [
    [0.15, 0.02, 0.01],
    [0.02, 0.12, 0.01],
    [0.01, 0.01, 0.18]
  ],
  "last_update_ts": 1706745600000
}
```

#### Scenario: Initial uncertainty

- **WHEN** new user starts learning
- **THEN** covariance matrix Σ SHALL be initialized to `diag(0.25, 0.25, 0.25)`
- **AND** confidence SHALL be approximately 0.57 (medium uncertainty)

#### Scenario: Confidence increase with evidence

- **WHEN** user completes 20 learning events
- **THEN** covariance diagonal SHALL decrease
- **AND** confidence (1/trace(Σ)) SHALL increase

#### Scenario: Correlation tracking

- **WHEN** user exhibits correlated memory-speed behavior (fast learners remember well)
- **THEN** off-diagonal covariance elements SHALL capture this correlation
- **AND** memory estimate update SHALL influence speed estimate proportionally

#### Scenario: Ability drift modeling

- **WHEN** user learns over extended period
- **THEN** ability mean μ SHALL drift upward by drift_rate·Δt_hours
- **AND** covariance SHALL increase by process noise Q·Δt_hours (uncertainty growth)

#### PBT Properties

- **[INV-BCP-MU-RANGE]** ∀ updates: `μ_i ∈ [0, 1]` for i ∈ {mem, speed, stability}
- **[INV-BCP-SIGMA-PSD]** ∀ updates: `Σ` is symmetric and positive semi-definite (eigenvalues ≥ -ε)
- **[INV-BCP-SIGMA-SYMMETRIC]** ∀ updates: `||Σ - Σ'||_F < ε` (symmetry preserved)
- **[INV-BCP-CONFIDENCE-RANGE]** ∀ updates: `confidence ∈ [0, 1]`
- **[INV-BCP-UNCERTAINTY-REDUCTION]** Measurement update: `trace(Σ') ≤ trace(Σ_pred)` (evidence reduces uncertainty)
- **[INV-BCP-UNCERTAINTY-GROWTH]** Drift update with Q > 0: `trace(Σ_pred) ≥ trace(Σ)` (time increases uncertainty)
- **[INV-BCP-FINITE]** ∀ updates: all matrix elements are finite (no NaN/Inf)
- **[INV-BCP-ROUNDTRIP]** Serialize/deserialize (μ, Σ) as JSON preserves values within 1e-10 epsilon
- **[INV-BCP-CONVERGENCE]** Under constant observation z* for 100 steps, μ → z* and trace(Σ) decreases

#### Numerical Stability

- Matrix inversion SHALL use Cholesky decomposition with regularization
- If S_reg has condition number > 1e10, skip measurement update and log warning
- Eigenvalue clamp: if λ_min(Σ) < 0, set λ_min = jitter_epsilon

### Requirement: Multi-scale Trend Detector (MTD)

The system SHALL implement multi-scale trend analysis with CUSUM change-point detection as defined in `docs/AMAS-Original-Algorithms.md` Section 5.

#### Configuration Parameters

| Parameter       | Default     | Range         | Description                                        |
| --------------- | ----------- | ------------- | -------------------------------------------------- |
| `windows`       | [5, 15, 30] | -             | Event-count based windows for multi-scale analysis |
| `k` (slack)     | 0.05        | [0.01, 0.2]   | CUSUM slack parameter (allowance)                  |
| `h` (threshold) | 3.0         | [1.0, 10.0]   | CUSUM detection threshold                          |
| `θ_up`          | 0.02        | [0.01, 0.1]   | Slope threshold for Up/Down classification         |
| `θ_flat`        | 0.01        | [0.005, 0.05] | Slope threshold for Flat classification            |
| `θ_stuck_var`   | 0.01        | [0.005, 0.05] | Variance threshold for Stuck classification        |
| `warmup_events` | 10          | [5, 20]       | Minimum events before CUSUM activates              |

#### Input Signal

```
x(t) = mastery_score = (cognitive.mem + cognitive.speed + cognitive.stability) / 3.0
```

Where cognitive profile comes from BCP (or baseline profiler if BCP disabled).

#### CUSUM Equations

```
// Rolling baseline (exponential moving average)
μ(t) = 0.9 * μ(t-1) + 0.1 * x(t)  // initialized to x(0)

// CUSUM accumulators (detect sustained shifts)
S_high(t) = max(0, S_high(t-1) + x(t) - μ(t-1) - k)  // detect upward shift
S_low(t) = max(0, S_low(t-1) - x(t) + μ(t-1) - k)   // detect downward shift

change_detected = (S_high(t) > h) OR (S_low(t) > h)
```

#### Slope Computation

Linear regression slope for window of size w:

```
slope_w = Σ[(i - i_mean) * (x_i - x_mean)] / Σ[(i - i_mean)²]
```

Where i is event index within window.

#### Classification Logic

```
if n_events < warmup_events:
    return TrendState::Flat  // insufficient data

if change_detected:
    reset S_high = S_low = 0  // reset accumulators after detection
    return TrendState::ChangePoint

consistency = sign(slope_5) == sign(slope_15) == sign(slope_30)
// Handle near-zero slopes: |slope| < 0.001 treated as sign=0

if consistency AND slope_15 > θ_up:
    return TrendState::Up
if consistency AND slope_15 < -θ_up:
    return TrendState::Down

variance_30 = var(x[last 30 events])
if |slope_15| < θ_flat AND variance_30 < θ_stuck_var:
    return TrendState::Stuck

return TrendState::Flat
```

#### TrendState Enum Update

```rust
pub enum TrendState {
    Up,
    Down,
    Flat,
    Stuck,
    ChangePoint,  // NEW: added for MTD
}
```

#### Scenario: Multi-scale consistency for upward trend

- **WHEN** slope at window=5 is +0.08
- **AND** slope at window=15 is +0.06
- **AND** slope at window=30 is +0.04
- **THEN** trend SHALL be classified as "Up" (consistent positive)

#### Scenario: Change-point detection

- **WHEN** mastery score suddenly drops from 0.8 to 0.4
- **AND** CUSUM statistic S_low exceeds threshold h
- **THEN** trend SHALL be classified as "ChangePoint"
- **AND** system SHALL flag for intervention review

#### Scenario: Stuck state detection

- **WHEN** all scale slopes are near zero (|slope| < 0.01)
- **AND** variance across window is very low (< 0.01)
- **THEN** trend SHALL be classified as "Stuck" (plateau without progress)

#### PBT Properties

- **[INV-MTD-CUSUM-NONNEG]** ∀ updates: `S_high ≥ 0` AND `S_low ≥ 0`
- **[INV-MTD-CUSUM-FINITE]** ∀ updates: `is_finite(S_high)` AND `is_finite(S_low)`
- **[INV-MTD-BASELINE-RANGE]** ∀ updates: `μ ∈ [0, 1]` (if x ∈ [0, 1])
- **[INV-MTD-NO-CHANGE-CONSTANT]** If x(t) = c constant and μ = c, then S_high = S_low = 0 always
- **[INV-MTD-SLOPE-LINEAR]** For perfect linear sequence y_i = c + m\*i, computed slope = m within ε
- **[INV-MTD-WARMUP-SAFE]** If n_events < warmup_events, output is Flat (no ChangePoint)
- **[INV-MTD-CHANGEPOINT-RESET]** After ChangePoint detection, S_high = S_low = 0
- **[INV-MTD-ROUNDTRIP]** Serialize/deserialize (S_high, S_low, μ, history) preserves next classification

#### MTD State Persistence

MTD internal state SHALL be persisted:

```json
{
  "mtd_s_high": 0.0,
  "mtd_s_low": 0.0,
  "mtd_baseline_mu": 0.65,
  "mtd_history": [0.62, 0.65, 0.68, ...]  // last 30 mastery scores
}
```

Storage: `algorithm_internal_states` JSON column.

### Requirement: Active User Classification (AUC)

The system SHALL implement information-gain based user classification as defined in `docs/AMAS-Original-Algorithms.md` Section 6, for efficient cold start profiling.

#### Configuration Parameters

| Parameter     | Default         | Range       | Description                                      |
| ------------- | --------------- | ----------- | ------------------------------------------------ |
| `θ_confident` | 0.8             | [0.7, 0.95] | Confidence threshold for early stopping          |
| `θ_entropy`   | 0.5             | [0.3, 0.7]  | Normalized entropy threshold for stopping        |
| `max_samples` | 15              | [5, 30]     | Maximum probes before forced classification      |
| `prior`       | [1/3, 1/3, 1/3] | -           | Prior distribution over {Fast, Stable, Cautious} |

#### User Types

| Type     | Description                                | Likelihood Model (P(correct  | type, difficulty)) |
| -------- | ------------------------------------------ | ---------------------------- | ------------------ |
| Fast     | Quick learner, high accuracy on hard items | `0.9 - 0.1*d` for d ∈ [0, 1] |
| Stable   | Consistent learner, moderate accuracy      | `0.7 - 0.2*d` for d ∈ [0, 1] |
| Cautious | Careful learner, needs easy start          | `0.8 - 0.4*d` for d ∈ [0, 1] |

Where `d` = normalized difficulty ∈ [0, 1].

#### Posterior Update (Bayes)

```
// After observing response y at difficulty d
P(type|history) ∝ P(y|type, d) * P(type|history_prev)

// Likelihood
P(correct|type, d) = defined by type model above
P(incorrect|type, d) = 1 - P(correct|type, d)

// Normalization
P(type|history) = unnormalized / Σ_types unnormalized
```

Use log-space computation to avoid underflow:

```
log_posterior[type] = log_prior[type] + Σ log_likelihood(response_i | type)
posterior[type] = softmax(log_posterior)
```

#### Information Gain Calculation

```
// Current entropy (normalized by ln(3))
H(T) = -Σ P(type) * ln(P(type)) / ln(3)  // ∈ [0, 1]

// Expected posterior entropy for probe at difficulty d
for outcome in {correct, incorrect}:
    P(outcome|d) = Σ_types P(outcome|type, d) * P(type)
    posterior_given_outcome = bayes_update(P(type), outcome, d)
    H(T|outcome) = entropy(posterior_given_outcome)

E[H(T|Y_d)] = Σ_outcomes P(outcome|d) * H(T|outcome)

// Information gain
IG(d) = H(T) - E[H(T|Y_d)]  // always ≥ 0 in theory
```

#### Probe Selection

```
candidate_difficulties = [0.2, 0.4, 0.6, 0.8]  // discrete difficulty levels
best_d = argmax_{d ∈ candidates} IG(d)
```

The probe difficulty maps to `StrategyParams.difficulty`:

- d=0.2 → difficulty=1 (Easy)
- d=0.4 → difficulty=2 (Medium-Easy)
- d=0.6 → difficulty=3 (Medium-Hard)
- d=0.8 → difficulty=4 (Hard)

#### Scenario: Information gain probe selection

- **WHEN** system needs to classify new user
- **AND** current entropy H(type) is high
- **THEN** system SHALL select probe difficulty that maximizes information gain IG(d)
- **AND** probe SHALL reduce classification uncertainty most efficiently

#### Scenario: Early stopping on high confidence

- **WHEN** probability of single user type exceeds θ_confident (0.8)
- **THEN** classification SHALL terminate early
- **AND** user type SHALL be assigned with high confidence

#### Scenario: Entropy-based termination

- **WHEN** classification entropy drops below θ_entropy (0.5)
- **THEN** classification MAY terminate
- **AND** most likely user type SHALL be assigned

#### Scenario: Sample limit termination

- **WHEN** max_samples probes have been administered
- **THEN** classification SHALL terminate regardless of confidence
- **AND** most likely user type SHALL be assigned with available evidence

#### PBT Properties

- **[INV-AUC-POSTERIOR-NORMALIZED]** ∀ updates: `Σ P(type) = 1.0` within ε
- **[INV-AUC-POSTERIOR-NONNEG]** ∀ updates: `P(type) ≥ 0` for all types
- **[INV-AUC-ENTROPY-RANGE]** ∀ states: `H_norm ∈ [0, 1]`
- **[INV-AUC-IG-NONNEG]** ∀ probes: `IG(d) ≥ -ε` (small negative allowed for numerical error)
- **[INV-AUC-TERMINATION]** ∀ sequences: classification terminates by n = max_samples
- **[INV-AUC-BAYES-CONSISTENCY]** E_response[P(type|response)] = P(type) (prior recovered by averaging)
- **[INV-AUC-IDEMPOTENT-FLAT]** If likelihood ratio = [1,1,1], posterior unchanged and IG = 0
- **[INV-AUC-CONVERGENCE]** Under 10 correct responses, P(Fast) should be highest
- **[INV-AUC-ROUNDTRIP]** Serialize/deserialize (posterior, n_samples, history) preserves next probe selection

#### AUC State Persistence

AUC state SHALL be persisted within ColdStartState:

```json
{
  "auc_log_posterior": [-1.1, -1.2, -0.9],  // log-space for stability
  "auc_n_samples": 5,
  "auc_history": [{"d": 0.4, "y": true}, {"d": 0.6, "y": false}, ...]
}
```

Storage: `amas_user_models` table, model_type = "coldstart".

### Requirement: Algorithm Feature Flags

The system SHALL provide independent feature flags for each original algorithm, enabling gradual rollout and A/B testing.

#### Structure

Feature flags SHALL be **added to the existing `FeatureFlags` struct** in `amas/config.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    // Existing fields
    pub ensemble_enabled: bool,
    pub heuristic_enabled: bool,
    pub causal_inference_enabled: bool,
    pub bayesian_optimizer_enabled: bool,
    pub umm_mdm_enabled: bool,
    pub umm_ige_enabled: bool,
    pub umm_swd_enabled: bool,
    pub umm_msmt_enabled: bool,
    pub umm_mtp_enabled: bool,
    pub umm_iad_enabled: bool,
    pub umm_evm_enabled: bool,
    pub umm_ab_test_enabled: bool,
    pub umm_ab_test_percentage: u8,

    // NEW: Original algorithm flags (default false for backward compatibility)
    #[serde(default)]
    pub use_plf: bool,      // Power-Law Forgetting (shadow mode)
    #[serde(default)]
    pub use_air: bool,      // Adaptive Item Response
    #[serde(default)]
    pub use_tfm: bool,      // Tri-pool Fatigue Model
    #[serde(default)]
    pub use_mds: bool,      // Motivation Dynamics System
    #[serde(default)]
    pub use_adf: bool,      // Attention Dynamics Filter
    #[serde(default)]
    pub use_bcp: bool,      // Bayesian Cognitive Profiling
    #[serde(default)]
    pub use_mtd: bool,      // Multi-scale Trend Detector
    #[serde(default)]
    pub use_auc: bool,      // Active User Classification
}
```

#### Default Values

All new algorithm flags SHALL default to `false` for backward compatibility.

#### Algorithm Metrics

New `AlgorithmId` variants SHALL be added for tracking:

```rust
pub enum AlgorithmId {
    // ... existing variants ...
    Plf,
    Air,
    Tfm,
    Mds,
    Adf,
    Bcp,
    Mtd,
    Auc,
}
```

#### Scenario: Individual algorithm toggle

- **WHEN** `use_tfm` flag is true and `use_adf` flag is false
- **THEN** FatigueEstimator SHALL use TFM algorithm
- **AND** AttentionMonitor SHALL use baseline algorithm

#### Scenario: Backward compatibility

- **WHEN** all feature flags are false
- **THEN** system SHALL behave identically to baseline implementation
- **AND** no new algorithm code paths SHALL be executed

#### Scenario: Runtime flag update

- **WHEN** feature flag is updated via configuration
- **THEN** new algorithm SHALL be used for subsequent processing
- **AND** existing user state SHALL remain compatible

### Requirement: Visual Fatigue Data Pipeline

The system SHALL correlate visual fatigue metrics with learning events via sessionId and support extended biometric fields.

#### Scenario: SessionId correlation

- **WHEN** frontend sends visual fatigue metrics with sessionId
- **AND** AMAS processes learning event with same sessionId
- **THEN** visual fatigue score SHALL be available in ProcessOptions
- **AND** correlation SHALL succeed within 30-second window

#### Scenario: Extended field persistence

- **WHEN** frontend sends extended fields (eyeAspectRatio, squintIntensity, etc.)
- **THEN** fields SHALL be persisted in visual_fatigue_records table
- **AND** TFM visual load calculation SHALL use available fields

#### Scenario: Graceful degradation without extended fields

- **WHEN** extended visual fields are not available
- **THEN** TFM SHALL use core fields only (perclos, blinkRate, yawnCount)
- **AND** visual load SHALL be computed with reduced accuracy (not fail)

### Requirement: Quit Event Detection

The system SHALL detect user quit events for mental fatigue and motivation modeling.

#### API Extension

`ProcessEventRequest` SHALL be extended with `is_quit` field:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEventRequest {
    // ... existing fields ...

    /// Explicit quit signal from frontend (user closed session, navigated away)
    #[serde(default)]
    pub is_quit: bool,
}
```

Route layer SHALL compute `is_quit` and pass to engine:

1. If `request.is_quit == true` → pass `is_quit = true`
2. Else if timeout inference triggers → pass `is_quit = true`
3. Else → pass `is_quit = false`

#### Timeout Inference

```rust
const QUIT_TIMEOUT_MS: i64 = 30 * 60 * 1000;  // 30 minutes

fn infer_quit(current_ts: i64, last_event_ts: Option<i64>, session_id: &str) -> bool {
    if let Some(last_ts) = last_event_ts {
        let idle_ms = current_ts - last_ts;
        if idle_ms > QUIT_TIMEOUT_MS {
            return true;  // implicit quit detected
        }
    }
    false
}
```

#### Frustration Signal (Complementary, Not Quit)

Frustration signal is computed separately and does NOT set `is_quit`:

```rust
fn compute_frustration_signal(consecutive_failures: u32, motivation: f64) -> f64 {
    // Used by TFM for mental load, but doesn't trigger is_quit
    if consecutive_failures >= 5 && motivation < -0.5 {
        1.0  // high frustration
    } else {
        clamp((consecutive_failures as f64 / 5.0) * (1.0 - (motivation + 1.0) / 2.0), 0.0, 1.0)
    }
}
```

#### Scenario: Explicit quit event

- **WHEN** frontend sends explicit quit event
- **THEN** engine SHALL pass is_quit=true to MDS and TFM
- **AND** mental fatigue and motivation SHALL be penalized

#### Scenario: Session timeout detection

- **WHEN** no events received for >30 minutes in active session
- **THEN** next event SHALL trigger implicit quit detection
- **AND** is_quit=true SHALL be inferred

#### Scenario: Frustration signal detection

- **WHEN** user has 5+ consecutive failures
- **AND** motivation is below -0.5
- **THEN** quit behavior SHALL be inferred
- **AND** mental fatigue SHALL increase accordingly

### Requirement: Matrix Persistence for Cognitive State

The system SHALL persist covariance matrices for BCP algorithm state recovery.

#### Scenario: Covariance matrix serialization

- **WHEN** BCP updates covariance matrix Σ
- **AND** state is saved to database
- **THEN** 3×3 matrix SHALL be serialized as JSON array
- **AND** round-trip deserialization SHALL recover identical matrix

#### Scenario: Backward compatible loading

- **WHEN** loading user state without covariance matrix
- **THEN** BCP SHALL initialize with default high-uncertainty matrix
- **AND** baseline CognitiveProfiler behavior SHALL be unaffected
