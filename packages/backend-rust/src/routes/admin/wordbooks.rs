use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;
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
    count: usize,
    words: Vec<Word>,
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
        .route("/{id}", get(get_wordbook).put(update_wordbook).delete(delete_wordbook))
        .route("/{id}/words/batch", post(batch_add_words))
}

async fn list_wordbooks(State(state): State<AppState>, Query(query): Query<ListQuery>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let pool = match get_pool(&proxy, db_state).await {
        Ok(p) => p,
        Err(e) => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", &e).into_response(),
    };

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 100);
    let offset = (page - 1) * page_size;

    match pool {
        SelectedPool::Primary(pg) => {
            let rows = sqlx::query(
                r#"SELECT "id","name","description","type"::text,"userId","isPublic","wordCount","coverImage","createdAt","updatedAt"
                   FROM "word_books" WHERE "type" = 'SYSTEM' ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2"#,
            )
            .bind(page_size)
            .bind(offset)
            .fetch_all(&pg)
            .await;

            match rows {
                Ok(rows) => {
                    let wordbooks: Vec<WordBook> = rows.iter().map(|r| parse_wordbook_pg(r)).collect();
                    (StatusCode::OK, Json(SuccessResponse { success: true, data: wordbooks })).into_response()
                }
                Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
            }
        }
        SelectedPool::Fallback(sqlite) => {
            let rows = sqlx::query(
                r#"SELECT "id","name","description","type","userId","isPublic","wordCount","coverImage","createdAt","updatedAt"
                   FROM "word_books" WHERE "type" = 'SYSTEM' ORDER BY "createdAt" DESC LIMIT ? OFFSET ?"#,
            )
            .bind(page_size)
            .bind(offset)
            .fetch_all(&sqlite)
            .await;

            match rows {
                Ok(rows) => {
                    let wordbooks: Vec<WordBook> = rows.iter().map(|r| parse_wordbook_sqlite(r)).collect();
                    (StatusCode::OK, Json(SuccessResponse { success: true, data: wordbooks })).into_response()
                }
                Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
            }
        }
    }
}

async fn create_wordbook(State(state): State<AppState>, Json(input): Json<CreateWordBookInput>) -> Response {
    if input.name.trim().is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "词书名称不能为空").into_response();
    }
    if input.name.len() > 100 {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "词书名称不能超过100个字符").into_response();
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".into(), serde_json::json!(id));
        data.insert("name".into(), serde_json::json!(input.name.trim()));
        if let Some(ref d) = input.description {
            data.insert("description".into(), serde_json::json!(d.trim()));
        }
        data.insert("type".into(), serde_json::json!("SYSTEM"));
        data.insert("isPublic".into(), serde_json::json!(true));
        data.insert("wordCount".into(), serde_json::json!(0));
        if let Some(ref c) = input.cover_image {
            data.insert("coverImage".into(), serde_json::json!(c.trim()));
        }
        data.insert("createdAt".into(), serde_json::json!(now_str));
        data.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "word_books".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(e) = proxy.write_operation(db_state, op).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
        }
    } else {
        let pg = match proxy.primary_pool().await {
            Some(p) => p,
            None => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response(),
        };

        let result = sqlx::query(
            r#"INSERT INTO "word_books" ("id","name","description","type","isPublic","wordCount","coverImage","createdAt","updatedAt")
               VALUES ($1,$2,$3,'SYSTEM'::\"WordBookType\",true,0,$4,NOW(),NOW())"#,
        )
        .bind(&id)
        .bind(input.name.trim())
        .bind(input.description.as_ref().map(|d| d.trim()))
        .bind(input.cover_image.as_ref().map(|c| c.trim()))
        .execute(&pg)
        .await;

        if let Err(e) = result {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
        }
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
        created_at: now_str.clone(),
        updated_at: now_str,
    };

    (StatusCode::CREATED, Json(SuccessResponse { success: true, data: wordbook })).into_response()
}

