## 1. 添加事务支持

- [x] 1.1 在 `db/operations/amas.rs` 中添加事务版本的操作方法：
  - `upsert_amas_user_state_tx(tx: &mut Transaction<'_, Postgres>, ...)`
  - `insert_amas_user_model_tx(tx: &mut Transaction<'_, Postgres>, ...)`
  - `get_amas_user_model_tx(tx: &mut Transaction<'_, Postgres>, ...)` (事务内读取)
- [x] 1.2 修改 `AMASPersistence::save_state` 使用事务包裹所有操作：
  - 获取事务: `let mut tx = pool.begin().await?`
  - 执行所有操作使用 `_tx` 版本方法
  - 成功时: `tx.commit().await?`
  - 失败时: 事务自动回滚 (Drop)
- [x] 1.3 修改 `save_strategy_snapshot` 接受事务引用作为参数

## 2. 修复数据丢失问题

- [x] 2.1 修改 `save_state` 方法：
  - 在调用 `user_state_to_row` 后，直接从 `state.mastery_history` 设置 `amas_state.mastery_history`
  - 从 `state.ensemble_performance` 设置 `amas_state.ensemble_performance`
  - 使用 `serde_json::to_value` 进行序列化，失败时设为 None
- [x] 2.2 修改 `load_state` 方法：
  - 从数据库行加载 `mastery_history` 字段
  - 从数据库行加载 `ensemble_performance` 字段
  - 使用 `serde_json::from_value` 进行反序列化

## 3. 修复时间戳问题

- [x] 3.1 修改 `load_state` 方法使用数据库的 `updatedAt`：
  - 使用 `chrono::DateTime::parse_from_rfc3339`
  - 解析失败时使用 `tracing::warn!` 记录警告
  - 回退到 `Utc::now().timestamp_millis()`

## 4. 清理冗余代码

- [x] 4.1 重构 `engine.rs` 中 `get_or_init_models` 方法，移除重复的 UserModels 创建

## 5. 验证

- [x] 5.1 代码编译通过 (`cargo check` 成功)
- [x] 5.2 PBT 测试：MasteryHistory JSON Round-Trip
- [x] 5.3 PBT 测试：PerformanceTracker JSON Round-Trip
- [x] 5.4 PBT 测试：PersistedAMASState JSON Round-Trip
- [x] 5.5 PBT 测试：Null-Safety for Optional Fields
- [x] 5.6 PBT 测试：Cognitive Profile Valid Range
- [x] 5.7 PBT 测试：Strategy Params Bounds Validation
- [x] 5.8 PBT 测试：MasteryHistory Order Preservation
- [x] 5.9 PBT 测试：PerformanceTracker Keys Preservation
- [x] 5.10 单元测试：Empty structures serialization
- [x] 5.11 单元测试：MasteryHistory max capacity
- [ ] 5.12 手动测试确认现有功能不受影响 (待部署后验证)
