use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::response::{json_error, AppError};
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
struct MessageResponse<T> {
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueMetricsBody {
    score: f64,
    perclos: f64,
    blink_rate: f64,
    yawn_count: i64,
    head_pitch: Option<f64>,
    head_yaw: Option<f64>,
    confidence: f64,
    timestamp: i64,
    session_id: Option<String>,
    #[serde(default)]
    eye_aspect_ratio: Option<f64>,
    #[serde(default)]
    avg_blink_duration: Option<f64>,
    #[serde(default)]
    head_roll: Option<f64>,
    #[serde(default)]
    head_stability: Option<f64>,
    #[serde(default)]
    squint_intensity: Option<f64>,
    #[serde(default)]
    expression_fatigue_score: Option<f64>,
    #[serde(default)]
    gaze_off_screen_ratio: Option<f64>,
    #[serde(default)]
    brow_down_intensity: Option<f64>,
    #[serde(default)]
    mouth_open_ratio: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsProcessedDto {
    score: f64,
    confidence: f64,
    is_valid: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsFusionDto {
    fused_fatigue: f64,
    visual_fatigue: f64,
    behavior_fatigue: f64,
    fatigue_level: String,
    recommendations: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsResponseDto {
    processed: MetricsProcessedDto,
    fusion: MetricsFusionDto,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BaselineBody {
    ear_open: f64,
    ear_closed: f64,
    ear_threshold: f64,
    mar_normal: f64,
    mar_threshold: f64,
    blink_baseline: f64,
    calibration_time: i64,
    sample_count: i64,
    is_calibrated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BaselineResponseDto {
    has_baseline: bool,
    baseline: Option<serde_json::Value>,
    baseline_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    avg_visual_fatigue: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    record_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueConfigPatch {
    enabled: Option<bool>,
    detection_fps: Option<i64>,
    upload_interval_ms: Option<i64>,
    vlm_analysis_enabled: Option<bool>,
    personal_baseline_data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualFatigueConfigDto {
    enabled: bool,
    detection_interval_ms: i64,
    report_interval_ms: i64,
    ear_threshold: f64,
    perclos_threshold: f64,
    yawn_duration_ms: i64,
    window_size_seconds: i64,
    video_width: i64,
    video_height: i64,
    vlm_analysis_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    personal_baseline: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FusionDto {
    fused_fatigue: f64,
    visual_fatigue: f64,
    behavior_fatigue: f64,
    temporal_fatigue: f64,
    fatigue_level: String,
    has_conflict: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    conflict_description: Option<String>,
    recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FusionVisualDto {
    score: f64,
    perclos: f64,
    blink_rate: f64,
    confidence: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FusionResponseDto {
    has_data: bool,
    fusion: Option<FusionDto>,
    visual: Option<FusionVisualDto>,
    trend: f64,
}

const DEFAULT_EAR_THRESHOLD: f64 = 0.2;
const DEFAULT_PERCLOS_THRESHOLD: f64 = 0.15;
const DEFAULT_YAWN_DURATION_MS: i64 = 2000;
const DEFAULT_WINDOW_SIZE_SECONDS: i64 = 60;
const DEFAULT_VIDEO_WIDTH: i64 = 640;
const DEFAULT_VIDEO_HEIGHT: i64 = 480;

fn default_config() -> VisualFatigueConfigDto {
    VisualFatigueConfigDto {
        enabled: false,
        detection_interval_ms: 100, // 10 FPS (WASM优化后提升)
        report_interval_ms: 5000,
        ear_threshold: DEFAULT_EAR_THRESHOLD,
        perclos_threshold: DEFAULT_PERCLOS_THRESHOLD,
        yawn_duration_ms: DEFAULT_YAWN_DURATION_MS,
        window_size_seconds: DEFAULT_WINDOW_SIZE_SECONDS,
        video_width: DEFAULT_VIDEO_WIDTH,
        video_height: DEFAULT_VIDEO_HEIGHT,
        vlm_analysis_enabled: false,
        personal_baseline: None,
    }
}

#[derive(Clone)]
struct VisualUserState {
    last_update_ms: i64,
    latest_visual: Option<FusionVisualDto>,
    latest_fusion: Option<FusionDto>,
    history: Vec<f64>,
}

#[derive(Default)]
struct VisualFatigueStore {
    users: RwLock<HashMap<String, VisualUserState>>,
}

static VISUAL_STORE: OnceLock<Arc<VisualFatigueStore>> = OnceLock::new();

fn store() -> Arc<VisualFatigueStore> {
    VISUAL_STORE
        .get_or_init(|| Arc::new(VisualFatigueStore::default()))
        .clone()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/metrics", post(report_metrics))
        .route("/baseline", get(get_baseline).post(update_baseline))
        .route("/config", get(get_config).put(update_config))
        .route("/fusion", get(get_fusion))
        .route("/reset", post(reset_user))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<crate::db::DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state
        .db_proxy()
        .ok_or_else(|| json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用"))?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录"))?;

    Ok((proxy, user))
}

fn validate_metrics(payload: &VisualFatigueMetricsBody) -> Result<(), AppError> {
    let in_unit = |v: f64| v.is_finite() && (0.0..=1.0).contains(&v);
    if !in_unit(payload.score) {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "score 必须在 0-1 之间"));
    }
    if !in_unit(payload.perclos) {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "perclos 必须在 0-1 之间"));
    }
    if !payload.blink_rate.is_finite() || payload.blink_rate < 0.0 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "blinkRate 必须是非负数字"));
    }
    if payload.yawn_count < 0 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "yawnCount 必须是非负整数"));
    }
    if !in_unit(payload.confidence) {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "confidence 必须在 0-1 之间"));
    }
    if payload.timestamp <= 0 {
        return Err(json_error(StatusCode::BAD_REQUEST, "BAD_REQUEST", "timestamp 必须是正整数"));
    }
    Ok(())
}

