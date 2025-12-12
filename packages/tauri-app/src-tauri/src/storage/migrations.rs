//! 数据库迁移模块
//!
//! 管理 SQLite 数据库的版本迁移，确保数据库结构与应用版本保持一致。
//!
//! ## 迁移策略
//! - 每个迁移在独立事务中执行
//! - 支持增量迁移和回滚
//! - 迁移记录存储在 schema_migrations 表中

use rusqlite::Connection;

use crate::storage::{StorageError, StorageResult};

/// 当前数据库 schema 版本
pub const CURRENT_SCHEMA_VERSION: i32 = 3;

/// 初始化 schema SQL (V1)
const INIT_SCHEMA: &str = include_str!("schema.sql");

/// 迁移记录
#[derive(Debug, Clone)]
pub struct Migration {
    /// 迁移版本号
    pub version: i32,
    /// 迁移名称/描述
    pub name: String,
    /// 迁移 SQL 语句
    pub sql: String,
}

impl Migration {
    /// 创建新的迁移
    pub fn new(version: i32, name: impl Into<String>, sql: impl Into<String>) -> Self {
        Self {
            version,
            name: name.into(),
            sql: sql.into(),
        }
    }
}

/// 获取所有迁移定义
///
/// 返回按版本号排序的迁移列表
pub fn get_migrations() -> Vec<Migration> {
    vec![
        // V1: 初始表结构
        Migration::new(1, "初始表结构", INIT_SCHEMA),
        // V2: 添加索引优化
        Migration::new(
            2,
            "添加索引优化",
            r#"
            -- 复合索引优化查询性能
            CREATE INDEX IF NOT EXISTS idx_wls_user_due_state
                ON word_learning_state(user_id, due_date, state);

            CREATE INDEX IF NOT EXISTS idx_wls_user_mastery_state
                ON word_learning_state(user_id, mastery_level, state);

            CREATE INDEX IF NOT EXISTS idx_ar_user_correct
                ON answer_record(user_id, is_correct, created_at);

            CREATE INDEX IF NOT EXISTS idx_word_book_difficulty
                ON word_book(difficulty_level, category);

            CREATE INDEX IF NOT EXISTS idx_word_difficulty_freq
                ON word(difficulty_score, frequency_rank);

            -- 覆盖索引优化常见查询
            CREATE INDEX IF NOT EXISTS idx_wls_review_query
                ON word_learning_state(user_id, next_review_at, is_mastered, state);

            CREATE INDEX IF NOT EXISTS idx_ar_stats_query
                ON answer_record(user_id, word_book_id, is_correct, rating);
            "#,
        ),
        // V3: 添加全文搜索支持 (FTS5)
        Migration::new(
            3,
            "添加全文搜索支持",
            r#"
            -- 创建 FTS5 虚拟表用于单词搜索
            CREATE VIRTUAL TABLE IF NOT EXISTS word_fts USING fts5(
                word,
                definition,
                definition_en,
                example_sentences,
                content='word',
                content_rowid='rowid'
            );

            -- 触发器：插入单词时同步到 FTS
            CREATE TRIGGER IF NOT EXISTS trg_word_fts_insert
                AFTER INSERT ON word
            BEGIN
                INSERT INTO word_fts(rowid, word, definition, definition_en, example_sentences)
                VALUES (NEW.rowid, NEW.word, NEW.definition, NEW.definition_en, NEW.example_sentences);
            END;

            -- 触发器：更新单词时同步到 FTS
            CREATE TRIGGER IF NOT EXISTS trg_word_fts_update
                AFTER UPDATE ON word
            BEGIN
                INSERT INTO word_fts(word_fts, rowid, word, definition, definition_en, example_sentences)
                VALUES ('delete', OLD.rowid, OLD.word, OLD.definition, OLD.definition_en, OLD.example_sentences);
                INSERT INTO word_fts(rowid, word, definition, definition_en, example_sentences)
                VALUES (NEW.rowid, NEW.word, NEW.definition, NEW.definition_en, NEW.example_sentences);
            END;

            -- 触发器：删除单词时同步到 FTS
            CREATE TRIGGER IF NOT EXISTS trg_word_fts_delete
                AFTER DELETE ON word
            BEGIN
                INSERT INTO word_fts(word_fts, rowid, word, definition, definition_en, example_sentences)
                VALUES ('delete', OLD.rowid, OLD.word, OLD.definition, OLD.definition_en, OLD.example_sentences);
            END;

            -- 重建 FTS 索引（同步已有数据）
            INSERT OR IGNORE INTO word_fts(rowid, word, definition, definition_en, example_sentences)
                SELECT rowid, word, definition, definition_en, example_sentences FROM word;
            "#,
        ),
    ]
}

