use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    page: Option<i32>,
    page_size: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordBook {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(rename = "type")]
    wordbook_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    is_public: bool,
    word_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    cover_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    imported_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Word {
    id: String,
    spelling: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phonetic: Option<String>,
    meanings: Vec<String>,
    examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    audio_url: Option<String>,
    word_book_id: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWordBookInput {
    name: String,
    description: Option<String>,
    cover_image: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWordBookInput {
    name: Option<String>,
    description: Option<String>,
    cover_image: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchAddWordsInput {
    words: Vec<WordInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordInput {
    spelling: String,
    phonetic: Option<String>,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchAddResult {
    imported: usize,
    failed: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WordBookDetailData {
    #[serde(flatten)]
    wordbook: WordBook,
    words: Vec<Word>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_wordbooks).post(create_wordbook))
        .route(
            "/{id}",
            get(get_wordbook)
                .put(update_wordbook)
                .delete(delete_wordbook),
        )
        .route("/{id}/words/batch", post(batch_add_words))
}

async fn list_wordbooks(State(state): State<AppState>, Query(query): Query<ListQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let rows = sqlx::query(
        r#"SELECT "id","name","description","type"::text,"userId","isPublic","wordCount","coverImage","tags","sourceUrl","sourceVersion","sourceAuthor","importedAt","createdAt","updatedAt"
           FROM "word_books" WHERE "type" = 'SYSTEM' ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2"#,
    )
    .bind(page_size)
    .bind(offset)
    .fetch_all(proxy.pool())
    .await;

    match rows {
        Ok(rows) => {
            let wordbooks: Vec<WordBook> = rows.iter().map(|r| parse_wordbook_pg(r)).collect();
            (
                StatusCode::OK,
                Json(SuccessResponse {
                    success: true,
                    data: wordbooks,
                }),
            )
                .into_response()
        }
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_ERROR",
            &e.to_string(),
        )
        .into_response(),
    }
}

async fn create_wordbook(
    State(state): State<AppState>,
    Json(input): Json<CreateWordBookInput>,
) -> Response {
    if input.name.trim().is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词书名称不能为空",
        )
        .into_response();
    }
    if input.name.len() > 100 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "词书名称不能超过100个字符",
        )
        .into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();

    let result = sqlx::query(
        r#"INSERT INTO "word_books" ("id","name","description","type","isPublic","wordCount","coverImage","createdAt","updatedAt")
           VALUES ($1,$2,$3,'SYSTEM'::"WordBookType",true,0,$4,NOW(),NOW())"#,
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(input.description.as_ref().map(|d| d.trim()))
    .bind(input.cover_image.as_ref().map(|c| c.trim()))
    .execute(proxy.pool())
    .await;

    if let Err(e) = result {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "WRITE_ERROR",
            &e.to_string(),
        )
        .into_response();
    }

    let wordbook = WordBook {
        id,
        name: input.name.trim().to_string(),
        description: input.description.map(|d| d.trim().to_string()),
        wordbook_type: "SYSTEM".to_string(),
        user_id: None,
        is_public: true,
        word_count: 0,
        cover_image: input.cover_image.map(|c| c.trim().to_string()),
        tags: None,
        source_url: None,
        source_version: None,
        source_author: None,
        imported_at: None,
        created_at: now_str.clone(),
        updated_at: now_str,
    };

    (
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: wordbook,
        }),
    )
        .into_response()
}

async fn get_wordbook(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let wb_row = sqlx::query(
        r#"SELECT "id","name","description","type"::text,"userId","isPublic","wordCount","coverImage","tags","sourceUrl","sourceVersion","sourceAuthor","importedAt","createdAt","updatedAt"
           FROM "word_books" WHERE "id" = $1"#,
    )
    .bind(&id)
    .fetch_optional(proxy.pool())
    .await;

    match wb_row {
        Ok(Some(r)) => {
            let wordbook = parse_wordbook_pg(&r);

            let word_rows = sqlx::query(
                r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
                   FROM "words" WHERE "wordBookId" = $1 ORDER BY "createdAt" DESC"#,
            )
            .bind(&id)
            .fetch_all(proxy.pool())
            .await
            .unwrap_or_default();

            let words: Vec<Word> = word_rows.iter().map(|r| parse_word_pg(r)).collect();

            (
                StatusCode::OK,
                Json(SuccessResponse {
                    success: true,
                    data: WordBookDetailData { wordbook, words },
                }),
            )
                .into_response()
        }
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
        Err(e) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_ERROR",
            &e.to_string(),
        )
        .into_response(),
    }
}

