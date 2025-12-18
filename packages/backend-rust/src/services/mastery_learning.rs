use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;
use crate::services::amas::{compute_new_word_difficulty, map_difficulty_level, DifficultyRange, StrategyParams};
use crate::services::study_config::get_or_create_user_study_config;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningWord {
    pub id: String,
    pub spelling: String,
    pub phonetic: String,
    pub meanings: Vec<String>,
    pub examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_url: Option<String>,
    pub is_new: bool,
    pub difficulty: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryModeMeta {
    pub mode: &'static str,
    pub target_count: i64,
    pub fetch_count: usize,
    pub mastery_threshold: i64,
    pub max_questions: i64,
    pub strategy: StrategyParams,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryStudyWordsResponse {
    pub words: Vec<LearningWord>,
    pub meta: MasteryModeMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextWordsResponse {
    pub words: Vec<LearningWord>,
    pub strategy: StrategyParams,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyRangeResponse {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjustments {
    pub remove: Vec<String>,
    pub add: Vec<LearningWord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerConditions {
    pub performance: RecentPerformance,
    pub user_state: Option<UserState>,
    pub target_difficulty: DifficultyRangeResponse,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustWordsResponse {
    pub adjustments: Adjustments,
    pub target_difficulty: DifficultyRangeResponse,
    pub reason: String,
    pub adjustment_reason: String,
    pub trigger_conditions: TriggerConditions,
    pub next_check_in: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProgressResponse {
    pub target_mastery_count: i64,
    pub actual_mastery_count: i64,
    pub total_questions: i64,
    pub is_completed: bool,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GetNextWordsInput {
    pub current_word_ids: Vec<String>,
    pub mastered_word_ids: Vec<String>,
    pub session_id: String,
    pub count: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct AdjustWordsInput {
    pub user_id: String,
    pub session_id: String,
    pub current_word_ids: Vec<String>,
    pub mastered_word_ids: Vec<String>,
    pub user_state: Option<UserState>,
    pub recent_performance: RecentPerformance,
    pub adjust_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserState {
    pub fatigue: Option<f64>,
    pub attention: Option<f64>,
    pub motivation: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentPerformance {
    pub accuracy: f64,
    pub avg_response_time: f64,
    pub consecutive_wrong: f64,
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session not found")]
    NotFound,
    #[error("session belongs to another user")]
    Forbidden,
    #[error("sql error: {0}")]
    Sql(#[from] sqlx::Error),
    #[error("db mutation failed: {0}")]
    Mutation(String),
}

pub async fn get_words_for_mastery_mode(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    target_count: Option<i64>,
) -> Result<MasteryStudyWordsResponse, sqlx::Error> {
    let config = get_or_create_user_study_config(proxy, state, user_id).await?;
    let target = target_count
        .or(Some(config.daily_mastery_target))
        .or(Some(config.daily_word_count))
        .unwrap_or(20);

    let strategy = StrategyParams::default_strategy();
    let words = fetch_words_with_strategy(proxy, state, user_id, 5, &strategy, &[]).await?;

    Ok(MasteryStudyWordsResponse {
        words: words.clone(),
        meta: MasteryModeMeta {
            mode: "mastery",
            target_count: target,
            fetch_count: words.len(),
            mastery_threshold: 2,
            max_questions: 100,
            strategy,
        },
    })
}

pub async fn get_next_words(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    input: GetNextWordsInput,
) -> Result<NextWordsResponse, sqlx::Error> {
    let batch_size = input.count.unwrap_or(3).max(1).min(20) as usize;
    let strategy = StrategyParams::default_strategy();

    let mut exclude: HashSet<String> = HashSet::new();
    for id in input.current_word_ids.iter().chain(input.mastered_word_ids.iter()) {
        exclude.insert(id.clone());
    }
    let exclude_ids: Vec<String> = exclude.into_iter().collect();

    let words = fetch_words_with_strategy(proxy, state, user_id, batch_size, &strategy, &exclude_ids).await?;
    let reason = explain_word_selection(&strategy, &words);

    Ok(NextWordsResponse { words, strategy, reason })
}

pub async fn adjust_words_for_user(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    input: AdjustWordsInput,
) -> Result<AdjustWordsResponse, sqlx::Error> {
    let user_id = input.user_id.as_str();

    let target = compute_target_difficulty(&input.user_state, &input.recent_performance, &input.adjust_reason);
    let next_check_in = compute_next_check_in(&input.recent_performance, input.user_state.as_ref());

    let difficulty_map = batch_compute_difficulty(proxy, state, user_id, &input.current_word_ids).await?;

    let mastered_set: HashSet<&str> = input.mastered_word_ids.iter().map(|id| id.as_str()).collect();
    let remove: Vec<String> = input
        .current_word_ids
        .iter()
        .filter(|id| {
            if mastered_set.contains(id.as_str()) {
                return true;
            }
            let d = difficulty_map.get(id.as_str()).copied().unwrap_or(0.5);
            d > target.max || d < target.min
        })
        .cloned()
        .collect();

    let desired_add = remove
        .len()
        .max(((input.current_word_ids.len() as f64) * 0.3).ceil() as usize)
        .max(2);

    let mut exclude: HashSet<String> = HashSet::new();
    for id in input.current_word_ids.iter().chain(input.mastered_word_ids.iter()) {
        exclude.insert(id.clone());
    }
    let exclude_ids: Vec<String> = exclude.into_iter().collect();

    let mut candidates = fetch_words_in_difficulty_range(
        proxy,
        state,
        user_id,
        target,
        &exclude_ids,
        desired_add,
    )
    .await?;

    if candidates.len() < desired_add {
        candidates = fetch_words_in_difficulty_range(
            proxy,
            state,
            user_id,
            DifficultyRange { min: 0.0, max: 1.0 },
            &exclude_ids,
            desired_add,
        )
        .await?;
    }

    let reason_text = adjust_reason_text(&input.adjust_reason, input.user_state.as_ref(), &input.recent_performance);

    Ok(AdjustWordsResponse {
        adjustments: Adjustments { remove, add: candidates.clone() },
        target_difficulty: DifficultyRangeResponse { min: target.min, max: target.max },
        reason: reason_text,
        adjustment_reason: input.adjust_reason,
        trigger_conditions: TriggerConditions {
            performance: input.recent_performance,
            user_state: input.user_state,
            target_difficulty: DifficultyRangeResponse { min: target.min, max: target.max },
        },
        next_check_in,
    })
}

pub async fn sync_session_progress(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
    actual_mastery_count: i64,
    total_questions: i64,
) -> Result<(), SessionError> {
    let exists = select_learning_session(proxy, state, session_id, user_id).await?;
    if exists.is_none() {
        return Err(SessionError::NotFound);
    }

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(session_id.to_string()));
        where_clause.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );

        let mut data = serde_json::Map::new();
        data.insert(
            "actualMasteryCount".to_string(),
            serde_json::Value::Number(actual_mastery_count.into()),
        );
        data.insert(
            "totalQuestions".to_string(),
            serde_json::Value::Number(total_questions.into()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "learning_sessions".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|err| SessionError::Mutation(err.to_string()))?;
        return Ok(());
    }

    let Some(primary) = proxy.primary_pool().await else {
        return Err(SessionError::Sql(sqlx::Error::PoolClosed));
    };
    sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "actualMasteryCount" = $1, "totalQuestions" = $2, "updatedAt" = $3
        WHERE "id" = $4 AND "userId" = $5
        "#,
    )
    .bind(actual_mastery_count as i32)
    .bind(total_questions as i32)
    .bind(Utc::now().naive_utc())
    .bind(session_id)
    .bind(user_id)
    .execute(&primary)
    .await?;

    Ok(())
}

pub async fn ensure_learning_session(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    target_mastery_count: i64,
    session_id: Option<String>,
) -> Result<String, SessionError> {
    if target_mastery_count <= 0 || target_mastery_count > 100 {
        return Err(SessionError::Sql(sqlx::Error::Protocol(
            "Invalid targetMasteryCount".to_string(),
        )));
    }

    if let Some(session_id) = session_id {
        let existing_any = select_learning_session_any(proxy, state, &session_id).await?;
        if let Some(existing_user) = existing_any {
            if existing_user != user_id {
                return Err(SessionError::Forbidden);
            }
            update_target_mastery(proxy, state, &session_id, user_id, target_mastery_count).await?;
            return Ok(session_id);
        }
    }

    let new_id = uuid::Uuid::new_v4().to_string();
    create_learning_session(proxy, state, &new_id, user_id, target_mastery_count).await?;
    Ok(new_id)
}

pub async fn get_session_progress(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
) -> Result<SessionProgressResponse, SessionError> {
    let Some(session) = select_learning_session(proxy, state, session_id, user_id).await? else {
        return Err(SessionError::NotFound);
    };

    let is_completed = session.actual_mastery_count >= session.target_mastery_count;
    Ok(SessionProgressResponse {
        target_mastery_count: session.target_mastery_count,
        actual_mastery_count: session.actual_mastery_count,
        total_questions: session.total_questions,
        is_completed,
        started_at: session.started_at,
        ended_at: session.ended_at,
    })
}

#[derive(Debug, Clone)]
struct WordBase {
    id: String,
    spelling: String,
    phonetic: String,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
}

#[derive(Debug, Clone)]
struct WordSpellingRow {
    id: String,
    spelling: String,
}

#[derive(Debug, Clone)]
struct WordStateRow {
    word_id: String,
    next_review_ms: Option<i64>,
}

#[derive(Debug, Clone)]
struct WordScoreRow {
    word_id: String,
    total_score: f64,
    correct_attempts: i64,
    total_attempts: i64,
}

#[derive(Debug, Clone)]
struct WordFrequencyRow {
    word_id: String,
    frequency_score: f64,
}

#[derive(Debug, Clone)]
struct LearningStateDifficultyRow {
    word_id: String,
    last_review_ms: Option<i64>,
    review_count: i64,
}

#[derive(Debug, Clone)]
struct DueWord {
    word: WordBase,
    difficulty: f64,
    priority: f64,
}

#[derive(Debug, Clone)]
struct LearningSessionRow {
    target_mastery_count: i64,
    actual_mastery_count: i64,
    total_questions: i64,
    started_at: String,
    ended_at: Option<String>,
}

async fn fetch_words_with_strategy(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    count: usize,
    strategy: &StrategyParams,
    exclude_ids: &[String],
) -> Result<Vec<LearningWord>, sqlx::Error> {
    let due_words = get_due_words_with_priority(proxy, state, user_id, exclude_ids).await?;
    let difficulty_range = map_difficulty_level(&strategy.difficulty);

    let mut filtered: Vec<DueWord> = due_words
        .into_iter()
        .filter(|w| w.difficulty >= difficulty_range.min && w.difficulty <= difficulty_range.max)
        .collect();
    filtered.sort_by(|a, b| b.priority.partial_cmp(&a.priority).unwrap_or(std::cmp::Ordering::Equal));

    let review_count = ((count as f64) * (1.0 - strategy.new_ratio)).ceil() as usize;
    let new_count = count.saturating_sub(review_count);

    let review_words: Vec<DueWord> = filtered.into_iter().take(review_count).collect();
    let actual_new = new_count.max(count.saturating_sub(review_words.len()));

    let mut combined_exclude: Vec<String> = exclude_ids.to_vec();
    combined_exclude.extend(review_words.iter().map(|w| w.word.id.clone()));

    let new_words = fetch_new_words_in_range(proxy, state, user_id, actual_new, difficulty_range, &combined_exclude).await?;

    let mut out: Vec<LearningWord> = Vec::new();
    for w in review_words {
        out.push(word_to_learning_word(w.word, false, w.difficulty));
    }
    for w in new_words {
        out.push(w);
    }
    Ok(out)
}

async fn get_due_words_with_priority(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    exclude_ids: &[String],
) -> Result<Vec<DueWord>, sqlx::Error> {
    let now_ms = Utc::now().timestamp_millis();
    let word_states = select_due_word_states(proxy, state, user_id, now_ms, exclude_ids).await?;
    if word_states.is_empty() {
        return Ok(Vec::new());
    }

    let word_ids: Vec<String> = word_states.iter().map(|s| s.word_id.clone()).collect();
    let (words, scores) = tokio::try_join!(
        select_words_by_ids(proxy, state, &word_ids),
        select_word_scores(proxy, state, user_id, &word_ids),
    )?;

    let score_map: HashMap<&str, &WordScoreRow> = scores.iter().map(|s| (s.word_id.as_str(), s)).collect();
    let word_map: HashMap<&str, &WordBase> = words.iter().map(|w| (w.id.as_str(), w)).collect();

    let mut results = Vec::new();
    for state_row in word_states {
        let Some(word) = word_map.get(state_row.word_id.as_str()) else { continue };

        let score = score_map.get(state_row.word_id.as_str()).copied();
        let overdue_days = state_row
            .next_review_ms
            .map(|ts| ((now_ms - ts) as f64 / 86_400_000.0).max(0.0))
            .unwrap_or(0.0);

        let (error_rate, total_score) = match score {
            Some(s) if s.total_attempts > 0 => {
                let accuracy = s.correct_attempts as f64 / s.total_attempts as f64;
                (1.0 - accuracy, Some(s.total_score))
            }
            Some(s) => (0.0, Some(s.total_score)),
            None => (0.0, None),
        };

        let priority =
            overdue_days.min(8.0) * 5.0
                + if error_rate > 0.5 { 30.0 } else { error_rate * 60.0 }
                + total_score.map(|v| (100.0 - v) * 0.3).unwrap_or(30.0);

        let difficulty = compute_difficulty_from_score(score, error_rate);

        results.push(DueWord {
            word: (*word).clone(),
            difficulty,
            priority,
        });
    }

    Ok(results)
}

async fn fetch_new_words_in_range(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    count: usize,
    difficulty_range: DifficultyRange,
    exclude_ids: &[String],
) -> Result<Vec<LearningWord>, sqlx::Error> {
    if count == 0 {
        return Ok(Vec::new());
    }

    let config = get_or_create_user_study_config(proxy, state, user_id).await?;
    if config.selected_word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let learned_ids = select_learned_word_ids(proxy, state, user_id).await?;
    let mut excluded: HashSet<String> = exclude_ids.iter().cloned().collect();
    excluded.extend(learned_ids);
    let excluded_ids: Vec<String> = excluded.into_iter().collect();

    let take = (count * 2).max(1);
    let mut candidates = select_candidate_words_from_word_books(
        proxy,
        state,
        &config.selected_word_book_ids,
        &excluded_ids,
        &config.study_mode,
        take,
    )
    .await?;

    let with_diff: Vec<LearningWord> = candidates
        .drain(..)
        .map(|w| {
            let difficulty = compute_new_word_difficulty(&w.spelling, w.meanings.len());
            LearningWord {
                id: w.id,
                spelling: w.spelling,
                phonetic: w.phonetic,
                meanings: w.meanings,
                examples: w.examples,
                audio_url: w.audio_url,
                is_new: true,
                difficulty,
            }
        })
        .collect();

    let mut filtered: Vec<LearningWord> = with_diff
        .iter()
        .cloned()
        .filter(|w| w.difficulty >= difficulty_range.min && w.difficulty <= difficulty_range.max)
        .collect();

    if filtered.len() < count {
        let filtered_ids: HashSet<&str> = filtered.iter().map(|w| w.id.as_str()).collect();
        let mut remaining: Vec<LearningWord> = with_diff
            .into_iter()
            .filter(|w| !filtered_ids.contains(w.id.as_str()))
            .collect();
        let center = (difficulty_range.min + difficulty_range.max) / 2.0;
        remaining.sort_by(|a, b| {
            (a.difficulty - center)
                .abs()
                .partial_cmp(&(b.difficulty - center).abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let need = count.saturating_sub(filtered.len());
        filtered.extend(remaining.into_iter().take(need));
    }

    Ok(filtered.into_iter().take(count).collect())
}

async fn fetch_words_in_difficulty_range(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    range: DifficultyRange,
    exclude_ids: &[String],
    count: usize,
) -> Result<Vec<LearningWord>, sqlx::Error> {
    let config = get_or_create_user_study_config(proxy, state, user_id).await?;
    if config.selected_word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let fetch_limit = (count * 3).max(15);
    let candidates = select_candidate_words_from_word_books(
        proxy,
        state,
        &config.selected_word_book_ids,
        exclude_ids,
        &config.study_mode,
        fetch_limit,
    )
    .await?;

    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let candidate_ids: Vec<String> = candidates.iter().map(|w| w.id.clone()).collect();
    let learned_set = select_learned_word_set(proxy, state, user_id, &candidate_ids).await?;
    let difficulty_map = batch_compute_difficulty(proxy, state, user_id, &candidate_ids).await?;

    Ok(candidates
        .into_iter()
        .map(|w| {
            let id = w.id;
            let id_str = id.as_str();
            let difficulty = difficulty_map.get(id_str).copied().unwrap_or(0.5);
            let is_new = !learned_set.contains(id_str);
            LearningWord {
                id,
                spelling: w.spelling,
                phonetic: w.phonetic,
                meanings: w.meanings,
                examples: w.examples,
                audio_url: w.audio_url,
                is_new,
                difficulty,
            }
        })
        .filter(|w| w.difficulty >= range.min && w.difficulty <= range.max)
        .take(count)
        .collect())
}

async fn batch_compute_difficulty(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, f64>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let (words, scores, freqs, states) = tokio::try_join!(
        select_word_spellings(proxy, state, word_ids),
        select_word_scores(proxy, state, user_id, word_ids),
        select_word_frequencies(proxy, state, word_ids),
        select_learning_state_difficulty_rows(proxy, state, user_id, word_ids),
    )?;

    let score_map: HashMap<&str, &WordScoreRow> = scores.iter().map(|s| (s.word_id.as_str(), s)).collect();
    let freq_map: HashMap<&str, f64> = freqs.iter().map(|f| (f.word_id.as_str(), f.frequency_score)).collect();
    let state_map: HashMap<&str, &LearningStateDifficultyRow> = states.iter().map(|s| (s.word_id.as_str(), s)).collect();

    let now_ms = Utc::now().timestamp_millis();
    let mut out = HashMap::new();

    for word in words {
        let score = score_map.get(word.id.as_str()).copied();
        let accuracy = score
            .filter(|s| s.total_attempts > 0)
            .map(|s| s.correct_attempts as f64 / s.total_attempts as f64)
            .unwrap_or(0.5);

        let letter_count = word
            .spelling
            .chars()
            .filter(|c| c.is_ascii_alphabetic())
            .count();
        let length_factor = ((letter_count as f64 - 3.0) / 12.0).clamp(0.0, 1.0);

        let frequency_score = freq_map.get(word.id.as_str()).copied().unwrap_or(0.5);
        let frequency_factor = (1.0 - frequency_score).clamp(0.0, 1.0);

        let forgetting_factor = match state_map.get(word.id.as_str()) {
            Some(state_row) if state_row.review_count > 0 => {
                let retention = state_row
                    .last_review_ms
                    .map(|last| calculate_forgetting_factor(now_ms, last, state_row.review_count, accuracy))
                    .unwrap_or(0.5);
                (1.0 - retention).clamp(0.0, 1.0)
            }
            _ => 0.5,
        };

        let difficulty = (0.2 * length_factor + 0.4 * (1.0 - accuracy) + 0.2 * frequency_factor + 0.2 * forgetting_factor)
            .clamp(0.0, 1.0);

        out.insert(word.id, difficulty);
    }

    Ok(out)
}

fn calculate_forgetting_factor(now_ms: i64, last_review_ms: i64, review_count: i64, average_accuracy: f64) -> f64 {
    let days_since = ((now_ms - last_review_ms).max(0) as f64) / 86_400_000.0;
    let review_multiplier = 1.0 + (review_count as f64) * 0.2;
    let accuracy = average_accuracy.clamp(0.1, 1.0);
    let half_life = (1.0 * review_multiplier * accuracy * 1.0).clamp(0.1, 90.0);
    (-days_since / half_life).exp()
}

fn compute_target_difficulty(
    user_state: &Option<UserState>,
    performance: &RecentPerformance,
    reason: &str,
) -> DifficultyRange {
    let fatigue = user_state.as_ref().and_then(|v| v.fatigue).unwrap_or(0.0);
    let attention = user_state.as_ref().and_then(|v| v.attention).unwrap_or(1.0);
    let motivation = user_state.as_ref().and_then(|v| v.motivation).unwrap_or(0.5);

    let accuracy = performance.accuracy;
    let consecutive_wrong = performance.consecutive_wrong;

    if fatigue > 0.7 {
        return DifficultyRange { min: 0.0, max: 0.4 };
    }
    if consecutive_wrong >= 3.0 {
        return DifficultyRange { min: 0.0, max: 0.3 };
    }
    if accuracy < 0.5 && (reason == "struggling" || consecutive_wrong >= 2.0) {
        return DifficultyRange { min: 0.1, max: 0.5 };
    }
    if attention < 0.5 {
        return DifficultyRange { min: 0.2, max: 0.6 };
    }
    if accuracy > 0.85 && motivation > 0.5 {
        return DifficultyRange { min: 0.4, max: 0.9 };
    }
    DifficultyRange { min: 0.2, max: 0.7 }
}

fn compute_next_check_in(performance: &RecentPerformance, user_state: Option<&UserState>) -> i64 {
    if performance.consecutive_wrong >= 2.0 || performance.accuracy < 0.4 {
        return 1;
    }
    if let Some(state) = user_state {
        if state.fatigue.unwrap_or(0.0) > 0.6 {
            return 2;
        }
        if state.attention.unwrap_or(1.0) < 0.4 {
            return 2;
        }
    }
    if performance.accuracy > 0.9 && performance.avg_response_time < 2000.0 {
        return 5;
    }
    3
}

fn adjust_reason_text(reason: &str, user_state: Option<&UserState>, performance: &RecentPerformance) -> String {
    match reason {
        "fatigue" => format!(
            "检测到疲劳度较高({}%)，已切换为简单词汇",
            ((user_state.and_then(|s| s.fatigue).unwrap_or(0.0)) * 100.0).round() as i64
        ),
        "struggling" => format!("连续{}次错误，已降低难度", performance.consecutive_wrong.round() as i64),
        "excelling" => format!(
            "表现优秀(正确率{}%)，已提升难度",
            (performance.accuracy * 100.0).round() as i64
        ),
        _ => "定期调整学习队列".to_string(),
    }
}

fn compute_difficulty_from_score(score: Option<&WordScoreRow>, error_rate: f64) -> f64 {
    let Some(score) = score else { return 0.5 };
    let score_factor = (100.0 - score.total_score) / 100.0;
    (error_rate * 0.6 + score_factor * 0.4).clamp(0.0, 1.0)
}

fn word_to_learning_word(word: WordBase, is_new: bool, difficulty: f64) -> LearningWord {
    LearningWord {
        id: word.id,
        spelling: word.spelling,
        phonetic: word.phonetic,
        meanings: word.meanings,
        examples: word.examples,
        audio_url: word.audio_url,
        is_new,
        difficulty,
    }
}

fn explain_word_selection(strategy: &StrategyParams, words: &[LearningWord]) -> String {
    let review_count = words.iter().filter(|w| !w.is_new).count();
    let new_count = words.iter().filter(|w| w.is_new).count();

    let difficulty_text = match strategy.difficulty.as_str() {
        "easy" => "简单",
        "hard" => "较难",
        _ => "中等",
    };

    if strategy.new_ratio <= 0.1 {
        format!("当前状态建议巩固复习，推送{review_count}个{difficulty_text}复习词")
    } else if strategy.new_ratio >= 0.4 {
        format!("状态良好，推送{new_count}个新词和{review_count}个复习词")
    } else {
        format!("推送{review_count}个复习词和{new_count}个新词，难度{difficulty_text}")
    }
}

async fn select_due_word_states(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    now_ms: i64,
    exclude_ids: &[String],
) -> Result<Vec<WordStateRow>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let rows = sqlx::query(
            r#"
            SELECT "wordId","nextReviewDate"
            FROM "word_learning_states"
            WHERE "userId" = ?
              AND "nextReviewDate" IS NOT NULL
              AND "state" IN ('LEARNING','REVIEWING','NEW')
            "#,
        )
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

        let mut out = Vec::new();
        for row in rows {
            let next_raw: Option<String> = row.try_get("nextReviewDate").ok();
            let next_ms = next_raw
                .as_deref()
                .and_then(crate::auth::parse_sqlite_datetime_ms);
            if let Some(ms) = next_ms {
                if ms <= now_ms {
                    let word_id: String = row.try_get("wordId").unwrap_or_default();
                    if exclude_ids.iter().any(|id| id == &word_id) {
                        continue;
                    }
                    out.push(WordStateRow { word_id, next_review_ms: Some(ms) });
                }
            }
        }
        Ok(out)
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let now_dt = DateTime::<Utc>::from_timestamp_millis(now_ms)
            .unwrap_or_else(|| Utc::now())
            .naive_utc();

        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            SELECT "wordId","nextReviewDate"
            FROM "word_learning_states"
            WHERE "userId" = 
            "#,
        );
        qb.push_bind(user_id);
        qb.push(" AND \"nextReviewDate\" <= ");
        qb.push_bind(now_dt);
        qb.push(" AND \"state\"::text IN ('LEARNING','REVIEWING','NEW')");
        if !exclude_ids.is_empty() {
            qb.push(" AND \"wordId\" NOT IN (");
            {
                let mut sep = qb.separated(", ");
                for id in exclude_ids {
                    sep.push_bind(id);
                }
                sep.push_unseparated(")");
            }
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let word_id: String = row.try_get("wordId").ok()?;
                let next_dt: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
                let next_ms = next_dt.map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis());
                Some(WordStateRow { word_id, next_review_ms: next_ms })
            })
            .collect())
    }
}

async fn select_words_by_ids(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_ids: &[String],
) -> Result<Vec<WordBase>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else {
            return Ok(Vec::new());
        };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"
            SELECT "id","spelling","phonetic","meanings","examples","audioUrl"
            FROM "words"
            WHERE "id" IN (
            "#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows.into_iter().map(map_sqlite_word_row).collect())
    } else {
        let Some(pool) = primary else {
            return Ok(Vec::new());
        };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"
            SELECT "id","spelling","phonetic","meanings","examples","audioUrl"
            FROM "words"
            WHERE "id" IN (
            "#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids {
                sep.push_bind(id);
            }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows.into_iter().map(map_postgres_word_row).collect())
    }
}

async fn select_word_spellings(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_ids: &[String],
) -> Result<Vec<WordSpellingRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "id","spelling" FROM "words" WHERE "id" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                Some(WordSpellingRow {
                    id: row.try_get("id").ok()?,
                    spelling: row.try_get("spelling").ok()?,
                })
            })
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "id","spelling" FROM "words" WHERE "id" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                Some(WordSpellingRow {
                    id: row.try_get("id").ok()?,
                    spelling: row.try_get("spelling").ok()?,
                })
            })
            .collect())
    }
}

