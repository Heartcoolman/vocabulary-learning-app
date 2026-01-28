use sqlx::Row;

use crate::db::DatabaseProxy;

#[derive(Debug, Clone)]
pub struct WordEmbeddingRow {
    pub word_id: String,
    pub model: String,
    pub dim: i32,
    pub embedding: Vec<f32>,
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WordForEmbedding {
    pub id: String,
    pub spelling: String,
    pub meanings: Vec<String>,
}

pub async fn upsert_word_embedding(
    proxy: &DatabaseProxy,
    word_id: &str,
    model: &str,
    dim: i32,
    embedding: &[f32],
    content_hash: Option<&str>,
) -> Result<(), sqlx::Error> {
    let embedding_str = format!(
        "[{}]",
        embedding
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    sqlx::query(
        r#"
        INSERT INTO "word_embeddings" ("wordId", "model", "dim", "embedding", "contentHash", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4::vector, $5, NOW(), NOW())
        ON CONFLICT ("wordId") DO UPDATE
        SET "embedding" = EXCLUDED."embedding",
            "model" = EXCLUDED."model",
            "dim" = EXCLUDED."dim",
            "contentHash" = EXCLUDED."contentHash",
            "updatedAt" = NOW()
        "#,
    )
    .bind(word_id)
    .bind(model)
    .bind(dim)
    .bind(&embedding_str)
    .bind(content_hash)
    .execute(proxy.pool())
    .await?;
    Ok(())
}

pub async fn select_words_missing_embeddings(
    proxy: &DatabaseProxy,
    limit: i64,
) -> Result<Vec<WordForEmbedding>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT w."id", w."spelling", w."meanings"
        FROM "words" w
        LEFT JOIN "word_embeddings" e ON e."wordId" = w."id"
        WHERE e."wordId" IS NULL
        ORDER BY w."createdAt" ASC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    let mut items = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        let spelling: String = row.get("spelling");
        let meanings: Vec<String> = row.get("meanings");
        items.push(WordForEmbedding {
            id,
            spelling,
            meanings,
        });
    }
    Ok(items)
}

pub async fn semantic_search_words(
    proxy: &DatabaseProxy,
    embedding: &[f32],
    limit: i64,
    word_book_id: Option<&str>,
) -> Result<Vec<(String, f64)>, sqlx::Error> {
    let embedding_str = format!(
        "[{}]",
        embedding
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );

    let rows = if let Some(wb_id) = word_book_id {
        sqlx::query(
            r#"
            SELECT w."id", (e."embedding" <=> $1::vector) as distance
            FROM "word_embeddings" e
            JOIN "words" w ON w."id" = e."wordId"
            WHERE w."wordBookId" = $2
            ORDER BY e."embedding" <=> $1::vector
            LIMIT $3
            "#,
        )
        .bind(&embedding_str)
        .bind(wb_id)
        .bind(limit)
        .fetch_all(proxy.pool())
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT w."id", (e."embedding" <=> $1::vector) as distance
            FROM "word_embeddings" e
            JOIN "words" w ON w."id" = e."wordId"
            ORDER BY e."embedding" <=> $1::vector
            LIMIT $2
            "#,
        )
        .bind(&embedding_str)
        .bind(limit)
        .fetch_all(proxy.pool())
        .await?
    };

    Ok(rows
        .into_iter()
        .map(|r| {
            let id: String = r.get("id");
            let distance: f64 = r.get("distance");
            (id, distance)
        })
        .collect())
}

pub async fn get_word_embedding(
    proxy: &DatabaseProxy,
    word_id: &str,
) -> Result<Option<Vec<f32>>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT "embedding"::text as embedding_text
        FROM "word_embeddings"
        WHERE "wordId" = $1
        LIMIT 1
        "#,
    )
    .bind(word_id)
    .fetch_optional(proxy.pool())
    .await?;

    match row {
        Some(r) => {
            let embedding_text: String = r.get("embedding_text");
            let embedding = parse_vector_string(&embedding_text);
            Ok(Some(embedding))
        }
        None => Ok(None),
    }
}

pub async fn filter_word_ids_with_embeddings(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if word_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query(
        r#"
        SELECT "wordId"
        FROM "word_embeddings"
        WHERE "wordId" = ANY($1)
        "#,
    )
    .bind(word_ids)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows.into_iter().map(|r| r.get("wordId")).collect())
}

pub async fn find_similar_words(
    proxy: &DatabaseProxy,
    word_id: &str,
    limit: i64,
) -> Result<Vec<(String, f64)>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        WITH target AS (
            SELECT "embedding" FROM "word_embeddings" WHERE "wordId" = $1
        )
        SELECT w."id", (e."embedding" <=> target."embedding") as distance
        FROM "word_embeddings" e
        CROSS JOIN target
        JOIN "words" w ON w."id" = e."wordId"
        WHERE e."wordId" != $1
        ORDER BY e."embedding" <=> target."embedding"
        LIMIT $2
        "#,
    )
    .bind(word_id)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let id: String = r.get("id");
            let distance: f64 = r.get("distance");
            (id, distance)
        })
        .collect())
}

