## ADDED Requirements

### Requirement: Memory Dynamics Model (MDM)

The system SHALL implement MDM (Memory Dynamics Model) as an original alternative to FSRS for memory strength and forgetting curve calculation.

MDM SHALL use the strict differential equation solution: `dM/dt = -λ(M, C) × M` where λ(M, C) varies continuously with M(t), solved via Newton/Lambert W method.

#### Constraint: Fixed Parameters

| Parameter | Value | Description                     |
| --------- | ----- | ------------------------------- |
| λ_0       | 0.3   | Base decay rate                 |
| α         | 0.5   | Consolidation coefficient       |
| η         | 0.4   | Learning rate for M update      |
| M_max     | 10.0  | Maximum memory strength         |
| κ         | 0.2   | Consolidation learning rate     |
| μ         | 0.25  | Error penalty coefficient for C |

#### Constraint: State Bounds

- M ∈ [0.1, 10.0] — clamped after every update
- C ∈ [0.0, 1.0] — clamped after every update

#### Constraint: Persistence Semantics

- `umm_strength` stores M at the moment of last review (not decayed)
- `umm_consolidation` stores C at the moment of last review
- `umm_last_review_ts` stores the timestamp (ms) of last review
- Decay is computed on-demand when `retrievability()` is called

#### Constraint: New Word Initialization

- M = 1.0
- C = 0.1

#### Constraint: FSRS Migration Mapping (existing users)

- M = ln(stability + 1)
- C = 1 - difficulty / 10

#### Scenario: Calculate retrievability after elapsed time

- **WHEN** MDM is called with strength M=5.0, consolidation C=0.5, elapsed Δt=7 days
- **AND** λ_0=0.3, α=0.5
- **THEN** the system SHALL solve the implicit equation: `ln(M(t)) + αC×M(t) = ln(M_0) + αC×M_0 - λ_0×t`
- **AND** R_base = M(t) / M_0
- **AND** R_base SHALL be in range (0, 1]

#### Constraint: quality Mapping Formula

```
quality = clamp(0.5 + 0.3 × (1 - RT/RT_max) + 0.2 × (1 - hints/max_hints), 0, 1)
```

| Parameter | Value       |
| --------- | ----------- |
| RT_max    | 30 seconds  |
| max_hints | 3 (default) |

For incorrect answers: quality = 0.0

#### Scenario: Update memory after correct review

- **WHEN** user answers correctly with quality=0.8
- **AND** current M=3.0, C=0.4
- **THEN** ΔM = η × (1 - M/M_max) × quality = 0.4 × (1 - 3.0/10.0) × 0.8 = 0.224
- **AND** M_new = clamp(M + ΔM, 0.1, 10.0) = 3.224
- **AND** ΔC = κ × (1 - C) × quality = 0.2 × (1 - 0.4) × 0.8 = 0.096
- **AND** C_new = clamp(C + ΔC, 0, 1) = 0.496

#### Scenario: Update memory after incorrect review

- **WHEN** user answers incorrectly (quality=0.0)
- **AND** current M=3.0, C=0.4
- **THEN** M_new = clamp(M × 0.8, 0.1, 10.0) = 2.4 (decay factor = 1 - 0.2)
- **AND** C_new = clamp(C × (1 - μ), 0, 1) = C × 0.75 = 0.3

#### Scenario: Calculate optimal review interval

- **WHEN** target retention R_target=0.9 is specified
- **AND** multiplier mult=1.1 from MTP/IAD/EVM (clamped to [0.5, 2.0])
- **THEN** R_base_target = clamp(R_target / mult, 0.05, 0.97) = clamp(0.818, 0.05, 0.97) = 0.818
- **AND** interval_days = solve_inverse(M, C, R_base_target) using Newton/Lambert W

### Requirement: Multi-Scale Memory Trace (MSMT)

The system SHALL implement MSMT (Multi-Scale Memory Trace) as an original alternative to ACT-R Memory for recall probability estimation.

#### Constraint: Fixed Parameters