async fn get_wordbook(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let pool = match get_pool(&proxy, db_state).await {
        Ok(p) => p,
        Err(e) => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", &e).into_response(),
    };

    match pool {
        SelectedPool::Primary(pg) => {
            let wb_row = sqlx::query(
                r#"SELECT "id","name","description","type"::text,"userId","isPublic","wordCount","coverImage","createdAt","updatedAt"
                   FROM "word_books" WHERE "id" = $1"#,
            )
            .bind(&id)
            .fetch_optional(&pg)
            .await;

            match wb_row {
                Ok(Some(r)) => {
                    let wordbook = parse_wordbook_pg(&r);

                    let word_rows = sqlx::query(
                        r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
                           FROM "words" WHERE "wordBookId" = $1 ORDER BY "createdAt" DESC"#,
                    )
                    .bind(&id)
                    .fetch_all(&pg)
                    .await
                    .unwrap_or_default();

                    let words: Vec<Word> = word_rows.iter().map(|r| parse_word_pg(r)).collect();

                    (StatusCode::OK, Json(SuccessResponse {
                        success: true,
                        data: WordBookDetailData { wordbook, words },
                    })).into_response()
                }
                Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
                Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
            }
        }
        SelectedPool::Fallback(sqlite) => {
            let wb_row = sqlx::query(
                r#"SELECT "id","name","description","type","userId","isPublic","wordCount","coverImage","createdAt","updatedAt"
                   FROM "word_books" WHERE "id" = ?"#,
            )
            .bind(&id)
            .fetch_optional(&sqlite)
            .await;

            match wb_row {
                Ok(Some(r)) => {
                    let wordbook = parse_wordbook_sqlite(&r);

                    let word_rows = sqlx::query(
                        r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
                           FROM "words" WHERE "wordBookId" = ? ORDER BY "createdAt" DESC"#,
                    )
                    .bind(&id)
                    .fetch_all(&sqlite)
                    .await
                    .unwrap_or_default();

                    let words: Vec<Word> = word_rows.iter().map(|r| parse_word_sqlite(r)).collect();

                    (StatusCode::OK, Json(SuccessResponse {
                        success: true,
                        data: WordBookDetailData { wordbook, words },
                    })).into_response()
                }
                Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
                Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
            }
        }
    }
}

async fn update_wordbook(State(state): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateWordBookInput>) -> Response {
    if let Some(ref name) = input.name {
        if name.trim().is_empty() {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "词书名称不能为空").into_response();
        }
        if name.len() > 100 {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "词书名称不能超过100个字符").into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(id));

        let mut data = serde_json::Map::new();
        if let Some(ref n) = input.name {
            data.insert("name".into(), serde_json::json!(n.trim()));
        }
        if let Some(ref d) = input.description {
            data.insert("description".into(), serde_json::json!(d.trim()));
        }
        if let Some(ref c) = input.cover_image {
            data.insert("coverImage".into(), serde_json::json!(c.trim()));
        }
        data.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "word_books".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(e) = proxy.write_operation(db_state, op).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
        }
    } else {
        let pg = match proxy.primary_pool().await {
            Some(p) => p,
            None => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response(),
        };

        let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
            .bind(&id)
            .fetch_optional(&pg)
            .await;

        match existing {
            Ok(Some(row)) => {
                let wb_type: String = row.try_get("type").unwrap_or_default();
                if wb_type != "SYSTEM" {
                    return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "只能修改系统词书").into_response();
                }
            }
            Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
            Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
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

        let sql = format!(r#"UPDATE "word_books" SET {} WHERE "id" = ${bind_idx}"#, sets.join(", "));
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

        if let Err(e) = q.execute(&pg).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
        }
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true, "message": "更新成功" }))).into_response()
}

