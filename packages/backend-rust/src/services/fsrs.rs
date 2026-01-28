use serde::{Deserialize, Serialize};

const DECAY: f64 = -0.5;
const FACTOR: f64 = 19.0 / 81.0;

const SHORT_TERM_WINDOW_MINUTES: f64 = 30.0;
const SHORT_TERM_TAU_MINUTES: f64 = 10.0;
const SHORT_TERM_WEIGHT: f64 = 0.15;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FSRSParams {
    pub w: [f64; 17],
}

impl Default for FSRSParams {
    fn default() -> Self {
        Self {
            w: [
                0.4, 0.6, 2.4, 5.8, // w0-w3: initial stability
                4.93, 0.94, 0.86, 0.01, 1.49, // w4-w8
                0.14, 0.94, 2.18, 0.05, 0.34, // w9-w13
                1.26, 0.29, 2.61, // w14-w16
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserFSRSParams {
    pub base: FSRSParams,
    pub adjustments: [f64; 17],
    pub sample_count: i64,
    pub last_updated: i64,
    #[serde(default)]
    pub bayesian: Option<BayesianFSRSParams>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BayesianFSRSParams {
    pub log_w_mean: [f64; 17],
    pub log_w_precision: [f64; 17],
    pub samples: Vec<RetentionSample>,
    pub population_mean: [f64; 17],
    pub population_var: [f64; 17],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionSample {
    pub stability: f64,
    pub elapsed_days: f64,
    pub actual_recalled: bool,
}

impl Default for BayesianFSRSParams {
    fn default() -> Self {
        let base = FSRSParams::default();
        let log_w_mean: [f64; 17] = std::array::from_fn(|i| base.w[i].ln());
        let log_w_precision = [1.0; 17];
        let population_var = [0.25; 17];
        Self {
            log_w_mean,
            log_w_precision,
            samples: Vec::new(),
            population_mean: log_w_mean,
            population_var,
        }
    }
}

impl BayesianFSRSParams {
    pub fn add_sample(&mut self, sample: RetentionSample) {
        self.samples.push(sample);
        if self.samples.len() > 500 {
            self.samples.drain(0..100);
        }
    }

    pub fn optimize(&mut self, learning_rate: f64) {
        if self.samples.len() < 20 {
            return;
        }

        let lr = learning_rate.clamp(0.001, 0.05);
        for sample in &self.samples {
            let predicted = self.predict_recall(sample.stability, sample.elapsed_days);
            let actual = if sample.actual_recalled { 1.0 } else { 0.0 };
            let error = actual - predicted;

            for i in 0..17 {
                let grad = error * 0.1;
                let prior_term =
                    (self.log_w_mean[i] - self.population_mean[i]) / self.population_var[i];
                let full_grad = grad - 0.01 * prior_term;

                self.log_w_precision[i] += full_grad * full_grad;
                let step = lr * full_grad / (self.log_w_precision[i].sqrt() + 1e-8);
                self.log_w_mean[i] += step;
            }
        }
        self.samples.clear();
    }

    pub fn predict_recall(&self, stability: f64, elapsed_days: f64) -> f64 {
        if stability <= 0.0 {
            return 0.0;
        }
        (1.0 + FACTOR * elapsed_days / stability).powf(DECAY)
    }

    pub fn effective_params(&self) -> FSRSParams {
        let w: [f64; 17] = std::array::from_fn(|i| self.log_w_mean[i].exp().clamp(0.01, 100.0));
        FSRSParams { w }
    }
}

impl Default for UserFSRSParams {
    fn default() -> Self {
        Self {
            base: FSRSParams::default(),
            adjustments: [1.0; 17],
            sample_count: 0,
            last_updated: 0,
            bayesian: None,
        }
    }
}

impl UserFSRSParams {
    pub fn effective_params(&self) -> FSRSParams {
        let mut w = self.base.w;
        for (i, w_val) in w.iter_mut().enumerate().take(17) {
            *w_val *= self.adjustments[i];
        }
        FSRSParams { w }
    }

    pub fn update_from_retention(&mut self, predicted: f64, actual: f64, learning_rate: f64) {
        let error = actual - predicted;
        let lr = learning_rate.clamp(0.01, 0.2);
        for i in 4..9 {
            self.adjustments[i] *= 1.0 + error * lr;
            self.adjustments[i] = self.adjustments[i].clamp(0.5, 2.0);
        }
        self.sample_count += 1;
        self.last_updated = chrono::Utc::now().timestamp_millis();
    }

    pub fn reset(&mut self) {
        self.adjustments = [1.0; 17];
        self.sample_count = 0;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

impl Rating {
    pub fn from_correct(is_correct: bool, response_time_ms: i64) -> Self {
        if !is_correct {
            return Self::Again;
        }
        if response_time_ms < 2000 {
            Self::Easy
        } else if response_time_ms < 5000 {
            Self::Good
        } else {
            Self::Hard
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FSRSState {
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: f64,
    pub scheduled_days: f64,
    pub reps: i32,
    pub lapses: i32,
}

impl Default for FSRSState {
    fn default() -> Self {
        Self {
            stability: 1.0,
            difficulty: 0.3,
            elapsed_days: 0.0,
            scheduled_days: 0.0,
            reps: 0,
            lapses: 0,
        }
    }
}

impl FSRSState {
    pub fn is_new(&self) -> bool {
        self.reps == 0
    }
}

#[derive(Debug, Clone)]
pub struct FSRSResult {
    pub state: FSRSState,
    pub interval_days: f64,
    pub retrievability: f64,
}

pub fn fsrs_retrievability(stability: f64, elapsed_days: f64) -> f64 {
    fsrs5_retrievability(stability, elapsed_days, None, 0)
}

pub fn fsrs5_retrievability(
    stability: f64,
    elapsed_days: f64,
    last_review_ts: Option<i64>,
    current_ts: i64,
) -> f64 {
    if stability <= 0.0 {
        return 0.0;
    }
    let safe_elapsed = elapsed_days.max(0.0);
    let long_term = (1.0 + FACTOR * safe_elapsed / stability).powf(DECAY);

    if let Some(last_ts) = last_review_ts {
        if current_ts > last_ts {
            let elapsed_minutes = (current_ts - last_ts) as f64 / 60_000.0;
            if elapsed_minutes < SHORT_TERM_WINDOW_MINUTES {
                let short_term_decay = (-elapsed_minutes / SHORT_TERM_TAU_MINUTES).exp();
                let short_term_boost = SHORT_TERM_WEIGHT * short_term_decay;
                return (long_term + short_term_boost).min(1.0);
            }
        }
    }
    long_term
}

pub fn fsrs_next_interval(
    state: &FSRSState,
    rating: Rating,
    desired_retention: f64,
    params: &FSRSParams,
) -> FSRSResult {
    let w = &params.w;
    let rating_val = rating as i32;

    if state.is_new() {
        let init_stability = initial_stability(w, rating_val);
        let init_difficulty = initial_difficulty(w, rating_val);
        let interval = next_interval(init_stability, desired_retention);

        return FSRSResult {
            state: FSRSState {
                stability: init_stability,
                difficulty: init_difficulty,
                elapsed_days: 0.0,
                scheduled_days: interval,
                reps: 1,
                lapses: if rating == Rating::Again { 1 } else { 0 },
            },
            interval_days: interval,
            retrievability: 1.0,
        };
    }

    let retrievability = fsrs_retrievability(state.stability, state.elapsed_days);
    let new_difficulty = next_difficulty(w, state.difficulty, rating_val);

    let (new_stability, new_lapses) = if rating == Rating::Again {
        let s = next_forget_stability(w, state.difficulty, state.stability, retrievability);
        (s, state.lapses + 1)
    } else {
        let s = next_recall_stability(
            w,
            state.difficulty,
            state.stability,
            retrievability,
            rating_val,
        );
        (s, state.lapses)
    };

    let interval = next_interval(new_stability, desired_retention);

    FSRSResult {
        state: FSRSState {
            stability: new_stability,
            difficulty: new_difficulty,
            elapsed_days: 0.0,
            scheduled_days: interval,
            reps: state.reps + 1,
            lapses: new_lapses,
        },
        interval_days: interval,
        retrievability: 1.0, // Post-review: just reviewed, perfect recall
    }
}

fn initial_stability(w: &[f64; 17], rating: i32) -> f64 {
    w[(rating - 1) as usize].max(0.1)
}

fn initial_difficulty(w: &[f64; 17], rating: i32) -> f64 {
    let d = w[4] - (rating - 3) as f64 * w[5];
    d.clamp(1.0, 10.0) / 10.0
}

fn next_difficulty(w: &[f64; 17], d: f64, rating: i32) -> f64 {
    let d_10 = d * 10.0;
    let delta = -(rating - 3) as f64;
    let d_new = d_10 + w[6] * delta;
    let d_mean = w[7] * (w[4] - 3.0 * w[5]) + (1.0 - w[7]) * d_new;
    (d_mean.clamp(1.0, 10.0)) / 10.0
}

fn next_recall_stability(w: &[f64; 17], d: f64, s: f64, r: f64, rating: i32) -> f64 {
    let d_10 = d * 10.0;
    let hard_penalty = if rating == 2 { w[15] } else { 1.0 };
    let easy_bonus = if rating == 4 { w[16] } else { 1.0 };

    let new_s = s
        * (1.0
            + w[8].exp()
                * (11.0 - d_10)
                * s.powf(-w[9])
                * ((1.0 - r) * w[10]).exp_m1()
                * hard_penalty
                * easy_bonus);
    new_s.max(0.1)
}

fn next_forget_stability(w: &[f64; 17], d: f64, s: f64, r: f64) -> f64 {
    let d_10 = d * 10.0;
    let new_s =
        w[11] * d_10.powf(-w[12]) * ((s + 1.0).powf(w[13]) - 1.0) * (1.0 - r).powf(w[14]).exp();
    new_s.clamp(0.1, s)
}

fn next_interval(stability: f64, desired_retention: f64) -> f64 {
    let safe_retention = desired_retention.clamp(0.0001, 0.9999);
    let interval = stability / FACTOR * (safe_retention.powf(1.0 / DECAY) - 1.0);
    interval.clamp(1.0, 36500.0)
}

pub fn fsrs_next_interval_with_root(
    state: &FSRSState,
    rating: Rating,
    desired_retention: f64,
    params: &FSRSParams,
    root_bonus: f64,
) -> FSRSResult {
    let bonus = root_bonus.clamp(0.0, 1.0);
    let adjusted_retention = (desired_retention + bonus * 0.03).min(0.97);
    let mut result = fsrs_next_interval(state, rating, adjusted_retention, params);
    result.state.difficulty = (result.state.difficulty * (1.0 - 0.1 * bonus)).clamp(0.05, 1.0);
    if state.is_new() {
        result.state.stability *= 1.0 + bonus * 0.15;
    }
    result
}

/// Long-term mastery for spaced repetition scheduling
/// Relaxed condition: allows up to 2 lapses
pub fn is_mastered(state: &FSRSState) -> bool {
    state.stability >= 21.0 && state.lapses <= 2
}

/// Strict mastery (no lapses allowed) - for reference
pub fn is_strictly_mastered(state: &FSRSState) -> bool {
    state.stability >= 21.0 && state.lapses == 0
}

/// Compute mastery score based on FSRS state and rating
/// Returns (score, confidence) where score is 0-100
pub fn compute_fsrs_mastery_score(state: &FSRSState, rating: Rating) -> (f64, f64) {
    let mut score = 0.0;

    // 1. Stability score (0-40 points)
    let stability_score = (state.stability / 10.0).min(1.0) * 20.0;
    let lapse_penalty = (1.0 / (1.0 + state.lapses as f64 * 0.3)) * 20.0;
    score += stability_score + lapse_penalty;

    // 2. Rating score (0-30 points)
    let rating_score = match rating {
        Rating::Easy => 30.0,
        Rating::Good => 20.0,
        Rating::Hard => 10.0,
        Rating::Again => 0.0,
    };
    score += rating_score;

    // Base confidence from FSRS factors
    let confidence = (score / 70.0).clamp(0.0, 1.0);
    (score, confidence)
}

pub fn mastery_confidence(state: &FSRSState, elapsed_days: f64) -> f64 {
    let r = fsrs_retrievability(state.stability, elapsed_days);
    let stability_factor = (state.stability / 30.0).min(1.0);
    let lapse_penalty = 1.0 / (1.0 + state.lapses as f64 * 0.2);
    r * stability_factor * lapse_penalty
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_word_good_rating() {
        let state = FSRSState::default();
        let params = FSRSParams::default();
        let result = fsrs_next_interval(&state, Rating::Good, 0.9, &params);
        assert!(result.interval_days >= 1.0);
        assert!(result.state.stability > 1.0);
    }

    #[test]
    fn test_retrievability_decay() {
        let r_0 = fsrs_retrievability(10.0, 0.0);
        let r_5 = fsrs_retrievability(10.0, 5.0);
        let r_10 = fsrs_retrievability(10.0, 10.0);
        assert!(r_0 > r_5);
        assert!(r_5 > r_10);
        assert!((r_0 - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_mastery() {
        let mastered = FSRSState {
            stability: 30.0,
            difficulty: 0.3,
            reps: 10,
            lapses: 0,
            ..Default::default()
        };
        assert!(is_mastered(&mastered));

        let not_mastered = FSRSState {
            stability: 10.0,
            difficulty: 0.3,
            reps: 5,
            lapses: 1,
            ..Default::default()
        };
        assert!(!is_mastered(&not_mastered));
    }
}
