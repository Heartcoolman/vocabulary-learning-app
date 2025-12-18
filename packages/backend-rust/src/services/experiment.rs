use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, SqlitePool};

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

// ========== Types ==========

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExperimentStatus {
    Draft,
    Running,
    Paused,
    Completed,
    Cancelled,
}

impl ExperimentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "DRAFT",
            Self::Running => "RUNNING",
            Self::Paused => "PAUSED",
            Self::Completed => "COMPLETED",
            Self::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "RUNNING" => Self::Running,
            "PAUSED" => Self::Paused,
            "COMPLETED" => Self::Completed,
            "CANCELLED" => Self::Cancelled,
            _ => Self::Draft,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrafficAllocation {
    Even,
    Weighted,
    Dynamic,
}

impl TrafficAllocation {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Even => "EVEN",
            Self::Weighted => "WEIGHTED",
            Self::Dynamic => "DYNAMIC",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "EVEN" => Self::Even,
            "DYNAMIC" => Self::Dynamic,
            _ => Self::Weighted,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantInput {
    pub id: String,
    pub name: String,
    pub weight: f64,
    pub is_control: bool,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExperimentInput {
    pub name: String,
    pub description: Option<String>,
    pub traffic_allocation: String,
    pub min_sample_size: i32,
    pub significance_level: f64,
    pub minimum_detectable_effect: f64,
    pub auto_decision: bool,
    pub variants: Vec<VariantInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentVariant {
    pub id: String,
    pub experiment_id: String,
    pub name: String,
    pub weight: f64,
    pub is_control: bool,
    pub parameters: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Experiment {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub traffic_allocation: String,
    pub min_sample_size: i32,
    pub significance_level: f64,
    pub minimum_detectable_effect: f64,
    pub auto_decision: bool,
    pub status: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub variants: Vec<ExperimentVariant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentListItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub traffic_allocation: String,
    pub variant_count: i32,
    pub total_samples: i64,
    pub created_at: String,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentMetrics {
    pub variant_id: String,
    pub sample_count: i64,
    pub primary_metric: f64,
    pub average_reward: f64,
    pub std_dev: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantAssignment {
    pub variant_id: String,
    pub variant_name: String,
    pub is_control: bool,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentStatusDetail {
    pub status: String,
    pub total_samples: i64,
    pub sample_sizes: Vec<VariantSampleSize>,
    pub statistical_significance: Option<f64>,
    pub effect_size: Option<f64>,
    pub recommendation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantSampleSize {
    pub variant_id: String,
    pub sample_count: i64,
}

pub enum SelectedPool {
    Primary(PgPool),
    Fallback(SqlitePool),
}

// ========== Pool Selection ==========

pub async fn select_pool(proxy: &DatabaseProxy, state: DatabaseState) -> Result<SelectedPool, String> {
    match state {
        DatabaseState::Degraded | DatabaseState::Unavailable => proxy
            .fallback_pool().await
            .map(SelectedPool::Fallback)
            .ok_or_else(|| "服务不可用".to_string()),
        _ => match proxy.primary_pool().await {
            Some(pool) => Ok(SelectedPool::Primary(pool)),
            None => proxy.fallback_pool().await
                .map(SelectedPool::Fallback)
                .ok_or_else(|| "服务不可用".to_string()),
        },
    }
}

// ========== Create Operations ==========

pub async fn create_experiment(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    input: CreateExperimentInput,
) -> Result<Experiment, String> {
    if input.variants.len() < 2 {
        return Err("实验至少需要两个变体".to_string());
    }

    let total_weight: f64 = input.variants.iter().map(|v| v.weight).sum();
    if (total_weight - 1.0).abs() > 0.01 {
        return Err("变体权重总和必须为 1".to_string());
    }

    let control_count = input.variants.iter().filter(|v| v.is_control).count();
    if control_count != 1 {
        return Err("必须有且仅有一个控制组".to_string());
    }

    let experiment_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let traffic_allocation = TrafficAllocation::from_str(&input.traffic_allocation);

    if proxy.sqlite_enabled() {
        let mut exp_data = serde_json::Map::new();
        exp_data.insert("id".into(), serde_json::json!(experiment_id));
        exp_data.insert("name".into(), serde_json::json!(input.name));
        if let Some(ref desc) = input.description {
            exp_data.insert("description".into(), serde_json::json!(desc));
        }
        exp_data.insert("trafficAllocation".into(), serde_json::json!(traffic_allocation.as_str()));
        exp_data.insert("minSampleSize".into(), serde_json::json!(input.min_sample_size));
        exp_data.insert("significanceLevel".into(), serde_json::json!(input.significance_level));
        exp_data.insert("minimumDetectableEffect".into(), serde_json::json!(input.minimum_detectable_effect));
        exp_data.insert("autoDecision".into(), serde_json::json!(input.auto_decision));
        exp_data.insert("status".into(), serde_json::json!("DRAFT"));
        exp_data.insert("createdAt".into(), serde_json::json!(now_str));
        exp_data.insert("updatedAt".into(), serde_json::json!(now_str));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "ab_experiments".to_string(),
            data: exp_data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        let mut variants_out = Vec::with_capacity(input.variants.len());
        for v in &input.variants {
            let mut var_data = serde_json::Map::new();
            var_data.insert("id".into(), serde_json::json!(v.id));
            var_data.insert("experimentId".into(), serde_json::json!(experiment_id));
            var_data.insert("name".into(), serde_json::json!(v.name));
            var_data.insert("weight".into(), serde_json::json!(v.weight));
            var_data.insert("isControl".into(), serde_json::json!(v.is_control));
            var_data.insert("parameters".into(), serde_json::json!(v.parameters.to_string()));
            var_data.insert("createdAt".into(), serde_json::json!(now_str));
            var_data.insert("updatedAt".into(), serde_json::json!(now_str));

            let op = crate::db::dual_write_manager::WriteOperation::Insert {
                table: "ab_variants".to_string(),
                data: var_data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(true),
            };
            proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

            variants_out.push(ExperimentVariant {
                id: v.id.clone(),
                experiment_id: experiment_id.clone(),
                name: v.name.clone(),
                weight: v.weight,
                is_control: v.is_control,
                parameters: v.parameters.clone(),
                created_at: now_str.clone(),
                updated_at: now_str.clone(),
            });
        }

        return Ok(Experiment {
            id: experiment_id,
            name: input.name,
            description: input.description,
            traffic_allocation: traffic_allocation.as_str().to_string(),
            min_sample_size: input.min_sample_size,
            significance_level: input.significance_level,
            minimum_detectable_effect: input.minimum_detectable_effect,
            auto_decision: input.auto_decision,
            status: "DRAFT".to_string(),
            started_at: None,
            ended_at: None,
            created_at: now_str.clone(),
            updated_at: now_str,
            variants: variants_out,
        });
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;

    sqlx::query(
        r#"INSERT INTO "ab_experiments" ("id","name","description","trafficAllocation","minSampleSize","significanceLevel","minimumDetectableEffect","autoDecision","status","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4::ab_traffic_allocation,$5,$6,$7,$8,$9::ab_experiment_status,NOW(),NOW())"#,
    )
    .bind(&experiment_id)
    .bind(&input.name)
    .bind(&input.description)
    .bind(traffic_allocation.as_str())
    .bind(input.min_sample_size)
    .bind(input.significance_level)
    .bind(input.minimum_detectable_effect)
    .bind(input.auto_decision)
    .bind("DRAFT")
    .execute(&pool)
    .await
    .map_err(|e| format!("写入失败: {e}"))?;

    let mut variants_out = Vec::with_capacity(input.variants.len());
    for v in &input.variants {
        let params_json = serde_json::to_string(&v.parameters).unwrap_or_else(|_| "{}".to_string());

        sqlx::query(
            r#"INSERT INTO "ab_variants" ("id","experimentId","name","weight","isControl","parameters","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW(),NOW())"#,
        )
        .bind(&v.id)
        .bind(&experiment_id)
        .bind(&v.name)
        .bind(v.weight)
        .bind(v.is_control)
        .bind(&params_json)
        .execute(&pool)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;

        variants_out.push(ExperimentVariant {
            id: v.id.clone(),
            experiment_id: experiment_id.clone(),
            name: v.name.clone(),
            weight: v.weight,
            is_control: v.is_control,
            parameters: v.parameters.clone(),
            created_at: now_str.clone(),
            updated_at: now_str.clone(),
        });
    }

    Ok(Experiment {
        id: experiment_id,
        name: input.name,
        description: input.description,
        traffic_allocation: traffic_allocation.as_str().to_string(),
        min_sample_size: input.min_sample_size,
        significance_level: input.significance_level,
        minimum_detectable_effect: input.minimum_detectable_effect,
        auto_decision: input.auto_decision,
        status: "DRAFT".to_string(),
        started_at: None,
        ended_at: None,
        created_at: now_str.clone(),
        updated_at: now_str,
        variants: variants_out,
    })
}

// ========== Read Operations ==========

pub async fn list_experiments(
    pool: &SelectedPool,
    status: Option<&str>,
    page: i32,
    page_size: i32,
) -> Result<(Vec<ExperimentListItem>, i64), String> {
    let offset = (page - 1) * page_size;

    match pool {
        SelectedPool::Primary(pg) => {
            let (rows, total) = if let Some(st) = status {
                let rows = sqlx::query(
                    r#"SELECT e."id", e."name", e."description", e."status"::text, e."trafficAllocation"::text, e."createdAt", e."startedAt",
                       (SELECT COUNT(*) FROM "ab_variants" WHERE "experimentId" = e."id") as variant_count,
                       COALESCE((SELECT SUM("sampleCount") FROM "ab_experiment_metrics" WHERE "experimentId" = e."id"), 0) as total_samples
                       FROM "ab_experiments" e WHERE e."status"::text = $1 ORDER BY e."createdAt" DESC LIMIT $2 OFFSET $3"#,
                )
                .bind(st)
                .bind(page_size)
                .bind(offset)
                .fetch_all(pg)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                let total: i64 = sqlx::query_scalar(
                    r#"SELECT COUNT(*) FROM "ab_experiments" WHERE "status"::text = $1"#,
                )
                .bind(st)
                .fetch_one(pg)
                .await
                .unwrap_or(0);

                (rows, total)
            } else {
                let rows = sqlx::query(
                    r#"SELECT e."id", e."name", e."description", e."status"::text, e."trafficAllocation"::text, e."createdAt", e."startedAt",
                       (SELECT COUNT(*) FROM "ab_variants" WHERE "experimentId" = e."id") as variant_count,
                       COALESCE((SELECT SUM("sampleCount") FROM "ab_experiment_metrics" WHERE "experimentId" = e."id"), 0) as total_samples
                       FROM "ab_experiments" e ORDER BY e."createdAt" DESC LIMIT $1 OFFSET $2"#,
                )
                .bind(page_size)
                .bind(offset)
                .fetch_all(pg)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ab_experiments""#)
                    .fetch_one(pg)
                    .await
                    .unwrap_or(0);

                (rows, total)
            };

            let items = rows.iter().map(|row| {
                let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
                let started_at: Option<chrono::NaiveDateTime> = row.try_get("startedAt").ok();

                ExperimentListItem {
                    id: row.try_get("id").unwrap_or_default(),
                    name: row.try_get("name").unwrap_or_default(),
                    description: row.try_get("description").ok(),
                    status: row.try_get("status").unwrap_or_default(),
                    traffic_allocation: row.try_get("trafficAllocation").unwrap_or_default(),
                    variant_count: row.try_get::<i64, _>("variant_count").unwrap_or(0) as i32,
                    total_samples: row.try_get("total_samples").unwrap_or(0),
                    created_at: DateTime::<Utc>::from_naive_utc_and_offset(created_at, Utc).to_rfc3339(),
                    started_at: started_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
                }
            }).collect();

            Ok((items, total))
        }
        SelectedPool::Fallback(sqlite) => {
            let (rows, total) = if let Some(st) = status {
                let rows = sqlx::query(
                    r#"SELECT e."id", e."name", e."description", e."status", e."trafficAllocation", e."createdAt", e."startedAt",
                       (SELECT COUNT(*) FROM "ab_variants" WHERE "experimentId" = e."id") as variant_count,
                       COALESCE((SELECT SUM("sampleCount") FROM "ab_experiment_metrics" WHERE "experimentId" = e."id"), 0) as total_samples
                       FROM "ab_experiments" e WHERE e."status" = ? ORDER BY e."createdAt" DESC LIMIT ? OFFSET ?"#,
                )
                .bind(st)
                .bind(page_size)
                .bind(offset)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                let total: i64 = sqlx::query_scalar(
                    r#"SELECT COUNT(*) FROM "ab_experiments" WHERE "status" = ?"#,
                )
                .bind(st)
                .fetch_one(sqlite)
                .await
                .unwrap_or(0);

                (rows, total)
            } else {
                let rows = sqlx::query(
                    r#"SELECT e."id", e."name", e."description", e."status", e."trafficAllocation", e."createdAt", e."startedAt",
                       (SELECT COUNT(*) FROM "ab_variants" WHERE "experimentId" = e."id") as variant_count,
                       COALESCE((SELECT SUM("sampleCount") FROM "ab_experiment_metrics" WHERE "experimentId" = e."id"), 0) as total_samples
                       FROM "ab_experiments" e ORDER BY e."createdAt" DESC LIMIT ? OFFSET ?"#,
                )
                .bind(page_size)
                .bind(offset)
                .fetch_all(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?;

                let total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "ab_experiments""#)
                    .fetch_one(sqlite)
                    .await
                    .unwrap_or(0);

                (rows, total)
            };

            let items = rows.iter().map(|row| {
                let created_at: String = row.try_get("createdAt").unwrap_or_default();
                let started_at: Option<String> = row.try_get("startedAt").ok();

                ExperimentListItem {
                    id: row.try_get("id").unwrap_or_default(),
                    name: row.try_get("name").unwrap_or_default(),
                    description: row.try_get("description").ok(),
                    status: row.try_get("status").unwrap_or_default(),
                    traffic_allocation: row.try_get("trafficAllocation").unwrap_or_default(),
                    variant_count: row.try_get::<i64, _>("variant_count").unwrap_or(0) as i32,
                    total_samples: row.try_get("total_samples").unwrap_or(0),
                    created_at,
                    started_at,
                }
            }).collect();

            Ok((items, total))
        }
    }
}

pub async fn get_experiment(pool: &SelectedPool, experiment_id: &str) -> Result<Option<Experiment>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT "id","name","description","trafficAllocation"::text,"minSampleSize","significanceLevel","minimumDetectableEffect","autoDecision","status"::text,"startedAt","endedAt","createdAt","updatedAt"
                   FROM "ab_experiments" WHERE "id" = $1"#,
            )
            .bind(experiment_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let Some(row) = row else { return Ok(None); };

            let variants = sqlx::query(
                r#"SELECT "id","experimentId","name","weight","isControl","parameters","createdAt","updatedAt"
                   FROM "ab_variants" WHERE "experimentId" = $1"#,
            )
            .bind(experiment_id)
            .fetch_all(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
            let updated_at: chrono::NaiveDateTime = row.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
            let started_at: Option<chrono::NaiveDateTime> = row.try_get("startedAt").ok();
            let ended_at: Option<chrono::NaiveDateTime> = row.try_get("endedAt").ok();

            let variants_out: Vec<ExperimentVariant> = variants.iter().map(|v| {
                let v_created: chrono::NaiveDateTime = v.try_get("createdAt").unwrap_or_else(|_| Utc::now().naive_utc());
                let v_updated: chrono::NaiveDateTime = v.try_get("updatedAt").unwrap_or_else(|_| Utc::now().naive_utc());
                let params_raw: serde_json::Value = v.try_get("parameters").unwrap_or(serde_json::json!({}));

                ExperimentVariant {
                    id: v.try_get("id").unwrap_or_default(),
                    experiment_id: v.try_get("experimentId").unwrap_or_default(),
                    name: v.try_get("name").unwrap_or_default(),
                    weight: v.try_get("weight").unwrap_or(0.5),
                    is_control: v.try_get("isControl").unwrap_or(false),
                    parameters: params_raw,
                    created_at: DateTime::<Utc>::from_naive_utc_and_offset(v_created, Utc).to_rfc3339(),
                    updated_at: DateTime::<Utc>::from_naive_utc_and_offset(v_updated, Utc).to_rfc3339(),
                }
            }).collect();

            Ok(Some(Experiment {
                id: row.try_get("id").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                description: row.try_get("description").ok(),
                traffic_allocation: row.try_get("trafficAllocation").unwrap_or_default(),
                min_sample_size: row.try_get("minSampleSize").unwrap_or(100),
                significance_level: row.try_get("significanceLevel").unwrap_or(0.05),
                minimum_detectable_effect: row.try_get("minimumDetectableEffect").unwrap_or(0.05),
                auto_decision: row.try_get("autoDecision").unwrap_or(false),
                status: row.try_get("status").unwrap_or_default(),
                started_at: started_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
                ended_at: ended_at.map(|d| DateTime::<Utc>::from_naive_utc_and_offset(d, Utc).to_rfc3339()),
                created_at: DateTime::<Utc>::from_naive_utc_and_offset(created_at, Utc).to_rfc3339(),
                updated_at: DateTime::<Utc>::from_naive_utc_and_offset(updated_at, Utc).to_rfc3339(),
                variants: variants_out,
            }))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT "id","name","description","trafficAllocation","minSampleSize","significanceLevel","minimumDetectableEffect","autoDecision","status","startedAt","endedAt","createdAt","updatedAt"
                   FROM "ab_experiments" WHERE "id" = ?"#,
            )
            .bind(experiment_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let Some(row) = row else { return Ok(None); };

            let variants = sqlx::query(
                r#"SELECT "id","experimentId","name","weight","isControl","parameters","createdAt","updatedAt"
                   FROM "ab_variants" WHERE "experimentId" = ?"#,
            )
            .bind(experiment_id)
            .fetch_all(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            let variants_out: Vec<ExperimentVariant> = variants.iter().map(|v| {
                let params_raw: String = v.try_get("parameters").unwrap_or_default();
                let params: serde_json::Value = serde_json::from_str(&params_raw).unwrap_or(serde_json::json!({}));

                ExperimentVariant {
                    id: v.try_get("id").unwrap_or_default(),
                    experiment_id: v.try_get("experimentId").unwrap_or_default(),
                    name: v.try_get("name").unwrap_or_default(),
                    weight: v.try_get("weight").unwrap_or(0.5),
                    is_control: v.try_get::<i32, _>("isControl").unwrap_or(0) != 0,
                    parameters: params,
                    created_at: v.try_get("createdAt").unwrap_or_default(),
                    updated_at: v.try_get("updatedAt").unwrap_or_default(),
                }
            }).collect();

            Ok(Some(Experiment {
                id: row.try_get("id").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                description: row.try_get("description").ok(),
                traffic_allocation: row.try_get("trafficAllocation").unwrap_or_default(),
                min_sample_size: row.try_get("minSampleSize").unwrap_or(100),
                significance_level: row.try_get("significanceLevel").unwrap_or(0.05),
                minimum_detectable_effect: row.try_get("minimumDetectableEffect").unwrap_or(0.05),
                auto_decision: row.try_get::<i32, _>("autoDecision").unwrap_or(0) != 0,
                status: row.try_get("status").unwrap_or_default(),
                started_at: row.try_get("startedAt").ok(),
                ended_at: row.try_get("endedAt").ok(),
                created_at: row.try_get("createdAt").unwrap_or_default(),
                updated_at: row.try_get("updatedAt").unwrap_or_default(),
                variants: variants_out,
            }))
        }
    }
}

// ========== Lifecycle Operations ==========

pub async fn start_experiment(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    experiment_id: &str,
) -> Result<(), String> {
    let pool = select_pool(proxy, state).await?;
    let experiment = get_experiment(&pool, experiment_id).await?.ok_or("实验不存在")?;

    if experiment.status != "DRAFT" && experiment.status != "PAUSED" {
        return Err(format!("实验状态为 {} 无法启动", experiment.status));
    }

    if experiment.variants.is_empty() {
        return Err("实验没有配置变体".to_string());
    }

    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(experiment_id));

        let mut data = serde_json::Map::new();
        data.insert("status".into(), serde_json::json!("RUNNING"));
        data.insert("startedAt".into(), serde_json::json!(now.to_rfc3339()));
        data.insert("updatedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "ab_experiments".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;

        for variant in &experiment.variants {
            let mut metrics_data = serde_json::Map::new();
            metrics_data.insert("id".into(), serde_json::json!(uuid::Uuid::new_v4().to_string()));
            metrics_data.insert("experimentId".into(), serde_json::json!(experiment_id));
            metrics_data.insert("variantId".into(), serde_json::json!(variant.id));
            metrics_data.insert("sampleCount".into(), serde_json::json!(0));
            metrics_data.insert("primaryMetric".into(), serde_json::json!(0.0));
            metrics_data.insert("averageReward".into(), serde_json::json!(0.0));
            metrics_data.insert("stdDev".into(), serde_json::json!(0.0));
            metrics_data.insert("m2".into(), serde_json::json!(0.0));
            metrics_data.insert("updatedAt".into(), serde_json::json!(now.to_rfc3339()));

            let op = crate::db::dual_write_manager::WriteOperation::Insert {
                table: "ab_experiment_metrics".to_string(),
                data: metrics_data,
                operation_id: uuid::Uuid::new_v4().to_string(),
                timestamp_ms: None,
                critical: Some(false),
            };
            let _ = proxy.write_operation(state, op).await;
        }

        return Ok(());
    }

    let pg = proxy.primary_pool().await.ok_or("数据库不可用")?;

    sqlx::query(
        r#"UPDATE "ab_experiments" SET "status" = 'RUNNING'::ab_experiment_status, "startedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1"#,
    )
    .bind(experiment_id)
    .execute(&pg)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    for variant in &experiment.variants {
        sqlx::query(
            r#"INSERT INTO "ab_experiment_metrics" ("id","experimentId","variantId","sampleCount","primaryMetric","averageReward","stdDev","m2","updatedAt")
               VALUES ($1,$2,$3,0,0,0,0,0,NOW())
               ON CONFLICT ("experimentId","variantId") DO NOTHING"#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(experiment_id)
        .bind(&variant.id)
        .execute(&pg)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    }

    Ok(())
}

pub async fn stop_experiment(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    experiment_id: &str,
    status: ExperimentStatus,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(experiment_id));

        let mut data = serde_json::Map::new();
        data.insert("status".into(), serde_json::json!(status.as_str()));
        data.insert("endedAt".into(), serde_json::json!(now.to_rfc3339()));
        data.insert("updatedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "ab_experiments".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;
    let status_str = status.as_str();

    sqlx::query(
        r#"UPDATE "ab_experiments" SET "status" = $1::ab_experiment_status, "endedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $2"#,
    )
    .bind(status_str)
    .bind(experiment_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(())
}

// ========== User Assignment ==========

pub async fn get_user_variant(
    pool: &SelectedPool,
    user_id: &str,
    experiment_id: &str,
) -> Result<Option<VariantAssignment>, String> {
    match pool {
        SelectedPool::Primary(pg) => {
            let row = sqlx::query(
                r#"SELECT a."variantId", v."name", v."isControl", v."parameters"
                   FROM "ab_user_assignments" a
                   JOIN "ab_variants" v ON a."variantId" = v."id"
                   WHERE a."userId" = $1 AND a."experimentId" = $2"#,
            )
            .bind(user_id)
            .bind(experiment_id)
            .fetch_optional(pg)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| VariantAssignment {
                variant_id: r.try_get("variantId").unwrap_or_default(),
                variant_name: r.try_get("name").unwrap_or_default(),
                is_control: r.try_get("isControl").unwrap_or(false),
                parameters: r.try_get("parameters").unwrap_or(serde_json::json!({})),
            }))
        }
        SelectedPool::Fallback(sqlite) => {
            let row = sqlx::query(
                r#"SELECT a."variantId", v."name", v."isControl", v."parameters"
                   FROM "ab_user_assignments" a
                   JOIN "ab_variants" v ON a."variantId" = v."id"
                   WHERE a."userId" = ? AND a."experimentId" = ?"#,
            )
            .bind(user_id)
            .bind(experiment_id)
            .fetch_optional(sqlite)
            .await
            .map_err(|e| format!("查询失败: {e}"))?;

            Ok(row.map(|r| {
                let params_raw: String = r.try_get("parameters").unwrap_or_default();
                let params = serde_json::from_str(&params_raw).unwrap_or(serde_json::json!({}));

                VariantAssignment {
                    variant_id: r.try_get("variantId").unwrap_or_default(),
                    variant_name: r.try_get("name").unwrap_or_default(),
                    is_control: r.try_get::<i32, _>("isControl").unwrap_or(0) != 0,
                    parameters: params,
                }
            }))
        }
    }
}

pub async fn assign_user_to_variant(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    user_id: &str,
    experiment_id: &str,
) -> Result<VariantAssignment, String> {
    let pool = select_pool(proxy, state).await?;

    if let Some(existing) = get_user_variant(&pool, user_id, experiment_id).await? {
        return Ok(existing);
    }

    let experiment = get_experiment(&pool, experiment_id).await?.ok_or("实验不存在")?;

    if experiment.status != "RUNNING" {
        return Err("实验未在运行中".to_string());
    }

    if experiment.variants.is_empty() {
        return Err("实验没有配置变体".to_string());
    }

    let selected_variant = select_variant_by_weight(&experiment.variants);
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let mut data = serde_json::Map::new();
        data.insert("userId".into(), serde_json::json!(user_id));
        data.insert("experimentId".into(), serde_json::json!(experiment_id));
        data.insert("variantId".into(), serde_json::json!(selected_variant.id));
        data.insert("assignedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Insert {
            table: "ab_user_assignments".to_string(),
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(true),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
    } else {
        let pg = proxy.primary_pool().await.ok_or("数据库不可用")?;
        sqlx::query(
            r#"INSERT INTO "ab_user_assignments" ("userId","experimentId","variantId","assignedAt")
               VALUES ($1,$2,$3,NOW())
               ON CONFLICT ("userId","experimentId") DO NOTHING"#,
        )
        .bind(user_id)
        .bind(experiment_id)
        .bind(&selected_variant.id)
        .execute(&pg)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    }

    Ok(VariantAssignment {
        variant_id: selected_variant.id.clone(),
        variant_name: selected_variant.name.clone(),
        is_control: selected_variant.is_control,
        parameters: selected_variant.parameters.clone(),
    })
}

// ========== Metrics Recording ==========

pub async fn record_metric(
    proxy: &DatabaseProxy,
    state: DatabaseState,
    experiment_id: &str,
    variant_id: &str,
    reward: f64,
) -> Result<(), String> {
    let now = Utc::now();

    if proxy.sqlite_enabled() {
        let pool = select_pool(proxy, state).await?;
        let metrics = match &pool {
            SelectedPool::Fallback(sqlite) => {
                sqlx::query(
                    r#"SELECT "id","sampleCount","averageReward","m2" FROM "ab_experiment_metrics" WHERE "experimentId" = ? AND "variantId" = ?"#,
                )
                .bind(experiment_id)
                .bind(variant_id)
                .fetch_optional(sqlite)
                .await
                .map_err(|e| format!("查询失败: {e}"))?
            }
            _ => return Err("不支持的数据库".to_string()),
        };

        let Some(metrics) = metrics else {
            return Err("指标记录不存在".to_string());
        };

        let id: String = metrics.try_get("id").unwrap_or_default();
        let old_count: i64 = metrics.try_get("sampleCount").unwrap_or(0);
        let old_avg: f64 = metrics.try_get("averageReward").unwrap_or(0.0);
        let old_m2: f64 = metrics.try_get("m2").unwrap_or(0.0);

        let new_count = old_count + 1;
        let delta = reward - old_avg;
        let new_avg = old_avg + delta / new_count as f64;
        let delta2 = reward - new_avg;
        let new_m2 = old_m2 + delta * delta2;
        let new_std_dev = if new_count > 1 { (new_m2 / (new_count - 1) as f64).sqrt() } else { 0.0 };

        let mut where_clause = serde_json::Map::new();
        where_clause.insert("id".into(), serde_json::json!(id));

        let mut data = serde_json::Map::new();
        data.insert("sampleCount".into(), serde_json::json!(new_count));
        data.insert("averageReward".into(), serde_json::json!(new_avg));
        data.insert("primaryMetric".into(), serde_json::json!(new_avg));
        data.insert("stdDev".into(), serde_json::json!(new_std_dev));
        data.insert("m2".into(), serde_json::json!(new_m2));
        data.insert("updatedAt".into(), serde_json::json!(now.to_rfc3339()));

        let op = crate::db::dual_write_manager::WriteOperation::Update {
            table: "ab_experiment_metrics".to_string(),
            r#where: where_clause,
            data,
            operation_id: uuid::Uuid::new_v4().to_string(),
            timestamp_ms: None,
            critical: Some(false),
        };
        proxy.write_operation(state, op).await.map_err(|e| format!("写入失败: {e}"))?;
        return Ok(());
    }

    let pool = proxy.primary_pool().await.ok_or("数据库不可用")?;

    sqlx::query(
        r#"UPDATE "ab_experiment_metrics" SET
           "sampleCount" = "sampleCount" + 1,
           "averageReward" = "averageReward" + ($1 - "averageReward") / ("sampleCount" + 1),
           "primaryMetric" = "averageReward" + ($1 - "averageReward") / ("sampleCount" + 1),
           "m2" = "m2" + ($1 - "averageReward") * ($1 - ("averageReward" + ($1 - "averageReward") / ("sampleCount" + 1))),
           "stdDev" = CASE WHEN "sampleCount" > 0 THEN SQRT(("m2" + ($1 - "averageReward") * ($1 - ("averageReward" + ($1 - "averageReward") / ("sampleCount" + 1)))) / "sampleCount") ELSE 0 END,
           "updatedAt" = NOW()
           WHERE "experimentId" = $2 AND "variantId" = $3"#,
    )
    .bind(reward)
    .bind(experiment_id)
    .bind(variant_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("更新失败: {e}"))?;

    Ok(())
}

// ========== Helper Functions ==========

fn select_variant_by_weight(variants: &[ExperimentVariant]) -> &ExperimentVariant {
    let mut rng = rand::rng();
    let random_value: f64 = rng.random();

    let mut cumulative_weight = 0.0;
    for variant in variants {
        cumulative_weight += variant.weight;
        if random_value <= cumulative_weight {
            return variant;
        }
    }

    variants.last().unwrap_or(&variants[0])
}
