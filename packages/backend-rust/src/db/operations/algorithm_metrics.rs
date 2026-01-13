use chrono::{DateTime, NaiveDate, Utc};
use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone)]
pub struct AlgorithmMetricsDailyRow {
    pub algorithm_id: String,
    pub day: NaiveDate,
    pub call_count: i64,
    pub total_latency_us: i64,
    pub error_count: i64,
    pub last_called_at: Option<DateTime<Utc>>,
}

pub async fn upsert_algorithm_metrics_daily(
    proxy: &DatabaseProxy,
    day: NaiveDate,
    algorithm_id: &str,
    call_count_delta: u64,
    total_latency_us_delta: u64,
    error_count_delta: u64,
    last_called_at: Option<DateTime<Utc>>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO "algorithm_metrics_daily"
            ("algorithmId","day","callCount","totalLatencyUs","errorCount","lastCalledAt","createdAt","updatedAt")
        VALUES
            ($1,$2,$3,$4,$5,$6,NOW(),NOW())
        ON CONFLICT ("algorithmId","day") DO UPDATE
        SET
            "callCount" = "algorithm_metrics_daily"."callCount" + EXCLUDED."callCount",
            "totalLatencyUs" = "algorithm_metrics_daily"."totalLatencyUs" + EXCLUDED."totalLatencyUs",
            "errorCount" = "algorithm_metrics_daily"."errorCount" + EXCLUDED."errorCount",
            "lastCalledAt" = CASE
                WHEN "algorithm_metrics_daily"."lastCalledAt" IS NULL THEN EXCLUDED."lastCalledAt"
                WHEN EXCLUDED."lastCalledAt" IS NULL THEN "algorithm_metrics_daily"."lastCalledAt"
                ELSE GREATEST("algorithm_metrics_daily"."lastCalledAt", EXCLUDED."lastCalledAt")
            END,
            "updatedAt" = NOW()
        "#,
        algorithm_id,
        day,
        call_count_delta as i64,
        total_latency_us_delta as i64,
        error_count_delta as i64,
        last_called_at.map(|dt| dt.naive_utc()),
    )
    .execute(proxy.pool())
    .await?;

    Ok(())
}

pub async fn list_algorithm_metrics_daily(
    proxy: &DatabaseProxy,
    start_date: NaiveDate,
    end_date: NaiveDate,
    algorithm_id: Option<&str>,
) -> Result<Vec<AlgorithmMetricsDailyRow>, sqlx::Error> {
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        r#"
        SELECT
            "algorithmId",
            "day",
            "callCount",
            "totalLatencyUs",
            "errorCount",
            "lastCalledAt"
        FROM "algorithm_metrics_daily"
        WHERE "day" >=
        "#,
    );
    qb.push_bind(start_date);
    qb.push(r#" AND "day" <= "#);
    qb.push_bind(end_date);

    if let Some(id) = algorithm_id {
        qb.push(r#" AND "algorithmId" = "#);
        qb.push_bind(id);
    }

    qb.push(r#" ORDER BY "day" DESC, "algorithmId" ASC"#);

    let rows = qb.build().fetch_all(proxy.pool()).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let algorithm_id: String = row.try_get("algorithmId")?;
        let day: NaiveDate = row.try_get("day")?;
        let call_count: i64 = row.try_get("callCount")?;
        let total_latency_us: i64 = row.try_get("totalLatencyUs")?;
        let error_count: i64 = row.try_get("errorCount")?;
        let last_called_at: Option<DateTime<Utc>> = row.try_get("lastCalledAt")?;

        out.push(AlgorithmMetricsDailyRow {
            algorithm_id,
            day,
            call_count,
            total_latency_us,
            error_count,
            last_called_at,
        });
    }

    Ok(out)
}
