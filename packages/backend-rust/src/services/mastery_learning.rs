use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};

use crate::amas::types::StrategyParams as AmasStrategyParams;
use crate::amas::types::{SwdRecommendation, UserState as AmasUserState};
use crate::amas::AMASEngine;
use crate::db::operations::confusion_cache::find_confusable_words_batch;
use crate::db::operations::content::get_words_by_ids;
use crate::db::operations::get_amas_user_model;
use crate::db::DatabaseProxy;
use crate::services::amas::{
    compute_new_word_difficulty, map_difficulty_level, DifficultyRange, StrategyParams,
};
use crate::services::study_config::{get_or_create_user_study_config, UserStudyConfig};

fn convert_amas_strategy(s: AmasStrategyParams) -> StrategyParams {
    StrategyParams {
        interval_scale: s.interval_scale,
        new_ratio: s.new_ratio,
        difficulty: s.difficulty.as_str().to_string(),
        batch_size: s.batch_size,
        hint_level: s.hint_level,
    }
}

const MIN_CAP: i32 = 20;
const MAX_ADDITIONAL: f64 = 80.0;
const SWD_CONFIDENCE_THRESHOLD: f64 = 0.5;

pub fn compute_dynamic_cap(user_state: &AmasUserState) -> i32 {
    let effective_fatigue = user_state
        .fused_fatigue
        .unwrap_or(user_state.fatigue)
        .clamp(0.0, 1.0);
    let normalized_motivation = (user_state.motivation.clamp(-1.0, 1.0) + 1.0) / 2.0;

    let base_capacity = user_state.attention.clamp(0.0, 1.0) * 0.35
        + normalized_motivation * 0.30
        + user_state.cognitive.stability.clamp(0.0, 1.0) * 0.20
        + user_state.cognitive.speed.clamp(0.0, 1.0) * 0.15;

    let fatigue_penalty = effective_fatigue * 0.5;
    let net_capacity = (base_capacity - fatigue_penalty).max(0.0);
    let cap = MIN_CAP as f64 + net_capacity * MAX_ADDITIONAL;

    (cap.round() as i32).clamp(MIN_CAP, MIN_CAP + MAX_ADDITIONAL as i32)
}

pub fn compute_target_with_swd(
    user_target: i64,
    swd_recommendation: Option<&SwdRecommendation>,
    dynamic_cap: i32,
) -> i64 {
    match swd_recommendation {
        Some(rec) if rec.confidence >= SWD_CONFIDENCE_THRESHOLD && rec.recommended_count > 0 => {
            if user_target > dynamic_cap as i64 {
                return user_target;
            }
            let combined = user_target + rec.recommended_count as i64;
            combined.min(dynamic_cap as i64)
        }
        _ => user_target,
    }
}

fn clamp_batch_size(value: i64) -> usize {
    value.clamp(1, 20) as usize
}

