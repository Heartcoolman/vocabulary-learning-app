use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct FatigueWeights {
    pub perclos: f64,
    pub blink: f64,
    pub yawn: f64,
    pub head_pose: f64,
    pub expression: f64,
}

impl Default for FatigueWeights {
    fn default() -> Self {
        Self {
            perclos: 0.30,
            blink: 0.20,
            yawn: 0.20,
            head_pose: 0.15,
            expression: 0.15,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct FatigueScoreBreakdown {
    pub perclos_score: f64,
    pub blink_score: f64,
    pub yawn_score: f64,
    pub head_pose_score: f64,
    pub expression_score: f64,
    pub total_score: f64,
    pub confidence: f64,
}

#[wasm_bindgen]
pub struct FatigueScoreCalculator {
    weights: FatigueWeights,
    smoothing_factor: f64,
    normal_blink_rate: f64,
    fatigue_blink_rate: f64,
    normal_blink_duration: f64,
    fatigue_blink_duration: f64,
    yawn_fatigue_threshold: f64,
    head_drop_threshold: f64,
    last_score: f64,
    score_history: Vec<f64>,
}

#[wasm_bindgen]
impl FatigueScoreCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            weights: FatigueWeights::default(),
            smoothing_factor: 0.3,
            normal_blink_rate: 15.0,
            fatigue_blink_rate: 25.0,
            normal_blink_duration: 200.0,
            fatigue_blink_duration: 400.0,
            yawn_fatigue_threshold: 3.0,
            head_drop_threshold: 0.3,
            last_score: 0.0,
            score_history: Vec::new(),
        }
    }

    #[wasm_bindgen]
    pub fn set_weights(&mut self, perclos: f64, blink: f64, yawn: f64, head_pose: f64, expression: f64) {
        self.weights = FatigueWeights {
            perclos,
            blink,
            yawn,
            head_pose,
            expression,
        };
    }

    /// Calculate fatigue score from input metrics
    /// input layout: [perclos, blink_rate, avg_blink_duration, yawn_count, head_pitch, head_stability,
    ///                is_head_dropping(0/1), expression_fatigue_score, squint_intensity,
    ///                perclos_valid(0/1), blink_valid(0/1), yawn_valid(0/1), head_pose_valid(0/1), expression_valid(0/1)]
    #[wasm_bindgen]
    pub fn calculate(&mut self, input: &[f64]) -> FatigueScoreBreakdown {
        if input.len() < 14 {
            return self.create_empty_breakdown();
        }

        let perclos = input[0];
        let blink_rate = input[1];
        let avg_blink_duration = input[2];
        let yawn_count = input[3] as u32;
        let head_pitch = input[4];
        let head_stability = input[5];
        let is_head_dropping = input[6] > 0.5;
        let expression_fatigue_score = input[7];
        let squint_intensity = input[8];
        let perclos_valid = input[9] > 0.5;
        let blink_valid = input[10] > 0.5;
        let yawn_valid = input[11] > 0.5;
        let head_pose_valid = input[12] > 0.5;
        let expression_valid = input[13] > 0.5;

        // Calculate individual scores
        let perclos_score = self.calculate_perclos_score(perclos, perclos_valid);
        let blink_score = self.calculate_blink_score(blink_rate, avg_blink_duration, blink_valid);
        let yawn_score = self.calculate_yawn_score(yawn_count, yawn_valid);
        let head_pose_score = self.calculate_head_pose_score(head_pitch, head_stability, is_head_dropping, head_pose_valid);
        let expression_score = self.calculate_expression_score(expression_fatigue_score, squint_intensity, expression_valid);

        // Calculate confidence
        let valid_count = [perclos_valid, blink_valid, yawn_valid, head_pose_valid, expression_valid]
            .iter()
            .filter(|&&v| v)
            .count();
        let confidence = valid_count as f64 / 5.0;

        // Weighted sum with dynamic normalization
        let mut total_score = 0.0;
        let mut total_weight = 0.0;

        if perclos_valid {
            total_score += perclos_score * self.weights.perclos;
            total_weight += self.weights.perclos;
        }
        if blink_valid {
            total_score += blink_score * self.weights.blink;
            total_weight += self.weights.blink;
        }
        if yawn_valid {
            total_score += yawn_score * self.weights.yawn;
            total_weight += self.weights.yawn;
        }
        if head_pose_valid {
            total_score += head_pose_score * self.weights.head_pose;
            total_weight += self.weights.head_pose;
        }
        if expression_valid {
            total_score += expression_score * self.weights.expression;
            total_weight += self.weights.expression;
        }

        // Normalize
        if total_weight > 0.0 {
            total_score /= total_weight;
        }

        // Apply smoothing
        let smoothed_score = self.smooth_score(total_score);

        // Update history
        self.add_to_history(smoothed_score);

        FatigueScoreBreakdown {
            perclos_score,
            blink_score,
            yawn_score,
            head_pose_score,
            expression_score,
            total_score: smoothed_score,
            confidence,
        }
    }

