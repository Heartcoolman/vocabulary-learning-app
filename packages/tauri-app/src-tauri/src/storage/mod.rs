//! SQLite 离线存储模块
//!
//! 提供本地 SQLite 数据库存储功能，支持：
//! - 单词学习状态的本地持久化
//! - 答题记录的离线存储
//! - 与云端的数据同步
//! - 冲突解决策略

// ============================================================
// 子模块声明
// ============================================================

pub mod answer_record;
pub mod learning_state;
pub mod migrations;
pub mod models;
pub mod sync;
pub mod sync_queue;
pub mod word;

// ============================================================
// 重新导出主要类型
// ============================================================

pub use answer_record::AnswerRecordRepository;
pub use learning_state::LearningStateRepository;
pub use migrations::run_migrations;
pub use models::*;
pub use sync::{ConflictStrategy, SyncEngine};
pub use sync_queue::{QueueStats, SyncQueueRepository, SyncQueueRepositoryRef};
pub use word::WordRepository;

// ============================================================
// 依赖导入
// ============================================================

use rusqlite::{Connection, Result as SqliteResult};
use std::path::Path;
use std::sync::{Arc, Mutex};
use thiserror::Error;

// ============================================================
// 错误类型定义
// ============================================================

/// 存储模块错误类型
#[derive(Error, Debug)]
pub enum StorageError {
    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("迁移错误: {0}")]
    Migration(String),

    #[error("同步错误: {0}")]
    Sync(String),

    #[error("序列化错误: {0}")]
    Serialization(String),

    #[error("网络错误: {0}")]
    Network(String),

    #[error("冲突解决失败: {0}")]
    ConflictResolution(String),

    #[error("数据未找到: {0}")]
    NotFound(String),

    #[error("锁获取失败: {0}")]
    LockError(String),
}

pub type StorageResult<T> = Result<T, StorageError>;

// ============================================================
// DatabaseManager - 数据库连接管理器
// ============================================================

/// 初始化 schema SQL
const INIT_SCHEMA: &str = include_str!("schema.sql");

/// 待同步记录数统计
#[derive(Debug, Clone, Default)]
pub struct PendingSyncCount {
    /// 待同步的学习状态数
    pub learning_states: i64,
    /// 待同步的答题记录数
    pub answer_records: i64,
    /// 同步队列中待处理的项数
    pub sync_queue: i64,
    /// 总计待同步记录数
    pub total: i64,
}

/// 数据库连接管理器
pub struct DatabaseManager {
    connection: Mutex<Connection>,
    db_path: String,
}

impl DatabaseManager {
    /// 创建新的数据库管理器
    ///
    /// 自动启用 WAL 模式、外键约束，并运行数据库迁移。
    ///
    /// # Arguments
    /// * `db_path` - 数据库文件路径
    ///
    /// # Returns
    /// * `StorageResult<Self>` - 数据库管理器实例
    ///
    /// # Example
    /// ```ignore
    /// let db = DatabaseManager::new("./data/app.db")?;
    /// ```
    pub fn new<P: AsRef<Path>>(db_path: P) -> StorageResult<Self> {
        let path_str = db_path.as_ref().to_string_lossy().to_string();
        let connection = Connection::open(&db_path)?;

        // 启用 WAL 模式以提高并发性能
        connection.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )?;

        let manager = Self {
            connection: Mutex::new(connection),
            db_path: path_str,
        };

        // 自动运行迁移
        manager.initialize()?;

