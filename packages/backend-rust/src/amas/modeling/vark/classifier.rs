use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::features::{VarkFeatures, VarkLabels};
use crate::services::user_profile::LearningStyleScores;

const LEARNING_RATE: f64 = 0.005;
const L2_LAMBDA: f64 = 0.001;
const TAU_MS: f64 = 14.0 * 24.0 * 3600.0 * 1000.0;
const COLD_START_THRESHOLD: i64 = 50;
const CALIBRATION_PERIOD: i64 = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryClassifier {
    pub weights: Vec<f64>,
    pub bias: f64,
}

impl BinaryClassifier {
    pub fn new(dim: usize) -> Self {
        Self {
            weights: vec![0.0; dim],
            bias: 0.0,
        }
    }

    fn sigmoid(x: f64) -> f64 {
        1.0 / (1.0 + (-x).exp())
    }

    pub fn predict_proba(&self, features: &[f64]) -> f64 {
        let z: f64 = self
            .weights
            .iter()
            .zip(features.iter())
            .map(|(w, x)| w * x)
            .sum::<f64>()
            + self.bias;
        Self::sigmoid(z)
    }

    pub fn update(
        &mut self,
        features: &[f64],
        label: f64,
        weight: f64,
        learning_rate: f64,
        l2_lambda: f64,
    ) {
        let pred = self.predict_proba(features);
        let error = label - pred;

        for (i, w) in self.weights.iter_mut().enumerate() {
            let grad = weight * error * features[i] - l2_lambda * *w;
            *w += learning_rate * grad;
        }

        self.bias += learning_rate * weight * error;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VarkClassifier {
    pub visual: BinaryClassifier,
    pub auditory: BinaryClassifier,
    pub reading: BinaryClassifier,
    pub kinesthetic: BinaryClassifier,
    pub sample_count: i64,
    pub last_calibration: i64,
}

impl Default for VarkClassifier {
    fn default() -> Self {
        Self::new()
    }
}

impl VarkClassifier {
    pub fn new() -> Self {
        Self {
            visual: BinaryClassifier::new(VarkFeatures::DIM),
            auditory: BinaryClassifier::new(VarkFeatures::DIM),
            reading: BinaryClassifier::new(VarkFeatures::DIM),
            kinesthetic: BinaryClassifier::new(VarkFeatures::DIM),
            sample_count: 0,
            last_calibration: 0,
        }
    }

    pub fn predict(&self, features: &[f64]) -> LearningStyleScores {
        let v = self.visual.predict_proba(features);
        let a = self.auditory.predict_proba(features);
        let r = self.reading.predict_proba(features);
        let k = self.kinesthetic.predict_proba(features);

        let mut scores = LearningStyleScores {
            visual: v,
            auditory: a,
            reading: r,
            kinesthetic: k,
        };
        scores.normalize();
        scores
    }

    pub fn update(&mut self, features: &[f64], timestamp_ms: i64, labels: &VarkLabels) {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
        let age = now_ms - timestamp_ms as f64;
        let weight = (-age / TAU_MS).exp();

        self.visual
            .update(features, labels.visual, weight, LEARNING_RATE, L2_LAMBDA);
        self.auditory
            .update(features, labels.auditory, weight, LEARNING_RATE, L2_LAMBDA);
        self.reading
            .update(features, labels.reading, weight, LEARNING_RATE, L2_LAMBDA);
        self.kinesthetic
            .update(features, labels.kinesthetic, weight, LEARNING_RATE, L2_LAMBDA);

        self.sample_count += 1;
    }

    pub fn is_enabled(&self) -> bool {
        self.sample_count >= COLD_START_THRESHOLD
    }

    pub fn needs_calibration(&self) -> bool {
        self.sample_count - self.last_calibration >= CALIBRATION_PERIOD
    }

    pub fn calibrate(&mut self) {
        self.last_calibration = self.sample_count;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binary_classifier_new() {
        let classifier = BinaryClassifier::new(16);
        assert_eq!(classifier.weights.len(), 16);
        assert_eq!(classifier.bias, 0.0);
    }

    #[test]
    fn test_sigmoid() {
        assert!((BinaryClassifier::sigmoid(0.0) - 0.5).abs() < 1e-10);
        assert!(BinaryClassifier::sigmoid(100.0) > 0.99);
        assert!(BinaryClassifier::sigmoid(-100.0) < 0.01);
    }

    #[test]
    fn test_vark_classifier_new() {
        let classifier = VarkClassifier::new();
        assert_eq!(classifier.sample_count, 0);
        assert!(!classifier.is_enabled());
    }

    #[test]
    fn test_is_enabled_threshold() {
        let mut classifier = VarkClassifier::new();
        classifier.sample_count = 49;
        assert!(!classifier.is_enabled());
        classifier.sample_count = 50;
        assert!(classifier.is_enabled());
    }

    #[test]
    fn test_predict_normalized() {
        let classifier = VarkClassifier::new();
        let features = vec![0.5; VarkFeatures::DIM];
        let scores = classifier.predict(&features);
        let total = scores.visual + scores.auditory + scores.reading + scores.kinesthetic;
        assert!((total - 1.0).abs() < 1e-9);
    }

    // =========================================================================
    // Property-Based Tests (PBT)
    // =========================================================================

    /// PBT-1: Score normalization - any input scores normalize to sum = 1
    #[test]
    fn pbt_1_score_normalization_sum_is_one() {
        let test_cases: Vec<(f64, f64, f64, f64)> = vec![
            (1.0, 1.0, 1.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.5, 0.3, 0.1, 0.1),
            (100.0, 50.0, 25.0, 25.0),
            (0.001, 0.002, 0.003, 0.004),
            (1e-10, 1e-10, 1e-10, 1e-10),
            (1e6, 1e5, 1e4, 1e3),
            (0.9, 0.05, 0.03, 0.02),
            (0.25, 0.25, 0.25, 0.25),
            (0.7, 0.1, 0.1, 0.1),
        ];

        for (v, a, r, k) in test_cases {
            let mut scores = LearningStyleScores {
                visual: v,
                auditory: a,
                reading: r,
                kinesthetic: k,
            };
            scores.normalize();
            let total = scores.visual + scores.auditory + scores.reading + scores.kinesthetic;

            assert!(
                (total - 1.0).abs() < 1e-9,
                "Normalization failed for ({}, {}, {}, {}): sum = {}",
                v, a, r, k, total
            );
            assert!(scores.visual >= 0.0 && scores.visual <= 1.0);
            assert!(scores.auditory >= 0.0 && scores.auditory <= 1.0);
            assert!(scores.reading >= 0.0 && scores.reading <= 1.0);
            assert!(scores.kinesthetic >= 0.0 && scores.kinesthetic <= 1.0);
        }
    }

    /// PBT-1 edge case: all zeros remain unchanged (no division by zero)
    #[test]
    fn pbt_1_score_normalization_all_zeros() {
        let mut scores = LearningStyleScores {
            visual: 0.0,
            auditory: 0.0,
            reading: 0.0,
            kinesthetic: 0.0,
        };
        scores.normalize();
        assert_eq!(scores.visual, 0.0);
        assert_eq!(scores.auditory, 0.0);
        assert_eq!(scores.reading, 0.0);
        assert_eq!(scores.kinesthetic, 0.0);
    }

    /// PBT-2: Variance < 0.01 implies is_multimodal = true
    #[test]
    fn pbt_2_variance_multimodal_consistency() {
        let test_cases: Vec<(f64, f64, f64, f64)> = vec![
            // Uniform scores - should be multimodal
            (0.25, 0.25, 0.25, 0.25),
            (0.24, 0.25, 0.25, 0.26),
            (0.26, 0.24, 0.25, 0.25),
            // Slightly varied - check boundary
            (0.30, 0.25, 0.25, 0.20),
            (0.28, 0.27, 0.23, 0.22),
            // High variance - not multimodal
            (0.70, 0.10, 0.10, 0.10),
            (0.90, 0.05, 0.03, 0.02),
            (0.50, 0.30, 0.15, 0.05),
            (0.40, 0.40, 0.10, 0.10),
            (0.60, 0.20, 0.10, 0.10),
        ];

        for (v, a, r, k) in test_cases {
            let scores = LearningStyleScores {
                visual: v,
                auditory: a,
                reading: r,
                kinesthetic: k,
            };
            let variance = scores.variance();
            let is_multi = scores.is_multimodal();

            if variance < 0.01 {
                assert!(
                    is_multi,
                    "variance {} < 0.01 but is_multimodal is false for ({}, {}, {}, {})",
                    variance, v, a, r, k
                );
            } else {
                assert!(
                    !is_multi,
                    "variance {} >= 0.01 but is_multimodal is true for ({}, {}, {}, {})",
                    variance, v, a, r, k
                );
            }
        }
    }

    /// PBT-3: Time decay monotonicity - older timestamps yield smaller weights
    #[test]
    fn pbt_3_time_decay_monotonicity() {
        fn compute_weight(age_ms: f64) -> f64 {
            (-age_ms / TAU_MS).exp()
        }

        let ages_ms: Vec<f64> = vec![
            0.0,
            1000.0,
            60_000.0,
            3600_000.0,
            86_400_000.0,
            TAU_MS / 2.0,
            TAU_MS,
            TAU_MS * 2.0,
            TAU_MS * 10.0,
        ];

        for i in 0..(ages_ms.len() - 1) {
            let w1 = compute_weight(ages_ms[i]);
            let w2 = compute_weight(ages_ms[i + 1]);
            assert!(
                w1 > w2,
                "Time decay not monotonic: age {} -> weight {}, age {} -> weight {}",
                ages_ms[i], w1, ages_ms[i + 1], w2
            );
        }

        // Edge case: weight at t=0 is 1.0
        assert!((compute_weight(0.0) - 1.0).abs() < 1e-10);

        // Edge case: weight is always in (0, 1]
        for age in &ages_ms {
            let w = compute_weight(*age);
            assert!(w > 0.0 && w <= 1.0, "Weight {} out of bounds for age {}", w, age);
        }
    }

    /// PBT-5: SGD update boundedness - weights remain bounded after updates
    #[test]
    fn pbt_5_sgd_update_bounded() {
        let mut classifier = BinaryClassifier::new(VarkFeatures::DIM);

        // Simulate many updates with various inputs
        let update_cases: Vec<(Vec<f64>, f64, f64)> = vec![
            (vec![0.5; VarkFeatures::DIM], 1.0, 1.0),
            (vec![0.0; VarkFeatures::DIM], 0.0, 1.0),
            (vec![1.0; VarkFeatures::DIM], 1.0, 0.5),
            (vec![0.1; VarkFeatures::DIM], 0.0, 0.8),
            (vec![0.9; VarkFeatures::DIM], 1.0, 0.3),
        ];

        // Run many iterations
        for _ in 0..100 {
            for (features, label, weight) in &update_cases {
                classifier.update(features, *label, *weight, LEARNING_RATE, L2_LAMBDA);

                // Check weights are bounded (L2 regularization should prevent explosion)
                for w in &classifier.weights {
                    assert!(
                        w.abs() < 100.0,
                        "Weight {} exceeds reasonable bound after SGD update",
                        w
                    );
                    assert!(w.is_finite(), "Weight became non-finite");
                }
                assert!(
                    classifier.bias.abs() < 100.0,
                    "Bias {} exceeds reasonable bound",
                    classifier.bias
                );
                assert!(classifier.bias.is_finite(), "Bias became non-finite");
            }
        }

        // Verify prediction still produces valid probability
        let features = vec![0.5; VarkFeatures::DIM];
        let prob = classifier.predict_proba(&features);
        assert!(prob >= 0.0 && prob <= 1.0, "Probability {} out of [0,1]", prob);
    }

    /// PBT-5 edge case: extreme features don't cause overflow
    #[test]
    fn pbt_5_sgd_extreme_features() {
        let mut classifier = BinaryClassifier::new(4);

        let extreme_cases: Vec<Vec<f64>> = vec![
            vec![1e10, 1e10, 1e10, 1e10],
            vec![-1e10, -1e10, -1e10, -1e10],
            vec![1e-10, 1e-10, 1e-10, 1e-10],
            vec![f64::MAX / 1e100, 0.0, 0.0, 0.0],
        ];

        for features in extreme_cases {
            classifier.update(&features, 1.0, 1.0, LEARNING_RATE, L2_LAMBDA);
            for w in &classifier.weights {
                assert!(w.is_finite(), "Weight became non-finite with extreme input");
            }
            assert!(classifier.bias.is_finite(), "Bias became non-finite");
        }
    }

    /// PBT-6: legacy_style always returns one of VAK three dimensions
    #[test]
    fn pbt_6_legacy_style_vak_mapping() {
        let valid_legacy_styles = ["visual", "auditory", "kinesthetic", "mixed"];

        let test_cases: Vec<(f64, f64, f64, f64)> = vec![
            (0.7, 0.1, 0.1, 0.1),   // visual dominant
            (0.1, 0.7, 0.1, 0.1),   // auditory dominant
            (0.1, 0.1, 0.7, 0.1),   // reading dominant -> mixed
            (0.1, 0.1, 0.1, 0.7),   // kinesthetic dominant
            (0.25, 0.25, 0.25, 0.25), // multimodal -> mixed
            (0.4, 0.3, 0.2, 0.1),  // visual
            (0.1, 0.4, 0.3, 0.2),  // auditory
            (0.2, 0.1, 0.4, 0.3),  // reading -> mixed
            (0.3, 0.2, 0.1, 0.4),  // kinesthetic
        ];

        for (v, a, r, k) in test_cases {
            let scores = LearningStyleScores {
                visual: v,
                auditory: a,
                reading: r,
                kinesthetic: k,
            };
            let legacy = scores.legacy_style();

            assert!(
                valid_legacy_styles.contains(&legacy),
                "legacy_style '{}' is not a valid VAK mapping for ({}, {}, {}, {})",
                legacy, v, a, r, k
            );

            // reading or multimodal -> "mixed"
            let dominant = scores.dominant_style();
            if dominant == "reading" || dominant == "multimodal" {
                assert_eq!(
                    legacy, "mixed",
                    "reading/multimodal should map to 'mixed', got '{}'",
                    legacy
                );
            } else {
                assert_eq!(
                    legacy, dominant,
                    "non-reading style '{}' should map to itself, got '{}'",
                    dominant, legacy
                );
            }
        }
    }

    /// PBT-6 edge case: verify all possible dominant_style values map correctly
    #[test]
    fn pbt_6_all_dominant_styles_have_valid_legacy() {
        let styles = ["visual", "auditory", "reading", "kinesthetic", "multimodal"];
        let expected_legacy = ["visual", "auditory", "mixed", "kinesthetic", "mixed"];

        for (style, expected) in styles.iter().zip(expected_legacy.iter()) {
            // Create scores that would produce each dominant style
            let scores = match *style {
                "visual" => LearningStyleScores { visual: 0.7, auditory: 0.1, reading: 0.1, kinesthetic: 0.1 },
                "auditory" => LearningStyleScores { visual: 0.1, auditory: 0.7, reading: 0.1, kinesthetic: 0.1 },
                "reading" => LearningStyleScores { visual: 0.1, auditory: 0.1, reading: 0.7, kinesthetic: 0.1 },
                "kinesthetic" => LearningStyleScores { visual: 0.1, auditory: 0.1, reading: 0.1, kinesthetic: 0.7 },
                "multimodal" => LearningStyleScores { visual: 0.25, auditory: 0.25, reading: 0.25, kinesthetic: 0.25 },
                _ => unreachable!(),
            };

            assert_eq!(
                scores.dominant_style(), *style,
                "Test setup error: expected dominant_style '{}' but got '{}'",
                style, scores.dominant_style()
            );
            assert_eq!(
                scores.legacy_style(), *expected,
                "legacy_style for '{}' should be '{}', got '{}'",
                style, expected, scores.legacy_style()
            );
        }
    }
}