fn effective_batch_size(requested: Option<i64>, strategy: &StrategyParams) -> usize {
    match requested {
        Some(count) => clamp_batch_size(count),
        None => clamp_batch_size(strategy.batch_size as i64),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Distractors {
    /// 看词选义：含正确答案的4个释义
    pub meaning_options: Vec<String>,
    /// 看义选词：含正确答案的4个拼写
    pub spelling_options: Vec<String>,
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distractors: Option<Distractors>,
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
    user_id: &str,
    target_count: Option<i64>,
    amas_engine: Option<&AMASEngine>,
) -> Result<MasteryStudyWordsResponse, sqlx::Error> {
    let start = std::time::Instant::now();

    let config = get_or_create_user_study_config(proxy, user_id).await?;
    tracing::info!(
        user_id = %user_id,
        elapsed_ms = start.elapsed().as_millis(),
        "get_words_for_mastery_mode: loaded config"
    );

    let user_target = target_count
        .or(Some(config.daily_mastery_target))
        .or(Some(config.daily_word_count))
        .unwrap_or(20);

    let (amas_strategy, user_state) = match amas_engine {
        Some(engine) => (
            Some(engine.get_current_strategy(user_id).await),
            engine.get_user_state(user_id).await,
        ),
        None => (None, None),
    };

    let strategy = amas_strategy
        .as_ref()
        .map(|s| convert_amas_strategy(s.clone()))
        .unwrap_or_else(|| futures::executor::block_on(load_user_strategy(proxy, user_id)));

    let target = match (&user_state, &amas_strategy) {
        (Some(state), Some(amas_s)) => {
            let dynamic_cap = compute_dynamic_cap(state);
            compute_target_with_swd(user_target, amas_s.swd_recommendation.as_ref(), dynamic_cap)
        }
        _ => user_target,
    };

    tracing::info!(
        user_id = %user_id,
        user_target = user_target,
        final_target = target,
        elapsed_ms = start.elapsed().as_millis(),
        "get_words_for_mastery_mode: loaded strategy"
    );
    let fetch_count =
        effective_batch_size(None, &strategy).min(usize::try_from(target.max(1)).unwrap_or(20));
    let words =
        fetch_words_with_strategy(proxy, user_id, fetch_count, &strategy, &[], &config).await?;

    tracing::info!(
        user_id = %user_id,
        word_count = words.len(),
        elapsed_ms = start.elapsed().as_millis(),
        "get_words_for_mastery_mode: completed"
    );

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
    user_id: &str,
    input: GetNextWordsInput,
    amas_engine: Option<&AMASEngine>,
) -> Result<NextWordsResponse, sqlx::Error> {
    let config = get_or_create_user_study_config(proxy, user_id).await?;
    let strategy = match amas_engine {
        Some(engine) => convert_amas_strategy(engine.get_current_strategy(user_id).await),
        None => load_user_strategy(proxy, user_id).await,
    };
    let batch_size = effective_batch_size(input.count, &strategy);
    tracing::info!(
        user_id = %user_id,
        strategy = ?strategy,
        batch_size = batch_size,
        "get_next_words: using AMAS strategy"
    );

    let mut exclude: HashSet<String> = HashSet::new();
    for id in input
        .current_word_ids
        .iter()
        .chain(input.mastered_word_ids.iter())
    {
        exclude.insert(id.clone());
    }
    let exclude_ids: Vec<String> = exclude.into_iter().collect();

    let words =
        fetch_words_with_strategy(proxy, user_id, batch_size, &strategy, &exclude_ids, &config)
            .await?;
    let reason = explain_word_selection(&strategy, &words);

    Ok(NextWordsResponse {
        words,
        strategy,
        reason,
    })
}

pub async fn adjust_words_for_user(
    proxy: &DatabaseProxy,
    input: AdjustWordsInput,
) -> Result<AdjustWordsResponse, sqlx::Error> {
    let user_id = input.user_id.as_str();
    let config = get_or_create_user_study_config(proxy, user_id).await?;

    let target = compute_target_difficulty(
        &input.user_state,
        &input.recent_performance,
        &input.adjust_reason,
    );
    let next_check_in = compute_next_check_in(&input.recent_performance, input.user_state.as_ref());

    let difficulty_map = batch_compute_difficulty(proxy, user_id, &input.current_word_ids).await?;

    let mastered_set: HashSet<&str> = input
        .mastered_word_ids
        .iter()
        .map(|id| id.as_str())
        .collect();
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
    for id in input
        .current_word_ids
        .iter()
        .chain(input.mastered_word_ids.iter())
    {
        exclude.insert(id.clone());
    }
    let exclude_ids: Vec<String> = exclude.into_iter().collect();

    let mut candidates =
        fetch_words_in_difficulty_range(proxy, user_id, target, &exclude_ids, desired_add, &config)
            .await?;

    if candidates.len() < desired_add {
        candidates = fetch_words_in_difficulty_range(
            proxy,
            user_id,
            DifficultyRange { min: 0.0, max: 1.0 },
            &exclude_ids,
            desired_add,
            &config,
        )
        .await?;
    }

    let reason_text = adjust_reason_text(
        &input.adjust_reason,
        input.user_state.as_ref(),
        &input.recent_performance,
    );

    Ok(AdjustWordsResponse {
        adjustments: Adjustments {
            remove,
            add: candidates.clone(),
        },
        target_difficulty: DifficultyRangeResponse {
            min: target.min,
            max: target.max,
        },
        reason: reason_text,
        adjustment_reason: input.adjust_reason,
        trigger_conditions: TriggerConditions {
            performance: input.recent_performance,
            user_state: input.user_state,
            target_difficulty: DifficultyRangeResponse {
                min: target.min,
                max: target.max,
            },
        },
        next_check_in,
    })
}

pub async fn sync_session_progress(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
    actual_mastery_count: i64,
    total_questions: i64,
    context_shifts: Option<i64>,
) -> Result<(), SessionError> {
    let exists = select_learning_session(proxy, session_id, user_id).await?;
    if exists.is_none() {
        return Err(SessionError::NotFound);
    }

    let pool = proxy.pool();
    sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "actualMasteryCount" = GREATEST(COALESCE("actualMasteryCount", 0), $1),
            "totalQuestions" = GREATEST(COALESCE("totalQuestions", 0), $2),
            "contextShifts" = GREATEST(COALESCE("contextShifts", 0), $3),
            "updatedAt" = $4
        WHERE "id" = $5 AND "userId" = $6
        "#,
    )
    .bind(actual_mastery_count as i32)
    .bind(total_questions as i32)
    .bind(context_shifts.unwrap_or(0).max(0) as i32)
    .bind(Utc::now().naive_utc())
    .bind(session_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn ensure_learning_session(
    proxy: &DatabaseProxy,
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
        let existing_any = select_learning_session_any(proxy, &session_id).await?;
        if let Some(existing_user) = existing_any {
            if existing_user != user_id {
                return Err(SessionError::Forbidden);
            }
            update_target_mastery(proxy, &session_id, user_id, target_mastery_count).await?;
            // Keep at most one active session per user to avoid "a bunch of in-progress sessions"
            // caused by previous client bugs / crashes.
            close_other_active_sessions(proxy, user_id, &session_id).await?;
            return Ok(session_id);
        }
    }

    let new_id = uuid::Uuid::new_v4().to_string();
    create_learning_session(proxy, &new_id, user_id, target_mastery_count).await?;
    close_other_active_sessions(proxy, user_id, &new_id).await?;
    Ok(new_id)
}

pub async fn get_session_progress(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<SessionProgressResponse, SessionError> {
    let Some(session) = select_learning_session(proxy, session_id, user_id).await? else {
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
    user_id: &str,
    count: usize,
    strategy: &StrategyParams,
    exclude_ids: &[String],
    config: &UserStudyConfig,
) -> Result<Vec<LearningWord>, sqlx::Error> {
    let start = std::time::Instant::now();

    let mut due_words = get_due_words_with_priority(proxy, user_id, exclude_ids).await?;
    tracing::info!(
        user_id = %user_id,
        due_words_count = due_words.len(),
        elapsed_ms = start.elapsed().as_millis(),
        "fetch_words_with_strategy: due words loaded"
    );

    let difficulty_range = map_difficulty_level(&strategy.difficulty);

    // 复习词按难度偏好+优先级排序（优先选择符合策略难度的词，但不硬性过滤）
    due_words.sort_by(|a, b| {
        let a_in_range =
            a.difficulty >= difficulty_range.min && a.difficulty <= difficulty_range.max;
        let b_in_range =
            b.difficulty >= difficulty_range.min && b.difficulty <= difficulty_range.max;

        match (a_in_range, b_in_range) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => b
                .priority
                .partial_cmp(&a.priority)
                .unwrap_or(std::cmp::Ordering::Equal),
        }
    });

    let review_count = ((count as f64) * (1.0 - strategy.new_ratio)).ceil() as usize;
    let new_count = count.saturating_sub(review_count);

    let review_words: Vec<DueWord> = due_words.into_iter().take(review_count).collect();
    let actual_new = new_count.max(count.saturating_sub(review_words.len()));

    tracing::info!(
        user_id = %user_id,
        review_words_count = review_words.len(),
        actual_new = actual_new,
        "fetch_words_with_strategy: review/new split"
    );

    let mut combined_exclude: Vec<String> = exclude_ids.to_vec();
    combined_exclude.extend(review_words.iter().map(|w| w.word.id.clone()));

    // 新词仍然按难度过滤
    let new_words = fetch_new_words_in_range(
        proxy,
        user_id,
        actual_new,
        difficulty_range,
        &combined_exclude,
        config,
    )
    .await?;

    tracing::info!(
        user_id = %user_id,
        new_words_count = new_words.len(),
        elapsed_ms = start.elapsed().as_millis(),
        "fetch_words_with_strategy: new words loaded"
    );

    let mut out: Vec<LearningWord> = Vec::new();
    for w in review_words {
        out.push(word_to_learning_word(w.word, false, w.difficulty, None));
    }
    for w in new_words {
        out.push(w);
    }

    // Fetch distractor pools in parallel
    let out_ids: Vec<String> = out.iter().map(|w| w.id.clone()).collect();
    let mut all_exclude: Vec<String> = exclude_ids.to_vec();
    all_exclude.extend(out_ids);

    let distractor_fut = fetch_distractor_pool_words(proxy, user_id, &all_exclude, 20);
    let semantic_fut = fetch_semantic_distractor_pool(proxy, &out);
    let (distractor_pool, semantic_result) = tokio::join!(distractor_fut, semantic_fut);
    let distractor_pool = distractor_pool?;
    let semantic_pool = semantic_result.unwrap_or_default();

    tracing::info!(
        user_id = %user_id,
        elapsed_ms = start.elapsed().as_millis(),
        "fetch_words_with_strategy: distractors loaded"
    );

    populate_distractors(&mut out, &distractor_pool, &semantic_pool);
    Ok(out)
}

async fn get_due_words_with_priority(
    proxy: &DatabaseProxy,
    user_id: &str,
    exclude_ids: &[String],
) -> Result<Vec<DueWord>, sqlx::Error> {
    let now_ms = Utc::now().timestamp_millis();
    let word_states = select_due_word_states(proxy, user_id, now_ms, exclude_ids).await?;
    if word_states.is_empty() {
        return Ok(Vec::new());
    }

    let word_ids: Vec<String> = word_states.iter().map(|s| s.word_id.clone()).collect();
    let (words, scores) = tokio::try_join!(
        select_words_by_ids(proxy, &word_ids),
        select_word_scores(proxy, user_id, &word_ids),
    )?;

    let score_map: HashMap<&str, &WordScoreRow> =
        scores.iter().map(|s| (s.word_id.as_str(), s)).collect();
    let word_map: HashMap<&str, &WordBase> = words.iter().map(|w| (w.id.as_str(), w)).collect();

    // Get user Elo for ZPD calculation
    let user_elo = crate::services::elo::get_user_elo(proxy, user_id)
        .await
        .unwrap_or(1200.0);
    let zpd_config = crate::services::zpd::ZPDConfig::default();

    // Bulk load word Elos to avoid N+1 queries
    let word_elo_map = crate::services::elo::get_word_elos_bulk(proxy, &word_ids)
        .await
        .unwrap_or_default();

    let mut results = Vec::new();
    for state_row in word_states {
        let Some(word) = word_map.get(state_row.word_id.as_str()) else {
            continue;
        };

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

        let base_priority = overdue_days.min(8.0) * 5.0
            + if error_rate > 0.5 {
                30.0
            } else {
                error_rate * 60.0
            }
            + total_score.map(|v| (100.0 - v) * 0.3).unwrap_or(30.0);

        // Apply ZPD adjustment to priority
        let word_elo = word_elo_map
            .get(&state_row.word_id)
            .copied()
            .unwrap_or(1200.0);
        let priority =
            crate::services::zpd::adjust_priority(base_priority, user_elo, word_elo, &zpd_config);

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
    user_id: &str,
    count: usize,
    difficulty_range: DifficultyRange,
    exclude_ids: &[String],
    config: &UserStudyConfig,
) -> Result<Vec<LearningWord>, sqlx::Error> {
    if count == 0 {
        tracing::debug!(user_id = %user_id, "fetch_new_words_in_range: count is 0, returning empty");
        return Ok(Vec::new());
    }

    if config.selected_word_book_ids.is_empty() {
        tracing::warn!(user_id = %user_id, "fetch_new_words_in_range: no word books selected, returning empty");
        return Ok(Vec::new());
    }

    tracing::debug!(
        user_id = %user_id,
        word_book_ids = ?config.selected_word_book_ids,
        count = count,
        "fetch_new_words_in_range: fetching candidates"
    );

    let learned_ids = select_learned_word_ids(proxy, user_id).await?;
    let mut excluded: HashSet<String> = exclude_ids.iter().cloned().collect();
    excluded.extend(learned_ids.clone());
    let excluded_ids: Vec<String> = excluded.into_iter().collect();

    tracing::debug!(
        user_id = %user_id,
        learned_count = learned_ids.len(),
        excluded_count = excluded_ids.len(),
        "fetch_new_words_in_range: exclusions"
    );

    let take = (count * 2).max(1);
    let mut candidates = select_candidate_words_from_word_books(
        proxy,
        &config.selected_word_book_ids,
        &excluded_ids,
        &config.study_mode,
        take,
    )
    .await?;

    tracing::info!(
        user_id = %user_id,
        candidate_count = candidates.len(),
        "fetch_new_words_in_range: candidates fetched"
    );

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
                distractors: None,
            }
        })
        .collect();

    let mut filtered: Vec<LearningWord> = with_diff
        .iter()
        .filter(|&w| w.difficulty >= difficulty_range.min && w.difficulty <= difficulty_range.max)
        .cloned()
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
    user_id: &str,
    range: DifficultyRange,
    exclude_ids: &[String],
    count: usize,
    config: &UserStudyConfig,
) -> Result<Vec<LearningWord>, sqlx::Error> {
    if config.selected_word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let fetch_limit = (count * 3).max(15);
    let candidates = select_candidate_words_from_word_books(
        proxy,
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
    let learned_set = select_learned_word_set(proxy, user_id, &candidate_ids).await?;
    let difficulty_map = batch_compute_difficulty(proxy, user_id, &candidate_ids).await?;

    let mut result: Vec<LearningWord> = candidates
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
                distractors: None,
            }
        })
        .filter(|w| w.difficulty >= range.min && w.difficulty <= range.max)
        .take(count)
        .collect();

    // Fetch distractor pool and populate distractors
    let result_ids: Vec<String> = result.iter().map(|w| w.id.clone()).collect();
    let mut all_exclude: Vec<String> = exclude_ids.to_vec();
    all_exclude.extend(result_ids);
    let distractor_pool = fetch_distractor_pool_words(proxy, user_id, &all_exclude, 20).await?;
    let semantic_pool = fetch_semantic_distractor_pool(proxy, &result)
        .await
        .unwrap_or_default();
    populate_distractors(&mut result, &distractor_pool, &semantic_pool);

    Ok(result)
}

