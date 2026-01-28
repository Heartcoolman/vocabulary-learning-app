use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashMap;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserSegment {
    New,
    AtRisk,
    Returning,
    Active,
}

impl UserSegment {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::New => "new",
            Self::AtRisk => "at_risk",
            Self::Returning => "returning",
            Self::Active => "active",
        }
    }
}

pub async fn classify_user(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<UserSegment, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            u."createdAt" as created_at,
            (SELECT COUNT(*) FROM "answer_records" WHERE "userId" = u."id") as total_records,
            (SELECT MAX("timestamp") FROM "answer_records" WHERE "userId" = u."id") as last_activity,
            (SELECT COUNT(DISTINCT DATE("timestamp" / 1000 * INTERVAL '1 second' + TIMESTAMP '1970-01-01'))
             FROM "answer_records"
             WHERE "userId" = u."id"
               AND "timestamp" >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
            ) as study_days_7d,
            (SELECT COUNT(DISTINCT DATE("timestamp" / 1000 * INTERVAL '1 second' + TIMESTAMP '1970-01-01'))
             FROM "answer_records"
             WHERE "userId" = u."id"
               AND "timestamp" >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000
               AND "timestamp" < EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
            ) as study_days_8_30d
        FROM "users" u
        WHERE u."id" = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(proxy.pool())
    .await?;

    let Some(row) = row else {
        return Ok(UserSegment::New);
    };

    let created_at: NaiveDateTime = row
        .try_get("created_at")
        .unwrap_or_else(|_| Utc::now().naive_utc());
    let total_records: i64 = row.try_get("total_records").unwrap_or(0);
    let last_activity_ms: Option<i64> = row.try_get("last_activity").ok();
    let study_days_7d: i64 = row.try_get("study_days_7d").unwrap_or(0);
    let study_days_8_30d: i64 = row.try_get("study_days_8_30d").unwrap_or(0);

    let now = Utc::now().naive_utc();
    let days_since_created = (now - created_at).num_days();

    // C7.G1: new = 注册<7天 AND 学习次数<5
    if days_since_created < 7 && total_records < 5 {
        return Ok(UserSegment::New);
    }

    // C7.G3: at_risk = 连续7天未学习
    if let Some(last_ms) = last_activity_ms {
        let last_activity = chrono::DateTime::from_timestamp_millis(last_ms)
            .map(|dt| dt.naive_utc())
            .unwrap_or(now);
        let days_inactive = (now - last_activity).num_days();

        if days_inactive >= 7 {
            // C7.G4: returning = >30天未学习后最近7天有活动
            // (but if days_inactive >= 7, they are NOT active in last 7 days, so not returning)
            return Ok(UserSegment::AtRisk);
        }
    } else if total_records == 0 {
        // Never had any activity
        return Ok(UserSegment::AtRisk);
    }

    // C7.G4: returning = >30天未学习后最近7天有活动
    // Check if there was a gap of >30 days before recent activity
    if study_days_7d > 0 && study_days_8_30d == 0 && total_records >= 5 {
        // Had activity in last 7 days, but no activity in days 8-30, and had older activity
        let had_old_activity = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM "answer_records"
            WHERE "userId" = $1
              AND "timestamp" < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000
            "#,
        )
        .bind(user_id)
        .fetch_one(proxy.pool())
        .await
        .unwrap_or(0);

        if had_old_activity > 0 {
            return Ok(UserSegment::Returning);
        }
    }

    // C7.G2: active = 7天内学习天数≥3
    if study_days_7d >= 3 {
        return Ok(UserSegment::Active);
    }

    // Default fallback based on priority: new > at_risk > returning > active
    // If not fitting clear criteria, classify based on activity level
    if study_days_7d > 0 {
        Ok(UserSegment::Active)
    } else {
        Ok(UserSegment::AtRisk)
    }
}

pub async fn classify_users_batch(
    proxy: &DatabaseProxy,
    user_ids: &[String],
) -> Result<Vec<(String, UserSegment)>, sqlx::Error> {
    let mut results = Vec::with_capacity(user_ids.len());
    for user_id in user_ids {
        let segment = classify_user(proxy, user_id).await?;
        results.push((user_id.clone(), segment));
    }
    Ok(results)
}

