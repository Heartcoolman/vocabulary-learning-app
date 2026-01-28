use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

const HEALTH_CACHE_TTL_SECS: u64 = 60;

use crate::db::operations::clusters::{get_all_clusters, get_cluster_by_id};
use crate::db::operations::confusion_cache::{
    find_by_cluster, find_by_wordbook, get_cache_stats, get_cluster_confusion_counts,
};
use crate::db::operations::content::get_words_by_ids;
use crate::db::operations::embeddings::{
    find_similar_words, get_embedding_stats, get_word_embedding, select_words_missing_embeddings,
    semantic_search_words, upsert_word_embedding,
};
use crate::db::DatabaseProxy;
use crate::response::{json_error, AppError};
use crate::services::embedding_provider::EmbeddingProvider;
use crate::state::AppState;
use crate::workers::confusion_cache::rebuild_confusion_cache;

#[derive(Debug, Serialize)]
struct SuccessResponse<T> {
    success: bool,
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    query: String,
    limit: Option<i64>,
    word_book_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WordResult {
    id: String,
    spelling: String,
    phonetic: String,
    meanings: Vec<String>,
    examples: Vec<String>,
    audio_url: Option<String>,
    distance: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    words: Vec<WordResult>,
    query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchEmbedRequest {
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchEmbedResponse {
    count: usize,
    model: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatsResponse {
    embedded_count: i64,
    total_count: i64,
    coverage: f64,
    model: String,
    dimension: usize,
    available: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfusionPairsRequest {
    word_book_id: Option<String>,
    cluster_id: Option<String>,
    threshold: Option<f64>,
    limit: Option<i64>,
    page: Option<i64>,
    page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfusionPair {
    word1: WordResult,
    word2: WordResult,
    distance: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorAnalysisResponse {
    total_errors: i64,
    analyzed_words: i64,
    average_distance: f64,
    is_clustered: bool,
    suggestion: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterResponse {
    id: String,
    theme_label: String,
    representative_word: WordResult,
    word_count: i32,
    avg_cohesion: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterDetailResponse {
    id: String,
    theme_label: String,
    representative_word: WordResult,
    words: Vec<WordResult>,
    word_count: i32,
    avg_cohesion: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheckResponse {
    healthy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    model: String,
    cached: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterConfusionResponse {
    cluster_id: String,
    theme_label: String,
    pair_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStatusResponse {
    total_pairs: i64,
    last_updated: Option<String>,
    ready: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfusionByClusterQuery {
    threshold: Option<f64>,
}

const MAX_GLOBAL_CONFUSION_TOTAL: i64 = 5000;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/search", post(search))
        .route("/similar/:wordId", get(similar))
        .route("/batch", post(batch_embed))
        .route("/stats", get(stats))
        .route("/confusion-pairs", post(confusion_pairs))
        .route("/confusion-by-cluster", get(confusion_by_cluster))
        .route("/confusion-cache/status", get(confusion_cache_status))
        .route("/confusion-cache/rebuild", post(confusion_cache_rebuild))
        .route("/error-analysis", get(error_analysis))
        .route("/clusters", get(clusters))
        .route("/clusters/:clusterId", get(cluster_detail))
}

async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SearchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let limit = payload.limit.unwrap_or(20).clamp(1, 100);

    let embedder = EmbeddingProvider::from_db(&proxy).await;
    if !embedder.is_available() {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "EMBEDDING_NOT_CONFIGURED",
            "向量服务未配置",
        ));
    }

    let query_embedding = embedder.embed_text(&payload.query).await.map_err(|e| {
        tracing::warn!(error = %e, "Embedding generation failed");
        json_error(StatusCode::BAD_GATEWAY, "EMBEDDING_ERROR", "向量生成失败")
    })?;

    let results = semantic_search_words(
        &proxy,
        &query_embedding,
        limit,
        payload.word_book_id.as_deref(),
    )
    .await
    .map_err(|e| {
        tracing::warn!(error = %e, "Semantic search failed");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "SEARCH_ERROR",
            "语义搜索失败",
        )
    })?;

    let word_ids: Vec<String> = results.iter().map(|(id, _)| id.clone()).collect();

    let words = get_words_by_ids(&proxy, &word_ids).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch words");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取单词失败",
        )
    })?;

    let words_map: HashMap<String, _> = words.into_iter().map(|w| (w.id.clone(), w)).collect();
    let word_results: Vec<WordResult> = results
        .iter()
        .filter_map(|(id, distance)| {
            words_map.get(id).map(|w| WordResult {
                distance: *distance,
                id: w.id.clone(),
                spelling: w.spelling.clone(),
                phonetic: w.phonetic.clone(),
                meanings: w.meanings.clone(),
                examples: w.examples.clone(),
                audio_url: w.audio_url.clone(),
            })
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: SearchResponse {
            words: word_results,
            query: payload.query,
        },
    }))
}

async fn similar(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(word_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let limit = query
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(10)
        .clamp(1, 50);

    let embedding = get_word_embedding(&proxy, &word_id).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to get word embedding");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取向量失败",
        )
    })?;

    if embedding.is_none() {
        return Err(json_error(
            StatusCode::NOT_FOUND,
            "EMBEDDING_NOT_FOUND",
            "该单词尚未生成向量",
        ));
    }

    let results = find_similar_words(&proxy, &word_id, limit)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Similar words search failed");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "SEARCH_ERROR",
                "相似词搜索失败",
            )
        })?;

    let word_ids: Vec<String> = results.iter().map(|(id, _)| id.clone()).collect();

    let words = get_words_by_ids(&proxy, &word_ids).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch words");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取单词失败",
        )
    })?;

    let words_map: HashMap<String, _> = words.into_iter().map(|w| (w.id.clone(), w)).collect();
    let word_results: Vec<WordResult> = results
        .iter()
        .filter_map(|(id, distance)| {
            words_map.get(id).map(|w| WordResult {
                distance: *distance,
                id: w.id.clone(),
                spelling: w.spelling.clone(),
                phonetic: w.phonetic.clone(),
                meanings: w.meanings.clone(),
                examples: w.examples.clone(),
                audio_url: w.audio_url.clone(),
            })
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: word_results,
    }))
}