async fn batch_compute_difficulty(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, f64>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let (words, scores, freqs, states) = tokio::try_join!(
        select_word_spellings(proxy, word_ids),
        select_word_scores(proxy, user_id, word_ids),
        select_word_frequencies(proxy, word_ids),
        select_learning_state_difficulty_rows(proxy, user_id, word_ids),
    )?;

    let score_map: HashMap<&str, &WordScoreRow> =
        scores.iter().map(|s| (s.word_id.as_str(), s)).collect();
    let freq_map: HashMap<&str, f64> = freqs
        .iter()
        .map(|f| (f.word_id.as_str(), f.frequency_score))
        .collect();
    let state_map: HashMap<&str, &LearningStateDifficultyRow> =
        states.iter().map(|s| (s.word_id.as_str(), s)).collect();

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
                    .map(|last| {
                        calculate_forgetting_factor(now_ms, last, state_row.review_count, accuracy)
                    })
                    .unwrap_or(0.5);
                (1.0 - retention).clamp(0.0, 1.0)
            }
            _ => 0.5,
        };

        let difficulty = (0.2 * length_factor
            + 0.4 * (1.0 - accuracy)
            + 0.2 * frequency_factor
            + 0.2 * forgetting_factor)
            .clamp(0.0, 1.0);

        out.insert(word.id, difficulty);
    }

    Ok(out)
}

