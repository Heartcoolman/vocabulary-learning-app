# Change: Learning Flow Algorithm Integration Audit

## Why

对整个学习流程进行全面审查，验证 UMM（统一记忆模型）、VARK（学习风格模型）、AMAS（自适应多智能体系统）等算法是否正确集成并能够端到端跑通。

## Audit Findings

### 1. 学习流程总览

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│   AMAS Engine       │
│   LearningPage  │     │   /api/amas/     │     │   process_event()   │
│   + WordCard    │     │   process        │     │                     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Interaction     │     │ Record Service   │     │ State Update        │
│ Tracker (VARK)  │     │ + Learning State │     │ + Decision Engine   │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

### 2. 算法状态总结

| 算法模块              | 状态        | 关键问题                                           |
| --------------------- | ----------- | -------------------------------------------------- |
| **AMAS Engine**       | ✅ 正常运行 | 状态更新、决策融合、持久化均正常                   |
| **UMM/MDM**           | ✅ 正常运行 | retrievability计算、strength/consolidation更新正常 |
| **MSMT**              | ✅ 正常运行 | 与cognitive profile混合(0.6/0.4)正常工作           |
| **MTP/IAD/EVM**       | ⚠️ 部分生效 | 依赖 context_history 表数据，该表无写入逻辑        |
| **IGE/SWD**           | ✅ 正常运行 | 替代 Thompson/LinUCB 决策算法                      |
| **VARK Model**        | ⚠️ 部分生效 | 仅 audioPlayCount 被追踪，其他字段未连接UI         |
| **Ensemble Decision** | ✅ 正常运行 | 多算法权重融合正常                                 |

---

## Critical Issues Found

### Issue 1: VARK 前端追踪未完全连接 (Severity: HIGH)

**问题描述**: `useInteractionTracker` hook 定义了完整的 VARK 追踪方法，但大部分未连接到 UI 组件。

**当前状态**:

- ✅ `trackAudioPlay()` - 已连接到 WordCard 的 `onAudioPlay`
- ❌ `trackImageView()` - 未连接（图片查看）
- ❌ `trackImageZoom()` - 未连接（图片缩放）
- ❌ `trackImageLongPressStart/End()` - 未连接（长按图片）
- ❌ `trackReadingStart/End()` - 未连接（阅读时长）
- ❌ `trackNote()` - 未连接（笔记写入）
- ❌ `trackAudioSpeedAdjust()` - 未连接（语速调节）

**影响**: VARK 学习风格模型收到的数据不完整，无法准确判断 Visual/Reading/Kinesthetic 偏好。

**代码位置**:

- `packages/frontend/src/pages/LearningPage.tsx:612` - 只连接了 `onAudioPlay`
- `packages/frontend/src/hooks/useInteractionTracker.ts` - 定义了完整方法

---

### Issue 2: context_history 表无写入逻辑 (Severity: MEDIUM)

**问题描述**: `context_history` 表已创建（migration 039），`load_context_history()` 函数从 `answer_records` 表查询数据而非 `context_history` 表。

**当前状态**:

- Migration 039 创建了 `context_history` 表
- 无任何 INSERT 操作写入该表
- `load_context_history()` 实际从 `answer_records` 查询
- `answer_records` 缺少 `deviceType` 列

**影响**: EVM（Encoding Variability Metric）deviceType 维度始终为 'unknown'，降低上下文变异性计算精度。

**代码位置**:

- `packages/backend-rust/src/routes/amas.rs:2223-2267` - load_context_history 查询 answer_records
- `packages/backend-rust/sql/039_add_umm_columns.sql:12-21` - context_history 表定义

---

### Issue 3: SQLite fallback schema 缺少 UMM/VARK 列 (Severity: MEDIUM)

**问题描述**: `sqlite_fallback_schema.sql` 未同步最新的 UMM 和 VARK 相关列。

**缺失的内容**:

- `word_learning_states` 表缺少: `ummStrength`, `ummConsolidation`, `ummLastReviewTs`
- `answer_records` 表缺少: VARK 交互字段 (imageViewCount, audioPlayCount 等)
- `user_interaction_stats` 表缺少: VARK 统计字段
- `context_history` 表: 完全缺失
- `umm_shadow_results` 表: 完全缺失

**影响**: 前端离线模式（使用 SQLite）无法使用 UMM/VARK 功能。

**代码位置**:

- `packages/backend-rust/sql/sqlite_fallback_schema.sql:181-207` - word_learning_states 定义

---