async fn delete_wordbook(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(id));

        let op = crate::db::dual_write_manager::WriteOperation::Delete {
            table: "word_books".to_string(),
            r#where: where_clause,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        if let Err(e) = proxy.write_operation(db_state, op).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "DELETE_ERROR", &e.to_string()).into_response();
        }
    } else {
        let pg = match proxy.primary_pool().await {
            Some(p) => p,
            None => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response(),
        };

        let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
            .bind(&id)
            .fetch_optional(&pg)
            .await;

        match existing {
            Ok(Some(row)) => {
                let wb_type: String = row.try_get("type").unwrap_or_default();
                if wb_type != "SYSTEM" {
                    return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "只能删除系统词书").into_response();
                }
            }
            Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
            Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
        }

        if let Err(e) = sqlx::query(r#"DELETE FROM "word_books" WHERE "id" = $1"#)
            .bind(&id)
            .execute(&pg)
            .await
        {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "DELETE_ERROR", &e.to_string()).into_response();
        }
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true, "message": "删除成功" }))).into_response()
}

async fn batch_add_words(State(state): State<AppState>, Path(id): Path<String>, Json(input): Json<BatchAddWordsInput>) -> Response {
    if input.words.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "单词列表不能为空").into_response();
    }

    for w in &input.words {
        if w.spelling.trim().is_empty() {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "单词拼写不能为空").into_response();
        }
        if w.meanings.is_empty() {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "单词释义不能为空").into_response();
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response();
    };
    let db_state = state.db_state().read().await.state();
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let mut created_words = Vec::new();

    if proxy.sqlite_enabled() {
        for word_input in &input.words {
            let word_id = uuid::Uuid::new_v4().to_string();

            let mut data = serde_json::Map::new();
            data.insert("id".into(), serde_json::json!(word_id));
            data.insert("spelling".into(), serde_json::json!(word_input.spelling.trim()));
            if let Some(ref p) = word_input.phonetic {
                data.insert("phonetic".into(), serde_json::json!(p));
            }
            data.insert("meanings".into(), serde_json::json!(serde_json::to_string(&word_input.meanings).unwrap_or_default()));
            data.insert("examples".into(), serde_json::json!(serde_json::to_string(&word_input.examples).unwrap_or_default()));
            if let Some(ref a) = word_input.audio_url {
                data.insert("audioUrl".into(), serde_json::json!(a));
            }
            data.insert("wordBookId".into(), serde_json::json!(id));
            data.insert("createdAt".into(), serde_json::json!(now_str));
            data.insert("updatedAt".into(), serde_json::json!(now_str));

            let op = crate::db::dual_write_manager::WriteOperation::Insert {
                table: "words".to_string(),
                data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(true),
            };

            if let Err(e) = proxy.write_operation(db_state, op).await {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
            }

            created_words.push(Word {
                id: word_id,
                spelling: word_input.spelling.trim().to_string(),
                phonetic: word_input.phonetic.clone(),
                meanings: word_input.meanings.clone(),
                examples: word_input.examples.clone(),
                audio_url: word_input.audio_url.clone(),
                word_book_id: id.clone(),
                created_at: now_str.clone(),
                updated_at: now_str.clone(),
            });
        }

        let count = created_words.len() as i64;
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(id));
        let mut update_data = serde_json::Map::new();
        update_data.insert("wordCount".into(), serde_json::json!(format!("EXPR:\"wordCount\" + {count}")));
        update_data.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "word_books".to_string(),
            r#where: where_clause,
            data: update_data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        let _ = proxy.write_operation(db_state, op).await;
    } else {
        let pg = match proxy.primary_pool().await {
            Some(p) => p,
            None => return json_error(StatusCode::SERVICE_UNAVAILABLE, "DB_ERROR", "数据库不可用").into_response(),
        };

        let existing = sqlx::query(r#"SELECT "id","type"::text FROM "word_books" WHERE "id" = $1"#)
            .bind(&id)
            .fetch_optional(&pg)
            .await;

        match existing {
            Ok(Some(row)) => {
                let wb_type: String = row.try_get("type").unwrap_or_default();
                if wb_type != "SYSTEM" {
                    return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "只能向系统词书批量添加单词").into_response();
                }
            }
            Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "词书不存在").into_response(),
            Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "QUERY_ERROR", &e.to_string()).into_response(),
        }

        for word_input in &input.words {
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
            .execute(&pg)
            .await;

            if let Err(e) = result {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "WRITE_ERROR", &e.to_string()).into_response();
            }

            created_words.push(Word {
                id: word_id,
                spelling: word_input.spelling.trim().to_string(),
                phonetic: word_input.phonetic.clone(),
                meanings: word_input.meanings.clone(),
                examples: word_input.examples.clone(),
                audio_url: word_input.audio_url.clone(),
                word_book_id: id.clone(),
                created_at: now_str.clone(),
                updated_at: now_str.clone(),
            });
        }

        let count = created_words.len() as i64;
        let _ = sqlx::query(r#"UPDATE "word_books" SET "wordCount" = "wordCount" + $1, "updatedAt" = NOW() WHERE "id" = $2"#)
            .bind(count)
            .bind(&id)
            .execute(&pg)
            .await;
    }

    let count = created_words.len();
    (StatusCode::CREATED, Json(SuccessResponse {
        success: true,
        data: BatchAddResult { count, words: created_words },
    })).into_response()
}