fn calculate_forgetting_factor(
    now_ms: i64,
    last_review_ms: i64,
    review_count: i64,
    average_accuracy: f64,
) -> f64 {
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
    let motivation = user_state
        .as_ref()
        .and_then(|v| v.motivation)
        .unwrap_or(0.5);

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

fn adjust_reason_text(
    reason: &str,
    user_state: Option<&UserState>,
    performance: &RecentPerformance,
) -> String {
    match reason {
        "fatigue" => format!(
            "检测到疲劳度较高({}%)，已切换为简单词汇",
            ((user_state.and_then(|s| s.fatigue).unwrap_or(0.0)) * 100.0).round() as i64
        ),
        "struggling" => format!(
            "连续{}次错误，已降低难度",
            performance.consecutive_wrong.round() as i64
        ),
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

/// Simplifies a meaning by taking only the first part (before ；/;/、)
fn simplify_meaning(meaning: &str) -> String {
    let trimmed = meaning.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }
    // Split by Chinese/English semicolons and enumeration comma
    for c in ['；', ';', '、'] {
        if let Some(pos) = trimmed.find(c) {
            let first_part = trimmed[..pos].trim();
            if !first_part.is_empty() {
                return first_part.to_string();
            }
        }
    }
    trimmed.to_string()
}

/// Fisher-Yates shuffle with internal RNG
fn shuffle_vec<T>(items: &mut [T]) {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let state = RandomState::new();
    let mut hasher = state.build_hasher();
    hasher.write_usize(items.len());
    let mut seed = hasher.finish();

    for i in (1..items.len()).rev() {
        // Simple LCG
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let j = (seed as usize) % (i + 1);
        items.swap(i, j);
    }
}

/// Generates distractors for a word given the pool of other words.
/// Pool order is preserved (semantic distractors first), only final options are shuffled.
fn generate_distractors_for_word(word: &LearningWord, pool: &[LearningWord]) -> Distractors {
    const NUM_OPTIONS: usize = 4;
    const FALLBACK_MEANINGS: &[&str] = &["未知释义", "其他含义", "暂无解释", "无此选项"];
    const FALLBACK_SPELLINGS: &[&str] = &["unknown", "other", "none", "N/A"];

    // --- Meaning options (word-to-meaning) ---
    let correct_meaning = word
        .meanings
        .first()
        .map(|m| simplify_meaning(m))
        .unwrap_or_default();

    // Preserve pool order, deduplicate via seen set
    let mut seen_meanings: HashSet<String> = HashSet::new();
    seen_meanings.insert(correct_meaning.clone());
    let meaning_candidates: Vec<String> = pool
        .iter()
        .filter(|w| w.id != word.id)
        .flat_map(|w| w.meanings.iter())
        .map(|m| simplify_meaning(m))
        .filter(|m| !m.is_empty() && seen_meanings.insert(m.clone()))
        .collect();

    let needed = NUM_OPTIONS.saturating_sub(1);
    let mut distractors_m: Vec<String> = meaning_candidates.into_iter().take(needed).collect();

    // Fill with fallbacks if not enough
    if distractors_m.len() < needed {
        for fb in FALLBACK_MEANINGS {
            if distractors_m.len() >= needed {
                break;
            }
            let s = (*fb).to_string();
            if s != correct_meaning && !distractors_m.contains(&s) {
                distractors_m.push(s);
            }
        }
    }

    let mut meaning_options: Vec<String> =
        std::iter::once(correct_meaning).chain(distractors_m).collect();
    shuffle_vec(&mut meaning_options);

    // --- Spelling options (meaning-to-word) ---
    let correct_spelling = word.spelling.clone();

    // Preserve pool order, deduplicate via seen set
    let mut seen_spellings: HashSet<String> = HashSet::new();
    seen_spellings.insert(correct_spelling.clone());
    let spelling_candidates: Vec<String> = pool
        .iter()
        .filter(|w| w.id != word.id)
        .map(|w| w.spelling.clone())
        .filter(|s| !s.is_empty() && seen_spellings.insert(s.clone()))
        .collect();

    let mut distractors_s: Vec<String> = spelling_candidates.into_iter().take(needed).collect();

    if distractors_s.len() < needed {
        for fb in FALLBACK_SPELLINGS {
            if distractors_s.len() >= needed {
                break;
            }
            let s = (*fb).to_string();
            if s != correct_spelling && !distractors_s.contains(&s) {
                distractors_s.push(s);
            }
        }
    }

    let mut spelling_options: Vec<String> = std::iter::once(correct_spelling)
        .chain(distractors_s)
        .collect();
    shuffle_vec(&mut spelling_options);

    Distractors {
        meaning_options,
        spelling_options,
    }
}

/// Populates distractors for all words using provided pools.
/// For each word, builds a per-word pool: semantic distractors first (if available),
/// then random pool, then other words as fallback.
fn populate_distractors(
    words: &mut [LearningWord],
    random_pool: &[LearningWord],
    semantic_pool: &HashMap<String, Vec<LearningWord>>,
) {
    // Clone words once upfront for fallback usage
    let words_clone: Vec<LearningWord> = words.to_vec();

    for word in words.iter_mut() {
        // Build per-word pool: semantic first, then random, then other words
        let mut pool: Vec<LearningWord> = Vec::new();
        let mut pool_ids: HashSet<String> = HashSet::new();
        pool_ids.insert(word.id.clone()); // Exclude self

        // 1. Add semantic distractors first (already sorted by distance)
        if let Some(semantic_words) = semantic_pool.get(&word.id) {
            for w in semantic_words {
                if pool_ids.insert(w.id.clone()) {
                    pool.push(w.clone());
                }
            }
        }

        // 2. Add random pool (excluding duplicates)
        for w in random_pool {
            if pool_ids.insert(w.id.clone()) {
                pool.push(w.clone());
            }
        }

        // 3. Add other target words as fallback (excluding duplicates)
        for w in &words_clone {
            if pool_ids.insert(w.id.clone()) {
                pool.push(w.clone());
            }
        }

        word.distractors = Some(generate_distractors_for_word(word, &pool));
    }
}

fn word_to_learning_word(
    word: WordBase,
    is_new: bool,
    difficulty: f64,
    distractors: Option<Distractors>,
) -> LearningWord {
    LearningWord {
        id: word.id,
        spelling: word.spelling,
        phonetic: word.phonetic,
        meanings: word.meanings,
        examples: word.examples,
        audio_url: word.audio_url,
        is_new,
        difficulty,
        distractors,
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

pub async fn load_user_strategy(proxy: &DatabaseProxy, user_id: &str) -> StrategyParams {
    match get_amas_user_model(proxy, user_id, "strategy").await {
        Ok(Some(model)) => serde_json::from_value(model.parameters).unwrap_or_else(|_| {
            tracing::debug!(user_id = %user_id, "AMAS strategy parse failed, using default");
            StrategyParams::default_strategy()
        }),
        Ok(None) => {
            tracing::info!(user_id = %user_id, "No AMAS strategy found, using default");
            StrategyParams::default_strategy()
        }
        Err(e) => {
            tracing::warn!(user_id = %user_id, error = %e, "Failed to load AMAS strategy, using default");
            StrategyParams::default_strategy()
        }
    }
}

#[cfg(test)]
mod batch_size_tests {
    use super::{effective_batch_size, StrategyParams};

    fn make_strategy(batch_size: i32) -> StrategyParams {
        StrategyParams {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: "mid".to_string(),
            batch_size,
            hint_level: 1,
        }
    }

    #[test]
    fn uses_requested_count_when_provided() {
        let strategy = make_strategy(8);
        assert_eq!(effective_batch_size(Some(5), &strategy), 5);
    }

    #[test]
    fn clamps_requested_count_to_range() {
        let strategy = make_strategy(8);
        assert_eq!(effective_batch_size(Some(-5), &strategy), 1);
        assert_eq!(effective_batch_size(Some(0), &strategy), 1);
        assert_eq!(effective_batch_size(Some(1), &strategy), 1);
        assert_eq!(effective_batch_size(Some(20), &strategy), 20);
        assert_eq!(effective_batch_size(Some(21), &strategy), 20);
        assert_eq!(effective_batch_size(Some(100), &strategy), 20);
    }

    #[test]
    fn defaults_to_strategy_batch_size_when_missing() {
        let strategy = make_strategy(9);
        assert_eq!(effective_batch_size(None, &strategy), 9);
    }

    #[test]
    fn clamps_strategy_batch_size_to_range() {
        assert_eq!(effective_batch_size(None, &make_strategy(-3)), 1);
        assert_eq!(effective_batch_size(None, &make_strategy(0)), 1);
        assert_eq!(effective_batch_size(None, &make_strategy(1)), 1);
        assert_eq!(effective_batch_size(None, &make_strategy(20)), 20);
        assert_eq!(effective_batch_size(None, &make_strategy(21)), 20);
        assert_eq!(effective_batch_size(None, &make_strategy(999)), 20);
    }
}

async fn select_due_word_states(
    proxy: &DatabaseProxy,
    user_id: &str,
    now_ms: i64,
    exclude_ids: &[String],
) -> Result<Vec<WordStateRow>, sqlx::Error> {
    let pool = proxy.pool();
    let now_dt = DateTime::<Utc>::from_timestamp_millis(now_ms)
        .unwrap_or_else(Utc::now)
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
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let word_id: String = row.try_get("wordId").ok()?;
            let next_dt: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
            let next_ms = next_dt
                .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis());
            Some(WordStateRow {
                word_id,
                next_review_ms: next_ms,
            })
        })
        .collect())
}

