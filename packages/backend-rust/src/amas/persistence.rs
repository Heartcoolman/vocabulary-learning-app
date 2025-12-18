use std::sync::Arc;

use crate::amas::types::{PersistedAMASState, UserState};
use crate::db::operations::{
    get_amas_user_model, get_amas_user_state, insert_amas_user_model, upsert_amas_user_state,
    AmasUserModel, AmasUserState,
};
use crate::db::DatabaseProxy;

pub struct AMASPersistence {
    db_proxy: Arc<DatabaseProxy>,
}

impl AMASPersistence {
    pub fn new(db_proxy: Arc<DatabaseProxy>) -> Self {
        Self { db_proxy }
    }

    pub async fn load_state(&self, user_id: &str) -> Option<PersistedAMASState> {
        let db_state = {
            let sm = self.db_proxy.state_machine();
            let guard = sm.read().await;
            guard.state()
        };

        let user_state_row = get_amas_user_state(&self.db_proxy, db_state, user_id)
            .await
            .ok()
            .flatten();

        let user_state = match user_state_row {
            Some(row) => self.row_to_user_state(&row),
            None => return None,
        };

        let bandit_model = get_amas_user_model(&self.db_proxy, db_state, user_id, "bandit")
            .await
            .ok()
            .flatten()
            .and_then(|m| serde_json::from_value(m.parameters).ok());

        let cold_start_state = get_amas_user_model(&self.db_proxy, db_state, user_id, "coldstart")
            .await
            .ok()
            .flatten()
            .and_then(|m| serde_json::from_value(m.parameters).ok());

        let strategy_model = get_amas_user_model(&self.db_proxy, db_state, user_id, "strategy")
            .await
            .ok()
            .flatten();

        let current_strategy = strategy_model
            .and_then(|m| serde_json::from_value(m.parameters).ok())
            .unwrap_or_default();

        let interaction_count = get_amas_user_model(&self.db_proxy, db_state, user_id, "interaction_count")
            .await
            .ok()
            .flatten()
            .and_then(|m| m.parameters.get("count").and_then(|v| v.as_i64()))
            .unwrap_or(0) as i32;

        Some(PersistedAMASState {
            user_id: user_id.to_string(),
            user_state,
            bandit_model,
            current_strategy,
            cold_start_state,
            interaction_count,
            last_updated: chrono::Utc::now().timestamp_millis(),
        })
    }

    pub async fn save_state(&self, state: &PersistedAMASState) -> Result<(), String> {
        let db_state = {
            let sm = self.db_proxy.state_machine();
            let guard = sm.read().await;
            guard.state()
        };

        let amas_state = self.user_state_to_row(&state.user_id, &state.user_state);
        upsert_amas_user_state(&self.db_proxy, db_state, &amas_state)
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
            insert_amas_user_model(&self.db_proxy, db_state, &model)
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
            insert_amas_user_model(&self.db_proxy, db_state, &model)
                .await
                .map_err(|e| e.to_string())?;
        }

        let strategy_model = AmasUserModel {
            id: format!("{}:strategy", state.user_id),
            user_id: state.user_id.clone(),
            model_type: "strategy".to_string(),
            parameters: serde_json::to_value(&state.current_strategy).unwrap_or_default(),
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        insert_amas_user_model(&self.db_proxy, db_state, &strategy_model)
            .await
            .map_err(|e| e.to_string())?;

        let count_model = AmasUserModel {
            id: format!("{}:interaction_count", state.user_id),
            user_id: state.user_id.clone(),
            model_type: "interaction_count".to_string(),
            parameters: serde_json::json!({ "count": state.interaction_count }),
            version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        insert_amas_user_model(&self.db_proxy, db_state, &count_model)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn row_to_user_state(&self, row: &AmasUserState) -> UserState {
        UserState {
            attention: row.attention,
            fatigue: row.fatigue,
            motivation: row.motivation,
            cognitive: crate::amas::types::CognitiveProfile {
                mem: row.cognitive_memory,
                speed: row.cognitive_speed,
                stability: row.cognitive_stability,
            },
            habit: None,
            trend: Some(crate::amas::types::TrendState::from_str(&row.trend_direction)),
            conf: row.confidence,
            ts: chrono::DateTime::parse_from_rfc3339(&row.updated_at)
                .map(|dt| dt.timestamp_millis())
                .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis()),
            visual_fatigue: None,
            fused_fatigue: None,
        }
    }

    fn user_state_to_row(&self, user_id: &str, state: &UserState) -> AmasUserState {
        AmasUserState {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            attention: state.attention,
            fatigue: state.fatigue,
            motivation: state.motivation,
            cognitive_memory: state.cognitive.mem,
            cognitive_speed: state.cognitive.speed,
            cognitive_stability: state.cognitive.stability,
            trend_direction: state.trend.map(|t| t.as_str().to_string()).unwrap_or_else(|| "flat".to_string()),
            trend_strength: 0.0,
            confidence: state.conf,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
