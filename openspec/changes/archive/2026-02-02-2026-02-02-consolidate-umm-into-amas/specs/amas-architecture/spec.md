## MODIFIED Requirements

### Requirement: AMAS Unified Algorithm Architecture

The AMAS system SHALL serve as the unified algorithm system containing all learning-related algorithms organized into four layers:

1. **Modeling Layer** (`amas/modeling/`): User state modeling algorithms
   - ADF (Attention Dynamics Filter)
   - TFM (Tri-pool Fatigue Model)
   - BCP (Bayesian Cognitive Profiling)
   - MDS (Motivation Dynamics System)
   - MTD (Multi-scale Trend Detector)
   - AUC (Active User Classification)
   - PLF (Power-Law Forgetting)
   - AIR (Adaptive Item Response)
   - VARK (Learning Style Classifier)

2. **Memory Layer** (`amas/memory/`): Memory dynamics and recall modeling
   - MDM (Memory Dynamics Model)
   - MSMT (Multi-Scale Memory Trace)
   - Adaptive Mastery
   - R-Target (Recall Target)
   - MemoryEngine (facade for memory computations)

3. **Decision Layer** (`amas/decision/`): Strategy selection algorithms
   - Ensemble Decision
   - Heuristic Rules
   - Cold Start Manager
   - IGE (Information Gain Exploration)
   - SWD (Similarity-Weighted Decision)

4. **Vocabulary Layer** (`amas/vocabulary/`): Vocabulary-specific specializations
   - MTP (Morphological Transfer Propagation)
   - IAD (Interference Attenuation by Distance)
   - EVM (Encoding Variability Metric)

#### Scenario: Algorithm module lookup

- **WHEN** a developer needs to locate an algorithm implementation
- **THEN** all algorithms SHALL be found under `packages/backend-rust/src/amas/`
- **AND** no algorithm code SHALL exist in `packages/backend-rust/src/umm/`

#### Scenario: Import path consistency

- **WHEN** code references learning algorithms
- **THEN** all imports SHALL use `crate::amas::*` paths
- **AND** no `crate::umm::*` imports SHALL exist in the codebase

#### Scenario: Algorithm ID tracking

- **WHEN** tracking algorithm metrics
- **THEN** `AlgorithmId` enum SHALL contain all algorithms from all four layers
- **AND** metrics SHALL be collected consistently regardless of algorithm layer

### Requirement: Memory Layer Integration

The system SHALL provide a unified memory layer within AMAS for memory dynamics modeling.

#### Scenario: MDM access through AMAS

- **WHEN** the engine needs Memory Dynamics Model functionality
- **THEN** MDM SHALL be accessed via `crate::amas::memory::mdm`
- **AND** MDM behavior SHALL remain unchanged from previous UMM implementation

#### Scenario: MSMT access through AMAS

- **WHEN** the engine needs Multi-Scale Memory Trace functionality
- **THEN** MSMT SHALL be accessed via `crate::amas::memory::msmt`
- **AND** MSMT behavior SHALL remain unchanged

#### Scenario: Adaptive Mastery integration

- **WHEN** computing word mastery decisions
- **THEN** adaptive mastery functions SHALL be accessed via `crate::amas::memory::adaptive_mastery`
- **AND** mastery computation logic SHALL remain unchanged

#### Scenario: MemoryEngine interface

- **WHEN** computing memory-based retrievability or intervals
- **THEN** `MemoryEngine` (renamed from `UmmEngine`) SHALL be accessed via `crate::amas::memory::MemoryEngine`
- **AND** method signatures SHALL remain identical
- **AND** computation results SHALL be identical for the same inputs

### Requirement: Decision Layer Extension

The system SHALL extend the decision layer to include IGE and SWD algorithms.

#### Scenario: IGE decision candidate

- **WHEN** `EnsembleDecision::decide()` considers candidates
- **AND** `amas_ige_enabled` feature flag is true
- **THEN** IGE candidate SHALL be provided by `crate::amas::decision::ige::IgeModel`
- **AND** IGE SHALL participate in ensemble voting

