## ADDED Requirements

### Requirement: Information Gain Exploration (IGE)

The system SHALL implement IGE (Information Gain Exploration) as an original alternative to Thompson Sampling for strategy exploration.

IGE SHALL use deterministic selection based on expected reward plus information gain, without random sampling from probability distributions.

#### Constraint: Fixed Parameters

| Parameter      | Value | Description                            |
| -------------- | ----- | -------------------------------------- |
| β              | 1.0   | Exploration coefficient                |
| n0             | 1     | Prior pseudo-count                     |
| μ0             | 0.5   | Prior mean                             |
| σ0²            | 0.25  | Prior variance                         |
| ess_k          | 5     | Effective sample size constant         |
| min_confidence | 0.4   | Minimum confidence output              |
| max_confidence | 0.98  | Maximum confidence output              |
| context_weight | 0.7   | Weight for context-specific statistics |

#### Constraint: Statistics Architecture

IGE SHALL maintain two-layer statistics:

1. **Global statistics**: Per-strategy across all contexts
2. **Context statistics**: Per-strategy per-context (context signature from attention/fatigue/motivation/cognitive/time_pref)

Blending formula:

```
E[r]_blended = (1 - context_weight) × E[r]_global + context_weight × E[r]_context
Var[r]_blended = (1 - context_weight) × Var[r]_global + context_weight × Var[r]_context
```

#### Constraint: Tie-Breaking Rule

When multiple strategies have identical Score, select the one with lexicographically smallest strategy key.

#### Scenario: Select strategy by information gain score

- **WHEN** IGE has candidates [Strategy_A, Strategy_B] with statistics
- **AND** Strategy_A has E[r]=0.7, Var[r]=0.1, count=10
- **AND** Strategy_B has E[r]=0.5, Var[r]=0.3, count=2
- **THEN** IG(A) = 0.1 / (10 + 1 + 1) = 0.00833
- **AND** IG(B) = 0.3 / (2 + 1 + 1) = 0.075
- **AND** Score(A) = 0.7 + 1.0 × 0.00833 = 0.70833
- **AND** Score(B) = 0.5 + 1.0 × 0.075 = 0.575
- **AND** Strategy_A SHALL be selected (highest Score)

#### Scenario: Cold start with prior

- **WHEN** a strategy has count=0 (never used)
- **THEN** E[r] = (0 + n0 × μ0) / (0 + n0) = 0.5
- **AND** E[r²] = (0 + n0 × (μ0² + σ0²)) / (0 + n0) = 0.5
- **AND** Var[r] = max(0, 0.5 - 0.25) = 0.25
- **AND** IG = 0.25 / (0 + 1 + 1) = 0.125

#### Scenario: Update statistics after interaction

- **WHEN** user interaction produces reward r = 0.6 ∈ [-1, 1]
- **THEN** r01 = (0.6 + 1) / 2 = 0.8
- **AND** sum_reward += 0.8
- **AND** sum_sq_reward += 0.64
- **AND** count += 1

#### Constraint: Confidence Formula

```
n_eff = count + n0
conf_raw = n_eff / (n_eff + ess_k)
confidence = min_confidence + (max_confidence - min_confidence) × conf_raw
```

Example: count=10 → n_eff=11 → conf_raw=11/16=0.6875 → confidence=0.4 + 0.58×0.6875=0.799

### Requirement: Similarity-Weighted Decision (SWD)

The system SHALL implement SWD (Similarity-Weighted Decision) as an original alternative to LinUCB for contextual strategy selection.

SWD SHALL use cosine similarity weighted approach without learning global linear parameters.

#### Constraint: Fixed Parameters

| Parameter   | Value | Description                 |
| ----------- | ----- | --------------------------- |
| γ           | 0.5   | Exploration coefficient     |
| k           | 5.0   | Evidence smoothing constant |
| max_history | 200   | Maximum history records     |
| ε           | 1e-6  | Epsilon for norm protection |

#### Constraint: History Management

- FIFO eviction when history exceeds max_history
- Each record stores: (context_vector, strategy_key, reward, timestamp)

#### Constraint: Tie-Breaking Rule

When multiple strategies have identical Score, select the one with lexicographically smallest strategy key.