| Parameter        | Value           | Description                               |
| ---------------- | --------------- | ----------------------------------------- |
| τ                | [1h, 24h, 168h] | Time constants for short/medium/long-term |
| w                | [0.5, 0.3, 0.2] | Weights for each scale                    |
| gain             | [1.0, 0.5, 0.2] | Gain per scale                            |
| correct_weight   | 1.0             | Weight for correct reviews                |
| incorrect_weight | 0.2             | Weight for incorrect reviews              |
| threshold        | 0.3             | Sigmoid threshold                         |
| slope            | 1.5             | Sigmoid slope                             |
| max_history      | 100             | Maximum history entries                   |

#### Constraint: Fusion Weight

```
final_recall = 0.6 × cognitive.mem + 0.4 × msmt_recall
```

#### Scenario: Predict recall from review history

- **WHEN** MSMT receives review history with entries at [1h, 5h, 24h, 72h] ago
- **AND** each entry has is_correct=true
- **THEN** for each scale i:
  - trace_i = Σ_j (gain[i] × correct_weight × exp(-t_j_hours / τ[i]))
- **AND** activation = Σ(w[i] × trace[i])
- **AND** recall_probability = 1 / (1 + exp(-slope × (activation - threshold)))
- **AND** recall_probability SHALL be clamped to [0, 1]

#### Scenario: Handle empty review history

- **WHEN** MSMT receives empty word_review_history
- **THEN** recall_probability SHALL return 0.5 (neutral)

#### Scenario: Handle history exceeding max_history

- **WHEN** word_review_history contains > 100 entries
- **THEN** only the most recent 100 entries SHALL be used

### Requirement: R_target Personalization

The system SHALL personalize R_target per user based on dynamic burden balance.

#### Constraint: Personalization Formula

```
burden = 0.5 × (actual_review_count / target_review_count) + 0.5 × (actual_time / target_time)
R_target_adjusted = clamp(R_target × (1 + 0.1 × (1 - burden)), 0.75, 0.95)
```

| Parameter        | Value          |
| ---------------- | -------------- |
| Burden window    | 7 days sliding |
| R_target range   | [0.75, 0.95]   |
| Default R_target | 0.9            |

### Property-Based Testing Properties

#### PBT: MDM Retrievability Bounds

- **INVARIANT**: retrievability(Δt) ∈ (0, 1] for all valid M ∈ [0.1, 10], C ∈ [0, 1], Δt ≥ 0
- **FALSIFICATION**: Generate M, C at bounds; Δt spanning {0, tiny, huge}; include edge floats

#### PBT: MDM Monotonic Forgetting

- **INVARIANT**: For fixed M, C: if Δt2 > Δt1 then R_base(Δt2) ≤ R_base(Δt1)
- **FALSIFICATION**: Random pairs Δt1 < Δt2; concentrate near 0 and large values

#### PBT: MDM Stronger Memory Forgets Slower

- **INVARIANT**: For fixed Δt: R_base is non-decreasing in M and in C
- **FALSIFICATION**: Sample triples (M1 < M2, C, Δt); bias to C ≈ 0, M ≈ 0.1

#### PBT: MDM Update Preserves Bounds

- **INVARIANT**: After any update, M ∈ [0.1, 10] and C ∈ [0, 1]
- **FALSIFICATION**: Generate extreme RT (negative, > RT_max), hints > max_hints

#### PBT: MDM Round-trip

- **INVARIANT**: interval_for_target(R_base_target) implies retrievability(interval) ≈ R_base_target
- **FALSIFICATION**: Sample (M, C, R_base_target) across bounds; emphasize near {0.05, 0.97}

#### PBT: MSMT Permutation Invariance

- **INVARIANT**: Reordering history entries with same timestamps yields identical output
- **FALSIFICATION**: Shuffle histories repeatedly; include duplicate timestamps

#### PBT: MSMT Recency Monotonicity

- **INVARIANT**: Moving a correct event closer to "now" cannot decrease recall
- **FALSIFICATION**: Pick one event, decrease its seconds_ago; hold others fixed
