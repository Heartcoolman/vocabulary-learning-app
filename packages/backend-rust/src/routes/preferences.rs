use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use chrono::{Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::middleware::RequestDbState;
use crate::response::json_error;
use crate::state::AppState;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreferencesResponse {
    learning: LearningPreferences,
    notification: NotificationPreferences,
    ui: UiPreferences,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningPreferences {
    preferred_study_time_start: Option<String>,
    preferred_study_time_end: Option<String>,
    preferred_difficulty: Option<String>,
    daily_goal_enabled: bool,
    daily_goal_words: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPreferences {
    enable_forgetting_alerts: bool,
    enable_achievements: bool,
    enable_reminders: bool,
    enable_system_notif: bool,
    reminder_frequency: String,
    quiet_hours_start: Option<String>,
    quiet_hours_end: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiPreferences {
    theme: String,
    language: String,
    sound_enabled: bool,
    animation_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuietHoursCheckData {
    is_quiet_time: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePreferencesDto {
    learning: Option<LearningPreferencesPatch>,
    notification: Option<NotificationPreferencesPatch>,
    ui: Option<UiPreferencesPatch>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LearningPreferencesPatch {
    preferred_study_time_start: Option<Option<String>>,
    preferred_study_time_end: Option<Option<String>>,
    preferred_difficulty: Option<Option<String>>,
    daily_goal_enabled: Option<bool>,
    daily_goal_words: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPreferencesPatch {
    enable_forgetting_alerts: Option<bool>,
    enable_achievements: Option<bool>,
    enable_reminders: Option<bool>,
    enable_system_notif: Option<bool>,
    reminder_frequency: Option<String>,
    quiet_hours_start: Option<Option<String>>,
    quiet_hours_end: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiPreferencesPatch {
    theme: Option<String>,
    language: Option<String>,
    sound_enabled: Option<bool>,
    animation_enabled: Option<bool>,
}

#[derive(Debug, Clone)]
struct PreferencesRow {
    preferred_study_time_start: Option<String>,
    preferred_study_time_end: Option<String>,
    preferred_difficulty: Option<String>,
    daily_goal_enabled: bool,
    daily_goal_words: i64,
    enable_forgetting_alerts: bool,
    enable_achievements: bool,
    enable_reminders: bool,
    enable_system_notif: bool,
    reminder_frequency: String,
    quiet_hours_start: Option<String>,
    quiet_hours_end: Option<String>,
    theme: String,
    language: String,
    sound_enabled: bool,
    animation_enabled: bool,
    updated_at: String,
}

impl PreferencesRow {
    fn to_grouped(&self) -> PreferencesResponse {
        PreferencesResponse {
            learning: LearningPreferences {
                preferred_study_time_start: self.preferred_study_time_start.clone(),
                preferred_study_time_end: self.preferred_study_time_end.clone(),
                preferred_difficulty: self.preferred_difficulty.clone(),
                daily_goal_enabled: self.daily_goal_enabled,
                daily_goal_words: self.daily_goal_words,
            },
            notification: NotificationPreferences {
                enable_forgetting_alerts: self.enable_forgetting_alerts,
                enable_achievements: self.enable_achievements,
                enable_reminders: self.enable_reminders,
                enable_system_notif: self.enable_system_notif,
                reminder_frequency: self.reminder_frequency.clone(),
                quiet_hours_start: self.quiet_hours_start.clone(),
                quiet_hours_end: self.quiet_hours_end.clone(),
            },
            ui: UiPreferences {
                theme: self.theme.clone(),
                language: self.language.clone(),
                sound_enabled: self.sound_enabled,
                animation_enabled: self.animation_enabled,
            },
            updated_at: self.updated_at.clone(),
        }
    }

    fn learning(&self) -> LearningPreferences {
        self.to_grouped().learning
    }

    fn notification(&self) -> NotificationPreferences {
        self.to_grouped().notification
    }

    fn ui(&self) -> UiPreferences {
        self.to_grouped().ui
    }
}

pub async fn get_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = ensure_preferences_exist(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "ensure preferences row failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let row = match select_preferences_row(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "select preferences failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: row.to_grouped(),
        message: None,
    })
    .into_response()
}

pub async fn update_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_preferences_inner(state, req, UpdateMode::All).await
}

pub async fn learning_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    get_preferences_part(state, req, PreferencesPart::Learning).await
}

pub async fn update_learning_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_preferences_inner(state, req, UpdateMode::LearningOnly).await
}

pub async fn notification_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    get_preferences_part(state, req, PreferencesPart::Notification).await
}

pub async fn update_notification_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_preferences_inner(state, req, UpdateMode::NotificationOnly).await
}

pub async fn ui_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    get_preferences_part(state, req, PreferencesPart::Ui).await
}

pub async fn update_ui_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    update_preferences_inner(state, req, UpdateMode::UiOnly).await
}

