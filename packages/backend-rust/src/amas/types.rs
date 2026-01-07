#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DifficultyLevel {
    Easy,
    Mid,
    Hard,
}

impl Default for DifficultyLevel {
    fn default() -> Self {
        Self::Mid
    }
}

impl DifficultyLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Mid => "mid",
            Self::Hard => "hard",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "easy" => Self::Easy,
            "hard" => Self::Hard,
            _ => Self::Mid,
        }
    }

    pub fn difficulty_range(&self) -> (f64, f64) {
        match self {
            Self::Easy => (0.0, 0.4),
            Self::Mid => (0.2, 0.7),
            Self::Hard => (0.5, 1.0),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrendState {
    Up,
    Flat,
    Stuck,
    Down,
}

impl Default for TrendState {
    fn default() -> Self {
        Self::Flat
    }
}

impl TrendState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Up => "up",
            Self::Flat => "flat",
            Self::Stuck => "stuck",
            Self::Down => "down",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "up" => Self::Up,
            "stuck" => Self::Stuck,
            "down" => Self::Down,
            _ => Self::Flat,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserType {
    Fast,
    Stable,
    Cautious,
}

impl Default for UserType {
    fn default() -> Self {
        Self::Stable
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ColdStartPhase {
    Classify,
    Explore,
    Normal,
}

impl Default for ColdStartPhase {
    fn default() -> Self {
        Self::Classify
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveProfile {
    pub mem: f64,
    pub speed: f64,
    pub stability: f64,
}

impl Default for CognitiveProfile {
    fn default() -> Self {
        Self {
            mem: 0.5,
            speed: 0.5,
            stability: 0.5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RhythmPreference {
    pub session_median_minutes: f64,
    pub batch_median: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HabitSamples {
    pub time_events: i32,
    pub sessions: i32,
    pub batches: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitProfile {
    pub time_pref: Vec<f64>,
    pub rhythm_pref: RhythmPreference,
    pub preferred_time_slots: Vec<i32>,
    pub samples: HabitSamples,
}

impl Default for HabitProfile {
    fn default() -> Self {
        Self {
            time_pref: vec![0.0; 24],
            rhythm_pref: RhythmPreference::default(),
            preferred_time_slots: vec![],
            samples: HabitSamples::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisualFatigueState {
    pub score: f64,
    pub confidence: f64,
    pub freshness: f64,
    pub trend: f64,
    pub last_updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserState {
    #[serde(rename = "A")]
    pub attention: f64,
    #[serde(rename = "F")]
    pub fatigue: f64,
    #[serde(rename = "C")]
    pub cognitive: CognitiveProfile,
    #[serde(rename = "M")]
    pub motivation: f64,
    #[serde(rename = "H")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub habit: Option<HabitProfile>,
    #[serde(rename = "T")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trend: Option<TrendState>,
    pub conf: f64,
    pub ts: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_fatigue: Option<VisualFatigueState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fused_fatigue: Option<f64>,
}

impl Default for UserState {
    fn default() -> Self {
        Self {
            attention: 0.7,
            fatigue: 0.0,
            cognitive: CognitiveProfile::default(),
            motivation: 0.5,
            habit: None,
            trend: None,
            conf: 0.5,
            ts: chrono::Utc::now().timestamp_millis(),
            visual_fatigue: None,
            fused_fatigue: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColdStartState {
    pub phase: ColdStartPhase,
    pub user_type: Option<UserType>,
    pub probe_index: i32,
    pub update_count: i32,
    pub settled_strategy: Option<StrategyParams>,
    #[serde(default)]
    pub classification_scores: [f64; 3],
}

impl Default for ColdStartState {
    fn default() -> Self {
        Self {
            phase: ColdStartPhase::Classify,
            user_type: None,
            probe_index: 0,
            update_count: 0,
            settled_strategy: None,
            classification_scores: [0.0; 3],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyParams {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: DifficultyLevel,
    pub batch_size: i32,
    pub hint_level: i32,
}

impl Default for StrategyParams {
    fn default() -> Self {
        Self {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Mid,
            batch_size: 8,
            hint_level: 1,
        }
    }
}

impl StrategyParams {
    pub fn for_user_type(user_type: UserType) -> Self {
        match user_type {
            UserType::Fast => Self {
                interval_scale: 0.8,
                new_ratio: 0.3,
                difficulty: DifficultyLevel::Hard,
                batch_size: 12,
                hint_level: 0,
            },
            UserType::Stable => Self::default(),
            UserType::Cautious => Self {
                interval_scale: 1.2,
                new_ratio: 0.1,
                difficulty: DifficultyLevel::Easy,
                batch_size: 5,
                hint_level: 2,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: DifficultyLevel,
    pub batch_size: i32,
    pub hint_level: i32,
}

impl From<StrategyParams> for Action {
    fn from(params: StrategyParams) -> Self {
        Self {
            interval_scale: params.interval_scale,
            new_ratio: params.new_ratio,
            difficulty: params.difficulty,
            batch_size: params.batch_size,
            hint_level: params.hint_level,
        }
    }
}

impl From<Action> for StrategyParams {
    fn from(action: Action) -> Self {
        Self {
            interval_scale: action.interval_scale,
            new_ratio: action.new_ratio,
            difficulty: action.difficulty,
            batch_size: action.batch_size,
            hint_level: action.hint_level,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureVector {
    pub values: Vec<f64>,
    pub labels: Vec<String>,
    pub ts: i64,
}

impl FeatureVector {
    pub fn new(values: Vec<f64>, labels: Vec<String>) -> Self {
        Self {
            values,
            labels,
            ts: chrono::Utc::now().timestamp_millis(),
        }
    }

    pub fn dim(&self) -> usize {
        self.values.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawEvent {
    pub is_correct: bool,
    pub response_time: i64,
    pub dwell_time: Option<i64>,
    pub retry_count: i32,
    pub hint_used: bool,
    pub paused_time_ms: Option<i64>,
    pub word_id: Option<String>,
    pub question_type: Option<String>,
    pub confidence: Option<f64>,
    pub pause_count: i32,
    pub switch_count: i32,
    pub focus_loss_duration: Option<i64>,
    pub interaction_density: Option<f64>,
    pub timestamp: i64,
}

impl Default for RawEvent {
    fn default() -> Self {
        Self {
            is_correct: true,
            response_time: 3000,
            dwell_time: None,
            retry_count: 0,
            hint_used: false,
            paused_time_ms: None,
            word_id: None,
            question_type: None,
            confidence: None,
            pause_count: 0,
            switch_count: 0,
            focus_loss_duration: None,
            interaction_density: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionFactor {
    pub name: String,
    pub value: f64,
    pub impact: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionExplanation {
    pub factors: Vec<DecisionFactor>,
    pub changes: Vec<String>,
    pub text: String,
}

impl Default for DecisionExplanation {
    fn default() -> Self {
        Self {
            factors: vec![],
            changes: vec![],
            text: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reward {
    pub value: f64,
    pub reason: String,
    pub ts: i64,
}

impl Reward {
    pub fn new(value: f64, reason: impl Into<String>) -> Self {
        Self {
            value,
            reason: reason.into(),
            ts: chrono::Utc::now().timestamp_millis(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordMasteryDecision {
    pub word_id: String,
    pub prev_mastery: f64,
    pub new_mastery: f64,
    pub prev_interval: f64,
    pub new_interval: f64,
    pub quality: i32,
    // FSRS fields
    pub stability: f64,
    pub difficulty: f64,
    pub retrievability: f64,
    pub is_mastered: bool,
    pub lapses: i32,
    pub reps: i32,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResult {
    pub state: UserState,
    pub strategy: StrategyParams,
    pub reward: Reward,
    pub explanation: DecisionExplanation,
    pub feature_vector: Option<FeatureVector>,
    pub word_mastery_decision: Option<WordMasteryDecision>,
    pub cold_start_phase: Option<ColdStartPhase>,
    pub objective_evaluation: Option<ObjectiveEvaluation>,
    pub multi_objective_adjusted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiObjectiveMetrics {
    pub short_term_score: f64,
    pub long_term_score: f64,
    pub efficiency_score: f64,
    pub aggregated_score: f64,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintViolation {
    pub constraint: String,
    pub expected: f64,
    pub actual: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectiveEvaluation {
    pub metrics: MultiObjectiveMetrics,
    pub constraints_satisfied: bool,
    pub constraint_violations: Vec<ConstraintViolation>,
    pub suggested_adjustments: Option<StrategyParams>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    pub words_studied: i32,
    pub correct_count: i32,
    pub total_time_ms: i64,
    pub avg_response_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WordReviewHistory {
    pub seconds_ago: i64,
    pub is_correct: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FSRSWordState {
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
    pub reps: i32,
    pub lapses: i32,
    pub desired_retention: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    pub current_params: Option<StrategyParams>,
    pub interaction_count: Option<i32>,
    pub recent_accuracy: Option<f64>,
    pub skip_update: Option<bool>,
    pub answer_record_id: Option<String>,
    pub session_id: Option<String>,
    pub session_stats: Option<SessionStats>,
    pub word_review_history: Option<Vec<WordReviewHistory>>,
    pub visual_fatigue_score: Option<f64>,
    pub study_duration_minutes: Option<f64>,
    pub word_state: Option<FSRSWordState>,
    pub rt_cv: Option<f64>,
    pub pace_cv: Option<f64>,
    pub root_features: Option<RootFeatures>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RootFeatures {
    pub root_count: i32,
    pub known_root_ratio: f64,
    pub avg_root_mastery: f64,
    pub max_root_mastery: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BanditArm {
    pub alpha: f64,
    pub beta: f64,
    pub pulls: i32,
    pub rewards: f64,
}

impl Default for BanditArm {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            beta: 1.0,
            pulls: 0,
            rewards: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanditModel {
    pub thompson_params: Option<serde_json::Value>,
    pub linucb_state: Option<serde_json::Value>,
    pub last_action_idx: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAMASState {
    pub user_id: String,
    pub user_state: UserState,
    pub bandit_model: Option<BanditModel>,
    pub current_strategy: StrategyParams,
    pub cold_start_state: Option<ColdStartState>,
    pub interaction_count: i32,
    pub last_updated: i64,
}