async fn select_word_scores(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<WordScoreRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "wordId","totalScore","correctAttempts","totalAttempts" FROM "word_scores" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(r#" AND "wordId" IN ("#);
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| WordScoreRow {
                word_id: row.try_get("wordId").unwrap_or_default(),
                total_score: row.try_get::<f64, _>("totalScore").unwrap_or(0.0),
                correct_attempts: row.try_get::<i64, _>("correctAttempts").unwrap_or(0),
                total_attempts: row.try_get::<i64, _>("totalAttempts").unwrap_or(0),
            })
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "wordId","totalScore","correctAttempts","totalAttempts" FROM "word_scores" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(" AND \"wordId\" IN (");
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| WordScoreRow {
                word_id: row.try_get("wordId").unwrap_or_default(),
                total_score: row.try_get::<f64, _>("totalScore").unwrap_or(0.0),
                correct_attempts: row.try_get::<i32, _>("correctAttempts").unwrap_or(0) as i64,
                total_attempts: row.try_get::<i32, _>("totalAttempts").unwrap_or(0) as i64,
            })
            .collect())
    }
}

async fn select_word_frequencies(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_ids: &[String],
) -> Result<Vec<WordFrequencyRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "word_id","frequency_score" FROM "word_frequency" WHERE "word_id" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| WordFrequencyRow {
                word_id: row.try_get("word_id").unwrap_or_default(),
                frequency_score: row.try_get::<f64, _>("frequency_score").unwrap_or(0.5),
            })
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "word_id", ("frequency_score")::float8 as "frequency_score" FROM "word_frequency" WHERE "word_id" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| WordFrequencyRow {
                word_id: row.try_get("word_id").unwrap_or_default(),
                frequency_score: row.try_get::<f64, _>("frequency_score").unwrap_or(0.5),
            })
            .collect())
    }
}

