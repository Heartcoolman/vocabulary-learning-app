# Change: Fix AMAS Persistence Layer Data Integrity Issues

## Why

AMAS引擎审查发现持久化层存在数据一致性问题：

1. `save_state` 方法缺乏数据库事务，多个独立的数据库操作可能在中途失败导致状态不一致
2. `mastery_history` 和 `ensemble_performance` 字段在保存时被硬编码为 `None`，导致数据丢失
3. `load_state` 使用当前系统时间覆盖数据库的 `updatedAt` 时间戳，破坏时间线追踪

## What Changes

- **修复数据丢失**: 在 `user_state_to_row` 中正确映射 `mastery_history` 和 `ensemble_performance` 字段
- **修复时间戳**: `load_state` 使用数据库中的 `updatedAt` 而非 `Utc::now()`
- **添加事务支持**: 为 `save_state` 添加数据库事务包裹，确保原子性
- **清理冗余代码**: 移除 `get_or_init_models` 中重复创建 `UserModels` 的冗余代码

## Impact

- Affected specs: amas-persistence (新建)
- Affected code:
  - `packages/backend-rust/src/amas/persistence.rs` (主要修改)
  - `packages/backend-rust/src/amas/engine.rs` (冗余代码清理)
  - `packages/backend-rust/src/db/operations/amas.rs` (事务支持)
