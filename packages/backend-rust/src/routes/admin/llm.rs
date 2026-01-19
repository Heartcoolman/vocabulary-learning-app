use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::auth::AuthUser;
use crate::db::operations::llm::{
    insert_llm_analysis_task, insert_word_content_variant, update_llm_task_completed,
    update_llm_task_failed, update_llm_task_started, update_suggestion_effect,
    update_word_content_variant_status,
};
use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", post(create_task))
        .route("/tasks", get(list_tasks))
        .route("/tasks/:id/start", put(start_task))
        .route("/tasks/:id/complete", put(complete_task))
        .route("/tasks/:id/fail", put(fail_task))
        .route("/word-variants", post(create_word_variant))
        .route("/word-variants", get(list_word_variants))
        .route("/word-variants/:id/status", put(update_variant_status))
        .route(
            "/suggestion-effects/:id/evaluate",
            put(evaluate_suggestion_effect),
        )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTaskRequest {
    task_type: String,
    priority: Option<i32>,
    input: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskIdResponse {
    id: String,
}

async fn create_task(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let priority = body.priority.unwrap_or(0);
    match insert_llm_analysis_task(
        proxy.as_ref(),
        &body.task_type,
        priority,
        &body.input,
        Some(&user.id),
    )
    .await
    {
        Ok(id) => Ok(Json(SuccessResponse {
            success: true,
            data: TaskIdResponse { id },
        })),
        Err(e) => {
            tracing::warn!(error = %e, "create llm task failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "创建任务失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListTasksQuery {
    status: Option<String>,
    task_type: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskItem {
    id: String,
    task_type: String,
    status: String,
    priority: i32,
    input: serde_json::Value,
    output: Option<serde_json::Value>,
    tokens_used: Option<i32>,
    error: Option<String>,
    retry_count: i32,
    created_by: Option<String>,
    created_at: String,
    started_at: Option<String>,
    completed_at: Option<String>,
}

async fn list_tasks(
    State(state): State<AppState>,
    Query(query): Query<ListTasksQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let pool = proxy.pool();

    let rows = match (&query.status, &query.task_type) {
        (Some(status), Some(task_type)) => {
            sqlx::query(
                r#"SELECT * FROM "llm_analysis_tasks" WHERE "status" = $1 AND "taskType" = $2 ORDER BY "priority" DESC, "createdAt" DESC LIMIT $3"#,
            )
            .bind(status)
            .bind(task_type)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (Some(status), None) => {
            sqlx::query(
                r#"SELECT * FROM "llm_analysis_tasks" WHERE "status" = $1 ORDER BY "priority" DESC, "createdAt" DESC LIMIT $2"#,
            )
            .bind(status)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, Some(task_type)) => {
            sqlx::query(
                r#"SELECT * FROM "llm_analysis_tasks" WHERE "taskType" = $1 ORDER BY "priority" DESC, "createdAt" DESC LIMIT $2"#,
            )
            .bind(task_type)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query(
                r#"SELECT * FROM "llm_analysis_tasks" ORDER BY "priority" DESC, "createdAt" DESC LIMIT $1"#,
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        }
    };

    let rows = rows.map_err(|e| {
        tracing::warn!(error = %e, "list llm tasks failed");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "查询任务失败",
        )
    })?;

    let items: Vec<TaskItem> = rows.iter().map(map_task_row).collect();
    Ok(Json(SuccessResponse {
        success: true,
        data: items,
    }))
}

fn map_task_row(row: &sqlx::postgres::PgRow) -> TaskItem {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let started_at: Option<chrono::NaiveDateTime> = row.try_get("startedAt").ok();
    let completed_at: Option<chrono::NaiveDateTime> = row.try_get("completedAt").ok();

    TaskItem {
        id: row.try_get("id").unwrap_or_default(),
        task_type: row.try_get("taskType").unwrap_or_default(),
        status: row.try_get("status").unwrap_or_default(),
        priority: row.try_get("priority").unwrap_or(0),
        input: row.try_get("input").unwrap_or(serde_json::Value::Null),
        output: row.try_get("output").ok(),
        tokens_used: row.try_get("tokensUsed").ok(),
        error: row.try_get("error").ok(),
        retry_count: row.try_get("retryCount").unwrap_or(0),
        created_by: row.try_get("createdBy").ok(),
        created_at: format_naive_iso(created_at),
        started_at: started_at.map(format_naive_iso),
        completed_at: completed_at.map(format_naive_iso),
    }
}

fn format_naive_iso(value: chrono::NaiveDateTime) -> String {
    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(value, chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

async fn start_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match update_llm_task_started(proxy.as_ref(), &id).await {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": "processing" }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "start llm task failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "更新任务状态失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompleteTaskRequest {
    output: serde_json::Value,
    tokens_used: Option<i32>,
}

async fn complete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CompleteTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match update_llm_task_completed(proxy.as_ref(), &id, &body.output, body.tokens_used).await {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": "completed" }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "complete llm task failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "更新任务状态失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FailTaskRequest {
    error: String,
}

async fn fail_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<FailTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match update_llm_task_failed(proxy.as_ref(), &id, &body.error).await {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": "failed" }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "fail llm task failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "更新任务状态失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWordVariantRequest {
    word_id: String,
    field: String,
    original_value: Option<serde_json::Value>,
    generated_value: serde_json::Value,
    confidence: f64,
    task_id: Option<String>,
}

async fn create_word_variant(
    State(state): State<AppState>,
    Json(body): Json<CreateWordVariantRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match insert_word_content_variant(
        proxy.as_ref(),
        &body.word_id,
        &body.field,
        body.original_value.as_ref(),
        &body.generated_value,
        body.confidence,
        body.task_id.as_deref(),
    )
    .await
    {
        Ok(id) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "create word variant failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "创建单词变体失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListVariantsQuery {
    status: Option<String>,
    word_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VariantItem {
    id: String,
    word_id: String,
    field: String,
    original_value: Option<serde_json::Value>,
    generated_value: serde_json::Value,
    confidence: f64,
    task_id: Option<String>,
    status: String,
    approved_by: Option<String>,
    approved_at: Option<String>,
    created_at: String,
}

async fn list_word_variants(
    State(state): State<AppState>,
    Query(query): Query<ListVariantsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let pool = proxy.pool();

    let rows = match (&query.status, &query.word_id) {
        (Some(status), Some(word_id)) => {
            sqlx::query(
                r#"SELECT * FROM "word_content_variants" WHERE "status" = $1 AND "wordId" = $2 ORDER BY "createdAt" DESC LIMIT $3"#,
            )
            .bind(status)
            .bind(word_id)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (Some(status), None) => {
            sqlx::query(
                r#"SELECT * FROM "word_content_variants" WHERE "status" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
            )
            .bind(status)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, Some(word_id)) => {
            sqlx::query(
                r#"SELECT * FROM "word_content_variants" WHERE "wordId" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
            )
            .bind(word_id)
            .bind(limit)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query(
                r#"SELECT * FROM "word_content_variants" ORDER BY "createdAt" DESC LIMIT $1"#,
            )
            .bind(limit)
            .fetch_all(pool)
            .await
        }
    };

    let rows = rows.map_err(|e| {
        tracing::warn!(error = %e, "list word variants failed");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DB_ERROR",
            "查询单词变体失败",
        )
    })?;

    let items: Vec<VariantItem> = rows.iter().map(map_variant_row).collect();
    Ok(Json(SuccessResponse {
        success: true,
        data: items,
    }))
}

fn map_variant_row(row: &sqlx::postgres::PgRow) -> VariantItem {
    let created_at: chrono::NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| chrono::Utc::now().naive_utc());
    let approved_at: Option<chrono::NaiveDateTime> = row.try_get("approvedAt").ok();

    VariantItem {
        id: row.try_get("id").unwrap_or_default(),
        word_id: row.try_get("wordId").unwrap_or_default(),
        field: row.try_get("field").unwrap_or_default(),
        original_value: row.try_get("originalValue").ok(),
        generated_value: row
            .try_get("generatedValue")
            .unwrap_or(serde_json::Value::Null),
        confidence: row.try_get("confidence").unwrap_or(0.0),
        task_id: row.try_get("taskId").ok(),
        status: row.try_get("status").unwrap_or_default(),
        approved_by: row.try_get("approvedBy").ok(),
        approved_at: approved_at.map(format_naive_iso),
        created_at: format_naive_iso(created_at),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateVariantStatusRequest {
    status: String,
}

async fn update_variant_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateVariantStatusRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    let approved_by = if body.status == "approved" {
        Some(user.id.as_str())
    } else {
        None
    };

    match update_word_content_variant_status(proxy.as_ref(), &id, &body.status, approved_by).await {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "status": body.status }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "update variant status failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "更新状态失败",
            ))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvaluateSuggestionEffectRequest {
    metrics_after_apply: serde_json::Value,
    effect_score: f64,
    effect_analysis: String,
}

async fn evaluate_suggestion_effect(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<EvaluateSuggestionEffectRequest>,
) -> Result<impl IntoResponse, AppError> {
    let Some(proxy) = state.db_proxy() else {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        ));
    };

    match update_suggestion_effect(
        proxy.as_ref(),
        &id,
        &body.metrics_after_apply,
        body.effect_score,
        &body.effect_analysis,
    )
    .await
    {
        Ok(()) => Ok(Json(SuccessResponse {
            success: true,
            data: serde_json::json!({ "id": id, "evaluated": true }),
        })),
        Err(e) => {
            tracing::warn!(error = %e, "evaluate suggestion effect failed");
            Err(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DB_ERROR",
                "评估建议效果失败",
            ))
        }
    }
}