### Issue 4: umm_shadow_results 未被写入 (Severity: HIGH → 已升级)

**问题描述**: `umm_shadow_results` 表和 `ShadowResult` 结构已定义用于 UMM vs FSRS A/B 测试，但无代码实际写入。

**影响**: 无法收集 UMM 和 FSRS 预测对比数据进行算法效果评估。

**代码位置**:

- `packages/backend-rust/sql/040_add_umm_shadow_results.sql` - 表定义
- `packages/backend-rust/src/umm/engine.rs:100-155` - compute_shadow() 方法

---

### Issue 5: 部分 AMAS 状态未持久化 (Severity: HIGH → 已升级)

**问题描述**: 某些运行时状态在引擎重启后丢失。

**未持久化的状态**:

- `visual_fatigue` - 视觉疲劳度
- `fused_fatigue` - 融合疲劳度
- `mastery_history` - 掌握历史（注释提到会加载但无实际代码）
- `HabitSamples` - 习惯采样数据
- `EnsembleDecision.performance` - 算法性能追踪 EMA

**影响**: 引擎重启后需要重新积累这些状态，可能导致短期决策质量下降。

**代码位置**:

- `packages/backend-rust/src/amas/persistence.rs:72` - mastery_history 注释

---

## Constraints (Zero-Decision Plan)

### C1: VARK Tracking Constraints

| 追踪方法                | 实现状态  | 触发条件                                         |
| ----------------------- | --------- | ------------------------------------------------ |
| `trackAudioPlay`        | ✅ 已连接 | 点击发音按钮                                     |
| `trackReadingStart/End` | 🔧 待实现 | 卡片渲染后自动开始计时，提交答案或切换卡片时结束 |
| `trackImageView`        | ⏸️ 跳过   | 当前无图片 UI，字段保留但始终为 0                |
| `trackImageZoom`        | ⏸️ 跳过   | 当前无图片 UI，字段保留但始终为 0                |
| `trackImageLongPress`   | ⏸️ 跳过   | 当前无图片 UI，字段保留但始终为 0                |
| `trackNote`             | ⏸️ 跳过   | 当前无笔记 UI，字段保留但始终为 0                |
| `trackAudioSpeedAdjust` | ⏸️ 跳过   | 当前无语速控制 UI，字段保留但始终为 false        |

**Reading 追踪详细规则**:

- **开始**: 卡片组件 mount 后立即调用 `trackReadingStart('definition')`
- **结束**: 用户提交答案时在 `getData()` 中自动结束计时
- **数据**: `definitionReadMs` 累计阅读时间（毫秒）

### C2: deviceType Constraints

| 属性     | 值                                             |
| -------- | ---------------------------------------------- |
| 检测方法 | 服务端 User-Agent header 推断                  |
| 允许值   | `desktop` \| `tablet` \| `mobile` \| `unknown` |
| 存储位置 | `answer_records.deviceType` 列                 |
| 记录频率 | 每次答题记录一次                               |

**UA 解析规则**:

```
优先级: tablet > mobile > desktop > unknown
- 包含 "iPad" 或 "Tablet" → tablet
- 包含 "Mobile" 或 "Android" (非 Tablet) → mobile
- 包含 "Windows" 或 "Macintosh" 或 "Linux" (非 Android) → desktop
- 其他 → unknown
```

### C3: Data Storage Constraints

| 数据类型      | 存储目标                 | 写入时机                        |
| ------------- | ------------------------ | ------------------------------- |
| VARK 交互明细 | `answer_records`         | 每次答题后同步写入              |
| VARK 交互汇总 | `user_interaction_stats` | 每次答题后增量更新              |
| Shadow 结果   | `umm_shadow_results`     | 每次 `process_event` 后同步写入 |
| AMAS 状态     | `amas_user_states`       | 每次 `process_event` 后实时写入 |

### C4: AMAS State Persistence Constraints

| 状态字段                       | 持久化  | 存储表                    | 默认值 |
| ------------------------------ | ------- | ------------------------- | ------ |
| `visual_fatigue`               | ✅ 新增 | `amas_user_states`        | `0.0`  |
| `fused_fatigue`                | ✅ 新增 | `amas_user_states`        | `0.0`  |
| `mastery_history`              | ✅ 新增 | `amas_user_states` (JSON) | `[]`   |
| `HabitSamples`                 | ✅ 新增 | `amas_user_states` (JSON) | `[]`   |
| `EnsembleDecision.performance` | ✅ 新增 | `amas_user_states` (JSON) | `{}`   |

