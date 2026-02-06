use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::str::FromStr;

use crate::db::sqlite_schema::{split_sql_statements, SQLITE_FALLBACK_SCHEMA_SQL};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DbMode {
    ServerPostgres,
    DesktopSqlite,
}

impl DbMode {
    pub fn detect() -> Self {
        if std::env::var("DATABASE_URL").is_ok() {
            DbMode::ServerPostgres
        } else {
            DbMode::DesktopSqlite
        }
    }
}

pub fn get_sqlite_db_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(app_data)
            .join("com.danci.app")
            .join("data.db")
    }

    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.danci.app")
            .join("data.db")
    }
}

pub async fn init_sqlite_pool() -> Result<SqlitePool, SqliteInitError> {
    let db_path = get_sqlite_db_path();

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| SqliteInitError::Io(e.to_string()))?;
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| SqliteInitError::Config(e.to_string()))?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(30));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(SqliteInitError::Sqlx)?;

    run_sqlite_migrations(&pool).await?;

    Ok(pool)
}

async fn run_sqlite_migrations(pool: &SqlitePool) -> Result<(), SqliteInitError> {
    let version: Option<String> =
        sqlx::query_scalar(r#"SELECT "value" FROM "_db_metadata" WHERE "key" = 'schema_version'"#)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

    if version.is_some() {
        return Ok(());
    }

    let statements = split_sql_statements(SQLITE_FALLBACK_SCHEMA_SQL);
    for stmt in statements {
        let sql: String = stmt
            .lines()
            .filter(|line| !line.trim().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed)
            .execute(pool)
            .await
            .map_err(SqliteInitError::Sqlx)?;
    }

    sqlx::query(
        r#"INSERT OR REPLACE INTO "_db_metadata" ("key", "value") VALUES ('schema_version', '1.0.0')"#,
    )
    .execute(pool)
    .await
    .map_err(SqliteInitError::Sqlx)?;

    Ok(())
}

pub async fn ensure_local_user(pool: &SqlitePool) -> Result<(), SqliteInitError> {
    let existing: Option<String> =
        sqlx::query_scalar(r#"SELECT "id" FROM "users" WHERE "id" = '1'"#)
            .fetch_optional(pool)
            .await
            .map_err(SqliteInitError::Sqlx)?;

    if existing.is_none() {
        sqlx::query(
            r#"
            INSERT INTO "users" ("id", "email", "passwordHash", "username", "role")
            VALUES ('1', 'local@localhost', '', 'local_user', 'USER')
            "#,
        )
        .execute(pool)
        .await
        .map_err(SqliteInitError::Sqlx)?;
    }

    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum SqliteInitError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("Config error: {0}")]
    Config(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}
