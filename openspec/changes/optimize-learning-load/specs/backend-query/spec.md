# Spec: backend-query

## MODIFIED Requirements

### Requirement: Eliminate Redundant Queries

Backend MUST eliminate redundant database queries in study-words endpoint.

#### Scenario: Config 参数传递

- **Given** 调用 `get_words_for_mastery_mode`
- **When** 获取用户配置后
- **Then** 将完整 `UserStudyConfig` 结构体作为参数传递给下游函数
- **And** 不再重复调用 `select_user_study_config` 或 `get_or_create_user_study_config`

#### Scenario: 查询次数验证

- **Given** 用户请求 `/api/learning/study-words`
- **When** 请求处理完成
- **Then** 数据库查询次数 ≤ 6 次
- **And** 响应时间 ≤ 300ms

#### Implementation Constraints

- 修改文件: `packages/backend-rust/src/services/mastery_learning.rs`
- 函数签名变更:

  ```rust
  // fetch_words_in_difficulty_range (line 760)
  async fn fetch_words_in_difficulty_range(
      proxy: &DatabaseProxy,
      user_id: &str,
      config: &UserStudyConfig,  // 新增参数，替代内部查询
      range: DifficultyRange,
      exclude_ids: &[String],
      count: usize,
  ) -> Result<Vec<LearningWord>, sqlx::Error>

  // fetch_words_with_strategy (如有类似问题)
  async fn fetch_words_with_strategy(
      proxy: &DatabaseProxy,
      user_id: &str,
      config: &UserStudyConfig,  // 新增参数
      // ... 其他参数
  ) -> Result<...>
  ```

- 移除 `fetch_words_in_difficulty_range` 第 767 行的 `get_or_create_user_study_config` 调用
- 调用方 `get_words_for_mastery_mode` 负责获取 config 并传递给所有下游函数

## Property-Based Testing

### PBT-1: Equivalence (重构正确性)

**[INVARIANT]** 新签名与旧实现产生相同结果

```
∀ user_id, range, exclude_ids, count:
  let config = get_or_create_user_study_config(proxy, user_id)
  old_fetch_words_in_difficulty_range(proxy, user_id, range, exclude_ids, count)
    ≡ new_fetch_words_in_difficulty_range(proxy, user_id, &config, range, exclude_ids, count)
```

**[FALSIFICATION STRATEGY]**

- 生成随机 user_id、difficulty range、exclude_ids
- 并行执行新旧实现，逐字段比较输出

### PBT-2: Query Count Bounds

**[INVARIANT]** 查询次数上界

```
∀ request to get_words_for_mastery_mode:
  query_count(request) ≤ 6
```

**[FALSIFICATION STRATEGY]**

- 使用 instrumented DB proxy 计数查询
- 生成各种用户状态（不同 wordbook 数量、study_mode）
- 验证所有情况下查询次数 ≤ 6

### PBT-3: Response Time Bounds

**[INVARIANT]** 响应时间上界

```
∀ request to get_words_for_mastery_mode:
  response_time(request) ≤ 300ms
```

**[FALSIFICATION STRATEGY]**

- 测量 wall-clock 时间
- 在不同数据量下验证（1-5 个 wordbook，10-100 个候选词）

### PBT-4: Config Immutability

**[INVARIANT]** Config 引用不可变

```
∀ config: &UserStudyConfig, ∀ f ∈ downstream_functions:
  let snapshot = config.clone()
  f(proxy, user_id, config, ...)
  => *config == snapshot
```

**[FALSIFICATION STRATEGY]**

- 调用前后 clone 比较所有字段
- 验证 selected_word_book_ids、study_mode 等未被修改
