## Context

当前项目有两个并行的算法系统：

- **AMAS (Adaptive Multi-dimensional Awareness System)**: 用户状态建模和学习策略决策
- **UMM (Unified Memory Model)**: 记忆动力学和词汇专业化

这两个系统在 `AMASEngine` 中被同时调用，但代码分布在不同目录，导致职责边界模糊。

### 当前架构

```
packages/backend-rust/src/
├── amas/
│   ├── modeling/        # 8 个算法模块 (ADF/TFM/BCP/MDS/MTD/AUC/PLF/AIR)
│   ├── decision/        # 3 个模块 (ensemble/heuristic/coldstart)
│   ├── engine.rs        # 主引擎，同时调用 AMAS 和 UMM
│   └── ...
└── umm/
    ├── mdm.rs           # Memory Dynamics Model
    ├── msmt.rs          # Multi-Scale Memory Trace
    ├── ige.rs           # Information Gain Exploration
    ├── swd.rs           # Similarity-Weighted Decision
    ├── mtp.rs           # Morphological Transfer Propagation
    ├── iad.rs           # Interference Attenuation by Distance
    ├── evm.rs           # Encoding Variability Metric
    ├── adaptive_mastery.rs
    └── engine.rs
```

### 目标架构

```
packages/backend-rust/src/amas/
├── modeling/           # 用户建模层（保留原有模块）
├── memory/            # 记忆层（原 UMM 核心算法）
│   ├── mdm.rs
│   ├── msmt.rs
│   ├── r_target.rs
│   └── adaptive_mastery.rs
├── decision/          # 决策层（扩展 IGE/SWD）
│   ├── ensemble.rs
│   ├── heuristic.rs
│   ├── coldstart.rs
│   ├── ige.rs         # 从 UMM 迁移
│   └── swd.rs         # 从 UMM 迁移
├── vocabulary/        # 词汇专业化层（原 UMM 词汇模块）
│   ├── mtp.rs
│   ├── iad.rs
│   └── evm.rs
└── engine.rs          # 统一入口
```

## Goals / Non-Goals

### Goals

1. **统一算法入口**: AMAS 成为唯一的算法模块，消除 `crate::umm` 引用
2. **清晰分层**: 将算法按职责分为 modeling/memory/decision/vocabulary 四层
3. **保持功能不变**: 纯重构，不改变任何算法逻辑
4. **简化维护**: 所有算法在同一目录下，便于理解和迭代

### Non-Goals

1. 不优化或修改算法实现
2. 不改变外部 API
3. 不修改数据库 schema
4. 不调整 feature flags

## Decisions

### Decision 1: 将 UMM 整合为 AMAS 子模块

**选择**: 将 UMM 代码迁移到 `amas/` 下的 `memory/` 和 `vocabulary/` 子目录。

**原因**:

- 保持 AMAS 作为算法总入口的定位
- 避免创建新的顶层模块
- 利用现有 `amas/` 目录结构扩展

**备选方案**:

- 保持 UMM 独立但添加 `amas::prelude` 统一导出 → 不解决架构碎片化问题
- 将 AMAS 合并到 UMM → 不符合用户对 "AMAS 是总系统" 的期望

### Decision 2: IGE/SWD 归入 decision 层

**选择**: 将 `ige.rs` 和 `swd.rs` 迁移到 `amas/decision/`。

**原因**:

- IGE (Information Gain Exploration) 和 SWD (Similarity-Weighted Decision) 本质是决策算法
- 与 `ensemble.rs` 中的 `EnsembleDecision::decide()` 协同工作
- 当前 `engine.rs` 已将它们作为决策候选使用

### Decision 3: 保留 UmmEngine 功能但移除独立模块

**选择**: 将 `UmmEngine` 的功能内联到 `AMASEngine` 或转为 helper。

**原因**:

- `UmmEngine` 主要是一个 facade，包装了 MDM/MSMT/MTP/IAD/EVM
- 整合后 `AMASEngine` 直接调用这些模块即可
- 减少一层抽象

