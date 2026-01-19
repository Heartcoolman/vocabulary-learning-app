use sqlx::PgPool;

pub async fn run_migrations(pool: &PgPool) -> Result<(), MigrationError> {
    tracing::info!("Running database migrations...");

    // Create migrations table if not exists
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS "_migrations" (
            "id" SERIAL PRIMARY KEY,
            "name" TEXT NOT NULL UNIQUE,
            "applied_at" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(MigrationError::Sqlx)?;

    // Get list of applied migrations
    let applied: Vec<String> =
        sqlx::query_scalar(r#"SELECT "name" FROM "_migrations" ORDER BY "id""#)
            .fetch_all(pool)
            .await
            .map_err(MigrationError::Sqlx)?;

    // List of migration files in order
    let migrations = [
        (
            "001_init_schema",
            include_str!("../../sql/001_init_schema.sql"),
        ),
        (
            "003_rebuild_quality_tables",
            include_str!("../../sql/003_rebuild_quality_tables.sql"),
        ),
        (
            "004_tracking_events",
            include_str!("../../sql/004_tracking_events.sql"),
        ),
        (
            "005_drop_deprecated_tables",
            include_str!("../../sql/005_drop_deprecated_tables.sql"),
        ),
        (
            "006_llm_analytics_tables",
            include_str!("../../sql/006_llm_analytics_tables.sql"),
        ),
        (
            "007_optimization_causal_tables",
            include_str!("../../sql/007_optimization_causal_tables.sql"),
        ),
        (
            "008_add_session_type_column",
            include_str!("../../sql/008_add_session_type_column.sql"),
        ),
        (
            "009_add_context_shifts_column",
            include_str!("../../sql/009_add_context_shifts_column.sql"),
        ),
        (
            "010_add_amas_missing_columns",
            include_str!("../../sql/010_add_amas_missing_columns.sql"),
        ),
        (
            "011_add_missing_tables",
            include_str!("../../sql/011_add_missing_tables.sql"),
        ),
        (
            "012_fix_missing_columns",
            include_str!("../../sql/012_fix_missing_columns.sql"),
        ),
        (
            "013_fix_suggestion_effect_tracking",
            include_str!("../../sql/013_fix_suggestion_effect_tracking.sql"),
        ),
        (
            "014_complete_schema_sync",
            include_str!("../../sql/014_complete_schema_sync.sql"),
        ),
        (
            "015_add_fsrs_columns",
            include_str!("../../sql/015_add_fsrs_columns.sql"),
        ),
        (
            "016_add_morphemes",
            include_str!("../../sql/016_add_morphemes.sql"),
        ),
        (
            "017_amas_monitoring",
            include_str!("../../sql/017_amas_monitoring.sql"),
        ),
        (
            "018_visual_fatigue_session",
            include_str!("../../sql/018_visual_fatigue_session.sql"),
        ),
        (
            "019_add_reward_columns",
            include_str!("../../sql/019_add_reward_columns.sql"),
        ),
        (
            "020_algorithm_metrics_daily",
            include_str!("../../sql/020_algorithm_metrics_daily.sql"),
        ),
        (
            "021_word_review_traces",
            include_str!("../../sql/021_word_review_traces.sql"),
        ),
        (
            "022_add_habit_profiles",
            include_str!("../../sql/022_add_habit_profiles.sql"),
        ),
        (
            "023_fix_schema_issues",
            include_str!("../../sql/023_fix_schema_issues.sql"),
        ),
        (
            "024_wordbook_tags_and_import",
            include_str!("../../sql/024_wordbook_tags_and_import.sql"),
        ),
        (
            "025_wordbook_center_user_config",
            include_str!("../../sql/025_wordbook_center_user_config.sql"),
        ),
        (
            "026_fix_wordbook_center_default_url",
            include_str!("../../sql/026_fix_wordbook_center_default_url.sql"),
        ),
        (
            "027_wordbook_center_downloads",
            include_str!("../../sql/027_wordbook_center_downloads.sql"),
        ),
        (
            "028_wordbook_source_author",
            include_str!("../../sql/028_wordbook_source_author.sql"),
        ),
        (
            "029_words_soft_delete",
            include_str!("../../sql/029_words_soft_delete.sql"),
        ),
    ];

    let mut applied_count = 0;

    for (name, sql) in migrations {
        if applied.contains(&name.to_string()) {
            tracing::debug!(migration = name, "Already applied, skipping");
            continue;
        }

        tracing::info!(migration = name, "Applying migration...");

        // Execute migration SQL
        sqlx::raw_sql(sql)
            .execute(pool)
            .await
            .map_err(|e| MigrationError::Migration {
                name: name.to_string(),
                source: e,
            })?;

        // Record migration as applied
        sqlx::query(r#"INSERT INTO "_migrations" ("name") VALUES ($1)"#)
            .bind(name)
            .execute(pool)
            .await
            .map_err(MigrationError::Sqlx)?;

        applied_count += 1;
        tracing::info!(migration = name, "Migration applied successfully");
    }

    if applied_count > 0 {
        tracing::info!(count = applied_count, "Database migrations completed");
    } else {
        tracing::info!("Database is up to date, no migrations needed");
    }

    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("Migration '{name}' failed: {source}")]
    Migration {
        name: String,
        #[source]
        source: sqlx::Error,
    },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}
