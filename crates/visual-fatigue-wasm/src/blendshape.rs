use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Default)]
struct ExpressionFeatures {
    blink_intensity: f64,
    squint_intensity: f64,
    brow_down_intensity: f64,
    jaw_open_intensity: f64,
    fatigue_expression_intensity: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct BlendshapeAnalysis {
    pub eye_blink: f64,
    pub eye_squint: f64,
    pub brow_down: f64,
    pub jaw_open: f64,
    pub fatigue_score: f64,
    pub confidence: f64,
    pub is_valid: bool,
}

#[wasm_bindgen]
pub struct BlendshapeAnalyzer {
    smoothing_factor: f64,
    squint_threshold: f64,
    history_size: usize,
    last_features: ExpressionFeatures,
    squint_history: VecDeque<f64>,
    brow_down_history: VecDeque<f64>,
}

#[wasm_bindgen]
impl BlendshapeAnalyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(smoothing_factor: Option<f64>, squint_threshold: Option<f64>, history_size: Option<u32>) -> Self {
        Self {
            smoothing_factor: smoothing_factor.unwrap_or(0.3),
            squint_threshold: squint_threshold.unwrap_or(0.3),
            history_size: history_size.unwrap_or(30) as usize,
            last_features: ExpressionFeatures::default(),
            squint_history: VecDeque::new(),
            brow_down_history: VecDeque::new(),
        }
    }

    /// Analyze blendshape scores
    /// scores layout: [eyeSquintL, eyeSquintR, browDownL, browDownR, eyeBlinkL, eyeBlinkR, jawOpen, browInnerUp]
    #[wasm_bindgen]
    pub fn analyze(&mut self, scores: &[f64]) -> BlendshapeAnalysis {
        if scores.len() < 8 {
            return self.create_invalid_result();
        }

        let eye_squint_l = scores[0];
        let eye_squint_r = scores[1];
        let brow_down_l = scores[2];
        let brow_down_r = scores[3];
        let eye_blink_l = scores[4];
        let eye_blink_r = scores[5];
        let jaw_open = scores[6];
        let brow_inner_up = scores[7];

        // Extract features
        let blink_intensity = (eye_blink_l + eye_blink_r) / 2.0;
        let squint_intensity = (eye_squint_l + eye_squint_r) / 2.0;
        let brow_down_intensity = (brow_down_l + brow_down_r) / 2.0 + brow_inner_up * 0.5;
        let jaw_open_intensity = jaw_open;

        // Calculate fatigue expression intensity (weighted combination)
        let fatigue_expression_intensity =
            squint_intensity * 0.35 +
            brow_down_intensity * 0.25 +
            blink_intensity * 0.2 +
            jaw_open_intensity * 0.2;

        let raw_features = ExpressionFeatures {
            blink_intensity,
            squint_intensity,
            brow_down_intensity,
            jaw_open_intensity,
            fatigue_expression_intensity,
        };

        // Apply smoothing
        let smoothed = self.smooth_features(raw_features);

        // Update history
        self.add_to_history(smoothed);

        // Calculate fatigue score with history
        let fatigue_score = self.calculate_fatigue_score(smoothed);

        BlendshapeAnalysis {
            eye_blink: smoothed.blink_intensity * 2.0 - 1.0, // Convert to [-1, 1]
            eye_squint: smoothed.squint_intensity,
            brow_down: smoothed.brow_down_intensity,
            jaw_open: smoothed.jaw_open_intensity,
            fatigue_score,
            confidence: 1.0,
            is_valid: true,
        }
    }