async fn select_learning_state_difficulty_rows(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<LearningStateDifficultyRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "wordId","lastReviewDate","reviewCount" FROM "word_learning_states" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(r#" AND "wordId" IN ("#);
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| {
                let last_raw: Option<String> = row.try_get("lastReviewDate").ok();
                let last_review_ms = last_raw.as_deref().and_then(crate::auth::parse_sqlite_datetime_ms);
                LearningStateDifficultyRow {
                    word_id: row.try_get("wordId").unwrap_or_default(),
                    last_review_ms,
                    review_count: row.try_get::<i64, _>("reviewCount").unwrap_or(0),
                }
            })
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "wordId","lastReviewDate","reviewCount" FROM "word_learning_states" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(" AND \"wordId\" IN (");
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| {
                let last_dt: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
                let last_review_ms = last_dt.map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis());
                LearningStateDifficultyRow {
                    word_id: row.try_get("wordId").unwrap_or_default(),
                    last_review_ms,
                    review_count: row.try_get::<i32, _>("reviewCount").unwrap_or(0) as i64,
                }
            })
            .collect())
    }
}

async fn select_learned_word_ids(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let rows = sqlx::query(r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = ?"#)
            .bind(user_id)
            .fetch_all(&pool)
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("wordId").ok())
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let rows = sqlx::query(r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_all(&pool)
            .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("wordId").ok())
            .collect())
    }
}

