use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::db::state_machine::DatabaseState;
use crate::db::DatabaseProxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AMASConfigType {
    ParamBound,
    Threshold,
    RewardWeight,
    SafetyThreshold,
}

impl AMASConfigType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ParamBound => "param_bound",
            Self::Threshold => "threshold",
            Self::RewardWeight => "reward_weight",
            Self::SafetyThreshold => "safety_threshold",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamBound {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamBoundConfig {
    pub alpha: ParamBound,
    pub fatigue_k: ParamBound,
    pub motivation_rho: ParamBound,
    pub optimal_difficulty: ParamBound,
}

impl Default for ParamBoundConfig {
    fn default() -> Self {
        Self {
            alpha: ParamBound { min: 0.3, max: 2.0 },
            fatigue_k: ParamBound { min: 0.02, max: 0.2 },
            motivation_rho: ParamBound { min: 0.6, max: 0.95 },
            optimal_difficulty: ParamBound { min: 0.2, max: 0.8 },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdConfig {
    pub high_accuracy: f64,
    pub low_accuracy: f64,
    pub low_fatigue: f64,
    pub high_fatigue: f64,
    pub fast_recovery_slope: f64,
    pub slow_recovery_slope: f64,
    pub motivation_improve: f64,
    pub motivation_worsen: f64,
}

impl Default for ThresholdConfig {
    fn default() -> Self {
        Self {
            high_accuracy: 0.85,
            low_accuracy: 0.6,
            low_fatigue: 0.4,
            high_fatigue: 0.7,
            fast_recovery_slope: -0.1,
            slow_recovery_slope: 0.1,
            motivation_improve: 0.2,
            motivation_worsen: -0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardWeightConfig {
    pub correct: f64,
    pub fatigue: f64,
    pub speed: f64,
    pub frustration: f64,
    pub engagement: f64,
}

impl Default for RewardWeightConfig {
    fn default() -> Self {
        Self {
            correct: 1.0,
            fatigue: 0.6,
            speed: 0.4,
            frustration: 0.8,
            engagement: 0.3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyThresholdConfig {
    pub min_attention: f64,
    pub mid_attention: f64,
    pub high_fatigue: f64,
    pub critical_fatigue: f64,
    pub low_motivation: f64,
    pub critical_motivation: f64,
    pub high_motivation: f64,
}

impl Default for SafetyThresholdConfig {
    fn default() -> Self {
        Self {
            min_attention: 0.3,
            mid_attention: 0.5,
            high_fatigue: 0.6,
            critical_fatigue: 0.8,
            low_motivation: -0.3,
            critical_motivation: -0.5,
            high_motivation: 0.5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AMASConfig {
    pub param_bounds: ParamBoundConfig,
    pub thresholds: ThresholdConfig,
    pub reward_weights: RewardWeightConfig,
    pub safety_thresholds: SafetyThresholdConfig,
    pub version: String,
    pub updated_at: i64,
    pub updated_by: String,
}

impl Default for AMASConfig {
    fn default() -> Self {
        Self {
            param_bounds: ParamBoundConfig::default(),
            thresholds: ThresholdConfig::default(),
            reward_weights: RewardWeightConfig::default(),
            safety_thresholds: SafetyThresholdConfig::default(),
            version: "1.0.0".to_string(),
            updated_at: chrono::Utc::now().timestamp_millis(),
            updated_by: "system".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigUpdateRecord {
    pub id: String,
    pub config_type: String,
    pub target: String,
    pub previous_value: f64,
    pub new_value: f64,
    pub changed_by: String,
    pub change_reason: String,
    pub suggestion_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AMASConfigError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error("db error: {0}")]
    Database(String),
}

struct CachedConfig {
    config: AMASConfig,
    cached_at: Instant,
}

pub struct AMASConfigService {
    db_proxy: Arc<DatabaseProxy>,
    cache: RwLock<Option<CachedConfig>>,
    cache_ttl: Duration,
}

impl AMASConfigService {
    pub fn new(db_proxy: Arc<DatabaseProxy>) -> Self {
        Self {
            db_proxy,
            cache: RwLock::new(None),
            cache_ttl: Duration::from_secs(5 * 60),
        }
    }

    pub async fn get_config(&self, state: DatabaseState) -> Result<AMASConfig, AMASConfigError> {
        {
            let cache = self.cache.read().await;
            if let Some(ref cached) = *cache {
                if cached.cached_at.elapsed() < self.cache_ttl {
                    return Ok(cached.config.clone());
                }
            }
        }

        let config = self.load_config_from_db(state).await?;

        {
            let mut cache = self.cache.write().await;
            *cache = Some(CachedConfig {
                config: config.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(config)
    }

    pub async fn get_param_bounds(&self, state: DatabaseState) -> Result<ParamBoundConfig, AMASConfigError> {
        let config = self.get_config(state).await?;
        Ok(config.param_bounds)
    }

    pub async fn get_thresholds(&self, state: DatabaseState) -> Result<ThresholdConfig, AMASConfigError> {
        let config = self.get_config(state).await?;
        Ok(config.thresholds)
    }

    pub async fn get_reward_weights(&self, state: DatabaseState) -> Result<RewardWeightConfig, AMASConfigError> {
        let config = self.get_config(state).await?;
        Ok(config.reward_weights)
    }

    pub async fn get_safety_thresholds(&self, state: DatabaseState) -> Result<SafetyThresholdConfig, AMASConfigError> {
        let config = self.get_config(state).await?;
        Ok(config.safety_thresholds)
    }

    pub async fn update_param_bound(
        &self,
        state: DatabaseState,
        target: &str,
        bound_type: &str,
        new_value: f64,
        changed_by: &str,
        change_reason: &str,
        suggestion_id: Option<&str>,
    ) -> Result<(), AMASConfigError> {
        let mut config = self.get_config(state).await?;
        let full_target = format!("{}.{}", target, bound_type);

        let param_bound = match target {
            "alpha" => &mut config.param_bounds.alpha,
            "fatigueK" => &mut config.param_bounds.fatigue_k,
            "motivationRho" => &mut config.param_bounds.motivation_rho,
            "optimalDifficulty" => &mut config.param_bounds.optimal_difficulty,
            _ => return Err(AMASConfigError::Validation(format!("invalid param bound target: {}", target))),
        };

        let prev_value = if bound_type == "min" { param_bound.min } else { param_bound.max };

        if bound_type == "min" {
            if new_value >= param_bound.max {
                return Err(AMASConfigError::Validation(format!(
                    "min value {} must be less than max value {}",
                    new_value, param_bound.max
                )));
            }
            param_bound.min = new_value;
        } else if bound_type == "max" {
            if new_value <= param_bound.min {
                return Err(AMASConfigError::Validation(format!(
                    "max value {} must be greater than min value {}",
                    new_value, param_bound.min
                )));
            }
            param_bound.max = new_value;
        } else {
            return Err(AMASConfigError::Validation(format!("invalid bound type: {}", bound_type)));
        }

        config.version = increment_version(&config.version);
        config.updated_at = chrono::Utc::now().timestamp_millis();
        config.updated_by = changed_by.to_string();

        self.save_config_to_db(
            state,
            AMASConfigType::ParamBound,
            &full_target,
            prev_value,
            new_value,
            &config,
            changed_by,
            change_reason,
            suggestion_id,
        )
        .await?;

        self.invalidate_cache().await;
        Ok(())
    }

    pub async fn update_threshold(
        &self,
        state: DatabaseState,
        target: &str,
        new_value: f64,
        changed_by: &str,
        change_reason: &str,
        suggestion_id: Option<&str>,
    ) -> Result<(), AMASConfigError> {
        let mut config = self.get_config(state).await?;

        let prev_value = match target {
            "highAccuracy" => std::mem::replace(&mut config.thresholds.high_accuracy, new_value),
            "lowAccuracy" => std::mem::replace(&mut config.thresholds.low_accuracy, new_value),
            "lowFatigue" => std::mem::replace(&mut config.thresholds.low_fatigue, new_value),
            "highFatigue" => std::mem::replace(&mut config.thresholds.high_fatigue, new_value),
            "fastRecoverySlope" => std::mem::replace(&mut config.thresholds.fast_recovery_slope, new_value),
            "slowRecoverySlope" => std::mem::replace(&mut config.thresholds.slow_recovery_slope, new_value),
            "motivationImprove" => std::mem::replace(&mut config.thresholds.motivation_improve, new_value),
            "motivationWorsen" => std::mem::replace(&mut config.thresholds.motivation_worsen, new_value),
            _ => return Err(AMASConfigError::Validation(format!("invalid threshold target: {}", target))),
        };

        config.version = increment_version(&config.version);
        config.updated_at = chrono::Utc::now().timestamp_millis();
        config.updated_by = changed_by.to_string();

        self.save_config_to_db(
            state,
            AMASConfigType::Threshold,
            target,
            prev_value,
            new_value,
            &config,
            changed_by,
            change_reason,
            suggestion_id,
        )
        .await?;

        self.invalidate_cache().await;
        Ok(())
    }

    pub async fn update_reward_weight(
        &self,
        state: DatabaseState,
        target: &str,
        new_value: f64,
        changed_by: &str,
        change_reason: &str,
        suggestion_id: Option<&str>,
    ) -> Result<(), AMASConfigError> {
        if new_value < 0.0 || new_value > 2.0 {
            return Err(AMASConfigError::Validation(format!(
                "reward weight {} is out of valid range [0, 2]",
                new_value
            )));
        }

        let mut config = self.get_config(state).await?;

        let prev_value = match target {
            "correct" => std::mem::replace(&mut config.reward_weights.correct, new_value),
            "fatigue" => std::mem::replace(&mut config.reward_weights.fatigue, new_value),
            "speed" => std::mem::replace(&mut config.reward_weights.speed, new_value),
            "frustration" => std::mem::replace(&mut config.reward_weights.frustration, new_value),
            "engagement" => std::mem::replace(&mut config.reward_weights.engagement, new_value),
            _ => return Err(AMASConfigError::Validation(format!("invalid reward weight target: {}", target))),
        };

        config.version = increment_version(&config.version);
        config.updated_at = chrono::Utc::now().timestamp_millis();
        config.updated_by = changed_by.to_string();

        self.save_config_to_db(
            state,
            AMASConfigType::RewardWeight,
            target,
            prev_value,
            new_value,
            &config,
            changed_by,
            change_reason,
            suggestion_id,
        )
        .await?;

        self.invalidate_cache().await;
        Ok(())
    }

    pub async fn update_safety_threshold(
        &self,
        state: DatabaseState,
        target: &str,
        new_value: f64,
        changed_by: &str,
        change_reason: &str,
        suggestion_id: Option<&str>,
    ) -> Result<(), AMASConfigError> {
        let mut config = self.get_config(state).await?;

        let prev_value = match target {
            "minAttention" => std::mem::replace(&mut config.safety_thresholds.min_attention, new_value),
            "midAttention" => std::mem::replace(&mut config.safety_thresholds.mid_attention, new_value),
            "highFatigue" => std::mem::replace(&mut config.safety_thresholds.high_fatigue, new_value),
            "criticalFatigue" => std::mem::replace(&mut config.safety_thresholds.critical_fatigue, new_value),
            "lowMotivation" => std::mem::replace(&mut config.safety_thresholds.low_motivation, new_value),
            "criticalMotivation" => std::mem::replace(&mut config.safety_thresholds.critical_motivation, new_value),
            "highMotivation" => std::mem::replace(&mut config.safety_thresholds.high_motivation, new_value),
            _ => return Err(AMASConfigError::Validation(format!("invalid safety threshold target: {}", target))),
        };

        config.version = increment_version(&config.version);
        config.updated_at = chrono::Utc::now().timestamp_millis();
        config.updated_by = changed_by.to_string();

        self.save_config_to_db(
            state,
            AMASConfigType::SafetyThreshold,
            target,
            prev_value,
            new_value,
            &config,
            changed_by,
            change_reason,
            suggestion_id,
        )
        .await?;

        self.invalidate_cache().await;
        Ok(())
    }

    pub async fn get_config_history(
        &self,
        state: DatabaseState,
        config_type: Option<AMASConfigType>,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<ConfigUpdateRecord>, AMASConfigError> {
        let limit = limit.unwrap_or(50).min(100);
        let offset = offset.unwrap_or(0);

        let primary = self.db_proxy.primary_pool().await;
        let fallback = self.db_proxy.fallback_pool().await;
        let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

        if use_fallback {
            let Some(pool) = fallback else {
                return Ok(vec![]);
            };

            let rows = sqlx::query(
                r#"
                SELECT "id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp"
                FROM "config_history"
                ORDER BY "timestamp" DESC
                LIMIT ? OFFSET ?
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await?;

            return Ok(rows
                .into_iter()
                .filter_map(|row| parse_config_history_row_sqlite(&row, config_type))
                .collect());
        }

        let Some(pool) = primary else {
            return Ok(vec![]);
        };

        let rows = sqlx::query(
            r#"
            SELECT "id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp"
            FROM "config_history"
            ORDER BY "timestamp" DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await?;

        Ok(rows
            .into_iter()
            .filter_map(|row| parse_config_history_row_pg(&row, config_type))
            .collect())
    }

    pub async fn reset_to_defaults(
        &self,
        state: DatabaseState,
        changed_by: &str,
    ) -> Result<(), AMASConfigError> {
        let config = AMASConfig::default();

        self.save_config_to_db(
            state,
            AMASConfigType::ParamBound,
            "all",
            0.0,
            0.0,
            &config,
            changed_by,
            "重置为默认配置",
            None,
        )
        .await?;

        self.invalidate_cache().await;
        Ok(())
    }

    async fn load_config_from_db(&self, state: DatabaseState) -> Result<AMASConfig, AMASConfigError> {
        let primary = self.db_proxy.primary_pool().await;
        let fallback = self.db_proxy.fallback_pool().await;
        let use_fallback = matches!(state, DatabaseState::Degraded | DatabaseState::Unavailable) || primary.is_none();

        let config_json: Option<serde_json::Value> = if use_fallback {
            let Some(pool) = fallback else {
                return Ok(AMASConfig::default());
            };

            let row = sqlx::query(
                r#"
                SELECT "masteryThresholds"
                FROM "algorithm_configs"
                WHERE "name" = 'amas_config'
                ORDER BY "createdAt" DESC
                LIMIT 1
                "#,
            )
            .fetch_optional(&pool)
            .await?;

            row.and_then(|r| {
                r.try_get::<String, _>("masteryThresholds")
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
            })
        } else {
            let Some(pool) = primary else {
                return Ok(AMASConfig::default());
            };

            let row = sqlx::query(
                r#"
                SELECT "masteryThresholds"
                FROM "algorithm_configs"
                WHERE "name" = 'amas_config'
                ORDER BY "createdAt" DESC
                LIMIT 1
                "#,
            )
            .fetch_optional(&pool)
            .await?;

            row.and_then(|r| r.try_get::<serde_json::Value, _>("masteryThresholds").ok())
        };

        if let Some(json) = config_json {
            if let Some(amas_config) = json.get("amasConfig") {
                let mut config = AMASConfig::default();

                if let Some(pb) = amas_config.get("paramBounds") {
                    if let Ok(parsed) = serde_json::from_value(pb.clone()) {
                        config.param_bounds = parsed;
                    }
                }
                if let Some(th) = amas_config.get("thresholds") {
                    if let Ok(parsed) = serde_json::from_value(th.clone()) {
                        config.thresholds = parsed;
                    }
                }
                if let Some(rw) = amas_config.get("rewardWeights") {
                    if let Ok(parsed) = serde_json::from_value(rw.clone()) {
                        config.reward_weights = parsed;
                    }
                }
                if let Some(st) = amas_config.get("safetyThresholds") {
                    if let Ok(parsed) = serde_json::from_value(st.clone()) {
                        config.safety_thresholds = parsed;
                    }
                }
                if let Some(v) = amas_config.get("version").and_then(|v| v.as_str()) {
                    config.version = v.to_string();
                }

                return Ok(config);
            }
        }

        Ok(AMASConfig::default())
    }

    async fn save_config_to_db(
        &self,
        _state: DatabaseState,
        config_type: AMASConfigType,
        target: &str,
        prev_value: f64,
        new_value: f64,
        config: &AMASConfig,
        changed_by: &str,
        change_reason: &str,
        suggestion_id: Option<&str>,
    ) -> Result<(), AMASConfigError> {
        let primary = self.db_proxy.primary_pool().await;
        let Some(pool) = primary else {
            return Err(AMASConfigError::Database("primary pool unavailable".to_string()));
        };

        let amas_config_json = serde_json::json!({
            "amasConfig": {
                "paramBounds": config.param_bounds,
                "thresholds": config.thresholds,
                "rewardWeights": config.reward_weights,
                "safetyThresholds": config.safety_thresholds,
                "version": config.version
            }
        });

        let existing: Option<(String,)> = sqlx::query_as(
            r#"SELECT "id" FROM "algorithm_configs" WHERE "name" = 'amas_config' LIMIT 1"#,
        )
        .fetch_optional(&pool)
        .await?;

        let config_id = if let Some((id,)) = existing {
            sqlx::query(
                r#"
                UPDATE "algorithm_configs"
                SET "masteryThresholds" = $1, "updatedAt" = NOW()
                WHERE "id" = $2
                "#,
            )
            .bind(&amas_config_json)
            .bind(&id)
            .execute(&pool)
            .await?;
            id
        } else {
            let new_id = Uuid::new_v4().to_string();
            sqlx::query(
                r#"
                INSERT INTO "algorithm_configs" (
                    "id", "name", "description", "reviewIntervals", "masteryThresholds",
                    "isDefault", "createdBy", "createdAt", "updatedAt"
                ) VALUES ($1, 'amas_config', 'AMAS 系统动态配置', '[1,3,7,14,30,60,90]', $2, false, $3, NOW(), NOW())
                "#,
            )
            .bind(&new_id)
            .bind(&amas_config_json)
            .bind(changed_by)
            .execute(&pool)
            .await?;
            new_id
        };

        let prev_json = serde_json::json!({
            "configType": config_type.as_str(),
            "target": target,
            "value": prev_value,
            "suggestionId": suggestion_id
        });
        let new_json = serde_json::json!({
            "configType": config_type.as_str(),
            "target": target,
            "value": new_value,
            "suggestionId": suggestion_id
        });

        let history_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO "config_history" (
                "id", "configId", "changedBy", "changeReason", "previousValue", "newValue", "timestamp"
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            "#,
        )
        .bind(&history_id)
        .bind(&config_id)
        .bind(changed_by)
        .bind(change_reason)
        .bind(&prev_json)
        .bind(&new_json)
        .execute(&pool)
        .await?;

        Ok(())
    }

    async fn invalidate_cache(&self) {
        let mut cache = self.cache.write().await;
        *cache = None;
    }
}

fn increment_version(version: &str) -> String {
    let parts: Vec<u32> = version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();

    if parts.len() >= 3 {
        format!("{}.{}.{}", parts[0], parts[1], parts[2] + 1)
    } else {
        "1.0.1".to_string()
    }
}

fn parse_config_history_row_pg(
    row: &sqlx::postgres::PgRow,
    filter_type: Option<AMASConfigType>,
) -> Option<ConfigUpdateRecord> {
    use sqlx::Row;
    let id: String = row.try_get("id").ok()?;
    let changed_by: String = row.try_get("changedBy").ok()?;
    let change_reason: Option<String> = row.try_get("changeReason").ok();
    let prev_json: serde_json::Value = row.try_get("previousValue").ok()?;
    let new_json: serde_json::Value = row.try_get("newValue").ok()?;
    let timestamp: chrono::DateTime<chrono::Utc> = row.try_get("timestamp").ok()?;

    parse_config_json(id, changed_by, change_reason, prev_json, new_json, timestamp, filter_type)
}

fn parse_config_history_row_sqlite(
    row: &sqlx::sqlite::SqliteRow,
    filter_type: Option<AMASConfigType>,
) -> Option<ConfigUpdateRecord> {
    use sqlx::Row;
    let id: String = row.try_get("id").ok()?;
    let changed_by: String = row.try_get("changedBy").ok()?;
    let change_reason: Option<String> = row.try_get("changeReason").ok();
    let prev_str: String = row.try_get("previousValue").ok()?;
    let new_str: String = row.try_get("newValue").ok()?;
    let timestamp_str: String = row.try_get("timestamp").ok()?;

    let prev_json: serde_json::Value = serde_json::from_str(&prev_str).ok()?;
    let new_json: serde_json::Value = serde_json::from_str(&new_str).ok()?;
    let timestamp = chrono::DateTime::parse_from_rfc3339(&timestamp_str)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc))?;

    parse_config_json(id, changed_by, change_reason, prev_json, new_json, timestamp, filter_type)
}

fn parse_config_json(
    id: String,
    changed_by: String,
    change_reason: Option<String>,
    prev_json: serde_json::Value,
    new_json: serde_json::Value,
    timestamp: chrono::DateTime<chrono::Utc>,
    filter_type: Option<AMASConfigType>,
) -> Option<ConfigUpdateRecord> {
    let config_type = prev_json.get("configType").and_then(|v| v.as_str()).unwrap_or("unknown");
    let target = prev_json.get("target").and_then(|v| v.as_str()).unwrap_or("");
    let prev_value = prev_json.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let new_value = new_json.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let suggestion_id = prev_json.get("suggestionId").and_then(|v| v.as_str()).map(|s| s.to_string());

    if let Some(filter) = filter_type {
        if config_type != filter.as_str() {
            return None;
        }
    }

    Some(ConfigUpdateRecord {
        id,
        config_type: config_type.to_string(),
        target: target.to_string(),
        previous_value: prev_value,
        new_value,
        changed_by,
        change_reason: change_reason.unwrap_or_default(),
        suggestion_id,
        created_at: timestamp.to_rfc3339(),
    })
}
