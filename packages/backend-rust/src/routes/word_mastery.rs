use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};

use crate::response::{json_error, AppError};
use crate::state::AppState;

const MAX_BATCH_SIZE: usize = 100;
const DEFAULT_TRACE_LIMIT: i64 = 50;
const MAX_TRACE_LIMIT: i64 = 100;

#[derive(Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRequest {
    word_ids: Vec<String>,
    user_fatigue: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FatigueQuery {
    user_fatigue: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TraceQuery {
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntervalQuery {
    target_recall: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MasteryFactors {
    srs_level: i64,
    actr_recall: f64,
    recent_accuracy: f64,
    user_fatigue: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MasteryEvaluationDto {
    word_id: String,
    is_learned: bool,
    score: f64,
    confidence: f64,
    factors: MasteryFactors,
    #[serde(skip_serializing_if = "Option::is_none")]
    suggestion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fatigue_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewTraceRecordDto {
    id: String,
    timestamp: String,
    is_correct: bool,
    response_time: i64,
    seconds_ago: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceResponseDto {
    word_id: String,
    trace: Vec<ReviewTraceRecordDto>,
    count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntervalResponseDto {
    word_id: String,
    interval: IntervalPredictionDto,
    human_readable: HumanIntervalDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntervalPredictionDto {
    optimal_seconds: f64,
    min_seconds: f64,
    max_seconds: f64,
    target_recall: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HumanIntervalDto {
    optimal: String,
    min: String,
    max: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserMasteryStatsDto {
    total_words: usize,
    mastered_words: usize,
    learning_words: usize,
    new_words: usize,
    average_score: f64,
    average_recall: f64,
    need_review_count: usize,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(get_stats))
        .route("/batch", post(batch_evaluate))
        .route("/:wordId/trace", get(get_trace))
        .route("/:wordId/interval", get(get_interval))
        .route("/:wordId", get(get_word))
}

async fn get_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    let word_ids = list_user_word_ids(proxy.as_ref(), &user.id).await?;
    if word_ids.is_empty() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: UserMasteryStatsDto {
                total_words: 0,
                mastered_words: 0,
                learning_words: 0,
                new_words: 0,
                average_score: 0.0,
                average_recall: 0.0,
                need_review_count: 0,
            },
        }));
    }

    let fatigue = select_user_fatigue(proxy.as_ref(), &user.id)
        .await?
        .unwrap_or(0.0);
    let evaluations = evaluate_words_batch(proxy.as_ref(), &user.id, &word_ids, fatigue).await?;
    let state_counts = count_learning_state_buckets(proxy.as_ref(), &user.id).await?;

    let total_score: f64 = evaluations.iter().map(|e| e.score).sum();
    let total_recall: f64 = evaluations.iter().map(|e| e.factors.actr_recall).sum();
    let need_review_count = evaluations
        .iter()
        .filter(|e| e.factors.actr_recall < 0.7 && !e.is_learned)
        .count();

    Ok(Json(SuccessResponse {
        success: true,
        data: UserMasteryStatsDto {
            total_words: evaluations.len(),
            mastered_words: evaluations.iter().filter(|e| e.is_learned).count(),
            learning_words: state_counts.learning_words,
            new_words: state_counts.new_words,
            average_score: total_score / evaluations.len() as f64,
            average_recall: total_recall / evaluations.len() as f64,
            need_review_count,
        },
    }))
}

async fn batch_evaluate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if payload.word_ids.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordIds必须是非空数组",
        ));
    }
    if payload.word_ids.len() > MAX_BATCH_SIZE {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            format!("wordIds数组不能超过{MAX_BATCH_SIZE}个元素"),
        ));
    }

    let mut seen = HashMap::<String, ()>::new();
    let mut unique_ids: Vec<String> = Vec::with_capacity(payload.word_ids.len());
    for raw in payload.word_ids {
        let id = raw.trim();
        if id.is_empty() {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "wordId不能为空",
            ));
        }
        if seen.insert(id.to_string(), ()).is_none() {
            unique_ids.push(id.to_string());
        }
    }

    let fatigue = clamp01(payload.user_fatigue.unwrap_or(0.0));
    let evaluations = evaluate_words_batch(proxy.as_ref(), &user.id, &unique_ids, fatigue).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: evaluations,
    }))
}

