## ADDED Requirements

### Requirement: Morphological Transfer Propagation (MTP)

The system SHALL implement MTP (Morphological Transfer Propagation) to provide bonus for words containing mastered morphemes.

MTP SHALL query `morphemes`, `word_morphemes`, and `user_morpheme_states` tables to compute transfer bonus.

MTP SHALL update `user_morpheme_states` after each review.

#### Constraint: Fixed Parameters

| Parameter        | Value | Description                             |
| ---------------- | ----- | --------------------------------------- |
| α                | 0.1   | Transfer coefficient                    |
| max_bonus        | 0.30  | Maximum bonus cap                       |
| masteryLevel_max | 5     | Maximum mastery level for normalization |

#### Constraint: Coverage Normalization

```
coverage(m, w) = word_morphemes.weight / Σ(word_morphemes.weight for all morphemes of w)
```

If Σ(weights) = 0, coverage defaults to 1/N where N = number of morphemes.

#### Scenario: Compute transfer bonus from morpheme mastery

- **WHEN** word w contains morphemes [m1, m2] with user mastery levels
- **AND** m1 has masteryLevel=4, coverage=0.6
- **AND** m2 has masteryLevel=2, coverage=0.4
- **THEN** mastery_norm(m1) = min(4/5, 1.0) = 0.8
- **AND** mastery_norm(m2) = min(2/5, 1.0) = 0.4
- **AND** bonus_mtp = α × (0.8×0.6 + 0.4×0.4) = 0.1 × 0.64 = 0.064
- **AND** bonus_mtp SHALL be clamped to [0, 0.30]

#### Scenario: Handle word with no morphemes

- **WHEN** word w has no entries in word_morphemes table
- **THEN** bonus_mtp SHALL return 0.0

#### Scenario: Handle new user with no morpheme exposure

- **WHEN** user has no entries in user_morpheme_states for word's morphemes
- **THEN** mastery_norm SHALL default to 0.0 for those morphemes

#### Constraint: Morpheme State Update

After each review of a word containing morphemes:

```
exposureCount += 1
if is_correct:
    correctCount += 1
masteryLevel = compute_mastery(correctCount, exposureCount)
```

### Requirement: Interference Attenuation by Distance (IAD)

The system SHALL implement IAD (Interference Attenuation by Distance) to penalize words that have confusable words in recent learning history.

IAD SHALL query `confusion_pairs_cache` table to identify confusable word pairs.

#### Constraint: Fixed Parameters

| Parameter    | Value | Description                         |
| ------------ | ----- | ----------------------------------- |
| max_penalty  | 0.50  | Maximum penalty cap                 |
| window_size  | 20    | Recent words from current session   |
| max_distance | 1.0   | Maximum distance for linear mapping |

#### Constraint: Learning History Window

- H is restricted to current session cache only
- Maximum 20 most recent items
- No database query required; maintained in session state

#### Constraint: Distance-to-Weight Linear Mapping

```
confusable_weight(w, w_i) = clamp(1 - distance / max_distance, 0, 1)
```

Where distance is from `confusion_pairs_cache.distance`.

#### Constraint: Bidirectional Lookup

Lookup checks both (word_a, word_b) and (word_b, word_a) in confusion_pairs_cache.

#### Scenario: Compute interference penalty from recent confusables

- **WHEN** word w has confusable words [w1, w2] in confusion_pairs_cache
- **AND** w1 is at lag=0 (most recent) with distance=0.3
- **AND** w2 is at lag=5 with distance=0.6
- **THEN** weight(w1) = 1 - 0.3 = 0.7
- **AND** weight(w2) = 1 - 0.6 = 0.4
- **AND** penalty_iad = (1/(0+1))×0.7 + (1/(5+1))×0.4 = 0.7 + 0.067 = 0.767
- **AND** penalty_iad = clamp(0.767, 0, 0.50) = 0.50

#### Scenario: Handle word with no confusables

- **WHEN** word w has no entries in confusion_pairs_cache
- **THEN** penalty_iad SHALL return 0.0

#### Scenario: Handle empty learning history

- **WHEN** learning history H is empty
- **THEN** penalty_iad SHALL return 0.0

### Requirement: Encoding Variability Metric (EVM)

The system SHALL implement EVM (Encoding Variability Metric) to provide bonus for words studied in diverse contexts.

EVM SHALL derive context from RawEvent fields and store in dedicated `context_history` table.

#### Constraint: Fixed Parameters

| Parameter   | Value | Description                      |
| ----------- | ----- | -------------------------------- |
| β           | 0.15  | Diversity coefficient            |
| max_bonus   | 0.15  | Maximum bonus cap                |
| max_history | 50    | Maximum context records per word |

#### Constraint: Context Dimensions

| Dimension     | Source                     | Values                |
| ------------- | -------------------------- | --------------------- |
| hour_of_day   | RawEvent.timestamp         | 0-23                  |
| day_of_week   | RawEvent.timestamp         | 0-6                   |
| question_type | RawEvent.question_type     | canonical mapping     |
| device_type   | Frontend report (required) | mobile/tablet/desktop |

#### Constraint: Device Type Requirement

Frontend MUST report device_type for every learning event. No fallback for missing values.

**Detection Logic**:

- `mobile`: screen width < 768px OR UA contains "Mobile"/"Android"/"iPhone"
- `tablet`: 768px ≤ screen width < 1024px OR UA contains "iPad"/"Tablet"
- `desktop`: all other cases

**API Fields**:

- `POST /api/learning/events` → add `device_type: string`
- `POST /api/words/review` → add `device_type: string`

**Backend**:

