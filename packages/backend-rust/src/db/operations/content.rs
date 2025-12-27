use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordBook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub r#type: String,
    pub user_id: Option<String>,
    pub is_public: bool,
    pub word_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub id: String,
    pub word_book_id: String,
    pub spelling: String,
    pub phonetic: String,
    pub meanings: Vec<String>,
    pub examples: Vec<String>,
    pub audio_url: Option<String>,
    pub difficulty: Option<f64>,
    pub frequency: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyPlan {
    pub id: String,
    pub user_id: String,
    pub word_book_id: String,
    pub daily_new_words: i32,
    pub daily_review_words: i32,
    pub start_date: String,
    pub end_date: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWordBookProgress {
    pub id: String,
    pub user_id: String,
    pub word_book_id: String,
    pub learned_count: i32,
    pub mastered_count: i32,
    pub total_words: i32,
    pub last_study_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn get_word_book(
    proxy: &DatabaseProxy,
    word_book_id: &str,
) -> Result<Option<WordBook>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "word_books" WHERE "id" = $1 LIMIT 1"#,
    )
    .bind(word_book_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_word_book(&r)))
}

pub async fn get_user_word_books(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<WordBook>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT * FROM "word_books"
        WHERE "userId" = $1 OR "type"::text = 'SYSTEM'
        ORDER BY "type"::text ASC, "createdAt" DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_word_book).collect())
}

pub async fn get_system_word_books(
    proxy: &DatabaseProxy,
) -> Result<Vec<WordBook>, sqlx::Error> {
    let rows = sqlx::query(
        r#"SELECT * FROM "word_books" WHERE "type"::text = 'SYSTEM' ORDER BY "createdAt" DESC"#,
    )
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_word_book).collect())
}

pub async fn insert_word_book(
    proxy: &DatabaseProxy,
    book: &WordBook,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "word_books" (
            "id", "name", "description", "coverImage", "type", "userId",
            "isPublic", "wordCount", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(&book.id)
    .bind(&book.name)
    .bind(&book.description)
    .bind(&book.cover_image)
    .bind(&book.r#type)
    .bind(&book.user_id)
    .bind(book.is_public)
    .bind(book.word_count)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn update_word_book(
    proxy: &DatabaseProxy,
    book: &WordBook,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "word_books"
        SET "name" = $1, "description" = $2, "coverImage" = $3, "updatedAt" = $4
        WHERE "id" = $5
        "#,
    )
    .bind(&book.name)
    .bind(&book.description)
    .bind(&book.cover_image)
    .bind(now)
    .bind(&book.id)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn delete_word_book(
    proxy: &DatabaseProxy,
    word_book_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "word_books" WHERE "id" = $1"#)
        .bind(word_book_id)
        .execute(proxy.pool())
        .await?;
    Ok(())
}

pub async fn get_word(
    proxy: &DatabaseProxy,
    word_id: &str,
) -> Result<Option<Word>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "words" WHERE "id" = $1 LIMIT 1"#,
    )
    .bind(word_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_word(&r)))
}

pub async fn get_words_by_book(
    proxy: &DatabaseProxy,
    word_book_id: &str,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<Word>, sqlx::Error> {
    let limit_val = limit.unwrap_or(1000);
    let offset_val = offset.unwrap_or(0);

    let rows = sqlx::query(
        r#"
        SELECT * FROM "words"
        WHERE "wordBookId" = $1
        ORDER BY "createdAt" ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(word_book_id)
    .bind(limit_val)
    .bind(offset_val)
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_word).collect())
}

pub async fn get_words_by_ids(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<Word>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: Vec<String> = word_ids.iter().enumerate().map(|(i, _)| format!("${}", i + 1)).collect();
    let query = format!(
        r#"SELECT * FROM "words" WHERE "id" IN ({})"#,
        placeholders.join(",")
    );
    let mut q = sqlx::query(&query);
    for id in word_ids {
        q = q.bind(id);
    }
    let rows = q.fetch_all(proxy.pool()).await?;
    Ok(rows.iter().map(map_word).collect())
}

pub async fn insert_word(
    proxy: &DatabaseProxy,
    word: &Word,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "words" (
            "id", "wordBookId", "spelling", "phonetic", "meanings", "examples",
            "audioUrl", "difficulty", "frequency", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(&word.id)
    .bind(&word.word_book_id)
    .bind(&word.spelling)
    .bind(&word.phonetic)
    .bind(&word.meanings)
    .bind(&word.examples)
    .bind(&word.audio_url)
    .bind(word.difficulty)
    .bind(word.frequency)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn delete_word(
    proxy: &DatabaseProxy,
    word_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "words" WHERE "id" = $1"#)
        .bind(word_id)
        .execute(proxy.pool())
        .await?;
    Ok(())
}

pub async fn count_words_in_book(
    proxy: &DatabaseProxy,
    word_book_id: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" = $1"#)
        .bind(word_book_id)
        .fetch_one(proxy.pool())
        .await
}

pub async fn get_study_plan(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_book_id: &str,
) -> Result<Option<StudyPlan>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "study_plans" WHERE "userId" = $1 AND "wordBookId" = $2 LIMIT 1"#,
    )
    .bind(user_id)
    .bind(word_book_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_study_plan(&r)))
}