enum SelectedPool {
    Primary(sqlx::PgPool),
    Fallback(sqlx::SqlitePool),
}

async fn get_pool(proxy: &DatabaseProxy, db_state: DatabaseState) -> Result<SelectedPool, String> {
    match db_state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool().await
            .map(SelectedPool::Fallback)
            .ok_or_else(|| "服务不可用".to_string()),
        _ => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedPool::Primary(pool)),
            None => proxy.fallback_pool().await
                .map(SelectedPool::Fallback)
                .ok_or_else(|| "服务不可用".to_string()),
        },
    }
}

fn parse_wordbook_pg(row: &sqlx::postgres::PgRow) -> WordBook {
    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());

    WordBook {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok(),
        wordbook_type: row.try_get("type").unwrap_or_else(|_| "SYSTEM".to_string()),
        user_id: row.try_get("userId").ok(),
        is_public: row.try_get("isPublic").unwrap_or(true),
        word_count: row.try_get("wordCount").unwrap_or(0),
        cover_image: row.try_get("coverImage").ok(),
        created_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(created_at, chrono::Utc).to_rfc3339(),
        updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(updated_at, chrono::Utc).to_rfc3339(),
    }
}

fn parse_wordbook_sqlite(row: &sqlx::sqlite::SqliteRow) -> WordBook {
    WordBook {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok(),
        wordbook_type: row.try_get("type").unwrap_or_else(|_| "SYSTEM".to_string()),
        user_id: row.try_get("userId").ok(),
        is_public: row.try_get::<i32, _>("isPublic").unwrap_or(1) != 0,
        word_count: row.try_get("wordCount").unwrap_or(0),
        cover_image: row.try_get("coverImage").ok(),
        created_at: row.try_get("createdAt").unwrap_or_default(),
        updated_at: row.try_get("updatedAt").unwrap_or_default(),
    }
}

fn parse_word_pg(row: &sqlx::postgres::PgRow) -> Word {
    let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let meanings: Vec<String> = row.try_get::<serde_json::Value, _>("meanings")
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let examples: Vec<String> = row.try_get::<serde_json::Value, _>("examples")
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
        created_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(created_at, chrono::Utc).to_rfc3339(),
        updated_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(updated_at, chrono::Utc).to_rfc3339(),
    }
}

fn parse_word_sqlite(row: &sqlx::sqlite::SqliteRow) -> Word {
    let meanings_raw: String = row.try_get("meanings").unwrap_or_default();
    let examples_raw: String = row.try_get("examples").unwrap_or_default();
    let meanings: Vec<String> = serde_json::from_str(&meanings_raw).unwrap_or_default();
    let examples: Vec<String> = serde_json::from_str(&examples_raw).unwrap_or_default();

    Word {
        id: row.try_get("id").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").ok(),
        meanings,
        examples,
        audio_url: row.try_get("audioUrl").ok(),
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        created_at: row.try_get("createdAt").unwrap_or_default(),
        updated_at: row.try_get("updatedAt").unwrap_or_default(),
    }
}