/// 确保迁移表存在
fn ensure_migrations_table(conn: &Connection) -> StorageResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|e| StorageError::Migration(format!("创建迁移表失败: {}", e)))?;

    Ok(())
}

/// 获取当前数据库版本
///
/// # Arguments
/// * `conn` - 数据库连接
///
/// # Returns
/// * `i32` - 当前版本号，如果没有迁移记录则返回 0
pub fn get_current_version(conn: &Connection) -> i32 {
    // 首先确保迁移表存在
    if ensure_migrations_table(conn).is_err() {
        return 0;
    }

    // 查询最高版本号
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

/// 获取已应用的迁移版本列表
fn get_applied_versions(conn: &Connection) -> StorageResult<Vec<i32>> {
    ensure_migrations_table(conn)?;

    let mut stmt = conn.prepare("SELECT version FROM schema_migrations ORDER BY version")?;
    let versions = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(versions)
}

/// 记录迁移已应用
fn record_migration(conn: &Connection, migration: &Migration) -> StorageResult<()> {
    conn.execute(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![
            migration.version,
            migration.name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
        ],
    )?;

    Ok(())
}

/// 删除迁移记录
fn remove_migration_record(conn: &Connection, version: i32) -> StorageResult<()> {
    conn.execute(
        "DELETE FROM schema_migrations WHERE version = ?1",
        [version],
    )?;

    Ok(())
}

/// 运行数据库迁移
///
/// 检查当前数据库版本并执行必要的迁移脚本。
/// 每个迁移在独立事务中执行，失败时自动回滚该迁移。
///
/// # Arguments
/// * `conn` - 数据库连接
///
/// # Returns
/// * `Result<i32, StorageError>` - 成功返回最终版本号
pub fn run_migrations(conn: &Connection) -> Result<i32, StorageError> {
    // 确保迁移表存在
    ensure_migrations_table(conn)?;

    let applied_versions = get_applied_versions(conn)?;
    let migrations = get_migrations();
    let mut final_version = get_current_version(conn);

    log::info!(
        "当前数据库版本: {}, 目标版本: {}",
        final_version,
        CURRENT_SCHEMA_VERSION
    );

    for migration in migrations {
        // 跳过已应用的迁移
        if applied_versions.contains(&migration.version) {
            continue;
        }

        log::info!("运行迁移 v{}: {}", migration.version, migration.name);

        // 在事务中执行迁移
        match execute_migration_in_transaction(conn, &migration) {
            Ok(()) => {
                final_version = migration.version;
                log::info!("迁移 v{} 完成", migration.version);
            }
            Err(e) => {
                log::error!("迁移 v{} 失败: {}", migration.version, e);
                return Err(e);
            }
        }
    }

    // 同步旧的 sync_metadata 版本记录（兼容性）
    update_legacy_version(conn, final_version)?;

    log::info!("数据库迁移完成，当前版本: {}", final_version);
    Ok(final_version)
}

/// 在事务中执行单个迁移
fn execute_migration_in_transaction(conn: &Connection, migration: &Migration) -> StorageResult<()> {
    // 开始事务
    conn.execute("BEGIN IMMEDIATE", [])?;

    // 执行迁移 SQL
    match conn.execute_batch(&migration.sql) {
        Ok(()) => {
            // 记录迁移
            if let Err(e) = record_migration(conn, migration) {
                conn.execute("ROLLBACK", []).ok();
                return Err(e);
            }

            // 提交事务
            conn.execute("COMMIT", [])?;
            Ok(())
        }
        Err(e) => {
            // 回滚事务
            conn.execute("ROLLBACK", []).ok();
            Err(StorageError::Migration(format!(
                "迁移 v{} 执行失败: {}",
                migration.version, e
            )))
        }
    }
}

/// 回滚指定版本的迁移
///
/// 注意：此操作仅删除迁移记录，不会自动撤销数据库结构变更。
/// 对于需要实际回滚的迁移，应手动执行相应的回滚 SQL。
///
/// # Arguments
/// * `conn` - 数据库连接
/// * `version` - 要回滚的版本号
///
/// # Returns
/// * `Result<(), StorageError>` - 回滚结果
pub fn rollback_migration(conn: &Connection, version: i32) -> Result<(), StorageError> {
    let applied_versions = get_applied_versions(conn)?;

    if !applied_versions.contains(&version) {
        return Err(StorageError::Migration(format!(
            "版本 {} 未应用，无法回滚",
            version
        )));
    }

    // 检查是否有依赖此版本的更高版本迁移
    let higher_versions: Vec<i32> = applied_versions
        .iter()
        .filter(|&&v| v > version)
        .copied()
        .collect();

    if !higher_versions.is_empty() {
        return Err(StorageError::Migration(format!(
            "无法回滚版本 {}，存在依赖的更高版本: {:?}",
            version, higher_versions
        )));
    }

    log::warn!("回滚迁移 v{}", version);

    // 在事务中删除迁移记录
    conn.execute("BEGIN IMMEDIATE", [])?;

    match remove_migration_record(conn, version) {
        Ok(()) => {
            conn.execute("COMMIT", [])?;

            // 更新旧版本记录
            let new_version = get_current_version(conn);
            update_legacy_version(conn, new_version)?;

            log::info!("迁移 v{} 已回滚", version);
            Ok(())
        }
        Err(e) => {
            conn.execute("ROLLBACK", []).ok();
            Err(e)
        }
    }
}

/// 更新旧的 sync_metadata 版本记录（兼容性）
fn update_legacy_version(conn: &Connection, version: i32) -> StorageResult<()> {
    // 检查 sync_metadata 表是否存在
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='sync_metadata'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if table_exists {
        conn.execute(
            "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('schema_version', ?1, datetime('now'))",
            [version.to_string()],
        ).ok();
    }

    Ok(())
}

/// 获取迁移历史
pub fn get_migration_history(conn: &Connection) -> StorageResult<Vec<MigrationRecord>> {
    ensure_migrations_table(conn)?;

    let mut stmt =
        conn.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version")?;

    let records = stmt
        .query_map([], |row| {
            Ok(MigrationRecord {
                version: row.get(0)?,
                name: row.get(1)?,
                applied_at: row.get(2)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(records)
}

/// 迁移记录
#[derive(Debug, Clone)]
pub struct MigrationRecord {
    pub version: i32,
    pub name: String,
    pub applied_at: i64,
}

/// 重置数据库（仅用于开发/测试）
///
/// 删除所有表并重新创建。
///
/// # Warning
/// 此操作会删除所有数据！
pub fn reset_database(conn: &Connection) -> StorageResult<()> {
    log::warn!("重置数据库 - 所有数据将被删除!");

    // 获取所有表名和触发器
    let object_names: Vec<(String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger') AND name NOT LIKE 'sqlite_%'",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // 禁用外键约束
    conn.execute("PRAGMA foreign_keys=OFF", [])?;

    // 删除触发器
    for (obj_type, name) in &object_names {
        if obj_type == "trigger" {
            conn.execute(&format!("DROP TRIGGER IF EXISTS {}", name), [])
                .ok();
        }
    }

    // 删除所有表
    for (obj_type, name) in &object_names {
        if obj_type == "table" {
            conn.execute(&format!("DROP TABLE IF EXISTS {}", name), [])
                .ok();
        }
    }

    // 重新启用外键约束
    conn.execute("PRAGMA foreign_keys=ON", [])?;

    // 重新初始化
    run_migrations(conn)?;

    log::info!("数据库重置完成");
    Ok(())
}

/// 数据库健康检查
pub fn health_check(conn: &Connection) -> StorageResult<DatabaseHealth> {
    let version = get_current_version(conn);

    // 检查表是否存在
    let tables = vec![
        "word_book",
        "word",
        "word_learning_state",
        "answer_record",
        "sync_queue",
    ];

    let mut missing_tables = Vec::new();
    for table in &tables {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !exists {
            missing_tables.push(table.to_string());
        }
    }

    // 检查 FTS 表是否存在（V3 迁移）
    let fts_enabled: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='word_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    // 获取数据库大小
    let page_count: i64 = conn
        .query_row("PRAGMA page_count", [], |row| row.get(0))
        .unwrap_or(0);
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .unwrap_or(0);
    let db_size_bytes = page_count * page_size;

    // 获取各表记录数
    let mut table_counts = std::collections::HashMap::new();
    for table in &tables {
        if !missing_tables.contains(&table.to_string()) {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
                    row.get(0)
                })
                .unwrap_or(0);
            table_counts.insert(table.to_string(), count);
        }
    }

    // 获取迁移历史
    let migration_history = get_migration_history(conn).unwrap_or_default();

    Ok(DatabaseHealth {
        schema_version: version,
        is_healthy: missing_tables.is_empty() && version == CURRENT_SCHEMA_VERSION,
        missing_tables,
        needs_migration: version < CURRENT_SCHEMA_VERSION,
        db_size_bytes,
        table_counts,
        fts_enabled,
        migration_count: migration_history.len(),
    })
}

/// 数据库健康状态
#[derive(Debug)]
pub struct DatabaseHealth {
    pub schema_version: i32,
    pub is_healthy: bool,
    pub missing_tables: Vec<String>,
    pub needs_migration: bool,
    pub db_size_bytes: i64,
    pub table_counts: std::collections::HashMap<String, i64>,
    pub fts_enabled: bool,
    pub migration_count: usize,
}

/// 导出数据库统计信息
pub fn get_statistics(conn: &Connection) -> StorageResult<DatabaseStatistics> {
    let health = health_check(conn)?;

    // 获取未同步记录数
    let pending_sync: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM word_learning_state WHERE is_dirty = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let pending_answers: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM answer_record WHERE is_synced = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let sync_queue_size: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(DatabaseStatistics {
        health,
        pending_sync_learning_states: pending_sync,
        pending_sync_answers: pending_answers,
        sync_queue_size,
    })
}

/// 数据库统计信息
#[derive(Debug)]
pub struct DatabaseStatistics {
    pub health: DatabaseHealth,
    pub pending_sync_learning_states: i64,
    pub pending_sync_answers: i64,
    pub sync_queue_size: i64,
}

/// 全文搜索单词
///
/// 使用 FTS5 进行全文搜索
///
/// # Arguments
/// * `conn` - 数据库连接
/// * `query` - 搜索关键词
/// * `limit` - 返回结果数量限制
///
/// # Returns
/// * `Vec<String>` - 匹配的单词 ID 列表
pub fn search_words_fts(conn: &Connection, query: &str, limit: i32) -> StorageResult<Vec<String>> {
    // 检查 FTS 表是否存在
    let fts_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='word_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !fts_exists {
        return Err(StorageError::Migration(
            "全文搜索功能未启用，请先运行迁移".to_string(),
        ));
    }

    // 转义搜索词中的特殊字符
    let escaped_query = query.replace('"', "\"\"").replace('*', "").replace('?', "");

    let search_query = format!("\"{}\"*", escaped_query);

    let mut stmt = conn.prepare(
        r#"
        SELECT w.id
        FROM word w
        JOIN word_fts fts ON w.rowid = fts.rowid
        WHERE word_fts MATCH ?1
        ORDER BY rank
        LIMIT ?2
        "#,
    )?;

    let ids = stmt
        .query_map(rusqlite::params![search_query, limit], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn test_migration_struct() {
        let migration = Migration::new(1, "测试迁移", "SELECT 1");
        assert_eq!(migration.version, 1);
        assert_eq!(migration.name, "测试迁移");
        assert_eq!(migration.sql, "SELECT 1");
    }

    #[test]
    fn test_get_migrations() {
        let migrations = get_migrations();
        assert_eq!(migrations.len(), 3);
        assert_eq!(migrations[0].version, 1);
        assert_eq!(migrations[1].version, 2);
        assert_eq!(migrations[2].version, 3);
    }

    #[test]
    fn test_initial_migration() {
        let conn = setup_test_db();

        // 运行迁移
        let version = run_migrations(&conn).expect("Migration should succeed");

        // 验证版本
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(get_current_version(&conn), CURRENT_SCHEMA_VERSION);

        // 验证表存在
        let health = health_check(&conn).unwrap();
        assert!(health.is_healthy);
        assert!(health.missing_tables.is_empty());
        assert!(health.fts_enabled);
    }

    #[test]
    fn test_idempotent_migration() {
        let conn = setup_test_db();

        // 多次运行迁移应该是幂等的
        run_migrations(&conn).expect("First migration should succeed");
        run_migrations(&conn).expect("Second migration should succeed");

        let version = get_current_version(&conn);
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_migration_history() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        let history = get_migration_history(&conn).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].version, 1);
        assert_eq!(history[0].name, "初始表结构");
        assert!(history[0].applied_at > 0);
    }

    #[test]
    fn test_health_check() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        let health = health_check(&conn).unwrap();
        assert!(health.is_healthy);
        assert_eq!(health.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(!health.needs_migration);
        assert!(health.fts_enabled);
        assert_eq!(health.migration_count, 3);
    }

    #[test]
    fn test_rollback_migration() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        // 尝试回滚 V3
        let result = rollback_migration(&conn, 3);
        assert!(result.is_ok());

        let version = get_current_version(&conn);
        assert_eq!(version, 2);

        // 尝试回滚 V1（应该失败，因为 V2 还在）
        let result = rollback_migration(&conn, 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_rollback_non_existent_version() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        // 尝试回滚不存在的版本
        let result = rollback_migration(&conn, 99);
        assert!(result.is_err());
    }

    #[test]
    fn test_reset_database() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        // 插入一些测试数据
        conn.execute(
            "INSERT INTO word_book (id, name) VALUES ('test-id', 'Test Book')",
            [],
        )
        .unwrap();

        // 重置
        reset_database(&conn).unwrap();

        // 验证数据已清除但表结构存在
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM word_book", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        // 验证版本正确
        assert_eq!(get_current_version(&conn), CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_get_statistics() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        let stats = get_statistics(&conn).unwrap();
        assert!(stats.health.is_healthy);
        assert_eq!(stats.pending_sync_learning_states, 0);
        assert_eq!(stats.sync_queue_size, 0);
    }

    #[test]
    fn test_fts_search() {
        let conn = setup_test_db();
        run_migrations(&conn).unwrap();

        // 插入测试数据
        conn.execute(
            r#"INSERT INTO word_book (id, name) VALUES ('book1', 'Test Book')"#,
            [],
        )
        .unwrap();

        conn.execute(
            r#"INSERT INTO word (id, word_book_id, word, definition)
               VALUES ('word1', 'book1', 'hello', '你好')"#,
            [],
        )
        .unwrap();

        conn.execute(
            r#"INSERT INTO word (id, word_book_id, word, definition)
               VALUES ('word2', 'book1', 'world', '世界')"#,
            [],
        )
        .unwrap();

        // 搜索测试
        let results = search_words_fts(&conn, "hello", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], "word1");

        // 搜索中文
        let results = search_words_fts(&conn, "世界", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], "word2");
    }
}
