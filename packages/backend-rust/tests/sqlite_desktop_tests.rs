use sqlx::SqlitePool;
use std::path::PathBuf;
use tempfile::TempDir;

async fn create_test_sqlite_pool(db_path: PathBuf) -> Result<SqlitePool, sqlx::Error> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).expect("failed to create parent dir");
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(30));

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
}

fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut prev = '\0';

    for ch in sql.chars() {
        match ch {
            '\'' if !in_double_quote && prev != '\\' => {
                in_single_quote = !in_single_quote;
            }
            '"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
            }
            ';' if !in_single_quote && !in_double_quote => {
                let stmt = current.trim();
                if !stmt.is_empty() {
                    statements.push(stmt.to_string());
                }
                current.clear();
                prev = ch;
                continue;
            }
            _ => {}
        }

        current.push(ch);
        prev = ch;
    }

    let tail = current.trim();
    if !tail.is_empty() {
        statements.push(tail.to_string());
    }

    statements
}

const SQLITE_SCHEMA: &str = include_str!("../sql/sqlite_fallback_schema.sql");

async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let statements = split_sql_statements(SQLITE_SCHEMA);
    for stmt in statements.iter() {
        // Remove leading comment lines from each statement
        let lines: Vec<&str> = stmt.lines().collect();
        let mut actual_sql = String::new();
        for line in lines {
            let trimmed_line = line.trim();
            if trimmed_line.starts_with("--") {
                continue;
            }
            actual_sql.push_str(line);
            actual_sql.push('\n');
        }
        let trimmed = actual_sql.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed).execute(pool).await?;
    }

    sqlx::query(
        r#"INSERT OR REPLACE INTO "_db_metadata" ("key", "value") VALUES ('schema_version', '1.0.0')"#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_local_user(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let existing: Option<String> =
        sqlx::query_scalar(r#"SELECT "id" FROM "users" WHERE "id" = '1'"#)
            .fetch_optional(pool)
            .await?;

    if existing.is_none() {
        sqlx::query(
            r#"
            INSERT INTO "users" ("id", "email", "passwordHash", "username", "role")
            VALUES ('1', 'local@localhost', '', 'local_user', 'USER')
            "#,
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[tokio::test]
async fn test_sqlite_database_creation() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path.clone())
        .await
        .expect("failed to create pool");

    assert!(db_path.exists(), "Database file should be created");

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_schema_migration() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");

    let version: Option<String> = sqlx::query_scalar(
        r#"SELECT "value" FROM "_db_metadata" WHERE "key" = 'schema_version'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query version");

    assert_eq!(version, Some("1.0.0".to_string()));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_core_tables_exist() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");

    let core_tables = [
        "users",
        "word_books",
        "words",
        "word_learning_states",
        "learning_sessions",
        "user_study_configs",
        "user_preferences",
        "algorithm_configs",
    ];

    for table in core_tables {
        let exists: Option<String> = sqlx::query_scalar(
            &format!(
                r#"SELECT name FROM sqlite_master WHERE type='table' AND name='{}'"#,
                table
            ),
        )
        .fetch_optional(&pool)
        .await
        .expect(&format!("failed to check table {}", table));

        assert!(
            exists.is_some(),
            "Core table '{}' should exist after migration",
            table
        );
    }

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_local_user_creation() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");
    ensure_local_user(&pool).await.expect("local user creation failed");

    let user: Option<(String, String, String)> = sqlx::query_as(
        r#"SELECT "id", "username", "role" FROM "users" WHERE "id" = '1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query user");

    assert!(user.is_some(), "Local user should exist");
    let (id, username, role) = user.unwrap();
    assert_eq!(id, "1");
    assert_eq!(username, "local_user");
    assert_eq!(role, "USER");

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_local_user_idempotent() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");

    ensure_local_user(&pool).await.expect("first call failed");
    ensure_local_user(&pool).await.expect("second call should be idempotent");

    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "users" WHERE "id" = '1'"#)
        .fetch_one(&pool)
        .await
        .expect("failed to count users");

    assert_eq!(count, 1, "Should have exactly one local user");

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_migration_idempotent() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("first migration failed");
    run_migrations(&pool).await.expect("second migration should be idempotent");

    let version: Option<String> = sqlx::query_scalar(
        r#"SELECT "value" FROM "_db_metadata" WHERE "key" = 'schema_version'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query version");

    assert_eq!(version, Some("1.0.0".to_string()));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_wordbook_crud() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");

    sqlx::query(
        r#"
        INSERT INTO "word_books" ("id", "name", "description", "type", "isPublic")
        VALUES ('wb-1', 'Test Book', 'A test wordbook', 'system', 1)
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to insert wordbook");

    let name: Option<String> = sqlx::query_scalar(
        r#"SELECT "name" FROM "word_books" WHERE "id" = 'wb-1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query wordbook");

    assert_eq!(name, Some("Test Book".to_string()));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_word_progress_workflow() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");
    ensure_local_user(&pool).await.expect("local user creation failed");

    sqlx::query(
        r#"
        INSERT INTO "word_books" ("id", "name", "description", "type", "isPublic")
        VALUES ('wb-test', 'Test Book', 'Test', 'system', 1)
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to insert wordbook");

    sqlx::query(
        r#"
        INSERT INTO "words" ("id", "spelling", "phonetic", "meanings", "examples", "wordBookId")
        VALUES ('word-1', 'hello', '/həˈloʊ/', '["你好"]', '["Hello world!"]', 'wb-test')
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to insert word");

    sqlx::query(
        r#"
        INSERT INTO "word_learning_states" ("id", "userId", "wordId", "state", "masteryLevel", "nextReviewDate", "reviewCount", "lastReviewDate")
        VALUES ('wls-1', '1', 'word-1', 'NEW', 0, datetime('now'), 0, datetime('now'))
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to insert word learning state");

    sqlx::query(
        r#"
        UPDATE "word_learning_states"
        SET "masteryLevel" = 1, "reviewCount" = 1, "state" = 'LEARNING'
        WHERE "id" = 'wls-1'
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to update progress");

    let mastery: Option<i32> = sqlx::query_scalar(
        r#"SELECT "masteryLevel" FROM "word_learning_states" WHERE "id" = 'wls-1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query mastery");

    assert_eq!(mastery, Some(1));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_learning_session_workflow() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");
    ensure_local_user(&pool).await.expect("local user creation failed");

    sqlx::query(
        r#"
        INSERT INTO "learning_sessions" ("id", "userId", "sessionType", "targetMasteryCount", "totalQuestions")
        VALUES ('session-1', '1', 'NORMAL', 10, 0)
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to create session");

    sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "actualMasteryCount" = 8, "totalQuestions" = 10, "endedAt" = datetime('now')
        WHERE "id" = 'session-1'
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to complete session");

    let session_type: Option<String> = sqlx::query_scalar(
        r#"SELECT "sessionType" FROM "learning_sessions" WHERE "id" = 'session-1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query session");

    assert_eq!(session_type, Some("NORMAL".to_string()));

    let mastery_count: Option<i32> = sqlx::query_scalar(
        r#"SELECT "actualMasteryCount" FROM "learning_sessions" WHERE "id" = 'session-1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query mastery count");

    assert_eq!(mastery_count, Some(8));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_user_study_config() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path)
        .await
        .expect("failed to create pool");

    run_migrations(&pool).await.expect("migration failed");
    ensure_local_user(&pool).await.expect("local user creation failed");

    sqlx::query(
        r#"
        INSERT INTO "word_books" ("id", "name", "description", "type", "isPublic")
        VALUES ('wb-test', 'Test Book', 'Test', 'system', 1)
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to insert wordbook");

    sqlx::query(
        r#"
        INSERT INTO "user_study_configs" ("id", "userId", "selectedWordBookIds", "dailyWordCount", "dailyMasteryTarget", "studyMode")
        VALUES ('config-1', '1', '["wb-test"]', 20, 20, 'sequential')
        "#,
    )
    .execute(&pool)
    .await
    .expect("failed to create study config");

    let daily_count: Option<i32> = sqlx::query_scalar(
        r#"SELECT "dailyWordCount" FROM "user_study_configs" WHERE "userId" = '1'"#,
    )
    .fetch_optional(&pool)
    .await
    .expect("failed to query config");

    assert_eq!(daily_count, Some(20));

    pool.close().await;
}

#[tokio::test]
async fn test_sqlite_wal_mode_enabled() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");

    let pool = create_test_sqlite_pool(db_path.clone())
        .await
        .expect("failed to create pool");

    let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&pool)
        .await
        .expect("failed to query journal mode");

    assert_eq!(journal_mode.to_lowercase(), "wal", "WAL mode should be enabled");

    pool.close().await;
}
