# Proposal: Cleanup AMAS Baseline Algorithms

## Summary

移除 AMAS 系统中的 baseline 算法实现（AttentionMonitor、FatigueEstimator、CognitiveProfiler、MotivationTracker、TrendAnalyzer），让新的原创算法（ADF、TFM、BCP、MDS、MTD、AUC）成为唯一实现。同时清理相关的 feature flags 和委托逻辑。

## Motivation

当前 AMAS 采用"baseline + 委托"模式，通过 feature flags 控制是否使用新算法：

```rust
let attention = if config.feature_flags.use_adf {
    adf.update(...)  // 新算法
} else {
    models.attention.update(...)  // baseline
};
```

这种设计在算法迁移期间有价值，但现在：

1. 新算法已全部实现并通过测试（149 AMAS tests + 43 UMM tests）
2. Feature flags 已默认启用所有新算法
3. Baseline 代码成为死代码，增加维护负担
4. 委托逻辑增加代码复杂度

## Scope

### Files to Remove (Baseline Implementations)

| File                          | Algorithm         | Replacement |
| ----------------------------- | ----------------- | ----------- |
| `amas/modeling/attention.rs`  | AttentionMonitor  | ADF         |
| `amas/modeling/fatigue.rs`    | FatigueEstimator  | TFM         |
| `amas/modeling/cognitive.rs`  | CognitiveProfiler | BCP         |
| `amas/modeling/motivation.rs` | MotivationTracker | MDS         |
| `amas/modeling/trend.rs`      | TrendAnalyzer     | MTD         |

### Files to Modify

| File                   | Changes                                  |
| ---------------------- | ---------------------------------------- |
| `amas/config.rs`       | 移除 `use_adf/tfm/bcp/mds/mtd/auc` flags |
| `amas/engine.rs`       | 移除委托逻辑，直接调用新算法             |
| `amas/modeling/mod.rs` | 移除 baseline 模块导出                   |
| `amas/metrics.rs`      | 移除 baseline AlgorithmId variants       |

### Files to Keep (New Algorithms)

- `amas/modeling/adf.rs` - Attention Dynamics Filter
- `amas/modeling/tfm.rs` - Tri-pool Fatigue Model
- `amas/modeling/bcp.rs` - Bayesian Cognitive Profiling
- `amas/modeling/mds.rs` - Motivation Dynamics System
- `amas/modeling/mtd.rs` - Multi-scale Trend Detector
- `amas/modeling/auc.rs` - Active User Classification
- `amas/modeling/plf.rs` - Power-Law Forgetting
- `amas/modeling/air.rs` - Adaptive Item Response

## Impact

### Affected Specs

- **MODIFIED**: `amas-algorithms` - 移除 baseline 相关 requirements

### Risk Assessment

| Risk         | Mitigation                           |
| ------------ | ------------------------------------ |
| 回退能力丧失 | Git history 保留完整代码，可随时恢复 |
| 测试覆盖     | 新算法已有完整 PBT 测试              |
| 数据兼容性   | 状态结构不变，仅算法实现变化         |

## Success Criteria

1. `cargo check` 编译通过
2. `cargo test amas` 全部通过
3. `cargo test umm` 全部通过
4. 代码行数减少 > 500 行
5. Feature flags 数量减少 8 个