pub async fn get_active_study_plan(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<StudyPlan>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "study_plans" WHERE "userId" = $1 AND "isActive" = true LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_study_plan(&r)))
}

pub async fn upsert_study_plan(
    proxy: &DatabaseProxy,
    plan: &StudyPlan,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let start_date = chrono::DateTime::parse_from_rfc3339(&plan.start_date)
        .map(|dt| dt.naive_utc())
        .unwrap_or(now);
    let end_date = plan.end_date.as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "study_plans" (
            "id", "userId", "wordBookId", "dailyNewWords", "dailyReviewWords",
            "startDate", "endDate", "isActive", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("userId", "wordBookId") DO UPDATE SET
            "dailyNewWords" = EXCLUDED."dailyNewWords",
            "dailyReviewWords" = EXCLUDED."dailyReviewWords",
            "startDate" = EXCLUDED."startDate",
            "endDate" = EXCLUDED."endDate",
            "isActive" = EXCLUDED."isActive",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&plan.id)
    .bind(&plan.user_id)
    .bind(&plan.word_book_id)
    .bind(plan.daily_new_words)
    .bind(plan.daily_review_words)
    .bind(start_date)
    .bind(end_date)
    .bind(plan.is_active)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn get_user_word_book_progress(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_book_id: &str,
) -> Result<Option<UserWordBookProgress>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT * FROM "user_word_book_progress" WHERE "userId" = $1 AND "wordBookId" = $2 LIMIT 1"#,
    )
    .bind(user_id)
    .bind(word_book_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|r| map_progress(&r)))
}

pub async fn upsert_user_word_book_progress(
    proxy: &DatabaseProxy,
    progress: &UserWordBookProgress,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();
    let last_study = progress.last_study_at.as_ref()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "user_word_book_progress" (
            "id", "userId", "wordBookId", "learnedCount", "masteredCount",
            "totalWords", "lastStudyAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("userId", "wordBookId") DO UPDATE SET
            "learnedCount" = EXCLUDED."learnedCount",
            "masteredCount" = EXCLUDED."masteredCount",
            "totalWords" = EXCLUDED."totalWords",
            "lastStudyAt" = EXCLUDED."lastStudyAt",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(&progress.id)
    .bind(&progress.user_id)
    .bind(&progress.word_book_id)
    .bind(progress.learned_count)
    .bind(progress.mastered_count)
    .bind(progress.total_words)
    .bind(last_study)
    .bind(now)
    .bind(now)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

fn map_word_book(row: &sqlx::postgres::PgRow) -> WordBook {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    WordBook {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok().flatten(),
        cover_image: row.try_get("coverImage").ok().flatten(),
        r#type: row.try_get("type").unwrap_or_else(|_| "SYSTEM".to_string()),
        user_id: row.try_get("userId").ok().flatten(),
        is_public: row.try_get("isPublic").unwrap_or(false),
        word_count: row.try_get("wordCount").unwrap_or(0),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_word(row: &sqlx::postgres::PgRow) -> Word {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    Word {
        id: row.try_get("id").unwrap_or_default(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        meanings: row.try_get("meanings").unwrap_or_default(),
        examples: row.try_get("examples").unwrap_or_default(),
        audio_url: row.try_get("audioUrl").ok().flatten(),
        difficulty: row.try_get("difficulty").ok(),
        frequency: row.try_get("frequency").ok(),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_study_plan(row: &sqlx::postgres::PgRow) -> StudyPlan {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let start_date: NaiveDateTime = row.try_get("startDate").unwrap_or_else(|_| Utc::now().naive_utc());
    let end_date: Option<NaiveDateTime> = row.try_get("endDate").ok();
    StudyPlan {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        daily_new_words: row.try_get("dailyNewWords").unwrap_or(20),
        daily_review_words: row.try_get("dailyReviewWords").unwrap_or(50),
        start_date: format_naive_iso(start_date),
        end_date: end_date.map(format_naive_iso),
        is_active: row.try_get("isActive").unwrap_or(true),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn map_progress(row: &sqlx::postgres::PgRow) -> UserWordBookProgress {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let last_study_at: Option<NaiveDateTime> = row.try_get("lastStudyAt").ok();
    UserWordBookProgress {
        id: row.try_get("id").unwrap_or_default(),
        user_id: row.try_get("userId").unwrap_or_default(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        learned_count: row.try_get("learnedCount").unwrap_or(0),
        mastered_count: row.try_get("masteredCount").unwrap_or(0),
        total_words: row.try_get("totalWords").unwrap_or(0),
        last_study_at: last_study_at.map(format_naive_iso),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }
}

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc).to_rfc3339_opts(SecondsFormat::Millis, true)
}