fn compute_temporal_fatigue(duration_minutes: f64) -> f64 {
    let k = 0.05;
    let threshold = 30.0;
    let effective = (duration_minutes - threshold).max(0.0);
    1.0 - (-k * effective).exp()
}

fn determine_fatigue_level(fatigue: f64) -> String {
    if fatigue < 0.25 {
        "alert".to_string()
    } else if fatigue < 0.5 {
        "mild".to_string()
    } else if fatigue < 0.75 {
        "moderate".to_string()
    } else {
        "severe".to_string()
    }
}

fn detect_conflict(behavior_fatigue: f64, visual_fatigue: f64) -> (bool, Option<String>) {
    let diff = (behavior_fatigue - visual_fatigue).abs();
    if diff <= 0.4 {
        return (false, None);
    }
    let description = if behavior_fatigue > visual_fatigue {
        "行为指标显示疲劳，但视觉指标正常（可能是专注状态）"
    } else {
        "视觉指标显示疲劳，但行为表现正常（可能是生理疲劳）"
    };
    (true, Some(description.to_string()))
}

fn generate_recommendations(fused: f64, visual: f64, behavior: f64, duration_minutes: f64) -> Vec<String> {
    let mut recommendations = Vec::new();
    if fused > 0.8 {
        recommendations.push("建议立即休息 15-20 分钟".to_string());
        recommendations.push("可以做一些眼保健操".to_string());
    } else if fused > 0.6 {
        recommendations.push("建议休息 5-10 分钟".to_string());
        recommendations.push("可以远眺放松眼睛".to_string());
    } else if fused > 0.4 {
        recommendations.push("可以继续学习，但注意适当休息".to_string());
    }
    if visual > 0.5 && visual > behavior + 0.2 {
        recommendations.push("眼睛疲劳明显，建议闭眼休息".to_string());
    }
    if duration_minutes > 45.0 {
        recommendations.push("已连续学习较长时间，建议站起来活动一下".to_string());
    }
    if behavior > 0.5 && behavior > visual + 0.2 {
        recommendations.push("注意力下降，可以换一种学习方式".to_string());
    }
    recommendations
}

async fn select_behavior_fatigue(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<f64, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "fatigue" as "fatigue" FROM "amas_user_states" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    Ok(row.and_then(|r| r.try_get::<f64, _>("fatigue").ok()).unwrap_or(0.1))
}

