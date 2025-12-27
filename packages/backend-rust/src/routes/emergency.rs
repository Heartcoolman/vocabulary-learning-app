use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmergencyConfig {
    degradation_level: String,
    feature_flags: FeatureFlags,
    notifications: Vec<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FeatureFlags {
    learning_enabled: bool,
    amas_enabled: bool,
    sync_enabled: bool,
    force_offline_mode: bool,
    show_maintenance_banner: bool,
    registration_enabled: bool,
    experimental_enabled: bool,
}

pub async fn get_config() -> impl IntoResponse {
    Json(SuccessResponse {
        success: true,
        data: EmergencyConfig {
            degradation_level: "none".to_string(),
            feature_flags: FeatureFlags {
                learning_enabled: true,
                amas_enabled: true,
                sync_enabled: true,
                force_offline_mode: false,
                show_maintenance_banner: false,
                registration_enabled: true,
                experimental_enabled: false,
            },
            notifications: Vec::new(),
        },
    })
}
