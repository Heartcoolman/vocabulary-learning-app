use crate::amas::decision::ensemble::AlgorithmPerformance;
use crate::db::DatabaseProxy;

pub async fn upsert_algorithm_performance(
    proxy: &DatabaseProxy,
    user_id: &str,
    algorithm_id: &str,
    perf: &AlgorithmPerformance,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO "algorithm_performance"
            ("userId", "algorithmId", "emaReward", "sampleCount", "trustScore", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT ("userId", "algorithmId") DO UPDATE SET
            "emaReward" = EXCLUDED."emaReward",
            "sampleCount" = EXCLUDED."sampleCount",
            "trustScore" = EXCLUDED."trustScore",
            "updatedAt" = NOW()
    "#,
    )
    .bind(user_id)
    .bind(algorithm_id)
    .bind(perf.ema_reward)
    .bind(perf.sample_count as i64)
    .bind(perf.trust_score)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn load_algorithm_performance(
    proxy: &DatabaseProxy,
    user_id: &str,
) -> Result<Vec<(String, AlgorithmPerformance)>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, f64, i64, f64)>(
        r#"
        SELECT "algorithmId", "emaReward", "sampleCount", "trustScore"
        FROM "algorithm_performance"
        WHERE "userId" = $1
    "#,
    )
    .bind(user_id)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|(alg, ema, count, trust)| {
            (
                alg,
                AlgorithmPerformance {
                    ema_reward: ema,
                    sample_count: count as u64,
                    trust_score: trust,
                },
            )
        })
        .collect())
}