async fn select_study_duration_minutes(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<f64, AppError> {
    let pool = proxy.pool();
    let now = Utc::now();
    let boundary = (now - Duration::minutes(30)).naive_utc();

    let row = sqlx::query(
        r#"
        SELECT "startedAt" as "startedAt", "endedAt" as "endedAt"
        FROM "learning_sessions"
        WHERE "userId" = $1 AND ("endedAt" IS NULL OR "endedAt" >= $2)
        ORDER BY "startedAt" DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(boundary)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let Some(row) = row else { return Ok(0.0) };
    let started_at: chrono::NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| now.naive_utc());
    let ended_at: Option<chrono::NaiveDateTime> = row.try_get("endedAt").ok();
    let start_ms = chrono::DateTime::<Utc>::from_naive_utc_and_offset(started_at, Utc).timestamp_millis();
    let end_ms = ended_at
        .map(|dt| chrono::DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis())
        .unwrap_or_else(|| now.timestamp_millis());
    Ok(((end_ms - start_ms).max(0) as f64) / 60000.0)
}

async fn insert_visual_fatigue_record(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    payload: &VisualFatigueMetricsBody,
    fused_score: f64,
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"
        INSERT INTO "visual_fatigue_records" (
            "id",
            "userId",
            "score",
            "fusedScore",
            "perclos",
            "blinkRate",
            "yawnCount",
            "headPitch",
            "headYaw",
            "confidence",
            "createdAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(payload.score)
    .bind(fused_score)
    .bind(payload.perclos)
    .bind(payload.blink_rate)
    .bind(payload.yawn_count)
    .bind(payload.head_pitch)
    .bind(payload.head_yaw)
    .bind(payload.confidence)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}

async fn report_metrics(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<VisualFatigueMetricsBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    validate_metrics(&payload)?;

    let is_valid = payload.confidence >= 0.2;
    let visual_fatigue = if is_valid { payload.score } else { 0.0 };

    let behavior_fatigue = select_behavior_fatigue(proxy.as_ref(), &user.id).await?;
    let study_duration_minutes = select_study_duration_minutes(proxy.as_ref(), &user.id).await?;
    let temporal_fatigue = compute_temporal_fatigue(study_duration_minutes);

    let (mut visual_weight, mut behavior_weight, temporal_weight) = (0.4, 0.4, 0.2);
    if payload.confidence < 0.2 {
        visual_weight = 0.0;
        behavior_weight += 0.4;
    }

    let fused_fatigue = behavior_weight * behavior_fatigue + visual_weight * visual_fatigue + temporal_weight * temporal_fatigue;
    let fatigue_level = determine_fatigue_level(fused_fatigue);
    let recommendations = generate_recommendations(fused_fatigue, visual_fatigue, behavior_fatigue, study_duration_minutes);
    let (has_conflict, conflict_description) = detect_conflict(behavior_fatigue, visual_fatigue);

    let fusion = FusionDto {
        fused_fatigue,
        visual_fatigue,
        behavior_fatigue,
        temporal_fatigue,
        fatigue_level: fatigue_level.clone(),
        has_conflict,
        conflict_description,
        recommendations: recommendations.clone(),
    };

    let visual = FusionVisualDto {
        score: payload.score,
        perclos: payload.perclos,
        blink_rate: payload.blink_rate,
        confidence: payload.confidence,
    };

    {
        let store = store();
        let mut guard = store.users.write().await;
        let entry = guard.entry(user.id.clone()).or_insert_with(|| VisualUserState {
            last_update_ms: payload.timestamp,
            latest_visual: None,
            latest_fusion: None,
            history: Vec::new(),
        });
        entry.last_update_ms = payload.timestamp;
        entry.latest_visual = Some(visual.clone());
        entry.latest_fusion = Some(fusion.clone());
        entry.history.push(fused_fatigue);
        if entry.history.len() > 100 {
            let excess = entry.history.len() - 100;
            entry.history.drain(0..excess);
        }
    }

    insert_visual_fatigue_record(proxy.as_ref(), &user.id, &payload, fused_fatigue).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: MetricsResponseDto {
            processed: MetricsProcessedDto {
                score: payload.score,
                confidence: payload.confidence,
                is_valid,
            },
            fusion: MetricsFusionDto {
                fused_fatigue,
                visual_fatigue,
                behavior_fatigue,
                fatigue_level,
                recommendations,
            },
        },
    }))
}

