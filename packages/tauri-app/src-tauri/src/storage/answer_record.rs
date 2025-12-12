//! 答题记录数据库操作模块
//!
//! 提供 AnswerRecord 的持久化操作，包括：
//! - 基本的 CRUD 操作
//! - 统计查询（每日统计、正确率、响应时间等）
//! - 同步相关操作（待上传、标记已上传等）

use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::storage::models::AnswerRecord;
use crate::storage::{StorageError, StorageResult};

/// 每日统计数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    /// 总答题数
    pub total_answers: i32,
    /// 正确答题数
    pub correct_answers: i32,
    /// 正确率 (0-1)
    pub accuracy: f64,
    /// 平均响应时间（毫秒）
    pub avg_response_time: f64,
    /// 复习的单词数
    pub words_reviewed: i32,
    /// 已掌握的单词数
    pub words_mastered: i32,
}

impl Default for DailyStats {
    fn default() -> Self {
        Self {
            total_answers: 0,
            correct_answers: 0,
            accuracy: 0.0,
            avg_response_time: 0.0,
            words_reviewed: 0,
            words_mastered: 0,
        }
    }
}

/// 答题记录仓库
///
/// 提供答题记录的数据库操作接口
pub struct AnswerRecordRepository {
    conn: Arc<Mutex<Connection>>,
}

impl AnswerRecordRepository {
    /// 创建新的仓库实例
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    // ========== 基本操作 ==========

    /// 保存单条答题记录
    pub fn save_record(&self, record: &AnswerRecord) -> StorageResult<()> {
        let conn = self.get_connection()?;
        record.insert(&conn)?;
        Ok(())
    }

    /// 批量保存答题记录
    pub fn save_records_batch(&self, records: &[AnswerRecord]) -> StorageResult<()> {
        if records.is_empty() {
            return Ok(());
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        for record in records {
            record.insert(&tx)?;
        }
        tx.commit()?;

        Ok(())
    }

    /// 获取指定单词的答题记录
    pub fn get_records_by_word(
        &self,
        user_id: &str,
        word_id: &str,
        limit: i32,
    ) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE user_id = ?1 AND word_id = ?2
            ORDER BY created_at DESC
            LIMIT ?3
            "#,
        )?;

