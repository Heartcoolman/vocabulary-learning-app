# backend-query Specification

## Purpose

TBD - created by archiving change optimize-learning-load. Update Purpose after archive.

## Requirements

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