## Risks / Trade-offs

### Risk 1: 导入路径全局替换可能遗漏

**Mitigation**:

- 使用 `cargo build --all-targets` 确保编译通过
- grep 搜索确认无遗留 `crate::umm` 引用

### Risk 2: 迁移过程中文件冲突

**Mitigation**:

- 分阶段执行：先创建目标目录，再迁移文件，最后删除源目录
- 使用 git mv 保留历史

## Migration Plan

### Phase 1: 创建目录结构

1. 创建 `amas/memory/` 目录
2. 创建 `amas/vocabulary/` 目录

### Phase 2: 迁移记忆层

1. `umm/mdm.rs` → `amas/memory/mdm.rs`
2. `umm/msmt.rs` → `amas/memory/msmt.rs`
3. `umm/r_target.rs` → `amas/memory/r_target.rs`
4. `umm/adaptive_mastery.rs` → `amas/memory/adaptive_mastery.rs`
5. 创建 `amas/memory/mod.rs`

### Phase 3: 迁移决策层扩展

1. `umm/ige.rs` → `amas/decision/ige.rs`
2. `umm/swd.rs` → `amas/decision/swd.rs`
3. 更新 `amas/decision/mod.rs`

### Phase 4: 迁移词汇专业化层

1. `umm/mtp.rs` → `amas/vocabulary/mtp.rs`
2. `umm/iad.rs` → `amas/vocabulary/iad.rs`
3. `umm/evm.rs` → `amas/vocabulary/evm.rs`
4. 创建 `amas/vocabulary/mod.rs`

### Phase 5: 更新引用

1. 更新 `amas/engine.rs` 导入路径
2. 更新 `amas/mod.rs` 导出
3. 更新 `routes/amas.rs` 导入
4. 更新 `services/amas.rs` 导入
5. 更新 `services/learning_state.rs` 导入
6. 更新测试文件导入

### Phase 6: 清理

1. 删除 `umm/engine.rs`
2. 删除 `umm/mod.rs`
3. 删除 `umm/` 目录

### Rollback

如果迁移失败，使用 `git checkout` 恢复到迁移前状态。

## Open Questions

**已解决：**

1. **是否保留 `UmmEngine` 作为 helper?**
   - **决策**: 移至 `amas/memory/engine.rs`，重命名为 `MemoryEngine`

2. **`AlgorithmId` 枚举是否需要重组?**
   - **决策**: 按层级重组 `id()` 字符串（`memory_*`/`decision_*`/`vocabulary_*`），枚举变量名保持不变

3. **是否保留 `crate::umm` 兼容层?**
   - **决策**: 直接删除，无过渡期

4. **Feature flags 命名策略?**
   - **决策**: `umm_*` → `amas_*`

5. **数据库命名策略?**
   - **决策**: `umm*` → `amas*`，需要新增 SQL 迁移脚本

6. **实验名称 'umm-vs-fsrs' 是否重命名?**
   - **决策**: 保留不变（历史记录兼容性）

## Finalized Constraints

### C1: Module Visibility

- `amas::memory` - public module
- `amas::vocabulary` - public module
- `amas::decision` - public module (已存在)

### C2: MemoryEngine Interface

```rust
// amas/memory/engine.rs
pub struct MemoryEngine;

impl MemoryEngine {
    pub fn compute_retrievability(...) -> f64;
    pub fn compute_interval(...) -> f64;
    pub fn compute_shadow(...) -> ShadowResult;
}
```

### C3: Feature Flags Mapping

| Old Name                 | New Name                  |
| ------------------------ | ------------------------- |
| `umm_mdm_enabled`        | `amas_mdm_enabled`        |
| `umm_ige_enabled`        | `amas_ige_enabled`        |
| `umm_swd_enabled`        | `amas_swd_enabled`        |
| `umm_msmt_enabled`       | `amas_msmt_enabled`       |
| `umm_mtp_enabled`        | `amas_mtp_enabled`        |
| `umm_iad_enabled`        | `amas_iad_enabled`        |
| `umm_evm_enabled`        | `amas_evm_enabled`        |
| `umm_ab_test_enabled`    | `amas_ab_test_enabled`    |
| `umm_ab_test_percentage` | `amas_ab_test_percentage` |

