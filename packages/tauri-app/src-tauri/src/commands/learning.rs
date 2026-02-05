use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LearningWord {
    pub id: String,
    pub word: String,
    pub phonetic: Option<String>,
    pub definition: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LearningSession {
    pub session_id: String,
    pub words: Vec<LearningWord>,
    pub total_count: u32,
    pub completed_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerResult {
    pub correct: bool,
    pub next_word: Option<LearningWord>,
}

#[tauri::command]
pub async fn get_learning_words() -> Result<LearningSession, String> {
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn submit_answer(word_id: String, answer: String) -> Result<AnswerResult, String> {
    let _ = (word_id, answer);
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn get_session() -> Result<LearningSession, String> {
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}
