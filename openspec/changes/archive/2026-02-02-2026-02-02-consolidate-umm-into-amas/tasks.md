## 1. Directory Structure Migration

- [x] 1.1 Create `amas/memory/` directory
- [x] 1.2 Create `amas/vocabulary/` directory
- [x] 1.3 Create `amas/memory/mod.rs` with public re-exports
- [x] 1.4 Create `amas/vocabulary/mod.rs` with public re-exports

## 2. Memory Layer Migration

- [x] 2.1 Move `umm/mdm.rs` → `amas/memory/mdm.rs`
- [x] 2.2 Move `umm/msmt.rs` → `amas/memory/msmt.rs`
- [x] 2.3 Move `umm/r_target.rs` → `amas/memory/r_target.rs`
- [x] 2.4 Move `umm/adaptive_mastery.rs` → `amas/memory/adaptive_mastery.rs`
- [x] 2.5 Move `umm/engine.rs` → `amas/memory/engine.rs`, rename `UmmEngine` to `MemoryEngine`
- [x] 2.6 Update internal imports within memory modules

## 3. Decision Layer Extension

- [x] 3.1 Move `umm/ige.rs` → `amas/decision/ige.rs`
- [x] 3.2 Move `umm/swd.rs` → `amas/decision/swd.rs`
- [x] 3.3 Update `amas/decision/mod.rs` to export IGE and SWD

## 4. Vocabulary Layer Migration

- [x] 4.1 Move `umm/mtp.rs` → `amas/vocabulary/mtp.rs`
- [x] 4.2 Move `umm/iad.rs` → `amas/vocabulary/iad.rs`
- [x] 4.3 Move `umm/evm.rs` → `amas/vocabulary/evm.rs`
- [x] 4.4 Update internal imports within vocabulary modules

## 5. Engine Consolidation

- [x] 5.1 Update `amas/engine.rs` imports from `crate::umm::*` to new paths
- [x] 5.2 Update `amas/engine.rs` to use `MemoryEngine` instead of `UmmEngine`
- [x] 5.3 Update `amas/mod.rs` to export new submodules (memory, vocabulary)

## 6. Feature Flags Renaming

- [x] 6.1 Update `amas/config.rs`: rename `umm_*` fields to `amas_*`
- [x] 6.2 Update `routes/debug.rs`: update flag parsing (`enableUmmMdm` → `enableAmasMdm`, etc.)
- [x] 6.3 Update `routes/about.rs`: update health status flag references
- [x] 6.4 Update `routes/experiments.rs`: update `umm_ab_test_*` references
- [x] 6.5 Update `amas/decision/ensemble.rs`: update flag checks

## 7. AlgorithmId Reorganization

- [x] 7.1 Update `amas/metrics.rs`: change `id()` strings from `"umm_*"` to layer-based
- [x] 7.2 Update `amas/metrics.rs`: change `layer()` strings from `"umm_*"` to `"amas_*"`
- [x] 7.3 Update `amas/metrics.rs`: update `FromStr` impl for new id patterns
- [x] 7.4 Update `amas/metrics.rs`: update comments to reflect new organization

## 8. Database Schema Migration

- [x] 8.1 Create `sql/047_rename_umm_to_amas.sql` migration script
- [x] 8.2 Add migration entry to `db/migrate.rs`
- [x] 8.3 Update `sql/sqlite_fallback_schema.sql` with new names

## 9. Rust Struct Field Renaming

- [x] 9.1 Update `services/learning_state.rs`: rename `umm_*` fields to `amas_*`
- [x] 9.2 Update `services/learning_state.rs`: update SQL queries to use new column names
- [x] 9.3 Update `amas/types.rs`: rename `umm_*` fields in `WordMasteryDecision`
- [x] 9.4 Update `amas/types.rs`: rename `umm_*` fields in `FSRSWordState`
- [x] 9.5 Update `routes/amas.rs`: update shadow result column references

## 10. External Reference Updates

- [x] 10.1 Update `routes/amas.rs` imports to use new module paths
- [x] 10.2 Update `routes/word_mastery.rs` imports
- [x] 10.3 Update `amas/persistence.rs` imports
- [x] 10.4 Remove `pub mod umm;` from `lib.rs`

## 11. Test File Updates

- [x] 11.1 Update `tests/amas_engine_tests.rs`: update imports and flag names
- [x] 11.2 Update `tests/amas_decision_tests.rs`: update imports and flag names
- [x] 11.3 Update `tests/amas_persistence_pbt.rs`: update imports

## 12. Cleanup

- [x] 12.1 Delete `umm/mod.rs`
- [x] 12.2 Delete `umm/` directory
- [x] 12.3 Verify no remaining `crate::umm` references with grep
- [x] 12.4 Verify no remaining `umm_` feature flag references

## 13. Documentation Update

- [x] 13.1 Update `docs/AMAS.md` to reflect new structure (N/A - no such doc exists)
- [x] 13.2 Update module-level doc comments in `amas/mod.rs`

## 14. Validation

- [x] 14.1 Run `cargo build --all-targets` to verify compilation
- [x] 14.2 Run `cargo test --package backend-rust` to verify tests (256 tests passed)
- [x] 14.3 Run `grep -r "crate::umm" packages/backend-rust/src/` to verify no orphan references
- [x] 14.4 Run `grep -r "umm_.*enabled" packages/backend-rust/src/` to verify flag renaming complete
- [x] 14.5 Verify API endpoints still work via integration test
- [x] 14.6 Verify DB migration runs successfully on both PostgreSQL and SQLite