async fn batch_embed(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchEmbedRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    if user.role != "ADMIN" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "需要管理员权限",
        ));
    }

    let limit = payload.limit.unwrap_or(500).clamp(1, 2000);

    let embedder = EmbeddingProvider::from_db(&proxy).await;
    if !embedder.is_available() {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "EMBEDDING_NOT_CONFIGURED",
            "向量服务未配置",
        ));
    }

    let items = select_words_missing_embeddings(&proxy, limit)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to fetch words for embedding");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "FETCH_ERROR",
                "获取待处理单词失败",
            )
        })?;

    if items.is_empty() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: BatchEmbedResponse {
                count: 0,
                model: embedder.model().to_string(),
            },
        }));
    }

    let inputs: Vec<String> = items
        .iter()
        .map(|w| format!("{}\n{}", w.spelling, w.meanings.join("; ")))
        .collect();

    let vectors = embedder.embed_texts(&inputs).await.map_err(|e| {
        tracing::warn!(error = %e, "Batch embedding failed");
        json_error(
            StatusCode::BAD_GATEWAY,
            "EMBEDDING_ERROR",
            "批量向量生成失败",
        )
    })?;

    let model = embedder.model().to_string();
    let dim = embedder.dimension() as i32;

    for (idx, word) in items.iter().enumerate() {
        if let Some(embedding) = vectors.get(idx) {
            if let Err(e) =
                upsert_word_embedding(&proxy, &word.id, &model, dim, embedding, None).await
            {
                tracing::warn!(error = %e, word_id = %word.id, "Failed to save embedding");
            }
        }
    }

    Ok(Json(SuccessResponse {
        success: true,
        data: BatchEmbedResponse {
            count: items.len(),
            model,
        },
    }))
}

async fn stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let embedder = EmbeddingProvider::from_db(&proxy).await;

    let (embedded_count, total_count) = get_embedding_stats(&proxy).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to get embedding stats");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "STATS_ERROR",
            "获取统计信息失败",
        )
    })?;

    let coverage = if total_count > 0 {
        (embedded_count as f64 / total_count as f64 * 100.0).round() / 100.0
    } else {
        0.0
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: StatsResponse {
            embedded_count,
            total_count,
            coverage,
            model: embedder.model().to_string(),
            dimension: embedder.dimension(),
            available: embedder.is_available(),
        },
    }))
}

