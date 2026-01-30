## ADDED Requirements

### Requirement: AMAS State Persistence Transaction Support

AMAS状态持久化操作 SHALL 在数据库事务中执行，确保原子性。

#### Constraint: Transaction Boundary

事务边界 SHALL 包裹 `save_state` 中的**全部操作**（包括读和写），具体包括：

- `upsert_amas_user_state` (写)
- `insert_amas_user_model` for bandit (写)
- `insert_amas_user_model` for coldstart (写)
- `save_strategy_snapshot` 中的 `get_amas_user_model` (读) 和 `insert_amas_user_model` (写)
- `insert_amas_user_model` for interaction_count (写)

#### Scenario: Successful state save

- **WHEN** `AMASPersistence::save_state` is called with valid state
- **THEN** all database operations (user_state, bandit_model, coldstart, strategy, interaction_count) SHALL be committed atomically

#### Scenario: Partial failure rollback

- **WHEN** any database operation in `save_state` fails
- **THEN** all previously executed operations in the same save SHALL be rolled back
- **AND** an error SHALL be returned to the caller

### Requirement: Mastery History Persistence

用户的掌握度历史记录 SHALL 被正确持久化和加载。

#### Constraint: Data Source

`mastery_history` SHALL 直接从 `PersistedAMASState.mastery_history` 获取，不通过 `user_state_to_row` 方法传递。

#### Scenario: Save mastery history

- **WHEN** `save_state` is called with a state containing `mastery_history`
- **THEN** the `mastery_history` field SHALL be serialized to JSON and stored in `amas_user_states.masteryHistory` column
- **AND** serialization SHALL use `serde_json::to_value`

#### Scenario: Load mastery history

- **WHEN** `load_state` is called for a user with existing mastery history
- **THEN** the `mastery_history` field SHALL be deserialized from the database and included in `PersistedAMASState`

### Requirement: Ensemble Performance Persistence

用户的集成算法性能追踪数据 SHALL 被正确持久化和加载。

#### Scenario: Save ensemble performance

- **WHEN** `save_state` is called with a state containing `ensemble_performance`
- **THEN** the `ensemble_performance` field SHALL be serialized to JSON and stored in `amas_user_states.ensemblePerformance` column

#### Scenario: Load ensemble performance

- **WHEN** `load_state` is called for a user with existing ensemble performance data
- **THEN** the `ensemble_performance` field SHALL be deserialized from the database

### Requirement: Accurate Timestamp Preservation

状态加载时 SHALL 使用数据库中的实际更新时间。

#### Constraint: Fallback Behavior

- 时间戳格式 SHALL 为 RFC3339
- 解析失败时 SHALL 回退到 `Utc::now()` 并记录警告日志（使用 `tracing::warn!`）
- 回退行为 SHALL NOT 阻止状态加载流程

#### Scenario: Load state with correct timestamp

- **WHEN** `load_state` is called for a user with existing state
- **THEN** `PersistedAMASState.last_updated` SHALL equal the `updatedAt` value from the database
- **AND** the current system time SHALL NOT be used to override this value

#### Scenario: Timestamp parse failure

- **WHEN** `load_state` encounters a malformed `updatedAt` value
- **THEN** a warning log SHALL be emitted with the malformed value
- **AND** `last_updated` SHALL fall back to `Utc::now().timestamp_millis()`

## MODIFIED Requirements

### Requirement: AMAS State Serialization

用户状态序列化 SHALL 包含所有可恢复字段。

#### Scenario: Complete field mapping

- **WHEN** `user_state_to_row` is called
- **THEN** the following fields SHALL be correctly mapped:
  - `attention`, `fatigue`, `motivation`, `confidence`
  - `cognitive_profile` (serialized as JSON)
  - `trend_state`
  - `visual_fatigue`, `fused_fatigue`
  - `mastery_history` (serialized as JSON, may be null)
  - `habit_samples` (serialized as JSON, may be null)

#### Scenario: Null-safe serialization

- **WHEN** optional fields (`mastery_history`, `habit_samples`) are None
- **THEN** the corresponding database columns SHALL be set to NULL
- **AND** no serialization error SHALL occur

---

## Property-Based Testing (PBT) Properties

### PBT-1: State Round-Trip Invariant

**[INVARIANT]** For any valid `PersistedAMASState` S, the round-trip property holds:

```
let S' = load_state(user_id) after save_state(S)
S'.user_state.attention == S.user_state.attention
S'.user_state.fatigue == S.user_state.fatigue
S'.user_state.motivation == S.user_state.motivation
S'.user_state.cognitive == S.user_state.cognitive (within f64 tolerance)
S'.mastery_history == S.mastery_history (JSON deep equality)
S'.ensemble_performance == S.ensemble_performance (JSON deep equality, when Some)
```

**[FALSIFICATION STRATEGY]**:

- Generate random `PersistedAMASState` with:
  - Floats: 0.0, 0.5, 1.0, f64::MIN_POSITIVE, values near boundary
  - JSON arrays of varying sizes (0, 1, 100 elements)
  - Unicode strings in JSON values
- Assert all field equalities after save→load cycle

### PBT-2: Transaction Atomicity

**[INVARIANT]** After a failed `save_state` call, the database state is unchanged from before the call.

**[FALSIFICATION STRATEGY]**:

- Mock database to fail at different operation indices (1st, 2nd, 3rd, ... Nth operation)
- Before each test: snapshot relevant table counts and row hashes
- After failed save_state: assert snapshot equality
- Verify no partial writes exist

### PBT-3: Timestamp Monotonicity

**[INVARIANT]** For successive saves of the same user, `updatedAt` is strictly increasing:

```
save_state(S1) at t1; save_state(S2) at t2 where t2 > t1
load_state(user_id).last_updated at t2'
=> t2' >= t1' (where t1' was the previous last_updated)
```

**[FALSIFICATION STRATEGY]**:

- Rapid successive saves (no artificial delay)
- Assert `last_updated` never decreases between loads

### PBT-4: Null-Safety for Optional Fields

**[INVARIANT]** For any combination of None/Some for optional fields:

```
Optional fields: mastery_history, habit_samples, ensemble_performance
save_state(S with any combination of None/Some) succeeds
load_state returns matching None/Some values
```

**[FALSIFICATION STRATEGY]**:

- Generate all 8 combinations (2^3 for three optional fields)
- For each combination: save, load, assert field presence matches

### PBT-5: Idempotent Load

**[INVARIANT]** Multiple consecutive loads without intervening saves return identical results:

```
L1 = load_state(user_id)
L2 = load_state(user_id)
L1 == L2 (deep equality)
```

**[FALSIFICATION STRATEGY]**:

- Perform multiple loads in sequence
- Assert deep equality across all returned states
