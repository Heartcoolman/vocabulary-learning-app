# Tasks: Cleanup AMAS Baseline Algorithms

## Phase 1: Remove Baseline Files

- [x] **T1.1** Delete `amas/modeling/attention.rs` (AttentionMonitor baseline)
- [x] **T1.2** Delete `amas/modeling/fatigue.rs` (FatigueEstimator baseline)
- [x] **T1.3** Delete `amas/modeling/cognitive.rs` (CognitiveProfiler baseline)
- [x] **T1.4** Delete `amas/modeling/motivation.rs` (MotivationTracker baseline)
- [x] **T1.5** Delete `amas/modeling/trend.rs` (TrendAnalyzer baseline)

## Phase 2: Update Module Exports

- [x] **T2.1** Update `amas/modeling/mod.rs` - 移除 baseline 模块声明和导出
- [x] **T2.2** Update `amas/metrics.rs` - 移除 baseline AlgorithmId variants (AttentionMonitor, FatigueEstimator, CognitiveProfiler, MotivationTracker, TrendAnalyzer)

## Phase 3: Simplify Engine Logic

- [x] **T3.1** Update `amas/engine.rs` - 移除 `UserModels` 中的 baseline 字段
- [x] **T3.2** Update `amas/engine.rs` - 移除 `update_modeling()` 中的委托逻辑，直接调用新算法
- [x] **T3.3** Update `amas/engine.rs` - 移除 baseline 相关的 `track_algorithm!` 调用

## Phase 4: Clean Feature Flags

- [x] **T4.1** Update `amas/config.rs` - 移除 `use_adf/tfm/bcp/mds/mtd/auc/plf/air` flags
- [x] **T4.2** Update `amas/config.rs` - 更新 `FeatureFlags::default()` 实现
- [x] **T4.3** Update `amas/config.rs` - 更新测试
- [x] **T4.4** Update `routes/debug.rs` - 移除 debug flag 映射
- [x] **T4.5** Update tests - 移除 `use_*` flag 引用

## Phase 5: Validation

- [x] **T5.1** Run `cargo check` - 确保编译通过
- [x] **T5.2** Run `cargo test amas` - 确保 AMAS 测试通过 (149 passed)
- [x] **T5.3** Run `cargo test umm` - 确保 UMM 测试通过 (43 passed)
- [x] **T5.4** Verify code reduction metrics

## Results

| Metric                       | Before | After | Change          |
| ---------------------------- | ------ | ----- | --------------- |
| Files modified               | -      | 28    | -               |
| Lines removed                | -      | 2931  | -2931           |
| Lines added                  | -      | 820   | +820            |
| Net reduction                | -      | -     | **-2111 lines** |
| Feature flags removed        | 8      | 0     | -8              |
| AlgorithmId variants removed | 5      | 0     | -5              |

## Dependencies

```
T1.* → T2.* → T3.* → T4.* → T5.*
```

All phases completed sequentially.