pub async fn get_embedding_stats(proxy: &DatabaseProxy) -> Result<(i64, i64), sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            (SELECT COUNT(*) FROM "word_embeddings") as embedded_count,
            (SELECT COUNT(*) FROM "words") as total_count
        "#,
    )
    .fetch_one(proxy.pool())
    .await?;

    let embedded_count: i64 = row.get("embedded_count");
    let total_count: i64 = row.get("total_count");
    Ok((embedded_count, total_count))
}

pub async fn find_confusion_pairs(
    proxy: &DatabaseProxy,
    word_book_id: Option<&str>,
    threshold: f64,
    limit: i64,
) -> Result<Vec<(String, String, f64)>, sqlx::Error> {
    find_confusion_pairs_paged(proxy, word_book_id, threshold, limit, 0).await
}

pub async fn find_confusion_pairs_paged(
    proxy: &DatabaseProxy,
    word_book_id: Option<&str>,
    threshold: f64,
    limit: i64,
    offset: i64,
) -> Result<Vec<(String, String, f64)>, sqlx::Error> {
    let rows = if let Some(wb_id) = word_book_id {
        sqlx::query(
            r#"
            SELECT
                LEAST(e1."wordId", e2."wordId") as word1_id,
                GREATEST(e1."wordId", e2."wordId") as word2_id,
                (e1."embedding" <=> e2."embedding") as distance
            FROM "word_embeddings" e1
            JOIN "word_embeddings" e2 ON e1."wordId" < e2."wordId"
              AND e1."model" = e2."model"
              AND e1."dim" = e2."dim"
            JOIN "words" w1 ON w1."id" = e1."wordId"
            JOIN "words" w2 ON w2."id" = e2."wordId"
            WHERE w1."wordBookId" = $1
              AND w2."wordBookId" = $1
              AND (e1."embedding" <=> e2."embedding") < $2
            ORDER BY distance ASC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(wb_id)
        .bind(threshold)
        .bind(limit)
        .bind(offset)
        .fetch_all(proxy.pool())
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT
                LEAST(e1."wordId", e2."wordId") as word1_id,
                GREATEST(e1."wordId", e2."wordId") as word2_id,
                (e1."embedding" <=> e2."embedding") as distance
            FROM "word_embeddings" e1
            JOIN "word_embeddings" e2 ON e1."wordId" < e2."wordId"
              AND e1."model" = e2."model"
              AND e1."dim" = e2."dim"
            WHERE (e1."embedding" <=> e2."embedding") < $1
            ORDER BY distance ASC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(threshold)
        .bind(limit)
        .bind(offset)
        .fetch_all(proxy.pool())
        .await?
    };

    Ok(rows
        .into_iter()
        .map(|r| {
            let word1_id: String = r.get("word1_id");
            let word2_id: String = r.get("word2_id");
            let distance: f64 = r.get("distance");
            (word1_id, word2_id, distance)
        })
        .collect())
}

pub async fn get_recent_wrong_word_ids(
    proxy: &DatabaseProxy,
    user_id: &str,
    days: i64,
    limit: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let cutoff_ms = (chrono::Utc::now().timestamp() - days * 86400) * 1000;
    let rows = sqlx::query(
        r#"
        SELECT r."wordId", MAX(r."timestamp") as last_wrong
        FROM "answer_records" r
        WHERE r."userId" = $1
          AND r."isCorrect" = false
          AND r."timestamp" > $2
        GROUP BY r."wordId"
        ORDER BY last_wrong DESC
        LIMIT $3
        "#,
    )
    .bind(user_id)
    .bind(cutoff_ms)
    .bind(limit)
    .fetch_all(proxy.pool())
    .await?;

    Ok(rows.into_iter().map(|r| r.get("wordId")).collect())
}

pub async fn calculate_average_embedding_distance(
    proxy: &DatabaseProxy,
    word_ids: &[String],
) -> Result<f64, sqlx::Error> {
    if word_ids.len() < 2 {
        return Ok(1.0);
    }

    let rows = sqlx::query(
        r#"
        SELECT AVG(distance) as avg_distance
        FROM (
            SELECT (e1."embedding" <=> e2."embedding") as distance
            FROM "word_embeddings" e1
            CROSS JOIN "word_embeddings" e2
            WHERE e1."wordId" = ANY($1)
              AND e2."wordId" = ANY($1)
              AND e1."wordId" < e2."wordId"
        ) sub
        "#,
    )
    .bind(word_ids)
    .fetch_one(proxy.pool())
    .await?;

    let avg_distance: Option<f64> = rows.get("avg_distance");
    Ok(avg_distance.unwrap_or(1.0))
}

fn parse_vector_string(s: &str) -> Vec<f32> {
    let trimmed = s.trim().trim_start_matches('[').trim_end_matches(']');
    trimmed
        .split(',')
        .filter_map(|v| v.trim().parse::<f32>().ok())
        .collect()
}