async fn select_words_by_ids(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<WordBase>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
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
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_postgres_word_row).collect())
}

async fn select_word_spellings(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<WordSpellingRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "id","spelling" FROM "words" WHERE "id" IN ("#,
    );
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let rows = qb.build().fetch_all(pool).await?;
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

async fn select_word_scores(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<WordScoreRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "wordId","totalScore","correctAttempts","totalAttempts" FROM "word_scores" WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let rows = qb.build().fetch_all(pool).await?;
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

async fn select_word_frequencies(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<WordFrequencyRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "word_id", ("frequency_score")::float8 as "frequency_score" FROM "word_frequency" WHERE "word_id" IN ("#,
    );
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| WordFrequencyRow {
            word_id: row.try_get("word_id").unwrap_or_default(),
            frequency_score: row.try_get::<f64, _>("frequency_score").unwrap_or(0.5),
        })
        .collect())
}

async fn select_learning_state_difficulty_rows(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<Vec<LearningStateDifficultyRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "wordId","lastReviewDate","reviewCount" FROM "word_learning_states" WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let last_dt: Option<NaiveDateTime> = row.try_get("lastReviewDate").ok();
            let last_review_ms = last_dt
                .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis());
            LearningStateDifficultyRow {
                word_id: row.try_get("wordId").unwrap_or_default(),
                last_review_ms,
                review_count: row.try_get::<i32, _>("reviewCount").unwrap_or(0) as i64,
            }
        })
        .collect())
}