async fn select_learned_word_set(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashSet<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(HashSet::new());
    }
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(HashSet::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(r#" AND "wordId" IN ("#);
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("wordId").ok())
            .collect())
    } else {
        let Some(pool) = primary else { return Ok(HashSet::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = "#,
        );
        qb.push_bind(user_id);
        qb.push(" AND \"wordId\" IN (");
        {
            let mut sep = qb.separated(", ");
            for id in word_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>("wordId").ok())
            .collect())
    }
}

async fn select_candidate_words_from_word_books(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    word_book_ids: &[String],
    exclude_ids: &[String],
    study_mode: &str,
    take: usize,
) -> Result<Vec<WordBase>, sqlx::Error> {
    if word_book_ids.is_empty() || take == 0 {
        return Ok(Vec::new());
    }

    let random = study_mode != "sequential";

    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Sqlite>::new(
            r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl" FROM "words" WHERE "wordBookId" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_book_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        if !exclude_ids.is_empty() {
            qb.push(" AND \"id\" NOT IN (");
            {
                let mut sep = qb.separated(", ");
                for id in exclude_ids { sep.push_bind(id); }
                sep.push_unseparated(")");
            }
        }
        if random {
            qb.push(" ORDER BY RANDOM()");
        } else {
            qb.push(" ORDER BY \"createdAt\" ASC");
        }
        qb.push(" LIMIT ");
        qb.push_bind(take as i64);
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows.into_iter().map(map_sqlite_word_row).collect())
    } else {
        let Some(pool) = primary else { return Ok(Vec::new()) };
        let mut qb = QueryBuilder::<sqlx::Postgres>::new(
            r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl" FROM "words" WHERE "wordBookId" IN ("#,
        );
        {
            let mut sep = qb.separated(", ");
            for id in word_book_ids { sep.push_bind(id); }
            sep.push_unseparated(")");
        }
        if !exclude_ids.is_empty() {
            qb.push(" AND \"id\" NOT IN (");
            {
                let mut sep = qb.separated(", ");
                for id in exclude_ids { sep.push_bind(id); }
                sep.push_unseparated(")");
            }
        }
        if random {
            qb.push(" ORDER BY RANDOM()");
        } else {
            qb.push(" ORDER BY \"createdAt\" ASC");
        }
        qb.push(" LIMIT ");
        qb.push_bind(take as i64);
        let rows = qb.build().fetch_all(&pool).await?;
        Ok(rows.into_iter().map(map_postgres_word_row).collect())
    }
}

