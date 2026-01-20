use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse {
    success: bool,
    message: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListUsersQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LearningDataQuery {
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserRoleRequest {
    role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserWordsQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    state: Option<String>,
    search: Option<String>,
    score_range: Option<String>,
    mastery_level: Option<i64>,
    min_accuracy: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecisionsQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    start_date: Option<String>,
    end_date: Option<String>,
    decision_source: Option<String>,
    min_confidence: Option<f64>,
    sort_by: Option<String>,
    sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeatmapQuery {
    start_date: Option<String>,
    end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordHistoryQuery {
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportQuery {
    format: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users))
        .route("/:id", get(get_user).delete(delete_user))
        .route("/:id/role", put(update_user_role))
        .route(
            "/:id/reset-password-token",
            axum::routing::post(create_password_reset_token),
        )
        .route("/:id/learning-data", get(get_learning_data))
        .route("/:id/statistics", get(get_statistics))
        .route("/:id/words", get(get_user_words))
        .route("/:id/words/export", get(export_user_words))
        .route("/:id/decisions", get(get_user_decisions))
        .route("/:id/decisions/:decisionId", get(get_decision_detail))
        .route("/:userId/heatmap", get(get_user_heatmap))
        .route("/:userId/words/:wordId", get(get_user_word_detail))
        .route("/:userId/words/:wordId/history", get(get_word_history))
        .route(
            "/:userId/words/:wordId/score-history",
            get(get_word_score_history),
        )
        .route(
            "/:userId/words/:wordId/flag",
            axum::routing::post(flag_anomaly),
        )
        .route("/:userId/words/:wordId/flags", get(get_anomaly_flags))
}

async fn list_users(
    State(state): State<AppState>,
    Query(query): Query<ListUsersQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 200);

    let params = crate::services::admin::ListUsersParams {
        page,
        page_size,
        search: query.search,
    };

    match crate::services::admin::list_users(proxy.as_ref(), params).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_user(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_user_by_id(proxy.as_ref(), &id).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn update_user_role(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateUserRoleRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let role = payload.role.trim().to_ascii_uppercase();
    match crate::services::admin::update_user_role(proxy.as_ref(), &id, &role).await {
        Ok(data) => {
            if let Ok(token_hashes) = proxy.delete_all_user_sessions(&id).await {
                if let Some(cache) = state.cache() {
                    for token_hash in token_hashes {
                        cache
                            .delete(&crate::cache::keys::session_key(&token_hash))
                            .await;
                    }
                }
            }
            Json(SuccessResponse {
                success: true,
                data,
            })
            .into_response()
        }
        Err(err) => admin_error_response(err),
    }
}

async fn delete_user(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::delete_user(proxy.as_ref(), &id).await {
        Ok(()) => Json(MessageResponse {
            success: true,
            message: "用户删除成功",
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasswordResetTokenResponse {
    token: String,
    expires_at: String,
    reset_url: String,
}

async fn create_password_reset_token(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_user_by_id(proxy.as_ref(), &id).await {
        Ok(_) => {}
        Err(crate::services::admin::AdminError::NotFound(_)) => {
            return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "用户不存在").into_response();
        }
        Err(err) => return admin_error_response(err),
    }

    let token = uuid::Uuid::new_v4().to_string().replace("-", "");
    let expires_at = chrono::Utc::now().naive_utc() + chrono::Duration::hours(24);

    match crate::db::operations::user::create_password_reset_token(
        proxy.as_ref(),
        &id,
        &token,
        expires_at,
    )
    .await
    {
        Ok(_) => {
            let base_url = std::env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:5173".to_string());
            let reset_url = format!("{}/reset-password?token={}", base_url, token);
            let expires_at_str =
                chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(expires_at, chrono::Utc)
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

            Json(SuccessResponse {
                success: true,
                data: PasswordResetTokenResponse {
                    token,
                    expires_at: expires_at_str,
                    reset_url,
                },
            })
            .into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "create password reset token failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}

async fn get_learning_data(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<LearningDataQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    match crate::services::admin::get_user_learning_data(proxy.as_ref(), &id, limit).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_statistics(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_user_detailed_statistics(proxy.as_ref(), &id).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_user_words(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<UserWordsQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let params = crate::services::admin::UserWordsParams {
        page: query.page.unwrap_or(1).max(1),
        page_size: query.page_size.unwrap_or(20).clamp(1, 200),
        sort_by: crate::services::admin::UserWordsSortBy::from_query(query.sort_by.as_deref()),
        sort_order: crate::services::admin::SortOrder::from_query(query.sort_order.as_deref()),
        state: query.state,
        search: query.search,
        score_range: crate::services::admin::ScoreRange::from_query(query.score_range.as_deref()),
        mastery_level: query.mastery_level,
        min_accuracy: query.min_accuracy,
    };

    match crate::services::admin::get_user_words(proxy.as_ref(), &id, params).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn export_user_words(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<ExportQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::export_user_words(proxy.as_ref(), &id).await {
        Ok(data) => {
            let format = query.format.as_deref().unwrap_or("json");
            if format == "csv" {
                let mut csv = String::from("wordId,spelling,phonetic,state,score,masteryLevel,reviewCount,accuracy,lastReviewDate\n");
                for item in &data {
                    csv.push_str(&format!(
                        "{},{},{},{},{},{},{},{},{}\n",
                        item.word_id,
                        item.spelling,
                        item.phonetic.as_deref().unwrap_or(""),
                        item.state,
                        item.score,
                        item.mastery_level,
                        item.review_count,
                        item.accuracy,
                        item.last_review_date.as_deref().unwrap_or("")
                    ));
                }
                (
                    StatusCode::OK,
                    [(axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8")],
                    csv,
                )
                    .into_response()
            } else {
                Json(SuccessResponse {
                    success: true,
                    data,
                })
                .into_response()
            }
        }
        Err(err) => admin_error_response(err),
    }
}

async fn get_user_decisions(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<DecisionsQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let params = crate::services::admin::UserDecisionsParams {
        page: query.page.unwrap_or(1).max(1),
        page_size: query.page_size.unwrap_or(20).clamp(1, 100),
        start_date: query.start_date,
        end_date: query.end_date,
        decision_source: query.decision_source,
        min_confidence: query.min_confidence,
        sort_by: crate::services::admin::DecisionSortBy::from_query(query.sort_by.as_deref()),
        sort_order: crate::services::admin::SortOrder::from_query(query.sort_order.as_deref()),
    };

    match crate::services::admin::get_user_decisions(proxy.as_ref(), &id, params).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_decision_detail(Path((_id, _decision_id)): Path<(String, String)>) -> Response {
    json_error(
        StatusCode::NOT_IMPLEMENTED,
        "NOT_IMPLEMENTED",
        "AMAS 决策详情功能开发中",
    )
    .into_response()
}

async fn get_user_heatmap(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Query(query): Query<HeatmapQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_user_heatmap(
        proxy.as_ref(),
        &user_id,
        query.start_date.as_deref(),
        query.end_date.as_deref(),
    )
    .await
    {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_user_word_detail(
    State(state): State<AppState>,
    Path((user_id, word_id)): Path<(String, String)>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_user_word_detail(proxy.as_ref(), &user_id, &word_id).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_word_history(
    State(state): State<AppState>,
    Path((user_id, word_id)): Path<(String, String)>,
    Query(query): Query<WordHistoryQuery>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let limit = query.limit.unwrap_or(50);
    match crate::services::admin::get_word_history(proxy.as_ref(), &user_id, &word_id, limit).await
    {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_word_score_history(
    State(state): State<AppState>,
    Path((user_id, word_id)): Path<(String, String)>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_word_score_history(proxy.as_ref(), &user_id, &word_id).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn flag_anomaly(
    State(state): State<AppState>,
    Path((user_id, word_id)): Path<(String, String)>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<crate::services::admin::FlagAnomalyRequest>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    let flagged_by = match crate::auth::extract_token(&headers) {
        Some(token) => match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user.id,
            Err(_) => "system".to_string(),
        },
        None => "system".to_string(),
    };

    match crate::services::admin::create_anomaly_flag(
        proxy.as_ref(),
        &user_id,
        &word_id,
        &flagged_by,
        payload,
    )
    .await
    {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

async fn get_anomaly_flags(
    State(state): State<AppState>,
    Path((user_id, word_id)): Path<(String, String)>,
) -> Response {
    let Some(proxy) = state.db_proxy() else {
        return json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response();
    };

    match crate::services::admin::get_anomaly_flags(proxy.as_ref(), &user_id, &word_id).await {
        Ok(data) => Json(SuccessResponse {
            success: true,
            data,
        })
        .into_response(),
        Err(err) => admin_error_response(err),
    }
}

fn not_implemented() -> Response {
    json_error(
        StatusCode::NOT_IMPLEMENTED,
        "NOT_IMPLEMENTED",
        "功能尚未实现",
    )
    .into_response()
}

fn admin_error_response(err: crate::services::admin::AdminError) -> Response {
    match err {
        crate::services::admin::AdminError::Validation(message) => {
            json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message).into_response()
        }
        crate::services::admin::AdminError::NotFound(message) => {
            json_error(StatusCode::NOT_FOUND, "NOT_FOUND", message).into_response()
        }
        crate::services::admin::AdminError::Forbidden(message) => {
            json_error(StatusCode::FORBIDDEN, "FORBIDDEN", message).into_response()
        }
        crate::services::admin::AdminError::Unauthorized(message) => {
            json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message).into_response()
        }
        crate::services::admin::AdminError::Unavailable => json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DATABASE_UNAVAILABLE",
            "数据库不可用",
        )
        .into_response(),
        crate::services::admin::AdminError::Sql(err) => {
            tracing::warn!(error = %err, "admin query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
        crate::services::admin::AdminError::Mutation(message) => {
            tracing::warn!(error = %message, "admin mutation failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
        crate::services::admin::AdminError::Record(err) => {
            tracing::warn!(error = %err, "admin record query failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务器内部错误",
            )
            .into_response()
        }
    }
}