async fn select_learned_word_ids(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = $1"#)
        .bind(user_id)
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("wordId").ok())
        .collect())
}

async fn select_learned_word_set(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashSet<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(HashSet::new());
    }
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "wordId" FROM "word_learning_states" WHERE "userId" = "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    {
        let mut sep = qb.separated(", ");
        for id in word_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("wordId").ok())
        .collect())
}

async fn select_candidate_words_from_word_books(
    proxy: &DatabaseProxy,
    word_book_ids: &[String],
    exclude_ids: &[String],
    study_mode: &str,
    take: usize,
) -> Result<Vec<WordBase>, sqlx::Error> {
    if word_book_ids.is_empty() || take == 0 {
        return Ok(Vec::new());
    }

    let random = study_mode != "sequential";
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl" FROM "words" WHERE "wordBookId" IN ("#,
    );
    {
        let mut sep = qb.separated(", ");
        for id in word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    if !exclude_ids.is_empty() {
        qb.push(" AND \"id\" NOT IN (");
        {
            let mut sep = qb.separated(", ");
            for id in exclude_ids {
                sep.push_bind(id);
            }
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
    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.into_iter().map(map_postgres_word_row).collect())
}

/// Fetch random words for distractor pool (not for learning, just for generating options)
async fn fetch_distractor_pool_words(
    proxy: &DatabaseProxy,
    user_id: &str,
    exclude_ids: &[String],
    count: usize,
) -> Result<Vec<LearningWord>, sqlx::Error> {
    const DISTRACTOR_POOL_SIZE: usize = 20;
    let take = count.max(DISTRACTOR_POOL_SIZE);

    let config = get_or_create_user_study_config(proxy, user_id).await?;

    let candidates = if config.selected_word_book_ids.is_empty() {
        // Fallback: fetch from all user-accessible word books
        select_random_words_for_distractors(proxy, user_id, exclude_ids, take).await?
    } else {
        select_candidate_words_from_word_books(
            proxy,
            &config.selected_word_book_ids,
            exclude_ids,
            "random",
            take,
        )
        .await?
    };

    Ok(candidates
        .into_iter()
        .map(|w| LearningWord {
            id: w.id,
            spelling: w.spelling,
            phonetic: w.phonetic,
            meanings: w.meanings,
            examples: w.examples,
            audio_url: w.audio_url,
            is_new: false,
            difficulty: 0.5,
            distractors: None,
        })
        .collect())
}

/// Fallback: fetch random words from all word books for distractors
async fn select_random_words_for_distractors(
    proxy: &DatabaseProxy,
    _user_id: &str,
    exclude_ids: &[String],
    take: usize,
) -> Result<Vec<WordBase>, sqlx::Error> {
    if take == 0 {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT "id","spelling","phonetic","meanings","examples","audioUrl" FROM "words" WHERE 1=1"#,
    );

    if !exclude_ids.is_empty() {
        qb.push(" AND \"id\" NOT IN (");
        let mut sep = qb.separated(", ");
        for id in exclude_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }

    qb.push(" ORDER BY RANDOM() LIMIT ");
    qb.push_bind(take as i64);

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| WordBase {
            id: row.try_get("id").unwrap_or_default(),
            spelling: row.try_get("spelling").unwrap_or_default(),
            phonetic: row.try_get("phonetic").ok().flatten().unwrap_or_default(),
            meanings: row
                .try_get::<Vec<String>, _>("meanings")
                .unwrap_or_default(),
            examples: row
                .try_get::<Vec<String>, _>("examples")
                .unwrap_or_default(),
            audio_url: row.try_get("audioUrl").ok().flatten(),
        })
        .collect())
}

