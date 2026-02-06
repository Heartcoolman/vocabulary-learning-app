use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tauri_plugin_window_state::AppHandleExt;

const STORE_PATH: &str = ".danci-store.json";
const SETTINGS_KEY: &str = "app_settings";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub daily_goal: u32,
    pub reminder_enabled: bool,
    pub reminder_time: Option<String>,
    pub theme: String,
    pub telemetry_enabled: bool,
    pub onboarding_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            daily_goal: 20,
            reminder_enabled: false,
            reminder_time: None,
            theme: "system".into(),
            telemetry_enabled: false,
            onboarding_completed: false,
        }
    }
}

#[tauri::command]
pub async fn get_settings<R: Runtime>(app: AppHandle<R>) -> Result<AppSettings, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    if let Some(value) = store.get(SETTINGS_KEY) {
        return serde_json::from_value(value)
            .map_err(|e| format!("Failed to parse app settings: {e}"));
    }

    let default_settings = AppSettings::default();
    let value = serde_json::to_value(&default_settings)
        .map_err(|e| format!("Failed to serialize default app settings: {e}"))?;

    store.set(SETTINGS_KEY, value);
    store
        .save()
        .map_err(|e| format!("Failed to save default app settings: {e}"))?;

    Ok(default_settings)
}

#[tauri::command]
pub async fn update_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: AppSettings,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    let value = serde_json::to_value(settings)
        .map_err(|e| format!("Failed to serialize app settings: {e}"))?;

    store.set(SETTINGS_KEY, value);
    store
        .save()
        .map_err(|e| format!("Failed to persist app settings: {e}"))
}

#[tauri::command]
pub async fn reset_window_layout<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state_file = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(app.filename());

    if state_file.exists() {
        std::fs::remove_file(&state_file).map_err(|e| {
            format!(
                "Failed to remove window state file {}: {e}",
                state_file.display()
            )
        })?;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unmaximize();
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(1024, 768)));
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(())
}