async fn get_word(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<FatigueQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let fatigue = clamp01(query.user_fatigue.unwrap_or(0.0));
    let eval = evaluate_single_word(proxy.as_ref(), &user.id, word_id.trim(), fatigue).await?;
    Ok(Json(SuccessResponse {
        success: true,
        data: eval,
    }))
}

async fn get_trace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<TraceQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let limit = query
        .limit
        .unwrap_or(DEFAULT_TRACE_LIMIT)
        .max(1)
        .min(MAX_TRACE_LIMIT);
    let trace = select_review_trace(proxy.as_ref(), &user.id, word_id.trim(), limit).await?;

    Ok(Json(SuccessResponse {
        success: true,
        data: TraceResponseDto {
            word_id: word_id.trim().to_string(),
            count: trace.len(),
            trace,
        },
    }))
}

async fn get_interval(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<IntervalQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;
    let target_recall = query.target_recall.unwrap_or(0.9).clamp(0.01, 1.0);
    let trace =
        select_review_trace_raw(proxy.as_ref(), &user.id, word_id.trim(), MAX_TRACE_LIMIT).await?;
    let actr_trace = to_actr_trace(&trace)?;

    let model = danci_algo::ACTRMemoryNative::new(None, None, None);
    let prediction = model.predict_optimal_interval(actr_trace, Some(target_recall));

    let interval = IntervalPredictionDto {
        optimal_seconds: prediction.optimal_seconds,
        min_seconds: prediction.min_seconds,
        max_seconds: prediction.max_seconds,
        target_recall: prediction.target_recall,
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: IntervalResponseDto {
            word_id: word_id.trim().to_string(),
            human_readable: HumanIntervalDto {
                optimal: format_interval(interval.optimal_seconds),
                min: format_interval(interval.min_seconds),
                max: format_interval(interval.max_seconds),
            },
            interval,
        },
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<
    (
        std::sync::Arc<crate::db::DatabaseProxy>,
        crate::auth::AuthUser,
    ),
    AppError,
> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(proxy.as_ref(), &token)
        .await
        .map_err(|_| {
            json_error(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "认证失败，请重新登录",
            )
        })?;

    Ok((proxy, user))
}

struct StateBuckets {
    new_words: usize,
    learning_words: usize,
}

async fn count_learning_state_buckets(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<StateBuckets, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "state"::text as "state", COUNT(*) as "count"
        FROM "word_learning_states"
        WHERE "userId" = $1
        GROUP BY "state"
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| {
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "服务器内部错误",
        )
    })?;

    let mut new_words = 0usize;
    let mut learning_words = 0usize;
    for row in rows {
        let state = row.try_get::<String, _>("state").unwrap_or_default();
        let count = row.try_get::<i64, _>("count").unwrap_or(0).max(0) as usize;
        match state.as_str() {
            "NEW" => new_words = count,
            "LEARNING" | "REVIEWING" => learning_words += count,
            _ => {}
        }
    }
    Ok(StateBuckets {
        new_words,
        learning_words,
    })
}

async fn list_user_word_ids(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Vec<String>, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "wordId" as "wordId"
        FROM "word_learning_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("wordId").ok())
        .collect())
}

async fn select_user_fatigue(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
) -> Result<Option<f64>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "fatigue" as "fatigue"
        FROM "amas_user_states"
        WHERE "userId" = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    Ok(row.and_then(|r| r.try_get::<f64, _>("fatigue").ok()))
}