### C5: SQLite Schema Constraints

| 表名                     | 需要同步的列                                                                                                                                                                          | 类型                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `word_learning_states`   | `ummStrength`, `ummConsolidation`, `ummLastReviewTs`                                                                                                                                  | REAL, REAL, INTEGER (epoch ms)  |
| `answer_records`         | `imageViewCount`, `imageZoomCount`, `imageLongPressMs`, `audioPlayCount`, `audioReplayCount`, `audioSpeedAdjust`, `definitionReadMs`, `exampleReadMs`, `noteWriteCount`, `deviceType` | INTEGER×8, INTEGER (bool), TEXT |
| `user_interaction_stats` | `totalImageInteractions`, `totalAudioInteractions`, `totalReadingMs`, `totalNoteCount`                                                                                                | INTEGER×4                       |
| `context_history`        | 完整表定义同步                                                                                                                                                                        | 见 migration 039                |
| `umm_shadow_results`     | 完整表定义同步                                                                                                                                                                        | 见 migration 040                |

---

## Property-Based Testing (PBT) Properties

### PBT-1: VARK Data Consistency

**[INVARIANT]** For any user `u`:

```
user_interaction_stats.totalAudioInteractions == Σ_r∈answer_records(u) (r.audioPlayCount + r.audioReplayCount)
```

**[FALSIFICATION STRATEGY]**: Generate random sequences of `CreateRecordInput` with varying `audioPlayCount` (0, 1, 100, MAX_INT), insert via `create_record`, then query DB and compare aggregate vs recomputed sum.

---

**[INVARIANT]** For any user `u`:

```
user_interaction_stats.totalReadingMs == Σ_r∈answer_records(u) (r.definitionReadMs + r.exampleReadMs)
```

**[FALSIFICATION STRATEGY]**: Randomize per-record reading fields independently (including 0, large values); assert aggregate equals sum; include cases where fields are `None` and must be treated as 0.

---

**[INVARIANT]** `user_interaction_stats.totalInteractions` increases by exactly the number of _new_ answer_records written (no double-count on duplicates).

**[FALSIFICATION STRATEGY]**: For batch inserts, generate records with intentional duplicate `(userId, wordId, timestamp)` keys to trigger `ON CONFLICT`, then assert `totalInteractions` increments only by inserted count.

### PBT-2: deviceType Parsing

**[INVARIANT]** `normalize_device_type(ua)` ∈ {`desktop`, `tablet`, `mobile`, `unknown`} for any header string.

**[FALSIFICATION STRATEGY]**: Property-fuzz UA strings over arbitrary ASCII/Unicode, plus `None`, and assert output is always one of the allowed values (never panics, never other strings).

---

**[INVARIANT]** Normalization is idempotent: `normalize_device_type(normalize_device_type(ua)) == normalize_device_type(ua)`.

**[FALSIFICATION STRATEGY]**: Feed the output back as an input UA string and ensure the normalizer doesn't drift.

---

**[INVARIANT]** Ambiguous UA precedence is deterministic (if both "Mobile" and "Tablet" tokens appear, tablet wins).

**[FALSIFICATION STRATEGY]**: Generate UA strings that mix conflicting indicators (`iPad`+`Mobile`, `Android`+`Tablet`) and assert stable precedence.

### PBT-3: Shadow Recording Correctness

**[INVARIANT]** Exactly one `umm_shadow_results` row is written per successful `process_event` call.

**[FALSIFICATION STRATEGY]**: Run randomized sequences of `process_event` calls and assert `COUNT(umm_shadow_results where userId=u)` increases by exactly N; include induced failures where it must increase by 0.

---

**[INVARIANT]** Stored numeric fields are finite and bounded:

- `fsrsInterval > 0`
- `fsrsRetrievability ∈ [0, 1]`
- `fsrsStability > 0`
- `ummRetrievability ∈ [0, 1]` (when present)

**[FALSIFICATION STRATEGY]**: Fuzz upstream FSRS inputs at boundaries (0, 1, very large) and assert DB never contains NaN/Inf/out-of-range values.

---

**[INVARIANT]** When MDM state is absent, all MDM/UMM fields are NULL.

**[FALSIFICATION STRATEGY]**: Generate events without existing word state to force `mdm_state=None`, then assert NULL-ness is consistent.

### PBT-4: AMAS State Persistence