### C4: AlgorithmId String Mapping

| Variant | Old id()     | New id()           | layer()             |
| ------- | ------------ | ------------------ | ------------------- |
| `Mdm`   | `"umm_mdm"`  | `"memory_mdm"`     | `"amas_memory"`     |
| `Msmt`  | `"umm_msmt"` | `"memory_msmt"`    | `"amas_memory"`     |
| `Ige`   | `"umm_ige"`  | `"decision_ige"`   | `"amas_decision"`   |
| `Swd`   | `"umm_swd"`  | `"decision_swd"`   | `"amas_decision"`   |
| `Mtp`   | `"umm_mtp"`  | `"vocabulary_mtp"` | `"amas_vocabulary"` |
| `Iad`   | `"umm_iad"`  | `"vocabulary_iad"` | `"amas_vocabulary"` |
| `Evm`   | `"umm_evm"`  | `"vocabulary_evm"` | `"amas_vocabulary"` |

### C5: Database Schema Migration

| Type   | Old Name                   | New Name                    |
| ------ | -------------------------- | --------------------------- |
| Table  | `umm_shadow_results`       | `amas_shadow_results`       |
| Column | `ummStrength`              | `amasStrength`              |
| Column | `ummConsolidation`         | `amasConsolidation`         |
| Column | `ummLastReviewTs`          | `amasLastReviewTs`          |
| Index  | `idx_wls_umm_strength`     | `idx_wls_amas_strength`     |
| Index  | `idx_umm_shadow_user_word` | `idx_amas_shadow_user_word` |
| Index  | `idx_umm_shadow_created`   | `idx_amas_shadow_created`   |

### C6: Struct Field Renaming (Rust)

```rust
// learning_state.rs - WordLearningState
umm_strength → amas_strength
umm_consolidation → amas_consolidation
umm_last_review_ts → amas_last_review_ts

// types.rs - WordMasteryDecision, FSRSWordState
umm_strength → amas_strength
umm_consolidation → amas_consolidation
umm_last_review_ts → amas_last_review_ts
```

### C7: Preserved Naming (No Change)

- Experiment name: `"umm-vs-fsrs"` (历史兼容)
- `ShadowResult` 内部字段名保持不变（不影响外部序列化）

### C8: Serde Backward Compatibility (Feature Flags)

- 反序列化时接受 `umm_*` 和 `amas_*` 两种 key
- 如果同一字段同时存在新旧 key，新 key (`amas_*`) 优先
- 序列化时只输出新 key (`amas_*`)

### C9: AlgorithmId Parsing Backward Compatibility

- `FromStr` 接受旧格式 (`"umm_mdm"`) 和新格式 (`"memory_mdm"`)
- 两种格式都解析为同一枚举变体 (e.g., `AlgorithmId::Mdm`)
- `id()` 方法只输出新格式字符串

## Property-Based Testing (PBT) Properties

### PBT-1: Module Migration Invariants

**[Invariant Preservation]** All previously-public items remain accessible via new paths.

- **Falsification**: Generate imports from old paths, verify compile fails with clear error pointing to new path.

**[Invariant Preservation]** All function signatures are identical (params, return types, visibility).

- **Falsification**: Diff rustdoc JSON signatures before/after; assert byte-for-byte equality.

### PBT-2: Feature Flags Serde

**[Round-trip]** Serialize → Deserialize preserves all values.

```rust
proptest! {
    fn roundtrip(flags: FeatureFlags) {
        let json = serde_json::to_string(&flags).unwrap();
        let restored: FeatureFlags = serde_json::from_str(&json).unwrap();
        assert_eq!(flags, restored);
    }
}
```