#[derive(Clone)]
struct LearningStateRow {
    mastery_level: i64,
}

#[derive(Clone)]
struct WordScoreRow {
    recent_accuracy: f64,
}

#[derive(Clone)]
struct TraceRow {
    id: String,
    timestamp_ms: i64,
    is_correct: bool,
    response_time: i64,
}

async fn evaluate_single_word(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_id: &str,
    user_fatigue: f64,
) -> Result<MasteryEvaluationDto, AppError> {
    if word_id.is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "BAD_REQUEST",
            "wordId不能为空",
        ));
    }

    let learning_state = select_learning_state(proxy, user_id, word_id).await?;
    let word_score = select_word_score(proxy, user_id, word_id).await?;
    let trace_rows = select_review_trace_raw(proxy, user_id, word_id, DEFAULT_TRACE_LIMIT).await?;
    let actr_trace = to_actr_trace(&trace_rows)?;

    let model = danci_algo::ACTRMemoryNative::new(None, None, None);
    let recall = model.predict_recall(actr_trace).recall_probability;

    Ok(compute_evaluation(
        word_id,
        learning_state.as_ref(),
        word_score.as_ref(),
        recall,
        user_fatigue,
    ))
}

async fn evaluate_words_batch(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
    user_fatigue: f64,
) -> Result<Vec<MasteryEvaluationDto>, AppError> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let learning_states = select_learning_states_batch(proxy, user_id, word_ids).await?;
    let word_scores = select_word_scores_batch(proxy, user_id, word_ids).await?;
    let traces = select_review_traces_batch(proxy, user_id, word_ids, DEFAULT_TRACE_LIMIT).await?;

    let model = danci_algo::ACTRMemoryNative::new(None, None, None);
    let mut evaluations: Vec<MasteryEvaluationDto> = Vec::with_capacity(word_ids.len());
    for word_id in word_ids {
        let state_row = learning_states.get(word_id);
        let score_row = word_scores.get(word_id);
        let trace = traces.get(word_id).cloned().unwrap_or_default();
        let actr_trace = to_actr_trace(&trace)?;
        let recall = model.predict_recall(actr_trace).recall_probability;
        evaluations.push(compute_evaluation(
            word_id,
            state_row,
            score_row,
            recall,
            user_fatigue,
        ));
    }
    Ok(evaluations)
}

fn compute_evaluation(
    word_id: &str,
    learning_state: Option<&LearningStateRow>,
    word_score: Option<&WordScoreRow>,
    actr_recall: f64,
    user_fatigue: f64,
) -> MasteryEvaluationDto {
    let srs_level = learning_state.map(|s| s.mastery_level).unwrap_or(0);
    let recent_accuracy = word_score.map(|s| s.recent_accuracy).unwrap_or(0.0);

    let weights_srs = 0.3;
    let weights_actr = 0.5;
    let weights_recent = 0.2;
    let threshold = 0.7;
    let fatigue_impact = 0.3;

    let normalized_srs = (srs_level as f64 / 5.0).clamp(0.0, 1.0);
    let raw_score = weights_srs * normalized_srs
        + weights_actr * actr_recall
        + weights_recent * recent_accuracy;
    let score = raw_score.clamp(0.0, 1.0);

    let safe_fatigue = clamp01(user_fatigue);
    let confidence = (1.0 - safe_fatigue * fatigue_impact).clamp(0.0, 1.0);
    let is_learned = score >= threshold;

    let suggestion = generate_suggestion(actr_recall, srs_level, is_learned);
    let fatigue_warning = if safe_fatigue > 0.6 {
        Some("当前疲劳度较高，评估结果的置信度可能不足，建议休息后再测试".to_string())
    } else if safe_fatigue > 0.4 {
        Some("疲劳度适中，评估结果仅供参考".to_string())
    } else {
        None
    };

    MasteryEvaluationDto {
        word_id: word_id.to_string(),
        is_learned,
        score,
        confidence,
        factors: MasteryFactors {
            srs_level,
            actr_recall,
            recent_accuracy,
            user_fatigue: safe_fatigue,
        },
        suggestion,
        fatigue_warning,
    }
}

