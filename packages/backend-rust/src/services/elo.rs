use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DatabaseProxy;

const DEFAULT_ELO: f64 = 1200.0;
const BASE_K: f64 = 32.0;
const MIN_K: f64 = 16.0;
const MAX_K: f64 = 48.0;
const FAST_RT_MS: f64 = 2000.0;
const SLOW_RT_MS: f64 = 8000.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EloRating {
    pub elo: f64,
    pub games_played: i32,
    pub updated_at: i64,
}

impl Default for EloRating {
    fn default() -> Self {
        Self {
            elo: DEFAULT_ELO,
            games_played: 0,
            updated_at: chrono::Utc::now().timestamp_millis(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EloUpdate {
    pub new_user_elo: f64,
    pub new_word_elo: f64,
    pub user_delta: f64,
    pub word_delta: f64,
}

pub fn expected_score(user_elo: f64, word_elo: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf((word_elo - user_elo) / 400.0))
}

pub fn dynamic_k(response_time_ms: i64) -> f64 {
    let rt = response_time_ms as f64;
    let norm = ((SLOW_RT_MS - rt) / (SLOW_RT_MS - FAST_RT_MS)).clamp(-0.5, 0.5);
    (BASE_K * (1.0 + norm * 0.5)).clamp(MIN_K, MAX_K)
}

pub fn update_ratings(
    user_elo: f64,
    word_elo: f64,
    is_correct: bool,
    response_time_ms: i64,
) -> EloUpdate {
    let expected = expected_score(user_elo, word_elo);
    let actual = if is_correct { 1.0 } else { 0.0 };
    let k = dynamic_k(response_time_ms);
    let delta = k * (actual - expected);

    EloUpdate {
        new_user_elo: user_elo + delta,
        new_word_elo: word_elo - delta,
        user_delta: delta,
        word_delta: -delta,
    }
}

pub fn cold_start_word_elo(spelling_len: usize, frequency_score: f64) -> f64 {
    let length_factor = ((spelling_len as f64 - 3.0) / 12.0).clamp(0.0, 1.0);
    let rarity_factor = (1.0 - frequency_score).clamp(0.0, 1.0);
    1100.0 + 400.0 * length_factor + 300.0 * rarity_factor
}

pub async fn get_user_elo(proxy: &DatabaseProxy, user_id: &str) -> Result<f64, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "abilityElo" FROM "users" WHERE "id" = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|r| r.try_get::<Option<f64>, _>("abilityElo").ok().flatten())
        .unwrap_or(DEFAULT_ELO))
}

pub async fn get_word_elo(proxy: &DatabaseProxy, word_id: &str) -> Result<f64, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "difficultyElo" FROM "words" WHERE "id" = $1"#)
        .bind(word_id)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|r| r.try_get::<Option<f64>, _>("difficultyElo").ok().flatten())
        .unwrap_or(DEFAULT_ELO))
}

pub async fn update_elo_ratings_db(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_id: &str,
    is_correct: bool,
    response_time_ms: i64,
) -> Result<EloUpdate, sqlx::Error> {
    let user_elo = get_user_elo(proxy, user_id).await?;
    let word_elo = get_word_elo(proxy, word_id).await?;

    let update = update_ratings(user_elo, word_elo, is_correct, response_time_ms);

    let pool = proxy.pool();
    sqlx::query(r#"UPDATE "users" SET "abilityElo" = $2, "eloGamesPlayed" = COALESCE("eloGamesPlayed", 0) + 1 WHERE "id" = $1"#)
        .bind(user_id)
        .bind(update.new_user_elo)
        .execute(pool)
        .await?;

    sqlx::query(r#"UPDATE "words" SET "difficultyElo" = $2, "eloGamesPlayed" = COALESCE("eloGamesPlayed", 0) + 1 WHERE "id" = $1"#)
        .bind(word_id)
        .bind(update.new_word_elo)
        .execute(pool)
        .await?;

    Ok(update)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expected_score_equal_elo() {
        let score = expected_score(1200.0, 1200.0);
        assert!((score - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_expected_score_higher_user() {
        let score = expected_score(1400.0, 1200.0);
        assert!(score > 0.7);
    }

    #[test]
    fn test_update_correct_answer() {
        let update = update_ratings(1200.0, 1200.0, true, 3000);
        assert!(update.user_delta > 0.0);
        assert!(update.word_delta < 0.0);
    }

    #[test]
    fn test_update_wrong_answer() {
        let update = update_ratings(1200.0, 1200.0, false, 3000);
        assert!(update.user_delta < 0.0);
        assert!(update.word_delta > 0.0);
    }

    #[test]
    fn test_cold_start_word_elo() {
        let short_common = cold_start_word_elo(4, 0.9);
        let long_rare = cold_start_word_elo(12, 0.1);
        assert!(long_rare > short_common);
    }
}