/// Fetch semantic distractor pool from confusion_pairs_cache.
/// Returns a map of target_word_id -> Vec<LearningWord> (confusable words sorted by distance).
async fn fetch_semantic_distractor_pool(
    proxy: &DatabaseProxy,
    target_words: &[LearningWord],
) -> Result<HashMap<String, Vec<LearningWord>>, sqlx::Error> {
    const SEMANTIC_THRESHOLD: f64 = 0.5;
    const PER_WORD_LIMIT: usize = 10;

    if target_words.is_empty() {
        return Ok(HashMap::new());
    }

    let word_ids: Vec<String> = target_words.iter().map(|w| w.id.clone()).collect();
    let confusable_map =
        find_confusable_words_batch(proxy, &word_ids, SEMANTIC_THRESHOLD, PER_WORD_LIMIT).await?;

    if confusable_map.is_empty() {
        return Ok(HashMap::new());
    }

    // Collect all unique confusable word IDs
    let all_confusable_ids: Vec<String> = confusable_map
        .values()
        .flat_map(|pairs| pairs.iter().map(|(id, _)| id.clone()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if all_confusable_ids.is_empty() {
        return Ok(HashMap::new());
    }

    // Batch fetch word data
    let words = get_words_by_ids(proxy, &all_confusable_ids).await?;
    let word_map: HashMap<&str, &crate::db::operations::content::Word> =
        words.iter().map(|w| (w.id.as_str(), w)).collect();

    // Build result map preserving distance order
    let mut result: HashMap<String, Vec<LearningWord>> = HashMap::new();
    for (target_id, pairs) in confusable_map {
        let mut semantic_words: Vec<LearningWord> = Vec::new();
        for (confusable_id, _distance) in pairs {
            if let Some(w) = word_map.get(confusable_id.as_str()) {
                semantic_words.push(LearningWord {
                    id: w.id.clone(),
                    spelling: w.spelling.clone(),
                    phonetic: w.phonetic.clone(),
                    meanings: w.meanings.clone(),
                    examples: w.examples.clone(),
                    audio_url: w.audio_url.clone(),
                    is_new: false,
                    difficulty: w.difficulty.unwrap_or(0.5),
                    distractors: None,
                });
            }
        }
        if !semantic_words.is_empty() {
            result.insert(target_id, semantic_words);
        }
    }

    Ok(result)
}

async fn select_learning_session(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
) -> Result<Option<LearningSessionRow>, sqlx::Error> {
    let pool = proxy.pool();
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
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| {
        let started_at: NaiveDateTime = row
            .try_get("startedAt")
            .unwrap_or_else(|_| Utc::now().naive_utc());
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

async fn select_learning_session_any(
    proxy: &DatabaseProxy,
    session_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(r#"SELECT "userId" FROM "learning_sessions" WHERE "id" = $1 LIMIT 1"#)
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|row| row.try_get::<String, _>("userId").ok()))
}

async fn update_target_mastery(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
    target_mastery_count: i64,
) -> Result<(), SessionError> {
    let pool = proxy.pool();
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
    .execute(pool)
    .await?;
    Ok(())
}

async fn create_learning_session(
    proxy: &DatabaseProxy,
    session_id: &str,
    user_id: &str,
    target_mastery_count: i64,
) -> Result<(), SessionError> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "learning_sessions"
          ("id","userId","startedAt","totalQuestions","actualMasteryCount","targetMasteryCount","sessionType","contextShifts","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7::"SessionType",$8,$9,$10)
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(now)
    .bind(0_i32)
    .bind(0_i32)
    .bind(target_mastery_count as i32)
    .bind("NORMAL")
    .bind(0_i32)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

async fn close_other_active_sessions(
    proxy: &DatabaseProxy,
    user_id: &str,
    keep_session_id: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        UPDATE "learning_sessions"
        SET "endedAt" = COALESCE("endedAt", $1),
            "updatedAt" = $2
        WHERE "userId" = $3
          AND "endedAt" IS NULL
          AND "id" <> $4
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(user_id)
    .bind(keep_session_id)
    .execute(pool)
    .await?;
    Ok(())
}

fn map_postgres_word_row(row: sqlx::postgres::PgRow) -> WordBase {
    WordBase {
        id: row.try_get("id").unwrap_or_default(),
        spelling: row.try_get("spelling").unwrap_or_default(),
        phonetic: row.try_get("phonetic").unwrap_or_default(),
        meanings: row
            .try_get::<Vec<String>, _>("meanings")
            .unwrap_or_default(),
        examples: row
            .try_get::<Vec<String>, _>("examples")
            .unwrap_or_default(),
        audio_url: row.try_get::<Option<String>, _>("audioUrl").ok().flatten(),
    }
}