        let records = stmt
            .query_map(params![user_id, word_id, limit], |row| {
                AnswerRecord::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 获取用户最近的答题记录
    pub fn get_recent_records(
        &self,
        user_id: &str,
        limit: i32,
    ) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE user_id = ?1
            ORDER BY created_at DESC
            LIMIT ?2
            "#,
        )?;

        let records = stmt
            .query_map(params![user_id, limit], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    // ========== 统计查询 ==========

    /// 获取今日统计数据
    pub fn get_today_stats(&self, user_id: &str) -> StorageResult<DailyStats> {
        let conn = self.get_connection()?;

        // 获取今日日期的开始时间 (UTC)
        let today = Utc::now().date_naive();
        let today_start = format!("{} 00:00:00", today.format("%Y-%m-%d"));
        let today_end = format!("{} 23:59:59", today.format("%Y-%m-%d"));

        // 查询今日答题统计
        let stats: Option<(i32, i32, f64)> = conn
            .query_row(
                r#"
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
                    AVG(response_time) as avg_time
                FROM answer_record
                WHERE user_id = ?1
                    AND created_at >= ?2
                    AND created_at <= ?3
                "#,
                params![user_id, today_start, today_end],
                |row| {
                    Ok((
                        row.get::<_, i32>(0)?,
                        row.get::<_, i32>(1).unwrap_or(0),
                        row.get::<_, f64>(2).unwrap_or(0.0),
                    ))
                },
            )
            .ok();

        let (total_answers, correct_answers, avg_response_time) = stats.unwrap_or((0, 0, 0.0));

        // 查询今日复习的不同单词数
        let words_reviewed: i32 = conn
            .query_row(
                r#"
                SELECT COUNT(DISTINCT word_id)
                FROM answer_record
                WHERE user_id = ?1
                    AND created_at >= ?2
                    AND created_at <= ?3
                "#,
                params![user_id, today_start, today_end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 查询今日新掌握的单词数（基于学习状态表）
        let words_mastered: i32 = conn
            .query_row(
                r#"
                SELECT COUNT(*)
                FROM word_learning_state
                WHERE user_id = ?1
                    AND is_mastered = 1
                    AND updated_at >= ?2
                    AND updated_at <= ?3
                "#,
                params![user_id, today_start, today_end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let accuracy = if total_answers > 0 {
            correct_answers as f64 / total_answers as f64
        } else {
            0.0
        };

        Ok(DailyStats {
            total_answers,
            correct_answers,
            accuracy,
            avg_response_time,
            words_reviewed,
            words_mastered,
        })
    }

    /// 获取指定单词的正确率
    pub fn get_accuracy_by_word(&self, user_id: &str, word_id: &str) -> StorageResult<f64> {
        let conn = self.get_connection()?;

        let result: Option<(i32, i32)> = conn
            .query_row(
                r#"
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
                FROM answer_record
                WHERE user_id = ?1 AND word_id = ?2
                "#,
                params![user_id, word_id],
                |row| Ok((row.get(0)?, row.get::<_, i32>(1).unwrap_or(0))),
            )
            .ok();

        match result {
            Some((total, correct)) if total > 0 => Ok(correct as f64 / total as f64),
            _ => Ok(0.0),
        }
    }

    /// 获取指定单词的平均响应时间
    pub fn get_average_response_time(&self, user_id: &str, word_id: &str) -> StorageResult<f64> {
        let conn = self.get_connection()?;

        let avg: f64 = conn
            .query_row(
                r#"
                SELECT COALESCE(AVG(response_time), 0.0)
                FROM answer_record
                WHERE user_id = ?1 AND word_id = ?2
                "#,
                params![user_id, word_id],
                |row| row.get::<_, f64>(0),
            )
            .unwrap_or(0.0);

        Ok(avg)
    }

    /// 获取连续正确/错误的次数
    ///
    /// # Arguments
    /// * `user_id` - 用户 ID
    /// * `word_id` - 单词 ID
    /// * `correct` - true 表示统计连续正确次数，false 表示统计连续错误次数
    pub fn get_streak_count(
        &self,
        user_id: &str,
        word_id: &str,
        correct: bool,
    ) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        // 获取该单词的答题记录（按时间倒序）
        let mut stmt = conn.prepare(
            r#"
            SELECT is_correct
            FROM answer_record
            WHERE user_id = ?1 AND word_id = ?2
            ORDER BY created_at DESC
            "#,
        )?;

        let expected_value = if correct { 1 } else { 0 };
        let mut streak = 0;

        let results = stmt.query_map(params![user_id, word_id], |row| row.get::<_, i32>(0))?;

        for result in results {
            if let Ok(is_correct) = result {
                if is_correct == expected_value {
                    streak += 1;
                } else {
                    break;
                }
            }
        }

        Ok(streak)
    }

    /// 获取指定日期范围的统计数据
    pub fn get_stats_by_date_range(
        &self,
        user_id: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> StorageResult<Vec<(NaiveDate, DailyStats)>> {
        let conn = self.get_connection()?;

        let start_str = format!("{} 00:00:00", start_date.format("%Y-%m-%d"));
        let end_str = format!("{} 23:59:59", end_date.format("%Y-%m-%d"));

        let mut stmt = conn.prepare(
            r#"
            SELECT
                date(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
                AVG(response_time) as avg_time,
                COUNT(DISTINCT word_id) as words_reviewed
            FROM answer_record
            WHERE user_id = ?1
                AND created_at >= ?2
                AND created_at <= ?3
            GROUP BY date(created_at)
            ORDER BY date ASC
            "#,
        )?;

        let results: Vec<(NaiveDate, DailyStats)> = stmt
            .query_map(params![user_id, start_str, end_str], |row| {
                let date_str: String = row.get(0)?;
                let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                    .unwrap_or_else(|_| Utc::now().date_naive());

                let total: i32 = row.get(1)?;
                let correct: i32 = row.get::<_, i32>(2).unwrap_or(0);
                let avg_time: f64 = row.get::<_, f64>(3).unwrap_or(0.0);
                let words_reviewed: i32 = row.get(4)?;

                let accuracy = if total > 0 {
                    correct as f64 / total as f64
                } else {
                    0.0
                };

                Ok((
                    date,
                    DailyStats {
                        total_answers: total,
                        correct_answers: correct,
                        accuracy,
                        avg_response_time: avg_time,
                        words_reviewed,
                        words_mastered: 0, // 需要额外查询
                    },
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    // ========== 同步相关 ==========

    /// 获取待上传的记录（未同步）
    pub fn get_pending_uploads(&self) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE is_synced = 0
            ORDER BY created_at ASC
            "#,
        )?;

        let records = stmt
            .query_map([], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 标记记录已上传
    pub fn mark_uploaded(&self, ids: &[String]) -> StorageResult<()> {
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
                r#"
                UPDATE answer_record
                SET is_synced = 1, synced_at = ?2
                WHERE id = ?1
                "#,
                params![id, now],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// 增加上传尝试次数
    ///
    /// 注意：answer_record 表本身没有 upload_attempts 字段，
    /// 这个方法通过更新 version 来跟踪重试
    pub fn increment_upload_attempts(&self, ids: &[String]) -> StorageResult<()> {
        if ids.is_empty() {
            return Ok(());
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;

        for id in ids {
            tx.execute(
                r#"
                UPDATE answer_record
                SET version = version + 1
                WHERE id = ?1
                "#,
                params![id],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// 获取上传失败的记录
    ///
    /// 根据 version 判断重试次数（version > 1 表示有重试）
    pub fn get_failed_uploads(&self, max_attempts: i32) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE is_synced = 0 AND version > 1 AND version <= ?1
            ORDER BY created_at ASC
            "#,
        )?;

        let records = stmt
            .query_map(params![max_attempts], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 获取带限制的待上传记录
    pub fn get_pending_uploads_with_limit(&self, limit: i32) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE is_synced = 0
            ORDER BY created_at ASC
            LIMIT ?1
            "#,
        )?;

        let records = stmt
            .query_map(params![limit], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    // ========== 辅助方法 ==========

    /// 获取数据库连接
    fn get_connection(&self) -> StorageResult<std::sync::MutexGuard<Connection>> {
        self.conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }

    /// 删除指定记录
    pub fn delete_record(&self, id: &str) -> StorageResult<bool> {
        let conn = self.get_connection()?;

        let affected = conn.execute("DELETE FROM answer_record WHERE id = ?1", params![id])?;

        Ok(affected > 0)
    }

    /// 删除用户的所有记录
    pub fn delete_all_user_records(&self, user_id: &str) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        let affected = conn.execute(
            "DELETE FROM answer_record WHERE user_id = ?1",
            params![user_id],
        )?;

        Ok(affected as i32)
    }

    /// 获取指定会话的所有记录
    pub fn get_records_by_session(&self, session_id: &str) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE session_id = ?1
            ORDER BY created_at ASC
            "#,
        )?;

        let records = stmt
            .query_map(params![session_id], |row| AnswerRecord::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 获取指定词书的答题记录
    pub fn get_records_by_word_book(
        &self,
        user_id: &str,
        word_book_id: &str,
        limit: i32,
    ) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE user_id = ?1 AND word_book_id = ?2
            ORDER BY created_at DESC
            LIMIT ?3
            "#,
        )?;

        let records = stmt
            .query_map(params![user_id, word_book_id, limit], |row| {
                AnswerRecord::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 获取未同步记录的数量
    pub fn get_pending_upload_count(&self) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM answer_record WHERE is_synced = 0",
            [],
            |row| row.get(0),
        )?;

        Ok(count)
    }

    /// 根据 ID 获取单条记录
    pub fn get_record_by_id(&self, id: &str) -> StorageResult<Option<AnswerRecord>> {
        let conn = self.get_connection()?;

        let result = conn.query_row(
            "SELECT * FROM answer_record WHERE id = ?1",
            params![id],
            |row| AnswerRecord::from_row(row),
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 获取指定时间范围内的记录
    pub fn get_records_by_time_range(
        &self,
        user_id: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let start_str = format_datetime(start_time);
        let end_str = format_datetime(end_time);

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE user_id = ?1
                AND created_at >= ?2
                AND created_at <= ?3
            ORDER BY created_at ASC
            "#,
        )?;

        let records = stmt
            .query_map(params![user_id, start_str, end_str], |row| {
                AnswerRecord::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    /// 获取指定题型的记录
    pub fn get_records_by_question_type(
        &self,
        user_id: &str,
        question_type: &str,
        limit: i32,
    ) -> StorageResult<Vec<AnswerRecord>> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM answer_record
            WHERE user_id = ?1 AND question_type = ?2
            ORDER BY created_at DESC
            LIMIT ?3
            "#,
        )?;

        let records = stmt
            .query_map(params![user_id, question_type, limit], |row| {
                AnswerRecord::from_row(row)
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }
}

/// 格式化日期时间为字符串
fn format_datetime(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::models::QuestionType;
    use crate::storage::Storage;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let storage = Storage::in_memory().expect("Failed to create in-memory storage");
        storage.connection()
    }

    fn create_test_record(user_id: &str, word_id: &str, is_correct: bool) -> AnswerRecord {
        AnswerRecord::new(
            user_id.to_string(),
            word_id.to_string(),
            "book-1".to_string(),
            QuestionType::Recognition,
            is_correct,
            if is_correct { 3 } else { 1 },
            2000,
        )
    }

    #[test]
    fn test_save_and_get_record() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        let records = repo
            .get_records_by_word("user-1", "word-1", 10)
            .expect("Failed to get records");

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, record.id);
        assert!(records[0].is_correct);
    }

    #[test]
    fn test_save_records_batch() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let records = vec![
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-2", false),
            create_test_record("user-1", "word-3", true),
        ];

        repo.save_records_batch(&records)
            .expect("Failed to save batch");

        let recent = repo
            .get_recent_records("user-1", 10)
            .expect("Failed to get recent records");

        assert_eq!(recent.len(), 3);
    }

    #[test]
    fn test_get_accuracy_by_word() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        // 保存 3 条记录：2 正确，1 错误
        let records = vec![
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-1", false),
        ];

        repo.save_records_batch(&records).unwrap();

        let accuracy = repo
            .get_accuracy_by_word("user-1", "word-1")
            .expect("Failed to get accuracy");

        // 2/3 = 0.666...
        assert!((accuracy - 0.6666666).abs() < 0.001);
    }

    #[test]
    fn test_get_streak_count() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        // 保存一系列记录：错误、正确、正确、正确
        let records = vec![
            create_test_record("user-1", "word-1", false),
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-1", true),
        ];

        repo.save_records_batch(&records).unwrap();

        let correct_streak = repo
            .get_streak_count("user-1", "word-1", true)
            .expect("Failed to get streak");

        // 最近连续正确 3 次
        assert_eq!(correct_streak, 3);
    }

    #[test]
    fn test_sync_operations() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        // 检查待上传
        let pending = repo.get_pending_uploads().expect("Failed to get pending");
        assert_eq!(pending.len(), 1);

        // 标记已上传
        repo.mark_uploaded(&[record.id.clone()])
            .expect("Failed to mark uploaded");

        // 再次检查待上传
        let pending = repo.get_pending_uploads().expect("Failed to get pending");
        assert_eq!(pending.len(), 0);
    }

    #[test]
    fn test_get_today_stats() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        // 保存今日记录
        let records = vec![
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-2", true),
            create_test_record("user-1", "word-3", false),
        ];

        repo.save_records_batch(&records).unwrap();

        let stats = repo
            .get_today_stats("user-1")
            .expect("Failed to get today stats");

        assert_eq!(stats.total_answers, 3);
        assert_eq!(stats.correct_answers, 2);
        assert_eq!(stats.words_reviewed, 3);
        assert!((stats.accuracy - 0.6666666).abs() < 0.001);
    }

    #[test]
    fn test_delete_record() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        let deleted = repo.delete_record(&record.id).expect("Failed to delete");
        assert!(deleted);

        let records = repo
            .get_records_by_word("user-1", "word-1", 10)
            .expect("Failed to get records");
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_get_pending_upload_count() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let records = vec![
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-2", true),
        ];

        repo.save_records_batch(&records).unwrap();

        let count = repo
            .get_pending_upload_count()
            .expect("Failed to get count");
        assert_eq!(count, 2);
    }

    #[test]
    fn test_get_record_by_id() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        let retrieved = repo
            .get_record_by_id(&record.id)
            .expect("Failed to get record");

        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, record.id);

        // 测试不存在的 ID
        let not_found = repo
            .get_record_by_id("non-existent-id")
            .expect("Failed to get record");
        assert!(not_found.is_none());
    }

    #[test]
    fn test_increment_upload_attempts() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        // 初始 version 应该是 1
        let before = repo.get_record_by_id(&record.id).unwrap().unwrap();
        assert_eq!(before.version, 1);

        // 增加尝试次数
        repo.increment_upload_attempts(&[record.id.clone()])
            .expect("Failed to increment");

        // version 应该变成 2
        let after = repo.get_record_by_id(&record.id).unwrap().unwrap();
        assert_eq!(after.version, 2);
    }

    #[test]
    fn test_get_failed_uploads() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let record = create_test_record("user-1", "word-1", true);
        repo.save_record(&record).expect("Failed to save record");

        // 初始状态不应该在失败列表中
        let failed = repo.get_failed_uploads(5).expect("Failed to get failed");
        assert_eq!(failed.len(), 0);

        // 增加尝试次数后应该出现在列表中
        repo.increment_upload_attempts(&[record.id.clone()])
            .unwrap();
        let failed = repo.get_failed_uploads(5).expect("Failed to get failed");
        assert_eq!(failed.len(), 1);
    }

    #[test]
    fn test_get_records_by_session() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        let mut record1 = create_test_record("user-1", "word-1", true);
        record1.session_id = Some("session-1".to_string());

        let mut record2 = create_test_record("user-1", "word-2", true);
        record2.session_id = Some("session-1".to_string());

        let mut record3 = create_test_record("user-1", "word-3", true);
        record3.session_id = Some("session-2".to_string());

        repo.save_records_batch(&[record1, record2, record3])
            .unwrap();

        let session1_records = repo
            .get_records_by_session("session-1")
            .expect("Failed to get records");
        assert_eq!(session1_records.len(), 2);

        let session2_records = repo
            .get_records_by_session("session-2")
            .expect("Failed to get records");
        assert_eq!(session2_records.len(), 1);
    }

    #[test]
    fn test_delete_all_user_records() {
        let conn = setup_test_db();
        let repo = AnswerRecordRepository::new(conn);

        // 创建多个用户的记录
        let records = vec![
            create_test_record("user-1", "word-1", true),
            create_test_record("user-1", "word-2", true),
            create_test_record("user-2", "word-1", true),
        ];

        repo.save_records_batch(&records).unwrap();

        // 删除 user-1 的所有记录
        let deleted_count = repo
            .delete_all_user_records("user-1")
            .expect("Failed to delete");
        assert_eq!(deleted_count, 2);

        // 验证 user-1 的记录已删除
        let user1_records = repo
            .get_recent_records("user-1", 10)
            .expect("Failed to get records");
        assert_eq!(user1_records.len(), 0);

        // 验证 user-2 的记录仍然存在
        let user2_records = repo
            .get_recent_records("user-2", 10)
            .expect("Failed to get records");
        assert_eq!(user2_records.len(), 1);
    }
}