async fn upsert_user_config(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    enabled: bool,
    detection_fps: i64,
    upload_interval_ms: i64,
    vlm_analysis_enabled: bool,
    personal_baseline_data: Option<serde_json::Value>,
) -> Result<(), AppError> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO "user_visual_fatigue_configs" (
            "id",
            "userId",
            "enabled",
            "detectionFps",
            "uploadIntervalMs",
            "vlmAnalysisEnabled",
            "personalBaselineData",
            "updatedAt"
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("userId") DO UPDATE SET
            "enabled" = EXCLUDED."enabled",
            "detectionFps" = EXCLUDED."detectionFps",
            "uploadIntervalMs" = EXCLUDED."uploadIntervalMs",
            "vlmAnalysisEnabled" = EXCLUDED."vlmAnalysisEnabled",
            "personalBaselineData" = EXCLUDED."personalBaselineData",
            "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(enabled)
    .bind(detection_fps)
    .bind(upload_interval_ms)
    .bind(vlm_analysis_enabled)
    .bind(personal_baseline_data)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库写入失败"))?;

    Ok(())
}

async fn fetch_user_config(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<(bool, i64, i64, bool, Option<serde_json::Value>)>, AppError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT
            "enabled" as "enabled",
            "detectionFps" as "detectionFps",
            "uploadIntervalMs" as "uploadIntervalMs",
            "vlmAnalysisEnabled" as "vlmAnalysisEnabled",
            "personalBaselineData" as "personalBaselineData"
        FROM "user_visual_fatigue_configs"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let Some(row) = row else { return Ok(None) };
    let enabled: bool = row.try_get("enabled").unwrap_or(false);
    let detection_fps: i64 = row.try_get("detectionFps").unwrap_or(5);
    let upload_interval_ms: i64 = row.try_get("uploadIntervalMs").unwrap_or(5000);
    let vlm_analysis_enabled: bool = row.try_get("vlmAnalysisEnabled").unwrap_or(false);
    let baseline: Option<serde_json::Value> = row.try_get("personalBaselineData").ok();
    Ok(Some((enabled, detection_fps, upload_interval_ms, vlm_analysis_enabled, baseline)))
}

async fn get_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let base = default_config();

    let cfg = fetch_user_config(proxy.as_ref(), &user.id).await?;
    let data = if let Some((enabled, detection_fps, upload_interval_ms, vlm_analysis_enabled, baseline)) = cfg {
        VisualFatigueConfigDto {
            enabled,
            detection_interval_ms: (1000.0 / (detection_fps.max(1) as f64)).round() as i64,
            report_interval_ms: upload_interval_ms,
            ear_threshold: base.ear_threshold,
            perclos_threshold: base.perclos_threshold,
            yawn_duration_ms: base.yawn_duration_ms,
            window_size_seconds: base.window_size_seconds,
            video_width: base.video_width,
            video_height: base.video_height,
            vlm_analysis_enabled,
            personal_baseline: baseline,
        }
    } else {
        base
    };

    Ok(Json(SuccessResponse { success: true, data }))
}

async fn update_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(patch): Json<VisualFatigueConfigPatch>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let existing = fetch_user_config(proxy.as_ref(), &user.id).await?;
    let (mut enabled, mut detection_fps, mut upload_interval_ms, mut vlm, mut baseline) = existing.unwrap_or((false, 5, 5000, false, None));

    if let Some(value) = patch.enabled {
        enabled = value;
    }
    if let Some(value) = patch.detection_fps {
        detection_fps = value.max(1).min(30);
    }
    if let Some(value) = patch.upload_interval_ms {
        upload_interval_ms = value.max(1000).min(60_000);
    }
    if let Some(value) = patch.vlm_analysis_enabled {
        vlm = value;
    }
    if let Some(value) = patch.personal_baseline_data {
        baseline = Some(value);
    }

    upsert_user_config(
        proxy.as_ref(),
        &user.id,
        enabled,
        detection_fps,
        upload_interval_ms,
        vlm,
        baseline.clone(),
    )
    .await?;

    Ok(Json(MessageResponse {
        success: true,
        message: "配置已更新".to_string(),
        data: Some(serde_json::json!({
            "enabled": enabled,
            "detectionFps": detection_fps,
            "uploadIntervalMs": upload_interval_ms,
            "vlmAnalysisEnabled": vlm,
        })),
    }))
}

