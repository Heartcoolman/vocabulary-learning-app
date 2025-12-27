use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use chrono::{NaiveDateTime, Utc};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::response::json_error;
use crate::state::AppState;

#[derive(serde::Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(serde::Serialize)]
struct SuccessMessageResponse {
    success: bool,
    message: String,
}

#[derive(serde::Serialize)]
struct ErrorMessageResponse {
    success: bool,
    message: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningObjectivesData {
    user_id: String,
    mode: String,
    primary_objective: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_accuracy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_daily_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_retention: Option<f64>,
    weight_short_term: f64,
    weight_long_term: f64,
    weight_efficiency: f64,
}

#[derive(Debug, Clone)]
struct ObjectivesRow {
    id: String,
    user_id: String,
    mode: String,
    primary_objective: String,
    min_accuracy: Option<f64>,
    max_daily_time: Option<i64>,
    target_retention: Option<f64>,
    weight_short_term: f64,
    weight_long_term: f64,
    weight_efficiency: f64,
}

impl ObjectivesRow {
    fn to_api(&self) -> LearningObjectivesData {
        LearningObjectivesData {
            user_id: self.user_id.clone(),
            mode: self.mode.clone(),
            primary_objective: self.primary_objective.clone(),
            min_accuracy: self.min_accuracy,
            max_daily_time: self.max_daily_time,
            target_retention: self.target_retention,
            weight_short_term: self.weight_short_term,
            weight_long_term: self.weight_long_term,
            weight_efficiency: self.weight_efficiency,
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateObjectivesPayload {
    mode: Option<String>,
    primary_objective: Option<String>,
    min_accuracy: Option<f64>,
    max_daily_time: Option<i64>,
    target_retention: Option<f64>,
    weight_short_term: Option<f64>,
    weight_long_term: Option<f64>,
    weight_efficiency: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchModePayload {
    mode: String,
    reason: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestionsResponse {
    current_mode: String,
    suggested_modes: Vec<SuggestedMode>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SuggestedMode {
    mode: String,
    reason: String,
    config: PresetConfig,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PresetConfig {
    mode: String,
    primary_objective: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_accuracy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_daily_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_retention: Option<f64>,
    weight_short_term: f64,
    weight_long_term: f64,
    weight_efficiency: f64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ObjectiveHistoryItem {
    timestamp: String,
    reason: String,
    before_mode: String,
    after_mode: String,
}

pub async fn get_objectives(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    match select_user_objectives(proxy.as_ref(), &auth_user.id).await {
        Ok(Some(row)) => Json(SuccessResponse {
            success: true,
            data: row.to_api(),
            message: None,
        })
        .into_response(),
        Ok(None) => {
            let default_preset = preset_mode("daily");
            Json(SuccessResponse {
                success: true,
                data: LearningObjectivesData {
                    user_id: auth_user.id,
                    mode: default_preset.mode,
                    primary_objective: default_preset.primary_objective,
                    min_accuracy: default_preset.min_accuracy,
                    max_daily_time: default_preset.max_daily_time,
                    target_retention: default_preset.target_retention,
                    weight_short_term: default_preset.weight_short_term,
                    weight_long_term: default_preset.weight_long_term,
                    weight_efficiency: default_preset.weight_efficiency,
                },
                message: Some("使用默认学习目标".to_string()),
            })
            .into_response()
        }
        Err(err) => {
            tracing::warn!(error = %err, "get learning objectives failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn upsert_objectives(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: UpdateObjectivesPayload = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if let Some(mode) = payload.mode.as_deref() {
        if !is_valid_mode(mode) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessageResponse {
                    success: false,
                    message: "无效的学习模式".to_string(),
                }),
            )
                .into_response();
        }
    }

    if let Some(primary) = payload.primary_objective.as_deref() {
        if !is_valid_primary_objective(primary) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessageResponse {
                    success: false,
                    message: "无效的主要目标".to_string(),
                }),
            )
                .into_response();
        }
    }

    if let Some(value) = payload.min_accuracy {
        if !(0.0..=1.0).contains(&value) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessageResponse {
                    success: false,
                    message: "minAccuracy 必须在 0-1 之间".to_string(),
                }),
            )
                .into_response();
        }
    }

    if let Some(value) = payload.target_retention {
        if !(0.0..=1.0).contains(&value) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessageResponse {
                    success: false,
                    message: "targetRetention 必须在 0-1 之间".to_string(),
                }),
            )
                .into_response();
        }
    }

    if let Some(value) = payload.max_daily_time {
        if !(5..=480).contains(&value) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorMessageResponse {
                    success: false,
                    message: "maxDailyTime 必须在 5-480 之间".to_string(),
                }),
            )
                .into_response();
        }
    }

    for (name, value) in [
        ("weightShortTerm", payload.weight_short_term),
        ("weightLongTerm", payload.weight_long_term),
        ("weightEfficiency", payload.weight_efficiency),
    ] {
        if let Some(v) = value {
            if !(0.0..=1.0).contains(&v) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorMessageResponse {
                        success: false,
                        message: format!("{name} 必须在 0-1 之间"),
                    }),
                )
                    .into_response();
            }
        }
    }

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let existing = match select_user_objectives(proxy.as_ref(), &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "select learning objectives failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let (default_mode, default_primary, default_short, default_long, default_eff, default_min_accuracy, default_max_daily_time, default_target_retention) = match existing.as_ref() {
        Some(row) => (
            row.mode.clone(),
            row.primary_objective.clone(),
            row.weight_short_term,
            row.weight_long_term,
            row.weight_efficiency,
            row.min_accuracy,
            row.max_daily_time,
            row.target_retention,
        ),
        None => {
            let preset = preset_mode("daily");
            (
                preset.mode,
                preset.primary_objective,
                preset.weight_short_term,
                preset.weight_long_term,
                preset.weight_efficiency,
                preset.min_accuracy,
                preset.max_daily_time,
                preset.target_retention,
            )
        }
    };

    let min_accuracy = payload.min_accuracy.or(default_min_accuracy);
    let max_daily_time = payload.max_daily_time.or(default_max_daily_time);
    let target_retention = payload.target_retention.or(default_target_retention);

    let mode = payload.mode.unwrap_or(default_mode);
    let primary_objective = payload.primary_objective.unwrap_or(default_primary);

    let weight_short_term = payload.weight_short_term.unwrap_or(default_short);
    let weight_long_term = payload.weight_long_term.unwrap_or(default_long);
    let weight_efficiency = payload.weight_efficiency.unwrap_or(default_eff);
    let (weight_short_term, weight_long_term, weight_efficiency) =
        normalize_weights(weight_short_term, weight_long_term, weight_efficiency);

    let now_iso = now_iso_millis();
    if let Err(err) = upsert_objectives_row(
        proxy.as_ref(),
        &auth_user.id,
        existing.as_ref().map(|row| row.id.as_str()),
        &mode,
        &primary_objective,
        min_accuracy,
        max_daily_time,
        target_retention,
        weight_short_term,
        weight_long_term,
        weight_efficiency,
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "upsert learning objectives failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessResponse {
        success: true,
        data: LearningObjectivesData {
            user_id: auth_user.id,
            mode,
            primary_objective,
            min_accuracy,
            max_daily_time,
            target_retention,
            weight_short_term,
            weight_long_term,
            weight_efficiency,
        },
        message: None,
    })
    .into_response()
}

