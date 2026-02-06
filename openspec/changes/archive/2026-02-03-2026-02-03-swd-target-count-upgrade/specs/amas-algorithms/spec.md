# amas-algorithms Delta

## ADDED Requirements

### Requirement: SWD Target Count Recommendation

The SWD (Similarity-Weighted Decision) model SHALL provide target word count recommendations based on historical learning performance.

#### Configuration Parameters

| Parameter              | Value | Description                                |
| ---------------------- | ----- | ------------------------------------------ |
| `CONFIDENCE_THRESHOLD` | 0.5   | Minimum confidence to apply recommendation |
| `MIN_DYNAMIC_CAP`      | 20    | Minimum dynamic cap value                  |

#### Data Structure

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwdRecommendation {
    /// SWD recommended additional word count (>= 0, no upper limit)
    pub recommended_count: i32,
    /// Recommendation confidence (0.0-1.0)
    pub confidence: f64,
}
```

#### Scenario: Basic recommendation calculation

- **GIVEN** user has learning history with average reward 0.7
- **WHEN** SWD calculates recommendation
- **THEN** recommended_count SHALL be `round(0.7 * 10) = 7`
- **AND** confidence SHALL be derived from weight_total / history_length

#### Scenario: Cold start returns None

- **GIVEN** user has no learning history
- **WHEN** SWD calculates recommendation
- **THEN** result SHALL be `None`
- **AND** user_setting SHALL be used without modification

#### Scenario: Low confidence filtering

- **GIVEN** SWD recommendation has confidence 0.3
- **WHEN** target count is computed
- **THEN** recommendation SHALL be ignored
- **AND** result SHALL equal user_setting

#### PBT Properties

- **[INV-SWD-REC-NONNEG]** ∀ recommendations: `recommended_count >= 0`
- **[INV-SWD-CONF-RANGE]** ∀ recommendations: `confidence ∈ [0.0, 1.0]`
- **[INV-SWD-COLD-START]** ∀ empty history: `recommend_additional_count() == None`

### Requirement: Dynamic Cap Calculation

The system SHALL compute a dynamic word count cap based on user learning state, with no fixed base value.

#### Input Variables

| Variable     | Source                                       | Range       | Description           |
| ------------ | -------------------------------------------- | ----------- | --------------------- |
| `attention`  | `UserState.attention`                        | [0.0, 1.0]  | User attention level  |
| `fatigue`    | `UserState.fused_fatigue.unwrap_or(fatigue)` | [0.0, 1.0]  | Fused fatigue signal  |
| `motivation` | `UserState.motivation`                       | [-1.0, 1.0] | User motivation level |
| `stability`  | `UserState.cognitive.stability`              | [0.0, 1.0]  | Cognitive stability   |
| `speed`      | `UserState.cognitive.speed`                  | [0.0, 1.0]  | Cognitive speed       |

#### Algorithm

```rust
fn compute_dynamic_cap(user_state: &UserState) -> i32 {
    const MIN_CAP: i32 = 20;
    const MAX_ADDITIONAL: f64 = 80.0;

    let effective_fatigue = user_state.fused_fatigue.unwrap_or(user_state.fatigue);
    let normalized_motivation = (user_state.motivation + 1.0) / 2.0;

    let base_capacity =
        user_state.attention * 0.35
        + normalized_motivation * 0.30
        + user_state.cognitive.stability * 0.20
        + user_state.cognitive.speed * 0.15;

    let fatigue_penalty = effective_fatigue * 0.5;
    let net_capacity = (base_capacity - fatigue_penalty).max(0.0);

    let cap = MIN_CAP as f64 + net_capacity * MAX_ADDITIONAL;
    cap.round() as i32
}
```

#### Scenario: Minimum cap guarantee

- **GIVEN** user state with fatigue=1.0, attention=0.0, motivation=-1.0
- **WHEN** dynamic cap is computed
- **THEN** result SHALL be exactly 20 (MIN_CAP)

#### Scenario: Optimal state cap

- **GIVEN** user state with fatigue=0.0, attention=1.0, motivation=1.0, stability=1.0, speed=1.0
- **WHEN** dynamic cap is computed
- **THEN** result SHALL be 100 (MIN_CAP + MAX_ADDITIONAL)

#### Scenario: Average state cap

- **GIVEN** user state with fatigue=0.0, attention=0.7, motivation=0.5, stability=0.5, speed=0.5
- **WHEN** dynamic cap is computed
- **THEN** result SHALL be approximately 72

#### PBT Properties

- **[INV-CAP-MIN]** ∀ state: `compute_dynamic_cap(state) >= 20`
- **[INV-CAP-FATIGUE-MONO]** ∀ state, f1 < f2: `cap(state{fatigue=f1}) >= cap(state{fatigue=f2})`
- **[INV-CAP-ATTENTION-MONO]** ∀ state, a1 < a2: `cap(state{attention=a1}) <= cap(state{attention=a2})`
- **[INV-CAP-IDEMPOTENT]** ∀ state: `compute_dynamic_cap(state) == compute_dynamic_cap(state)`

### Requirement: Target Count with SWD Integration

The system SHALL compute final target word count by integrating user setting with SWD recommendation under dynamic cap constraint.

#### Input Variables

| Variable             | Source                                  | Description                               |
| -------------------- | --------------------------------------- | ----------------------------------------- |
| `user_target`        | `daily_word_count` from user settings   | User configured daily word count (10-100) |
| `swd_recommendation` | `SwdModel.recommend_additional_count()` | Optional SWD recommendation               |
| `dynamic_cap`        | `compute_dynamic_cap()`                 | State-based dynamic cap                   |

#### Rules

1. **No recommendation**: If `swd_recommendation` is `None`, return `user_target`
2. **Low confidence**: If `confidence < 0.5`, return `user_target`
3. **User priority**: If `user_target > dynamic_cap`, return `user_target` (ignore SWD)
4. **Normal case**: Return `min(user_target + recommended_count, dynamic_cap)`

#### Scenario: Basic SWD addition

- **GIVEN** user_target=15, swd_recommendation={count=5, confidence=0.8}, dynamic_cap=30
- **WHEN** target is computed
- **THEN** result SHALL be 20 (15 + 5)

#### Scenario: Cap constraint applied

- **GIVEN** user_target=15, swd_recommendation={count=10, confidence=0.8}, dynamic_cap=20
- **WHEN** target is computed
- **THEN** result SHALL be 20 (capped)

#### Scenario: User priority override

- **GIVEN** user_target=25, swd_recommendation={count=5, confidence=0.9}, dynamic_cap=20
- **WHEN** target is computed
- **THEN** result SHALL be 25 (user setting preserved)

#### Scenario: Confidence threshold filtering

- **GIVEN** user_target=15, swd_recommendation={count=5, confidence=0.3}, dynamic_cap=30
- **WHEN** target is computed
- **THEN** result SHALL be 15 (low confidence ignored)

#### PBT Properties

- **[INV-TARGET-USER-PRIORITY]** ∀ user_target > cap: `result == user_target`
- **[INV-TARGET-CAP-BOUND]** ∀ user_target <= cap: `result <= cap`
- **[INV-TARGET-CONF-FILTER]** ∀ confidence < 0.5: `result == user_target`
- **[INV-TARGET-IDEMPOTENT]** ∀ inputs: `f(inputs) == f(inputs)`
- **[INV-TARGET-NO-REC]** ∀ None recommendation: `result == user_target`