async fn get_baseline(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let cfg = fetch_user_config(proxy.as_ref(), &user.id).await?;
    let baseline = cfg.and_then(|(_, _, _, _, b)| b);

    let (avg, count) = fetch_visual_fatigue_aggregate(proxy.as_ref(), &user.id).await?;

    if baseline.is_none() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: BaselineResponseDto {
                has_baseline: false,
                baseline: None,
                baseline_type: "default".to_string(),
                avg_visual_fatigue: None,
                record_count: None,
            },
        }));
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: BaselineResponseDto {
            has_baseline: true,
            baseline,
            baseline_type: "personal".to_string(),
            avg_visual_fatigue: Some(avg),
            record_count: Some(count),
        },
    }))
}

async fn update_baseline(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BaselineBody>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let baseline = serde_json::to_value(payload).unwrap_or(serde_json::Value::Null);
    let existing = fetch_user_config(proxy.as_ref(), &user.id).await?;
    let (enabled, detection_fps, upload_interval_ms, vlm, _old_baseline) = existing.unwrap_or((false, 5, 5000, false, None));

    upsert_user_config(
        proxy.as_ref(),
        &user.id,
        enabled,
        detection_fps,
        upload_interval_ms,
        vlm,
        Some(baseline.clone()),
    )
    .await?;

    Ok(Json(MessageResponse::<serde_json::Value> {
        success: true,
        message: "基线已更新".to_string(),
        data: Some(serde_json::json!({ "baseline": baseline })),
    }))
}

async fn fetch_visual_fatigue_aggregate(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<(f64, i64), AppError> {
    let pool = proxy.pool();

    let row = sqlx::query(
        r#"
        SELECT AVG("score") as "avgScore", COUNT(*) as "count"
        FROM "visual_fatigue_records"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "DB_ERROR", "数据库查询失败"))?;

    let avg: Option<f64> = row.try_get("avgScore").ok();
    let count: i64 = row.try_get("count").unwrap_or(0);
    Ok((avg.unwrap_or(0.0), count))
}

async fn get_fusion(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_user(&state, &headers).await?;
    let now_ms = Utc::now().timestamp_millis();

    let store = store();
    let guard = store.users.read().await;
    let entry = guard.get(&user.id);

    let (has_data, fusion, visual, trend) = if let Some(entry) = entry {
        let age_ms = now_ms - entry.last_update_ms;
        let fresh = age_ms <= 30_000;
        let fusion = if fresh { entry.latest_fusion.clone() } else { None };
        let visual = if fresh { entry.latest_visual.clone() } else { None };

        let trend = if entry.history.len() < 10 {
            0.0
        } else {
            let recent = &entry.history[entry.history.len().saturating_sub(5)..];
            let earlier = &entry.history[entry.history.len().saturating_sub(10)..entry.history.len().saturating_sub(5)];
            let recent_avg = recent.iter().sum::<f64>() / (recent.len() as f64);
            let earlier_avg = earlier.iter().sum::<f64>() / (earlier.len() as f64);
            recent_avg - earlier_avg
        };

        (fusion.is_some(), fusion, visual, trend)
    } else {
        (false, None, None, 0.0)
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: FusionResponseDto {
            has_data,
            fusion,
            visual,
            trend,
        },
    }))
}

async fn reset_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (_proxy, user) = require_user(&state, &headers).await?;
    let store = store();
    let mut guard = store.users.write().await;
    guard.remove(&user.id);

    Ok(Json(MessageResponse::<serde_json::Value> {
        success: true,
        message: "视觉疲劳数据已重置".to_string(),
        data: None,
    }))
}