pub async fn switch_mode(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: SwitchModePayload = match serde_json::from_slice(&body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    if !is_valid_mode(&payload.mode) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorMessageResponse {
                success: false,
                message: "无效的学习模式".to_string(),
            }),
        )
            .into_response();
    }

    let reason = payload
        .reason
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("manual")
        .to_string();

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let current = match select_user_objectives(proxy.as_ref(), &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "select learning objectives failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let preset = preset_mode(&payload.mode);
    let primary_objective = preset.primary_objective.clone();
    let min_accuracy = preset.min_accuracy;
    let max_daily_time = preset.max_daily_time;
    let target_retention = preset.target_retention;
    let (weight_short_term, weight_long_term, weight_efficiency) = normalize_weights(
        preset.weight_short_term,
        preset.weight_long_term,
        preset.weight_efficiency,
    );

    let now_iso = now_iso_millis();
    if let Err(err) = upsert_objectives_row(
        proxy.as_ref(),
        &auth_user.id,
        current.as_ref().map(|row| row.id.as_str()),
        &preset.mode,
        &primary_objective,
        min_accuracy,
        max_daily_time,
        target_retention,
        weight_short_term,
        weight_long_term,
        weight_efficiency,
        &now_iso,
    )
    .await
    {
        tracing::warn!(error = %err, "switch mode upsert failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    if let Some(before) = current.as_ref() {
        if let Err(err) = insert_objective_history(
            proxy.as_ref(),
            &auth_user.id,
            &before.id,
            &reason,
            before,
            &preset.mode,
            weight_short_term,
            weight_long_term,
            weight_efficiency,
        )
        .await
        {
            tracing::warn!(error = %err, "objective history insert failed");
        }
    }

    Json(SuccessResponse {
        success: true,
        data: LearningObjectivesData {
            user_id: auth_user.id,
            mode: preset.mode.clone(),
            primary_objective,
            min_accuracy,
            max_daily_time,
            target_retention,
            weight_short_term,
            weight_long_term,
            weight_efficiency,
        },
        message: Some(format!("已切换到{}模式", payload.mode)),
    })
    .into_response()
}

pub async fn suggestions(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let current = match select_user_objectives(proxy.as_ref(), &auth_user.id).await {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "select learning objectives failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let response = if let Some(current) = current.as_ref() {
        build_suggestions(current.mode.as_str())
    } else {
        SuggestionsResponse {
            current_mode: "daily".to_string(),
            suggested_modes: vec![SuggestedMode {
                mode: "daily".to_string(),
                reason: "平衡短期和长期记忆，适合日常学习".to_string(),
                config: preset_mode("daily"),
            }],
        }
    };

    Json(SuccessResponse {
        success: true,
        data: response,
        message: None,
    })
    .into_response()
}

pub async fn history(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let query_string = req.uri().query().unwrap_or("");
    let limit = get_query_param(query_string, "limit")
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(10)
        .clamp(1, 100);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let history = match select_objective_history(proxy.as_ref(), &auth_user.id, limit).await {
        Ok(items) => items,
        Err(err) => {
            tracing::warn!(error = %err, "select objective history failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: history,
        message: None,
    })
    .into_response()
}

pub async fn delete_objectives(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    if let Err(err) = delete_objectives_row(proxy.as_ref(), &auth_user.id).await {
        tracing::warn!(error = %err, "delete learning objectives failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    Json(SuccessMessageResponse {
        success: true,
        message: "学习目标配置已删除".to_string(),
    })
    .into_response()
}

fn build_suggestions(current_mode: &str) -> SuggestionsResponse {
    let mut suggested_modes = Vec::new();
    let modes = ["exam", "daily", "travel", "custom"];
    for mode in modes {
        if mode == current_mode {
            continue;
        }
        let reason = match mode {
            "exam" => "提升准确率，适合备考冲刺",
            "daily" => "平衡学习，适合长期记忆",
            "travel" => "快速学习，适合时间有限",
            "custom" => "自定义配置，灵活调整",
            _ => "",
        };

        suggested_modes.push(SuggestedMode {
            mode: mode.to_string(),
            reason: reason.to_string(),
            config: preset_mode(mode),
        });
    }

    SuggestionsResponse {
        current_mode: current_mode.to_string(),
        suggested_modes,
    }
}

fn preset_mode(mode: &str) -> PresetConfig {
    match mode {
        "exam" => PresetConfig {
            mode: "exam".to_string(),
            primary_objective: "accuracy".to_string(),
            min_accuracy: Some(0.85),
            max_daily_time: None,
            target_retention: None,
            weight_short_term: 0.6,
            weight_long_term: 0.3,
            weight_efficiency: 0.1,
        },
        "travel" => PresetConfig {
            mode: "travel".to_string(),
            primary_objective: "efficiency".to_string(),
            min_accuracy: None,
            max_daily_time: Some(30),
            target_retention: None,
            weight_short_term: 0.2,
            weight_long_term: 0.3,
            weight_efficiency: 0.5,
        },
        "custom" => PresetConfig {
            mode: "custom".to_string(),
            primary_objective: "accuracy".to_string(),
            min_accuracy: None,
            max_daily_time: None,
            target_retention: None,
            weight_short_term: 0.4,
            weight_long_term: 0.4,
            weight_efficiency: 0.2,
        },
        _ => PresetConfig {
            mode: "daily".to_string(),
            primary_objective: "retention".to_string(),
            min_accuracy: None,
            max_daily_time: None,
            target_retention: Some(0.8),
            weight_short_term: 0.3,
            weight_long_term: 0.5,
            weight_efficiency: 0.2,
        },
    }
}

fn normalize_weights(short: f64, long: f64, efficiency: f64) -> (f64, f64, f64) {
    let sum = short + long + efficiency;
    if (sum - 1.0).abs() < 0.01 {
        return (short, long, efficiency);
    }

    if sum <= 0.0 {
        let v = 1.0 / 3.0;
        return (v, v, v);
    }

    (short / sum, long / sum, efficiency / sum)
}

fn is_valid_mode(mode: &str) -> bool {
    matches!(mode, "exam" | "daily" | "travel" | "custom")
}

fn is_valid_primary_objective(value: &str) -> bool {
    matches!(value, "accuracy" | "retention" | "efficiency")
}

async fn select_user_objectives(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<ObjectivesRow>, sqlx::Error> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
          "id",
          "userId",
          "mode",
          "primaryObjective",
          "minAccuracy",
          "maxDailyTime",
          "targetRetention",
          "weightShortTerm",
          "weightLongTerm",
          "weightEfficiency"
        FROM "user_learning_objectives"
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    Ok(Some(ObjectivesRow {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        mode: row.try_get("mode")?,
        primary_objective: row.try_get("primaryObjective")?,
        min_accuracy: row.try_get("minAccuracy")?,
        max_daily_time: row.try_get::<Option<i32>, _>("maxDailyTime")?.map(|v| v as i64),
        target_retention: row.try_get("targetRetention")?,
        weight_short_term: row.try_get("weightShortTerm")?,
        weight_long_term: row.try_get("weightLongTerm")?,
        weight_efficiency: row.try_get("weightEfficiency")?,
    }))
}

async fn upsert_objectives_row(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    existing_id: Option<&str>,
    mode: &str,
    primary_objective: &str,
    min_accuracy: Option<f64>,
    max_daily_time: Option<i64>,
    target_retention: Option<f64>,
    weight_short_term: f64,
    weight_long_term: f64,
    weight_efficiency: f64,
    now_iso: &str,
) -> Result<(), String> {
    let record_id = existing_id
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let pool = proxy.pool();
    let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());

    sqlx::query(
        r#"
        INSERT INTO "user_learning_objectives" (
          "id",
          "userId",
          "mode",
          "primaryObjective",
          "minAccuracy",
          "maxDailyTime",
          "targetRetention",
          "weightShortTerm",
          "weightLongTerm",
          "weightEfficiency",
          "updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
        ON CONFLICT ("userId") DO UPDATE SET
          "mode" = EXCLUDED."mode",
          "primaryObjective" = EXCLUDED."primaryObjective",
          "minAccuracy" = EXCLUDED."minAccuracy",
          "maxDailyTime" = EXCLUDED."maxDailyTime",
          "targetRetention" = EXCLUDED."targetRetention",
          "weightShortTerm" = EXCLUDED."weightShortTerm",
          "weightLongTerm" = EXCLUDED."weightLongTerm",
          "weightEfficiency" = EXCLUDED."weightEfficiency",
          "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(record_id)
    .bind(user_id)
    .bind(mode)
    .bind(primary_objective)
    .bind(min_accuracy)
    .bind(max_daily_time.map(|v| v as i32))
    .bind(target_retention)
    .bind(weight_short_term)
    .bind(weight_long_term)
    .bind(weight_efficiency)
    .bind(now)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|err| err.to_string())
}

async fn delete_objectives_row(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<(), String> {
    let pool = proxy.pool();
    sqlx::query(r#"DELETE FROM "user_learning_objectives" WHERE "userId" = $1"#)
        .bind(user_id)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|err| err.to_string())
}

async fn insert_objective_history(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    objective_id: &str,
    reason: &str,
    before: &ObjectivesRow,
    after_mode: &str,
    after_short: f64,
    after_long: f64,
    after_eff: f64,
) -> Result<(), String> {
    let before_metrics = serde_json::json!({
        "mode": &before.mode,
        "weights": {
            "shortTerm": before.weight_short_term,
            "longTerm": before.weight_long_term,
            "efficiency": before.weight_efficiency,
        }
    });

    let after_metrics = serde_json::json!({
        "mode": after_mode,
        "weights": {
            "shortTerm": after_short,
            "longTerm": after_long,
            "efficiency": after_eff,
        }
    });

    let pool = proxy.pool();
    sqlx::query(
        r#"
        INSERT INTO "objective_history" (
          "id",
          "userId",
          "objectiveId",
          "reason",
          "beforeMetrics",
          "afterMetrics"
        ) VALUES ($1,$2,$3,$4,$5,$6)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(objective_id)
    .bind(reason)
    .bind(before_metrics)
    .bind(after_metrics)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|err| err.to_string())
}

async fn select_objective_history(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    limit: i64,
) -> Result<Vec<ObjectiveHistoryItem>, sqlx::Error> {
    let pool = proxy.pool();

    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "timestamp", "reason", "beforeMetrics", "afterMetrics"
        FROM "objective_history"
        WHERE "userId" =
        "#,
    );
    qb.push_bind(user_id);
    qb.push(r#" ORDER BY "timestamp" DESC LIMIT "#);
    qb.push_bind(limit);

    let rows = qb.build().fetch_all(pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let timestamp: NaiveDateTime = row.try_get("timestamp")?;
        let reason: String = row.try_get("reason")?;
        let before: serde_json::Value = row.try_get("beforeMetrics")?;
        let after: serde_json::Value = row.try_get("afterMetrics")?;
        out.push(ObjectiveHistoryItem {
            timestamp: crate::auth::format_naive_datetime_iso_millis(timestamp),
            reason,
            before_mode: before.get("mode").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            after_mode: after.get("mode").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        });
    }
    Ok(out)
}

fn now_iso_millis() -> String {
    crate::auth::format_naive_datetime_iso_millis(Utc::now().naive_utc())
}

fn parse_naive_datetime(value: &str) -> Option<NaiveDateTime> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|dt| dt.naive_utc())
}

fn get_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut iter = pair.splitn(2, '=');
        let k = iter.next().unwrap_or("");
        if k != key {
            continue;
        }
        let value = iter.next().unwrap_or("");
        return Some(percent_decode(value));
    }
    None
}

fn percent_decode(input: &str) -> String {
    let mut out: Vec<u8> = Vec::with_capacity(input.len());
    let mut bytes = input.as_bytes().iter().copied();
    while let Some(b) = bytes.next() {
        match b {
            b'+' => out.push(b' '),
            b'%' => {
                let hi = bytes.next();
                let lo = bytes.next();
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    if let (Some(hi), Some(lo)) = (from_hex(hi), from_hex(lo)) {
                        out.push(hi * 16 + lo);
                        continue;
                    }
                }
                out.push(b'%');
                if let Some(hi) = hi {
                    out.push(hi);
                }
                if let Some(lo) = lo {
                    out.push(lo);
                }
            }
            other => out.push(other),
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

async fn split_body(req: Request<Body>) -> Result<(axum::http::request::Parts, Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response());
        }
    };
    Ok((parts, body_bytes))
}