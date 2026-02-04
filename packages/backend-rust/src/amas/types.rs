#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum DifficultyLevel {
    Easy,
    #[default]
    Mid,
    Hard,
}

impl DifficultyLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Mid => "mid",
            Self::Hard => "hard",
        }
    }

    pub fn harder(&self) -> Self {
        match self {
            Self::Easy => Self::Mid,
            _ => Self::Hard,
        }
    }

    pub fn easier(&self) -> Self {
        match self {
            Self::Hard => Self::Mid,
            _ => Self::Easy,
        }
    }

    pub fn parse(s: &str) -> Self {
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
#[derive(Default)]
pub enum TrendState {
    Up,
    #[default]
    Flat,
    Stuck,
    Down,
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

    pub fn parse(s: &str) -> Self {
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
#[derive(Default)]
pub enum UserType {
    Fast,
    #[default]
    Stable,
    Cautious,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum ColdStartPhase {
    #[default]
    Classify,
    Explore,
    Normal,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisualFatigueRawMetrics {
    pub perclos: f64,
    pub blink_rate: f64,
    pub eye_aspect_ratio: f64,
    pub squint_intensity: f64,
    pub gaze_off_screen_ratio: f64,
    pub avg_blink_duration: f64,
    pub head_stability: f64,
    pub yawn_count: i32,
    pub confidence: f64,
    pub timestamp_ms: i64,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reward_profile: Option<String>,
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
            reward_profile: None,
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
    #[serde(default)]
    pub continuous_profile: Option<ContinuousUserProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuousUserProfile {
    pub speed: f64,
    pub stability: f64,
    pub risk_tolerance: f64,
    pub engagement: f64,
    pub confidence: [f64; 4],
}

impl Default for ContinuousUserProfile {
    fn default() -> Self {
        Self {
            speed: 0.5,
            stability: 0.5,
            risk_tolerance: 0.5,
            engagement: 0.5,
            confidence: [0.0; 4],
        }
    }
}

impl ContinuousUserProfile {
    pub fn from_user_type(user_type: UserType) -> Self {
        match user_type {
            UserType::Fast => Self {
                speed: 0.8,
                stability: 0.4,
                risk_tolerance: 0.7,
                engagement: 0.6,
                confidence: [0.3; 4],
            },
            UserType::Stable => Self {
                speed: 0.5,
                stability: 0.6,
                risk_tolerance: 0.5,
                engagement: 0.5,
                confidence: [0.3; 4],
            },
            UserType::Cautious => Self {
                speed: 0.3,
                stability: 0.7,
                risk_tolerance: 0.3,
                engagement: 0.4,
                confidence: [0.3; 4],
            },
        }
    }

    pub fn update(
        &mut self,
        accuracy: f64,
        response_time_ms: i64,
        attention: f64,
        motivation: f64,
    ) {
        let alpha = 0.1;
        let speed_signal = (1.0 - (response_time_ms as f64 / 10000.0).min(1.0)).clamp(0.0, 1.0);
        let stability_signal = accuracy.clamp(0.0, 1.0);
        let risk_signal = ((1.0 - accuracy * 0.3) * speed_signal).clamp(0.0, 1.0);
        let engagement_signal =
            ((attention.clamp(0.0, 1.0) + (motivation.clamp(-1.0, 1.0) + 1.0) / 2.0) / 2.0)
                .clamp(0.0, 1.0);

        self.speed = (self.speed * (1.0 - alpha) + speed_signal * alpha).clamp(0.0, 1.0);
        self.stability =
            (self.stability * (1.0 - alpha) + stability_signal * alpha).clamp(0.0, 1.0);
        self.risk_tolerance =
            (self.risk_tolerance * (1.0 - alpha) + risk_signal * alpha).clamp(0.0, 1.0);
        self.engagement =
            (self.engagement * (1.0 - alpha) + engagement_signal * alpha).clamp(0.0, 1.0);

        for c in &mut self.confidence {
            *c = (*c + 0.02).min(1.0);
        }
    }

    pub fn min_confidence(&self) -> f64 {
        self.confidence
            .iter()
            .cloned()
            .fold(f64::INFINITY, f64::min)
    }

    pub fn to_strategy(&self) -> StrategyParams {
        let interval_scale = 0.8 + 0.4 * self.stability;
        let new_ratio = (0.1 + 0.2 * self.speed * self.engagement).clamp(0.1, 0.4);
        let batch_size = (5.0 + 10.0 * self.engagement).round() as i32;
        let hint_level = if self.risk_tolerance > 0.7 {
            0
        } else if self.risk_tolerance > 0.4 {
            1
        } else {
            2
        };
        let difficulty = if self.risk_tolerance > 0.6 {
            DifficultyLevel::Hard
        } else if self.risk_tolerance > 0.35 {
            DifficultyLevel::Mid
        } else {
            DifficultyLevel::Easy
        };

        StrategyParams {
            interval_scale,
            new_ratio,
            difficulty,
            batch_size: batch_size.clamp(5, 16),
            hint_level,
            swd_recommendation: None,
        }
    }
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
            continuous_profile: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwdRecommendation {
    pub recommended_count: i32,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyParams {
    pub interval_scale: f64,
    pub new_ratio: f64,
    pub difficulty: DifficultyLevel,
    pub batch_size: i32,
    pub hint_level: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swd_recommendation: Option<SwdRecommendation>,
}

impl Default for StrategyParams {
    fn default() -> Self {
        Self {
            interval_scale: 1.0,
            new_ratio: 0.2,
            difficulty: DifficultyLevel::Mid,
            batch_size: 8,
            hint_level: 1,
            swd_recommendation: None,
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
                swd_recommendation: None,
            },
            UserType::Stable => Self::default(),
            UserType::Cautious => Self {
                interval_scale: 1.2,
                new_ratio: 0.1,
                difficulty: DifficultyLevel::Easy,
                batch_size: 5,
                hint_level: 2,
                swd_recommendation: None,
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
            swd_recommendation: None,
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
    #[serde(default)]
    pub is_quit: bool,
    #[serde(default)]
    pub device_type: Option<String>,
    #[serde(default)]
    pub is_guess: bool,
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
            is_quit: false,
            device_type: None,
            is_guess: false,
        }
    }
}

// ============================================
// 微观行为数据类型
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub t: i64,
    pub epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoverEvent {
    pub option_id: String,
    pub enter_time: i64,
    pub leave_time: i64,
    pub enter_epoch_ms: i64,
    pub leave_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokeEvent {
    pub key: String,
    pub down_time: i64,
    pub up_time: Option<i64>,
    pub down_epoch_ms: i64,
    pub up_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MicroInteractions {
    pub pointer_type: Option<String>,
    pub trajectory_points: Option<Vec<TrajectoryPoint>>,
    pub hover_events: Option<Vec<HoverEvent>>,
    pub tentative_selections: Option<Vec<String>>,
    pub keystroke_events: Option<Vec<KeystrokeEvent>>,
    pub reaction_latency_ms: Option<i64>,
    pub trajectory_length: Option<f64>,
    pub direct_distance: Option<f64>,
    pub option_switch_count: Option<i32>,
    pub question_render_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnergyLevel {
    High,
    Normal,
    Low,
}

impl EnergyLevel {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "high" => Some(Self::High),
            "normal" => Some(Self::Normal),
            "low" => Some(Self::Low),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Normal => "normal",
            Self::Low => "low",
        }
    }

    pub fn fatigue_calibration_factor(&self) -> f64 {
        match self {
            Self::High => 0.6,
            Self::Normal => 1.0,
            Self::Low => 1.4,
        }
    }

    pub fn difficulty_ceiling(&self) -> Option<DifficultyLevel> {
        match self {
            Self::High | Self::Normal => None,
            Self::Low => Some(DifficultyLevel::Easy),
        }
    }

    pub fn new_ratio_ceiling(&self) -> f64 {
        match self {
            Self::High => 0.4,
            Self::Normal => 0.3,
            Self::Low => 0.0,
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
#[derive(Default)]
pub struct DecisionExplanation {
    pub factors: Vec<DecisionFactor>,
    pub changes: Vec<String>,
    pub text: String,
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
    // MDM memory fields (optional, populated when amas_mdm_enabled)
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummStrength")]
    pub amas_strength: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummConsolidation")]
    pub amas_consolidation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummLastReviewTs")]
    pub amas_last_review_ts: Option<i64>,
    // Adaptive mastery fields for history tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mastery_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mastery_threshold: Option<f64>,
    // AIR IRT fields (optional, populated when use_air enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_theta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_alpha: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_beta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_probability: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmWeights {
    pub ige: f64,
    pub swd: f64,
    pub mdm: f64,
    pub heuristic: f64,
    pub coldstart: f64,
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
    pub algorithm_weights: Option<AlgorithmWeights>,
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
    // MDM memory fields (optional)
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummStrength")]
    pub amas_strength: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummConsolidation")]
    pub amas_consolidation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "ummLastReviewTs")]
    pub amas_last_review_ts: Option<i64>,
    // AIR IRT fields (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_alpha: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_beta: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MorphemeStateInput {
    pub morpheme_id: String,
    pub mastery_level: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfusionPairInput {
    pub confusing_word_id: String,
    pub distance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntryInput {
    pub hour_of_day: u8,
    pub day_of_week: u8,
    pub question_type: String,
    pub device_type: String,
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
    pub visual_fatigue_confidence: Option<f64>,
    pub visual_fatigue_raw: Option<VisualFatigueRawMetrics>,
    pub study_duration_minutes: Option<f64>,
    pub word_state: Option<FSRSWordState>,
    pub rt_cv: Option<f64>,
    pub pace_cv: Option<f64>,
    pub root_features: Option<RootFeatures>,
    pub total_sessions: Option<u32>,
    // UMM vocabulary specialization inputs
    #[serde(default)]
    pub morpheme_states: Option<Vec<MorphemeStateInput>>,
    #[serde(default)]
    pub confusion_pairs: Option<Vec<ConfusionPairInput>>,
    #[serde(default)]
    pub recent_word_ids: Option<Vec<String>>,
    #[serde(default)]
    pub context_history: Option<Vec<ContextEntryInput>>,
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
    #[serde(default)]
    pub mastery_history: Option<crate::amas::memory::MasteryHistory>,
    #[serde(default)]
    pub ensemble_performance: Option<crate::amas::decision::ensemble::PerformanceTracker>,
    #[serde(default)]
    pub algorithm_states: Option<serde_json::Value>,
}
