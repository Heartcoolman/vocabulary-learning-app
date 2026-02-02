# amas-persistence Specification

## Purpose

TBD - created by archiving change add-amas-original-algorithms. Update Purpose after archive.

## Requirements

### Requirement: Covariance Matrix Storage

The persistence layer SHALL support storing and retrieving 3×3 covariance matrices as part of user cognitive state.

#### Storage Location

BCP covariance matrix SHALL be stored **within the `cognitive_profile` JSON field** in `amas_user_states` table:

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

#### Scenario: Matrix field in UserState

- **WHEN** user state is persisted
- **AND** BCP algorithm has updated covariance matrix
- **THEN** CognitiveProfile SHALL include serialized covariance matrix as `covariance` key
- **AND** matrix SHALL be a 3×3 nested JSON array

#### Scenario: Round-trip integrity

- **WHEN** covariance matrix `[[1.0, 0.1, 0.05], [0.1, 0.8, 0.02], [0.05, 0.02, 0.9]]` is saved
- **AND** state is loaded from database
- **THEN** loaded matrix SHALL equal original within f64 precision (epsilon < 1e-10)

#### Scenario: Default matrix on missing data

- **WHEN** loading state without covariance field
- **THEN** default matrix SHALL be `[[0.25, 0, 0], [0, 0.25, 0], [0, 0, 0.25]]` (medium uncertainty)
- **AND** this matches BCP Σ_initial configuration

### Requirement: Algorithm Internal States Storage

The persistence layer SHALL support storing internal state for TFM, ADF, MTD algorithms.

#### Storage Location

A new `algorithm_internal_states` JSON column SHALL be added to `amas_user_states`:

```json
{
  "tfm_pools": {
    "cognitive": { "fast": 0.2, "slow": 0.1 },
    "visual": { "fast": 0.15, "slow": 0.05 },
    "mental": { "fast": 0.3, "slow": 0.2 }
  },
  "tfm_last_event_ts": 1706745600000,
  "tfm_consecutive_failures": 2,
  "tfm_session_baseline_rt": 1500,
  "adf_prev_observation": 0.65,
  "adf_prev_attention": 0.72,
  "mtd_s_high": 0.5,
  "mtd_s_low": 0.2,
  "mtd_baseline_mu": 0.65,
  "mtd_history": [0.62, 0.65, 0.68, 0.64, 0.67]
}
```

#### Scenario: State initialization on flag enable

- **WHEN** user has existing state AND algorithm flag is newly enabled
- **THEN** algorithm internal state SHALL be initialized to defaults
- **AND** existing scalar values (fatigue, attention, trend) SHALL be preserved for baseline comparison

### Requirement: AIR User State Storage

The persistence layer SHALL support storing AIR-specific user state.

#### New Columns in amas_user_states

```sql
ALTER TABLE amas_user_states ADD COLUMN ability_theta REAL DEFAULT 0.0;
ALTER TABLE amas_user_states ADD COLUMN air_response_count INTEGER DEFAULT 0;
ALTER TABLE amas_user_states ADD COLUMN fisher_info_sum REAL DEFAULT 0.0;
```

### Requirement: IRT Parameter Storage

The persistence layer SHALL support storing item response theory parameters (discrimination α, difficulty β) for words.

#### New Columns in words Table

```sql
ALTER TABLE words ADD COLUMN item_discrimination REAL DEFAULT 1.0;
ALTER TABLE words ADD COLUMN item_difficulty REAL;  -- NULL = derive from difficultyElo
```

#### Scenario: Word IRT parameters

- **WHEN** AIR algorithm updates word parameters
- **THEN** `item_discrimination` (α) and `item_difficulty` (β) SHALL be persisted to words table
- **AND** parameters SHALL be retrievable for subsequent probability calculations

#### Scenario: Migration from Elo

- **WHEN** word has Elo difficulty but no IRT parameters (item_difficulty IS NULL)
- **THEN** β SHALL be computed at runtime: `β = clamp((difficultyElo - 1200) / 400, -3.0, 3.0)`
- **AND** α SHALL use default 1.0 from item_discrimination column

### Requirement: Extended Visual Fatigue Fields

The persistence layer SHALL store extended visual fatigue biometric fields when available.

#### Scenario: Extended field columns

- **WHEN** visual fatigue metrics include extended fields
- **THEN** `eye_aspect_ratio`, `avg_blink_duration`, `head_stability`, `squint_intensity`, `gaze_off_screen_ratio` SHALL be persisted
- **AND** fields SHALL be nullable (optional)

#### Scenario: Query with extended fields

- **WHEN** querying visual fatigue for TFM calculation
- **THEN** all available extended fields SHALL be returned
- **AND** missing fields SHALL return NULL (not default values)

### Requirement: Algorithm State Snapshots

The persistence layer SHALL support versioned snapshots of algorithm-specific state for debugging and rollback.

#### Scenario: State snapshot creation

- **WHEN** user state changes significantly (algorithm switch, major update)
- **THEN** snapshot SHALL be created with timestamp and version
- **AND** previous state SHALL be recoverable

#### Scenario: Snapshot retention

- **WHEN** snapshots exceed retention limit (default: 10 per user)
- **THEN** oldest snapshots SHALL be pruned
- **AND** most recent snapshots SHALL be preserved
