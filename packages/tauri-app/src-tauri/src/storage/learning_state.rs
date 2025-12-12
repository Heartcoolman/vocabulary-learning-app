//! 学习状态数据库操作模块
//!
//! 提供 WordLearningState 的完整 CRUD 操作、批量操作、查询方法和同步支持。

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::storage::models::WordLearningState;
use crate::storage::{StorageError, StorageResult};

// ============================================================
// LearningStats - 学习统计数据
// ============================================================

/// 学习统计数据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LearningStats {
    /// 总单词数
    pub total_words: i32,
    /// 新单词数 (state = 0)
    pub new_words: i32,
    /// 学习中的单词数 (state = 1)
    pub learning_words: i32,
    /// 复习中的单词数 (state = 2)
    pub review_words: i32,
    /// 重学中的单词数 (state = 3)
    pub relearning_words: i32,
    /// 已掌握的单词数
    pub mastered_words: i32,
    /// 难词数量
    pub difficult_words: i32,
    /// 收藏单词数
    pub favorite_words: i32,
    /// 今日待复习数
    pub due_today: i32,
    /// 过期未复习数
    pub overdue: i32,
    /// 总复习次数
    pub total_reviews: i64,
    /// 总正确次数
    pub total_correct: i64,
    /// 平均正确率
    pub accuracy_rate: f64,
    /// 总学习时间 (毫秒)
    pub total_time_spent: i64,
    /// 平均掌握等级
    pub avg_mastery_level: f64,
    /// 平均记忆保持率
    pub avg_retention_score: f64,
}

// ============================================================
// LearningStateRepository - 学习状态仓储
// ============================================================

/// 学习状态仓储
///
/// 提供 WordLearningState 的数据库操作方法
pub struct LearningStateRepository {
    conn: Arc<Mutex<Connection>>,
}

impl LearningStateRepository {
    /// 创建新的仓储实例
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    // ========== 基本 CRUD 操作 ==========

    /// 获取单个学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `word_id` - 单词 ID
    ///
    /// # Returns
    /// * `Option<WordLearningState>` - 学习状态，如果不存在则返回 None
    pub fn get_state(
        &self,
        user_id: &str,
        word_id: &str,
    ) -> StorageResult<Option<WordLearningState>> {
        let conn = self.get_connection()?;

        let state = conn
            .query_row(
                "SELECT * FROM word_learning_state WHERE user_id = ?1 AND word_id = ?2",
                params![user_id, word_id],
                |row| WordLearningState::from_row(row),
            )
            .optional()?;

        Ok(state)
    }

