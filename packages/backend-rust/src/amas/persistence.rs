use std::sync::Arc;

use crate::amas::decision::ensemble::PerformanceTracker;
use crate::amas::types::{
    HabitProfile, HabitSamples, PersistedAMASState, RhythmPreference, UserState,
};
use crate::db::operations::{
    get_amas_user_model, get_amas_user_model_tx, get_amas_user_state, insert_amas_user_model_tx,
    upsert_amas_user_state_tx, AmasUserModel, AmasUserState,
};
use crate::db::DatabaseProxy;
use crate::amas::memory::MasteryHistory;

pub struct AMASPersistence {
    db_proxy: Arc<DatabaseProxy>,
}

impl AMASPersistence {
    pub fn new(db_proxy: Arc<DatabaseProxy>) -> Self {
        Self { db_proxy }
    }

    pub async fn load_state(&self, user_id: &str) -> Option<PersistedAMASState> {
        let user_state_row = get_amas_user_state(&self.db_proxy, user_id)
            .await
            .ok()
            .flatten()?;

        let mut user_state = self.row_to_user_state(&user_state_row);

        // Load habit profile from database
        user_state.habit = self.load_habit_profile(user_id).await;

        let bandit_model = get_amas_user_model(&self.db_proxy, user_id, "bandit")
            .await
            .ok()
            .flatten()
            .and_then(|m| serde_json::from_value(m.parameters).ok());

        let cold_start_state = get_amas_user_model(&self.db_proxy, user_id, "coldstart")
            .await
            .ok()
            .flatten()
            .and_then(|m| serde_json::from_value(m.parameters).ok());

        let strategy_model = get_amas_user_model(&self.db_proxy, user_id, "strategy")
            .await
            .ok()
            .flatten();

        let current_strategy = strategy_model
            .and_then(|m| serde_json::from_value(m.parameters).ok())
            .unwrap_or_default();

        let interaction_count = get_amas_user_model(&self.db_proxy, user_id, "interaction_count")
            .await
            .ok()
            .flatten()
            .and_then(|m| m.parameters.get("count").and_then(|v| v.as_i64()))
            .unwrap_or(0) as i32;

        // Parse last_updated from database row
        let last_updated = chrono::DateTime::parse_from_rfc3339(&user_state_row.updated_at)
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|e| {
                tracing::warn!(
                    user_id = %user_id,
                    updated_at = %user_state_row.updated_at,
                    error = %e,
                    "Failed to parse updatedAt timestamp, falling back to Utc::now()"
                );
                chrono::Utc::now().timestamp_millis()
            });

        // Load mastery_history from database row
        let mastery_history: Option<MasteryHistory> = user_state_row
            .mastery_history
            .as_ref()
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        // Load ensemble_performance from database row
        let ensemble_performance: Option<PerformanceTracker> = user_state_row
            .ensemble_performance
            .as_ref()
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        let algorithm_states: Option<serde_json::Value> = user_state_row
            .algorithm_states
            .clone();

