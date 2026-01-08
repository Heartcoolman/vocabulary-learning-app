use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use tracing::{debug, info, warn};

use crate::db::DatabaseProxy;
use crate::services::etymology::{self, MorphemeType};
use crate::services::llm_provider::{ChatMessage, LLMProvider};

const BATCH_SIZE: i64 = 50;

pub async fn run_etymology_analysis(db: Arc<DatabaseProxy>) -> Result<(), super::WorkerError> {
    let start = Instant::now();
    info!("Starting etymology analysis worker");

    let enabled = std::env::var("ETYMOLOGY_WORKER_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if !enabled {
        debug!("Etymology worker not enabled, skipping");
        return Ok(());
    }

    let pool = db.pool();
    let llm = LLMProvider::from_env();

    if !llm.is_available() {
        warn!("LLM not configured, skipping etymology analysis");
        return Ok(());
    }

    let words_to_analyze = get_words_without_etymology(pool, BATCH_SIZE).await?;

    if words_to_analyze.is_empty() {
        debug!("No words need etymology analysis");
        return Ok(());
    }

    info!(
        count = words_to_analyze.len(),
        "Processing words for etymology"
    );

    let mut success_count = 0;
    let mut error_count = 0;

    for word in words_to_analyze {
        match analyze_word_etymology(&llm, pool, &word).await {
            Ok(_) => {
                success_count += 1;
                debug!(word_id = %word.id, spelling = %word.spelling, "Etymology analyzed successfully");
            }
            Err(e) => {
                error_count += 1;
                warn!(word_id = %word.id, spelling = %word.spelling, error = %e, "Failed to analyze etymology");
            }
        }
    }

    let duration = start.elapsed();
    info!(
        success = success_count,
        errors = error_count,
        duration_ms = duration.as_millis() as u64,
        "Etymology analysis completed"
    );

    Ok(())
}

#[derive(Debug)]
struct WordToAnalyze {
    id: String,
    spelling: String,
}

async fn get_words_without_etymology(
    pool: &PgPool,
    limit: i64,
) -> Result<Vec<WordToAnalyze>, super::WorkerError> {
    let rows = sqlx::query(
        r#"
        SELECT w."id", w."spelling"
        FROM "words" w
        LEFT JOIN "word_morphemes" wm ON wm."wordId" = w."id"
        WHERE wm."wordId" IS NULL
          AND LENGTH(w."spelling") >= 4
        ORDER BY w."frequency" DESC NULLS LAST
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| WordToAnalyze {
            id: r.get("id"),
            spelling: r.get("spelling"),
        })
        .collect())
}

#[derive(Debug, Deserialize, Serialize)]
struct EtymologyLLMResponse {
    decomposition: Vec<MorphemePart>,
    confidence: f64,
}

#[derive(Debug, Deserialize, Serialize)]
struct MorphemePart {
    part: String,
    #[serde(rename = "type")]
    part_type: String,
    meaning: Option<String>,
    meaning_zh: Option<String>,
}

async fn analyze_word_etymology(
    llm: &LLMProvider,
    pool: &PgPool,
    word: &WordToAnalyze,
) -> Result<(), super::WorkerError> {
    let prompt = format!(
        r#"Analyze the etymology of the English word "{}" and decompose it into morphemes (prefix, root, suffix).

Return a JSON object with this exact structure:
{{
  "decomposition": [
    {{"part": "...", "type": "prefix|root|suffix", "meaning": "English meaning", "meaning_zh": "Chinese meaning"}}
  ],
  "confidence": 0.0-1.0
}}

Rules:
- "type" must be exactly one of: "prefix", "root", "suffix"
- Every word must have at least one "root"
- Only include actual morphemes (not arbitrary letter splits)
- If unsure, set confidence < 0.5
- Return ONLY the JSON, no explanation

Example for "unhappiness":
{{
  "decomposition": [
    {{"part": "un", "type": "prefix", "meaning": "not", "meaning_zh": "不"}},
    {{"part": "happy", "type": "root", "meaning": "glad", "meaning_zh": "快乐的"}},
    {{"part": "ness", "type": "suffix", "meaning": "state of", "meaning_zh": "状态"}}
  ],
  "confidence": 0.95
}}"#,
        word.spelling
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = llm
        .chat(&messages)
        .await
        .map_err(|e| super::WorkerError::Custom(format!("LLM error: {}", e)))?;

    let response_content = response
        .first_content()
        .ok_or_else(|| super::WorkerError::Custom("Empty LLM response".to_string()))?;
    let json_str = extract_json_from_response(response_content);

    let parsed: EtymologyLLMResponse = serde_json::from_str(&json_str).map_err(|e| {
        super::WorkerError::Custom(format!("JSON parse error: {} - response: {}", e, json_str))
    })?;

    if parsed.confidence < 0.5 {
        debug!(word = %word.spelling, confidence = parsed.confidence, "Low confidence etymology, skipping");
        return Ok(());
    }

    for (pos, part) in parsed.decomposition.iter().enumerate() {
        let morpheme_type = match part.part_type.as_str() {
            "prefix" => MorphemeType::Prefix,
            "suffix" => MorphemeType::Suffix,
            _ => MorphemeType::Root,
        };

        let morpheme = etymology::get_or_create_morpheme(
            pool,
            &part.part,
            morpheme_type,
            part.meaning.as_deref(),
            part.meaning_zh.as_deref(),
            "latin",
        )
        .await?;

        etymology::link_word_morpheme(
            pool,
            &word.id,
            &morpheme.id,
            morpheme_type,
            pos as i32,
            parsed.confidence,
            "llm",
        )
        .await?;

        etymology::increment_morpheme_frequency(pool, &morpheme.id).await?;
    }

    Ok(())
}

fn extract_json_from_response(response: &str) -> String {
    let trimmed = response.trim();

    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            return trimmed[start..=end].to_string();
        }
    }

    if let Some(start) = trimmed.find("```json") {
        let after_marker = &trimmed[start + 7..];
        if let Some(end) = after_marker.find("```") {
            return after_marker[..end].trim().to_string();
        }
    }

    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json() {
        let response = r#"Here's the analysis:
```json
{"decomposition": [{"part": "un", "type": "prefix"}], "confidence": 0.9}
```"#;
        let json = extract_json_from_response(response);
        assert!(json.starts_with('{'));
        assert!(json.contains("decomposition"));
    }

    #[test]
    fn test_extract_raw_json() {
        let response = r#"{"decomposition": [], "confidence": 0.5}"#;
        let json = extract_json_from_response(response);
        assert_eq!(json, response);
    }
}