        Ok(manager)
    }

    /// 创建内存数据库（用于测试）
    ///
    /// 内存数据库不使用 WAL 模式，但启用外键约束。
    pub fn in_memory() -> StorageResult<Self> {
        let connection = Connection::open_in_memory()?;

        connection.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )?;

        let manager = Self {
            connection: Mutex::new(connection),
            db_path: ":memory:".to_string(),
        };

        // 自动运行迁移
        manager.initialize()?;

        Ok(manager)
    }

    /// 初始化数据库（运行迁移）
    pub fn initialize(&self) -> StorageResult<()> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        migrations::run_migrations(&conn)?;
        Ok(())
    }

    /// 执行 schema.sql 初始化表结构
    ///
    /// 直接执行 schema.sql 文件内容，用于强制重新初始化表结构。
    /// 通常情况下应使用 `initialize()` 方法，它会通过迁移系统管理表结构。
    ///
    /// # Warning
    /// 此方法会执行完整的 schema.sql，如果表已存在可能会失败。
    /// 建议仅在需要重置数据库时使用。
    pub fn execute_schema(&self) -> StorageResult<()> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        conn.execute_batch(INIT_SCHEMA)
            .map_err(|e| StorageError::Migration(format!("执行 schema.sql 失败: {}", e)))?;

        Ok(())
    }

    /// 获取数据库连接的引用
    pub fn connection(&self) -> &Mutex<Connection> {
        &self.connection
    }

    /// 获取数据库连接的锁
    ///
    /// 这是获取连接的推荐方式，可以直接操作连接。
    pub fn get_connection(&self) -> StorageResult<std::sync::MutexGuard<Connection>> {
        self.connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }

    /// 获取数据库路径
    pub fn db_path(&self) -> &str {
        &self.db_path
    }

    /// 执行事务
    ///
    /// # Arguments
    /// * `f` - 在事务中执行的闭包
    ///
    /// # Returns
    /// * `StorageResult<T>` - 闭包返回值
    ///
    /// # Example
    /// ```ignore
    /// let result = db.transaction(|conn| {
    ///     conn.execute("INSERT INTO ...", [])?;
    ///     Ok(42)
    /// })?;
    /// ```
    pub fn transaction<F, T>(&self, f: F) -> StorageResult<T>
    where
        F: FnOnce(&Connection) -> StorageResult<T>,
    {
        let mut conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;

        Ok(result)
    }

    // ========== 同步元数据操作 ==========

    /// 获取同步元数据
    ///
    /// 从 sync_metadata 表中获取指定 key 的值。
    ///
    /// # Arguments
    /// * `key` - 元数据键名
    ///
    /// # Returns
    /// * `StorageResult<Option<String>>` - 元数据值，如果不存在则返回 None
    ///
    /// # Example
    /// ```ignore
    /// let last_sync = db.get_sync_metadata("last_sync_time")?;
    /// if let Some(time) = last_sync {
    ///     println!("上次同步时间: {}", time);
    /// }
    /// ```
    pub fn get_sync_metadata(&self, key: &str) -> StorageResult<Option<String>> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let result: Option<String> = conn
            .query_row(
                "SELECT value FROM sync_metadata WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .ok();

        Ok(result)
    }

    /// 设置同步元数据
    ///
    /// 在 sync_metadata 表中插入或更新指定 key 的值。
    ///
    /// # Arguments
    /// * `key` - 元数据键名
    /// * `value` - 元数据值
    ///
    /// # Returns
    /// * `StorageResult<()>` - 操作结果
    ///
    /// # Example
    /// ```ignore
    /// db.set_sync_metadata("last_sync_time", "2025-01-01T00:00:00Z")?;
    /// db.set_sync_metadata("sync_token", "abc123")?;
    /// ```
    pub fn set_sync_metadata(&self, key: &str, value: &str) -> StorageResult<()> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        conn.execute(
            "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
            [key, value],
        )?;

        Ok(())
    }

    /// 删除同步元数据
    ///
    /// 从 sync_metadata 表中删除指定 key。
    ///
    /// # Arguments
    /// * `key` - 元数据键名
    ///
    /// # Returns
    /// * `StorageResult<bool>` - 是否成功删除（true 表示删除了记录）
    pub fn delete_sync_metadata(&self, key: &str) -> StorageResult<bool> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let affected = conn.execute("DELETE FROM sync_metadata WHERE key = ?1", [key])?;

        Ok(affected > 0)
    }

    /// 获取待同步记录数
    ///
    /// 统计所有待同步的记录数量，包括：
    /// - 标记为 dirty 的学习状态
    /// - 未同步的答题记录
    /// - 同步队列中待处理的项
    ///
    /// # Returns
    /// * `StorageResult<PendingSyncCount>` - 待同步记录统计
    ///
    /// # Example
    /// ```ignore
    /// let pending = db.get_pending_sync_count()?;
    /// println!("待同步: {} 条学习状态, {} 条答题记录",
    ///     pending.learning_states, pending.answer_records);
    /// if pending.total > 0 {
    ///     println!("需要同步!");
    /// }
    /// ```
    pub fn get_pending_sync_count(&self) -> StorageResult<PendingSyncCount> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        // 统计待同步的学习状态
        let learning_states: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM word_learning_state WHERE is_dirty = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 统计未同步的答题记录
        let answer_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM answer_record WHERE is_synced = 0",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // 统计同步队列中待处理的项
        let sync_queue: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let total = learning_states + answer_records + sync_queue;

        Ok(PendingSyncCount {
            learning_states,
            answer_records,
            sync_queue,
            total,
        })
    }

    /// 检查是否有待同步的数据
    ///
    /// 快速检查是否有任何待同步的记录。
    ///
    /// # Returns
    /// * `StorageResult<bool>` - true 表示有待同步的数据
    pub fn has_pending_sync(&self) -> StorageResult<bool> {
        let pending = self.get_pending_sync_count()?;
        Ok(pending.total > 0)
    }

    /// 清除所有同步标记
    ///
    /// 将所有记录标记为已同步状态。
    ///
    /// # Warning
    /// 此操作会丢失所有待同步的状态标记，请谨慎使用。
    pub fn clear_sync_flags(&self) -> StorageResult<()> {
        let conn = self
            .connection
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        conn.execute_batch(
            "UPDATE word_learning_state SET is_dirty = 0 WHERE is_dirty = 1;
             UPDATE answer_record SET is_synced = 1 WHERE is_synced = 0;
             UPDATE sync_queue SET status = 'completed' WHERE status = 'pending';",
        )?;

        Ok(())
    }
}