        Some(PersistedAMASState {
            user_id: user_id.to_string(),
            user_state,
            bandit_model,
            current_strategy,
            cold_start_state,
            interaction_count,
            last_updated,
            mastery_history,
            ensemble_performance,
            algorithm_states,
        })
    }

    async fn load_habit_profile(&self, user_id: &str) -> Option<HabitProfile> {
        let pool = self.db_proxy.pool();
        let row = sqlx::query(
            r#"SELECT "timePref", "rhythmPref" FROM "habit_profiles" WHERE "userId" = $1 LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()?;

        use sqlx::Row;
        let time_pref: Option<serde_json::Value> = row.try_get("timePref").ok().flatten();
        let rhythm_pref: Option<serde_json::Value> = row.try_get("rhythmPref").ok().flatten();

        let time_pref = time_pref
            .and_then(|v| v.as_array().cloned())
            .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect::<Vec<_>>())
            .filter(|v| v.len() == 24)
            .unwrap_or_else(|| vec![0.0; 24]);

        let rhythm = rhythm_pref
            .and_then(|v| v.as_object().cloned())
            .map(|obj| RhythmPreference {
                session_median_minutes: obj
                    .get("sessionMedianMinutes")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(15.0),
                batch_median: obj
                    .get("batchMedian")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(8.0),
            })
            .unwrap_or_default();

        let preferred_time_slots = compute_preferred_slots(&time_pref);

        Some(HabitProfile {
            time_pref,
            rhythm_pref: rhythm,
            preferred_time_slots,
            samples: HabitSamples::default(),
        })
    }

    pub async fn save_state(&self, state: &PersistedAMASState) -> Result<(), String> {
        let pool = self.db_proxy.pool();
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Build AmasUserState row with mastery_history and ensemble_performance
        let mut amas_state = self.user_state_to_row(&state.user_id, &state.user_state);
        amas_state.mastery_history = state
            .mastery_history
            .as_ref()
            .and_then(|h| serde_json::to_value(h).ok());
        amas_state.ensemble_performance = state
            .ensemble_performance
            .as_ref()
            .and_then(|p| serde_json::to_value(p).ok());
        amas_state.algorithm_states = state.algorithm_states.clone();

        upsert_amas_user_state_tx(&mut tx, &amas_state)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(ref bandit) = state.bandit_model {
            let model = AmasUserModel {
                id: format!("{}:bandit", state.user_id),
                user_id: state.user_id.clone(),
                model_type: "bandit".to_string(),
                parameters: serde_json::to_value(bandit).unwrap_or_default(),
                version: 1,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            };
            insert_amas_user_model_tx(&mut tx, &model)
                .await
                .map_err(|e| e.to_string())?;
        }

        if let Some(ref cold_start) = state.cold_start_state {
            let model = AmasUserModel {
                id: format!("{}:coldstart", state.user_id),
                user_id: state.user_id.clone(),
                model_type: "coldstart".to_string(),
                parameters: serde_json::to_value(cold_start).unwrap_or_default(),
                version: 1,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            };
            insert_amas_user_model_tx(&mut tx, &model)
                .await
                .map_err(|e| e.to_string())?;
        }

        self.save_strategy_snapshot_tx(&mut tx, state).await?;

        let count_model = AmasUserModel {
            id: format!("{}:interaction_count", state.user_id),
            user_id: state.user_id.clone(),
            model_type: "interaction_count".to_string(),
            parameters: serde_json::json!({ "count": state.interaction_count }),
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        insert_amas_user_model_tx(&mut tx, &count_model)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn save_strategy_snapshot_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        state: &PersistedAMASState,
    ) -> Result<(), String> {
        let new_parameters = serde_json::to_value(&state.current_strategy).unwrap_or_default();
        let previous = get_amas_user_model_tx(tx, &state.user_id, "strategy")
            .await
            .map_err(|e| e.to_string())?;

        if let Some(ref previous) = previous {
            if previous.parameters == new_parameters {
                return Ok(());
            }
        }

        let next_version = previous
            .as_ref()
            .map(|m| m.version.max(0).saturating_add(1))
            .unwrap_or(1);

        let strategy_model = AmasUserModel {
            id: format!("{}:strategy:{}", state.user_id, next_version),
            user_id: state.user_id.clone(),
            model_type: "strategy".to_string(),
            parameters: new_parameters,
            version: next_version,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        insert_amas_user_model_tx(tx, &strategy_model)
            .await
            .map_err(|e| e.to_string())
    }

    fn row_to_user_state(&self, row: &AmasUserState) -> UserState {
        let cognitive = if let Some(obj) = row.cognitive_profile.as_object() {
            crate::amas::types::CognitiveProfile {
                mem: obj.get("mem").and_then(|v| v.as_f64()).unwrap_or(0.5),
                speed: obj.get("speed").and_then(|v| v.as_f64()).unwrap_or(0.5),
                stability: obj.get("stability").and_then(|v| v.as_f64()).unwrap_or(0.5),
            }
        } else {
            crate::amas::types::CognitiveProfile::default()
        };

        let trend = row
            .trend_state
            .as_ref()
            .map(|s| crate::amas::types::TrendState::parse(s));

        // Parse visual fatigue from row
        let visual_fatigue =
            row.visual_fatigue
                .map(|score| crate::amas::types::VisualFatigueState {
                    score,
                    confidence: 0.5,
                    freshness: 1.0,
                    trend: 0.0,
                    last_updated: chrono::Utc::now().timestamp_millis(),
                });

        UserState {
            attention: row.attention,
            fatigue: row.fatigue,
            motivation: row.motivation,
            cognitive,
            habit: None,
            trend,
            conf: row.confidence,
            ts: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                .map(|dt| dt.timestamp_millis())
                .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis()),
            visual_fatigue,
            fused_fatigue: row.fused_fatigue,
            reward_profile: None,
        }
    }

    fn user_state_to_row(&self, user_id: &str, state: &UserState) -> AmasUserState {
        let cognitive_profile = serde_json::json!({
            "mem": state.cognitive.mem,
            "speed": state.cognitive.speed,
            "stability": state.cognitive.stability
        });

        AmasUserState {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            attention: state.attention,
            fatigue: state.fatigue,
            motivation: state.motivation,
            cognitive_profile,
            trend_state: state.trend.map(|t| t.as_str().to_string()),
            confidence: state.conf,
            visual_fatigue: state.visual_fatigue.as_ref().map(|v| v.score),
            fused_fatigue: state.fused_fatigue,
            mastery_history: None,
            habit_samples: state
                .habit
                .as_ref()
                .map(|h| serde_json::to_value(&h.samples).unwrap_or_default()),
            ensemble_performance: None,
            algorithm_states: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

fn compute_preferred_slots(time_pref: &[f64]) -> Vec<i32> {
    let mut indexed: Vec<(usize, f64)> = time_pref.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    indexed
        .into_iter()
        .take(3)
        .map(|(hour, _)| hour as i32)
        .collect()
}
