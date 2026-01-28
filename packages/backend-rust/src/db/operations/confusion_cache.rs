use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone)]
pub struct ConfusionPairRow {
    pub id: String,
    pub word1_id: String,
    pub word2_id: String,
    pub word_book_id: String,
    pub cluster_id: Option<String>,
    pub distance: f64,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct ClusterConfusionCount {
    pub cluster_id: String,
    pub theme_label: String,
    pub pair_count: i64,
}

pub async fn insert_confusion_pair(
    proxy: &DatabaseProxy,
    word1_id: &str,
    word2_id: &str,
    word_book_id: &str,
    cluster_id: Option<&str>,
    distance: f64,
    model: &str,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let (w1, w2) = if word1_id < word2_id {
        (word1_id, word2_id)
    } else {
        (word2_id, word1_id)
    };

    sqlx::query(
        r#"
        INSERT INTO "confusion_pairs_cache" (
            "id", "word1Id", "word2Id", "wordBookId", "clusterId",
            "distance", "model", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT ("word1Id", "word2Id", "model") DO UPDATE
        SET "clusterId" = EXCLUDED."clusterId",
            "distance" = EXCLUDED."distance",
            "updatedAt" = NOW()
        "#,
    )
    .bind(&id)
    .bind(w1)
    .bind(w2)
    .bind(word_book_id)
    .bind(cluster_id)
    .bind(distance)
    .bind(model)
    .execute(proxy.pool())
    .await?;

    Ok(id)
}

pub async fn delete_by_word_id(proxy: &DatabaseProxy, word_id: &str) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        DELETE FROM "confusion_pairs_cache"
        WHERE "word1Id" = $1 OR "word2Id" = $1
        "#,
    )
    .bind(word_id)
    .execute(proxy.pool())
    .await?;

    Ok(result.rows_affected())
}

pub async fn find_by_cluster(
    proxy: &DatabaseProxy,
    cluster_id: &str,
    threshold: f64,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConfusionPairRow>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id", "word1Id", "word2Id", "wordBookId", "clusterId", "distance", "model"
        FROM "confusion_pairs_cache"
        WHERE "clusterId" = $1 AND "distance" < $2
        ORDER BY "distance" ASC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(cluster_id)
    .bind(threshold)
    .bind(limit)
    .bind(offset)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ConfusionPairRow {
            id: r.get("id"),
            word1_id: r.get("word1Id"),
            word2_id: r.get("word2Id"),
            word_book_id: r.get("wordBookId"),
            cluster_id: r.get("clusterId"),
            distance: r.get("distance"),
            model: r.get("model"),
        })
        .collect())
}

pub async fn find_by_wordbook(
    proxy: &DatabaseProxy,
    word_book_id: &str,
    threshold: f64,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConfusionPairRow>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id", "word1Id", "word2Id", "wordBookId", "clusterId", "distance", "model"
        FROM "confusion_pairs_cache"
        WHERE "wordBookId" = $1 AND "distance" < $2
        ORDER BY "distance" ASC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(word_book_id)
    .bind(threshold)
    .bind(limit)
    .bind(offset)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ConfusionPairRow {
            id: r.get("id"),
            word1_id: r.get("word1Id"),
            word2_id: r.get("word2Id"),
            word_book_id: r.get("wordBookId"),
            cluster_id: r.get("clusterId"),
            distance: r.get("distance"),
            model: r.get("model"),
        })
        .collect())
}

pub async fn get_cluster_confusion_counts(
    proxy: &DatabaseProxy,
    threshold: f64,
) -> Result<Vec<ClusterConfusionCount>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT c."clusterId", wc."themeLabel", COUNT(*) as pair_count
        FROM "confusion_pairs_cache" c
        JOIN "word_clusters" wc ON wc."id" = c."clusterId"
        WHERE c."clusterId" IS NOT NULL AND c."distance" < $1
        GROUP BY c."clusterId", wc."themeLabel"
        ORDER BY pair_count DESC
        "#,
    )
    .bind(threshold)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ClusterConfusionCount {
            cluster_id: r.get("clusterId"),
            theme_label: r.get("themeLabel"),
            pair_count: r.get("pair_count"),
        })
        .collect())
}

pub async fn get_cache_stats(
    proxy: &DatabaseProxy,
) -> Result<(i64, Option<chrono::NaiveDateTime>), sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT COUNT(*) as total, MAX("updatedAt") as last_updated
        FROM "confusion_pairs_cache"
        "#,
    )
    .fetch_one(proxy.pool())
    .await?;

    let total: i64 = row.get("total");
    let last_updated: Option<chrono::NaiveDateTime> = row.get("last_updated");
    Ok((total, last_updated))
}

pub async fn clear_all(proxy: &DatabaseProxy) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(r#"DELETE FROM "confusion_pairs_cache""#)
        .execute(proxy.pool())
        .await?;
    Ok(result.rows_affected())
}