pub async fn reset_preferences(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let (parts, _body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = upsert_default_preferences(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "reset preferences failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let row = match select_preferences_row(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(row)) => row,
        _ => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    Json(SuccessResponse {
        success: true,
        data: row.to_grouped(),
        message: Some("偏好设置已重置为默认值".to_string()),
    })
    .into_response()
}

pub async fn quiet_hours_check(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = ensure_preferences_exist(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "ensure preferences row failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let row = match select_preferences_row(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(row)) => row,
        _ => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let is_quiet_time = is_in_quiet_hours(row.quiet_hours_start.as_deref(), row.quiet_hours_end.as_deref());

    Json(SuccessResponse {
        success: true,
        data: QuietHoursCheckData { is_quiet_time },
        message: None,
    })
    .into_response()
}

#[derive(Clone, Copy)]
enum PreferencesPart {
    Learning,
    Notification,
    Ui,
}

async fn get_preferences_part(state: AppState, req: Request<Body>, part: PreferencesPart) -> Response {
    let token = crate::auth::extract_token(req.headers());
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let request_state = req
        .extensions()
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = ensure_preferences_exist(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "ensure preferences row failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let row = match select_preferences_row(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
        Err(err) => {
            tracing::warn!(error = %err, "select preferences failed");
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    match part {
        PreferencesPart::Learning => Json(SuccessResponse { success: true, data: row.learning(), message: None }).into_response(),
        PreferencesPart::Notification => Json(SuccessResponse { success: true, data: row.notification(), message: None }).into_response(),
        PreferencesPart::Ui => Json(SuccessResponse { success: true, data: row.ui(), message: None }).into_response(),
    }
}

enum UpdateMode {
    All,
    LearningOnly,
    NotificationOnly,
    UiOnly,
}

async fn update_preferences_inner(state: AppState, req: Request<Body>, mode: UpdateMode) -> Response {
    let (parts, _body_bytes) = match split_body(req).await {
        Ok(value) => value,
        Err(res) => return res,
    };

    let token = crate::auth::extract_token(&parts.headers);
    let Some(token) = token else {
        return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌").into_response();
    };

    let payload: serde_json::Value = match serde_json::from_slice(&_body_bytes) {
        Ok(value) => value,
        Err(_) => {
            return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
        }
    };

    let request_state = parts
        .extensions
        .get::<RequestDbState>()
        .map(|value| value.0)
        .unwrap_or(crate::db::state_machine::DatabaseState::Normal);

    let Some(proxy) = state.db_proxy() else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务不可用").into_response();
    };

    let auth_user =
        match crate::auth::verify_request_token(proxy.as_ref(), request_state, &token).await {
            Ok(user) => user,
            Err(_) => {
                return json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "认证失败，请重新登录")
                    .into_response();
            }
        };

    let now_iso = now_iso_millis();
    if let Err(err) = ensure_preferences_exist(proxy.as_ref(), request_state, &auth_user.id, &now_iso).await {
        tracing::warn!(error = %err, "ensure preferences row failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let current = match select_preferences_row(proxy.as_ref(), request_state, &auth_user.id).await {
        Ok(Some(row)) => row,
        _ => {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
        }
    };

    let mut updated = current.clone();
    updated.updated_at = now_iso.clone();

    match mode {
        UpdateMode::All => {
            let dto: UpdatePreferencesDto = match serde_json::from_value(payload) {
                Ok(value) => value,
                Err(_) => {
                    return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
                }
            };
            if let Some(patch) = dto.learning {
                apply_learning_patch(&mut updated, patch);
            }
            if let Some(patch) = dto.notification {
                apply_notification_patch(&mut updated, patch);
            }
            if let Some(patch) = dto.ui {
                apply_ui_patch(&mut updated, patch);
            }
        }
        UpdateMode::LearningOnly => {
            let patch: LearningPreferencesPatch = match serde_json::from_value(payload) {
                Ok(value) => value,
                Err(_) => {
                    return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
                }
            };
            apply_learning_patch(&mut updated, patch);
        }
        UpdateMode::NotificationOnly => {
            let patch: NotificationPreferencesPatch = match serde_json::from_value(payload) {
                Ok(value) => value,
                Err(_) => {
                    return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
                }
            };
            apply_notification_patch(&mut updated, patch);
        }
        UpdateMode::UiOnly => {
            let patch: UiPreferencesPatch = match serde_json::from_value(payload) {
                Ok(value) => value,
                Err(_) => {
                    return json_error(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "请求参数不合法").into_response();
                }
            };
            apply_ui_patch(&mut updated, patch);
        }
    };

    if let Err(err) = persist_preferences_row(proxy.as_ref(), request_state, &auth_user.id, &updated, &now_iso).await {
        tracing::warn!(error = %err, "preferences update failed");
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务器内部错误").into_response();
    }

    let (data, message) = match mode {
        UpdateMode::All => (serde_json::to_value(updated.to_grouped()).unwrap_or(serde_json::Value::Null), Some("偏好设置已更新".to_string())),
        UpdateMode::LearningOnly => (serde_json::to_value(updated.learning()).unwrap_or(serde_json::Value::Null), Some("学习偏好已更新".to_string())),
        UpdateMode::NotificationOnly => (serde_json::to_value(updated.notification()).unwrap_or(serde_json::Value::Null), Some("通知偏好已更新".to_string())),
        UpdateMode::UiOnly => (serde_json::to_value(updated.ui()).unwrap_or(serde_json::Value::Null), Some("界面偏好已更新".to_string())),
    };

    Json(SuccessResponse {
        success: true,
        data,
        message,
    })
    .into_response()
}

fn apply_learning_patch(target: &mut PreferencesRow, patch: LearningPreferencesPatch) {
    if let Some(value) = patch.preferred_study_time_start {
        target.preferred_study_time_start = value;
    }
    if let Some(value) = patch.preferred_study_time_end {
        target.preferred_study_time_end = value;
    }
    if let Some(value) = patch.preferred_difficulty {
        target.preferred_difficulty = value;
    }
    if let Some(value) = patch.daily_goal_enabled {
        target.daily_goal_enabled = value;
    }
    if let Some(value) = patch.daily_goal_words {
        target.daily_goal_words = value;
    }
}

fn apply_notification_patch(target: &mut PreferencesRow, patch: NotificationPreferencesPatch) {
    if let Some(value) = patch.enable_forgetting_alerts {
        target.enable_forgetting_alerts = value;
    }
    if let Some(value) = patch.enable_achievements {
        target.enable_achievements = value;
    }
    if let Some(value) = patch.enable_reminders {
        target.enable_reminders = value;
    }
    if let Some(value) = patch.enable_system_notif {
        target.enable_system_notif = value;
    }
    if let Some(value) = patch.reminder_frequency {
        target.reminder_frequency = value;
    }
    if let Some(value) = patch.quiet_hours_start {
        target.quiet_hours_start = value;
    }
    if let Some(value) = patch.quiet_hours_end {
        target.quiet_hours_end = value;
    }
}

fn apply_ui_patch(target: &mut PreferencesRow, patch: UiPreferencesPatch) {
    if let Some(value) = patch.theme {
        target.theme = value;
    }
    if let Some(value) = patch.language {
        target.language = value;
    }
    if let Some(value) = patch.sound_enabled {
        target.sound_enabled = value;
    }
    if let Some(value) = patch.animation_enabled {
        target.animation_enabled = value;
    }
}

async fn ensure_preferences_exist(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    now_iso: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );

        let mut create = serde_json::Map::new();
        create.insert("id".to_string(), serde_json::Value::String(Uuid::new_v4().to_string()));
        create.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );
        create.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now_iso.to_string()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "user_preferences".to_string(),
            r#where: where_clause,
            create,
            update: serde_json::Map::new(),
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };

        proxy
            .write_operation(state, op)
            .await
            .map(|_| ())
            .map_err(|err| err.to_string())
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        sqlx::query(
            r#"
            INSERT INTO "user_preferences" ("id", "userId", "updatedAt")
            VALUES ($1, $2, $3)
            ON CONFLICT ("userId") DO NOTHING
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(user_id)
        .bind(now)
        .execute(&primary)
        .await
        .map(|_| ())
        .map_err(|err| err.to_string())
    }
}

async fn upsert_default_preferences(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    now_iso: &str,
) -> Result<(), String> {
    let defaults = DefaultPreferences::new();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );

        let mut create = serde_json::Map::new();
        create.insert("id".to_string(), serde_json::Value::String(Uuid::new_v4().to_string()));
        create.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );
        defaults.populate_map(&mut create);
        create.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now_iso.to_string()),
        );

        let mut update = serde_json::Map::new();
        defaults.populate_map(&mut update);
        update.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now_iso.to_string()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Upsert {
            table: "user_preferences".to_string(),
            r#where: where_clause,
            create,
            update,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map(|_| ())
            .map_err(|err| err.to_string())
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        sqlx::query(
            r#"
            INSERT INTO "user_preferences" (
                "id",
                "userId",
                "preferredStudyTimeStart",
                "preferredStudyTimeEnd",
                "preferredDifficulty",
                "dailyGoalEnabled",
                "dailyGoalWords",
                "enableForgettingAlerts",
                "enableAchievements",
                "enableReminders",
                "enableSystemNotif",
                "reminderFrequency",
                "quietHoursStart",
                "quietHoursEnd",
                "theme",
                "language",
                "soundEnabled",
                "animationEnabled",
                "updatedAt"
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
            )
            ON CONFLICT ("userId") DO UPDATE SET
                "preferredStudyTimeStart" = EXCLUDED."preferredStudyTimeStart",
                "preferredStudyTimeEnd" = EXCLUDED."preferredStudyTimeEnd",
                "preferredDifficulty" = EXCLUDED."preferredDifficulty",
                "dailyGoalEnabled" = EXCLUDED."dailyGoalEnabled",
                "dailyGoalWords" = EXCLUDED."dailyGoalWords",
                "enableForgettingAlerts" = EXCLUDED."enableForgettingAlerts",
                "enableAchievements" = EXCLUDED."enableAchievements",
                "enableReminders" = EXCLUDED."enableReminders",
                "enableSystemNotif" = EXCLUDED."enableSystemNotif",
                "reminderFrequency" = EXCLUDED."reminderFrequency",
                "quietHoursStart" = EXCLUDED."quietHoursStart",
                "quietHoursEnd" = EXCLUDED."quietHoursEnd",
                "theme" = EXCLUDED."theme",
                "language" = EXCLUDED."language",
                "soundEnabled" = EXCLUDED."soundEnabled",
                "animationEnabled" = EXCLUDED."animationEnabled",
                "updatedAt" = EXCLUDED."updatedAt"
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(user_id)
        .bind(defaults.preferred_study_time_start)
        .bind(defaults.preferred_study_time_end)
        .bind(defaults.preferred_difficulty)
        .bind(defaults.daily_goal_enabled)
        .bind(defaults.daily_goal_words)
        .bind(defaults.enable_forgetting_alerts)
        .bind(defaults.enable_achievements)
        .bind(defaults.enable_reminders)
        .bind(defaults.enable_system_notif)
        .bind(defaults.reminder_frequency)
        .bind(defaults.quiet_hours_start)
        .bind(defaults.quiet_hours_end)
        .bind(defaults.theme)
        .bind(defaults.language)
        .bind(defaults.sound_enabled)
        .bind(defaults.animation_enabled)
        .bind(now)
        .execute(&primary)
        .await
        .map(|_| ())
        .map_err(|err| err.to_string())
    }
}