// ============================================================
// StorageService - 存储服务（高级 API）
// ============================================================

/// 存储服务 - 提供高级 API
pub struct StorageService {
    db: DatabaseManager,
    sync_engine: sync::SyncEngine,
}

impl StorageService {
    /// 创建新的存储服务
    ///
    /// # Arguments
    /// * `db_path` - 数据库文件路径
    /// * `api_base_url` - 同步 API 基础 URL
    ///
    /// # Returns
    /// * `StorageResult<Self>` - 存储服务实例
    pub fn new<P: AsRef<Path>>(db_path: P, api_base_url: String) -> StorageResult<Self> {
        // DatabaseManager::new 会自动运行迁移
        let db = DatabaseManager::new(db_path)?;

        let sync_engine = sync::SyncEngine::new(api_base_url);

        Ok(Self { db, sync_engine })
    }

    /// 获取数据库管理器引用
    pub fn db(&self) -> &DatabaseManager {
        &self.db
    }

    /// 获取同步引擎引用
    pub fn sync_engine(&self) -> &sync::SyncEngine {
        &self.sync_engine
    }

    /// 执行完整同步
    pub async fn full_sync(&self, auth_token: &str) -> StorageResult<sync::SyncResult> {
        self.sync_engine.full_sync(&self.db, auth_token).await
    }

    // ========== 便捷方法：代理 DatabaseManager 的同步元数据方法 ==========

    /// 获取同步元数据
    pub fn get_sync_metadata(&self, key: &str) -> StorageResult<Option<String>> {
        self.db.get_sync_metadata(key)
    }

    /// 设置同步元数据
    pub fn set_sync_metadata(&self, key: &str, value: &str) -> StorageResult<()> {
        self.db.set_sync_metadata(key, value)
    }

    /// 获取待同步记录数
    pub fn get_pending_sync_count(&self) -> StorageResult<PendingSyncCount> {
        self.db.get_pending_sync_count()
    }

    /// 检查是否有待同步的数据
    pub fn has_pending_sync(&self) -> StorageResult<bool> {
        self.db.has_pending_sync()
    }
}

// ============================================================
// Storage - 统一存储结构体
// ============================================================

/// 统一存储结构体
///
/// 提供对所有 Repository 的便捷访问，适合作为 Tauri 状态使用。
pub struct Storage {
    conn: Arc<Mutex<Connection>>,
    db_path: String,
}

impl Storage {
    /// 创建新的 Storage 实例
    ///
    /// # Arguments
    /// * `db_path` - 数据库文件路径
    ///
    /// # Returns
    /// * `Result<Self, StorageError>` - Storage 实例
    pub fn new(db_path: &str) -> Result<Self, StorageError> {
        let connection = Connection::open(db_path)?;

        // 启用 WAL 模式以提高并发性能
        connection.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )?;

        let conn = Arc::new(Mutex::new(connection));

        // 运行迁移
        {
            let guard = conn
                .lock()
                .map_err(|e| StorageError::LockError(e.to_string()))?;
            migrations::run_migrations(&guard)?;
        }