fn generate_suggestion(actr_recall: f64, srs_level: i64, is_learned: bool) -> Option<String> {
    if is_learned {
        return None;
    }
    if actr_recall < 0.3 {
        return Some("这个单词快要忘记了，建议立即复习".to_string());
    }
    if actr_recall < 0.6 {
        return Some("记忆有所衰退，建议今天内复习".to_string());
    }
    if srs_level < 2 {
        return Some("单词还不够熟练，需要更多练习".to_string());
    }
    Some("继续保持复习以巩固记忆".to_string())
}

async fn select_learning_state(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Option<LearningStateRow>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "masteryLevel" as "masteryLevel"
        FROM "word_learning_states"
        WHERE "userId" = $1
          AND "wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    Ok(row.map(|r| LearningStateRow {
        mastery_level: r
            .try_get::<i32, _>("masteryLevel")
            .map(|v| v as i64)
            .unwrap_or(0),
    }))
}

async fn select_word_score(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_id: &str,
) -> Result<Option<WordScoreRow>, AppError> {
    let pool = proxy.pool();
    let row = sqlx::query(
        r#"
        SELECT "recentAccuracy" as "recentAccuracy"
        FROM "word_scores"
        WHERE "userId" = $1
          AND "wordId" = $2
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    Ok(row.map(|r| WordScoreRow {
        recent_accuracy: r.try_get::<f64, _>("recentAccuracy").unwrap_or(0.0),
    }))
}

async fn select_learning_states_batch(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, LearningStateRow>, AppError> {
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "wordId" as "wordId", "masteryLevel" as "masteryLevel"
        FROM "word_learning_states"
        WHERE "userId" =
        "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    let mut separated = qb.separated(", ");
    for id in word_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");
    let rows = qb.build().fetch_all(pool).await.unwrap_or_default();

    let mut map = HashMap::new();
    for row in rows {
        let word_id = row.try_get::<String, _>("wordId").unwrap_or_default();
        let mastery_level = row
            .try_get::<i32, _>("masteryLevel")
            .map(|v| v as i64)
            .unwrap_or(0);
        map.insert(word_id, LearningStateRow { mastery_level });
    }
    Ok(map)
}

async fn select_word_scores_batch(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
) -> Result<HashMap<String, WordScoreRow>, AppError> {
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "wordId" as "wordId", "recentAccuracy" as "recentAccuracy"
        FROM "word_scores"
        WHERE "userId" =
        "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    let mut separated = qb.separated(", ");
    for id in word_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");
    let rows = qb.build().fetch_all(pool).await.unwrap_or_default();

    let mut map = HashMap::new();
    for row in rows {
        let word_id = row.try_get::<String, _>("wordId").unwrap_or_default();
        let recent_accuracy = row.try_get::<f64, _>("recentAccuracy").unwrap_or(0.0);
        map.insert(word_id, WordScoreRow { recent_accuracy });
    }
    Ok(map)
}

async fn select_review_trace(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_id: &str,
    limit: i64,
) -> Result<Vec<ReviewTraceRecordDto>, AppError> {
    let raw = select_review_trace_raw(proxy, user_id, word_id, limit).await?;
    let now_ms = Utc::now().timestamp_millis();

    Ok(raw
        .into_iter()
        .map(|row| ReviewTraceRecordDto {
            id: row.id,
            timestamp: crate::auth::format_timestamp_ms_iso_millis(row.timestamp_ms)
                .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
            is_correct: row.is_correct,
            response_time: row.response_time,
            seconds_ago: ((now_ms - row.timestamp_ms) / 1000).max(0),
        })
        .collect())
}

async fn select_review_trace_raw(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_id: &str,
    limit: i64,
) -> Result<Vec<TraceRow>, AppError> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id","timestamp","isCorrect","responseTime"
        FROM "word_review_traces"
        WHERE "userId" = $1
          AND "wordId" = $2
        ORDER BY "timestamp" DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(word_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row.try_get::<String, _>("id").unwrap_or_default();
        let ts = row
            .try_get::<NaiveDateTime, _>("timestamp")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let ts_ms = DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis();
        let is_correct = row.try_get::<bool, _>("isCorrect").unwrap_or(false);
        let response_time = row
            .try_get::<i32, _>("responseTime")
            .map(|v| v as i64)
            .unwrap_or(0);
        out.push(TraceRow {
            id,
            timestamp_ms: ts_ms,
            is_correct,
            response_time,
        });
    }
    Ok(out)
}

async fn select_review_traces_batch(
    proxy: &crate::db::DatabaseProxy,
    user_id: &str,
    word_ids: &[String],
    per_word_limit: i64,
) -> Result<HashMap<String, Vec<TraceRow>>, AppError> {
    let pool = proxy.pool();
    let mut qb = QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT "id","wordId","timestamp","isCorrect","responseTime"
        FROM "word_review_traces"
        WHERE "userId" =
        "#,
    );
    qb.push_bind(user_id);
    qb.push(" AND \"wordId\" IN (");
    let mut separated = qb.separated(", ");
    for id in word_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");
    qb.push(" ORDER BY \"wordId\" ASC, \"timestamp\" DESC");
    let fetched = qb.build().fetch_all(pool).await.unwrap_or_default();

    let mut rows: Vec<(String, TraceRow)> = Vec::new();
    for row in fetched {
        let id = row.try_get::<String, _>("id").unwrap_or_default();
        let word_id = row.try_get::<String, _>("wordId").unwrap_or_default();
        let ts = row
            .try_get::<NaiveDateTime, _>("timestamp")
            .unwrap_or_else(|_| Utc::now().naive_utc());
        let ts_ms = DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc).timestamp_millis();
        let is_correct = row.try_get::<bool, _>("isCorrect").unwrap_or(false);
        let response_time = row
            .try_get::<i32, _>("responseTime")
            .map(|v| v as i64)
            .unwrap_or(0);
        rows.push((
            word_id.clone(),
            TraceRow {
                id,
                timestamp_ms: ts_ms,
                is_correct,
                response_time,
            },
        ));
    }

    let mut map: HashMap<String, Vec<TraceRow>> = HashMap::new();
    for (word_id, row) in rows {
        let entry = map.entry(word_id).or_default();
        if entry.len() < per_word_limit as usize {
            entry.push(row);
        }
    }
    Ok(map)
}

fn to_actr_trace(trace: &[TraceRow]) -> Result<Vec<danci_algo::MemoryTrace>, AppError> {
    let now_ms = Utc::now().timestamp_millis();
    let mut actr: Vec<danci_algo::MemoryTrace> = Vec::with_capacity(trace.len());
    for row in trace {
        let delta_ms = (now_ms - row.timestamp_ms).max(0);
        actr.push(danci_algo::MemoryTrace {
            timestamp: (delta_ms as f64) / 1000.0,
            is_correct: row.is_correct,
        });
    }
    Ok(actr)
}

fn clamp01(value: f64) -> f64 {
    if value.is_nan() {
        0.0
    } else {
        value.clamp(0.0, 1.0)
    }
}

fn format_interval(seconds: f64) -> String {
    if seconds < 3600.0 {
        let minutes = (seconds / 60.0).round() as i64;
        return format!("{minutes} 分钟");
    }
    if seconds < 86400.0 {
        let hours = (seconds / 3600.0).round() as i64;
        return format!("{hours} 小时");
    }
    let days = (seconds / 86400.0).round() as i64;
    format!("{days} 天")
}