async fn error_analysis(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    use crate::db::operations::embeddings::{
        calculate_average_embedding_distance, filter_word_ids_with_embeddings,
        get_recent_wrong_word_ids,
    };

    let word_ids = get_recent_wrong_word_ids(&proxy, &user.id, 30, 50)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to get recent wrong words");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "查询错题失败",
            )
        })?;

    let total_errors = word_ids.len() as i64;

    if word_ids.is_empty() {
        return Ok(Json(SuccessResponse {
            success: true,
            data: ErrorAnalysisResponse {
                total_errors: 0,
                analyzed_words: 0,
                average_distance: 0.0,
                is_clustered: false,
                suggestion: "暂无错题数据".to_string(),
            },
        }));
    }

    let embedded_word_ids = filter_word_ids_with_embeddings(&proxy, &word_ids)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to filter embeddings for wrong words");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "EMBEDDING_QUERY_ERROR",
                "查询向量数据失败",
            )
        })?;

    let analyzed_words = embedded_word_ids.len() as i64;
    if total_errors < 5 || analyzed_words < 2 {
        return Ok(Json(SuccessResponse {
            success: true,
            data: ErrorAnalysisResponse {
                total_errors,
                analyzed_words,
                average_distance: 0.0,
                is_clustered: false,
                suggestion: "错题数量或向量数据不足，暂无法进行语义聚类分析".to_string(),
            },
        }));
    }

    let avg_distance = calculate_average_embedding_distance(&proxy, &embedded_word_ids)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to calculate average distance");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "CALCULATION_ERROR",
                "计算平均距离失败",
            )
        })?;

    let is_clustered = avg_distance < 0.3;
    let suggestion = if is_clustered {
        "您的错题具有语义聚类特征，建议重点复习相似词汇的区别".to_string()
    } else {
        "您的错题分布较为分散，建议加强整体记忆".to_string()
    };

    Ok(Json(SuccessResponse {
        success: true,
        data: ErrorAnalysisResponse {
            total_errors,
            analyzed_words,
            average_distance: avg_distance,
            is_clustered,
            suggestion,
        },
    }))
}

async fn confusion_pairs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ConfusionPairsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let threshold = payload.threshold.unwrap_or(0.15).clamp(0.05, 0.3);
    let page = payload.page.unwrap_or(1).max(1);
    let page_size = payload
        .page_size
        .or(payload.limit)
        .unwrap_or(20)
        .clamp(1, 100);
    let offset = (page - 1) * page_size;
    let limit = page_size;

    // Use cache when cluster_id or word_book_id is provided
    let pairs: Vec<(String, String, f64)> = if let Some(ref cluster_id) = payload.cluster_id {
        find_by_cluster(&proxy, cluster_id, threshold, limit, offset)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "Failed to find cached confusion pairs by cluster");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "QUERY_ERROR",
                    "查询混淆词对失败",
                )
            })?
            .into_iter()
            .map(|p| (p.word1_id, p.word2_id, p.distance))
            .collect()
    } else if let Some(ref word_book_id) = payload.word_book_id {
        // Try cache first, fall back to real-time calculation
        let cached = find_by_wordbook(&proxy, word_book_id, threshold, limit, offset).await;
        match cached {
            Ok(rows) if !rows.is_empty() => rows
                .into_iter()
                .map(|p| (p.word1_id, p.word2_id, p.distance))
                .collect(),
            _ => {
                use crate::db::operations::embeddings::find_confusion_pairs_paged;
                find_confusion_pairs_paged(&proxy, Some(word_book_id), threshold, limit, offset)
                    .await
                    .map_err(|e| {
                        tracing::warn!(error = %e, "Failed to find confusion pairs");
                        json_error(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "QUERY_ERROR",
                            "查询混淆词对失败",
                        )
                    })?
            }
        }
    } else {
        let (_, total_count) = get_embedding_stats(&proxy).await.map_err(|e| {
            tracing::warn!(error = %e, "Failed to get embedding stats");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "STATS_ERROR",
                "获取向量统计失败",
            )
        })?;

        if total_count > MAX_GLOBAL_CONFUSION_TOTAL {
            return Err(json_error(
                StatusCode::BAD_REQUEST,
                "TOO_MANY_WORDS",
                "词库规模较大，请先指定词书或主题再查询易混淆词对",
            ));
        }

        use crate::db::operations::embeddings::find_confusion_pairs_paged;
        find_confusion_pairs_paged(&proxy, None, threshold, limit, offset)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "Failed to find confusion pairs");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "QUERY_ERROR",
                    "查询混淆词对失败",
                )
            })?
    };

    let mut word_ids = Vec::new();
    for (word1_id, word2_id, _) in &pairs {
        word_ids.push(word1_id.clone());
        word_ids.push(word2_id.clone());
    }
    word_ids.sort();
    word_ids.dedup();

    let words = get_words_by_ids(&proxy, &word_ids).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch words");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取单词失败",
        )
    })?;

    let word_map: HashMap<String, _> = words.into_iter().map(|w| (w.id.clone(), w)).collect();

    let result: Vec<ConfusionPair> = pairs
        .into_iter()
        .filter_map(|(word1_id, word2_id, distance)| {
            let w1 = word_map.get(&word1_id)?;
            let w2 = word_map.get(&word2_id)?;
            Some(ConfusionPair {
                word1: WordResult {
                    id: w1.id.clone(),
                    spelling: w1.spelling.clone(),
                    phonetic: w1.phonetic.clone(),
                    meanings: w1.meanings.clone(),
                    examples: w1.examples.clone(),
                    audio_url: w1.audio_url.clone(),
                    distance,
                },
                word2: WordResult {
                    id: w2.id.clone(),
                    spelling: w2.spelling.clone(),
                    phonetic: w2.phonetic.clone(),
                    meanings: w2.meanings.clone(),
                    examples: w2.examples.clone(),
                    audio_url: w2.audio_url.clone(),
                    distance,
                },
                distance,
            })
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: result,
    }))
}