    #[wasm_bindgen]
    pub fn get_fatigue_level(&self, score: f64) -> u8 {
        if score < 0.25 { 0 }      // alert
        else if score < 0.5 { 1 }  // mild
        else if score < 0.75 { 2 } // moderate
        else { 3 }                  // severe
    }

    #[wasm_bindgen]
    pub fn get_fatigue_trend(&self) -> f64 {
        if self.score_history.len() < 10 {
            return 0.0;
        }

        let len = self.score_history.len();
        let recent: f64 = self.score_history[len-10..].iter().sum::<f64>() / 10.0;

        if len < 20 {
            return 0.0;
        }

        let earlier: f64 = self.score_history[len-20..len-10].iter().sum::<f64>() / 10.0;
        recent - earlier
    }

    #[wasm_bindgen]
    pub fn get_current_score(&self) -> f64 {
        self.last_score
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.last_score = 0.0;
        self.score_history.clear();
    }

    fn calculate_perclos_score(&self, perclos: f64, is_valid: bool) -> f64 {
        if !is_valid || perclos < 0.0 {
            return 0.0;
        }

        // PERCLOS 0.00-0.10 → score 0.0-0.2 (alert)
        // PERCLOS 0.10-0.15 → score 0.2-0.5 (mild fatigue)
        // PERCLOS 0.15-0.25 → score 0.5-0.8 (moderate fatigue)
        // PERCLOS 0.25-1.00 → score 0.8-1.0 (severe fatigue)
        if perclos < 0.1 {
            (perclos / 0.1) * 0.2
        } else if perclos < 0.15 {
            0.2 + ((perclos - 0.1) / 0.05) * 0.3
        } else if perclos < 0.25 {
            0.5 + ((perclos - 0.15) / 0.1) * 0.3
        } else {
            (0.8 + ((perclos - 0.25) / 0.75) * 0.2).min(1.0)
        }
    }

    fn calculate_blink_score(&self, blink_rate: f64, avg_duration: f64, is_valid: bool) -> f64 {
        if !is_valid {
            return 0.0;
        }

        // Blink rate score
        let rate_score = if blink_rate <= self.normal_blink_rate {
            0.0
        } else if blink_rate >= self.fatigue_blink_rate {
            1.0
        } else {
            (blink_rate - self.normal_blink_rate) / (self.fatigue_blink_rate - self.normal_blink_rate)
        };

        // Blink duration score
        let duration_score = if avg_duration <= self.normal_blink_duration {
            0.0
        } else if avg_duration >= self.fatigue_blink_duration {
            1.0
        } else {
            (avg_duration - self.normal_blink_duration) / (self.fatigue_blink_duration - self.normal_blink_duration)
        };

        // Combined (rate weighted slightly higher)
        rate_score * 0.6 + duration_score * 0.4
    }

    fn calculate_yawn_score(&self, yawn_count: u32, is_valid: bool) -> f64 {
        if !is_valid {
            return 0.0;
        }

        if yawn_count == 0 {
            0.0
        } else if yawn_count as f64 >= self.yawn_fatigue_threshold {
            1.0
        } else {
            yawn_count as f64 / self.yawn_fatigue_threshold
        }
    }

    fn calculate_head_pose_score(&self, pitch: f64, stability: f64, is_dropping: bool, is_valid: bool) -> f64 {
        if !is_valid {
            return 0.0;
        }

        // Head drop score (pitch > 0 means looking down)
        let mut drop_score = if pitch > 0.0 {
            (pitch / self.head_drop_threshold).min(1.0)
        } else {
            0.0
        };

        // If head dropping detected, give high score
        if is_dropping {
            drop_score = drop_score.max(0.8);
        }

        // Instability score
        let instability_score = 1.0 - stability;

        // Combined (drop weighted higher)
        drop_score * 0.7 + instability_score * 0.3
    }

    fn calculate_expression_score(&self, fatigue_score: f64, squint_intensity: f64, is_valid: bool) -> f64 {
        if !is_valid {
            return 0.0;
        }

        // Squinting is an important fatigue signal
        let squint_score = (squint_intensity * 2.0).min(1.0);

        // Combined
        fatigue_score * 0.6 + squint_score * 0.4
    }

    fn smooth_score(&mut self, score: f64) -> f64 {
        let smoothed = self.smoothing_factor * score + (1.0 - self.smoothing_factor) * self.last_score;
        self.last_score = smoothed;
        smoothed
    }

    fn add_to_history(&mut self, score: f64) {
        self.score_history.push(score);
        if self.score_history.len() > 60 {
            self.score_history.remove(0);
        }
    }

    fn create_empty_breakdown(&self) -> FatigueScoreBreakdown {
        FatigueScoreBreakdown {
            perclos_score: 0.0,
            blink_score: 0.0,
            yawn_score: 0.0,
            head_pose_score: 0.0,
            expression_score: 0.0,
            total_score: 0.0,
            confidence: 0.0,
        }
    }
}

impl Default for FatigueScoreCalculator {
    fn default() -> Self {
        Self::new()
    }
}