**[Backward Compatibility]** Old key names deserialize correctly.

```rust
#[test]
fn old_keys_accepted() {
    let old_json = r#"{"umm_mdm_enabled": false}"#;
    let flags: FeatureFlags = serde_json::from_str(old_json).unwrap();
    assert_eq!(flags.amas_mdm_enabled, false);
}
```

**[Invariant Preservation]** Default values unchanged.

```rust
proptest! {
    fn defaults_preserved() {
        let flags = FeatureFlags::default();
        assert!(flags.amas_mdm_enabled);
        assert!(flags.amas_ige_enabled);
        assert!(!flags.amas_ab_test_enabled);
        assert_eq!(flags.amas_ab_test_percentage, 10);
    }
}
```

### PBT-3: AlgorithmId Parsing

**[Round-trip]** Parse → id() → Parse returns same variant.

```rust
proptest! {
    fn algorithm_id_roundtrip(id in arb_algorithm_id()) {
        let s = id.id();
        let parsed: AlgorithmId = s.parse().unwrap();
        assert_eq!(id, parsed);
    }
}
```

**[Backward Compatibility]** Old string formats parse correctly.

```rust
#[test]
fn old_id_strings_accepted() {
    assert_eq!("umm_mdm".parse::<AlgorithmId>().unwrap(), AlgorithmId::Mdm);
    assert_eq!("umm_ige".parse::<AlgorithmId>().unwrap(), AlgorithmId::Ige);
}
```

**[Invariant Preservation]** `AlgorithmId::all()` contains all variants, no duplicates.

```rust
#[test]
fn all_unique() {
    let all = AlgorithmId::all();
    let ids: HashSet<_> = all.iter().map(|a| a.id()).collect();
    assert_eq!(ids.len(), all.len());
}
```

### PBT-4: Database Migration

**[Idempotency]** Migration is safe to run twice.

```sql
-- Running migration twice should not error or change data
```

**[Invariant Preservation]** Data preserved during column rename.

```rust
proptest! {
    fn data_preserved(strength: f64, consolidation: f64, ts: Option<i64>) {
        // Insert with old column names
        // Run migration
        // Read with new column names
        // Assert values unchanged
    }
}
```

**[Bounds]** Default values unchanged after migration.

- `amasStrength` default: `1.0`
- `amasConsolidation` default: `0.1`
- `amasLastReviewTs` default: `NULL`

### PBT-5: MemoryEngine Computation

**[Deterministic Equivalence]** Same inputs → same outputs.

```rust
proptest! {
    fn compute_retrievability_deterministic(
        mdm_state: MdmState,
        elapsed_days: f64,
        morphemes: Vec<MorphemeState>,
        confusions: Vec<ConfusionPair>,
        recent_ids: Vec<i64>,
        context: Vec<ContextEntry>
    ) {
        let r1 = MemoryEngine::compute_retrievability(&mdm_state, elapsed_days, &morphemes, &confusions, &recent_ids, &context);
        let r2 = MemoryEngine::compute_retrievability(&mdm_state, elapsed_days, &morphemes, &confusions, &recent_ids, &context);
        assert!((r1 - r2).abs() < 1e-10);
    }
}
```

**[Bounds]** Output always in `[0.0, 1.0]`.

```rust
proptest! {
    fn retrievability_bounded(inputs: ValidInputs) {
        let r = MemoryEngine::compute_retrievability(...);
        assert!(r >= 0.0 && r <= 1.0);
    }
}
```

**[Monotonicity]** Retrievability non-increasing with elapsed_days (for constant state).

```rust
proptest! {
    fn retrievability_monotonic(state: MdmState, d1: f64, d2: f64) {
        prop_assume!(d1 < d2);
        let r1 = MemoryEngine::compute_retrievability(&state, d1, ...);
        let r2 = MemoryEngine::compute_retrievability(&state, d2, ...);
        assert!(r1 >= r2);
    }
}
```