#### Scenario: SWD decision candidate

- **WHEN** `EnsembleDecision::decide()` considers candidates
- **AND** `amas_swd_enabled` feature flag is true
- **THEN** SWD candidate SHALL be provided by `crate::amas::decision::swd::SwdModel`
- **AND** SWD SHALL participate in ensemble voting

### Requirement: Vocabulary Specialization Layer

The system SHALL provide a vocabulary specialization layer for word-specific learning adjustments.

#### Scenario: MTP morpheme analysis

- **WHEN** analyzing morphological relationships between words
- **THEN** MTP SHALL be accessed via `crate::amas::vocabulary::mtp`
- **AND** morpheme state computation SHALL remain unchanged

#### Scenario: IAD interference calculation

- **WHEN** computing interference between similar words
- **THEN** IAD SHALL be accessed via `crate::amas::vocabulary::iad`
- **AND** confusion pair analysis SHALL remain unchanged

#### Scenario: EVM encoding variability

- **WHEN** computing encoding context variability
- **THEN** EVM SHALL be accessed via `crate::amas::vocabulary::evm`
- **AND** context entry analysis SHALL remain unchanged

### Requirement: Feature Flags Renaming with Backward Compatibility

The system SHALL rename feature flags from `umm_*` to `amas_*` while maintaining backward compatibility.

#### Scenario: New flag names in code

- **WHEN** code checks algorithm feature flags
- **THEN** flags SHALL be accessed via `amas_*` field names
- **AND** old `umm_*` field names SHALL NOT exist in Rust code

#### Scenario: Serde backward compatibility

- **WHEN** deserializing `FeatureFlags` from JSON
- **AND** JSON contains old key names (`umm_mdm_enabled`, etc.)
- **THEN** deserialization SHALL succeed
- **AND** values SHALL be mapped to corresponding `amas_*` fields

#### Scenario: Serde key precedence

- **WHEN** deserializing `FeatureFlags` from JSON
- **AND** JSON contains both old and new keys for the same field
- **THEN** the new key (`amas_*`) value SHALL take precedence

#### Scenario: Serialization output

- **WHEN** serializing `FeatureFlags` to JSON
- **THEN** only new key names (`amas_*`) SHALL be output
- **AND** no `umm_*` keys SHALL appear in output

#### Scenario: Default values preserved

- **WHEN** `FeatureFlags::default()` is called
- **THEN** `amas_mdm_enabled` SHALL be `true`
- **AND** `amas_ige_enabled` SHALL be `true`
- **AND** `amas_swd_enabled` SHALL be `true`
- **AND** `amas_msmt_enabled` SHALL be `true`
- **AND** `amas_mtp_enabled` SHALL be `true`
- **AND** `amas_iad_enabled` SHALL be `true`
- **AND** `amas_evm_enabled` SHALL be `true`
- **AND** `amas_ab_test_enabled` SHALL be `false`
- **AND** `amas_ab_test_percentage` SHALL be `10`

### Requirement: AlgorithmId Reorganization with Backward Compatibility

The system SHALL reorganize AlgorithmId string representations while maintaining backward compatibility.

#### Scenario: New id() output format

- **WHEN** calling `AlgorithmId::id()` on memory layer variants
- **THEN** `Mdm.id()` SHALL return `"memory_mdm"`
- **AND** `Msmt.id()` SHALL return `"memory_msmt"`

- **WHEN** calling `AlgorithmId::id()` on decision layer variants
- **THEN** `Ige.id()` SHALL return `"decision_ige"`
- **AND** `Swd.id()` SHALL return `"decision_swd"`

- **WHEN** calling `AlgorithmId::id()` on vocabulary layer variants
- **THEN** `Mtp.id()` SHALL return `"vocabulary_mtp"`
- **AND** `Iad.id()` SHALL return `"vocabulary_iad"`
- **AND** `Evm.id()` SHALL return `"vocabulary_evm"`

