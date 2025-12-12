//! 同步队列数据库操作模块
//!
//! 提供同步队列的完整数据库操作支持，包括：
//! - 入队操作 (enqueue)
//! - 出队操作 (dequeue/peek)
//! - 状态管理 (mark_completed/mark_failed/retry_failed)
//! - 队列统计 (get_queue_stats)

use chrono::{Datelike, Utc};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::storage::models::SyncQueueItem;
use crate::storage::{StorageError, StorageResult};

/// 队列统计信息
#[derive(Debug, Clone, Default)]
pub struct QueueStats {
    /// 待处理数量
    pub pending: i32,
    /// 处理中数量
    pub processing: i32,
    /// 失败数量
    pub failed: i32,
    /// 今日完成数量
    pub completed_today: i32,
}

/// 同步队列仓储
///
/// 提供对同步队列的所有数据库操作
pub struct SyncQueueRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SyncQueueRepository {
    /// 创建新的同步队列仓储（使用 Arc<Mutex<Connection>>）
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    // ========== 入队操作 ==========

    /// 将单个项目入队
    ///
    /// # Arguments
    /// * `item` - 要入队的同步队列项
    ///
    /// # Returns
    /// * `StorageResult<i64>` - 新插入记录的 ID
    pub fn enqueue(&self, item: &SyncQueueItem) -> StorageResult<i64> {
        let conn = self.get_connection()?;
        item.enqueue(&conn)
    }

    /// 批量入队
    ///
    /// # Arguments
    /// * `items` - 要入队的同步队列项列表
    ///
    /// # Returns
    /// * `StorageResult<Vec<i64>>` - 新插入记录的 ID 列表
    pub fn enqueue_batch(&self, items: &[SyncQueueItem]) -> StorageResult<Vec<i64>> {
        if items.is_empty() {
            return Ok(Vec::new());
        }

        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        let mut ids = Vec::with_capacity(items.len());
        for item in items {
            let id = item.enqueue(&tx)?;
            ids.push(id);
        }
        tx.commit()?;

        Ok(ids)
    }

    /// 快速入队变更记录
    ///
    /// 便捷方法，用于快速创建并入队一个数据变更记录
    ///
    /// # Arguments
    /// * `table` - 目标表名
    /// * `record_id` - 记录 ID
    /// * `operation` - 操作类型 (insert/update/delete)
    /// * `payload` - 变更数据 (JSON 格式)
    ///
    /// # Returns
    /// * `StorageResult<i64>` - 新插入记录的 ID
    pub fn enqueue_change(
        &self,
        table: &str,
        record_id: &str,
        operation: &str,
        payload: &str,
    ) -> StorageResult<i64> {
        let item = SyncQueueItem::new(operation, table, record_id, payload);
        self.enqueue(&item)
    }

    // ========== 出队操作 ==========

    /// 出队指定数量的项目
    ///
    /// 获取并删除队列中优先级最高且最早创建的项目。
    /// 按优先级降序、创建时间升序排列。
    ///
    /// # Arguments
    /// * `limit` - 最大出队数量
    ///
    /// # Returns
    /// * `StorageResult<Vec<SyncQueueItem>>` - 出队的项目列表
    pub fn dequeue(&self, limit: i32) -> StorageResult<Vec<SyncQueueItem>> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;

        // 先查询要出队的项目
        let items = Self::query_pending_items_internal(&tx, limit)?;

        if items.is_empty() {
            tx.commit()?;
            return Ok(items);
        }