async fn select_preferences_row(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
) -> Result<Option<PreferencesRow>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(
        state,
        crate::db::state_machine::DatabaseState::Degraded | crate::db::state_machine::DatabaseState::Unavailable
    ) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback.as_ref() else {
            return Ok(None);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "preferredStudyTimeStart",
              "preferredStudyTimeEnd",
              "preferredDifficulty",
              "dailyGoalEnabled",
              "dailyGoalWords",
              "enableForgettingAlerts",
              "enableAchievements",
              "enableReminders",
              "enableSystemNotif",
              "reminderFrequency",
              "quietHoursStart",
              "quietHoursEnd",
              "theme",
              "language",
              "soundEnabled",
              "animationEnabled",
              "updatedAt"
            FROM "user_preferences"
            WHERE "userId" = ?
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        let Some(row) = row else { return Ok(None) };

        let updated_raw: String = row.try_get("updatedAt")?;
        Ok(Some(PreferencesRow {
            preferred_study_time_start: row.try_get("preferredStudyTimeStart")?,
            preferred_study_time_end: row.try_get("preferredStudyTimeEnd")?,
            preferred_difficulty: row.try_get("preferredDifficulty")?,
            daily_goal_enabled: row.try_get::<i64, _>("dailyGoalEnabled")? != 0,
            daily_goal_words: row.try_get::<i64, _>("dailyGoalWords")?,
            enable_forgetting_alerts: row.try_get::<i64, _>("enableForgettingAlerts")? != 0,
            enable_achievements: row.try_get::<i64, _>("enableAchievements")? != 0,
            enable_reminders: row.try_get::<i64, _>("enableReminders")? != 0,
            enable_system_notif: row.try_get::<i64, _>("enableSystemNotif")? != 0,
            reminder_frequency: row.try_get("reminderFrequency")?,
            quiet_hours_start: row.try_get("quietHoursStart")?,
            quiet_hours_end: row.try_get("quietHoursEnd")?,
            theme: row.try_get("theme")?,
            language: row.try_get("language")?,
            sound_enabled: row.try_get::<i64, _>("soundEnabled")? != 0,
            animation_enabled: row.try_get::<i64, _>("animationEnabled")? != 0,
            updated_at: format_sqlite_datetime(&updated_raw),
        }))
    } else {
        let Some(pool) = primary else {
            return Ok(None);
        };

        let row = sqlx::query(
            r#"
            SELECT
              "preferredStudyTimeStart",
              "preferredStudyTimeEnd",
              "preferredDifficulty",
              "dailyGoalEnabled",
              "dailyGoalWords",
              "enableForgettingAlerts",
              "enableAchievements",
              "enableReminders",
              "enableSystemNotif",
              "reminderFrequency",
              "quietHoursStart",
              "quietHoursEnd",
              "theme",
              "language",
              "soundEnabled",
              "animationEnabled",
              "updatedAt"
            FROM "user_preferences"
            WHERE "userId" = $1
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;

        let Some(row) = row else { return Ok(None) };

        let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt")?;
        Ok(Some(PreferencesRow {
            preferred_study_time_start: row.try_get("preferredStudyTimeStart")?,
            preferred_study_time_end: row.try_get("preferredStudyTimeEnd")?,
            preferred_difficulty: row.try_get("preferredDifficulty")?,
            daily_goal_enabled: row.try_get("dailyGoalEnabled")?,
            daily_goal_words: row.try_get::<i32, _>("dailyGoalWords")? as i64,
            enable_forgetting_alerts: row.try_get("enableForgettingAlerts")?,
            enable_achievements: row.try_get("enableAchievements")?,
            enable_reminders: row.try_get("enableReminders")?,
            enable_system_notif: row.try_get("enableSystemNotif")?,
            reminder_frequency: row.try_get("reminderFrequency")?,
            quiet_hours_start: row.try_get("quietHoursStart")?,
            quiet_hours_end: row.try_get("quietHoursEnd")?,
            theme: row.try_get("theme")?,
            language: row.try_get("language")?,
            sound_enabled: row.try_get("soundEnabled")?,
            animation_enabled: row.try_get("animationEnabled")?,
            updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
        }))
    }
}

