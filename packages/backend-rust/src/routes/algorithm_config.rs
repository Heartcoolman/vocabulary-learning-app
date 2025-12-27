use std::collections::HashMap;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::response::json_error;
use crate::state::AppState;

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Serialize)]
struct ValidationErrorResponse {
    success: bool,
    error: String,
    code: &'static str,
}

#[derive(Debug, Serialize)]
struct ConfigValidationResponse {
    success: bool,
    message: &'static str,
    errors: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AlgorithmConfigDto {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    review_intervals: Vec<i32>,
    consecutive_correct_threshold: i32,
    consecutive_wrong_threshold: i32,
    difficulty_adjustment_interval: i32,
    priority_weight_new_word: i32,
    priority_weight_error_rate: i32,
    priority_weight_overdue_time: i32,
    priority_weight_word_score: i32,
    score_weight_accuracy: i32,
    score_weight_speed: i32,
    score_weight_stability: i32,
    score_weight_proficiency: i32,
    speed_threshold_excellent: i32,
    speed_threshold_good: i32,
    speed_threshold_average: i32,
    speed_threshold_slow: i32,
    new_word_ratio_default: f64,
    new_word_ratio_high_accuracy: f64,
    new_word_ratio_low_accuracy: f64,
    new_word_ratio_high_accuracy_threshold: f64,
    new_word_ratio_low_accuracy_threshold: f64,
    mastery_thresholds: serde_json::Value,
    is_default: bool,
    created_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_by: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHistoryDto {
    id: String,
    config_id: String,
    changed_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    change_reason: Option<String>,
    previous_value: serde_json::Value,
    new_value: serde_json::Value,
    timestamp: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateConfigRequest {
    config: serde_json::Value,
    #[serde(default)]
    change_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ResetConfigRequest {
    #[serde(default)]
    config_id: Option<String>,
}

pub async fn get_active(
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

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    let config = match select_active_config(proxy.as_ref()).await {
        Ok(config) => config,
        Err(err) => {
            tracing::warn!(error = %err, "select active algorithm config failed");
            return Json(SuccessResponse::<Option<AlgorithmConfigDto>> { success: true, data: None }).into_response();
        }
    };

    if config.is_none() {
        tracing::warn!(user_id = %user.id, "algorithm config missing");
        return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "未找到算法配置").into_response();
    }

    Json(SuccessResponse { success: true, data: config }).into_response()
}

pub async fn update_config(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let config_id = match extract_config_id(parts.uri.path(), "/api/algorithm-config/") {
        Some(id) => id,
        None => {
            return Json(ValidationErrorResponse {
                success: false,
                error: "无效的configId格式".to_string(),
                code: "VALIDATION_ERROR",
            })
            .into_response();
        }
    };

    if Uuid::parse_str(&config_id).is_err() {
        return Json(ValidationErrorResponse {
            success: false,
            error: "无效的configId格式".to_string(),
            code: "VALIDATION_ERROR",
        })
        .into_response();
    }

    let payload: UpdateConfigRequest = match serde_json::from_slice(&body_bytes) {
        Ok(payload) => payload,
        Err(_) => {
            return Json(ValidationErrorResponse {
                success: false,
                error: "请求参数不合法".to_string(),
                code: "VALIDATION_ERROR",
            })
            .into_response();
        }
    };

    let config_obj = match payload.config.as_object() {
        Some(obj) if !obj.is_empty() => obj,
        _ => {
            return Json(ValidationErrorResponse {
                success: false,
                error: "配置数据不能为空".to_string(),
                code: "VALIDATION_ERROR",
            })
            .into_response();
        }
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    if user.role != "ADMIN" {
        return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限").into_response();
    }

    let validation_errors = validate_config(config_obj);
    if !validation_errors.is_empty() {
        return Json(ConfigValidationResponse {
            success: false,
            message: "配置验证失败",
            errors: validation_errors,
        })
        .into_response();
    }

    let old_config = match select_config_by_id(proxy.as_ref(), &config_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "配置不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select algorithm config for update failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    if let Err(err) = apply_config_update(
        proxy.as_ref(),
        &config_id,
        config_obj,
        user.id.as_str(),
        payload.change_reason.as_deref(),
        &old_config,
    )
    .await
    {
        tracing::warn!(error = %err, "algorithm config update failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let updated_config = match select_config_by_id(proxy.as_ref(), &config_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "配置不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select updated algorithm config failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse { success: true, data: updated_config }).into_response()
}

pub async fn reset_config(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let payload: ResetConfigRequest = serde_json::from_slice(&body_bytes).unwrap_or_default();

    if let Some(ref config_id) = payload.config_id {
        if Uuid::parse_str(config_id).is_err() {
            return Json(ValidationErrorResponse {
                success: false,
                error: "无效的configId格式".to_string(),
                code: "VALIDATION_ERROR",
            })
            .into_response();
        }
    }

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    if user.role != "ADMIN" {
        return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限").into_response();
    }

    let target_id = match payload.config_id {
        Some(value) => value,
        None => match select_active_config(proxy.as_ref()).await {
            Ok(Some(config)) => config.id,
            Ok(None) => {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "没有可用的算法配置")
                    .into_response()
            }
            Err(err) => {
                tracing::warn!(error = %err, "select active algorithm config for reset failed");
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
            }
        },
    };

    let old_config = match select_config_by_id(proxy.as_ref(), &target_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "配置不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select algorithm config for reset failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let default_config = match select_active_config(proxy.as_ref()).await {
        Ok(Some(config)) => config,
        Ok(None) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "默认配置不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select default algorithm config failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    if let Err(err) = apply_reset_to_default(
        proxy.as_ref(),
        &target_id,
        user.id.as_str(),
        &old_config,
        &default_config,
    )
    .await
    {
        tracing::warn!(error = %err, "algorithm config reset failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let updated_config = match select_config_by_id(proxy.as_ref(), &target_id).await {
        Ok(Some(config)) => config,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "配置不存在").into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select updated algorithm config after reset failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse { success: true, data: updated_config }).into_response()
}

pub async fn history(
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

    let user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    if user.role != "ADMIN" {
        return json_error(StatusCode::FORBIDDEN, "FORBIDDEN", "权限不足，需要管理员权限").into_response();
    }

    let params = parse_query(req.uri().query());
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(50)
        .min(200);
    let config_id = params.get("configId").cloned();

    match select_config_history(proxy.as_ref(), config_id.as_deref(), limit).await {
        Ok(history) => Json(SuccessResponse { success: true, data: history }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select config history failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

pub async fn presets(
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

    let _user = match crate::auth::verify_request_token(proxy.as_ref(), &token).await {
        Ok(user) => user,
        Err(_) => {
            return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录").into_response();
        }
    };

    match select_all_configs(proxy.as_ref()).await {
        Ok(configs) => Json(SuccessResponse { success: true, data: configs }).into_response(),
        Err(err) => {
            tracing::warn!(error = %err, "select algorithm configs failed");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response()
        }
    }
}

async fn apply_config_update(
    proxy: &crate::db::DatabaseProxy,
    config_id: &str,
    update: &serde_json::Map<String, serde_json::Value>,
    changed_by: &str,
    change_reason: Option<&str>,
    old_config: &AlgorithmConfigDto,
) -> Result<(), sqlx::Error> {
    let mut data = filter_update_fields(update);
    data.insert(
        "updatedAt".to_string(),
        serde_json::Value::String(now_iso_millis()),
    );

    let pool = proxy.pool();

    let old_json = serde_json::to_value(old_config).unwrap_or(serde_json::Value::Null);
    let new_config = update_postgres_config(pool, config_id, &data, old_config).await?;
    let new_json = serde_json::to_value(&new_config).unwrap_or(serde_json::Value::Null);

    insert_postgres_history(pool, config_id, changed_by, change_reason, old_json, new_json).await?;
    Ok(())
}

async fn apply_reset_to_default(
    proxy: &crate::db::DatabaseProxy,
    config_id: &str,
    changed_by: &str,
    old_config: &AlgorithmConfigDto,
    default_config: &AlgorithmConfigDto,
) -> Result<(), sqlx::Error> {
    let mut update = serde_json::Map::new();
    update.insert(
        "reviewIntervals".to_string(),
        serde_json::to_value(&default_config.review_intervals).unwrap_or(serde_json::Value::Null),
    );
    update.insert(
        "consecutiveCorrectThreshold".to_string(),
        serde_json::Value::Number(default_config.consecutive_correct_threshold.into()),
    );
    update.insert(
        "consecutiveWrongThreshold".to_string(),
        serde_json::Value::Number(default_config.consecutive_wrong_threshold.into()),
    );
    update.insert(
        "difficultyAdjustmentInterval".to_string(),
        serde_json::Value::Number(default_config.difficulty_adjustment_interval.into()),
    );
    update.insert(
        "priorityWeightNewWord".to_string(),
        serde_json::Value::Number(default_config.priority_weight_new_word.into()),
    );
    update.insert(
        "priorityWeightErrorRate".to_string(),
        serde_json::Value::Number(default_config.priority_weight_error_rate.into()),
    );
    update.insert(
        "priorityWeightOverdueTime".to_string(),
        serde_json::Value::Number(default_config.priority_weight_overdue_time.into()),
    );
    update.insert(
        "priorityWeightWordScore".to_string(),
        serde_json::Value::Number(default_config.priority_weight_word_score.into()),
    );
    update.insert(
        "scoreWeightAccuracy".to_string(),
        serde_json::Value::Number(default_config.score_weight_accuracy.into()),
    );
    update.insert(
        "scoreWeightSpeed".to_string(),
        serde_json::Value::Number(default_config.score_weight_speed.into()),
    );
    update.insert(
        "scoreWeightStability".to_string(),
        serde_json::Value::Number(default_config.score_weight_stability.into()),
    );
    update.insert(
        "scoreWeightProficiency".to_string(),
        serde_json::Value::Number(default_config.score_weight_proficiency.into()),
    );
    update.insert(
        "speedThresholdExcellent".to_string(),
        serde_json::Value::Number(default_config.speed_threshold_excellent.into()),
    );
    update.insert(
        "speedThresholdGood".to_string(),
        serde_json::Value::Number(default_config.speed_threshold_good.into()),
    );
    update.insert(
        "speedThresholdAverage".to_string(),
        serde_json::Value::Number(default_config.speed_threshold_average.into()),
    );
    update.insert(
        "speedThresholdSlow".to_string(),
        serde_json::Value::Number(default_config.speed_threshold_slow.into()),
    );
    update.insert(
        "newWordRatioDefault".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(default_config.new_word_ratio_default).unwrap_or_else(|| 0.into())),
    );
    update.insert(
        "newWordRatioHighAccuracy".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(default_config.new_word_ratio_high_accuracy).unwrap_or_else(|| 0.into())),
    );
    update.insert(
        "newWordRatioLowAccuracy".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(default_config.new_word_ratio_low_accuracy).unwrap_or_else(|| 0.into())),
    );
    update.insert(
        "newWordRatioHighAccuracyThreshold".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(default_config.new_word_ratio_high_accuracy_threshold).unwrap_or_else(|| 0.into())),
    );
    update.insert(
        "newWordRatioLowAccuracyThreshold".to_string(),
        serde_json::Value::Number(serde_json::Number::from_f64(default_config.new_word_ratio_low_accuracy_threshold).unwrap_or_else(|| 0.into())),
    );
    update.insert("masteryThresholds".to_string(), default_config.mastery_thresholds.clone());

    let mut data = filter_update_fields(&update);
    data.insert(
        "updatedAt".to_string(),
        serde_json::Value::String(now_iso_millis()),
    );

    let pool = proxy.pool();

    let old_json = serde_json::to_value(old_config).unwrap_or(serde_json::Value::Null);
    let new_config = update_postgres_config(pool, config_id, &data, old_config).await?;
    let new_json = serde_json::to_value(&new_config).unwrap_or(serde_json::Value::Null);
    insert_postgres_history(
        pool,
        config_id,
        changed_by,
        Some("重置为默认配置"),
        old_json,
        new_json,
    )
    .await?;
    Ok(())
}

async fn insert_postgres_history(
    pool: &sqlx::PgPool,
    config_id: &str,
    changed_by: &str,
    change_reason: Option<&str>,
    previous_value: serde_json::Value,
    new_value: serde_json::Value,
) -> Result<(), sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "config_history"
          ("id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(config_id)
    .bind(changed_by)
    .bind(change_reason)
    .bind(previous_value)
    .bind(new_value)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

fn merge_optional<T: Clone>(updated: Option<T>, current: &T) -> T {
    updated.unwrap_or_else(|| current.clone())
}

async fn update_postgres_config(
    pool: &sqlx::PgPool,
    config_id: &str,
    update: &serde_json::Map<String, serde_json::Value>,
    old_config: &AlgorithmConfigDto,
) -> Result<AlgorithmConfigDto, sqlx::Error> {
    let input: AlgorithmConfigUpdateInput =
        serde_json::from_value(serde_json::Value::Object(update.clone())).unwrap_or_default();

    let name = merge_optional(input.name, &old_config.name);
    let description = merge_optional(input.description, &old_config.description);
    let review_intervals = merge_optional(input.review_intervals, &old_config.review_intervals);
    let consecutive_correct_threshold =
        merge_optional(input.consecutive_correct_threshold, &old_config.consecutive_correct_threshold);
    let consecutive_wrong_threshold =
        merge_optional(input.consecutive_wrong_threshold, &old_config.consecutive_wrong_threshold);
    let difficulty_adjustment_interval =
        merge_optional(input.difficulty_adjustment_interval, &old_config.difficulty_adjustment_interval);
    let priority_weight_new_word =
        merge_optional(input.priority_weight_new_word, &old_config.priority_weight_new_word);
    let priority_weight_error_rate =
        merge_optional(input.priority_weight_error_rate, &old_config.priority_weight_error_rate);
    let priority_weight_overdue_time =
        merge_optional(input.priority_weight_overdue_time, &old_config.priority_weight_overdue_time);
    let priority_weight_word_score =
        merge_optional(input.priority_weight_word_score, &old_config.priority_weight_word_score);
    let score_weight_accuracy = merge_optional(input.score_weight_accuracy, &old_config.score_weight_accuracy);
    let score_weight_speed = merge_optional(input.score_weight_speed, &old_config.score_weight_speed);
    let score_weight_stability =
        merge_optional(input.score_weight_stability, &old_config.score_weight_stability);
    let score_weight_proficiency =
        merge_optional(input.score_weight_proficiency, &old_config.score_weight_proficiency);
    let speed_threshold_excellent =
        merge_optional(input.speed_threshold_excellent, &old_config.speed_threshold_excellent);
    let speed_threshold_good = merge_optional(input.speed_threshold_good, &old_config.speed_threshold_good);
    let speed_threshold_average =
        merge_optional(input.speed_threshold_average, &old_config.speed_threshold_average);
    let speed_threshold_slow = merge_optional(input.speed_threshold_slow, &old_config.speed_threshold_slow);
    let new_word_ratio_default = merge_optional(input.new_word_ratio_default, &old_config.new_word_ratio_default);
    let new_word_ratio_high_accuracy =
        merge_optional(input.new_word_ratio_high_accuracy, &old_config.new_word_ratio_high_accuracy);
    let new_word_ratio_low_accuracy =
        merge_optional(input.new_word_ratio_low_accuracy, &old_config.new_word_ratio_low_accuracy);
    let new_word_ratio_high_accuracy_threshold = merge_optional(
        input.new_word_ratio_high_accuracy_threshold,
        &old_config.new_word_ratio_high_accuracy_threshold,
    );
    let new_word_ratio_low_accuracy_threshold = merge_optional(
        input.new_word_ratio_low_accuracy_threshold,
        &old_config.new_word_ratio_low_accuracy_threshold,
    );
    let mastery_thresholds = merge_optional(input.mastery_thresholds, &old_config.mastery_thresholds);
    let updated_at = Utc::now().naive_utc();

    let sql = format!(
        r#"
        UPDATE "algorithm_configs"
        SET
            "name" = $1,
            "description" = $2,
            "reviewIntervals" = $3,
            "consecutiveCorrectThreshold" = $4,
            "consecutiveWrongThreshold" = $5,
            "difficultyAdjustmentInterval" = $6,
            "priorityWeightNewWord" = $7,
            "priorityWeightErrorRate" = $8,
            "priorityWeightOverdueTime" = $9,
            "priorityWeightWordScore" = $10,
            "scoreWeightAccuracy" = $11,
            "scoreWeightSpeed" = $12,
            "scoreWeightStability" = $13,
            "scoreWeightProficiency" = $14,
            "speedThresholdExcellent" = $15,
            "speedThresholdGood" = $16,
            "speedThresholdAverage" = $17,
            "speedThresholdSlow" = $18,
            "newWordRatioDefault" = $19,
            "newWordRatioHighAccuracy" = $20,
            "newWordRatioLowAccuracy" = $21,
            "newWordRatioHighAccuracyThreshold" = $22,
            "newWordRatioLowAccuracyThreshold" = $23,
            "masteryThresholds" = $24,
            "updatedAt" = $25
        WHERE "id" = $26
        RETURNING {}
        "#,
        config_select_sql()
    );

    let row = sqlx::query(&sql)
        .bind(name)
        .bind(description)
        .bind(review_intervals)
        .bind(consecutive_correct_threshold)
        .bind(consecutive_wrong_threshold)
        .bind(difficulty_adjustment_interval)
        .bind(priority_weight_new_word)
        .bind(priority_weight_error_rate)
        .bind(priority_weight_overdue_time)
        .bind(priority_weight_word_score)
        .bind(score_weight_accuracy)
        .bind(score_weight_speed)
        .bind(score_weight_stability)
        .bind(score_weight_proficiency)
        .bind(speed_threshold_excellent)
        .bind(speed_threshold_good)
        .bind(speed_threshold_average)
        .bind(speed_threshold_slow)
        .bind(new_word_ratio_default)
        .bind(new_word_ratio_high_accuracy)
        .bind(new_word_ratio_low_accuracy)
        .bind(new_word_ratio_high_accuracy_threshold)
        .bind(new_word_ratio_low_accuracy_threshold)
        .bind(mastery_thresholds)
        .bind(updated_at)
        .bind(config_id)
        .fetch_one(pool)
        .await?;
    Ok(map_postgres_config_row(&row))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AlgorithmConfigUpdateInput {
    name: Option<String>,
    description: Option<Option<String>>,
    review_intervals: Option<Vec<i32>>,
    consecutive_correct_threshold: Option<i32>,
    consecutive_wrong_threshold: Option<i32>,
    difficulty_adjustment_interval: Option<i32>,
    priority_weight_new_word: Option<i32>,
    priority_weight_error_rate: Option<i32>,
    priority_weight_overdue_time: Option<i32>,
    priority_weight_word_score: Option<i32>,
    score_weight_accuracy: Option<i32>,
    score_weight_speed: Option<i32>,
    score_weight_stability: Option<i32>,
    score_weight_proficiency: Option<i32>,
    speed_threshold_excellent: Option<i32>,
    speed_threshold_good: Option<i32>,
    speed_threshold_average: Option<i32>,
    speed_threshold_slow: Option<i32>,
    new_word_ratio_default: Option<f64>,
    new_word_ratio_high_accuracy: Option<f64>,
    new_word_ratio_low_accuracy: Option<f64>,
    new_word_ratio_high_accuracy_threshold: Option<f64>,
    new_word_ratio_low_accuracy_threshold: Option<f64>,
    mastery_thresholds: Option<serde_json::Value>,
    is_default: Option<bool>,
    created_by: Option<Option<String>>,
}

async fn select_active_config(
    proxy: &crate::db::DatabaseProxy,
) -> Result<Option<AlgorithmConfigDto>, sqlx::Error> {
    select_active_config_postgres(proxy.pool()).await
}

async fn select_config_by_id(
    proxy: &crate::db::DatabaseProxy,
    config_id: &str,
) -> Result<Option<AlgorithmConfigDto>, sqlx::Error> {
    let row = sqlx::query(&format!(
        r#"SELECT {} FROM "algorithm_configs" WHERE "id" = $1 LIMIT 1"#,
        config_select_sql()
    ))
    .bind(config_id)
    .fetch_optional(proxy.pool())
    .await?;
    Ok(row.map(|row| map_postgres_config_row(&row)))
}

async fn select_all_configs(
    proxy: &crate::db::DatabaseProxy,
) -> Result<Vec<AlgorithmConfigDto>, sqlx::Error> {
    let rows = sqlx::query(&format!(
        r#"SELECT {} FROM "algorithm_configs" ORDER BY "createdAt" DESC"#,
        config_select_sql()
    ))
    .fetch_all(proxy.pool())
    .await?;
    Ok(rows.iter().map(map_postgres_config_row).collect())
}

async fn select_config_history(
    proxy: &crate::db::DatabaseProxy,
    config_id: Option<&str>,
    limit: u64,
) -> Result<Vec<ConfigHistoryDto>, sqlx::Error> {
    let sql = if config_id.is_some() {
        r#"
        SELECT "id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp"
        FROM "config_history"
        WHERE "configId" = $1
        ORDER BY "timestamp" DESC
        LIMIT $2
        "#
    } else {
        r#"
        SELECT "id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp"
        FROM "config_history"
        ORDER BY "timestamp" DESC
        LIMIT $1
        "#
    };

    let rows = if let Some(config_id) = config_id {
        sqlx::query(sql)
            .bind(config_id)
            .bind(limit as i64)
            .fetch_all(proxy.pool())
            .await?
    } else {
        sqlx::query(sql).bind(limit as i64).fetch_all(proxy.pool()).await?
    };

    Ok(rows.iter().map(map_postgres_history_row).collect())
}

async fn select_active_config_postgres(pool: &sqlx::PgPool) -> Result<Option<AlgorithmConfigDto>, sqlx::Error> {
    let sql_default = format!(
        r#"SELECT {} FROM "algorithm_configs" WHERE "isDefault" = true ORDER BY "createdAt" ASC LIMIT 1"#,
        config_select_sql()
    );
    let row = sqlx::query(&sql_default).fetch_optional(pool).await?;
    if let Some(row) = row {
        return Ok(Some(map_postgres_config_row(&row)));
    }

    let sql_first = format!(
        r#"SELECT {} FROM "algorithm_configs" ORDER BY "createdAt" ASC LIMIT 1"#,
        config_select_sql()
    );
    let row = sqlx::query(&sql_first).fetch_optional(pool).await?;
    Ok(row.map(|row| map_postgres_config_row(&row)))
}

fn config_select_sql() -> &'static str {
    r#"
      "id",
      "name",
      "description",
      "reviewIntervals",
      "consecutiveCorrectThreshold",
      "consecutiveWrongThreshold",
      "difficultyAdjustmentInterval",
      "priorityWeightNewWord",
      "priorityWeightErrorRate",
      "priorityWeightOverdueTime",
      "priorityWeightWordScore",
      "scoreWeightAccuracy",
      "scoreWeightSpeed",
      "scoreWeightStability",
      "scoreWeightProficiency",
      "speedThresholdExcellent",
      "speedThresholdGood",
      "speedThresholdAverage",
      "speedThresholdSlow",
      "newWordRatioDefault",
      "newWordRatioHighAccuracy",
      "newWordRatioLowAccuracy",
      "newWordRatioHighAccuracyThreshold",
      "newWordRatioLowAccuracyThreshold",
      "masteryThresholds",
      "isDefault",
      "createdAt",
      "updatedAt",
      "createdBy"
    "#
}

fn map_postgres_config_row(row: &sqlx::postgres::PgRow) -> AlgorithmConfigDto {
    let created_at: NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());

    AlgorithmConfigDto {
        id: row.try_get("id").unwrap_or_default(),
        name: row.try_get("name").unwrap_or_default(),
        description: row.try_get("description").ok(),
        review_intervals: row.try_get("reviewIntervals").unwrap_or_default(),
        consecutive_correct_threshold: row.try_get("consecutiveCorrectThreshold").unwrap_or(5),
        consecutive_wrong_threshold: row.try_get("consecutiveWrongThreshold").unwrap_or(3),
        difficulty_adjustment_interval: row.try_get("difficultyAdjustmentInterval").unwrap_or(1),
        priority_weight_new_word: row.try_get("priorityWeightNewWord").unwrap_or(40),
        priority_weight_error_rate: row.try_get("priorityWeightErrorRate").unwrap_or(30),
        priority_weight_overdue_time: row.try_get("priorityWeightOverdueTime").unwrap_or(20),
        priority_weight_word_score: row.try_get("priorityWeightWordScore").unwrap_or(10),
        score_weight_accuracy: row.try_get("scoreWeightAccuracy").unwrap_or(40),
        score_weight_speed: row.try_get("scoreWeightSpeed").unwrap_or(30),
        score_weight_stability: row.try_get("scoreWeightStability").unwrap_or(20),
        score_weight_proficiency: row.try_get("scoreWeightProficiency").unwrap_or(10),
        speed_threshold_excellent: row.try_get("speedThresholdExcellent").unwrap_or(3000),
        speed_threshold_good: row.try_get("speedThresholdGood").unwrap_or(5000),
        speed_threshold_average: row.try_get("speedThresholdAverage").unwrap_or(10000),
        speed_threshold_slow: row.try_get("speedThresholdSlow").unwrap_or(10000),
        new_word_ratio_default: row.try_get("newWordRatioDefault").unwrap_or(0.3),
        new_word_ratio_high_accuracy: row.try_get("newWordRatioHighAccuracy").unwrap_or(0.5),
        new_word_ratio_low_accuracy: row.try_get("newWordRatioLowAccuracy").unwrap_or(0.1),
        new_word_ratio_high_accuracy_threshold: row.try_get("newWordRatioHighAccuracyThreshold").unwrap_or(0.85),
        new_word_ratio_low_accuracy_threshold: row.try_get("newWordRatioLowAccuracyThreshold").unwrap_or(0.65),
        mastery_thresholds: row.try_get("masteryThresholds").unwrap_or(serde_json::Value::Null),
        is_default: row.try_get("isDefault").unwrap_or(false),
        created_at: format_naive_datetime_iso_millis(created_at),
        updated_at: format_naive_datetime_iso_millis(updated_at),
        created_by: row.try_get("createdBy").ok(),
    }
}

fn map_postgres_history_row(row: &sqlx::postgres::PgRow) -> ConfigHistoryDto {
    let timestamp: NaiveDateTime = row.try_get("timestamp").unwrap_or_else(|_| Utc::now().naive_utc());
    ConfigHistoryDto {
        id: row.try_get("id").unwrap_or_default(),
        config_id: row.try_get("configId").unwrap_or_default(),
        changed_by: row.try_get("changedBy").unwrap_or_default(),
        change_reason: row.try_get("changeReason").ok(),
        previous_value: row.try_get("previousValue").unwrap_or(serde_json::Value::Null),
        new_value: row.try_get("newValue").unwrap_or(serde_json::Value::Null),
        timestamp: format_naive_datetime_iso_millis(timestamp),
    }
}

fn validate_config(config: &serde_json::Map<String, serde_json::Value>) -> Vec<String> {
    let mut errors = Vec::new();

    if config.contains_key("priorityWeightNewWord") {
        let sum = read_i64(config, "priorityWeightNewWord")
            + read_i64(config, "priorityWeightErrorRate")
            + read_i64(config, "priorityWeightOverdueTime")
            + read_i64(config, "priorityWeightWordScore");
        if sum != 100 {
            errors.push("优先级权重总和必须为100%".to_string());
        }
    }

    if config.contains_key("scoreWeightAccuracy") {
        let sum = read_i64(config, "scoreWeightAccuracy")
            + read_i64(config, "scoreWeightSpeed")
            + read_i64(config, "scoreWeightStability")
            + read_i64(config, "scoreWeightProficiency");
        if sum != 100 {
            errors.push("单词得分权重总和必须为100%".to_string());
        }
    }

    if let Some(value) = config.get("consecutiveCorrectThreshold").and_then(as_i64) {
        if !(3..=10).contains(&value) {
            errors.push("连续答对阈值必须在3-10之间".to_string());
        }
    }

    if let Some(value) = config.get("consecutiveWrongThreshold").and_then(as_i64) {
        if !(2..=5).contains(&value) {
            errors.push("连续答错阈值必须在2-5之间".to_string());
        }
    }

    if let Some(value) = config.get("reviewIntervals") {
        match value {
            serde_json::Value::Array(items) if !items.is_empty() => {}
            _ => errors.push("复习间隔必须是非空数组".to_string()),
        }
    }

    errors
}

fn read_i64(config: &serde_json::Map<String, serde_json::Value>, key: &str) -> i64 {
    config.get(key).and_then(as_i64).unwrap_or(0)
}

fn as_i64(value: &serde_json::Value) -> Option<i64> {
    match value {
        serde_json::Value::Number(num) => num.as_i64().or_else(|| num.as_u64().map(|v| v as i64)),
        serde_json::Value::String(raw) => raw.parse::<i64>().ok(),
        serde_json::Value::Bool(v) => Some(if *v { 1 } else { 0 }),
        _ => None,
    }
}

fn filter_update_fields(update: &serde_json::Map<String, serde_json::Value>) -> serde_json::Map<String, serde_json::Value> {
    let mut out = update.clone();
    out.remove("id");
    out.remove("createdAt");
    out.remove("updatedAt");
    out
}

fn extract_config_id(path: &str, prefix: &str) -> Option<String> {
    let raw = path.strip_prefix(prefix)?;
    let raw = raw.trim_matches('/');
    if raw.is_empty() || raw.contains('/') {
        return None;
    }
    Some(raw.to_string())
}

fn parse_query(raw: Option<&str>) -> HashMap<String, String> {
    let Some(raw) = raw else { return HashMap::new() };
    raw.split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((k.to_string(), v.to_string()))
        })
        .collect()
}

async fn split_body(req: Request<Body>) -> Result<(axum::http::request::Parts, bytes::Bytes), Response> {
    let (parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "无效请求").into_response()),
    };
    Ok((parts, body_bytes))
}

fn format_naive_datetime_iso_millis(value: NaiveDateTime) -> String {
    chrono::DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn now_iso_millis() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