        // 删除这些项目
        let ids: Vec<i64> = items.iter().map(|i| i.id).collect();
        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "DELETE FROM sync_queue WHERE id IN ({})",
            placeholders.join(", ")
        );

        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        tx.execute(&sql, params.as_slice())?;

        tx.commit()?;
        Ok(items)
    }

    /// 查看队列中的项目（不删除）
    ///
    /// # Arguments
    /// * `limit` - 最大查看数量
    ///
    /// # Returns
    /// * `StorageResult<Vec<SyncQueueItem>>` - 队列中的项目列表
    pub fn peek(&self, limit: i32) -> StorageResult<Vec<SyncQueueItem>> {
        let conn = self.get_connection()?;
        Self::query_pending_items_internal(&conn, limit)
    }

    /// 查询待处理的队列项（内部方法）
    fn query_pending_items_internal(
        conn: &Connection,
        limit: i32,
    ) -> StorageResult<Vec<SyncQueueItem>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM sync_queue
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT ?1
            "#,
        )?;

        let items: Vec<SyncQueueItem> = stmt
            .query_map([limit], |row| SyncQueueItem::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(items)
    }

    // ========== 状态管理 ==========

    /// 标记项目为已完成
    ///
    /// # Arguments
    /// * `ids` - 要标记的项目 ID 列表
    ///
    /// # Returns
    /// * `StorageResult<usize>` - 实际更新的记录数
    pub fn mark_completed(&self, ids: &[i64]) -> StorageResult<usize> {
        if ids.is_empty() {
            return Ok(0);
        }

        let conn = self.get_connection()?;

        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i + 1)).collect();
        let sql = format!(
            r#"
            UPDATE sync_queue
            SET status = 'completed',
                completed_at = ?1,
                updated_at = ?1
            WHERE id IN ({})
            "#,
            placeholders.join(", ")
        );

        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&now];
        for id in ids {
            params_vec.push(id);
        }

        let affected = conn.execute(&sql, params_vec.as_slice())?;
        Ok(affected)
    }

    /// 标记项目为失败
    ///
    /// # Arguments
    /// * `id` - 要标记的项目 ID
    /// * `error` - 错误信息
    ///
    /// # Returns
    /// * `StorageResult<()>`
    pub fn mark_failed(&self, id: i64, error: &str) -> StorageResult<()> {
        let conn = self.get_connection()?;

        conn.execute(
            r#"
            UPDATE sync_queue
            SET status = 'failed',
                last_error = ?2,
                retry_count = retry_count + 1,
                updated_at = ?3
            WHERE id = ?1
            "#,
            params![
                id,
                error,
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            ],
        )?;

        Ok(())
    }

    /// 重试失败的项目
    ///
    /// 将未超过最大重试次数的失败项目重新设为待处理状态
    ///
    /// # Arguments
    /// * `max_retries` - 最大重试次数限制
    ///
    /// # Returns
    /// * `StorageResult<i32>` - 重试的项目数量
    pub fn retry_failed(&self, max_retries: i32) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        let affected = conn.execute(
            r#"
            UPDATE sync_queue
            SET status = 'pending',
                updated_at = ?1
            WHERE status = 'failed'
              AND retry_count < ?2
            "#,
            params![
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                max_retries
            ],
        )?;

        Ok(affected as i32)
    }

    /// 清理已完成的项目
    ///
    /// 删除所有状态为 completed 的记录
    ///
    /// # Returns
    /// * `StorageResult<usize>` - 删除的记录数
    pub fn clear_completed(&self) -> StorageResult<usize> {
        let conn = self.get_connection()?;

        let affected = conn.execute("DELETE FROM sync_queue WHERE status = 'completed'", [])?;

        Ok(affected)
    }

    // ========== 查询操作 ==========

    /// 获取待处理项目数量
    ///
    /// # Returns
    /// * `StorageResult<i32>` - 待处理数量
    pub fn get_pending_count(&self) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )?;

        Ok(count as i32)
    }

    /// 获取失败项目数量
    ///
    /// # Returns
    /// * `StorageResult<i32>` - 失败数量
    pub fn get_failed_count(&self) -> StorageResult<i32> {
        let conn = self.get_connection()?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
            [],
            |row| row.get(0),
        )?;

        Ok(count as i32)
    }

    /// 获取队列统计信息
    ///
    /// # Returns
    /// * `StorageResult<QueueStats>` - 队列统计信息
    pub fn get_queue_stats(&self) -> StorageResult<QueueStats> {
        let conn = self.get_connection()?;

        // 获取各状态的数量
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let processing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'processing'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let failed: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 获取今日完成数量
        let today = Utc::now();
        let today_start = format!(
            "{:04}-{:02}-{:02} 00:00:00",
            today.year(),
            today.month(),
            today.day()
        );

        let completed_today: i64 = conn
            .query_row(
                r#"
                SELECT COUNT(*) FROM sync_queue
                WHERE status = 'completed'
                  AND completed_at >= ?1
                "#,
                [&today_start],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(QueueStats {
            pending: pending as i32,
            processing: processing as i32,
            failed: failed as i32,
            completed_today: completed_today as i32,
        })
    }

    // ========== 辅助方法 ==========

    /// 获取数据库连接
    fn get_connection(&self) -> StorageResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }
}