    /// 获取用户的所有学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 学习状态列表
    pub fn get_states_by_user(&self, user_id: &str) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT * FROM word_learning_state WHERE user_id = ?1 ORDER BY updated_at DESC",
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id], |row| WordLearningState::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 保存学习状态 (插入或更新)
    ///
    /// # Arguments
    /// * `state` - 学习状态
    pub fn save_state(&self, state: &WordLearningState) -> StorageResult<()> {
        let conn = self.get_connection()?;
        state.upsert(&conn)?;
        Ok(())
    }

    /// 更新学习状态 (带版本检查)
    ///
    /// 使用乐观锁机制，只有当数据库中的版本号与传入的版本号匹配时才更新
    ///
    /// # Arguments
    /// * `state` - 学习状态
    ///
    /// # Returns
    /// * `bool` - 是否更新成功 (false 表示版本冲突)
    pub fn update_state(&self, state: &WordLearningState) -> StorageResult<bool> {
        let conn = self.get_connection()?;

        let expected_version = state.version - 1;

        let rows_affected = conn.execute(
            r#"
            UPDATE word_learning_state SET
                stability = ?1,
                difficulty = ?2,
                elapsed_days = ?3,
                scheduled_days = ?4,
                reps = ?5,
                lapses = ?6,
                state = ?7,
                mastery_level = ?8,
                retention_score = ?9,
                is_mastered = ?10,
                is_difficult = ?11,
                is_favorite = ?12,
                first_learned_at = ?13,
                last_reviewed_at = ?14,
                next_review_at = ?15,
                due_date = ?16,
                total_reviews = ?17,
                correct_count = ?18,
                wrong_count = ?19,
                total_time_spent = ?20,
                avg_response_time = ?21,
                version = ?22,
                cloud_version = ?23,
                is_dirty = ?24,
                updated_at = ?25,
                synced_at = ?26
            WHERE user_id = ?27 AND word_id = ?28 AND version = ?29
            "#,
            params![
                state.stability,
                state.difficulty,
                state.elapsed_days,
                state.scheduled_days,
                state.reps,
                state.lapses,
                state.state,
                state.mastery_level,
                state.retention_score,
                state.is_mastered as i32,
                state.is_difficult as i32,
                state.is_favorite as i32,
                state.first_learned_at.map(format_datetime),
                state.last_reviewed_at.map(format_datetime),
                state.next_review_at.map(format_datetime),
                state.due_date,
                state.total_reviews,
                state.correct_count,
                state.wrong_count,
                state.total_time_spent,
                state.avg_response_time,
                state.version,
                state.cloud_version,
                state.is_dirty as i32,
                format_datetime(state.updated_at),
                state.synced_at.map(format_datetime),
                state.user_id,
                state.word_id,
                expected_version,
            ],
        )?;

        Ok(rows_affected > 0)
    }

    /// 删除学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `word_id` - 单词 ID
    pub fn delete_state(&self, user_id: &str, word_id: &str) -> StorageResult<()> {
        let conn = self.get_connection()?;

        conn.execute(
            "DELETE FROM word_learning_state WHERE user_id = ?1 AND word_id = ?2",
            params![user_id, word_id],
        )?;

        Ok(())
    }

    // ========== 批量操作 ==========

    /// 根据单词 ID 列表获取学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `word_ids` - 单词 ID 列表
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 学习状态列表
    pub fn get_states_by_word_ids(
        &self,
        user_id: &str,
        word_ids: &[String],
    ) -> StorageResult<Vec<WordLearningState>> {
        if word_ids.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.get_connection()?;

        // 构建 IN 子句的占位符
        let placeholders: Vec<String> =
            (0..word_ids.len()).map(|i| format!("?{}", i + 2)).collect();
        let placeholders_str = placeholders.join(", ");

        let sql = format!(
            "SELECT * FROM word_learning_state WHERE user_id = ?1 AND word_id IN ({}) ORDER BY updated_at DESC",
            placeholders_str
        );

        let mut stmt = conn.prepare(&sql)?;

        // 构建参数
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&user_id as &dyn rusqlite::ToSql];
        for word_id in word_ids {
            params_vec.push(word_id as &dyn rusqlite::ToSql);
        }

        let states: Vec<WordLearningState> = stmt
            .query_map(params_vec.as_slice(), |row| {
                WordLearningState::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 批量保存学习状态
    ///
    /// 使用事务确保原子性
    ///
    /// # Arguments
    /// * `states` - 学习状态列表
    pub fn save_states_batch(&self, states: &[WordLearningState]) -> StorageResult<()> {
        if states.is_empty() {
            return Ok(());
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        for state in states {
            state.upsert(&tx)?;
        }
        tx.commit()?;

        Ok(())
    }

    // ========== 查询方法 ==========

    /// 获取待复习的单词
    ///
    /// 返回 next_review_at <= 当前时间 的单词
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `limit` - 返回数量限制
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 待复习的学习状态列表
    pub fn get_due_words(
        &self,
        user_id: &str,
        limit: i32,
    ) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;
        let now = format_datetime(Utc::now());

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM word_learning_state
            WHERE user_id = ?1
                AND next_review_at IS NOT NULL
                AND next_review_at <= ?2
            ORDER BY next_review_at ASC
            LIMIT ?3
            "#,
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id, now, limit], |row| {
                WordLearningState::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 获取新单词
    ///
    /// 返回尚未学习过的单词 (state = 0)
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `book_id` - 词书 ID
    /// * `limit` - 返回数量限制
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 新单词的学习状态列表
    pub fn get_new_words(
        &self,
        user_id: &str,
        book_id: &str,
        limit: i32,
    ) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM word_learning_state
            WHERE user_id = ?1
                AND word_book_id = ?2
                AND state = 0
            ORDER BY created_at ASC
            LIMIT ?3
            "#,
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id, book_id, limit], |row| {
                WordLearningState::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 根据掌握等级获取学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `min_level` - 最低掌握等级
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 满足条件的学习状态列表
    pub fn get_states_by_mastery(
        &self,
        user_id: &str,
        min_level: i32,
    ) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM word_learning_state
            WHERE user_id = ?1 AND mastery_level >= ?2
            ORDER BY mastery_level DESC, updated_at DESC
            "#,
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id, min_level], |row| {
                WordLearningState::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 获取学习统计数据
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    ///
    /// # Returns
    /// * `LearningStats` - 学习统计数据
    pub fn get_learning_statistics(&self, user_id: &str) -> StorageResult<LearningStats> {
        let conn = self.get_connection()?;
        let now = format_datetime(Utc::now());
        let today_start = format_datetime(
            Utc::now()
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .map(|dt| DateTime::from_naive_utc_and_offset(dt, Utc))
                .unwrap_or_else(Utc::now),
        );
        let today_end = format_datetime(
            Utc::now()
                .date_naive()
                .and_hms_opt(23, 59, 59)
                .map(|dt| DateTime::from_naive_utc_and_offset(dt, Utc))
                .unwrap_or_else(Utc::now),
        );

        let mut stats = LearningStats::default();

        // 基础统计
        stats.total_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 按状态统计
        stats.new_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND state = 0",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        stats.learning_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND state = 1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        stats.review_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND state = 2",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        stats.relearning_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND state = 3",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 特殊标记统计
        stats.mastered_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND is_mastered = 1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        stats.difficult_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND is_difficult = 1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        stats.favorite_words = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE user_id = ?1 AND is_favorite = 1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 今日待复习
        stats.due_today = conn
            .query_row(
                r#"
            SELECT COUNT(*) FROM word_learning_state
            WHERE user_id = ?1
                AND next_review_at IS NOT NULL
                AND next_review_at >= ?2
                AND next_review_at <= ?3
            "#,
                params![user_id, today_start, today_end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 过期未复习
        stats.overdue = conn
            .query_row(
                r#"
            SELECT COUNT(*) FROM word_learning_state
            WHERE user_id = ?1
                AND next_review_at IS NOT NULL
                AND next_review_at < ?2
            "#,
                params![user_id, now],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 聚合统计
        let aggregate_stats: (i64, i64, i64) = conn
            .query_row(
                r#"
            SELECT
                COALESCE(SUM(total_reviews), 0),
                COALESCE(SUM(correct_count), 0),
                COALESCE(SUM(total_time_spent), 0)
            FROM word_learning_state
            WHERE user_id = ?1
            "#,
                params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap_or((0, 0, 0));

        stats.total_reviews = aggregate_stats.0;
        stats.total_correct = aggregate_stats.1;
        stats.total_time_spent = aggregate_stats.2;

        // 计算正确率
        if stats.total_reviews > 0 {
            stats.accuracy_rate = stats.total_correct as f64 / stats.total_reviews as f64;
        }

        // 平均掌握等级和记忆保持率
        let avg_stats: (f64, f64) = conn
            .query_row(
                r#"
            SELECT
                COALESCE(AVG(mastery_level), 0.0),
                COALESCE(AVG(retention_score), 0.0)
            FROM word_learning_state
            WHERE user_id = ?1
            "#,
                params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap_or((0.0, 0.0));

        stats.avg_mastery_level = avg_stats.0;
        stats.avg_retention_score = avg_stats.1;

        Ok(stats)
    }

    // ========== 同步相关 ==========

    /// 获取有未同步修改的学习状态
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 待同步的学习状态列表
    pub fn get_dirty_states(&self, user_id: &str) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT * FROM word_learning_state WHERE user_id = ?1 AND is_dirty = 1 ORDER BY updated_at ASC",
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id], |row| WordLearningState::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    /// 标记学习状态为已同步
    ///
    /// # Arguments
    /// * `ids` - 学习状态 ID 列表
    pub fn mark_states_synced(&self, ids: &[String]) -> StorageResult<()> {
        if ids.is_empty() {
            return Ok(());
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        let now = format_datetime(Utc::now());

        for id in ids {
            tx.execute(
                "UPDATE word_learning_state SET is_dirty = 0, synced_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// 获取指定版本号之后的学习状态
    ///
    /// 用于增量同步
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `min_version` - 最小版本号 (不包含)
    ///
    /// # Returns
    /// * `Vec<WordLearningState>` - 版本号大于 min_version 的学习状态列表
    pub fn get_states_since_version(
        &self,
        user_id: &str,
        min_version: i64,
    ) -> StorageResult<Vec<WordLearningState>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM word_learning_state
            WHERE user_id = ?1 AND version > ?2
            ORDER BY version ASC
            "#,
        )?;

        let states: Vec<WordLearningState> = stmt
            .query_map(params![user_id, min_version], |row| {
                WordLearningState::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(states)
    }

    // ========== 辅助方法 ==========

    /// 获取数据库连接
    fn get_connection(&self) -> StorageResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }
}

// ============================================================
// 辅助函数
// ============================================================

/// 格式化日期时间为字符串
fn format_datetime(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

// ============================================================
// 单元测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrations;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory connection");

        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .expect("Failed to set pragma");

        migrations::run_migrations(&conn).expect("Failed to run migrations");

        Arc::new(Mutex::new(conn))
    }

    fn create_test_state(user_id: &str, word_id: &str, book_id: &str) -> WordLearningState {
        WordLearningState::new(
            user_id.to_string(),
            word_id.to_string(),
            book_id.to_string(),
        )
    }

    #[test]
    fn test_save_and_get_state() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        let state = create_test_state("user-1", "word-1", "book-1");

        repo.save_state(&state).expect("Failed to save state");

        let retrieved = repo
            .get_state("user-1", "word-1")
            .expect("Failed to get state")
            .expect("State not found");

        assert_eq!(retrieved.user_id, "user-1");
        assert_eq!(retrieved.word_id, "word-1");
        assert_eq!(retrieved.word_book_id, "book-1");
    }

    #[test]
    fn test_get_states_by_user() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        // 保存多个状态
        for i in 1..=3 {
            let state = create_test_state("user-1", &format!("word-{}", i), "book-1");
            repo.save_state(&state).expect("Failed to save state");
        }

        // 另一个用户的状态
        let other_state = create_test_state("user-2", "word-1", "book-1");
        repo.save_state(&other_state).expect("Failed to save state");

        let states = repo
            .get_states_by_user("user-1")
            .expect("Failed to get states");

        assert_eq!(states.len(), 3);
        assert!(states.iter().all(|s| s.user_id == "user-1"));
    }

    #[test]
    fn test_update_state_with_version_check() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        let mut state = create_test_state("user-1", "word-1", "book-1");
        repo.save_state(&state).expect("Failed to save state");

        // 更新状态
        state.mastery_level = 3;
        state.version += 1;

        let success = repo.update_state(&state).expect("Failed to update state");
        assert!(success);

        // 尝试使用旧版本更新 (应该失败)
        let stale_update = repo.update_state(&state).expect("Failed to update state");
        assert!(!stale_update);
    }

    #[test]
    fn test_delete_state() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        let state = create_test_state("user-1", "word-1", "book-1");
        repo.save_state(&state).expect("Failed to save state");

        repo.delete_state("user-1", "word-1")
            .expect("Failed to delete state");

        let retrieved = repo
            .get_state("user-1", "word-1")
            .expect("Failed to get state");
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_get_states_by_word_ids() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        for i in 1..=5 {
            let state = create_test_state("user-1", &format!("word-{}", i), "book-1");
            repo.save_state(&state).expect("Failed to save state");
        }

        let word_ids = vec![
            "word-1".to_string(),
            "word-3".to_string(),
            "word-5".to_string(),
        ];

        let states = repo
            .get_states_by_word_ids("user-1", &word_ids)
            .expect("Failed to get states");

        assert_eq!(states.len(), 3);
    }

    #[test]
    fn test_save_states_batch() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        let states: Vec<WordLearningState> = (1..=10)
            .map(|i| create_test_state("user-1", &format!("word-{}", i), "book-1"))
            .collect();

        repo.save_states_batch(&states)
            .expect("Failed to save batch");

        let all_states = repo
            .get_states_by_user("user-1")
            .expect("Failed to get states");
        assert_eq!(all_states.len(), 10);
    }

    #[test]
    fn test_get_due_words() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        // 创建一个到期的单词
        let mut due_state = create_test_state("user-1", "word-due", "book-1");
        due_state.next_review_at = Some(Utc::now() - chrono::Duration::hours(1));
        due_state.state = 2;
        repo.save_state(&due_state).expect("Failed to save state");

        // 创建一个未到期的单词
        let mut future_state = create_test_state("user-1", "word-future", "book-1");
        future_state.next_review_at = Some(Utc::now() + chrono::Duration::days(1));
        future_state.state = 2;
        repo.save_state(&future_state)
            .expect("Failed to save state");

        let due_words = repo
            .get_due_words("user-1", 10)
            .expect("Failed to get due words");

        assert_eq!(due_words.len(), 1);
        assert_eq!(due_words[0].word_id, "word-due");
    }

    #[test]
    fn test_get_new_words() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        // 创建新单词
        let new_state = create_test_state("user-1", "word-new", "book-1");
        repo.save_state(&new_state).expect("Failed to save state");

        // 创建已学习的单词
        let mut learned_state = create_test_state("user-1", "word-learned", "book-1");
        learned_state.state = 2;
        repo.save_state(&learned_state)
            .expect("Failed to save state");

        let new_words = repo
            .get_new_words("user-1", "book-1", 10)
            .expect("Failed to get new words");

        assert_eq!(new_words.len(), 1);
        assert_eq!(new_words[0].word_id, "word-new");
    }

    #[test]
    fn test_get_states_by_mastery() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        for i in 0..=5 {
            let mut state = create_test_state("user-1", &format!("word-{}", i), "book-1");
            state.mastery_level = i;
            repo.save_state(&state).expect("Failed to save state");
        }

        let high_mastery = repo
            .get_states_by_mastery("user-1", 3)
            .expect("Failed to get states");

        assert_eq!(high_mastery.len(), 3); // mastery levels 3, 4, 5
    }

    #[test]
    fn test_get_learning_statistics() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        // 创建一些测试数据
        let mut state1 = create_test_state("user-1", "word-1", "book-1");
        state1.state = 0; // New
        state1.total_reviews = 0;
        repo.save_state(&state1).expect("Failed to save state");

        let mut state2 = create_test_state("user-1", "word-2", "book-1");
        state2.state = 2; // Review
        state2.total_reviews = 5;
        state2.correct_count = 4;
        state2.is_mastered = true;
        repo.save_state(&state2).expect("Failed to save state");

        let stats = repo
            .get_learning_statistics("user-1")
            .expect("Failed to get statistics");

        assert_eq!(stats.total_words, 2);
        assert_eq!(stats.new_words, 1);
        assert_eq!(stats.review_words, 1);
        assert_eq!(stats.mastered_words, 1);
        assert_eq!(stats.total_reviews, 5);
        assert_eq!(stats.total_correct, 4);
    }

    #[test]
    fn test_get_dirty_states() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        // 创建脏状态
        let dirty_state = create_test_state("user-1", "word-dirty", "book-1");
        repo.save_state(&dirty_state).expect("Failed to save state");

        // 创建已同步状态
        let mut synced_state = create_test_state("user-1", "word-synced", "book-1");
        synced_state.is_dirty = false;
        repo.save_state(&synced_state)
            .expect("Failed to save state");

        let dirty_states = repo
            .get_dirty_states("user-1")
            .expect("Failed to get dirty states");

        assert_eq!(dirty_states.len(), 1);
        assert_eq!(dirty_states[0].word_id, "word-dirty");
    }

    #[test]
    fn test_mark_states_synced() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        let state = create_test_state("user-1", "word-1", "book-1");
        repo.save_state(&state).expect("Failed to save state");

        repo.mark_states_synced(&[state.id.clone()])
            .expect("Failed to mark synced");

        let retrieved = repo
            .get_state("user-1", "word-1")
            .expect("Failed to get state")
            .expect("State not found");

        assert!(!retrieved.is_dirty);
        assert!(retrieved.synced_at.is_some());
    }

    #[test]
    fn test_get_states_since_version() {
        let conn = setup_test_db();
        let repo = LearningStateRepository::new(conn);

        for i in 1..=5 {
            let mut state = create_test_state("user-1", &format!("word-{}", i), "book-1");
            state.version = i;
            repo.save_state(&state).expect("Failed to save state");
        }

        let states = repo
            .get_states_since_version("user-1", 3)
            .expect("Failed to get states");

        assert_eq!(states.len(), 2); // versions 4 and 5
    }
}