- `RawEvent` struct → add `device_type: Option<String>`
- Write to `context_history.device_type` on event processing

#### Constraint: Context History Storage

New table `context_history`:

```sql
CREATE TABLE context_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    word_id BIGINT NOT NULL,
    hour_of_day SMALLINT NOT NULL,
    day_of_week SMALLINT NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    device_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (word_id) REFERENCES words(id)
);
CREATE INDEX idx_context_history_user_word ON context_history(user_id, word_id);
```

#### Constraint: Question Type Canonical Mapping

| Raw Value        | Category      |
| ---------------- | ------------- |
| null/unknown     | "unknown"     |
| "meaning_choice" | "recognition" |
| "spelling"       | "production"  |
| "definition"     | "production"  |
| "audio"          | "listening"   |
| other            | "other"       |

#### Scenario: Compute diversity bonus from context history

- **WHEN** word w has been studied in 10 contexts
- **AND** unique hours = 5, unique days = 3, unique types = 2, unique devices = 1
- **THEN** diversity_hour = 5/10 = 0.5
- **AND** diversity_day = 3/10 = 0.3
- **AND** diversity_type = 2/10 = 0.2
- **AND** diversity_device = 1/10 = 0.1
- **AND** diversity = mean(0.5, 0.3, 0.2, 0.1) = 0.275
- **AND** bonus_evm = min(0.15 × 0.275, 0.15) = 0.041

#### Scenario: Handle word with single context

- **WHEN** word w has only 1 context record
- **THEN** diversity = 0.0 (all dimensions = 1/1, but variation requires n≥2)
- **AND** bonus_evm SHALL return 0.0

#### Scenario: Handle word with no context history

- **WHEN** word w has no context history recorded
- **THEN** bonus_evm SHALL return 0.0

### Requirement: Unified Retrievability Formula

The system SHALL combine MDM, MTP, IAD, and EVM outputs using the unified formula.

#### Constraint: Global Bounds

| Parameter         | Value |
| ----------------- | ----- |
| R_base_target_min | 0.05  |
| R_base_target_max | 0.97  |
| mult_min          | 0.5   |
| mult_max          | 2.0   |
| ε                 | 1e-6  |

#### Scenario: Compute final retrievability

- **WHEN** MDM provides R_base = 0.85
- **AND** MTP provides bonus_mtp = 0.15
- **AND** IAD provides penalty_iad = 0.20
- **AND** EVM provides bonus_evm = 0.05
- **THEN** mult_raw = (1 + 0.15) × (1 + 0.05) × (1 - 0.20) = 1.15 × 1.05 × 0.80 = 0.966
- **AND** mult = clamp(0.966, 0.5, 2.0) = 0.966
- **AND** R_final = clamp(0.85 × 0.966, 0, 1) = 0.821

#### Scenario: Compute adjusted review interval

- **WHEN** target retention R_target = 0.9 (personalized)
- **AND** multiplier mult = 0.966
- **THEN** R_base_target = clamp(0.9 / max(0.966, ε), 0.05, 0.97) = clamp(0.931, 0.05, 0.97) = 0.931
- **AND** interval_days = MDM.interval_for_target(R_base_target)

### Property-Based Testing Properties

#### PBT: MTP Bonus Bounds

- **INVARIANT**: bonus_mtp ∈ [0, 0.30] and equals 0 when word has no morphemes
- **FALSIFICATION**: Generate words with {0, 1, N} morphemes; pathological weights

#### PBT: MTP Commutativity

- **INVARIANT**: Permuting morpheme list does not change bonus_mtp
- **FALSIFICATION**: Shuffle morphemes/weights/mastery pairs; include duplicates

#### PBT: MTP Monotonicity

- **INVARIANT**: Increasing any masteryLevel cannot decrease bonus_mtp
- **FALSIFICATION**: Pick one morpheme and increase mastery; try clamp discontinuities

#### PBT: IAD Penalty Bounds

- **INVARIANT**: penalty_iad ∈ [0, 0.50] and equals 0 when H is empty or no confusables
- **FALSIFICATION**: Generate histories of length {0, 1, 20, >20}; fuzz distances

#### PBT: IAD Lag Monotonicity

- **INVARIANT**: Moving a confusable word one step older cannot increase total penalty
- **FALSIFICATION**: Take fixed multiset of confusables and swap positions

#### PBT: IAD Distance Mapping Bounds

- **INVARIANT**: weight ∈ [0, 1] and decreases as distance increases
- **FALSIFICATION**: Generate distances below 0, above 1, and around thresholds

#### PBT: EVM Bonus Bounds

- **INVARIANT**: bonus_evm ∈ [0, 0.15] and is 0 for < 2 contexts
- **FALSIFICATION**: Generate context histories of sizes {0, 1, 2, large}

#### PBT: EVM Permutation Invariance

- **INVARIANT**: Shuffling contexts does not change diversity
- **FALSIFICATION**: Shuffle contexts; generate repeated identical contexts

#### PBT: EVM Duplicate Sensitivity

- **INVARIANT**: Appending an already-seen context cannot increase diversity
- **FALSIFICATION**: Start from unique contexts, append duplicates in adversarial ratios

#### PBT: Unified Formula Bounds

- **INVARIANT**: mult ∈ [0.5, 2.0], R_base_target ∈ [0.05, 0.97], R_final ∈ [0, 1]
- **FALSIFICATION**: Fuzz bonuses/penalty at and beyond limits

#### PBT: Unified Formula Identity

- **INVARIANT**: If bonus_mtp=0, bonus_evm=0, penalty_iad=0, then R_final == R_base
- **FALSIFICATION**: Randomize R_base including extreme floats
