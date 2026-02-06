# amas-baseline-cleanup Specification

## Purpose

移除 AMAS baseline 算法实现，让原创算法成为唯一实现。

## MODIFIED Requirements

### Requirement: Remove Baseline Algorithm Implementations

系统 SHALL 移除以下 baseline 算法文件：

- `attention.rs` (AttentionMonitor)
- `fatigue.rs` (FatigueEstimator)
- `cognitive.rs` (CognitiveProfiler)
- `motivation.rs` (MotivationTracker)
- `trend.rs` (TrendAnalyzer)

#### Scenario: Direct algorithm invocation

- **WHEN** AMAS engine processes a learning event
- **THEN** engine SHALL directly invoke new algorithms (ADF/TFM/BCP/MDS/MTD)
- **AND** no delegation logic SHALL exist
- **AND** no feature flag check SHALL be required

### Requirement: Remove Algorithm Feature Flags

系统 SHALL 从 `FeatureFlags` 中移除以下字段：

- `use_adf`
- `use_tfm`
- `use_bcp`
- `use_mds`
- `use_mtd`
- `use_auc`
- `use_plf`
- `use_air`

#### Scenario: Simplified configuration

- **WHEN** system loads configuration
- **THEN** no algorithm toggle flags SHALL exist
- **AND** all original algorithms SHALL be active by default

### Requirement: Preserve Algorithm State Persistence

系统 SHALL 保持算法状态持久化结构不变，并始终持久化所有算法状态。

#### Scenario: State compatibility

- **WHEN** loading existing user state from database
- **THEN** algorithm states SHALL be correctly deserialized
- **AND** no migration SHALL be required

#### Scenario: Unconditional persistence

- **WHEN** `update_modeling()` completes
- **THEN** all algorithm states (AdfState, TriPoolFatigueState, BcpState, MdsState, MtdState, AucState, PlfState, AirState) SHALL be persisted
- **AND** persistence SHALL NOT be conditional on any flag

### Requirement: AlgorithmId Cleanup

系统 SHALL 从 `AlgorithmId` 枚举中移除 baseline variants。

#### Scenario: Enum simplification

- **WHEN** this change is applied
- **THEN** `AlgorithmId::AttentionMonitor`, `AlgorithmId::FatigueEstimator`, `AlgorithmId::CognitiveProfiler`, `AlgorithmId::MotivationTracker`, `AlgorithmId::TrendAnalyzer` SHALL be removed
- **AND** no aliases SHALL be preserved
- **AND** `AlgorithmId::all()` SHALL return only new algorithm IDs

### Requirement: PLF Integration

PLF (Power-Law Forgetting) SHALL 正式纳入决策流程。

#### Scenario: PLF as primary predictor

- **WHEN** AMAS engine processes a learning event
- **THEN** PLF output SHALL be used in decision making
- **AND** PLF SHALL NOT operate as shadow predictor

### Requirement: AIR/AUC Unconditional Activation

AIR 和 AUC SHALL 无条件启用。

#### Scenario: Always-on algorithms

- **WHEN** AMAS engine initializes
- **THEN** AIR (Adaptive Item Response) SHALL be active
- **AND** AUC (Active User Classification) SHALL be active
- **AND** no runtime flag SHALL control their activation

### Requirement: MDS Streak Independence

MDS (Motivation Dynamics System) SHALL 内部计算 streak 信号。

#### Scenario: Internal streak computation

- **WHEN** MDS updates motivation state
- **THEN** streak SHALL be computed from UserState.consecutive_days or internal tracking
- **AND** MDS SHALL NOT depend on baseline MotivationTracker.streak()

## REMOVED Requirements

### Requirement: Baseline Algorithm Delegation

移除 baseline + delegation 模式相关的所有 requirements。

#### Scenario: Delegation removal

- **WHEN** this change is applied
- **THEN** all baseline delegation code SHALL be removed
- **AND** feature flag conditional logic SHALL be eliminated

### Requirement: Algorithm Toggle Feature Flags

移除算法开关相关的 requirements。

#### Scenario: Flag removal

- **WHEN** this change is applied
- **THEN** `use_adf/tfm/bcp/mds/mtd/auc/plf/air` flags SHALL be removed from FeatureFlags
- **AND** default behavior SHALL use original algorithms directly