/// 使用直接 Connection 引用的同步队列仓储
///
/// 适用于在事务中使用或需要更细粒度控制的场景
pub struct SyncQueueRepositoryRef<'a> {
    conn: &'a Connection,
}

impl<'a> SyncQueueRepositoryRef<'a> {
    /// 创建新的同步队列仓储（使用 Connection 引用）
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// 将单个项目入队
    pub fn enqueue(&self, item: &SyncQueueItem) -> StorageResult<i64> {
        item.enqueue(self.conn)
    }

    /// 批量入队（在事务中执行）
    pub fn enqueue_batch(&self, items: &[SyncQueueItem]) -> StorageResult<Vec<i64>> {
        if items.is_empty() {
            return Ok(Vec::new());
        }

        let mut ids = Vec::with_capacity(items.len());
        for item in items {
            let id = item.enqueue(self.conn)?;
            ids.push(id);
        }
        Ok(ids)
    }

    /// 快速入队变更记录
    pub fn enqueue_change(
        &self,
        table: &str,
        record_id: &str,
        operation: &str,
        payload: &str,
    ) -> StorageResult<i64> {
        let item = SyncQueueItem::new(operation, table, record_id, payload);
        self.enqueue(&item)
    }

    /// 查看队列中的项目（不删除）
    pub fn peek(&self, limit: i32) -> StorageResult<Vec<SyncQueueItem>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT * FROM sync_queue
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT ?1
            "#,
        )?;

        let items: Vec<SyncQueueItem> = stmt
            .query_map([limit], |row| SyncQueueItem::from_row(row))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(items)
    }

    /// 标记项目为已完成
    pub fn mark_completed(&self, ids: &[i64]) -> StorageResult<usize> {
        if ids.is_empty() {
            return Ok(0);
        }

        let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i + 1)).collect();
        let sql = format!(
            r#"
            UPDATE sync_queue
            SET status = 'completed',
                completed_at = ?1,
                updated_at = ?1
            WHERE id IN ({})
            "#,
            placeholders.join(", ")
        );

        let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&now];
        for id in ids {
            params_vec.push(id);
        }

        let affected = self.conn.execute(&sql, params_vec.as_slice())?;
        Ok(affected)
    }

    /// 标记项目为失败
    pub fn mark_failed(&self, id: i64, error: &str) -> StorageResult<()> {
        self.conn.execute(
            r#"
            UPDATE sync_queue
            SET status = 'failed',
                last_error = ?2,
                retry_count = retry_count + 1,
                updated_at = ?3
            WHERE id = ?1
            "#,
            params![
                id,
                error,
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
            ],
        )?;

        Ok(())
    }

    /// 重试失败的项目
    pub fn retry_failed(&self, max_retries: i32) -> StorageResult<i32> {
        let affected = self.conn.execute(
            r#"
            UPDATE sync_queue
            SET status = 'pending',
                updated_at = ?1
            WHERE status = 'failed'
              AND retry_count < ?2
            "#,
            params![
                Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                max_retries
            ],
        )?;

        Ok(affected as i32)
    }

    /// 清理已完成的项目
    pub fn clear_completed(&self) -> StorageResult<usize> {
        let affected = self
            .conn
            .execute("DELETE FROM sync_queue WHERE status = 'completed'", [])?;

        Ok(affected)
    }

    /// 获取待处理项目数量
    pub fn get_pending_count(&self) -> StorageResult<i32> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )?;

        Ok(count as i32)
    }

    /// 获取失败项目数量
    pub fn get_failed_count(&self) -> StorageResult<i32> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
            [],
            |row| row.get(0),
        )?;

        Ok(count as i32)
    }

    /// 获取队列统计信息
    pub fn get_queue_stats(&self) -> StorageResult<QueueStats> {
        let pending: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let processing: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'processing'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let failed: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let today = Utc::now();
        let today_start = format!(
            "{:04}-{:02}-{:02} 00:00:00",
            today.year(),
            today.month(),
            today.day()
        );

        let completed_today: i64 = self
            .conn
            .query_row(
                r#"
                SELECT COUNT(*) FROM sync_queue
                WHERE status = 'completed'
                  AND completed_at >= ?1
                "#,
                [&today_start],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(QueueStats {
            pending: pending as i32,
            processing: processing as i32,
            failed: failed as i32,
            completed_today: completed_today as i32,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrations;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )
        .unwrap();

        // 运行迁移
        migrations::run_migrations(&conn).expect("Failed to run migrations");

        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_enqueue_and_dequeue() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        // 入队
        let item = SyncQueueItem::new(
            "insert",
            "word_learning_state",
            "record-1",
            r#"{"data": "test"}"#,
        );
        let id = repo.enqueue(&item).expect("Enqueue should succeed");
        assert!(id > 0);

        // 出队
        let items = repo.dequeue(1).expect("Dequeue should succeed");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].record_id, "record-1");

        // 再次出队应该为空
        let items = repo.dequeue(1).expect("Dequeue should succeed");
        assert!(items.is_empty());
    }

    #[test]
    fn test_enqueue_batch() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let items: Vec<SyncQueueItem> = (1..=5)
            .map(|i| SyncQueueItem::new("update", "word", &format!("record-{}", i), "{}"))
            .collect();

        let ids = repo
            .enqueue_batch(&items)
            .expect("Batch enqueue should succeed");
        assert_eq!(ids.len(), 5);

        let count = repo.get_pending_count().expect("Get count should succeed");
        assert_eq!(count, 5);
    }

    #[test]
    fn test_enqueue_change() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let id = repo
            .enqueue_change("answer_record", "answer-1", "insert", r#"{"score": 100}"#)
            .expect("Enqueue change should succeed");
        assert!(id > 0);

        let items = repo.peek(1).expect("Peek should succeed");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].table_name, "answer_record");
        assert_eq!(items[0].operation, "insert");
    }

    #[test]
    fn test_peek_does_not_remove() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let item = SyncQueueItem::new("delete", "word", "word-1", "{}");
        repo.enqueue(&item).expect("Enqueue should succeed");

        // Peek 不应该删除项目
        let items1 = repo.peek(1).expect("Peek should succeed");
        let items2 = repo.peek(1).expect("Peek should succeed");

        assert_eq!(items1.len(), 1);
        assert_eq!(items2.len(), 1);
        assert_eq!(items1[0].id, items2[0].id);
    }

    #[test]
    fn test_dequeue_priority_order() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        // 创建不同优先级的项目
        let mut item1 = SyncQueueItem::new("insert", "table", "low-priority", "{}");
        item1.priority = 1;

        let mut item2 = SyncQueueItem::new("insert", "table", "high-priority", "{}");
        item2.priority = 10;

        let mut item3 = SyncQueueItem::new("insert", "table", "medium-priority", "{}");
        item3.priority = 5;

        // 按顺序入队
        repo.enqueue(&item1).unwrap();
        repo.enqueue(&item2).unwrap();
        repo.enqueue(&item3).unwrap();

        // 出队应该按优先级排序
        let items = repo.dequeue(3).expect("Dequeue should succeed");
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].record_id, "high-priority");
        assert_eq!(items[1].record_id, "medium-priority");
        assert_eq!(items[2].record_id, "low-priority");
    }

    #[test]
    fn test_mark_completed() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");

        // 标记完成
        let affected = repo
            .mark_completed(&[id])
            .expect("Mark completed should succeed");
        assert_eq!(affected, 1);

        // 待处理数量应该为 0
        let pending = repo.get_pending_count().expect("Get count should succeed");
        assert_eq!(pending, 0);
    }

    #[test]
    fn test_mark_failed() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");

        // 标记失败
        repo.mark_failed(id, "Network error")
            .expect("Mark failed should succeed");

        // 失败数量应该为 1
        let failed = repo.get_failed_count().expect("Get count should succeed");
        assert_eq!(failed, 1);

        // 待处理数量应该为 0
        let pending = repo.get_pending_count().expect("Get count should succeed");
        assert_eq!(pending, 0);
    }

    #[test]
    fn test_retry_failed() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        // 创建并标记为失败
        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");
        repo.mark_failed(id, "Error 1")
            .expect("Mark failed should succeed");

        // 重试
        let retried = repo.retry_failed(3).expect("Retry failed should succeed");
        assert_eq!(retried, 1);

        // 应该回到待处理状态
        let pending = repo.get_pending_count().expect("Get count should succeed");
        assert_eq!(pending, 1);

        let failed = repo.get_failed_count().expect("Get count should succeed");
        assert_eq!(failed, 0);
    }

    #[test]
    fn test_retry_failed_respects_max_retries() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");

        // 失败多次
        for i in 0..5 {
            repo.mark_failed(id, &format!("Error {}", i)).unwrap();
            repo.retry_failed(10).unwrap(); // 允许重试
        }

        // 现在 retry_count = 5，如果 max_retries = 3，不应该重试
        repo.mark_failed(id, "Final error").unwrap();
        let retried = repo.retry_failed(3).expect("Retry failed should succeed");
        assert_eq!(retried, 0); // retry_count 已经超过 max_retries
    }

    #[test]
    fn test_clear_completed() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        // 创建并完成项目
        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");
        repo.mark_completed(&[id])
            .expect("Mark completed should succeed");

        // 清理
        let cleared = repo
            .clear_completed()
            .expect("Clear completed should succeed");
        assert_eq!(cleared, 1);

        // 获取统计
        let stats = repo.get_queue_stats().expect("Get stats should succeed");
        assert_eq!(stats.completed_today, 0);
    }

    #[test]
    fn test_get_queue_stats() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        // 创建不同状态的项目
        let item1 = SyncQueueItem::new("insert", "table", "pending-1", "{}");
        let item2 = SyncQueueItem::new("insert", "table", "pending-2", "{}");
        let item3 = SyncQueueItem::new("insert", "table", "to-fail", "{}");
        let item4 = SyncQueueItem::new("insert", "table", "to-complete", "{}");

        repo.enqueue(&item1).unwrap();
        repo.enqueue(&item2).unwrap();
        let id3 = repo.enqueue(&item3).unwrap();
        let id4 = repo.enqueue(&item4).unwrap();

        repo.mark_failed(id3, "Error").unwrap();
        repo.mark_completed(&[id4]).unwrap();

        let stats = repo.get_queue_stats().expect("Get stats should succeed");
        assert_eq!(stats.pending, 2);
        assert_eq!(stats.failed, 1);
        assert_eq!(stats.completed_today, 1);
    }

    #[test]
    fn test_empty_batch_enqueue() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let ids = repo.enqueue_batch(&[]).expect("Empty batch should succeed");
        assert!(ids.is_empty());
    }

    #[test]
    fn test_mark_completed_empty() {
        let conn = setup_test_db();
        let repo = SyncQueueRepository::new(conn);

        let affected = repo.mark_completed(&[]).expect("Empty mark should succeed");
        assert_eq!(affected, 0);
    }

    #[test]
    fn test_sync_queue_repository_ref() {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )
        .unwrap();

        // 运行迁移
        migrations::run_migrations(&conn).expect("Failed to run migrations");

        // 使用 Ref 版本
        let repo = SyncQueueRepositoryRef::new(&conn);

        let item = SyncQueueItem::new("insert", "table", "record-1", "{}");
        let id = repo.enqueue(&item).expect("Enqueue should succeed");
        assert!(id > 0);

        let count = repo.get_pending_count().expect("Get count should succeed");
        assert_eq!(count, 1);
    }
}