        Ok(Self {
            conn,
            db_path: db_path.to_string(),
        })
    }

    /// 创建内存数据库（用于测试）
    pub fn in_memory() -> Result<Self, StorageError> {
        let connection = Connection::open_in_memory()?;

        connection.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA cache_size=-64000;",
        )?;

        let conn = Arc::new(Mutex::new(connection));

        // 运行迁移
        {
            let guard = conn
                .lock()
                .map_err(|e| StorageError::LockError(e.to_string()))?;
            migrations::run_migrations(&guard)?;
        }

        Ok(Self {
            conn,
            db_path: ":memory:".to_string(),
        })
    }

    /// 获取数据库连接
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    /// 获取数据库路径
    pub fn db_path(&self) -> &str {
        &self.db_path
    }

    /// 获取单词仓库
    pub fn words(&self) -> WordRepository {
        WordRepository::new(Arc::clone(&self.conn))
    }

    /// 获取学习状态仓库
    pub fn learning_states(&self) -> LearningStateRepository {
        LearningStateRepository::new(Arc::clone(&self.conn))
    }

    /// 获取答题记录仓库
    pub fn answer_records(&self) -> AnswerRecordRepository {
        AnswerRecordRepository::new(Arc::clone(&self.conn))
    }

    /// 获取同步队列仓库
    pub fn sync_queue(&self) -> SyncQueueRepository {
        SyncQueueRepository::new(Arc::clone(&self.conn))
    }

    /// 获取同步引擎
    pub fn sync_engine(&self, api_base_url: String) -> SyncEngine {
        SyncEngine::new(api_base_url)
    }

    /// 执行事务
    pub fn transaction<F, T>(&self, f: F) -> StorageResult<T>
    where
        F: FnOnce(&Connection) -> StorageResult<T>,
    {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))?;

        let tx = conn.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;

        Ok(result)
    }
}

// ============================================================
// StorageState - Tauri 状态包装
// ============================================================

/// Tauri 状态包装
///
/// 用于在 Tauri 应用中作为托管状态使用。
///
/// # Example
/// ```ignore
/// fn main() {
///     let storage = Storage::new("data.db").expect("Failed to create storage");
///     let storage_state = StorageState(Arc::new(Mutex::new(storage)));
///
///     tauri::Builder::default()
///         .manage(storage_state)
///         .run(tauri::generate_context!())
///         .expect("error while running tauri application");
/// }
/// ```
pub struct StorageState(pub Arc<Mutex<Storage>>);

impl StorageState {
    /// 创建新的 StorageState
    pub fn new(storage: Storage) -> Self {
        Self(Arc::new(Mutex::new(storage)))
    }

    /// 从数据库路径创建 StorageState
    pub fn from_path(db_path: &str) -> Result<Self, StorageError> {
        let storage = Storage::new(db_path)?;
        Ok(Self::new(storage))
    }

