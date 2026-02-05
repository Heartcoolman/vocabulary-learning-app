use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Wordbook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub word_count: u32,
    pub is_selected: bool,
}

#[tauri::command]
pub async fn list_wordbooks() -> Result<Vec<Wordbook>, String> {
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn select_wordbook(wordbook_id: String) -> Result<(), String> {
    let _ = wordbook_id;
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}
