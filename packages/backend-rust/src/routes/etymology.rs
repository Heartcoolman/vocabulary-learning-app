use axum::extract::{Extension, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::response::json_error;
use crate::services::etymology::{self, Morpheme, MorphemeType, RootFeatures};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FamilyQuery {
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeRequest {
    decomposition: Vec<PartInput>,
    confidence: Option<f64>,
    source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartInput {
    part: String,
    #[serde(rename = "type")]
    part_type: String,
    meaning: Option<String>,
    meaning_zh: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/words/:word_id/etymology", get(get_etymology))
        .route("/words/:word_id/etymology", post(save_etymology))
        .route("/words/:word_id/root-features", get(get_root_features))
        .route("/morphemes/:morpheme_id/family", get(get_family))
        .route("/morphemes/search", get(search_morphemes))
}

async fn get_etymology(
    State(state): State<AppState>,
    Path(word_id): Path<String>,
) -> impl IntoResponse {
    let Some(db_proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "Database not available").into_response();
    };
    let pool = db_proxy.pool();
    match etymology::get_word_etymology(pool, &word_id).await {
        Ok(Some(data)) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, data }),
        )
            .into_response(),
        Ok(None) => json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "Etymology not found for this word").into_response(),
        Err(e) => {
            tracing::error!("Failed to get etymology: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to get etymology").into_response()
        }
    }
}

async fn save_etymology(
    State(state): State<AppState>,
    Path(word_id): Path<String>,
    Json(body): Json<AnalyzeRequest>,
) -> impl IntoResponse {
    let Some(db_proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "Database not available").into_response();
    };
    let pool = db_proxy.pool();
    let confidence = body.confidence.unwrap_or(0.7);
    let source = body.source.unwrap_or_else(|| "manual".to_string());

    for (pos, part) in body.decomposition.iter().enumerate() {
        let morpheme_type = match part.part_type.as_str() {
            "prefix" => MorphemeType::Prefix,
            "suffix" => MorphemeType::Suffix,
            _ => MorphemeType::Root,
        };

        let morpheme = match etymology::get_or_create_morpheme(
            pool,
            &part.part,
            morpheme_type,
            part.meaning.as_deref(),
            part.meaning_zh.as_deref(),
            "latin",
        )
        .await
        {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("Failed to create morpheme: {}", e);
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to create morpheme").into_response();
            }
        };

        if let Err(e) = etymology::link_word_morpheme(
            pool,
            &word_id,
            &morpheme.id,
            morpheme_type,
            pos as i32,
            confidence,
            &source,
        )
        .await
        {
            tracing::error!("Failed to link morpheme: {}", e);
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to link morpheme").into_response();
        }

        if let Err(e) = etymology::increment_morpheme_frequency(pool, &morpheme.id).await {
            tracing::warn!("Failed to increment frequency: {}", e);
        }
    }

    match etymology::get_word_etymology(pool, &word_id).await {
        Ok(Some(data)) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, data }),
        )
            .into_response(),
        Ok(None) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to retrieve saved etymology").into_response(),
        Err(e) => {
            tracing::error!("Failed to get saved etymology: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to get saved etymology").into_response()
        }
    }
}

async fn get_root_features(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(word_id): Path<String>,
) -> impl IntoResponse {
    let Some(db_proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "Database not available").into_response();
    };
    let pool = db_proxy.pool();
    match etymology::compute_root_features(pool, &user.id, &word_id).await {
        Ok(data) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, data }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to compute root features: {}", e);
            (
                StatusCode::OK,
                Json(SuccessResponse {
                    success: true,
                    data: RootFeatures::default(),
                }),
            )
                .into_response()
        }
    }
}

async fn get_family(
    State(state): State<AppState>,
    Path(morpheme_id): Path<String>,
    Query(query): Query<FamilyQuery>,
) -> impl IntoResponse {
    let Some(db_proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "Database not available").into_response();
    };
    let pool = db_proxy.pool();
    let limit = query.limit.unwrap_or(20).min(100);

    match etymology::get_word_family(pool, &morpheme_id, limit).await {
        Ok(data) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, data }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to get word family: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to get word family").into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    q: String,
    #[serde(rename = "type")]
    morpheme_type: Option<String>,
    limit: Option<i32>,
}

async fn search_morphemes(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let Some(db_proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "Database not available").into_response();
    };
    let pool = db_proxy.pool();
    let limit = query.limit.unwrap_or(20).min(100);

    let type_filter = query.morpheme_type.as_deref();
    let search_term = format!("%{}%", query.q);

    let result = if let Some(t) = type_filter {
        sqlx::query_as::<_, MorphemeRow>(
            r#"SELECT "id", "surface", "type", "meaning", "meaningZh", "language", "etymology", "aliases", "frequency"
               FROM "morphemes"
               WHERE ("surface" ILIKE $1 OR $1 = ANY("aliases"))
                 AND "type" = $2
               ORDER BY "frequency" DESC
               LIMIT $3"#,
        )
        .bind(&search_term)
        .bind(t)
        .bind(limit)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, MorphemeRow>(
            r#"SELECT "id", "surface", "type", "meaning", "meaningZh", "language", "etymology", "aliases", "frequency"
               FROM "morphemes"
               WHERE "surface" ILIKE $1 OR $1 = ANY("aliases")
               ORDER BY "frequency" DESC
               LIMIT $2"#,
        )
        .bind(&search_term)
        .bind(limit)
        .fetch_all(pool)
        .await
    };

    match result {
        Ok(rows) => {
            let morphemes: Vec<Morpheme> = rows.into_iter().map(|r| r.into()).collect();
            (
                StatusCode::OK,
                Json(SuccessResponse {
                    success: true,
                    data: morphemes,
                }),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to search morphemes: {}", e);
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Failed to search morphemes").into_response()
        }
    }
}

use sqlx::Row;

struct MorphemeRow {
    id: String,
    surface: String,
    morpheme_type: String,
    meaning: Option<String>,
    meaning_zh: Option<String>,
    language: String,
    etymology: Option<String>,
    aliases: Vec<String>,
    frequency: i32,
}

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for MorphemeRow {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        Ok(MorphemeRow {
            id: row.get("id"),
            surface: row.get("surface"),
            morpheme_type: row.get("type"),
            meaning: row.get("meaning"),
            meaning_zh: row.get("meaningZh"),
            language: row.get("language"),
            etymology: row.get("etymology"),
            aliases: row.get("aliases"),
            frequency: row.get("frequency"),
        })
    }
}

impl From<MorphemeRow> for Morpheme {
    fn from(row: MorphemeRow) -> Self {
        Self {
            id: row.id,
            surface: row.surface,
            morpheme_type: MorphemeType::from_str(&row.morpheme_type).unwrap_or(MorphemeType::Root),
            meaning: row.meaning,
            meaning_zh: row.meaning_zh,
            language: row.language,
            etymology: row.etymology,
            aliases: row.aliases,
            frequency: row.frequency,
        }
    }
}