async fn select_learning_session(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
) -> Result<Option<LearningSessionRow>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(None) };
        let row = sqlx::query(
            r#"
            SELECT "targetMasteryCount","actualMasteryCount","totalQuestions","startedAt","endedAt"
            FROM "learning_sessions"
            WHERE "id" = ? AND "userId" = ?
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|row| {
            let started_raw: String = row.try_get("startedAt").unwrap_or_default();
            let ended_raw: Option<String> = row.try_get("endedAt").ok();
            LearningSessionRow {
                target_mastery_count: row.try_get::<i64, _>("targetMasteryCount").unwrap_or(0),
                actual_mastery_count: row.try_get::<i64, _>("actualMasteryCount").unwrap_or(0),
                total_questions: row.try_get::<i64, _>("totalQuestions").unwrap_or(0),
                started_at: format_sqlite_datetime(&started_raw),
                ended_at: ended_raw.as_deref().map(format_sqlite_datetime),
            }
        }))
    } else {
        let Some(pool) = primary else { return Ok(None) };
        let row = sqlx::query(
            r#"
            SELECT "targetMasteryCount","actualMasteryCount","totalQuestions","startedAt","endedAt"
            FROM "learning_sessions"
            WHERE "id" = $1 AND "userId" = $2
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        Ok(row.map(|row| {
            let started_at: NaiveDateTime = row.try_get("startedAt").unwrap_or_else(|_| Utc::now().naive_utc());
            let ended_at: Option<NaiveDateTime> = row.try_get("endedAt").ok();
            LearningSessionRow {
                target_mastery_count: row.try_get::<i32, _>("targetMasteryCount").unwrap_or(0) as i64,
                actual_mastery_count: row.try_get::<i32, _>("actualMasteryCount").unwrap_or(0) as i64,
                total_questions: row.try_get::<i32, _>("totalQuestions").unwrap_or(0) as i64,
                started_at: crate::auth::format_naive_datetime_iso_millis(started_at),
                ended_at: ended_at.map(crate::auth::format_naive_datetime_iso_millis),
            }
        }))
    }
}