    /// 获取 Storage 的引用
    pub fn get(&self) -> Result<std::sync::MutexGuard<Storage>, StorageError> {
        self.0
            .lock()
            .map_err(|e| StorageError::LockError(e.to_string()))
    }
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_manager_in_memory() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");
        assert_eq!(db.db_path(), ":memory:");
    }

    #[test]
    fn test_get_connection() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");
        let conn = db.get_connection().expect("Failed to get connection");
        // 验证连接可用
        let result: i32 = conn.query_row("SELECT 1", [], |row| row.get(0)).unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn test_transaction() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        let result = db.transaction(|_conn| Ok(42));
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_sync_metadata_operations() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        // 测试设置和获取元数据
        db.set_sync_metadata("test_key", "test_value")
            .expect("Failed to set metadata");
        let value = db
            .get_sync_metadata("test_key")
            .expect("Failed to get metadata");
        assert_eq!(value, Some("test_value".to_string()));

        // 测试更新元数据
        db.set_sync_metadata("test_key", "updated_value")
            .expect("Failed to update metadata");
        let value = db
            .get_sync_metadata("test_key")
            .expect("Failed to get metadata");
        assert_eq!(value, Some("updated_value".to_string()));

        // 测试删除元数据
        let deleted = db
            .delete_sync_metadata("test_key")
            .expect("Failed to delete metadata");
        assert!(deleted);
        let value = db
            .get_sync_metadata("test_key")
            .expect("Failed to get metadata");
        assert_eq!(value, None);

        // 测试删除不存在的键
        let deleted = db
            .delete_sync_metadata("nonexistent_key")
            .expect("Failed to delete");
        assert!(!deleted);
    }

    #[test]
    fn test_get_sync_metadata_nonexistent() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        let value = db
            .get_sync_metadata("nonexistent_key")
            .expect("Failed to get metadata");
        assert_eq!(value, None);
    }

    #[test]
    fn test_get_pending_sync_count_empty() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        let pending = db
            .get_pending_sync_count()
            .expect("Failed to get pending sync count");
        assert_eq!(pending.learning_states, 0);
        assert_eq!(pending.answer_records, 0);
        assert_eq!(pending.sync_queue, 0);
        assert_eq!(pending.total, 0);
    }

    #[test]
    fn test_has_pending_sync_empty() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        let has_pending = db.has_pending_sync().expect("Failed to check pending sync");
        assert!(!has_pending);
    }

    #[test]
    fn test_get_pending_sync_count_with_data() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        // 插入测试数据
        {
            let conn = db.get_connection().expect("Failed to get connection");

            // 插入一个词书（外键约束需要）
            conn.execute(
                "INSERT INTO word_book (id, name) VALUES ('book-1', 'Test Book')",
                [],
            )
            .expect("Failed to insert word book");

            // 插入一个单词（外键约束需要）
            conn.execute(
                "INSERT INTO word (id, word_book_id, word, definition) VALUES ('word-1', 'book-1', 'test', '测试')",
                [],
            ).expect("Failed to insert word");

            // 插入待同步的学习状态
            conn.execute(
                "INSERT INTO word_learning_state (id, user_id, word_id, word_book_id, is_dirty) VALUES ('state-1', 'user-1', 'word-1', 'book-1', 1)",
                [],
            ).expect("Failed to insert learning state");

            // 插入未同步的答题记录
            conn.execute(
                "INSERT INTO answer_record (id, user_id, word_id, word_book_id, question_type, is_correct, rating, is_synced) VALUES ('record-1', 'user-1', 'word-1', 'book-1', 'recognition', 1, 3, 0)",
                [],
            ).expect("Failed to insert answer record");

            // 插入待处理的同步队列项
            conn.execute(
                "INSERT INTO sync_queue (operation, table_name, record_id, payload, status) VALUES ('update', 'word_learning_state', 'state-1', '{}', 'pending')",
                [],
            ).expect("Failed to insert sync queue item");
        }

        let pending = db
            .get_pending_sync_count()
            .expect("Failed to get pending sync count");
        assert_eq!(pending.learning_states, 1);
        assert_eq!(pending.answer_records, 1);
        assert_eq!(pending.sync_queue, 1);
        assert_eq!(pending.total, 3);

        let has_pending = db.has_pending_sync().expect("Failed to check pending sync");
        assert!(has_pending);
    }

    #[test]
    fn test_clear_sync_flags() {
        let db = DatabaseManager::in_memory().expect("Failed to create in-memory database");

        // 插入测试数据
        {
            let conn = db.get_connection().expect("Failed to get connection");

            conn.execute(
                "INSERT INTO word_book (id, name) VALUES ('book-1', 'Test Book')",
                [],
            )
            .expect("Failed to insert word book");

            conn.execute(
                "INSERT INTO word (id, word_book_id, word, definition) VALUES ('word-1', 'book-1', 'test', '测试')",
                [],
            ).expect("Failed to insert word");

            conn.execute(
                "INSERT INTO word_learning_state (id, user_id, word_id, word_book_id, is_dirty) VALUES ('state-1', 'user-1', 'word-1', 'book-1', 1)",
                [],
            ).expect("Failed to insert learning state");

            conn.execute(
                "INSERT INTO answer_record (id, user_id, word_id, word_book_id, question_type, is_correct, rating, is_synced) VALUES ('record-1', 'user-1', 'word-1', 'book-1', 'recognition', 1, 3, 0)",
                [],
            ).expect("Failed to insert answer record");

            conn.execute(
                "INSERT INTO sync_queue (operation, table_name, record_id, payload, status) VALUES ('update', 'word_learning_state', 'state-1', '{}', 'pending')",
                [],
            ).expect("Failed to insert sync queue item");
        }

        // 验证有待同步数据
        let pending_before = db.get_pending_sync_count().expect("Failed to get count");
        assert_eq!(pending_before.total, 3);

        // 清除同步标记
        db.clear_sync_flags().expect("Failed to clear sync flags");

        // 验证已清除
        let pending_after = db.get_pending_sync_count().expect("Failed to get count");
        assert_eq!(pending_after.total, 0);
    }

    #[test]
    fn test_storage_new_in_memory() {
        let storage = Storage::in_memory().expect("Failed to create in-memory storage");
        assert_eq!(storage.db_path(), ":memory:");
    }

    #[test]
    fn test_storage_state_creation() {
        let storage = Storage::in_memory().expect("Failed to create in-memory storage");
        let state = StorageState::new(storage);

        // 验证可以获取 Storage
        let guard = state.get().expect("Failed to get storage");
        assert_eq!(guard.db_path(), ":memory:");
    }

    #[test]
    fn test_storage_transaction() {
        let storage = Storage::in_memory().expect("Failed to create in-memory storage");

        let result = storage.transaction(|_conn| Ok(42));
        assert_eq!(result.unwrap(), 42);
    }
}
