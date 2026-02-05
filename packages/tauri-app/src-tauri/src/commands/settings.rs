use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_goal: u32,
    pub reminder_enabled: bool,
    pub reminder_time: Option<String>,
    pub theme: String,
    pub telemetry_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            daily_goal: 20,
            reminder_enabled: false,
            reminder_time: None,
            theme: "system".into(),
            telemetry_enabled: false,
        }
    }
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    // TODO: Implement with tauri-plugin-store
    Ok(AppSettings::default())
}

#[tauri::command]
pub async fn update_settings(settings: AppSettings) -> Result<(), String> {
    let _ = settings;
    // TODO: Implement with tauri-plugin-store
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn reset_window_layout() -> Result<(), String> {
    // TODO: Implement window state reset
    Err("Not implemented".into())
}
