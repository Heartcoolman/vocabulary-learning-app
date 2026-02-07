use tauri::State;

use crate::SidecarState;

#[tauri::command]
pub async fn get_sidecar_port(state: State<'_, SidecarState>) -> Result<u16, String> {
    state
        .port
        .lock()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Sidecar not ready".to_string())
}