async fn persist_preferences_row(
    proxy: &crate::db::DatabaseProxy,
    state: crate::db::state_machine::DatabaseState,
    user_id: &str,
    row: &PreferencesRow,
    now_iso: &str,
) -> Result<(), String> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );

        let mut data = serde_json::Map::new();
        data.insert(
            "preferredStudyTimeStart".to_string(),
            row.preferred_study_time_start
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        data.insert(
            "preferredStudyTimeEnd".to_string(),
            row.preferred_study_time_end
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        data.insert(
            "preferredDifficulty".to_string(),
            row.preferred_difficulty
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        data.insert(
            "dailyGoalEnabled".to_string(),
            serde_json::Value::Bool(row.daily_goal_enabled),
        );
        data.insert(
            "dailyGoalWords".to_string(),
            serde_json::Value::Number(row.daily_goal_words.into()),
        );
        data.insert(
            "enableForgettingAlerts".to_string(),
            serde_json::Value::Bool(row.enable_forgetting_alerts),
        );
        data.insert(
            "enableAchievements".to_string(),
            serde_json::Value::Bool(row.enable_achievements),
        );
        data.insert(
            "enableReminders".to_string(),
            serde_json::Value::Bool(row.enable_reminders),
        );
        data.insert(
            "enableSystemNotif".to_string(),
            serde_json::Value::Bool(row.enable_system_notif),
        );
        data.insert(
            "reminderFrequency".to_string(),
            serde_json::Value::String(row.reminder_frequency.clone()),
        );
        data.insert(
            "quietHoursStart".to_string(),
            row.quiet_hours_start
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        data.insert(
            "quietHoursEnd".to_string(),
            row.quiet_hours_end
                .clone()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        data.insert("theme".to_string(), serde_json::Value::String(row.theme.clone()));
        data.insert(
            "language".to_string(),
            serde_json::Value::String(row.language.clone()),
        );
        data.insert(
            "soundEnabled".to_string(),
            serde_json::Value::Bool(row.sound_enabled),
        );
        data.insert(
            "animationEnabled".to_string(),
            serde_json::Value::Bool(row.animation_enabled),
        );
        data.insert(
            "updatedAt".to_string(),
            serde_json::Value::String(now_iso.to_string()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "user_preferences".to_string(),
            r#where: where_clause,
            data,
            operation_id: Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };

        proxy
            .write_operation(state, op)
            .await
            .map(|_| ())
            .map_err(|err| err.to_string())
    } else {
        let Some(primary) = proxy.primary_pool().await else {
            return Err("database unavailable".to_string());
        };

        let now = parse_naive_datetime(now_iso).unwrap_or_else(|| Utc::now().naive_utc());
        sqlx::query(
            r#"
            UPDATE "user_preferences"
            SET
              "preferredStudyTimeStart" = $1,
              "preferredStudyTimeEnd" = $2,
              "preferredDifficulty" = $3,
              "dailyGoalEnabled" = $4,
              "dailyGoalWords" = $5,
              "enableForgettingAlerts" = $6,
              "enableAchievements" = $7,
              "enableReminders" = $8,
              "enableSystemNotif" = $9,
              "reminderFrequency" = $10,
              "quietHoursStart" = $11,
              "quietHoursEnd" = $12,
              "theme" = $13,
              "language" = $14,
              "soundEnabled" = $15,
              "animationEnabled" = $16,
              "updatedAt" = $17
            WHERE "userId" = $18
            "#,
        )
        .bind(row.preferred_study_time_start.as_deref())
        .bind(row.preferred_study_time_end.as_deref())
        .bind(row.preferred_difficulty.as_deref())
        .bind(row.daily_goal_enabled)
        .bind(i32::try_from(row.daily_goal_words).unwrap_or(20))
        .bind(row.enable_forgetting_alerts)
        .bind(row.enable_achievements)
        .bind(row.enable_reminders)
        .bind(row.enable_system_notif)
        .bind(&row.reminder_frequency)
        .bind(row.quiet_hours_start.as_deref())
        .bind(row.quiet_hours_end.as_deref())
        .bind(&row.theme)
        .bind(&row.language)
        .bind(row.sound_enabled)
        .bind(row.animation_enabled)
        .bind(now)
        .bind(user_id)
        .execute(&primary)
        .await
        .map(|_| ())
        .map_err(|err| err.to_string())
    }
}

struct DefaultPreferences {
    preferred_study_time_start: &'static str,
    preferred_study_time_end: &'static str,
    preferred_difficulty: &'static str,
    daily_goal_enabled: bool,
    daily_goal_words: i64,
    enable_forgetting_alerts: bool,
    enable_achievements: bool,
    enable_reminders: bool,
    enable_system_notif: bool,
    reminder_frequency: &'static str,
    quiet_hours_start: &'static str,
    quiet_hours_end: &'static str,
    theme: &'static str,
    language: &'static str,
    sound_enabled: bool,
    animation_enabled: bool,
}

impl DefaultPreferences {
    fn new() -> Self {
        Self {
            preferred_study_time_start: "09:00",
            preferred_study_time_end: "21:00",
            preferred_difficulty: "adaptive",
            daily_goal_enabled: true,
            daily_goal_words: 20,
            enable_forgetting_alerts: true,
            enable_achievements: true,
            enable_reminders: true,
            enable_system_notif: true,
            reminder_frequency: "daily",
            quiet_hours_start: "22:00",
            quiet_hours_end: "08:00",
            theme: "light",
            language: "zh-CN",
            sound_enabled: true,
            animation_enabled: true,
        }
    }

    fn populate_map(&self, map: &mut serde_json::Map<String, serde_json::Value>) {
        map.insert(
            "preferredStudyTimeStart".to_string(),
            serde_json::Value::String(self.preferred_study_time_start.to_string()),
        );
        map.insert(
            "preferredStudyTimeEnd".to_string(),
            serde_json::Value::String(self.preferred_study_time_end.to_string()),
        );
        map.insert(
            "preferredDifficulty".to_string(),
            serde_json::Value::String(self.preferred_difficulty.to_string()),
        );
        map.insert(
            "dailyGoalEnabled".to_string(),
            serde_json::Value::Bool(self.daily_goal_enabled),
        );
        map.insert(
            "dailyGoalWords".to_string(),
            serde_json::Value::Number(self.daily_goal_words.into()),
        );
        map.insert(
            "enableForgettingAlerts".to_string(),
            serde_json::Value::Bool(self.enable_forgetting_alerts),
        );
        map.insert(
            "enableAchievements".to_string(),
            serde_json::Value::Bool(self.enable_achievements),
        );
        map.insert(
            "enableReminders".to_string(),
            serde_json::Value::Bool(self.enable_reminders),
        );
        map.insert(
            "enableSystemNotif".to_string(),
            serde_json::Value::Bool(self.enable_system_notif),
        );
        map.insert(
            "reminderFrequency".to_string(),
            serde_json::Value::String(self.reminder_frequency.to_string()),
        );
        map.insert(
            "quietHoursStart".to_string(),
            serde_json::Value::String(self.quiet_hours_start.to_string()),
        );
        map.insert(
            "quietHoursEnd".to_string(),
            serde_json::Value::String(self.quiet_hours_end.to_string()),
        );
        map.insert(
            "theme".to_string(),
            serde_json::Value::String(self.theme.to_string()),
        );
        map.insert(
            "language".to_string(),
            serde_json::Value::String(self.language.to_string()),
        );
        map.insert(
            "soundEnabled".to_string(),
            serde_json::Value::Bool(self.sound_enabled),
        );
        map.insert(
            "animationEnabled".to_string(),
            serde_json::Value::Bool(self.animation_enabled),
        );
    }
}

fn is_in_quiet_hours(start: Option<&str>, end: Option<&str>) -> bool {
    let Some(start) = start else { return false };
    let Some(end) = end else { return false };
    if start.trim().is_empty() || end.trim().is_empty() {
        return false;
    }

    let start_min = match parse_hhmm_minutes(start) {
        Some(value) => value,
        None => return false,
    };
    let end_min = match parse_hhmm_minutes(end) {
        Some(value) => value,
        None => return false,
    };

    let now = chrono::Local::now();
    let current = now.hour() as i32 * 60 + now.minute() as i32;

    if start_min > end_min {
        current >= start_min || current <= end_min
    } else {
        current >= start_min && current <= end_min
    }
}

fn parse_hhmm_minutes(value: &str) -> Option<i32> {
    let (h, m) = value.split_once(':')?;
    let hour: i32 = h.trim().parse().ok()?;
    let minute: i32 = m.trim().parse().ok()?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) {
        return None;
    }
    Some(hour * 60 + minute)
}

fn now_iso_millis() -> String {
    crate::auth::format_naive_datetime_iso_millis(Utc::now().naive_utc())
}

fn parse_naive_datetime(value: &str) -> Option<chrono::NaiveDateTime> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|dt| dt.naive_utc())
}

fn format_sqlite_datetime(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw).unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| now_iso_millis())
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