**[INVARIANT]** Round-trip: for persisted fields `P = {attention, fatigue, motivation, confidence, cognitiveProfile, trendState, visual_fatigue, fused_fatigue, mastery_history, HabitSamples, EnsembleDecision.performance}`:

```
load_state(save_state(S)).P == S.P
```

(up to JSON serialization tolerance)

**[FALSIFICATION STRATEGY]**: Generate random `UserState` values (including edge floats 0, 1, small decimals) and assert save→load preserves them.

---

**[INVARIANT]** `updatedAt` is monotonic non-decreasing across successive writes for a user.

**[FALSIFICATION STRATEGY]**: Save state repeatedly and assert timestamp ordering.

### PBT-5: Reading Time Measurement

**[INVARIANT]** Non-negativity: `definitionReadMs >= 0`, `exampleReadMs >= 0`.

**[FALSIFICATION STRATEGY]**: Fuzz reading fields with negative values; assert backend rejects or clamps so DB never stores negative.

---

**[INVARIANT]** Upper-bound: `totalReadingMs <= responseTime` when both are provided.

**[FALSIFICATION STRATEGY]**: Generate cases where `definitionReadMs` exceeds `responseTime`; assert backend enforces the bound.

---

## What Changes Required

### Priority 1: Fix VARK Frontend Tracking

- **MODIFIED**: `packages/frontend/src/pages/LearningPage.tsx`
  - 在 `currentWord` 变化时调用 `trackReadingStart('definition')`
  - 数据已在 `handleSelectAnswer` 中通过 `getData()` 收集

### Priority 2: Add deviceType to answer_records

- **NEW**: `packages/backend-rust/sql/042_add_device_type_to_answer_records.sql`

  ```sql
  ALTER TABLE "answer_records" ADD COLUMN IF NOT EXISTS "deviceType" TEXT DEFAULT 'unknown';
  ```

- **MODIFIED**: `packages/backend-rust/src/services/record.rs`
  - 添加 `normalize_device_type(ua: Option<&str>) -> &str` 函数
  - `CreateRecordInput` 添加 `device_type: Option<String>` 字段
  - INSERT 语句包含 deviceType

- **MODIFIED**: `packages/backend-rust/src/routes/amas.rs`
  - 从请求 header 提取 User-Agent
  - 调用 `normalize_device_type` 并传入 record service

### Priority 3: Sync SQLite Fallback Schema

- **MODIFIED**: `packages/backend-rust/sql/sqlite_fallback_schema.sql`
  - 添加 UMM 列到 `word_learning_states`
  - 添加 VARK 列到 `answer_records`
  - 添加 VARK 汇总列到 `user_interaction_stats`
  - 添加 `context_history` 表
  - 添加 `umm_shadow_results` 表

### Priority 4: Enable Shadow Recording

- **MODIFIED**: `packages/backend-rust/src/routes/amas.rs`
  - 在 `process_event` 后调用 `compute_shadow()`
  - 写入 `umm_shadow_results` 表

### Priority 5: Persist AMAS Runtime States

- **NEW**: `packages/backend-rust/sql/043_add_amas_runtime_states.sql`

  ```sql
  ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "visualFatigue" REAL DEFAULT 0.0;
  ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "fusedFatigue" REAL DEFAULT 0.0;
  ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "masteryHistory" JSONB DEFAULT '[]';
  ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "habitSamples" JSONB DEFAULT '[]';
  ALTER TABLE "amas_user_states" ADD COLUMN IF NOT EXISTS "ensemblePerformance" JSONB DEFAULT '{}';
  ```

- **MODIFIED**: `packages/backend-rust/src/amas/persistence.rs`
  - `save_state()` 包含新字段
  - `load_state()` 恢复新字段

---

## Impact

- **Affected specs**: amas-ui, learning-style
- **Affected code**:
  - `packages/frontend/src/pages/LearningPage.tsx`
  - `packages/backend-rust/src/services/record.rs`
  - `packages/backend-rust/src/routes/amas.rs`
  - `packages/backend-rust/src/amas/persistence.rs`
  - `packages/backend-rust/sql/sqlite_fallback_schema.sql`

## Success Criteria

1. ✅ VARK `trackReadingStart/End` 连接到 LearningPage
2. ✅ `answer_records` 包含 `deviceType` 列，服务端 UA 推断写入
3. ✅ SQLite fallback schema 与 PostgreSQL 同步
4. ✅ 每次 `process_event` 写入 `umm_shadow_results`
5. ✅ AMAS 运行时状态持久化并在重启后恢复
6. ✅ 所有 PBT 属性测试通过
