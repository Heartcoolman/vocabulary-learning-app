use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::sleep;
use tracing::warn;

const DEFAULT_MODEL: &str = "gpt-4o-mini";
const DEFAULT_API_ENDPOINT: &str = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS: u64 = 60_000;
const MAX_RETRIES: usize = 3;
const BASE_BACKOFF_MS: u64 = 200;

#[derive(Debug, Clone)]
pub struct LLMConfig {
    pub api_key: Option<String>,
    pub model: String,
    pub api_endpoint: String,
    pub timeout: Duration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    pub model: Option<String>,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<ChatUsage>,
}

impl ChatResponse {
    pub fn first_content(&self) -> Option<&str> {
        self.choices.first().map(|c| c.message.content.as_str())
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatChoice {
    pub message: ChatMessage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatUsage {
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
}

#[derive(Debug, Error)]
pub enum LLMError {
    #[error("LLM not configured: {0}")]
    NotConfigured(&'static str),
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("HTTP {status}: {body}")]
    HttpStatus { status: reqwest::StatusCode, body: String },
    #[error("JSON decode failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("empty response")]
    EmptyChoices,
}

#[derive(Clone)]
pub struct LLMProvider {
    config: LLMConfig,
    client: reqwest::Client,
}

impl LLMProvider {
    pub fn from_env() -> Self {
        let api_key = env_string("LLM_API_KEY");
        let model = env_string("LLM_MODEL").unwrap_or_else(|| DEFAULT_MODEL.to_string());
        let api_endpoint = normalize_endpoint(
            env_string("LLM_API_ENDPOINT")
                .or_else(|| env_string("LLM_BASE_URL"))
                .unwrap_or_else(|| DEFAULT_API_ENDPOINT.to_string()),
        );
        let timeout = Duration::from_millis(env_u64("LLM_TIMEOUT").unwrap_or(DEFAULT_TIMEOUT_MS));

        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            config: LLMConfig { api_key, model, api_endpoint, timeout },
            client,
        }
    }

    pub fn is_available(&self) -> bool {
        self.config.api_key.as_deref().is_some_and(|v| !v.trim().is_empty())
            && !self.config.model.trim().is_empty()
            && !self.config.api_endpoint.trim().is_empty()
    }

    pub async fn chat(&self, messages: &[ChatMessage]) -> Result<ChatResponse, LLMError> {
        let api_key = self.config.api_key.as_deref()
            .filter(|v| !v.trim().is_empty())
            .ok_or(LLMError::NotConfigured("LLM_API_KEY"))?;

        let url = format!("{}/chat/completions", self.config.api_endpoint.trim_end_matches('/'));
        let payload = serde_json::json!({
            "model": self.config.model,
            "messages": messages,
            "stream": false
        });

        self.post_with_retry(&url, api_key, &payload).await
    }

    pub async fn complete_with_system(&self, system: &str, user: &str) -> Result<String, LLMError> {
        let messages = [
            ChatMessage { role: "system".into(), content: system.into() },
            ChatMessage { role: "user".into(), content: user.into() },
        ];
        let response = self.chat(&messages).await?;
        response.first_content().map(|s| s.to_string()).ok_or(LLMError::EmptyChoices)
    }

    async fn post_with_retry(
        &self,
        url: &str,
        api_key: &str,
        payload: &serde_json::Value,
    ) -> Result<ChatResponse, LLMError> {
        let mut last_error: Option<LLMError> = None;

        for retry in 0..=MAX_RETRIES {
            match self.client.post(url).bearer_auth(api_key).json(payload).send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let bytes = resp.bytes().await?;
                        match serde_json::from_slice(&bytes) {
                            Ok(v) => return Ok(v),
                            Err(e) => {
                                let body_str = String::from_utf8_lossy(&bytes);
                                tracing::error!("Failed to parse LLM response JSON: {}. Body: {}", e, body_str);
                                return Err(LLMError::Json(e));
                            }
                        }
                    }
                    let body = resp.text().await.unwrap_or_default();
                    let err = LLMError::HttpStatus { status, body };
                    if retry < MAX_RETRIES && is_retryable(status) {
                        let backoff = Duration::from_millis(BASE_BACKOFF_MS * (1 << retry));
                        warn!(retry, ?status, "LLM request failed, retrying");
                        sleep(backoff).await;
                        last_error = Some(err);
                        continue;
                    }
                    return Err(err);
                }
                Err(e) => {
                    let err = LLMError::Request(e);
                    if retry < MAX_RETRIES {
                        let backoff = Duration::from_millis(BASE_BACKOFF_MS * (1 << retry));
                        warn!(retry, "LLM request error, retrying");
                        sleep(backoff).await;
                        last_error = Some(err);
                        continue;
                    }
                    return Err(err);
                }
            }
        }
        Err(last_error.unwrap_or(LLMError::NotConfigured("unknown")))
    }
}

fn env_string(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn env_u64(key: &str) -> Option<u64> {
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
