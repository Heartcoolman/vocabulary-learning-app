use std::collections::HashMap;
use std::sync::Arc;

use sqlx::Row;
use tracing::{info, warn};

use crate::db::operations::confusion_cache::insert_confusion_pair;
use crate::db::DatabaseProxy;

const DEFAULT_DISTANCE_THRESHOLD: f64 = 0.30;
const BATCH_SIZE: i64 = 1000;

pub async fn rebuild_confusion_cache(
    db: Arc<DatabaseProxy>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    info!("Confusion cache rebuild started");

    let threshold: f64 = std::env::var("CONFUSION_DISTANCE_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_DISTANCE_THRESHOLD);

    // Clear existing cache
    sqlx::query(r#"DELETE FROM "confusion_pairs_cache""#)
        .execute(db.pool())
        .await?;

    // Get word to cluster mapping
    let cluster_map = build_word_cluster_map(&db).await?;
    info!(clusters = cluster_map.len(), "Loaded word-cluster mappings");

    // Process confusion pairs in batches
    let mut offset: i64 = 0;
    let mut total_saved: i64 = 0;

    loop {
        let pairs = fetch_confusion_pairs(&db, threshold, BATCH_SIZE, offset).await?;
        if pairs.is_empty() {
            break;
        }

        let batch_count = pairs.len();

        for (word1_id, word2_id, word_book_id, distance) in pairs {
            let cluster_id = find_common_cluster(&word1_id, &word2_id, &cluster_map);

            if let Err(e) = insert_confusion_pair(
                &db,
                &word1_id,
                &word2_id,
                &word_book_id,
                cluster_id.as_deref(),
                distance,
                "text-embedding-3-small",
            )
            .await
            {
                warn!(word1 = %word1_id, word2 = %word2_id, error = %e, "Failed to insert pair");
            } else {
                total_saved += 1;
            }
        }

        offset += batch_count as i64;
        info!(processed = offset, saved = total_saved, "Batch completed");
    }

    info!(total = total_saved, "Confusion cache rebuild completed");
    Ok(())
}

pub async fn update_for_word(
    db: &DatabaseProxy,
    word_id: &str,
) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
    let threshold: f64 = std::env::var("CONFUSION_DISTANCE_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_DISTANCE_THRESHOLD);

    // Delete existing pairs for this word
    sqlx::query(
        r#"
        DELETE FROM "confusion_pairs_cache"
        WHERE "word1Id" = $1 OR "word2Id" = $1
        "#,
    )
    .bind(word_id)
    .execute(db.pool())
    .await?;

    // Get word's wordbook
    let word_book_id: Option<String> =
        sqlx::query_scalar(r#"SELECT "wordBookId" FROM "words" WHERE "id" = $1"#)
            .bind(word_id)
            .fetch_optional(db.pool())
            .await?;

    let word_book_id = match word_book_id {
        Some(id) => id,
        None => return Ok(0),
    };

    // Find similar words
    let pairs: Vec<(String, f64)> = sqlx::query(
        r#"
        WITH target AS (
            SELECT "embedding" FROM "word_embeddings" WHERE "wordId" = $1
        )
        SELECT e."wordId" as other_id, (e."embedding" <=> target."embedding") as distance
        FROM "word_embeddings" e
        CROSS JOIN target
        JOIN "words" w ON w."id" = e."wordId"
        WHERE e."wordId" != $1
          AND w."wordBookId" = $2
          AND (e."embedding" <=> target."embedding") < $3
        ORDER BY distance
        LIMIT 100
        "#,
    )
    .bind(word_id)
    .bind(&word_book_id)
    .bind(threshold)
    .fetch_all(db.pool())
    .await?
    .into_iter()
    .map(|r| (r.get("other_id"), r.get("distance")))
    .collect();

    if pairs.is_empty() {
        return Ok(0);
    }

    let cluster_map = build_word_cluster_map(db).await?;
    let mut saved = 0i64;

    for (other_id, distance) in pairs {
        let cluster_id = find_common_cluster(word_id, &other_id, &cluster_map);

        if insert_confusion_pair(
            db,
            word_id,
            &other_id,
            &word_book_id,
            cluster_id.as_deref(),
            distance,
            "text-embedding-3-small",
        )
        .await
        .is_ok()
        {
            saved += 1;
        }
    }

    Ok(saved)
}

async fn fetch_confusion_pairs(
    db: &DatabaseProxy,
    threshold: f64,
    limit: i64,
    offset: i64,
) -> Result<Vec<(String, String, String, f64)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            LEAST(e1."wordId", e2."wordId") as word1_id,
            GREATEST(e1."wordId", e2."wordId") as word2_id,
            w1."wordBookId" as word_book_id,
            (e1."embedding" <=> e2."embedding") as distance
        FROM "word_embeddings" e1
        JOIN "word_embeddings" e2 ON e1."wordId" < e2."wordId"
          AND e1."model" = e2."model"
        JOIN "words" w1 ON w1."id" = e1."wordId"
        JOIN "words" w2 ON w2."id" = e2."wordId"
        WHERE w1."wordBookId" = w2."wordBookId"
          AND (e1."embedding" <=> e2."embedding") < $1
        ORDER BY distance
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(threshold)
    .bind(limit)
    .bind(offset)
    .fetch_all(db.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            (
                r.get("word1_id"),
                r.get("word2_id"),
                r.get("word_book_id"),
                r.get("distance"),
            )
        })
        .collect())
}

async fn build_word_cluster_map(
    db: &DatabaseProxy,
) -> Result<HashMap<String, Vec<String>>, sqlx::Error> {
    let rows = sqlx::query(r#"SELECT "id", "wordIds" FROM "word_clusters""#)
        .fetch_all(db.pool())
        .await?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();

    for row in rows {
        let cluster_id: String = row.get("id");
        let word_ids: Vec<String> = row.get("wordIds");

        for word_id in word_ids {
            map.entry(word_id).or_default().push(cluster_id.clone());
        }
    }

    Ok(map)
}

fn find_common_cluster(
    word1: &str,
    word2: &str,
    cluster_map: &HashMap<String, Vec<String>>,
) -> Option<String> {
    let clusters1 = cluster_map.get(word1)?;
    let clusters2 = cluster_map.get(word2)?;

    for c1 in clusters1 {
        if clusters2.contains(c1) {
            return Some(c1.clone());
        }
    }

    None
}
