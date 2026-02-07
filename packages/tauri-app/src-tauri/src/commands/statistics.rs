use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Statistics {
    pub total_words: u32,
    pub learned_words: u32,
    pub mastered_words: u32,
    pub streak_days: u32,
    pub total_reviews: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyReport {
    pub week_start: String,
    pub new_words: u32,
    pub review_count: u32,
    pub accuracy_rate: f64,
    pub daily_breakdown: Vec<DailyStats>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub new_words: u32,
    pub reviews: u32,
}

#[tauri::command]
pub async fn get_statistics() -> Result<Statistics, String> {
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}

#[tauri::command]
pub async fn get_weekly_report() -> Result<WeeklyReport, String> {
    // TODO: Implement with SQLite backend
    Err("Not implemented".into())
}