async fn select_learning_session_any(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let primary = proxy.primary_pool().await;
    let fallback = proxy.fallback_pool().await;
    let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

    if use_fallback {
        let Some(pool) = fallback else { return Ok(None) };
        let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = ? LIMIT 1"#)
            .bind(session_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
    } else {
        let Some(pool) = primary else { return Ok(None) };
        let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = $1 LIMIT 1"#)
            .bind(session_id)
            .fetch_optional(&pool)
            .await?;
        Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
    }
}

async fn update_target_mastery(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
    target_mastery_count: i64,
) -> Result<(), SessionError> {
    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".to_string(), serde_json::Value::String(session_id.to_string()));
        where_clause.insert(
            "userId".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );
        let mut data = serde_json::Map::new();
        data.insert(
            "targetMasteryCount".to_string(),
            serde_json::Value::Number(target_mastery_count.into()),
        );

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "learning_sessions".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|err| SessionError::Mutation(err.to_string()))?;
        return Ok(());
    }

    let Some(primary) = proxy.primary_pool().await else {
        return Err(SessionError::Sql(sqlx::Error::PoolClosed));
    };
    sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "targetMasteryCount" = $1, "updatedAt" = $2
        WHERE "id" = $3 AND "userId" = $4
        "#,
    )
    .bind(target_mastery_count as i32)
    .bind(Utc::now().naive_utc())
    .bind(session_id)
    .bind(user_id)
    .execute(&primary)
    .await?;
    Ok(())
}

