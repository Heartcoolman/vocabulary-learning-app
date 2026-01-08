use chrono::Utc;
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::db::DatabaseProxy;
use crate::services::llm_provider::{ChatMessage, LLMProvider};

const DEFAULT_CONCURRENCY: usize = 1;
const WORD_CHECK_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub wordbook_id: String,
    pub task_type: String,
    pub check_type: Option<String>,
    pub status: String,
    pub total_items: i32,
    pub processed_items: i32,
    pub issues_found: i32,
    pub current_item: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    pub task_id: Option<String>,
    pub wordbook_id: String,
    pub word_id: String,
    pub word_spelling: String,
    pub field: String,
    pub severity: String,
    pub message: String,
    pub suggestion: Option<serde_json::Value>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityStats {
    pub total_words: i64,
    pub checked_words: i64,
    pub open_issues: i64,
    pub fixed_issues: i64,
    pub last_check: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskRequest {
    pub task_type: String,
    pub check_type: Option<String>,
    pub enhance_fields: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueFilters {
    pub status: Option<String>,
    pub severity: Option<String>,
    pub field: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRequest {
    pub issue_ids: Vec<String>,
    pub action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub success_count: i32,
    pub failed_count: i32,
}

struct WordForCheck {
    id: String,
    spelling: String,
    phonetic: String,
    meanings: Vec<String>,
    examples: Vec<String>,
}

struct QualityIssue {
    field: String,
    severity: String,
    message: String,
}

struct WordCheckResult {
    issues: Vec<QualityIssue>,
    suggestions: Option<LlmSuggestions>,
}

struct LlmSuggestions {
    phonetic: Option<String>,
    meanings: Option<Vec<String>>,
    examples: Option<Vec<String>>,
}

fn merge_suggestions(local: Option<LlmSuggestions>, llm: LlmSuggestions) -> LlmSuggestions {
    match local {
        Some(l) => LlmSuggestions {
            phonetic: llm.phonetic.or(l.phonetic),
            meanings: llm.meanings.or(l.meanings),
            examples: llm.examples.or(l.examples),
        },
        None => llm,
    }
}

struct LlmCheckResult {
    issues: Vec<QualityIssue>,
    suggestions: Option<LlmSuggestions>,
}

static CANCELLED: AtomicBool = AtomicBool::new(false);

pub async fn start_task(
    proxy: &DatabaseProxy,
    wordbook_id: &str,
    request: StartTaskRequest,
    user_id: String,
) -> Result<Task, String> {
    let pool = proxy.pool();
    let task_id = uuid::Uuid::new_v4();
    let task_type = request.task_type.as_str();
    let check_type = request.check_type.clone();
    let now = Utc::now();

    let word_count: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" = $1"#)
            .bind(wordbook_id)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    sqlx::query(
        r#"
        INSERT INTO "quality_tasks" ("id", "wordbookId", "taskType", "checkType", "status", "totalItems", "createdBy", "createdAt")
        VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)
        "#,
    )
    .bind(task_id)
    .bind(wordbook_id)
    .bind(task_type)
    .bind(&check_type)
    .bind(word_count as i32)
    .bind(&user_id)
    .bind(now.naive_utc())
    .execute(pool)
    .await
    .map_err(|e| format!("创建任务失败: {e}"))?;

    let task = Task {
        id: task_id.to_string(),
        wordbook_id: wordbook_id.to_string(),
        task_type: task_type.to_string(),
        check_type: check_type.clone(),
        status: "running".to_string(),
        total_items: word_count as i32,
        processed_items: 0,
        issues_found: 0,
        current_item: None,
        created_by: user_id.clone(),
        created_at: now.to_rfc3339(),
        completed_at: None,
    };

    CANCELLED.store(false, Ordering::SeqCst);
    let pool_clone = pool.clone();
    let wordbook_id = wordbook_id.to_string();
    let check_type_clone = check_type.unwrap_or_else(|| "FULL".to_string());

    tokio::spawn(async move {
        run_check_task(
            pool_clone,
            task_id,
            &wordbook_id,
            &check_type_clone,
            word_count as i32,
            &user_id,
        )
        .await;
    });

    Ok(task)
}

async fn run_check_task(
    pool: PgPool,
    task_id: uuid::Uuid,
    wordbook_id: &str,
    check_type: &str,
    total_items: i32,
    user_id: &str,
) {
    tracing::info!(
        "Starting quality check task: {}, type: {}, total: {}",
        task_id,
        check_type,
        total_items
    );
    let llm = LLMProvider::from_env();
    tracing::info!(
        "LLM Status: is_available={}, config details omitted",
        llm.is_available()
    );

    let words = match sqlx::query(
        r#"SELECT "id", "spelling", "phonetic", "meanings", "examples" FROM "words" WHERE "wordBookId" = $1"#,
    )
    .bind(wordbook_id)
    .fetch_all(&pool)
    .await
    {
        Ok(w) => {
            tracing::info!("Fetched {} words for quality check", w.len());
            w
        },
        Err(e) => {
            tracing::error!("查询单词失败: {e}");
            let _ = update_task_status(&pool, task_id, "failed").await;
            return;
        }
    };

    let words: Vec<WordForCheck> = words
        .into_iter()
        .map(|row| WordForCheck {
            id: row.try_get("id").unwrap_or_default(),
            spelling: row.try_get("spelling").unwrap_or_default(),
            phonetic: row.try_get("phonetic").unwrap_or_default(),
            meanings: row.try_get("meanings").unwrap_or_default(),
            examples: row.try_get("examples").unwrap_or_default(),
        })
        .collect();

    let processed = Arc::new(std::sync::atomic::AtomicI32::new(0));
    let issues_found = Arc::new(std::sync::atomic::AtomicI32::new(0));
    let cancelled = Arc::new(AtomicBool::new(false));

    let concurrency = std::env::var("QUALITY_CHECK_CONCURRENCY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_CONCURRENCY);

    tracing::info!(
        "Transformed {} words, starting concurrent loop with concurrency {}",
        words.len(),
        concurrency
    );

    if let Err(e) = sqlx::query(r#"DELETE FROM "word_issues" WHERE "wordbookId" = $1"#)
        .bind(wordbook_id)
        .execute(&pool)
        .await
    {
        tracing::error!("Failed to clean up old issues: {}", e);
    }

    let check_type = check_type.to_string();
    let wordbook_id = wordbook_id.to_string();
    let user_id = user_id.to_string();

    stream::iter(words)
        .for_each_concurrent(concurrency, |word| {
            let pool = pool.clone();
            let llm = llm.clone();
            let check_type = check_type.clone();
            let wordbook_id = wordbook_id.clone();
            let user_id = user_id.clone();
            let processed = processed.clone();
            let issues_found = issues_found.clone();
            let cancelled = cancelled.clone();

            async move {
                if CANCELLED.load(Ordering::SeqCst) || cancelled.load(Ordering::SeqCst) {
                    return;
                }

                tracing::info!("Processing word: {}, meanings: {}", word.spelling, word.meanings.len());

                let _ = sqlx::query(r#"UPDATE "quality_tasks" SET "currentItem" = $1 WHERE "id" = $2"#)
                    .bind(&word.spelling)
                    .bind(task_id)
                    .execute(&pool)
                    .await;

                let result = check_word_quality(&llm, &word, &check_type).await;
                tracing::info!("Checked word: {}, issues: {}", word.spelling, result.issues.len());
                let new_issues = result.issues.len() as i32;

                for issue in result.issues {
                    let suggestion = result.suggestions.as_ref().and_then(|s| {
                        let mut obj = serde_json::Map::new();
                        if let Some(ref p) = s.phonetic {
                            if issue.field == "phonetic" {
                                obj.insert("phonetic".to_string(), serde_json::Value::String(p.clone()));
                            }
                        }
                        if let Some(ref m) = s.meanings {
                            if issue.field == "meanings" {
                                obj.insert("meanings".to_string(), serde_json::json!(m));
                            }
                        }
                        if let Some(ref e) = s.examples {
                            if issue.field == "examples" {
                                obj.insert("examples".to_string(), serde_json::json!(e));
                            }
                        }
                        if obj.is_empty() { None } else { Some(serde_json::Value::Object(obj)) }
                    });

                    let _ = sqlx::query(
                        r#"
                        INSERT INTO "word_issues" ("taskId", "wordbookId", "wordId", "field", "severity", "message", "suggestion")
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        "#,
                    )
                    .bind(task_id)
                    .bind(&wordbook_id)
                    .bind(&word.id)
                    .bind(&issue.field)
                    .bind(&issue.severity)
                    .bind(&issue.message)
                    .bind(&suggestion)
                    .execute(&pool)
                    .await;
                }

                if let Some(ref suggestions) = result.suggestions {
                    store_word_content_variants(&pool, &word, suggestions, Some(&task_id.to_string())).await;
                }

                let p = processed.fetch_add(1, Ordering::SeqCst) + 1;
                issues_found.fetch_add(new_issues, Ordering::SeqCst);

                let _ = sqlx::query(
                    r#"UPDATE "quality_tasks" SET "processedItems" = $1, "issuesFound" = $2 WHERE "id" = $3"#,
                )
                .bind(p)
                .bind(issues_found.load(Ordering::SeqCst))
                .bind(task_id)
                .execute(&pool)
                .await;

                send_progress(&user_id, task_id.to_string(), wordbook_id.clone(), "running".into(), total_items, p, issues_found.load(Ordering::SeqCst), Some(word.spelling.clone()));
            }
        })
        .await;

    let final_status = if CANCELLED.load(Ordering::SeqCst) {
        "cancelled"
    } else {
        "completed"
    };
    let _ = sqlx::query(
        r#"UPDATE "quality_tasks" SET "status" = $1, "completedAt" = NOW(), "currentItem" = NULL WHERE "id" = $2"#,
    )
    .bind(final_status)
    .bind(task_id)
    .execute(&pool)
    .await;

    send_progress(
        &user_id,
        task_id.to_string(),
        wordbook_id.clone(),
        final_status.into(),
        total_items,
        processed.load(Ordering::SeqCst),
        issues_found.load(Ordering::SeqCst),
        None,
    );
}

async fn check_word_quality(
    llm: &LLMProvider,
    word: &WordForCheck,
    check_type: &str,
) -> WordCheckResult {
    let mut issues = Vec::new();
    let mut suggestions = None;

    if check_type == "FULL" || check_type == "MEANING" {
        if word.meanings.is_empty() {
            issues.push(QualityIssue {
                field: "meanings".to_string(),
                severity: "error".to_string(),
                message: "单词缺少释义".to_string(),
            });
        }
    }

    if check_type == "FULL" || check_type == "SPELLING" {
        let phonetic = word.phonetic.trim();
        if phonetic.is_empty() {
            issues.push(QualityIssue {
                field: "phonetic".to_string(),
                severity: "warning".to_string(),
                message: "缺少音标".to_string(),
            });
        } else if contains_cjk(phonetic) {
            issues.push(QualityIssue {
                field: "phonetic".to_string(),
                severity: "warning".to_string(),
                message: "音标包含中文文本".to_string(),
            });
            let cleaned = filter_valid_phonetic_chars(phonetic);
            if !cleaned.is_empty() && cleaned != phonetic {
                suggestions = Some(LlmSuggestions {
                    phonetic: Some(cleaned),
                    meanings: None,
                    examples: None,
                });
            }
        } else if has_invalid_phonetic_chars(phonetic) {
            issues.push(QualityIssue {
                field: "phonetic".to_string(),
                severity: "warning".to_string(),
                message: "音标包含无效字符".to_string(),
            });
            let cleaned = filter_valid_phonetic_chars(phonetic);
            if !cleaned.is_empty() && cleaned != phonetic {
                suggestions = Some(LlmSuggestions {
                    phonetic: Some(cleaned),
                    meanings: None,
                    examples: None,
                });
            }
        }
    }

    if check_type == "FULL" || check_type == "EXAMPLE" {
        if word.examples.is_empty() {
            issues.push(QualityIssue {
                field: "examples".to_string(),
                severity: "suggestion".to_string(),
                message: "建议添加例句".to_string(),
            });
        }

        let spelling = word.spelling.trim();
        for example in &word.examples {
            if !example_contains_word_form(example, spelling) {
                issues.push(QualityIssue {
                    field: "examples".to_string(),
                    severity: "warning".to_string(),
                    message: format!("例句 \"{}\" 未包含目标单词", truncate(example, 30)),
                });
            }
        }
    }

    if check_type == "FULL" && llm.is_available() {
        match tokio::time::timeout(
            Duration::from_secs(WORD_CHECK_TIMEOUT_SECS),
            check_with_llm(llm, word),
        )
        .await
        {
            Ok(Ok(llm_result)) => {
                issues.extend(llm_result.issues);
                if let Some(llm_sugg) = llm_result.suggestions {
                    suggestions = Some(merge_suggestions(suggestions, llm_sugg));
                }
            }
            Ok(Err(e)) => {
                tracing::warn!("LLM check failed for word '{}': {}", word.spelling, e);
            }
            Err(_) => {
                tracing::warn!("LLM check timeout for word '{}'", word.spelling);
            }
        }
    }

    dedupe_issues(&mut issues);
    WordCheckResult {
        issues,
        suggestions,
    }
}

async fn check_with_llm(llm: &LLMProvider, word: &WordForCheck) -> Result<LlmCheckResult, String> {
    let system_prompt = r#"你是词典质量检查专家。检查以下单词条目，只返回JSON格式：
{"issues":[{"field":"字段名","severity":"error/warning/suggestion","message":"问题描述"}],"suggestions":{"phonetic":"正确音标","meanings":["n. 释义1","v. 释义2"],"examples":["例句1","例句2"]}}
要求：
- issues 为空数组表示没有问题
- suggestions 必须提供具体的修复值，不是描述性文字
- suggestions.phonetic: 正确的IPA音标字符串
- suggestions.meanings: 完整释义数组，每项格式为 "词性. 中文释义"
- suggestions.examples: 包含目标单词的完整例句数组
- 若发现问题，必须同时在 suggestions 中提供对应字段的具体修复值
- 不输出解释，不使用 Markdown"#;

    let user_prompt = format!(
        "单词: {}\n音标: {}\n释义: {}\n例句: {}",
        word.spelling,
        word.phonetic,
        word.meanings.join("; "),
        word.examples.join("; ")
    );

    let messages = [
        ChatMessage {
            role: "system".into(),
            content: system_prompt.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: user_prompt.clone(),
        },
    ];

    let response = llm
        .chat(&messages)
        .await
        .map_err(|e| format!("LLM调用失败: {e}"))?;
    let raw = response.first_content().unwrap_or_default();
    tracing::info!("LLM Raw Response for {}: {:?}", word.spelling, raw);
    parse_llm_result(raw, word)
}

async fn store_word_content_variants(
    pool: &PgPool,
    word: &WordForCheck,
    suggestions: &LlmSuggestions,
    task_id: Option<&str>,
) {
    if let Some(ref phonetic) = suggestions.phonetic {
        let original = if word.phonetic.is_empty() {
            None
        } else {
            Some(serde_json::json!(word.phonetic))
        };
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO "word_content_variants" ("id", "wordId", "field", "originalValue", "generatedValue", "confidence", "taskId", "status", "createdAt")
            VALUES ($1, $2, 'phonetic', $3, $4, 0.8, $5, 'pending', NOW())
            "#,
        )
        .bind(uuid::Uuid::new_v4())
        .bind(&word.id)
        .bind(&original)
        .bind(serde_json::json!(phonetic))
        .bind(task_id)
        .execute(pool)
        .await {
            tracing::warn!(error = %e, word = %word.spelling, "Failed to store phonetic variant");
        }
    }

    if let Some(ref meanings) = suggestions.meanings {
        let original = if word.meanings.is_empty() {
            None
        } else {
            Some(serde_json::json!(&word.meanings))
        };
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO "word_content_variants" ("id", "wordId", "field", "originalValue", "generatedValue", "confidence", "taskId", "status", "createdAt")
            VALUES ($1, $2, 'meanings', $3, $4, 0.75, $5, 'pending', NOW())
            "#,
        )
        .bind(uuid::Uuid::new_v4())
        .bind(&word.id)
        .bind(&original)
        .bind(serde_json::json!(meanings))
        .bind(task_id)
        .execute(pool)
        .await {
            tracing::warn!(error = %e, word = %word.spelling, "Failed to store meanings variant");
        }
    }

    if let Some(ref examples) = suggestions.examples {
        let original = if word.examples.is_empty() {
            None
        } else {
            Some(serde_json::json!(&word.examples))
        };
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO "word_content_variants" ("id", "wordId", "field", "originalValue", "generatedValue", "confidence", "taskId", "status", "createdAt")
            VALUES ($1, $2, 'examples', $3, $4, 0.7, $5, 'pending', NOW())
            "#,
        )
        .bind(uuid::Uuid::new_v4())
        .bind(&word.id)
        .bind(&original)
        .bind(serde_json::json!(examples))
        .bind(task_id)
        .execute(pool)
        .await {
            tracing::warn!(error = %e, word = %word.spelling, "Failed to store examples variant");
        }
    }
}

fn parse_llm_result(raw: &str, word: &WordForCheck) -> Result<LlmCheckResult, String> {
    let cleaned = clean_llm_json(raw);

    #[derive(Deserialize)]
    struct LLMResponse {
        issues: Vec<LLMIssue>,
        suggestions: Option<LLMSuggestions>,
    }

    #[derive(Deserialize)]
    struct LLMIssue {
        field: String,
        severity: String,
        message: String,
    }

    #[derive(Deserialize)]
    struct LLMSuggestions {
        phonetic: Option<String>,
        meanings: Option<Vec<String>>,
        examples: Option<Vec<String>>,
    }

    let parsed: LLMResponse =
        serde_json::from_str(cleaned).map_err(|e| format!("解析LLM响应失败: {e}"))?;

    let issues = parsed
        .issues
        .into_iter()
        .map(|i| QualityIssue {
            field: i.field,
            severity: i.severity,
            message: i.message,
        })
        .collect();

    let suggestions = parsed.suggestions.and_then(|s| {
        let phonetic = normalize_phonetic_suggestion(word, s.phonetic);
        let meanings = normalize_meanings_suggestions(word, s.meanings);
        let examples = normalize_example_suggestions(word, s.examples);
        if phonetic.is_none() && meanings.is_none() && examples.is_none() {
            None
        } else {
            Some(LlmSuggestions {
                phonetic,
                meanings,
                examples,
            })
        }
    });

    Ok(LlmCheckResult {
        issues,
        suggestions,
    })
}

pub async fn list_tasks(
    proxy: &DatabaseProxy,
    wordbook_id: &str,
    limit: i64,
) -> Result<Vec<Task>, String> {
    let pool = proxy.pool();
    let rows = sqlx::query(
        r#"
        SELECT "id", "wordbookId", "taskType", "checkType", "status", "totalItems", "processedItems", "issuesFound", "currentItem", "createdBy", "createdAt", "completedAt"
        FROM "quality_tasks"
        WHERE "wordbookId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
        "#,
    )
    .bind(wordbook_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询任务失败: {e}"))?;

    Ok(rows.into_iter().map(row_to_task).collect())
}

pub async fn get_stats(proxy: &DatabaseProxy, wordbook_id: &str) -> Result<QualityStats, String> {
    let pool = proxy.pool();

    let total_words: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "words" WHERE "wordBookId" = $1"#)
            .bind(wordbook_id)
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    let checked_words: i64 = sqlx::query_scalar(
        r#"SELECT COALESCE(MAX("processedItems"), 0) FROM "quality_tasks" WHERE "wordbookId" = $1 AND "status" = 'completed'"#,
    )
    .bind(wordbook_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let open_issues: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "word_issues" WHERE "wordbookId" = $1 AND "status" = 'open'"#,
    )
    .bind(wordbook_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let fixed_issues: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "word_issues" WHERE "wordbookId" = $1 AND "status" = 'fixed'"#,
    )
    .bind(wordbook_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let last_check: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        r#"SELECT MAX("completedAt") FROM "quality_tasks" WHERE "wordbookId" = $1 AND "status" = 'completed'"#,
    )
    .bind(wordbook_id)
    .fetch_one(pool)
    .await
    .ok()
    .flatten();

    Ok(QualityStats {
        total_words,
        checked_words,
        open_issues,
        fixed_issues,
        last_check: last_check.map(|dt| dt.to_rfc3339()),
    })
}

pub async fn cleanup_stale_tasks(proxy: &DatabaseProxy) {
    let pool = proxy.pool();
    match sqlx::query(
        r#"UPDATE "quality_tasks" SET "status" = 'failed', "completedAt" = NOW() WHERE "status" = 'running'"#
    )
    .execute(pool)
    .await
    {
        Ok(result) => {
            let count = result.rows_affected();
            if count > 0 {
                tracing::info!("Cleaned up {} stale running quality tasks on startup", count);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to cleanup stale quality tasks: {}", e);
        }
    }
}

pub async fn cancel_task(proxy: &DatabaseProxy, task_id: &str) -> Result<(), String> {
    tracing::info!("Received cancel request for task: {}", task_id);
    CANCELLED.store(true, Ordering::SeqCst);

    let pool = proxy.pool();
    let task_uuid = uuid::Uuid::parse_str(task_id).map_err(|_| "无效任务ID")?;

    let result = sqlx::query(r#"UPDATE "quality_tasks" SET "status" = 'cancelled', "completedAt" = NOW() WHERE "id" = $1 AND "status" = 'running'"#)
        .bind(task_uuid)
        .execute(pool)
        .await
        .map_err(|e| format!("取消任务失败: {e}"))?;

    tracing::info!("Cancel result: rows affected = {}", result.rows_affected());

    Ok(())
}

pub async fn list_issues(
    proxy: &DatabaseProxy,
    wordbook_id: &str,
    filters: IssueFilters,
) -> Result<(Vec<Issue>, i64), String> {
    let pool = proxy.pool();
    let limit = filters.limit.unwrap_or(50).clamp(1, 200);
    let offset = filters.offset.unwrap_or(0);

    let mut conditions = vec![r#""wordbookId" = $1"#.to_string()];
    let mut bind_idx = 2;

    if filters.status.is_some() {
        conditions.push(format!(r#""status" = ${bind_idx}"#));
        bind_idx += 1;
    }
    if filters.severity.is_some() {
        conditions.push(format!(r#""severity" = ${bind_idx}"#));
        bind_idx += 1;
    }
    if filters.field.is_some() {
        conditions.push(format!(r#""field" = ${bind_idx}"#));
    }

    let where_clause = conditions.join(" AND ");

    let count_sql = format!(r#"SELECT COUNT(*) FROM "word_issues" WHERE {where_clause}"#);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(wordbook_id);
    if let Some(ref status) = filters.status {
        count_query = count_query.bind(status);
    }
    if let Some(ref severity) = filters.severity {
        count_query = count_query.bind(severity);
    }
    if let Some(ref field) = filters.field {
        count_query = count_query.bind(field);
    }
    let total = count_query.fetch_one(pool).await.unwrap_or(0);

    let select_sql = format!(
        r#"
        SELECT i."id", i."taskId", i."wordbookId", i."wordId", w."spelling" as "wordSpelling", i."field", i."severity", i."message", i."suggestion", i."status", i."createdAt"
        FROM "word_issues" i
        LEFT JOIN "words" w ON i."wordId" = w."id"
        WHERE {where_clause}
        ORDER BY i."createdAt" DESC
        LIMIT {limit} OFFSET {offset}
        "#
    );

    let mut query = sqlx::query(&select_sql).bind(wordbook_id);
    if let Some(ref status) = filters.status {
        query = query.bind(status);
    }
    if let Some(ref severity) = filters.severity {
        query = query.bind(severity);
    }
    if let Some(ref field) = filters.field {
        query = query.bind(field);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询问题失败: {e}"))?;

    let issues = rows
        .into_iter()
        .map(|row| {
            let created_at: chrono::DateTime<Utc> =
                row.try_get("createdAt").unwrap_or_else(|_| Utc::now());
            let issue_id: uuid::Uuid = row.try_get("id").unwrap_or_default();
            let task_id: Option<uuid::Uuid> = row.try_get("taskId").ok().flatten();
            Issue {
                id: issue_id.to_string(),
                task_id: task_id.map(|id| id.to_string()),
                wordbook_id: row.try_get("wordbookId").unwrap_or_default(),
                word_id: row.try_get("wordId").unwrap_or_default(),
                word_spelling: row.try_get("wordSpelling").unwrap_or_default(),
                field: row.try_get("field").unwrap_or_default(),
                severity: row.try_get("severity").unwrap_or_default(),
                message: row.try_get("message").unwrap_or_default(),
                suggestion: row.try_get("suggestion").ok(),
                status: row.try_get("status").unwrap_or_default(),
                created_at: created_at.to_rfc3339(),
            }
        })
        .collect();

    Ok((issues, total))
}

pub async fn apply_fix(
    proxy: &DatabaseProxy,
    issue_id: &str,
    user_id: &str,
) -> Result<Issue, String> {
    let pool = proxy.pool();
    let issue_uuid = uuid::Uuid::parse_str(issue_id).map_err(|_| "无效问题ID")?;

    let row = sqlx::query(
        r#"SELECT i.*, w."spelling" as "wordSpelling" FROM "word_issues" i LEFT JOIN "words" w ON i."wordId" = w."id" WHERE i."id" = $1"#,
    )
    .bind(issue_uuid)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询问题失败: {e}"))?
    .ok_or("问题不存在")?;

    let suggestion: Option<serde_json::Value> = row.try_get("suggestion").ok().flatten();
    let word_id: String = row.try_get("wordId").unwrap_or_default();
    let field: String = row.try_get("field").unwrap_or_default();

    let mut applied = false;

    if let Some(ref sugg) = suggestion {
        if let Some(phonetic) = sugg.get("phonetic").and_then(|v| v.as_str()) {
            if field == "phonetic" && !phonetic.trim().is_empty() {
                sqlx::query(r#"UPDATE "words" SET "phonetic" = $1 WHERE "id" = $2"#)
                    .bind(phonetic)
                    .bind(&word_id)
                    .execute(pool)
                    .await
                    .map_err(|e| format!("更新单词失败: {e}"))?;
                applied = true;
            }
        }
        if let Some(meanings) = sugg.get("meanings") {
            if field == "meanings" {
                let meanings_vec: Vec<String> = meanings
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                if !meanings_vec.is_empty() {
                    sqlx::query(r#"UPDATE "words" SET "meanings" = $1 WHERE "id" = $2"#)
                        .bind(&meanings_vec)
                        .bind(&word_id)
                        .execute(pool)
                        .await
                        .map_err(|e| format!("更新单词失败: {e}"))?;
                    applied = true;
                }
            }
        }
        if let Some(examples) = sugg.get("examples") {
            if field == "examples" {
                let examples_vec: Vec<String> = examples
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                if !examples_vec.is_empty() {
                    sqlx::query(r#"UPDATE "words" SET "examples" = $1 WHERE "id" = $2"#)
                        .bind(&examples_vec)
                        .bind(&word_id)
                        .execute(pool)
                        .await
                        .map_err(|e| format!("更新单词失败: {e}"))?;
                    applied = true;
                }
            }
        }
    }

    if !applied {
        return Err("该问题没有可用的自动修复建议，请手动修复".to_string());
    }

    sqlx::query(r#"UPDATE "word_issues" SET "status" = 'fixed', "resolvedBy" = $1, "resolvedAt" = NOW() WHERE "id" = $2"#)
        .bind(user_id)
        .bind(issue_uuid)
        .execute(pool)
        .await
        .map_err(|e| format!("更新问题状态失败: {e}"))?;

    let created_at: chrono::DateTime<Utc> = row.try_get("createdAt").unwrap_or_else(|_| Utc::now());
    let issue_id: uuid::Uuid = row.try_get("id").unwrap_or_default();
    let task_id: Option<uuid::Uuid> = row.try_get("taskId").ok().flatten();
    Ok(Issue {
        id: issue_id.to_string(),
        task_id: task_id.map(|id| id.to_string()),
        wordbook_id: row.try_get("wordbookId").unwrap_or_default(),
        word_id,
        word_spelling: row.try_get("wordSpelling").unwrap_or_default(),
        field,
        severity: row.try_get("severity").unwrap_or_default(),
        message: row.try_get("message").unwrap_or_default(),
        suggestion,
        status: "fixed".to_string(),
        created_at: created_at.to_rfc3339(),
    })
}

pub async fn ignore_issue(
    proxy: &DatabaseProxy,
    issue_id: &str,
    user_id: &str,
) -> Result<(), String> {
    let pool = proxy.pool();
    let issue_uuid = uuid::Uuid::parse_str(issue_id).map_err(|_| "无效问题ID")?;

    sqlx::query(r#"UPDATE "word_issues" SET "status" = 'ignored', "resolvedBy" = $1, "resolvedAt" = NOW() WHERE "id" = $2"#)
        .bind(user_id)
        .bind(issue_uuid)
        .execute(pool)
        .await
        .map_err(|e| format!("忽略问题失败: {e}"))?;

    Ok(())
}

pub async fn batch_operation(
    proxy: &DatabaseProxy,
    request: BatchRequest,
    user_id: &str,
) -> Result<BatchResult, String> {
    let mut success_count = 0;
    let mut failed_count = 0;

    for id in request.issue_ids {
        let result = if request.action == "fix" {
            apply_fix(proxy, &id, user_id).await
        } else {
            ignore_issue(proxy, &id, user_id).await.map(|_| Issue {
                id: id.clone(),
                task_id: None,
                wordbook_id: String::new(),
                word_id: String::new(),
                word_spelling: String::new(),
                field: String::new(),
                severity: String::new(),
                message: String::new(),
                suggestion: None,
                status: "ignored".to_string(),
                created_at: String::new(),
            })
        };

        if result.is_ok() {
            success_count += 1;
        } else {
            failed_count += 1;
        }
    }

    Ok(BatchResult {
        success_count,
        failed_count,
    })
}

fn row_to_task(row: sqlx::postgres::PgRow) -> Task {
    let created_at: chrono::DateTime<Utc> = row.try_get("createdAt").unwrap_or_else(|_| Utc::now());
    let completed_at: Option<chrono::DateTime<Utc>> = row.try_get("completedAt").ok().flatten();
    let task_id: uuid::Uuid = row.try_get("id").unwrap_or_default();

    Task {
        id: task_id.to_string(),
        wordbook_id: row.try_get("wordbookId").unwrap_or_default(),
        task_type: row.try_get("taskType").unwrap_or_default(),
        check_type: row.try_get("checkType").ok(),
        status: row.try_get("status").unwrap_or_default(),
        total_items: row.try_get("totalItems").unwrap_or(0),
        processed_items: row.try_get("processedItems").unwrap_or(0),
        issues_found: row.try_get("issuesFound").unwrap_or(0),
        current_item: row.try_get("currentItem").ok(),
        created_by: row.try_get("createdBy").unwrap_or_default(),
        created_at: created_at.to_rfc3339(),
        completed_at: completed_at.map(|dt| dt.to_rfc3339()),
    }
}

async fn update_task_status(
    pool: &PgPool,
    task_id: uuid::Uuid,
    status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE "quality_tasks" SET "status" = $1, "completedAt" = NOW() WHERE "id" = $2"#,
    )
    .bind(status)
    .bind(task_id)
    .execute(pool)
    .await?;
    Ok(())
}

fn send_progress(
    user_id: &str,
    task_id: String,
    wordbook_id: String,
    status: String,
    total: i32,
    processed: i32,
    issues: i32,
    current: Option<String>,
) {
    let percentage = if total > 0 {
        (processed as f64 / total as f64 * 100.0) as i32
    } else {
        0
    };
    let payload = serde_json::json!({
        "taskId": task_id,
        "wordbookId": wordbook_id,
        "status": status,
        "totalItems": total,
        "processedItems": processed,
        "issuesFound": issues,
        "currentItem": current,
        "percentage": percentage
    });
    crate::routes::realtime::send_event(
        user_id.to_string(),
        None,
        "quality-task-progress",
        payload,
    );
}

fn json_to_strings(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => vec![],
    }
}

fn clean_llm_json(raw: &str) -> &str {
    let s = raw.trim();

    // Handle <think>...</think> tags (DeepSeek/Claude thinking output)
    let s = if let Some(end_idx) = s.rfind("</think>") {
        s[end_idx + 8..].trim()
    } else {
        s
    };

    s.trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

fn normalize_phonetic_suggestion(word: &WordForCheck, raw: Option<String>) -> Option<String> {
    let candidate = raw?.trim().to_string();
    if candidate.is_empty() || candidate == word.phonetic.trim() {
        return None;
    }
    // Only reject if contains CJK characters; trust LLM for valid IPA
    if contains_cjk(&candidate) {
        return None;
    }
    Some(candidate)
}

fn normalize_meanings_suggestions(
    word: &WordForCheck,
    raw: Option<Vec<String>>,
) -> Option<Vec<String>> {
    let list = raw?;
    let results: Vec<String> = list
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if results.is_empty() || results == word.meanings {
        None
    } else {
        Some(results)
    }
}

fn normalize_example_suggestions(
    word: &WordForCheck,
    raw: Option<Vec<String>>,
) -> Option<Vec<String>> {
    let list = raw?;
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in list {
        let trimmed = item.trim();
        if trimmed.is_empty() || !example_contains_word_form(trimmed, &word.spelling) {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            results.push(trimmed.to_string());
        }
        if results.len() >= 5 {
            break;
        }
    }
    if results.is_empty() || results == word.examples {
        None
    } else {
        Some(results)
    }
}

fn dedupe_issues(issues: &mut Vec<QualityIssue>) {
    let mut seen = std::collections::HashSet::new();
    issues.retain(|issue| {
        let key = format!(
            "{}|{}|{}",
            issue.field,
            issue.severity,
            issue.message.trim()
        );
        seen.insert(key)
    });
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(max_len).collect::<String>())
    }
}

fn contains_cjk(s: &str) -> bool {
    s.chars().any(|c| matches!(c, '\u{4E00}'..='\u{9FFF}'))
}

fn has_invalid_phonetic_chars(s: &str) -> bool {
    s.chars().any(|c| !is_allowed_phonetic_char(c))
}

fn filter_valid_phonetic_chars(s: &str) -> String {
    s.chars()
        .filter(|&c| is_allowed_phonetic_char(c))
        .collect::<String>()
        .trim()
        .to_string()
}

fn is_allowed_phonetic_char(c: char) -> bool {
    if c.is_ascii_alphabetic() || c.is_whitespace() {
        return true;
    }
    // Common IPA punctuation
    if matches!(
        c,
        '/' | '['
            | ']'
            | '('
            | ')'
            | '-'
            | '.'
            | ','
            | ';'
            | ':'
            | '\''
            | 'ˈ'
            | 'ˌ'
            | 'ː'
            | 'ˑ'
            | '·'
            | '‿'
    ) {
        return true;
    }
    // Common IPA vowels not in standard ranges: æ, ɑ, ɒ, ŋ, ð, θ, ʃ, ʒ, etc.
    if matches!(
        c,
        'æ' | 'ø' | 'œ' | 'ɐ' | 'ɑ' | 'ɒ' | 'ŋ' | 'ð' | 'θ' | 'ʃ' | 'ʒ' | 'ɛ' | 'ɜ' | 'ɔ'
    ) {
        return true;
    }
    // Unicode ranges for IPA characters
    matches!(c,
        '\u{0250}'..='\u{02AF}' |  // IPA Extensions
        '\u{02B0}'..='\u{02FF}' |  // Spacing Modifier Letters
        '\u{1D00}'..='\u{1D7F}' |  // Phonetic Extensions
        '\u{0100}'..='\u{017F}'    // Latin Extended-A (for ŋ, etc.)
    )
}

fn example_contains_word_form(example: &str, word: &str) -> bool {
    let Some(forms) = build_word_forms(word) else {
        let lowered = example.to_ascii_lowercase();
        let target = word.trim().to_ascii_lowercase();
        return !target.is_empty() && lowered.contains(&target);
    };

    let mut token = String::new();
    for ch in example.chars() {
        if ch.is_ascii_alphabetic() {
            token.push(ch.to_ascii_lowercase());
        } else if !token.is_empty() {
            if forms.contains(&token) {
                return true;
            }
            token.clear();
        }
    }
    !token.is_empty() && forms.contains(&token)
}

fn build_word_forms(word: &str) -> Option<std::collections::HashSet<String>> {
    let base = word.trim().to_ascii_lowercase();
    if base.is_empty() || !base.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }

    let mut forms = std::collections::HashSet::new();
    forms.insert(base.clone());

    let len = base.len();
    if len == 1 {
        return Some(forms);
    }

    let last = base.chars().last().unwrap_or_default();
    let prev = base.chars().nth(len.saturating_sub(2)).unwrap_or_default();

    if base.ends_with("s")
        || base.ends_with("x")
        || base.ends_with("z")
        || base.ends_with("ch")
        || base.ends_with("sh")
        || base.ends_with("o")
    {
        forms.insert(format!("{base}es"));
    } else if last == 'y' && !is_vowel(prev) {
        forms.insert(format!("{}ies", &base[..len - 1]));
    } else {
        forms.insert(format!("{base}s"));
    }

    if last == 'e' {
        forms.insert(format!("{base}d"));
    } else if last == 'y' && !is_vowel(prev) {
        forms.insert(format!("{}ied", &base[..len - 1]));
    } else {
        forms.insert(format!("{base}ed"));
    }

    if base.ends_with("ie") {
        forms.insert(format!("{}ying", &base[..len - 2]));
    } else if last == 'e' && !base.ends_with("ee") && !base.ends_with("ye") {
        forms.insert(format!("{}ing", &base[..len - 1]));
    } else if is_cvc(&base) {
        forms.insert(format!("{base}{last}ing"));
    } else {
        forms.insert(format!("{base}ing"));
    }

    if is_cvc(&base) {
        forms.insert(format!("{base}{last}ed"));
    }

    Some(forms)
}

fn is_vowel(c: char) -> bool {
    matches!(c, 'a' | 'e' | 'i' | 'o' | 'u')
}

fn is_cvc(word: &str) -> bool {
    if word.len() < 3 {
        return false;
    }
    let mut chars = word.chars().rev();
    let c1 = chars.next().unwrap_or_default();
    let c2 = chars.next().unwrap_or_default();
    let c3 = chars.next().unwrap_or_default();
    c1.is_ascii_alphabetic()
        && c2.is_ascii_alphabetic()
        && c3.is_ascii_alphabetic()
        && !is_vowel(c1)
        && is_vowel(c2)
        && !is_vowel(c3)
        && !matches!(c1, 'w' | 'x' | 'y')
}