    /// Analyze from full blendshape array (MediaPipe format via JsValue)
    #[wasm_bindgen]
    pub fn analyze_from_blendshapes(&mut self, blendshapes_js: JsValue) -> BlendshapeAnalysis {
        #[derive(serde::Deserialize)]
        struct BlendshapeData {
            #[serde(rename = "categoryName")]
            category_name: String,
            score: f64,
        }

        let blendshapes: Vec<BlendshapeData> = match serde_wasm_bindgen::from_value(blendshapes_js) {
            Ok(bs) => bs,
            Err(_) => return self.create_invalid_result(),
        };

        let get_score = |name: &str| -> f64 {
            blendshapes.iter()
                .find(|bs| bs.category_name == name)
                .map(|bs| bs.score)
                .unwrap_or(0.0)
        };

        let scores = [
            get_score("eyeSquintLeft"),
            get_score("eyeSquintRight"),
            get_score("browDownLeft"),
            get_score("browDownRight"),
            get_score("eyeBlinkLeft"),
            get_score("eyeBlinkRight"),
            get_score("jawOpen"),
            get_score("browInnerUp"),
        ];

        self.analyze(&scores)
    }

    #[wasm_bindgen]
    pub fn is_squinting(&self) -> bool {
        self.last_features.squint_intensity > self.squint_threshold
    }

    #[wasm_bindgen]
    pub fn get_squint_intensity(&self) -> f64 {
        self.last_features.squint_intensity
    }

    #[wasm_bindgen]
    pub fn get_fatigue_expression(&self) -> f64 {
        self.last_features.fatigue_expression_intensity
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.last_features = ExpressionFeatures::default();
        self.squint_history.clear();
        self.brow_down_history.clear();
    }

    fn smooth_features(&mut self, raw: ExpressionFeatures) -> ExpressionFeatures {
        let alpha = self.smoothing_factor;
        let smoothed = ExpressionFeatures {
            blink_intensity: alpha * raw.blink_intensity + (1.0 - alpha) * self.last_features.blink_intensity,
            squint_intensity: alpha * raw.squint_intensity + (1.0 - alpha) * self.last_features.squint_intensity,
            brow_down_intensity: alpha * raw.brow_down_intensity + (1.0 - alpha) * self.last_features.brow_down_intensity,
            jaw_open_intensity: alpha * raw.jaw_open_intensity + (1.0 - alpha) * self.last_features.jaw_open_intensity,
            fatigue_expression_intensity: alpha * raw.fatigue_expression_intensity + (1.0 - alpha) * self.last_features.fatigue_expression_intensity,
        };
        self.last_features = smoothed;
        smoothed
    }

    fn add_to_history(&mut self, features: ExpressionFeatures) {
        self.squint_history.push_back(features.squint_intensity);
        self.brow_down_history.push_back(features.brow_down_intensity);

        while self.squint_history.len() > self.history_size {
            self.squint_history.pop_front();
        }
        while self.brow_down_history.len() > self.history_size {
            self.brow_down_history.pop_front();
        }
    }

    fn calculate_fatigue_score(&self, features: ExpressionFeatures) -> f64 {
        if self.squint_history.len() < 5 {
            return features.fatigue_expression_intensity;
        }

        // Calculate recent averages
        let recent_count = 10.min(self.squint_history.len());
        let avg_squint: f64 = self.squint_history.iter().rev().take(recent_count).sum::<f64>() / recent_count as f64;
        let avg_brow_down: f64 = self.brow_down_history.iter().rev().take(recent_count).sum::<f64>() / recent_count as f64;

        // Persistent squint and brow down are important fatigue indicators
        let persistent_squint = if avg_squint > self.squint_threshold {
            1.0
        } else {
            avg_squint / self.squint_threshold
        };

        let persistent_brow_down = if avg_brow_down > 0.3 {
            1.0
        } else {
            avg_brow_down / 0.3
        };

        // Combine current and historical
        features.fatigue_expression_intensity * 0.6 +
            persistent_squint * 0.25 +
            persistent_brow_down * 0.15
    }

    fn create_invalid_result(&self) -> BlendshapeAnalysis {
        BlendshapeAnalysis {
            eye_blink: 0.0,
            eye_squint: 0.0,
            brow_down: 0.0,
            jaw_open: 0.0,
            fatigue_score: 0.0,
            confidence: 0.0,
            is_valid: false,
        }
    }
}