async fn confusion_by_cluster(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ConfusionByClusterQuery>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let threshold = query.threshold.unwrap_or(0.15).clamp(0.05, 0.3);

    let counts = get_cluster_confusion_counts(&proxy, threshold)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to get cluster confusion counts");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "QUERY_ERROR",
                "获取聚类混淆词对数量失败",
            )
        })?;

    let results: Vec<ClusterConfusionResponse> = counts
        .into_iter()
        .map(|c| ClusterConfusionResponse {
            cluster_id: c.cluster_id,
            theme_label: c.theme_label,
            pair_count: c.pair_count,
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: results,
    }))
}

async fn confusion_cache_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let (total_pairs, last_updated) = get_cache_stats(&proxy).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to get cache stats");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_ERROR",
            "获取缓存状态失败",
        )
    })?;

    Ok(Json(SuccessResponse {
        success: true,
        data: CacheStatusResponse {
            total_pairs,
            last_updated: last_updated.map(|t| t.and_utc().to_rfc3339()),
            ready: total_pairs > 0,
        },
    }))
}

async fn confusion_cache_rebuild(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, user) = require_user(&state, &headers).await?;

    // Only allow admin users to trigger rebuild
    if user.role != "admin" {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "需要管理员权限",
        ));
    }

    tokio::spawn(async move {
        if let Err(e) = rebuild_confusion_cache(proxy).await {
            tracing::error!(error = %e, "Confusion cache rebuild failed");
        }
    });

    Ok(Json(SuccessResponse {
        success: true,
        data: serde_json::json!({
            "message": "缓存重建任务已启动"
        }),
    }))
}

async fn clusters(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let embedder = EmbeddingProvider::from_db(&proxy).await;
    let model = embedder.model();
    let dim = embedder.dimension() as i32;

    let cluster_rows = get_all_clusters(&proxy, model, dim).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to get clusters");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_ERROR",
            "获取聚类失败",
        )
    })?;

    let rep_word_ids: Vec<String> = cluster_rows
        .iter()
        .map(|c| c.representative_word_id.clone())
        .collect();

    let rep_words = get_words_by_ids(&proxy, &rep_word_ids).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to fetch representative words");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "FETCH_ERROR",
            "获取代表词失败",
        )
    })?;

    let word_map: HashMap<String, _> = rep_words.into_iter().map(|w| (w.id.clone(), w)).collect();

    let results: Vec<ClusterResponse> = cluster_rows
        .into_iter()
        .filter_map(|c| {
            let w = word_map.get(&c.representative_word_id)?;
            Some(ClusterResponse {
                id: c.id,
                theme_label: c.theme_label,
                representative_word: WordResult {
                    id: w.id.clone(),
                    spelling: w.spelling.clone(),
                    phonetic: w.phonetic.clone(),
                    meanings: w.meanings.clone(),
                    examples: w.examples.clone(),
                    audio_url: w.audio_url.clone(),
                    distance: 0.0,
                },
                word_count: c.word_count,
                avg_cohesion: c.avg_cohesion,
            })
        })
        .collect();

    Ok(Json(SuccessResponse {
        success: true,
        data: results,
    }))
}

