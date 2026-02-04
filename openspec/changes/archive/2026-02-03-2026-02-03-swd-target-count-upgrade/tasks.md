# Tasks: SWD 策略目标数量计算升级

## Completed Tasks

- [x] Add `SwdRecommendation` struct to `types.rs`
- [x] Add `swd_recommendation` field to `StrategyParams`
- [x] Add `recommend_additional_count()` method to `swd.rs`
- [x] Integrate SWD recommendation in `engine.rs`
- [x] Add `compute_dynamic_cap()` function to `mastery_learning.rs`
- [x] Add `compute_target_with_swd()` function to `mastery_learning.rs`
- [x] Modify `get_words_for_mastery_mode()` to use SWD recommendation
- [x] Add unit tests for target calculation
- [x] Add PBT tests for invariants
- [x] Code review and fixes (Codex review completed)

## Implementation Summary

### Files Modified

- `packages/backend-rust/src/amas/types.rs` - Added `SwdRecommendation` struct
- `packages/backend-rust/src/amas/decision/swd.rs` - Added `recommend_additional_count()`
- `packages/backend-rust/src/amas/engine.rs` - Integrated SWD recommendation
- `packages/backend-rust/src/services/mastery_learning.rs` - Added dynamic cap and target computation
- `packages/backend-rust/src/amas/decision/ensemble.rs` - Updated test fixtures
- `packages/backend-rust/src/amas/decision/heuristic.rs` - Updated test fixtures
- `packages/backend-rust/tests/amas_decision_tests.rs` - Added SWD tests
- `packages/backend-rust/tests/amas_persistence_pbt.rs` - Added SWD PBT tests

### Key Features

1. Dynamic cap calculation based on user state (attention, motivation, fatigue, cognitive)
2. SWD recommendation with confidence filtering (threshold: 0.5)
3. User priority: user setting overrides SWD when exceeding cap
4. Cold start safety: returns None when no history
5. Defensive clamping for all input values
