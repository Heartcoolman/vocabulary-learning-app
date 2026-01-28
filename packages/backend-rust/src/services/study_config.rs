use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;
use sqlx::{QueryBuilder, Row};

use crate::amas::types::StrategyParams as AmasStrategyParams;
use crate::amas::AMASEngine;
use crate::db::DatabaseProxy;
use crate::services::amas::{compute_new_word_difficulty, map_difficulty_level, StrategyParams};
use crate::services::mastery_learning::load_user_strategy;

fn convert_amas_strategy(s: AmasStrategyParams) -> StrategyParams {
    StrategyParams {
        interval_scale: s.interval_scale,
        new_ratio: s.new_ratio,
        difficulty: s.difficulty.as_str().to_string(),
        batch_size: s.batch_size,
        hint_level: s.hint_level,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStudyConfig {
    pub id: String,
    pub user_id: String,
    pub selected_word_book_ids: Vec<String>,
    pub daily_word_count: i64,
    pub study_mode: String,
    pub daily_mastery_target: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyWord {
    pub id: String,
    pub spelling: String,
    pub phonetic: String,
    pub meanings: Vec<String>,
    pub examples: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_url: Option<String>,
    pub word_book_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_new: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategySummary {
    pub difficulty: String,
    #[serde(rename = "newRatio")]
    pub new_ratio: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyProgress {
    pub today_studied: i64,
    pub today_target: i64,
    pub total_studied: i64,
    pub correct_rate: i64,
    pub weekly_trend: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayProgress {
    pub today_studied: i64,
    pub today_target: i64,
    pub total_studied: i64,
    pub correct_rate: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayWordsResponse {
    pub words: Vec<StudyWord>,
    pub progress: TodayProgress,
    pub strategy: StrategySummary,
}

#[derive(Debug, Clone)]
pub struct UpdateStudyConfigInput {
    pub selected_word_book_ids: Vec<String>,
    pub daily_word_count: i64,
    pub study_mode: String,
}

pub async fn get_or_create_user_study_config(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<UserStudyConfig, sqlx::Error> {
    if let Some(existing) = select_user_study_config(proxy, user_id).await? {
        return Ok(existing);
    }

    create_default_study_config(proxy, user_id).await?;
    Ok(select_user_study_config(proxy, user_id)
        .await?
        .unwrap_or_else(|| default_config_value(user_id)))
}

pub async fn update_user_study_config(
    proxy: &DatabaseProxy,
    user_id: &str,
    input: UpdateStudyConfigInput,
) -> Result<UserStudyConfig, StudyConfigUpdateError> {
    let accessible = select_accessible_word_book_ids(proxy, user_id, &input.selected_word_book_ids)
        .await
        .map_err(StudyConfigUpdateError::Sql)?;

    let accessible_set: HashSet<&str> = accessible.iter().map(|id| id.as_str()).collect();
    let unauthorized: Vec<String> = input
        .selected_word_book_ids
        .iter()
        .filter(|id| !accessible_set.contains(id.as_str()))
        .cloned()
        .collect();
    if !unauthorized.is_empty() {
        return Err(StudyConfigUpdateError::UnauthorizedWordBooks(unauthorized));
    }

    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "user_study_configs"
          ("id","userId","selectedWordBookIds","dailyWordCount","studyMode","dailyMasteryTarget","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("userId") DO UPDATE SET
          "selectedWordBookIds" = EXCLUDED."selectedWordBookIds",
          "dailyWordCount" = EXCLUDED."dailyWordCount",
          "studyMode" = EXCLUDED."studyMode",
          "dailyMasteryTarget" = EXCLUDED."dailyMasteryTarget",
          "updatedAt" = EXCLUDED."updatedAt"
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(&input.selected_word_book_ids)
    .bind(input.daily_word_count as i32)
    .bind(&input.study_mode)
    .bind(input.daily_word_count as i32)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(StudyConfigUpdateError::Sql)?;

    select_user_study_config(proxy, user_id)
        .await
        .map_err(StudyConfigUpdateError::Sql)?
        .ok_or_else(|| StudyConfigUpdateError::Sql(sqlx::Error::RowNotFound))
}

pub async fn get_today_words(
    proxy: &DatabaseProxy,
    user_id: &str,
    amas_engine: Option<&AMASEngine>,
) -> Result<TodayWordsResponse, sqlx::Error> {
    let config = get_or_create_user_study_config(proxy, user_id).await?;

    let strategy = match amas_engine {
        Some(engine) => convert_amas_strategy(engine.get_current_strategy(user_id).await),
        None => load_user_strategy(proxy, user_id).await,
    };
    let range = map_difficulty_level(&strategy.difficulty);

    let empty_progress = TodayProgress {
        today_studied: 0,
        today_target: config.daily_word_count,
        total_studied: 0,
        correct_rate: 0,
    };

    if config.selected_word_book_ids.is_empty() {
        return Ok(TodayWordsResponse {
            words: Vec::new(),
            progress: empty_progress.clone(),
            strategy: StrategySummary {
                difficulty: strategy.difficulty,
                new_ratio: strategy.new_ratio,
            },
        });
    }

    let accessible_ids =
        select_accessible_word_book_ids(proxy, user_id, &config.selected_word_book_ids).await?;
    if accessible_ids.is_empty() {
        return Ok(TodayWordsResponse {
            words: Vec::new(),
            progress: empty_progress.clone(),
            strategy: StrategySummary {
                difficulty: strategy.difficulty,
                new_ratio: strategy.new_ratio,
            },
        });
    }

    let learning_states = select_word_learning_states(proxy, user_id).await?;
    let state_word_ids: Vec<String> = learning_states.iter().map(|s| s.word_id.clone()).collect();

    let learned_words = if state_word_ids.is_empty() {
        Vec::new()
    } else {
        select_words_by_ids_and_word_books(proxy, &state_word_ids, &accessible_ids).await?
    };

    let mut word_by_id: HashMap<String, StudyWordBase> =
        HashMap::with_capacity(learned_words.len());
    for word in learned_words {
        word_by_id.insert(word.id.clone(), word);
    }

    let mut learned_states: Vec<LearnedStateWithWord> = Vec::new();
    for state_row in learning_states {
        let Some(word) = word_by_id.get(&state_row.word_id) else {
            continue;
        };
        learned_states.push(LearnedStateWithWord {
            state: state_row,
            word: word.clone(),
        });
    }

    let learned_word_ids: Vec<String> = learned_states
        .iter()
        .map(|s| s.state.word_id.clone())
        .collect();
    let score_map = select_word_score_map(proxy, user_id, &learned_word_ids).await?;

    let now_ms = Utc::now().timestamp_millis();
    let mut due_candidates: Vec<DueCandidate> = learned_states
        .into_iter()
        .filter_map(|entry| {
            let next_ms = entry.state.next_review_ms?;
            if next_ms > now_ms {
                return None;
            }

            let state = entry.state.state.as_str();
            let is_due_state = matches!(state, "LEARNING" | "REVIEWING")
                || (state == "NEW" && entry.state.review_count > 0);
            if !is_due_state {
                return None;
            }

            let score = score_map.get(entry.state.word_id.as_str());
            let overdue_days = ((now_ms - next_ms) as f64 / 86_400_000.0).max(0.0);
            let (error_rate, total_score, total_attempts) = match score {
                Some(s) if s.total_attempts > 0 => {
                    let accuracy = s.correct_attempts as f64 / s.total_attempts as f64;
                    (1.0 - accuracy, Some(s.total_score), s.total_attempts)
                }
                Some(s) => (0.0, Some(s.total_score), s.total_attempts),
                None => (0.0, None, 0),
            };

            let mut priority = 0.0;
            priority += (overdue_days * 5.0).min(40.0);
            priority += if error_rate > 0.5 {
                30.0
            } else {
                error_rate * 60.0
            };
            priority += total_score.map(|v| (100.0 - v) * 0.3).unwrap_or(30.0);

            let difficulty =
                compute_word_difficulty_from_score(total_score, total_attempts, error_rate);

            Some(DueCandidate {
                word: entry.word,
                priority,
                difficulty,
            })
        })
        .collect();

    due_candidates.sort_by(|a, b| {
        b.priority
            .partial_cmp(&a.priority)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let filtered_due: Vec<DueCandidate> = due_candidates
        .iter()
        .filter(|&d| d.difficulty >= range.min && d.difficulty <= range.max)
        .cloned()
        .collect();

    let daily_target = config.daily_word_count.max(0) as usize;
    let target_review = ((daily_target as f64) * (1.0 - strategy.new_ratio)).ceil() as usize;
    let target_new = daily_target.saturating_sub(target_review);

    let mut due_words = filtered_due.clone();
    if filtered_due.len() < target_review {
        let filtered_ids: HashSet<&str> = filtered_due.iter().map(|d| d.word.id.as_str()).collect();
        let mut remaining: Vec<DueCandidate> = due_candidates
            .into_iter()
            .filter(|d| !filtered_ids.contains(d.word.id.as_str()))
            .collect();
        remaining.sort_by(|a, b| {
            let dist_a = difficulty_distance(a.difficulty, range);
            let dist_b = difficulty_distance(b.difficulty, range);
            dist_a
                .partial_cmp(&dist_b)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    b.priority
                        .partial_cmp(&a.priority)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        });
        let needed = target_review.saturating_sub(filtered_due.len());
        due_words.extend(remaining.into_iter().take(needed));
    }

    let actual_review = due_words.len().min(target_review);
    let actual_new = target_new.max(daily_target.saturating_sub(actual_review));

    let new_words = if actual_new == 0 {
        Vec::new()
    } else {
        let candidate_count = actual_new * 2;
        let candidates = select_candidate_new_words(
            proxy,
            &accessible_ids,
            &learned_word_ids,
            &config.study_mode,
            candidate_count,
        )
        .await?;
        choose_new_words(candidates, range, actual_new)
    };

    let mut words: Vec<StudyWord> = Vec::new();
    for due in due_words.into_iter().take(actual_review) {
        words.push(due.word.into_word(false));
    }
    for word in new_words {
        words.push(word.into_word(true));
    }

    let (today_studied, total_studied, correct_rate) =
        compute_progress_counts(proxy, user_id, &accessible_ids).await?;

    Ok(TodayWordsResponse {
        words,
        progress: TodayProgress {
            today_studied,
            today_target: config.daily_word_count,
            total_studied,
            correct_rate,
        },
        strategy: StrategySummary {
            difficulty: strategy.difficulty,
            new_ratio: strategy.new_ratio,
        },
    })
}

pub async fn get_study_progress(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<StudyProgress, sqlx::Error> {
    let config = get_or_create_user_study_config(proxy, user_id).await?;

    let empty = StudyProgress {
        today_studied: 0,
        today_target: config.daily_word_count,
        total_studied: 0,
        correct_rate: 0,
        weekly_trend: vec![0, 0, 0, 0, 0, 0, 0],
    };

    if config.selected_word_book_ids.is_empty() {
        return Ok(empty);
    }

    let accessible_ids =
        select_accessible_word_book_ids(proxy, user_id, &config.selected_word_book_ids).await?;
    if accessible_ids.is_empty() {
        return Ok(empty);
    }

    let (today_studied, total_studied, correct_rate) =
        compute_progress_counts(proxy, user_id, &accessible_ids).await?;

    let weekly_trend = compute_weekly_trend(proxy, user_id, &accessible_ids).await?;

    Ok(StudyProgress {
        today_studied,
        today_target: config.daily_word_count,
        total_studied,
        correct_rate,
        weekly_trend,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum StudyConfigUpdateError {
    #[error("sql error: {0}")]
    Sql(sqlx::Error),
    #[error("unauthorized word books")]
    UnauthorizedWordBooks(Vec<String>),
}

#[derive(Debug, Clone)]
struct StudyWordBase {
    id: String,
    spelling: String,
    phonetic: String,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
    word_book_id: String,
    created_at: String,
    updated_at: String,
}

impl StudyWordBase {
    fn into_word(self, is_new: bool) -> StudyWord {
        StudyWord {
            id: self.id,
            spelling: self.spelling,
            phonetic: self.phonetic,
            meanings: self.meanings,
            examples: self.examples,
            audio_url: self.audio_url,
            word_book_id: self.word_book_id,
            created_at: self.created_at,
            updated_at: self.updated_at,
            is_new,
        }
    }
}

#[derive(Debug, Clone)]
struct WordLearningStateRow {
    word_id: String,
    state: String,
    review_count: i64,
    next_review_ms: Option<i64>,
}

#[derive(Debug, Clone)]
struct LearnedStateWithWord {
    state: WordLearningStateRow,
    word: StudyWordBase,
}

#[derive(Debug, Clone)]
struct WordScoreRow {
    total_score: f64,
    correct_attempts: i64,
    total_attempts: i64,
}

#[derive(Debug, Clone)]
struct DueCandidate {
    word: StudyWordBase,
    priority: f64,
    difficulty: f64,
}

fn default_config_value(user_id: &str) -> UserStudyConfig {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    UserStudyConfig {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.to_string(),
        selected_word_book_ids: Vec::new(),
        daily_word_count: 20,
        study_mode: "sequential".to_string(),
        daily_mastery_target: 20,
        created_at: now.clone(),
        updated_at: now,
    }
}

async fn create_default_study_config(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<(), sqlx::Error> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(
        r#"
        INSERT INTO "user_study_configs"
          ("id","userId","selectedWordBookIds","dailyWordCount","studyMode","dailyMasteryTarget","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT ("userId") DO NOTHING
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(Vec::<String>::new())
    .bind(20_i32)
    .bind("sequential")
    .bind(20_i32)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

async fn select_user_study_config(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Option<UserStudyConfig>, sqlx::Error> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT
          "id","userId","selectedWordBookIds","dailyWordCount","studyMode","dailyMasteryTarget","createdAt","updatedAt"
        FROM "user_study_configs"
        WHERE "userId" = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let created_at: NaiveDateTime = row.try_get("createdAt")?;
    let updated_at: NaiveDateTime = row.try_get("updatedAt")?;

    Ok(Some(UserStudyConfig {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        selected_word_book_ids: row.try_get("selectedWordBookIds")?,
        daily_word_count: row.try_get::<i32, _>("dailyWordCount").unwrap_or(20) as i64,
        study_mode: row
            .try_get::<String, _>("studyMode")
            .unwrap_or_else(|_| "sequential".to_string()),
        daily_mastery_target: row.try_get::<i32, _>("dailyMasteryTarget").unwrap_or(20) as i64,
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
    }))
}

async fn select_accessible_word_book_ids(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_book_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "id"
        FROM "word_books"
        WHERE "id" IN (
        "#,
    );
    {
        let mut separated = qb.separated(", ");
        for id in word_book_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");
    }

    qb.push(" AND (\"type\"::text = 'SYSTEM' OR (\"type\"::text = 'USER' AND \"userId\" = ");
    qb.push_bind(user_id);
    qb.push("))");

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("id").ok())
        .collect())
}

async fn select_word_learning_states(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<WordLearningStateRow>, sqlx::Error> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "wordId","state"::text as "state","reviewCount","nextReviewDate"
        FROM "word_learning_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let next_dt: Option<NaiveDateTime> = row.try_get("nextReviewDate").ok();
            let next_review_ms = next_dt
                .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc).timestamp_millis());
            WordLearningStateRow {
                word_id: row.try_get("wordId").unwrap_or_default(),
                state: row.try_get("state").unwrap_or_else(|_| "NEW".to_string()),
                review_count: row.try_get::<i32, _>("reviewCount").unwrap_or(0) as i64,
                next_review_ms,
            }
        })
        .collect())
}

async fn select_words_by_ids_and_word_books(
    proxy: &DatabaseProxy,
    word_ids: &[String],
    word_book_ids: &[String],
) -> Result<Vec<StudyWordBase>, sqlx::Error> {
    if word_ids.is_empty() || word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
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
    qb.push(" AND \"wordBookId\" IN (");
    {
        let mut sep = qb.separated(", ");
        for id in word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows.iter().map(map_postgres_word_row).collect())
}

async fn select_word_score_map(
    proxy: &DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, WordScoreRow>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "wordId","totalScore","correctAttempts","totalAttempts"
        FROM "word_scores"
        WHERE "userId" =
        "#,
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
    let mut map = HashMap::with_capacity(rows.len());
    for row in rows {
        let word_id: String = row.try_get("wordId").unwrap_or_default();
        map.insert(
            word_id,
            WordScoreRow {
                total_score: row.try_get::<f64, _>("totalScore").unwrap_or(0.0),
                correct_attempts: row.try_get::<i32, _>("correctAttempts").unwrap_or(0) as i64,
                total_attempts: row.try_get::<i32, _>("totalAttempts").unwrap_or(0) as i64,
            },
        );
    }
    Ok(map)
}

async fn select_candidate_new_words(
    proxy: &DatabaseProxy,
    word_book_ids: &[String],
    exclude_word_ids: &[String],
    study_mode: &str,
    take: usize,
) -> Result<Vec<StudyWordBase>, sqlx::Error> {
    if word_book_ids.is_empty() || take == 0 {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let random = study_mode == "random";
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
          "id","spelling","phonetic","meanings","examples","audioUrl","wordBookId","createdAt","updatedAt"
        FROM "words"
        WHERE "wordBookId" IN (
        "#,
    );
    {
        let mut sep = qb.separated(", ");
        for id in word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }

    if !exclude_word_ids.is_empty() {
        qb.push(" AND \"id\" NOT IN (");
        {
            let mut sep = qb.separated(", ");
            for id in exclude_word_ids {
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
    Ok(rows.iter().map(map_postgres_word_row).collect())
}

fn choose_new_words(
    mut candidates: Vec<StudyWordBase>,
    range: crate::services::amas::DifficultyRange,
    target: usize,
) -> Vec<StudyWordBase> {
    if candidates.is_empty() || target == 0 {
        return Vec::new();
    }

    let with_difficulty: Vec<(StudyWordBase, f64)> = candidates
        .drain(..)
        .map(|w| {
            let difficulty = compute_new_word_difficulty(&w.spelling, w.meanings.len());
            (w, difficulty)
        })
        .collect();

    let mut filtered: Vec<(StudyWordBase, f64)> = with_difficulty
        .iter()
        .filter(|&(_, d)| *d >= range.min && *d <= range.max)
        .cloned()
        .collect();

    if filtered.len() < target {
        let filtered_ids: HashSet<&str> = filtered.iter().map(|(w, _)| w.id.as_str()).collect();
        let mut remaining: Vec<(StudyWordBase, f64)> = with_difficulty
            .into_iter()
            .filter(|(w, _)| !filtered_ids.contains(w.id.as_str()))
            .collect();
        remaining.sort_by(|a, b| {
            difficulty_distance(a.1, range)
                .partial_cmp(&difficulty_distance(b.1, range))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let need = target.saturating_sub(filtered.len());
        filtered.extend(remaining.into_iter().take(need));
    }

    filtered.into_iter().take(target).map(|(w, _)| w).collect()
}

async fn compute_progress_counts(
    proxy: &DatabaseProxy,
    user_id: &str,
    accessible_word_book_ids: &[String],
) -> Result<(i64, i64, i64), sqlx::Error> {
    if accessible_word_book_ids.is_empty() {
        return Ok((0, 0, 0));
    }

    let today_start = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap_or_else(|| Utc::now().naive_utc());

    let pool = proxy.pool();

    let mut qb_today = QueryBuilder::<sqlx::Postgres>::new(
        r#"
            SELECT DISTINCT ar."wordId" as "wordId"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = 
            "#,
    );
    qb_today.push_bind(user_id);
    qb_today.push(" AND ar.\"timestamp\" >= ");
    qb_today.push_bind(today_start);
    qb_today.push(" AND w.\"wordBookId\" IN (");
    {
        let mut sep = qb_today.separated(", ");
        for id in accessible_word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let today_rows = qb_today.build().fetch_all(pool).await?;
    let today_studied = today_rows.len() as i64;

    let mut qb_total = QueryBuilder::<sqlx::Postgres>::new(
        r#"
            SELECT DISTINCT ar."wordId" as "wordId"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = 
            "#,
    );
    qb_total.push_bind(user_id);
    qb_total.push(" AND w.\"wordBookId\" IN (");
    {
        let mut sep = qb_total.separated(", ");
        for id in accessible_word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let total_rows = qb_total.build().fetch_all(pool).await?;
    let total_studied = total_rows.len() as i64;

    let mut qb_count = QueryBuilder::<sqlx::Postgres>::new(
        r#"
            SELECT COUNT(*) as "count"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = 
            "#,
    );
    qb_count.push_bind(user_id);
    qb_count.push(" AND w.\"wordBookId\" IN (");
    {
        let mut sep = qb_count.separated(", ");
        for id in accessible_word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let total_count: i64 = qb_count
        .build()
        .fetch_one(pool)
        .await?
        .try_get("count")
        .unwrap_or(0);

    let mut qb_correct = QueryBuilder::<sqlx::Postgres>::new(
        r#"
            SELECT COUNT(*) as "count"
            FROM "answer_records" ar
            JOIN "words" w ON w."id" = ar."wordId"
            WHERE ar."userId" = 
            "#,
    );
    qb_correct.push_bind(user_id);
    qb_correct.push(" AND ar.\"isCorrect\" = true AND w.\"wordBookId\" IN (");
    {
        let mut sep = qb_correct.separated(", ");
        for id in accessible_word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }
    let correct_count: i64 = qb_correct
        .build()
        .fetch_one(pool)
        .await?
        .try_get("count")
        .unwrap_or(0);

    let correct_rate = if total_count > 0 {
        ((correct_count as f64 / total_count as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok((today_studied, total_studied, correct_rate))
}

async fn compute_weekly_trend(
    proxy: &DatabaseProxy,
    user_id: &str,
    accessible_word_book_ids: &[String],
) -> Result<Vec<i64>, sqlx::Error> {
    if accessible_word_book_ids.is_empty() {
        return Ok(vec![0, 0, 0, 0, 0, 0, 0]);
    }

    let now = Utc::now();
    let week_start_date = (now - chrono::Duration::days(6)).date_naive();
    let week_start = week_start_date
        .and_hms_opt(0, 0, 0)
        .unwrap_or_else(|| now.naive_utc());

    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "wordId","timestamp"
        FROM "answer_records"
        WHERE "userId" = $1
          AND "timestamp" >= $2
        "#,
    )
    .bind(user_id)
    .bind(week_start)
    .fetch_all(pool)
    .await?;

    let records: Vec<(String, i64)> = rows
        .into_iter()
        .filter_map(|row| {
            let word_id: String = row.try_get("wordId").ok()?;
            let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
            let ms = DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis();
            Some((word_id, ms))
        })
        .collect();

    if records.is_empty() {
        return Ok(vec![0, 0, 0, 0, 0, 0, 0]);
    }

    let unique_word_ids: Vec<String> = records
        .iter()
        .map(|(word_id, _)| word_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let allowed_ids =
        select_word_ids_in_word_books(proxy, &unique_word_ids, accessible_word_book_ids).await?;
    if allowed_ids.is_empty() {
        return Ok(vec![0, 0, 0, 0, 0, 0, 0]);
    }
    let allowed_set: HashSet<&str> = allowed_ids.iter().map(|id| id.as_str()).collect();

    let mut day_to_words: HashMap<String, HashSet<String>> = HashMap::new();
    for (word_id, ts_ms) in records {
        if !allowed_set.contains(word_id.as_str()) {
            continue;
        }
        let Some(ts) = crate::auth::format_timestamp_ms_iso_millis(ts_ms) else {
            continue;
        };
        let Some(day) = ts.split('T').next() else {
            continue;
        };
        day_to_words
            .entry(day.to_string())
            .or_default()
            .insert(word_id);
    }

    let mut trend = Vec::with_capacity(7);
    for i in (0..7).rev() {
        let day = now
            .checked_sub_signed(chrono::Duration::days(i as i64))
            .unwrap_or(now);
        let date_str = day.to_rfc3339_opts(SecondsFormat::Millis, true);
        let day_key = date_str.split('T').next().unwrap_or("");
        trend.push(
            day_to_words
                .get(day_key)
                .map(|s| s.len() as i64)
                .unwrap_or(0),
        );
    }

    Ok(trend)
}

async fn select_word_ids_in_word_books(
    proxy: &DatabaseProxy,
    word_ids: &[String],
    word_book_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if word_ids.is_empty() || word_book_ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "id"
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
    qb.push(" AND \"wordBookId\" IN (");
    {
        let mut sep = qb.separated(", ");
        for id in word_book_ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
    }

    let rows = qb.build().fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("id").ok())
        .collect())
}

fn compute_word_difficulty_from_score(
    total_score: Option<f64>,
    total_attempts: i64,
    error_rate: f64,
) -> f64 {
    if total_score.is_none() || total_attempts == 0 {
        return 0.3;
    }
    let score_factor = (100.0 - total_score.unwrap_or(0.0)) / 100.0;
    (error_rate * 0.6 + score_factor * 0.4).clamp(0.0, 1.0)
}

fn difficulty_distance(value: f64, range: crate::services::amas::DifficultyRange) -> f64 {
    let center = (range.min + range.max) / 2.0;
    (value - center).abs()
}

fn map_postgres_word_row(row: &sqlx::postgres::PgRow) -> StudyWordBase {
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());

    StudyWordBase {
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
        word_book_id: row.try_get("wordBookId").unwrap_or_default(),
        created_at: crate::auth::format_naive_datetime_iso_millis(created_at),
        updated_at: crate::auth::format_naive_datetime_iso_millis(updated_at),
    }
}
