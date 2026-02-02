# Change: Consolidate UMM into AMAS as Unified Algorithm System

## Why

当前系统存在两个并行的算法模块：

- **AMAS** (`packages/backend-rust/src/amas/`): 包含用户建模（ADF/TFM/BCP/MDS/MTD/AUC）、决策层（Ensemble/Heuristic/ColdStart）
- **UMM** (`packages/backend-rust/src/umm/`): 包含记忆模型（MDM/MSMT/IGE/SWD）和词汇专业化（MTP/IAD/EVM）

这种分离导致：

1. **架构碎片化**：算法分布在两个模块，职责边界模糊
2. **状态管理复杂**：`AMASEngine` 需要同时协调 AMAS 内部状态和 UMM 模型
3. **维护成本增加**：算法迭代需要在两处修改，容易遗漏
4. **文档不一致**：AMAS.md 和 UMM 注释各自描述算法体系，用户难以理解全貌
5. **命名不一致**：Feature flags、AlgorithmId、数据库列名使用 `umm_` 前缀，与 AMAS 体系命名冲突

用户期望 AMAS 作为"算法总系统"，所有学习算法应统一在 AMAS 体系内，包括代码结构和命名规范。

## What Changes

### 1. 目录结构重组

将 UMM 算法物理迁移到 AMAS 目录下：

```
amas/
├── modeling/           # 用户建模层
│   ├── adf.rs         # Attention Dynamics Filter
│   ├── tfm.rs         # Tri-pool Fatigue Model
│   ├── bcp.rs         # Bayesian Cognitive Profiling
│   ├── mds.rs         # Motivation Dynamics System
│   ├── mtd.rs         # Multi-scale Trend Detector
│   ├── auc.rs         # Active User Classification
│   ├── plf.rs         # Power-Law Forgetting (existing)
│   ├── air.rs         # Adaptive Item Response (existing)
│   └── vark/          # VARK Learning Style (existing)
├── memory/            # 记忆层（原 UMM 核心）
│   ├── mod.rs
│   ├── mdm.rs         # Memory Dynamics Model
│   ├── msmt.rs        # Multi-Scale Memory Trace
│   ├── r_target.rs    # Recall Target
│   └── adaptive_mastery.rs
├── decision/          # 决策层
│   ├── mod.rs
│   ├── ensemble.rs    # Ensemble Decision
│   ├── heuristic.rs   # Heuristic Rules
│   ├── coldstart.rs   # Cold Start Manager
│   ├── ige.rs         # Information Gain Exploration (from UMM)
│   └── swd.rs         # Similarity-Weighted Decision (from UMM)
├── vocabulary/        # 词汇专业化层（原 UMM）
│   ├── mod.rs
│   ├── mtp.rs         # Morphological Transfer Propagation
│   ├── iad.rs         # Interference Attenuation by Distance
│   └── evm.rs         # Encoding Variability Metric
├── engine.rs          # AMASEngine（统一入口）
├── config.rs          # 配置
├── types.rs           # 类型定义
├── metrics.rs         # 算法指标追踪
├── persistence.rs     # 持久化
└── monitoring.rs      # 监控
```

### 2. 模块重命名

- `umm/` → 删除（内容迁移到 `amas/memory/`、`amas/decision/`、`amas/vocabulary/`）
- `UmmEngine` → 移至 `amas/memory/engine.rs`，重命名为 `MemoryEngine`
- `amas/decision/` 扩展：新增 `ige.rs` 和 `swd.rs`

### 3. 导入路径更新

所有对 `crate::umm::*` 的引用更新为：

- `crate::amas::memory::*` (mdm, msmt, r_target, adaptive_mastery, MemoryEngine)
- `crate::amas::decision::*` (ige, swd)
- `crate::amas::vocabulary::*` (mtp, iad, evm)

### 4. Feature Flags 重命名

```rust
// Before
umm_mdm_enabled, umm_ige_enabled, umm_swd_enabled, umm_msmt_enabled,
umm_mtp_enabled, umm_iad_enabled, umm_evm_enabled,
umm_ab_test_enabled, umm_ab_test_percentage

// After
amas_mdm_enabled, amas_ige_enabled, amas_swd_enabled, amas_msmt_enabled,
amas_mtp_enabled, amas_iad_enabled, amas_evm_enabled,
amas_ab_test_enabled, amas_ab_test_percentage
```

### 5. AlgorithmId 重组

```rust
// id() 字符串变更
"umm_mdm" → "memory_mdm"
"umm_msmt" → "memory_msmt"
"umm_ige" → "decision_ige"
"umm_swd" → "decision_swd"
"umm_mtp" → "vocabulary_mtp"
"umm_iad" → "vocabulary_iad"
"umm_evm" → "vocabulary_evm"

// layer() 字符串变更
"umm_memory" → "amas_memory"
"umm_decision" → "amas_decision"
"umm_vocabulary" → "amas_vocabulary"
```

### 6. 数据库 Schema 迁移

```sql
-- 表重命名
ALTER TABLE "umm_shadow_results" RENAME TO "amas_shadow_results";

-- 列重命名 (word_learning_states)
ALTER TABLE "word_learning_states" RENAME COLUMN "ummStrength" TO "amasStrength";
ALTER TABLE "word_learning_states" RENAME COLUMN "ummConsolidation" TO "amasConsolidation";
ALTER TABLE "word_learning_states" RENAME COLUMN "ummLastReviewTs" TO "amasLastReviewTs";

-- 索引重命名
ALTER INDEX "idx_wls_umm_strength" RENAME TO "idx_wls_amas_strength";
ALTER INDEX "idx_umm_shadow_user_word" RENAME TO "idx_amas_shadow_user_word";
ALTER INDEX "idx_umm_shadow_created" RENAME TO "idx_amas_shadow_created";
```

### 7. 文档统一

更新 `docs/AMAS.md`，将 UMM 算法纳入 AMAS 体系文档。

## Impact

- Affected specs: `amas-algorithms`, `amas-persistence`, `amas-architecture`
- Affected code:
  - `packages/backend-rust/src/umm/` (全部删除)
  - `packages/backend-rust/src/amas/` (结构重组 + 新增 memory/vocabulary 子模块)
  - `packages/backend-rust/src/amas/config.rs` (Feature flags 重命名)
  - `packages/backend-rust/src/amas/metrics.rs` (AlgorithmId 重组)
  - `packages/backend-rust/src/routes/amas.rs` (导入路径 + DB 列名)
  - `packages/backend-rust/src/routes/debug.rs` (Feature flag 名称)
  - `packages/backend-rust/src/routes/about.rs` (Feature flag 名称)
  - `packages/backend-rust/src/routes/experiments.rs` (Feature flag 名称)
  - `packages/backend-rust/src/services/learning_state.rs` (导入路径 + DB 列名)
  - `packages/backend-rust/src/db/operations/amas.rs` (DB 列名)
  - `packages/backend-rust/sql/` (新增迁移脚本)
  - `docs/AMAS.md` (文档更新)
- **BREAKING**:
  - Feature flags 名称变更 (`umm_*` → `amas_*`)：影响前端 debug 路由调用
  - 数据库 schema 变更：需要迁移脚本
  - AlgorithmId 字符串变更：可能影响 metrics dashboard

## Non-Goals

- 不改变任何算法的具体实现逻辑
- 不新增算法功能
- 不修改 REST API 端点路径
- 不修改实验名称 `umm-vs-fsrs`（保留历史记录兼容性）