async fn update_wordbook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateWordBookInput>,
) -> Response {
    if let Some(ref name) = input.name {
        if name.trim().is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "词书名称不能为空",
            )
            .into_response();
        }
        if name.len() > 100 {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "词书名称不能超过100个字符",
            )
            .into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
        .bind(&id)
        .fetch_optional(proxy.pool())
        .await;

    match existing {
        Ok(Some(row)) => {
            let wb_type: String = row.try_get("type").unwrap_or_default();
            if wb_type != "SYSTEM" {
                return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "只能修改系统词书")
                    .into_response();
            }
        }
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                &e.to_string(),
            )
            .into_response()
        }
    }

    let mut sets = vec![r#""updatedAt" = NOW()"#.to_string()];
    let mut bind_idx = 1;

    if input.name.is_some() {
        sets.push(format!(r#""name" = ${bind_idx}"#));
        bind_idx += 1;
    }
    if input.description.is_some() {
        sets.push(format!(r#""description" = ${bind_idx}"#));
        bind_idx += 1;
    }
    if input.cover_image.is_some() {
        sets.push(format!(r#""coverImage" = ${bind_idx}"#));
        bind_idx += 1;
    }

    let sql = format!(
        r#"UPDATE "word_books" SET {} WHERE "id" = ${bind_idx}"#,
        sets.join(", ")
    );
    let mut q = sqlx::query(&sql);

    if let Some(ref n) = input.name {
        q = q.bind(n.trim());
    }
    if let Some(ref d) = input.description {
        q = q.bind(d.trim());
    }
    if let Some(ref c) = input.cover_image {
        q = q.bind(c.trim());
    }
    q = q.bind(&id);

    if let Err(e) = q.execute(proxy.pool()).await {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "WRITE_ERROR",
            &e.to_string(),
        )
        .into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "更新成功" })),
    )
        .into_response()
}

async fn delete_wordbook(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
        .bind(&id)
        .fetch_optional(proxy.pool())
        .await;

    match existing {
        Ok(Some(row)) => {
            let wb_type: String = row.try_get("type").unwrap_or_default();
            if wb_type != "SYSTEM" {
                return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "只能删除系统词书")
                    .into_response();
            }
        }
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                &e.to_string(),
            )
            .into_response()
        }
    }

    if let Err(e) = sqlx::query(r#"DELETE FROM "word_books" WHERE "id" = $1"#)
        .bind(&id)
        .execute(proxy.pool())
        .await
    {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DELETE_ERROR",
            &e.to_string(),
        )
        .into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "删除成功" })),
    )
        .into_response()
}

async fn batch_add_words(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<BatchAddWordsInput>,
) -> Response {
    if input.words.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "VALIDATION_ERROR",
            "单词列表不能为空",
        )
        .into_response();
    }

    for w in &input.words {
        if w.spelling.trim().is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "单词拼写不能为空",
            )
            .into_response();
        }
        if w.meanings.is_empty() {
            return json_error(
                StatusCode::BAD_REQUEST,
                "VALIDATION_ERROR",
                "单词释义不能为空",
            )
            .into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用")
            .into_response();
    };

    let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
        .bind(&id)
        .fetch_optional(proxy.pool())
        .await;

    match existing {
        Ok(Some(row)) => {
            let wb_type: String = row.try_get("type").unwrap_or_default();
            if wb_type != "SYSTEM" {
                return json_error(
                    StatusCode::FORBIDDEN,
                    "FORBIDDEN",
                    "只能向系统词书批量添加单词",
                )
                .into_response();
            }
        }
        Ok(None) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response()
        }
        Err(e) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                &e.to_string(),
            )
            .into_response()
        }
    }

    let _now = chrono::Utc::now();
    let mut imported = 0usize;
    let mut failed = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for (idx, word_input) in input.words.iter().enumerate() {
        let word_id = uuid::Uuid::new_v4().to_string();
        let meanings_json = serde_json::to_value(&word_input.meanings).unwrap_or_default();
        let examples_json = serde_json::to_value(&word_input.examples).unwrap_or_default();

        let result = sqlx::query(
            r#"INSERT INTO "words" ("id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())"#,
        )
        .bind(&word_id)
        .bind(word_input.spelling.trim())
        .bind(&word_input.phonetic)
        .bind(&meanings_json)
        .bind(&examples_json)
        .bind(&word_input.audio_url)
        .bind(&id)
        .execute(proxy.pool())
        .await;

        match result {
            Ok(_) => imported += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!(
                    "第{}个单词 '{}': {}",
                    idx + 1,
                    word_input.spelling,
                    e
                ));
            }
        }
    }

    if imported > 0 {
        let _ = sqlx::query(r#"UPDATE "word_books" SET "wordCount" = "wordCount" + $1, "updatedAt" = NOW() WHERE "id" = $2"#)
            .bind(imported as i64)
            .bind(&id)
            .execute(proxy.pool())
            .await;
    }

    (
        StatusCode::CREATED,
        Json(SuccessResponse {
            success: true,
            data: BatchAddResult {
                imported,
                failed,
                errors,
            },
        }),
    )
        .into_response()
}

fn parse_wordbook_pg(row: &sqlx::postgres::PgRow) -> WordBook {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let imported_at: Option<chrono::NaiveDateTime> = row.try_get("importedAt").ok().flatten();

    WordBook {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok(),
        wordbook_type: row.try_get("type").unwrap_or_else(|_| "SYSTEM".to_string()),
        user_id: row.try_get("userId").ok(),
        is_public: row.try_get("isPublic").unwrap_or(true),
        word_count: row.try_get("wordCount").unwrap_or(0),
        cover_image: row.try_get("coverImage").ok(),
        tags: row.try_get::<Option<Vec<String>>, _>("tags").ok().flatten(),
        source_url: row.try_get::<Option<String>, _>("sourceUrl").ok().flatten(),
        source_version: row.try_get::<Option<String>, _>("sourceVersion").ok().flatten(),
        source_author: row.try_get::<Option<String>, _>("sourceAuthor").ok().flatten(),
        imported_at: imported_at.map(|t| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(t, chrono::Utc).to_rfc3339()),
        created_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            created_at,
            chrono::Utc,
        )
        .to_rfc3339(),
        updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            updated_at,
            chrono::Utc,
        )
        .to_rfc3339(),
    }
}

fn parse_word_pg(row: &sqlx::postgres::PgRow) -> Word {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let meanings: Vec<String> = row
        .try_get::<serde_json::Value, _>("meanings")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let examples: Vec<String> = row
        .try_get::<serde_json::Value, _>("examples")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Word {
        id: row.try_get("id").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").ok(),
        meanings,
        examples,
        audio_url: row.try_get("audioUrl").ok(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        created_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            created_at,
            chrono::Utc,
        )
        .to_rfc3339(),
        updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            updated_at,
            chrono::Utc,
        )
        .to_rfc3339(),
    }
}