pub async fn get_segment_counts(
    proxy: &DatabaseProxy,
) -> Result<Vec<(UserSegment, i64)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE
                u."createdAt" >= NOW() - INTERVAL '7 days'
                AND (SELECT COUNT(*) FROM "answer_records" WHERE "userId" = u."id") < 5
            ) as new_count,
            COUNT(*) FILTER (WHERE
                NOT EXISTS (
                    SELECT 1 FROM "answer_records" ar
                    WHERE ar."userId" = u."id"
                      AND ar."timestamp" >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
                )
                AND NOT (
                    u."createdAt" >= NOW() - INTERVAL '7 days'
                    AND (SELECT COUNT(*) FROM "answer_records" WHERE "userId" = u."id") < 5
                )
            ) as at_risk_count,
            COUNT(*) FILTER (WHERE
                EXISTS (
                    SELECT 1 FROM "answer_records" ar
                    WHERE ar."userId" = u."id"
                      AND ar."timestamp" >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
                )
                AND (
                    SELECT COUNT(DISTINCT DATE("timestamp" / 1000 * INTERVAL '1 second' + TIMESTAMP '1970-01-01'))
                    FROM "answer_records"
                    WHERE "userId" = u."id"
                      AND "timestamp" >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000
                ) >= 3
            ) as active_count
        FROM "users" u
        "#,
    )
    .fetch_one(proxy.pool())
    .await?;

    let new_count: i64 = row.try_get("new_count").unwrap_or(0);
    let at_risk_count: i64 = row.try_get("at_risk_count").unwrap_or(0);
    let active_count: i64 = row.try_get("active_count").unwrap_or(0);

    let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "users""#)
        .fetch_one(proxy.pool())
        .await
        .unwrap_or(0);

    let returning_count = total - new_count - at_risk_count - active_count;

    Ok(vec![
        (UserSegment::New, new_count),
        (UserSegment::AtRisk, at_risk_count),
        (UserSegment::Returning, returning_count.max(0)),
        (UserSegment::Active, active_count),
    ])
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProficiencyLevel {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LearningPaceLevel {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityLevel {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentAnalysis {
    pub segments: Vec<SegmentCombinationCount>,
    pub summary: SegmentSummary,
    pub total_users: i64,
    pub qualified_users: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentSummary {
    pub proficiency: DimensionSummary,
    pub learning_pace: DimensionSummary,
    pub activity: DimensionSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct DimensionSummary {
    pub high: i64,
    pub medium: i64,
    pub low: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentCombinationCount {
    pub proficiency: ProficiencyLevel,
    pub learning_pace: LearningPaceLevel,
    pub activity: ActivityLevel,
    pub count: i64,
}

fn proficiency_from_rate(correct_rate: f64) -> ProficiencyLevel {
    if correct_rate > 0.7 {
        ProficiencyLevel::High
    } else if correct_rate >= 0.3 {
        ProficiencyLevel::Medium
    } else {
        ProficiencyLevel::Low
    }
}

fn learning_pace_from_days(days_per_week: i64) -> LearningPaceLevel {
    if days_per_week >= 5 {
        LearningPaceLevel::High
    } else if days_per_week >= 2 {
        LearningPaceLevel::Medium
    } else {
        LearningPaceLevel::Low
    }
}

fn activity_from_sessions(sessions_7d: i64) -> ActivityLevel {
    if sessions_7d >= 7 {
        ActivityLevel::High
    } else if sessions_7d >= 3 {
        ActivityLevel::Medium
    } else {
        ActivityLevel::Low
    }
}

pub async fn get_multidimensional_segment_analysis(
    proxy: &DatabaseProxy,
) -> Result<SegmentAnalysis, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            ar."userId" as user_id,
            COUNT(*) as total_answers,
            SUM(CASE WHEN ar."isCorrect" THEN 1 ELSE 0 END) as correct_answers,
            COUNT(DISTINCT DATE(ar."timestamp")) as study_days_total,
            COUNT(DISTINCT DATE(ar."timestamp"))
                FILTER (WHERE ar."timestamp" >= NOW() - INTERVAL '7 days') as study_days_7d,
            COUNT(DISTINCT ar."sessionId")
                FILTER (WHERE ar."timestamp" >= NOW() - INTERVAL '7 days') as session_count_7d
        FROM "answer_records" ar
        GROUP BY ar."userId"
        "#,
    )
    .fetch_all(proxy.pool())
    .await?;

    let total_users: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "users""#)
        .fetch_one(proxy.pool())
        .await
        .unwrap_or(0);

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    struct SegmentKey {
        proficiency: ProficiencyLevel,
        learning_pace: LearningPaceLevel,
        activity: ActivityLevel,
    }

    let mut counts: HashMap<SegmentKey, i64> = HashMap::new();
    let mut prof_summary = DimensionSummary {
        high: 0,
        medium: 0,
        low: 0,
    };
    let mut pace_summary = DimensionSummary {
        high: 0,
        medium: 0,
        low: 0,
    };
    let mut act_summary = DimensionSummary {
        high: 0,
        medium: 0,
        low: 0,
    };
    let mut qualified_users = 0i64;

    for row in rows {
        let total_answers: i64 = row.try_get("total_answers").unwrap_or(0);
        let correct_answers: i64 = row.try_get("correct_answers").unwrap_or(0);
        let study_days_total: i64 = row.try_get("study_days_total").unwrap_or(0);
        let study_days_7d: i64 = row.try_get("study_days_7d").unwrap_or(0);
        let session_count_7d: i64 = row.try_get("session_count_7d").unwrap_or(0);

        if study_days_total < 3 || total_answers == 0 {
            continue;
        }

        qualified_users += 1;
        let correct_rate = correct_answers as f64 / total_answers as f64;
        let proficiency = proficiency_from_rate(correct_rate);
        let learning_pace = learning_pace_from_days(study_days_7d);
        let activity = activity_from_sessions(session_count_7d);

        match proficiency {
            ProficiencyLevel::High => prof_summary.high += 1,
            ProficiencyLevel::Medium => prof_summary.medium += 1,
            ProficiencyLevel::Low => prof_summary.low += 1,
        }
        match learning_pace {
            LearningPaceLevel::High => pace_summary.high += 1,
            LearningPaceLevel::Medium => pace_summary.medium += 1,
            LearningPaceLevel::Low => pace_summary.low += 1,
        }
        match activity {
            ActivityLevel::High => act_summary.high += 1,
            ActivityLevel::Medium => act_summary.medium += 1,
            ActivityLevel::Low => act_summary.low += 1,
        }

        let key = SegmentKey {
            proficiency,
            learning_pace,
            activity,
        };
        *counts.entry(key).or_insert(0) += 1;
    }

    let proficiency_levels = [
        ProficiencyLevel::High,
        ProficiencyLevel::Medium,
        ProficiencyLevel::Low,
    ];
    let learning_pace_levels = [
        LearningPaceLevel::High,
        LearningPaceLevel::Medium,
        LearningPaceLevel::Low,
    ];
    let activity_levels = [
        ActivityLevel::High,
        ActivityLevel::Medium,
        ActivityLevel::Low,
    ];

    let mut segments = Vec::with_capacity(27);
    for &proficiency in &proficiency_levels {
        for &learning_pace in &learning_pace_levels {
            for &activity in &activity_levels {
                let key = SegmentKey {
                    proficiency,
                    learning_pace,
                    activity,
                };
                let count = *counts.get(&key).unwrap_or(&0);
                segments.push(SegmentCombinationCount {
                    proficiency,
                    learning_pace,
                    activity,
                    count,
                });
            }
        }
    }

    Ok(SegmentAnalysis {
        segments,
        summary: SegmentSummary {
            proficiency: prof_summary,
            learning_pace: pace_summary,
            activity: act_summary,
        },
        total_users,
        qualified_users,
    })
}

// ==================== 留存率计算 ====================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetentionPeriodType {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionDataPoint {
    pub period: String,
    pub cohort_size: i64,
    pub retained_count: i64,
    pub rate: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionAnalysis {
    pub period_type: RetentionPeriodType,
    pub data_points: Vec<RetentionDataPoint>,
    pub cohort_start_date: String,
    pub cohort_end_date: String,
    pub total_cohort_size: i64,
}

pub async fn calculate_retention(
    proxy: &DatabaseProxy,
    period_type: RetentionPeriodType,
    cohort_days: i32,
) -> Result<RetentionAnalysis, sqlx::Error> {
    let now = Utc::now();
    let cohort_end = now - chrono::Duration::days(1);
    let cohort_start = cohort_end - chrono::Duration::days(cohort_days as i64);

    let periods = match period_type {
        RetentionPeriodType::Daily => 30,
        RetentionPeriodType::Weekly => 12,
        RetentionPeriodType::Monthly => 6,
    };

    // 获取 cohort 用户（在指定日期范围内注册的用户）
    let cohort_users: Vec<(String, chrono::NaiveDateTime)> = sqlx::query_as(
        r#"
        SELECT "id", "createdAt"
        FROM "users"
        WHERE "createdAt" >= $1 AND "createdAt" < $2
        "#,
    )
    .bind(cohort_start)
    .bind(cohort_end)
    .fetch_all(proxy.pool())
    .await?;

    let cohort_size = cohort_users.len() as i64;
    if cohort_size == 0 {
        return Ok(RetentionAnalysis {
            period_type,
            data_points: vec![],
            cohort_start_date: cohort_start.format("%Y-%m-%d").to_string(),
            cohort_end_date: cohort_end.format("%Y-%m-%d").to_string(),
            total_cohort_size: 0,
        });
    }

    let user_ids: Vec<String> = cohort_users.iter().map(|(id, _)| id.clone()).collect();

    // 构建留存率查询
    let mut data_points = Vec::with_capacity(periods);

    for period_num in 1..=periods {
        let period_label = match period_type {
            RetentionPeriodType::Daily => format!("D{}", period_num),
            RetentionPeriodType::Weekly => format!("W{}", period_num),
            RetentionPeriodType::Monthly => format!("M{}", period_num),
        };

        // 计算每个用户在第 N 个周期是否活跃
        // 使用 UTC+8 时区
        let query = match period_type {
            RetentionPeriodType::Daily => format!(
                r#"
                SELECT COUNT(DISTINCT ar."userId") as retained
                FROM "answer_records" ar
                JOIN "users" u ON ar."userId" = u."id"
                WHERE u."id" = ANY($1)
                  AND DATE(ar."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')
                      = DATE(u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai') + INTERVAL '{} days'
                "#,
                period_num
            ),
            RetentionPeriodType::Weekly => format!(
                r#"
                SELECT COUNT(DISTINCT ar."userId") as retained
                FROM "answer_records" ar
                JOIN "users" u ON ar."userId" = u."id"
                WHERE u."id" = ANY($1)
                  AND DATE(ar."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')
                      >= DATE(u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai') + INTERVAL '{} weeks'
                  AND DATE(ar."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')
                      < DATE(u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai') + INTERVAL '{} weeks'
                "#,
                period_num - 1,
                period_num
            ),
            RetentionPeriodType::Monthly => format!(
                r#"
                SELECT COUNT(DISTINCT ar."userId") as retained
                FROM "answer_records" ar
                JOIN "users" u ON ar."userId" = u."id"
                WHERE u."id" = ANY($1)
                  AND DATE(ar."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')
                      >= DATE(u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai') + INTERVAL '{} months'
                  AND DATE(ar."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')
                      < DATE(u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai') + INTERVAL '{} months'
                "#,
                period_num - 1,
                period_num
            ),
        };

        let retained_count: i64 = sqlx::query_scalar(&query)
            .bind(&user_ids)
            .fetch_one(proxy.pool())
            .await
            .unwrap_or(0);

        let rate = if cohort_size > 0 {
            (retained_count as f64 / cohort_size as f64 * 100.0 * 100.0).round() / 100.0
        } else {
            0.0
        };

        data_points.push(RetentionDataPoint {
            period: period_label,
            cohort_size,
            retained_count,
            rate,
        });
    }

    Ok(RetentionAnalysis {
        period_type,
        data_points,
        cohort_start_date: cohort_start.format("%Y-%m-%d").to_string(),
        cohort_end_date: cohort_end.format("%Y-%m-%d").to_string(),
        total_cohort_size: cohort_size,
    })
}