#### Scenario: layer() output format

- **WHEN** calling `AlgorithmId::layer()` on memory variants (Mdm, Msmt)
- **THEN** result SHALL be `"amas_memory"`

- **WHEN** calling `AlgorithmId::layer()` on decision variants (Ige, Swd)
- **THEN** result SHALL be `"amas_decision"`

- **WHEN** calling `AlgorithmId::layer()` on vocabulary variants (Mtp, Iad, Evm)
- **THEN** result SHALL be `"amas_vocabulary"`

#### Scenario: FromStr backward compatibility

- **WHEN** parsing old format strings (`"umm_mdm"`, `"umm_ige"`, etc.)
- **THEN** parsing SHALL succeed
- **AND** result SHALL be the corresponding variant

- **WHEN** parsing new format strings (`"memory_mdm"`, `"decision_ige"`, etc.)
- **THEN** parsing SHALL succeed
- **AND** result SHALL be the corresponding variant

#### Scenario: Round-trip consistency

- **WHEN** parsing any valid AlgorithmId string
- **AND** calling `id()` on the result
- **AND** parsing the `id()` output again
- **THEN** the final variant SHALL equal the intermediate variant

### Requirement: Database Schema Migration

The system SHALL migrate database column and table names from `umm*` to `amas*`.

#### Scenario: Table rename

- **WHEN** migration runs
- **THEN** `umm_shadow_results` table SHALL be renamed to `amas_shadow_results`

#### Scenario: Column rename on word_learning_states

- **WHEN** migration runs
- **THEN** `ummStrength` column SHALL be renamed to `amasStrength`
- **AND** `ummConsolidation` column SHALL be renamed to `amasConsolidation`
- **AND** `ummLastReviewTs` column SHALL be renamed to `amasLastReviewTs`

#### Scenario: Index rename

- **WHEN** migration runs
- **THEN** `idx_wls_umm_strength` SHALL be renamed to `idx_wls_amas_strength`
- **AND** `idx_umm_shadow_user_word` SHALL be renamed to `idx_amas_shadow_user_word`
- **AND** `idx_umm_shadow_created` SHALL be renamed to `idx_amas_shadow_created`

#### Scenario: Data preservation

- **WHEN** migration runs
- **THEN** all existing data SHALL be preserved
- **AND** column default values SHALL remain unchanged (`amasStrength` default `1.0`, `amasConsolidation` default `0.1`)

#### Scenario: Migration idempotency

- **WHEN** migration script runs on already-migrated database
- **THEN** no error SHALL occur
- **AND** data SHALL remain unchanged

#### Scenario: Cross-database compatibility

- **WHEN** migration runs on PostgreSQL
- **THEN** migration SHALL complete successfully

- **WHEN** migration runs on SQLite
- **THEN** migration SHALL complete successfully
- **AND** resulting schema SHALL be functionally equivalent to PostgreSQL

### Requirement: MemoryEngine Computational Invariants

The MemoryEngine (renamed from UmmEngine) SHALL maintain identical computational behavior.

#### Scenario: Retrievability bounds

- **WHEN** `MemoryEngine::compute_retrievability()` is called with any valid inputs
- **THEN** result SHALL be in range `[0.0, 1.0]`
- **AND** result SHALL NOT be NaN or Infinity

#### Scenario: Retrievability monotonicity

- **WHEN** `MemoryEngine::compute_retrievability()` is called with identical state
- **AND** `elapsed_days` increases
- **THEN** retrievability SHALL decrease or remain equal (non-increasing)

#### Scenario: Computation determinism

- **WHEN** `MemoryEngine::compute_retrievability()` is called twice with identical inputs
- **THEN** results SHALL be identical (within floating-point epsilon)

#### Scenario: Interval bounds

- **WHEN** `MemoryEngine::compute_interval()` is called with any valid inputs
- **THEN** result SHALL be positive
- **AND** result SHALL NOT be NaN or Infinity
