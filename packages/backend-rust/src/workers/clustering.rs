use std::collections::HashSet;
use std::sync::Arc;

use sqlx::Row;
use tracing::info;

use crate::db::operations::clusters::{calc_cluster_cohesion, find_centroid_word};
use crate::db::operations::embeddings::get_embedding_stats;
use crate::db::DatabaseProxy;
use crate::services::embedding_provider::EmbeddingProvider;

const DEFAULT_KNN_K: i32 = 8;
const DEFAULT_DISTANCE_THRESHOLD: f64 = 0.20;
const DEFAULT_MIN_COVERAGE: f64 = 0.5;
const MIN_CLUSTER_SIZE: usize = 3;
const MAX_CLUSTER_SIZE: usize = 50;

pub async fn run_clustering_cycle(db: Arc<DatabaseProxy>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    info!("Clustering cycle started");

    let min_coverage: f64 = std::env::var("CLUSTERING_MIN_COVERAGE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MIN_COVERAGE);

    let knn_k: i32 = std::env::var("CLUSTERING_KNN_K")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_KNN_K)
        .max(1)
        .min(20);

    let distance_threshold: f64 = std::env::var("CLUSTERING_DISTANCE_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_DISTANCE_THRESHOLD)
        .max(0.05)
        .min(0.5);

    let (embedded_count, total_count) = get_embedding_stats(&db).await?;

    if total_count == 0 {
        info!("No words in database, skipping clustering");
        return Ok(());
    }

    let coverage = embedded_count as f64 / total_count as f64;
    if coverage < min_coverage {
        info!(
            coverage = coverage,
            min_coverage = min_coverage,
            "Embedding coverage too low, skipping clustering"
        );
        return Ok(());
    }

    let embedder = EmbeddingProvider::from_db(&db).await;
    let model = embedder.model();
    let dim = embedder.dimension() as i32;

    info!(
        embedded = embedded_count,
        total = total_count,
        coverage = format!("{:.1}%", coverage * 100.0),
        model = model,
        dim = dim,
        "Starting clustering with sufficient coverage"
    );

    let clusters = build_clusters(&db, model, dim, knn_k, distance_threshold).await?;

    if clusters.is_empty() {
        info!("No clusters formed, skipping persistence");
        return Ok(());
    }

    let mut tx = db.pool().begin().await?;

    let deleted = sqlx::query(
        r#"DELETE FROM "word_clusters" WHERE "model" = $1 AND "dim" = $2"#,
    )
    .bind(model)
    .bind(dim)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    info!(deleted = deleted, "Cleared old clusters");

    let mut saved = 0;
    for cluster in clusters {
        if cluster.word_ids.len() < MIN_CLUSTER_SIZE || cluster.word_ids.len() > MAX_CLUSTER_SIZE {
            continue;
        }

        let cohesion = calc_cluster_cohesion(&db, &cluster.word_ids).await?;
        let centroid = find_centroid_word(&db, &cluster.word_ids)
            .await?
            .unwrap_or_else(|| cluster.word_ids[0].clone());

        let theme_label = generate_theme_label(&db, &centroid).await?;

        let id = uuid::Uuid::new_v4().to_string();
        let word_count = cluster.word_ids.len() as i32;

        sqlx::query(
            r#"
            INSERT INTO "word_clusters" (
                "id", "themeLabel", "representativeWordId", "wordIds",
                "wordCount", "avgCohesion", "model", "dim", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            "#,
        )
        .bind(&id)
        .bind(&theme_label)
        .bind(&centroid)
        .bind(&cluster.word_ids)
        .bind(word_count)
        .bind(cohesion)
        .bind(model)
        .bind(dim)
        .execute(&mut *tx)
        .await?;

        saved += 1;
    }

    tx.commit().await?;

    info!(saved = saved, "Clustering cycle completed");
    Ok(())
}

#[derive(Debug)]
struct RawCluster {
    word_ids: Vec<String>,
}

async fn build_clusters(
    db: &DatabaseProxy,
    model: &str,
    dim: i32,
    knn_k: i32,
    distance_threshold: f64,
) -> Result<Vec<RawCluster>, sqlx::Error> {
    // Use a single batch query to get all KNN edges
    info!("Fetching KNN edges with batch query");

    let edges: Vec<(String, String)> = sqlx::query(
        r#"
        SELECT e1."wordId" as word_a, e2."wordId" as word_b
        FROM "word_embeddings" e1
        CROSS JOIN LATERAL (
            SELECT e2."wordId"
            FROM "word_embeddings" e2
            WHERE e2."wordId" != e1."wordId"
              AND e2."model" = $3 AND e2."dim" = $4
              AND (e1."embedding" <=> e2."embedding") < $1
            ORDER BY e1."embedding" <=> e2."embedding"
            LIMIT $2
        ) e2
        WHERE e1."model" = $3 AND e1."dim" = $4
        "#,
    )
    .bind(distance_threshold)
    .bind(knn_k)
    .bind(model)
    .bind(dim)
    .fetch_all(db.pool())
    .await?
    .into_iter()
    .map(|r| (r.get::<String, _>("word_a"), r.get::<String, _>("word_b")))
    .collect();

    info!(edge_count = edges.len(), "KNN edges fetched");

    if edges.is_empty() {
        return Ok(vec![]);
    }

    // Build adjacency list
    let mut neighbors_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    for (word_a, word_b) in edges {
        neighbors_map.entry(word_a).or_default().push(word_b);
    }

    info!(
        words_with_neighbors = neighbors_map.len(),
        "Built adjacency list"
    );

    // Greedy clustering
    let mut assigned: HashSet<String> = HashSet::new();
    let mut clusters: Vec<RawCluster> = Vec::new();

    let mut sorted_words: Vec<_> = neighbors_map.iter().collect();
    sorted_words.sort_by(|a, b| b.1.len().cmp(&a.1.len()));

    for (seed_word, neighbors) in sorted_words {
        if assigned.contains(seed_word) {
            continue;
        }

        let mut cluster_words: Vec<String> = vec![seed_word.clone()];
        assigned.insert(seed_word.clone());

        for neighbor in neighbors {
            if !assigned.contains(neighbor) && cluster_words.len() < MAX_CLUSTER_SIZE {
                cluster_words.push(neighbor.clone());
                assigned.insert(neighbor.clone());
            }
        }

        // Expand one level
        let current_members: Vec<String> = cluster_words.clone();
        for word in current_members {
            if cluster_words.len() >= MAX_CLUSTER_SIZE {
                break;
            }
            if let Some(word_neighbors) = neighbors_map.get(&word) {
                for neighbor in word_neighbors {
                    if !assigned.contains(neighbor) && cluster_words.len() < MAX_CLUSTER_SIZE {
                        cluster_words.push(neighbor.clone());
                        assigned.insert(neighbor.clone());
                    }
                }
            }
        }

        if cluster_words.len() >= MIN_CLUSTER_SIZE {
            clusters.push(RawCluster {
                word_ids: cluster_words,
            });
        }

        if clusters.len() >= 100 {
            break;
        }
    }

    info!(cluster_count = clusters.len(), "Clusters formed");
    Ok(clusters)
}

async fn generate_theme_label(db: &DatabaseProxy, word_id: &str) -> Result<String, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT w."spelling", w."meanings"
        FROM "words" w
        WHERE w."id" = $1
        "#,
    )
    .bind(word_id)
    .fetch_optional(db.pool())
    .await?;

    match row {
        Some(r) => {
            let spelling: String = r.get("spelling");
            let meanings: Vec<String> = r.get("meanings");
            let first_meaning = meanings.first().map(|s| s.as_str()).unwrap_or("");
            let short_meaning = first_meaning.chars().take(10).collect::<String>();
            Ok(format!("📚 {} - {}", spelling, short_meaning))
        }
        None => Ok("📚 未知主题".to_string()),
    }
}
