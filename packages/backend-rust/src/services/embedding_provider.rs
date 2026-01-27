use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::sleep;
use tracing::warn;

use crate::db::DatabaseProxy;

const DEFAULT_MODEL: &str = "text-embedding-3-small";
const DEFAULT_API_ENDPOINT: &str = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS: u64 = 60_000;
const MAX_RETRIES: usize = 3;
const BASE_BACKOFF_MS: u64 = 200;

#[derive(Debug, Clone)]
pub struct EmbeddingConfig {
    pub api_key: Option<String>,
    pub model: String,
    pub api_endpoint: String,
    pub timeout: Duration,
    pub dimension: usize,
}

#[derive(Debug, Error)]
pub enum EmbeddingError {
    #[error("Embedding not configured: {0}")]
    NotConfigured(&'static str),
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("HTTP {status}: {body}")]
    HttpStatus {
        status: reqwest::StatusCode,
        body: String,
    },
    #[error("JSON decode failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("empty embedding response")]
    Empty,
    #[error("count mismatch: expected {expected}, got {actual}")]
    CountMismatch { expected: usize, actual: usize },
    #[error("dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },
}

#[derive(Clone)]
pub struct EmbeddingProvider {
    config: EmbeddingConfig,
    client: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct EmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingItem>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingItem {
    embedding: Vec<f32>,
}

impl EmbeddingProvider {
    pub fn from_env() -> Self {
        let api_key = env_string("EMBEDDING_API_KEY");
        let model = env_string("EMBEDDING_MODEL").unwrap_or_else(|| DEFAULT_MODEL.to_string());
        let api_endpoint = normalize_endpoint(
            env_string("EMBEDDING_API_ENDPOINT")
                .or_else(|| env_string("EMBEDDING_BASE_URL"))
                .unwrap_or_else(|| DEFAULT_API_ENDPOINT.to_string()),
        );
        let timeout =
            Duration::from_millis(env_u64("EMBEDDING_TIMEOUT").unwrap_or(DEFAULT_TIMEOUT_MS));
        let dimension = env_usize("EMBEDDING_DIMENSION").unwrap_or(1536);

        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            config: EmbeddingConfig {
                api_key,
                model,
                api_endpoint,
                timeout,
                dimension,
            },
            client,
        }
    }

    pub async fn from_db(proxy: &DatabaseProxy) -> Self {
        let api_key = db_setting(proxy, "embedding.api_key").await;
        let model = db_setting(proxy, "embedding.model")
            .await
            .or_else(|| env_string("EMBEDDING_MODEL"))
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());
        let api_endpoint = normalize_endpoint(
            db_setting(proxy, "embedding.api_endpoint")
                .await
                .or_else(|| env_string("EMBEDDING_API_ENDPOINT"))
                .unwrap_or_else(|| DEFAULT_API_ENDPOINT.to_string()),
        );
        let timeout_ms = db_setting(proxy, "embedding.timeout_ms")
            .await
            .and_then(|v| v.parse::<u64>().ok())
            .or_else(|| env_u64("EMBEDDING_TIMEOUT"))
            .unwrap_or(DEFAULT_TIMEOUT_MS);
        let dimension = db_setting(proxy, "embedding.dimension")
            .await
            .and_then(|v| v.parse::<usize>().ok())
            .or_else(|| env_usize("EMBEDDING_DIMENSION"))
            .unwrap_or(1536);

        let timeout = Duration::from_millis(timeout_ms);
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            config: EmbeddingConfig {
                api_key: api_key.or_else(|| env_string("EMBEDDING_API_KEY")),
                model,
                api_endpoint,
                timeout,
                dimension,
            },
            client,
        }
    }

    pub fn is_available(&self) -> bool {
        self.config
            .api_key
            .as_deref()
            .is_some_and(|v| !v.trim().is_empty())
            && !self.config.model.trim().is_empty()
            && !self.config.api_endpoint.trim().is_empty()
    }

    pub fn model(&self) -> &str {
        &self.config.model
    }

    pub fn dimension(&self) -> usize {
        self.config.dimension
    }

    pub async fn embed_texts(&self, inputs: &[String]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        let api_key = self
            .config
            .api_key
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .ok_or(EmbeddingError::NotConfigured("EMBEDDING_API_KEY"))?;

        let url = format!(
            "{}/embeddings",
            self.config.api_endpoint.trim_end_matches('/')
        );
        let payload = EmbeddingRequest {
            model: &self.config.model,
            input: inputs,
        };

        let resp = self.post_with_retry(&url, api_key, &payload).await?;
        if resp.data.is_empty() {
            return Err(EmbeddingError::Empty);
        }
        if resp.data.len() != inputs.len() {
            return Err(EmbeddingError::CountMismatch {
                expected: inputs.len(),
                actual: resp.data.len(),
            });
        }
        let expected_dim = self.config.dimension;
        for item in &resp.data {
            if item.embedding.len() != expected_dim {
                return Err(EmbeddingError::DimensionMismatch {
                    expected: expected_dim,
                    actual: item.embedding.len(),
                });
            }
        }
        Ok(resp.data.into_iter().map(|item| item.embedding).collect())
    }

    pub async fn embed_text(&self, input: &str) -> Result<Vec<f32>, EmbeddingError> {
        let inputs = vec![input.to_string()];
        let mut results = self.embed_texts(&inputs).await?;
        results.pop().ok_or(EmbeddingError::Empty)
    }

    async fn post_with_retry<T: serde::Serialize>(
        &self,
        url: &str,
        api_key: &str,
        payload: &T,
    ) -> Result<EmbeddingResponse, EmbeddingError> {
        let mut last_error = None;
        for retry in 0..=MAX_RETRIES {
            let result = self
                .client
                .post(url)
                .bearer_auth(api_key)
                .json(payload)
                .send()
                .await;

            match result {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        return Ok(resp.json::<EmbeddingResponse>().await?);
                    }
                    let body = resp.text().await.unwrap_or_default();
                    let err = EmbeddingError::HttpStatus { status, body };
                    if retry < MAX_RETRIES && is_retryable(status) {
                        let backoff = Duration::from_millis(BASE_BACKOFF_MS * (1 << retry));
                        warn!(retry, ?status, "Embedding request failed, retrying");
                        sleep(backoff).await;
                        last_error = Some(err);
                        continue;
                    }
                    return Err(err);
                }
                Err(e) => {
                    let err = EmbeddingError::Request(e);
                    if retry < MAX_RETRIES {
                        let backoff = Duration::from_millis(BASE_BACKOFF_MS * (1 << retry));
                        warn!(retry, "Embedding request error, retrying");
                        sleep(backoff).await;
                        last_error = Some(err);
                        continue;
                    }
                    return Err(err);
                }
            }
        }
        Err(last_error.unwrap_or(EmbeddingError::NotConfigured("unknown")))
    }
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn env_u64(key: &str) -> Option<u64> {
    env_string(key)?.parse().ok()
}

fn env_usize(key: &str) -> Option<usize> {
    env_string(key)?.parse().ok()
}

fn normalize_endpoint(endpoint: String) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") || trimmed.contains("/v1/") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/v1")
    }
}

fn is_retryable(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status == reqwest::StatusCode::REQUEST_TIMEOUT
        || status.is_server_error()
}

async fn db_setting(proxy: &DatabaseProxy, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        r#"SELECT "value" FROM "system_settings" WHERE "key" = $1"#,
    )
    .bind(key)
    .fetch_optional(proxy.pool())
    .await
    .ok()
    .flatten()
    .filter(|v| !v.trim().is_empty())
}