async fn cluster_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(cluster_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let (proxy, _user) = require_user(&state, &headers).await?;

    let cluster = get_cluster_by_id(&proxy, &cluster_id).await.map_err(|e| {
        tracing::warn!(error = %e, "Failed to get cluster");
        json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "QUERY_ERROR",
            "获取聚类详情失败",
        )
    })?;

    let cluster =
        cluster.ok_or_else(|| json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "聚类不存在"))?;

    let words = get_words_by_ids(&proxy, &cluster.word_ids)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Failed to fetch cluster words");
            json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "FETCH_ERROR",
                "获取聚类单词失败",
            )
        })?;

    let word_map: HashMap<String, _> = words.into_iter().map(|w| (w.id.clone(), w)).collect();

    let word_results: Vec<WordResult> = cluster
        .word_ids
        .iter()
        .filter_map(|id| {
            let w = word_map.get(id)?;
            Some(WordResult {
                id: w.id.clone(),
                spelling: w.spelling.clone(),
                phonetic: w.phonetic.clone(),
                meanings: w.meanings.clone(),
                examples: w.examples.clone(),
                audio_url: w.audio_url.clone(),
                distance: 0.0,
            })
        })
        .collect();

    let rep_word = word_map
        .get(&cluster.representative_word_id)
        .map(|w| WordResult {
            id: w.id.clone(),
            spelling: w.spelling.clone(),
            phonetic: w.phonetic.clone(),
            meanings: w.meanings.clone(),
            examples: w.examples.clone(),
            audio_url: w.audio_url.clone(),
            distance: 0.0,
        })
        .unwrap_or_else(|| WordResult {
            id: cluster.representative_word_id.clone(),
            spelling: String::new(),
            phonetic: String::new(),
            meanings: vec![],
            examples: vec![],
            audio_url: None,
            distance: 0.0,
        });

    Ok(Json(SuccessResponse {
        success: true,
        data: ClusterDetailResponse {
            id: cluster.id,
            theme_label: cluster.theme_label,
            representative_word: rep_word,
            words: word_results,
            word_count: cluster.word_count,
            avg_cohesion: cluster.avg_cohesion,
        },
    }))
}

async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Arc<DatabaseProxy>, crate::auth::AuthUser), AppError> {
    let token = crate::auth::extract_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "未提供认证令牌"))?;

    let proxy = state.db_proxy().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "服务不可用",
        )
    })?;

    let user = crate::auth::verify_request_token(&proxy, &token)
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

async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    static HEALTH_CACHE: std::sync::OnceLock<RwLock<Option<(HealthCheckResponse, Instant)>>> =
        std::sync::OnceLock::new();

    let cache = HEALTH_CACHE.get_or_init(|| RwLock::new(None));

    {
        let guard = cache.read().await;
        if let Some((ref cached_resp, cached_at)) = *guard {
            if cached_at.elapsed().as_secs() < HEALTH_CACHE_TTL_SECS {
                let mut resp = cached_resp.clone();
                resp.cached = true;
                return Json(SuccessResponse {
                    success: true,
                    data: resp,
                });
            }
        }
    }

    let proxy = state.db_proxy();
    let embedder = match proxy {
        Some(ref p) => EmbeddingProvider::from_db(p).await,
        None => EmbeddingProvider::from_env(),
    };

    let model = embedder.model().to_string();

    if !embedder.is_available() {
        let resp = HealthCheckResponse {
            healthy: false,
            latency_ms: None,
            error: Some("向量服务未配置".to_string()),
            model,
            cached: false,
        };
        let mut guard = cache.write().await;
        *guard = Some((resp.clone(), Instant::now()));
        return Json(SuccessResponse {
            success: true,
            data: resp,
        });
    }

    let start = Instant::now();
    let probe_result = embedder.embed_text("health check probe").await;
    let latency_ms = start.elapsed().as_millis() as u64;

    let resp = match probe_result {
        Ok(_) => HealthCheckResponse {
            healthy: true,
            latency_ms: Some(latency_ms),
            error: None,
            model,
            cached: false,
        },
        Err(e) => HealthCheckResponse {
            healthy: false,
            latency_ms: Some(latency_ms),
            error: Some(e.to_string()),
            model,
            cached: false,
        },
    };

    let mut guard = cache.write().await;
    *guard = Some((resp.clone(), Instant::now()));

    Json(SuccessResponse {
        success: true,
        data: resp,
    })
}
