## Context

AMAS引擎是单词学习应用的核心自适应学习系统，负责：

- 用户状态建模（注意力、疲劳、动机、认知）
- 学习策略决策（IGE、SWD、Heuristic集成）
- 词汇掌握度追踪（MDM、MSMT记忆模型）

当前持久化层存在数据完整性风险，可能导致用户学习历史丢失或状态不一致。

## Goals / Non-Goals

**Goals:**

- 确保 `save_state` 操作的原子性
- 正确持久化所有用户状态字段
- 保持时间戳的准确性

**Non-Goals:**

- 不修改AMAS决策逻辑
- 不修改API接口
- 不进行性能优化

## Decisions

### Decision 1: 事务包裹策略

使用 `sqlx::Transaction` 包裹 `save_state` 中的所有数据库操作。

**替代方案考虑:**

- 补偿事务模式（Saga）：过于复杂，当前场景不需要
- 乐观锁：增加冲突处理复杂度

**选择理由:**

- 所有操作在同一数据库，原生事务是最简单有效的方案
- sqlx 原生支持事务

### Decision 2: 字段映射修复

在 `save_state` 中直接使用 `PersistedAMASState` 的字段：

**实现方式:**

```rust
// 在 save_state 中，直接处理 mastery_history 和 ensemble_performance
// 不通过 user_state_to_row 传递
let mut amas_state = self.user_state_to_row(&state.user_id, &state.user_state);
amas_state.mastery_history = state.mastery_history.as_ref()
    .and_then(|h| serde_json::to_value(h).ok());
amas_state.ensemble_performance = state.ensemble_performance.as_ref()
    .and_then(|p| serde_json::to_value(p).ok());
```

**理由:**

- `mastery_history` 对自适应掌握阈值至关重要，必须持久化
- `ensemble_performance` 包含算法性能 EMA 数据，需要持久化以保持决策质量连续性

### Decision 3: 时间戳修复

在 `load_state` 中使用数据库的 `updatedAt` 字段，解析失败时回退并记录警告：

```rust
last_updated: chrono::DateTime::parse_from_rfc3339(&user_state_row.updated_at)
    .map(|dt| dt.timestamp_millis())
    .unwrap_or_else(|e| {
        tracing::warn!(
            user_id = %user_id,
            updated_at = %user_state_row.updated_at,
            error = %e,
            "Failed to parse updatedAt timestamp, falling back to Utc::now()"
        );
        chrono::Utc::now().timestamp_millis()
    }),
```

## Risks / Trade-offs

| Risk                         | Mitigation                                   |
| ---------------------------- | -------------------------------------------- |
| 事务可能增加数据库锁等待时间 | 保持事务范围最小，仅包含必要操作             |
| 字段序列化失败               | 使用 `and_then` + 日志记录，不阻塞主流程     |
| 向后兼容性                   | `mastery_history` 字段已存在于数据库Schema中 |

## Migration Plan

1. 部署新代码后，现有用户首次请求时将正确加载时间戳
2. 新保存的状态将包含 `mastery_history`
3. 无需数据迁移脚本

## Open Questions

~~- 是否需要为 `ensemble_performance` 添加持久化支持？（当前决策：暂不需要）~~

**已解决**: `ensemble_performance` 将在本次变更中一并实现持久化。
