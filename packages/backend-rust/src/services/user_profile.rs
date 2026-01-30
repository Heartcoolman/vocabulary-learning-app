use std::collections::HashMap;

use chrono::{DateTime, Local, NaiveDateTime, SecondsFormat, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use crate::amas::modeling::vark::{
    compute_ml_confidence, load_vark_model, save_vark_model, VarkClassifier, VarkFeatures,
    VarkLabels,
};
use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub username: String,
    pub role: String,
    pub reward_profile: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserStatistics {
    pub total_words: i64,
    pub total_records: i64,
    pub correct_count: i64,
    pub accuracy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardProfileItem {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardProfilesResponse {
    pub current_profile: String,
    pub available_profiles: &'static [RewardProfileItem],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningHistoryItem {
    pub hour: i32,
    pub performance: f64,
    pub sample_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChronotypeProfile {
    pub category: &'static str,
    pub peak_hours: Vec<i32>,
    pub confidence: f64,
    pub sample_count: i64,
    pub learning_history: Vec<LearningHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleScores {
    pub visual: f64,
    pub auditory: f64,
    pub reading: f64,
    pub kinesthetic: f64,
}

impl Default for LearningStyleScores {
    fn default() -> Self {
        Self {
            visual: 0.25,
            auditory: 0.25,
            reading: 0.25,
            kinesthetic: 0.25,
        }
    }
}

impl LearningStyleScores {
    pub fn normalize(&mut self) {
        let total = self.visual + self.auditory + self.reading + self.kinesthetic;
        if total > 0.0 {
            self.visual /= total;
            self.auditory /= total;
            self.reading /= total;
            self.kinesthetic /= total;
        }
    }

    pub fn variance(&self) -> f64 {
        let mean = 0.25;
        let sum_sq = (self.visual - mean).powi(2)
            + (self.auditory - mean).powi(2)
            + (self.reading - mean).powi(2)
            + (self.kinesthetic - mean).powi(2);
        sum_sq / 4.0
    }

    pub fn is_multimodal(&self) -> bool {
        self.variance() < 0.01
    }

    pub fn dominant_style(&self) -> &'static str {
        if self.is_multimodal() {
            return "multimodal";
        }
        let max_score = self
            .visual
            .max(self.auditory)
            .max(self.reading)
            .max(self.kinesthetic);
        if (self.visual - max_score).abs() < f64::EPSILON {
            "visual"
        } else if (self.auditory - max_score).abs() < f64::EPSILON {
            "auditory"
        } else if (self.reading - max_score).abs() < f64::EPSILON {
            "reading"
        } else {
            "kinesthetic"
        }
    }

    pub fn legacy_style(&self) -> &'static str {
        let style = self.dominant_style();
        match style {
            "reading" | "multimodal" => "mixed",
            other => other,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleInteractionPatterns {
    pub avg_dwell_time: f64,
    pub avg_response_time: f64,
    pub pause_frequency: f64,
    pub switch_frequency: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStyleProfile {
    pub style: &'static str,
    pub style_legacy: &'static str,
    pub confidence: f64,
    pub sample_count: i64,
    pub scores: LearningStyleScores,
    pub interaction_patterns: LearningStyleInteractionPatterns,
    pub model_type: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveProfileResponse {
    pub chronotype: Option<ChronotypeProfile>,
    pub learning_style: Option<LearningStyleProfile>,
}

pub const REWARD_PROFILES: &[RewardProfileItem] = &[
    RewardProfileItem {
        id: "standard",
        name: "标准模式",
        description: "平衡长期记忆和学习体验",
    },
    RewardProfileItem {
        id: "cram",
        name: "突击模式",
        description: "最大化短期记忆，适合考前冲刺",
    },
    RewardProfileItem {
        id: "relaxed",
        name: "轻松模式",
        description: "降低压力，保持学习动力",
    },
];

struct AnswerRecordChrono {
    timestamp_ms: i64,
    is_correct: bool,
}

struct AnswerRecordInteraction {
    timestamp_ms: i64,
    dwell_time: i64,
    response_time: Option<i64>,
}

struct TrackingStats {
    pronunciation_clicks: i32,
    pause_count: i32,
    page_switch_count: i32,
    total_interactions: i32,
}

#[derive(Debug, Clone, Default)]
pub struct VarkStats {
    pub total_image_view: i64,
    pub total_image_zoom: i64,
    pub total_image_press_ms: i64,
    pub total_audio_play: i64,
    pub total_audio_replay: i64,
    pub has_speed_adjust: bool,
    pub total_reading_ms: i64,
    pub total_note_count: i64,
}

// ========== Validation ==========

pub fn is_valid_reward_profile_id(profile_id: &str) -> bool {
    matches!(profile_id, "standard" | "cram" | "relaxed")
}

pub fn validate_password(password: &str) -> Option<&'static str> {
    if password.len() < 10 {
        return Some("密码长度至少为10个字符");
    }
    let has_letter = password.chars().any(|ch| ch.is_ascii_alphabetic());
    let has_digit = password.chars().any(|ch| ch.is_ascii_digit());
    let special_chars = "!@#$%^&*()_-+=[]{};:'\",.<>/?\\|`~";
    let has_special = password.chars().any(|ch| special_chars.contains(ch));
    if has_letter && has_digit && has_special {
        None
    } else {
        Some("密码需包含字母、数字和特殊符号")
    }
}

// ========== Read Operations ==========

pub async fn get_user_profile(pool: &PgPool, user_id: &str) -> Result<Option<UserProfile>, String> {
    let row = sqlx::query(
        r#"SELECT "id","email","username","role"::text as "role","rewardProfile","createdAt","updatedAt"
           FROM "users" WHERE "id" = $1 LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询失败: {e}"))?;

    let Some(row) = row else { return Ok(None) };
    let created_at: NaiveDateTime = row
        .try_get("createdAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let updated_at: NaiveDateTime = row
        .try_get("updatedAt")
        .unwrap_or_else(|_| Utc::now().naive_utc());

    Ok(Some(UserProfile {
        id: row.try_get("id").unwrap_or_default(),
        email: row.try_get("email").unwrap_or_default(),
        username: row.try_get("username").unwrap_or_default(),
        role: row.try_get("role").unwrap_or_default(),
        reward_profile: row
            .try_get::<Option<String>, _>("rewardProfile")
            .ok()
            .flatten()
            .unwrap_or_else(|| "standard".to_string()),
        created_at: format_naive_iso(created_at),
        updated_at: format_naive_iso(updated_at),
    }))
}

pub async fn get_reward_profile(pool: &PgPool, user_id: &str) -> Result<String, String> {
    let row = sqlx::query(r#"SELECT "rewardProfile" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;
    Ok(row
        .and_then(|r| r.try_get::<Option<String>, _>("rewardProfile").ok())
        .flatten()
        .unwrap_or_else(|| "standard".to_string()))
}

pub async fn get_password_hash(pool: &PgPool, user_id: &str) -> Result<Option<String>, String> {
    let row = sqlx::query(r#"SELECT "passwordHash" FROM "users" WHERE "id" = $1 LIMIT 1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询失败: {e}"))?;
    Ok(row.and_then(|r| r.try_get::<String, _>("passwordHash").ok()))
}

pub async fn get_user_statistics(pool: &PgPool, user_id: &str) -> Result<UserStatistics, String> {
    let word_books: Vec<String> = sqlx::query_scalar(
        r#"SELECT "id" FROM "word_books" WHERE ("type"::text = 'SYSTEM') OR (("type"::text = 'USER') AND "userId" = $1)"#,
    )
    .bind(user_id).fetch_all(pool).await.unwrap_or_default();

    let total_words = count_words_pg(pool, &word_books).await.unwrap_or(0);
    let total_records: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_one(pool)
            .await
            .unwrap_or(0);
    let correct_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "answer_records" WHERE "userId" = $1 AND "isCorrect" = true"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    Ok(build_statistics(total_words, total_records, correct_count))
}

fn build_statistics(total_words: i64, total_records: i64, correct_count: i64) -> UserStatistics {
    let accuracy = if total_records > 0 {
        (correct_count as f64 / total_records as f64) * 100.0
    } else {
        0.0
    };
    UserStatistics {
        total_words,
        total_records,
        correct_count,
        accuracy: (accuracy * 100.0).round() / 100.0,
    }
}

async fn count_words_pg(pool: &PgPool, word_book_ids: &[String]) -> Result<i64, sqlx::Error> {
    if word_book_ids.is_empty() {
        return Ok(0);
    }
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" IN ("#,
    );
    let mut sep = qb.separated(", ");
    for id in word_book_ids {
        sep.push_bind(id);
    }
    sep.push_unseparated(")");
    qb.build_query_scalar().fetch_one(pool).await
}

// ========== Cognitive Profile ==========

pub async fn compute_chronotype(pool: &PgPool, user_id: &str) -> Result<ChronotypeProfile, String> {
    let records = fetch_records_for_chronotype(pool, user_id).await?;
    let mut hourly_data: HashMap<i32, (i64, i64)> = HashMap::new();

    for record in records {
        let hour = Local
            .timestamp_millis_opt(record.timestamp_ms)
            .single()
            .map(|dt| dt.hour() as i32)
            .unwrap_or(0);
        let entry = hourly_data.entry(hour).or_insert((0, 0));
        entry.1 += 1;
        if record.is_correct {
            entry.0 += 1;
        }
    }

    let mut learning_history: Vec<LearningHistoryItem> = hourly_data
        .into_iter()
        .filter_map(|(hour, (correct, total))| {
            if total == 0 {
                None
            } else {
                Some(LearningHistoryItem {
                    hour,
                    performance: correct as f64 / total as f64,
                    sample_count: total,
                })
            }
        })
        .collect();
    learning_history.sort_by_key(|item| item.hour);

    let total_samples: i64 = learning_history.iter().map(|item| item.sample_count).sum();
    if total_samples < 20 {
        return Ok(ChronotypeProfile {
            category: "intermediate",
            peak_hours: vec![9, 10, 14, 15, 16],
            confidence: 0.3,
            sample_count: total_samples,
            learning_history,
        });
    }

    let morning = avg_performance(&learning_history, &[6, 7, 8, 9, 10]);
    let afternoon = avg_performance(&learning_history, &[14, 15, 16, 17, 18]);
    let evening = avg_performance(&learning_history, &[19, 20, 21, 22]);

    let perf_variance = variance(&[morning, afternoon, evening]);
    let sample_confidence = (total_samples as f64 / 100.0).min(1.0);
    let diff_confidence = if perf_variance > 0.01 { 0.8 } else { 0.5 };
    let confidence = (sample_confidence + diff_confidence) / 2.0;

    if morning > afternoon && morning > evening {
        Ok(ChronotypeProfile {
            category: "morning",
            peak_hours: identify_peak_hours(&learning_history, &[6, 7, 8, 9, 10, 11]),
            confidence,
            sample_count: total_samples,
            learning_history,
        })
    } else if evening > morning && evening > afternoon {
        Ok(ChronotypeProfile {
            category: "evening",
            peak_hours: identify_peak_hours(&learning_history, &[18, 19, 20, 21, 22, 23]),
            confidence,
            sample_count: total_samples,
            learning_history,
        })
    } else {
        Ok(ChronotypeProfile {
            category: "intermediate",
            peak_hours: identify_peak_hours(&learning_history, &[10, 11, 14, 15, 16, 17]),
            confidence: confidence * 0.8,
            sample_count: total_samples,
            learning_history,
        })
    }
}

pub async fn compute_learning_style(
    pool: &PgPool,
    user_id: &str,
) -> Result<LearningStyleProfile, String> {
    let interactions = fetch_records_for_learning_style(pool, user_id).await?;
    let tracking = fetch_tracking_stats(pool, user_id).await;
    let sample_count = interactions.len() as i64;

    let default_patterns = LearningStyleInteractionPatterns {
        avg_dwell_time: 0.0,
        avg_response_time: 0.0,
        pause_frequency: 0.0,
        switch_frequency: 0.0,
    };

    if interactions.is_empty() {
        return Ok(LearningStyleProfile {
            style: "multimodal",
            style_legacy: "mixed",
            confidence: 0.3,
            sample_count: 0,
            scores: LearningStyleScores::default(),
            interaction_patterns: default_patterns,
            model_type: "rule_engine",
        });
    }

    let avg_dwell_time = interactions
        .iter()
        .map(|r| r.dwell_time as f64)
        .sum::<f64>()
        / interactions.len() as f64;
    let avg_response_time = interactions
        .iter()
        .map(|r| r.response_time.unwrap_or(0) as f64)
        .sum::<f64>()
        / interactions.len() as f64;
    let dwell_variance = interactions
        .iter()
        .map(|r| (r.dwell_time as f64 - avg_dwell_time).powi(2))
        .sum::<f64>()
        / interactions.len() as f64;
    let response_variance = interactions
        .iter()
        .map(|r| (r.response_time.unwrap_or(0) as f64 - avg_response_time).powi(2))
        .sum::<f64>()
        / interactions.len() as f64;

    let (pause_count, switch_count, pause_frequency, switch_frequency) = match &tracking {
        Some(t) if t.total_interactions >= 10 => {
            let pf = t.pause_count as f64 / t.total_interactions as f64;
            let sf = t.page_switch_count as f64 / t.total_interactions as f64;
            (t.pause_count as i64, t.page_switch_count as i64, pf, sf)
        }
        _ => {
            let mut pc = 0i64;
            for i in 1..interactions.len() {
                if interactions[i - 1].timestamp_ms - interactions[i].timestamp_ms > 30_000 {
                    pc += 1;
                }
            }
            let mut sc = 0i64;
            for i in 1..interactions.len() {
                let prev = response_or_avg(interactions[i - 1].response_time, avg_response_time);
                let curr = response_or_avg(interactions[i].response_time, avg_response_time);
                if prev > 0.0 && curr > 0.0 && (curr / prev > 2.0 || prev / curr > 2.0) {
                    sc += 1;
                }
            }
            (
                pc,
                sc,
                pc as f64 / sample_count as f64,
                sc as f64 / sample_count as f64,
            )
        }
    };

    let interaction_patterns = LearningStyleInteractionPatterns {
        avg_dwell_time,
        avg_response_time,
        pause_frequency,
        switch_frequency,
    };

    if sample_count < 20 {
        return Ok(LearningStyleProfile {
            style: "multimodal",
            style_legacy: "mixed",
            confidence: 0.3,
            sample_count,
            scores: LearningStyleScores::default(),
            interaction_patterns,
            model_type: "rule_engine",
        });
    }

    // Compute VARK four-dimensional scores
    let visual_raw = compute_visual_score(avg_dwell_time);
    let auditory_raw = compute_auditory_score_with_tracking(
        avg_dwell_time,
        dwell_variance,
        pause_count,
        sample_count,
        &tracking,
    );
    let reading_raw = compute_reading_score(avg_dwell_time, &tracking);
    let kinesthetic_raw = compute_kinesthetic_score_with_tracking(
        avg_response_time,
        response_variance,
        switch_count,
        sample_count,
        &tracking,
    );

    let mut scores = LearningStyleScores {
        visual: visual_raw,
        auditory: auditory_raw,
        reading: reading_raw,
        kinesthetic: kinesthetic_raw,
    };
    scores.normalize();

    let style = scores.dominant_style();
    let style_legacy = scores.legacy_style();
    let confidence = compute_style_confidence(&scores, sample_count, &tracking);

    Ok(LearningStyleProfile {
        style,
        style_legacy,
        confidence,
        sample_count,
        scores,
        interaction_patterns,
        model_type: "rule_engine",
    })
}

pub async fn get_cognitive_profile(pool: &PgPool, user_id: &str) -> CognitiveProfileResponse {
    let chronotype = compute_chronotype(pool, user_id)
        .await
        .ok()
        .filter(|p| p.sample_count >= 20);
    let learning_style = compute_learning_style(pool, user_id)
        .await
        .ok()
        .filter(|p| p.sample_count >= 20);
    CognitiveProfileResponse {
        chronotype,
        learning_style,
    }
}

async fn fetch_records_for_chronotype(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<AnswerRecordChrono>, String> {
    let rows = sqlx::query(r#"SELECT "timestamp", "isCorrect" FROM "answer_records" WHERE "userId" = $1 ORDER BY "timestamp" DESC LIMIT 500"#)
        .bind(user_id).fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
            Some(AnswerRecordChrono {
                timestamp_ms: DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc)
                    .timestamp_millis(),
                is_correct: row.try_get("isCorrect").unwrap_or(false),
            })
        })
        .collect())
}

async fn fetch_records_for_learning_style(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<AnswerRecordInteraction>, String> {
    let rows = sqlx::query(r#"SELECT "timestamp", "dwellTime", "responseTime" FROM "answer_records" WHERE "userId" = $1 ORDER BY "timestamp" DESC LIMIT 200"#)
        .bind(user_id).fetch_all(pool).await.map_err(|e| format!("查询失败: {e}"))?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let ts: NaiveDateTime = row.try_get("timestamp").ok()?;
            Some(AnswerRecordInteraction {
                timestamp_ms: DateTime::<Utc>::from_naive_utc_and_offset(ts, Utc)
                    .timestamp_millis(),
                dwell_time: row
                    .try_get::<Option<i64>, _>("dwellTime")
                    .ok()
                    .flatten()
                    .unwrap_or(0),
                response_time: row.try_get::<Option<i64>, _>("responseTime").ok().flatten(),
            })
        })
        .collect())
}

async fn fetch_tracking_stats(pool: &PgPool, user_id: &str) -> Option<TrackingStats> {
    let row = sqlx::query(
        r#"SELECT "pronunciationClicks", "pauseCount", "pageSwitchCount", "totalInteractions"
           FROM "user_interaction_stats" WHERE "userId" = $1 LIMIT 1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()??;
    Some(TrackingStats {
        pronunciation_clicks: row.try_get("pronunciationClicks").unwrap_or(0),
        pause_count: row.try_get("pauseCount").unwrap_or(0),
        page_switch_count: row.try_get("pageSwitchCount").unwrap_or(0),
        total_interactions: row.try_get("totalInteractions").unwrap_or(0),
    })
}

pub async fn fetch_vark_stats(pool: &PgPool, user_id: &str) -> VarkStats {
    let row = sqlx::query(
        r#"SELECT
            COALESCE(SUM("imageViewCount"), 0) as total_image_view,
            COALESCE(SUM("imageZoomCount"), 0) as total_image_zoom,
            COALESCE(SUM("imageLongPressMs"), 0) as total_image_press,
            COALESCE(SUM("audioPlayCount"), 0) as total_audio_play,
            COALESCE(SUM("audioReplayCount"), 0) as total_audio_replay,
            COALESCE(bool_or("audioSpeedAdjust"), false) as has_speed_adjust,
            COALESCE(SUM("definitionReadMs") + SUM("exampleReadMs"), 0) as total_reading_ms,
            COALESCE(SUM("noteWriteCount"), 0) as total_note_count
        FROM "answer_records"
        WHERE "userId" = $1
          AND "timestamp" > NOW() - INTERVAL '30 days'"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match row {
        Some(r) => VarkStats {
            total_image_view: r.try_get("total_image_view").unwrap_or(0),
            total_image_zoom: r.try_get("total_image_zoom").unwrap_or(0),
            total_image_press_ms: r.try_get("total_image_press").unwrap_or(0),
            total_audio_play: r.try_get("total_audio_play").unwrap_or(0),
            total_audio_replay: r.try_get("total_audio_replay").unwrap_or(0),
            has_speed_adjust: r.try_get("has_speed_adjust").unwrap_or(false),
            total_reading_ms: r.try_get("total_reading_ms").unwrap_or(0),
            total_note_count: r.try_get("total_note_count").unwrap_or(0),
        },
        None => VarkStats::default(),
    }
}

// ========== Write Operations ==========

pub async fn update_reward_profile(
    proxy: &DatabaseProxy,
    user_id: &str,
    profile_id: &str,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "users" SET "rewardProfile" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(profile_id)
        .bind(now)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

pub async fn update_password(
    proxy: &DatabaseProxy,
    user_id: &str,
    new_hash: &str,
) -> Result<(), String> {
    let pool = proxy.pool();
    let now = Utc::now().naive_utc();
    sqlx::query(r#"UPDATE "users" SET "passwordHash" = $1, "updatedAt" = $2 WHERE "id" = $3"#)
        .bind(new_hash)
        .bind(now)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    sqlx::query(r#"DELETE FROM "sessions" WHERE "userId" = $1"#)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn update_learning_style_model(
    pool: &PgPool,
    user_id: &str,
    timestamp_ms: i64,
    image_view_count: i32,
    image_zoom_count: i32,
    image_long_press_ms: i64,
    dwell_time: i64,
    audio_play_count: i32,
    audio_replay_count: i32,
    audio_speed_adjust: bool,
    definition_read_ms: i64,
    example_read_ms: i64,
    note_write_count: i32,
    response_time: Option<i64>,
) -> Result<(), String> {
    let mut classifier = load_vark_model(pool, user_id)
        .await
        .map_err(|e| format!("加载模型失败: {e}"))?
        .unwrap_or_else(VarkClassifier::new);

    let features = VarkFeatures::from_interaction(
        image_view_count,
        image_zoom_count,
        image_long_press_ms,
        dwell_time,
        audio_play_count,
        audio_replay_count,
        audio_speed_adjust,
        definition_read_ms,
        example_read_ms,
        note_write_count,
        response_time,
    );

    let labels = VarkLabels::infer(
        image_view_count,
        image_zoom_count,
        image_long_press_ms,
        dwell_time,
        audio_play_count,
        audio_replay_count,
        note_write_count,
        response_time,
    );

    classifier.update(&features.to_vec(), timestamp_ms, &labels);

    save_vark_model(pool, user_id, &classifier)
        .await
        .map_err(|e| format!("保存模型失败: {e}"))?;

    Ok(())
}

// ========== Helper Functions ==========

fn format_naive_iso(value: NaiveDateTime) -> String {
    DateTime::<Utc>::from_naive_utc_and_offset(value, Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn avg_performance(history: &[LearningHistoryItem], hours: &[i32]) -> f64 {
    let (mut total_samples, mut weighted_sum) = (0i64, 0.0f64);
    for item in history {
        if hours.contains(&item.hour) {
            total_samples += item.sample_count;
            weighted_sum += item.performance * item.sample_count as f64;
        }
    }
    if total_samples == 0 {
        0.0
    } else {
        weighted_sum / total_samples as f64
    }
}

fn identify_peak_hours(history: &[LearningHistoryItem], candidate_hours: &[i32]) -> Vec<i32> {
    let mut candidates: Vec<_> = history
        .iter()
        .filter(|item| candidate_hours.contains(&item.hour))
        .collect();
    if candidates.is_empty() {
        return candidate_hours.iter().copied().take(4).collect();
    }
    candidates.sort_by(|a, b| {
        b.performance
            .partial_cmp(&a.performance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut hours: Vec<i32> = candidates.iter().take(4).map(|item| item.hour).collect();
    hours.sort_unstable();
    hours
}

fn variance(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64
}

fn response_or_avg(value: Option<i64>, avg: f64) -> f64 {
    match value {
        Some(v) if v > 0 => v as f64,
        _ => avg,
    }
}

fn compute_visual_score(avg_dwell_time: f64) -> f64 {
    let dwell_score = (avg_dwell_time / 5000.0).min(1.0);
    let deliberate_score = if avg_dwell_time > 3000.0 { 0.3 } else { 0.0 };
    (dwell_score + deliberate_score).min(1.0)
}

fn compute_auditory_score_with_tracking(
    avg_dwell_time: f64,
    dwell_variance: f64,
    pause_count: i64,
    sample_count: i64,
    tracking: &Option<TrackingStats>,
) -> f64 {
    let cv = if avg_dwell_time > 0.0 {
        dwell_variance.sqrt() / avg_dwell_time
    } else {
        1.0
    };
    let stability_score: f64 = if cv < 0.3 {
        0.35
    } else if cv < 0.5 {
        0.2
    } else {
        0.1
    };
    let dwell_score: f64 = if (3000.0..=6000.0).contains(&avg_dwell_time) {
        0.25
    } else {
        0.1
    };
    let pause_rate = pause_count as f64 / sample_count as f64;
    let pause_score: f64 = if pause_rate > 0.1 { 0.15 } else { 0.1 };
    let pronunciation_score: f64 = match tracking {
        Some(t) if t.total_interactions >= 10 => {
            let click_ratio = t.pronunciation_clicks as f64 / t.total_interactions as f64;
            (click_ratio / 0.25).min(1.0) * 0.25
        }
        _ => 0.0,
    };
    (stability_score + dwell_score + pause_score + pronunciation_score).min(1.0)
}

fn compute_kinesthetic_score_with_tracking(
    avg_response_time: f64,
    response_variance: f64,
    switch_count: i64,
    sample_count: i64,
    tracking: &Option<TrackingStats>,
) -> f64 {
    let speed_score: f64 = if avg_response_time < 2000.0 {
        0.35
    } else if avg_response_time < 3000.0 {
        0.25
    } else {
        0.15
    };
    let switch_rate = switch_count as f64 / sample_count as f64;
    let switch_score: f64 = if switch_rate > 0.2 {
        0.25
    } else if switch_rate > 0.1 {
        0.15
    } else {
        0.1
    };
    let response_cv = if avg_response_time > 0.0 {
        response_variance.sqrt() / avg_response_time
    } else {
        0.0
    };
    let variability_score: f64 = if response_cv > 0.5 { 0.15 } else { 0.1 };
    let page_switch_score: f64 = match tracking {
        Some(t) if t.total_interactions >= 10 => {
            let switch_ratio = t.page_switch_count as f64 / t.total_interactions as f64;
            (switch_ratio / 0.3).min(1.0) * 0.2
        }
        _ => 0.0,
    };
    (speed_score + switch_score + variability_score + page_switch_score).min(1.0)
}

fn compute_reading_score(avg_dwell_time: f64, tracking: &Option<TrackingStats>) -> f64 {
    // Reading score based on dwell time > 5000ms without audio
    if avg_dwell_time <= 5000.0 {
        return 0.0;
    }

    let base_score = ((avg_dwell_time - 5000.0) / 10000.0).min(1.0);

    // Audio discount factor: if there's pronunciation clicks, reduce reading score
    let audio_factor = match tracking {
        Some(t) if t.pronunciation_clicks > 0 => 0.5,
        _ => 1.0,
    };

    (base_score * audio_factor).min(1.0)
}

fn compute_style_confidence(
    scores: &LearningStyleScores,
    sample_count: i64,
    tracking: &Option<TrackingStats>,
) -> f64 {
    // Sample confidence: sample_count / 100, capped at 0.5
    let sample_confidence = (sample_count as f64 / 100.0).min(0.5);

    // Model confidence: difference between max and second max score
    let mut sorted = [
        scores.visual,
        scores.auditory,
        scores.reading,
        scores.kinesthetic,
    ];
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let model_confidence = sorted[0] - sorted[1];

    // Tracking bonus
    let tracking_bonus = if tracking
        .as_ref()
        .map(|t| t.total_interactions >= 20)
        .unwrap_or(false)
    {
        0.05
    } else {
        0.0
    };

    (sample_confidence + model_confidence + tracking_bonus).min(0.95)
}

/// Compute aggregated VARK features from recent answer records for ML prediction
async fn compute_aggregated_features(pool: &PgPool, user_id: &str) -> Result<VarkFeatures, String> {
    let row = sqlx::query(
        r#"SELECT
            COUNT(*) as record_count,
            COALESCE(AVG("imageViewCount"), 0) as avg_image_view,
            COALESCE(AVG("imageZoomCount"), 0) as avg_image_zoom,
            COALESCE(AVG("imageLongPressMs"), 0) as avg_image_press,
            COALESCE(AVG("dwellTime"), 0) as avg_dwell_time,
            COALESCE(AVG("audioPlayCount"), 0) as avg_audio_play,
            COALESCE(AVG("audioReplayCount"), 0) as avg_audio_replay,
            COALESCE(bool_or("audioSpeedAdjust"), false) as has_speed_adjust,
            COALESCE(AVG("definitionReadMs"), 0) as avg_def_read,
            COALESCE(AVG("exampleReadMs"), 0) as avg_example_read,
            COALESCE(AVG("noteWriteCount"), 0) as avg_note_write,
            COALESCE(AVG("responseTime"), 0) as avg_response_time,
            COALESCE(STDDEV("responseTime"), 0) as stddev_response_time
        FROM "answer_records"
        WHERE "userId" = $1
          AND "timestamp" > NOW() - INTERVAL '30 days'"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Query failed: {e}"))?;

    let tracking = fetch_tracking_stats(pool, user_id).await;

    match row {
        Some(r) => {
            let record_count: i64 = r.try_get("record_count").unwrap_or(0);
            if record_count == 0 {
                return Err("No records found".to_string());
            }

            let avg_image_view: f64 = r.try_get("avg_image_view").unwrap_or(0.0);
            let avg_image_zoom: f64 = r.try_get("avg_image_zoom").unwrap_or(0.0);
            let avg_image_press: f64 = r.try_get("avg_image_press").unwrap_or(0.0);
            let avg_dwell_time: f64 = r.try_get("avg_dwell_time").unwrap_or(0.0);
            let avg_audio_play: f64 = r.try_get("avg_audio_play").unwrap_or(0.0);
            let avg_audio_replay: f64 = r.try_get("avg_audio_replay").unwrap_or(0.0);
            let has_speed_adjust: bool = r.try_get("has_speed_adjust").unwrap_or(false);
            let avg_def_read: f64 = r.try_get("avg_def_read").unwrap_or(0.0);
            let avg_example_read: f64 = r.try_get("avg_example_read").unwrap_or(0.0);
            let avg_note_write: f64 = r.try_get("avg_note_write").unwrap_or(0.0);
            let avg_response_time: f64 = r.try_get("avg_response_time").unwrap_or(0.0);
            let stddev_response_time: f64 = r.try_get("stddev_response_time").unwrap_or(0.0);

            let pronunciation_clicks_ratio = match &tracking {
                Some(t) if t.total_interactions > 0 => {
                    t.pronunciation_clicks as f64 / t.total_interactions as f64
                }
                _ => 0.0,
            };

            let page_switch_rate = match &tracking {
                Some(t) if t.total_interactions > 0 => {
                    t.page_switch_count as f64 / t.total_interactions as f64
                }
                _ => 0.0,
            };

            let response_cv = if avg_response_time > 0.0 {
                stddev_response_time / avg_response_time
            } else {
                0.0
            };

            Ok(VarkFeatures {
                img_view_normalized: (avg_image_view / 10.0).min(1.0),
                img_zoom_normalized: (avg_image_zoom / 5.0).min(1.0),
                img_press_normalized: (avg_image_press / 10000.0).min(1.0),
                dwell_for_visual: (avg_dwell_time / 10000.0).min(1.0),
                audio_play_normalized: (avg_audio_play / 5.0).min(1.0),
                audio_replay_normalized: (avg_audio_replay / 3.0).min(1.0),
                speed_adjust: if has_speed_adjust { 1.0 } else { 0.0 },
                pronunciation_clicks: pronunciation_clicks_ratio.min(1.0),
                def_read_normalized: (avg_def_read / 10000.0).min(1.0),
                example_read_normalized: (avg_example_read / 10000.0).min(1.0),
                dwell_for_reading: ((avg_dwell_time - 5000.0).max(0.0) / 10000.0).min(1.0),
                reading_no_audio: if avg_audio_play < 0.1 { 1.0 } else { 0.5 },
                response_speed: 1.0 / (1.0 + avg_response_time / 1000.0),
                response_variance: response_cv.min(1.0),
                page_switch_rate: page_switch_rate.min(1.0),
                note_write_normalized: (avg_note_write / 3.0).min(1.0),
            })
        }
        None => Err("No records found".to_string()),
    }
}

/// Compute learning style with adaptive model selection (rule engine or ML)
pub async fn compute_learning_style_adaptive(
    pool: &PgPool,
    user_id: &str,
) -> Result<LearningStyleProfile, String> {
    // Try to load the ML model
    let classifier = load_vark_model(pool, user_id)
        .await
        .map_err(|e| format!("Failed to load model: {e}"))?;

    match classifier {
        Some(c) if c.is_enabled() => {
            // Use ML model: sample_count >= 50 (cold start threshold)
            let features = match compute_aggregated_features(pool, user_id).await {
                Ok(f) => f,
                Err(_) => {
                    // Fallback to rule engine if aggregated features unavailable
                    return compute_learning_style(pool, user_id).await;
                }
            };

            let scores = c.predict(&features.to_vec());
            let interaction_patterns = compute_interaction_patterns_for_ml(pool, user_id).await;

            Ok(LearningStyleProfile {
                style: scores.dominant_style(),
                style_legacy: scores.legacy_style(),
                confidence: compute_ml_confidence(&scores, c.sample_count),
                sample_count: c.sample_count,
                scores,
                interaction_patterns,
                model_type: "ml_sgd",
            })
        }
        _ => {
            // Use rule engine: sample_count < 50 or no model exists
            compute_learning_style(pool, user_id).await
        }
    }
}

async fn compute_interaction_patterns_for_ml(
    pool: &PgPool,
    user_id: &str,
) -> LearningStyleInteractionPatterns {
    let row = sqlx::query(
        r#"SELECT
            COALESCE(AVG("dwellTime"), 0) as avg_dwell_time,
            COALESCE(AVG("responseTime"), 0) as avg_response_time
        FROM "answer_records"
        WHERE "userId" = $1
          AND "timestamp" > NOW() - INTERVAL '30 days'"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let tracking = fetch_tracking_stats(pool, user_id).await;

    let (avg_dwell_time, avg_response_time) = match row {
        Some(r) => (
            r.try_get("avg_dwell_time").unwrap_or(0.0),
            r.try_get("avg_response_time").unwrap_or(0.0),
        ),
        None => (0.0, 0.0),
    };

    let (pause_frequency, switch_frequency) = match &tracking {
        Some(t) if t.total_interactions >= 10 => (
            t.pause_count as f64 / t.total_interactions as f64,
            t.page_switch_count as f64 / t.total_interactions as f64,
        ),
        _ => (0.0, 0.0),
    };

    LearningStyleInteractionPatterns {
        avg_dwell_time,
        avg_response_time,
        pause_frequency,
        switch_frequency,
    }
}

#[cfg(test)]
mod tests {
    use super::LearningStyleScores;

    #[test]
    fn test_normalize_sums_to_one() {
        let mut scores = LearningStyleScores {
            visual: 0.4,
            auditory: 0.3,
            reading: 0.2,
            kinesthetic: 0.1,
        };
        scores.normalize();
        let total = scores.visual + scores.auditory + scores.reading + scores.kinesthetic;
        assert!((total - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_normalize_uneven_scores() {
        let mut scores = LearningStyleScores {
            visual: 2.0,
            auditory: 3.0,
            reading: 1.0,
            kinesthetic: 4.0,
        };
        scores.normalize();
        let total = scores.visual + scores.auditory + scores.reading + scores.kinesthetic;
        assert!((total - 1.0).abs() < 1e-10);
        assert!((scores.visual - 0.2).abs() < 1e-10);
        assert!((scores.auditory - 0.3).abs() < 1e-10);
        assert!((scores.reading - 0.1).abs() < 1e-10);
        assert!((scores.kinesthetic - 0.4).abs() < 1e-10);
    }

    #[test]
    fn test_normalize_zero_scores_unchanged() {
        let mut scores = LearningStyleScores {
            visual: 0.0,
            auditory: 0.0,
            reading: 0.0,
            kinesthetic: 0.0,
        };
        scores.normalize();
        assert!((scores.visual).abs() < 1e-10);
        assert!((scores.auditory).abs() < 1e-10);
        assert!((scores.reading).abs() < 1e-10);
        assert!((scores.kinesthetic).abs() < 1e-10);
    }

    #[test]
    fn test_variance_uniform_distribution() {
        let scores = LearningStyleScores {
            visual: 0.25,
            auditory: 0.25,
            reading: 0.25,
            kinesthetic: 0.25,
        };
        assert!((scores.variance()).abs() < 1e-10);
    }

    #[test]
    fn test_variance_skewed_distribution() {
        let scores = LearningStyleScores {
            visual: 0.7,
            auditory: 0.1,
            reading: 0.1,
            kinesthetic: 0.1,
        };
        // Expected: ((0.7-0.25)^2 + 3*(0.1-0.25)^2) / 4
        // = (0.2025 + 3*0.0225) / 4 = (0.2025 + 0.0675) / 4 = 0.0675
        let expected = 0.0675;
        assert!((scores.variance() - expected).abs() < 1e-10);
    }

    #[test]
    fn test_is_multimodal_uniform_returns_true() {
        let scores = LearningStyleScores {
            visual: 0.25,
            auditory: 0.25,
            reading: 0.25,
            kinesthetic: 0.25,
        };
        assert!(scores.is_multimodal());
    }

    #[test]
    fn test_is_multimodal_near_uniform_returns_true() {
        let scores = LearningStyleScores {
            visual: 0.26,
            auditory: 0.24,
            reading: 0.25,
            kinesthetic: 0.25,
        };
        // Variance = ((0.01)^2 + (-0.01)^2 + 0 + 0) / 4 = 0.0002 / 4 = 0.00005 < 0.01
        assert!(scores.is_multimodal());
    }

    #[test]
    fn test_is_multimodal_skewed_returns_false() {
        let scores = LearningStyleScores {
            visual: 0.5,
            auditory: 0.2,
            reading: 0.2,
            kinesthetic: 0.1,
        };
        assert!(!scores.is_multimodal());
    }

    #[test]
    fn test_legacy_style_visual() {
        let scores = LearningStyleScores {
            visual: 0.5,
            auditory: 0.2,
            reading: 0.2,
            kinesthetic: 0.1,
        };
        assert_eq!(scores.legacy_style(), "visual");
    }

    #[test]
    fn test_legacy_style_auditory() {
        let scores = LearningStyleScores {
            visual: 0.1,
            auditory: 0.5,
            reading: 0.2,
            kinesthetic: 0.2,
        };
        assert_eq!(scores.legacy_style(), "auditory");
    }

    #[test]
    fn test_legacy_style_kinesthetic() {
        let scores = LearningStyleScores {
            visual: 0.1,
            auditory: 0.2,
            reading: 0.2,
            kinesthetic: 0.5,
        };
        assert_eq!(scores.legacy_style(), "kinesthetic");
    }

    #[test]
    fn test_legacy_style_reading_maps_to_mixed() {
        let scores = LearningStyleScores {
            visual: 0.1,
            auditory: 0.2,
            reading: 0.5,
            kinesthetic: 0.2,
        };
        assert_eq!(scores.legacy_style(), "mixed");
    }

    #[test]
    fn test_legacy_style_multimodal_maps_to_mixed() {
        let scores = LearningStyleScores {
            visual: 0.25,
            auditory: 0.25,
            reading: 0.25,
            kinesthetic: 0.25,
        };
        assert_eq!(scores.legacy_style(), "mixed");
    }
}
