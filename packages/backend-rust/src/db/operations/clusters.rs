use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone)]
pub struct ClusterRow {
    pub id: String,
    pub theme_label: String,
    pub representative_word_id: String,
    pub word_ids: Vec<String>,
    pub word_count: i32,
    pub avg_cohesion: f64,
    pub model: String,
    pub dim: i32,
}

pub async fn get_all_clusters(
    proxy: &DatabaseProxy,
    model: &str,
    dim: i32,
) -> Result<Vec<ClusterRow>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT "id", "themeLabel", "representativeWordId", "wordIds",
               "wordCount", "avgCohesion", "model", "dim"
        FROM "word_clusters"
        WHERE "model" = $1 AND "dim" = $2
        ORDER BY "wordCount" DESC
        LIMIT 100
        "#,
    )
    .bind(model)
    .bind(dim)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| ClusterRow {
            id: r.get("id"),
            theme_label: r.get("themeLabel"),
            representative_word_id: r.get("representativeWordId"),
            word_ids: r.get("wordIds"),
            word_count: r.get("wordCount"),
            avg_cohesion: r.get("avgCohesion"),
            model: r.get("model"),
            dim: r.get("dim"),
        })
        .collect())
}

pub async fn get_cluster_by_id(
    proxy: &DatabaseProxy,
    cluster_id: &str,
) -> Result<Option<ClusterRow>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT "id", "themeLabel", "representativeWordId", "wordIds",
               "wordCount", "avgCohesion", "model", "dim"
        FROM "word_clusters"
        WHERE "id" = $1
        "#,
    )
    .bind(cluster_id)
    .fetch_optional(proxy.pool())
    .await?;

    Ok(row.map(|r| ClusterRow {
        id: r.get("id"),
        theme_label: r.get("themeLabel"),
        representative_word_id: r.get("representativeWordId"),
        word_ids: r.get("wordIds"),
        word_count: r.get("wordCount"),
        avg_cohesion: r.get("avgCohesion"),
        model: r.get("model"),
        dim: r.get("dim"),
    }))
}

pub async fn upsert_cluster(
    proxy: &DatabaseProxy,
    theme_label: &str,
    representative_word_id: &str,
    word_ids: &[String],
    avg_cohesion: f64,
    model: &str,
    dim: i32,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let word_count = word_ids.len() as i32;

    sqlx::query(
        r#"
        INSERT INTO "word_clusters" (
            "id", "themeLabel", "representativeWordId", "wordIds",
            "wordCount", "avgCohesion", "model", "dim", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        "#,
    )
    .bind(&id)
    .bind(theme_label)
    .bind(representative_word_id)
    .bind(word_ids)
    .bind(word_count)
    .bind(avg_cohesion)
    .bind(model)
    .bind(dim)
    .execute(proxy.pool())
    .await?;

    Ok(id)
}

pub async fn delete_all_clusters(
    proxy: &DatabaseProxy,
    model: &str,
    dim: i32,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        DELETE FROM "word_clusters"
        WHERE "model" = $1 AND "dim" = $2
        "#,
    )
    .bind(model)
    .bind(dim)
    .execute(proxy.pool())
    .await?;

    Ok(result.rows_affected())
}

pub async fn find_centroid_word(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Option<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(None);
    }

    let row = sqlx::query(
        r#"
        WITH cluster_words AS (
            SELECT "wordId", "embedding"
            FROM "word_embeddings"
            WHERE "wordId" = ANY($1)
        ),
        avg_distances AS (
            SELECT
                a."wordId",
                AVG(a."embedding" <=> b."embedding") as avg_dist
            FROM cluster_words a
            CROSS JOIN cluster_words b
            WHERE a."wordId" != b."wordId"
            GROUP BY a."wordId"
        )
        SELECT "wordId"
        FROM avg_distances
        ORDER BY avg_dist ASC
        LIMIT 1
        "#,
    )
    .bind(word_ids)
    .fetch_optional(proxy.pool())
    .await?;

    Ok(row.map(|r| r.get("wordId")))
}

pub async fn calc_cluster_cohesion(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<f64, sqlx::Error> {
    if word_ids.len() < 2 {
        return Ok(0.0);
    }

    let row = sqlx::query(
        r#"
        WITH cluster_words AS (
            SELECT "wordId", "embedding"
            FROM "word_embeddings"
            WHERE "wordId" = ANY($1)
        )
        SELECT AVG(a."embedding" <=> b."embedding") as avg_distance
        FROM cluster_words a
        CROSS JOIN cluster_words b
        WHERE a."wordId" < b."wordId"
        "#,
    )
    .bind(word_ids)
    .fetch_one(proxy.pool())
    .await?;

    let avg_distance: Option<f64> = row.get("avg_distance");
    Ok(avg_distance.unwrap_or(1.0))
}