#### Constraint: Zero Vector Handling

If ||a|| × ||b|| < ε, similarity defaults to 0.0.

#### Constraint: Reward Normalization

Stored rewards are normalized to [0, 1] via: r01 = (r + 1) / 2

#### Scenario: Predict reward by similarity weighting

- **WHEN** current context vector c is compared against history records
- **AND** each record has (context_i, strategy_key_i, reward_i)
- **THEN** for each candidate strategy s:
  - sim_pos(c, c_i) = max(0, (c · c_i) / (||c|| × ||c_i|| + ε))
  - r_pred(s) = Σ(sim_pos × r_i) / (Σ(sim_pos) + ε) for matching records
- **AND** strategy with highest Score(s) = r_pred(s) + γ × (1 - conf(s)) SHALL be selected

#### Scenario: Compute evidence-based confidence

- **WHEN** SWD computes confidence for strategy s
- **THEN** evidence(s) = Σ(sim_pos(c, c_i)) for matching strategy records
- **AND** conf(s) = evidence(s) / (evidence(s) + k)
- **AND** conf(s) ∈ [0, 1)

#### Scenario: Handle empty history

- **WHEN** SWD has no history records for a strategy
- **THEN** r_pred SHALL default to 0.5
- **AND** conf SHALL be 0.0 (maximum exploration)

### Requirement: UMM Decision Layer Integration

The system SHALL integrate IGE and SWD as candidate sources in EnsembleDecision alongside Thompson and LinUCB.

#### Constraint: Feature Flag Gating

- When `umm_ige_enabled=true`: IGE candidate added to ensemble
- When `umm_swd_enabled=true`: SWD candidate added to ensemble
- Flags are independent; no global umm_enabled required

#### Scenario: Provide IGE as ensemble candidate

- **WHEN** feature flag `umm_ige_enabled` is true
- **AND** IGE selects a strategy with confidence=0.75
- **THEN** DecisionCandidate { source: "ige", strategy, confidence: 0.75, weight: TBD } SHALL be added

#### Scenario: Provide SWD as ensemble candidate

- **WHEN** feature flag `umm_swd_enabled` is true
- **AND** SWD selects a strategy with confidence=0.6
- **THEN** DecisionCandidate { source: "swd", strategy, confidence: 0.6, weight: TBD } SHALL be added

### Property-Based Testing Properties

#### PBT: IGE Determinism

- **INVARIANT**: For fixed stats and candidates, selection is deterministic; ties resolve lexicographically
- **FALSIFICATION**: Generate candidates with identical (E[r], Var[r], count); randomize iteration order

#### PBT: IGE Update Commutativity

- **INVARIANT**: Applying the same multiset of rewards in any order yields identical final stats
- **FALSIFICATION**: Generate reward sequences, permute them, compare end state

#### PBT: IGE Score Bounds

- **INVARIANT**: With r01 ∈ [0,1], E[r] ∈ [0,1], Var[r] ≥ 0, IG ≥ 0, so Score ≥ E[r]
- **FALSIFICATION**: Generate corner cases count=0; try to induce negative Var

#### PBT: IGE Confidence Bounds

- **INVARIANT**: confidence ∈ [0.4, 0.98] and is non-decreasing in count
- **FALSIFICATION**: Generate counts from 0..N; verify monotonicity

#### PBT: SWD No NaN

- **INVARIANT**: similarity, r_pred, conf, Score are finite even with zero vectors
- **FALSIFICATION**: Generate all-zeros, huge magnitudes; empty history

#### PBT: SWD Confidence Bounds

- **INVARIANT**: conf(s) ∈ [0, 1) and is monotone in evidence
- **FALSIFICATION**: Construct records with controlled evidence sums (0, tiny, huge)

#### PBT: SWD Prediction Convexity

- **INVARIANT**: If all stored rewards for strategy s are in [a, b], then r_pred(s) ∈ [a, b]
- **FALSIFICATION**: Generate per-strategy histories with known min/max; near-zero denominators

#### PBT: SWD FIFO Enforcement

- **INVARIANT**: After > 200 updates, length is 200 and oldest entries are evicted
- **FALSIFICATION**: Push numbered sequence; verify membership equals last 200