async fn create_learning_session(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    session_id: &str,
    user_id: &str,
    target_mastery_count: i64,
) -> Result<(), SessionError> {
    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("id".to_string(), serde_json::Value::String(session_id.to_string()));
        data.insert("userId".to_string(), serde_json::Value::String(user_id.to_string()));
        data.insert(
            "targetMasteryCount".to_string(),
            serde_json::Value::Number(target_mastery_count.into()),
        );
        data.insert("actualMasteryCount".to_string(), serde_json::Value::Number(0.into()));
        data.insert("totalQuestions".to_string(), serde_json::Value::Number(0.into()));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "learning_sessions".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy
            .write_operation(state, op)
            .await
            .map_err(|err| SessionError::Mutation(err.to_string()))?;
        return Ok(());
    }

    let Some(primary) = proxy.primary_pool().await else {
        return Err(SessionError::Sql(sqlx::Error::PoolClosed));
    };
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "learning_sessions"
          ("id","userId","targetMasteryCount","actualMasteryCount","totalQuestions","startedAt","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$6,$6)
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(target_mastery_count as i32)
    .bind(0_i32)
    .bind(0_i32)
    .bind(now)
    .execute(&primary)
    .await?;
    Ok(())
}

fn parse_json_string_array(raw: &str) -> Vec<String> {
    match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| match item {
                serde_json::Value::String(v) => Some(v),
                other => Some(other.to_string()),
            })
            .collect(),
        Ok(serde_json::Value::String(v)) => vec![v],
        _ => Vec::new(),
    }
}

fn map_postgres_word_row(row: sqlx::postgres::PgRow) -> WordBase {
    WordBase {
        id: row.try_get("id").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        meanings: row.try_get::<Vec<String>, _>("meanings").unwrap_or_default(),
        examples: row.try_get::<Vec<String>, _>("examples").unwrap_or_default(),
        audio_url: row.try_get::<Option<String>, _>("audioUrl").ok().flatten(),
    }
}

fn map_sqlite_word_row(row: sqlx::sqlite::SqliteRow) -> WordBase {
    let meanings_raw: String = row.try_get("meanings").unwrap_or_else(|_| "[]".to_string());
    let examples_raw: String = row.try_get("examples").unwrap_or_else(|_| "[]".to_string());
    WordBase {
        id: row.try_get("id").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        meanings: parse_json_string_array(&meanings_raw),
        examples: parse_json_string_array(&examples_raw),
        audio_url: row.try_get::<Option<String>, _>("audioUrl").ok().flatten(),
    }
}

fn format_sqlite_datetime(raw: &str) -> String {
    let ms = crate::auth::parse_sqlite_datetime_ms(raw)
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    crate::auth::format_timestamp_ms_iso_millis(ms).unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true))
}
