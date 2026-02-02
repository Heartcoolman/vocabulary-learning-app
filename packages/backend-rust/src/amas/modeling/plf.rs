use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlForgettingConfig {
    pub alpha: f64,
    pub s_base_ms: f64,
    pub d_base: f64,
}

impl Default for PlForgettingConfig {
    fn default() -> Self {
        Self {
            alpha: 0.2,
            s_base_ms: 86_400_000.0,
            d_base: 0.5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlForgettingInput {
    pub elapsed_ms: f64,
    pub review_count: u32,
    pub stability_days: Option<f64>,
    pub difficulty: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlForgettingOutput {
    pub retrievability: f64,
    pub log_inputs: PlForgettingLogInputs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlForgettingLogInputs {
    pub t: f64,
    pub n: u32,
    pub s: f64,
    pub d: f64,
    pub f_n: f64,
}

#[derive(Debug, Clone)]
pub struct PlForgettingCurve {
    config: PlForgettingConfig,
}

impl Default for PlForgettingCurve {
    fn default() -> Self {
        Self::new(PlForgettingConfig::default())
    }
}

impl PlForgettingCurve {
    pub fn new(config: PlForgettingConfig) -> Self {
        Self { config }
    }

    fn compute_f_n(&self, n: u32) -> f64 {
        1.0 + self.config.alpha * (1.0 + n as f64).ln()
    }

    fn compute_decay_rate(&self, difficulty: Option<f64>) -> f64 {
        let d = difficulty.unwrap_or(5.0).clamp(1.0, 10.0);
        self.config.d_base * (1.0 + 0.1 * (d - 5.0))
    }

    pub fn predict(&self, input: &PlForgettingInput) -> PlForgettingOutput {
        let t = input.elapsed_ms.max(0.0);
        let n = input.review_count;
        let s = input
            .stability_days
            .filter(|&v| v > 0.0)
            .map(|days| days * 86_400_000.0)
            .unwrap_or(self.config.s_base_ms);
        let d = self.compute_decay_rate(input.difficulty);
        let f_n = self.compute_f_n(n);

        let ratio = (t / (s * f_n)).clamp(0.0, 1e12);
        let r = (-(d * (1.0 + ratio).ln())).exp().clamp(0.0, 1.0);

        PlForgettingOutput {
            retrievability: r,
            log_inputs: PlForgettingLogInputs { t, n, s, d, f_n },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_curve() -> PlForgettingCurve {
        PlForgettingCurve::default()
    }

    #[test]
    fn test_initial_retrievability_is_one() {
        let curve = default_curve();
        let out = curve.predict(&PlForgettingInput {
            elapsed_ms: 0.0,
            review_count: 0,
            stability_days: Some(1.0),
            difficulty: Some(5.0),
        });
        assert!((out.retrievability - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_retrievability_decreases_over_time() {
        let curve = default_curve();
        let r1 = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 3600_000.0,
                review_count: 0,
                stability_days: Some(1.0),
                difficulty: Some(5.0),
            })
            .retrievability;
        let r2 = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 86_400_000.0,
                review_count: 0,
                stability_days: Some(1.0),
                difficulty: Some(5.0),
            })
            .retrievability;
        assert!(r1 > r2);
    }

    #[test]
    fn test_more_reviews_higher_retrievability() {
        let curve = default_curve();
        let r_no_reviews = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 86_400_000.0,
                review_count: 0,
                stability_days: Some(1.0),
                difficulty: Some(5.0),
            })
            .retrievability;
        let r_with_reviews = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 86_400_000.0,
                review_count: 5,
                stability_days: Some(1.0),
                difficulty: Some(5.0),
            })
            .retrievability;
        assert!(r_with_reviews > r_no_reviews);
    }

    #[test]
    fn test_higher_difficulty_faster_decay() {
        let curve = default_curve();
        let r_easy = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 86_400_000.0,
                review_count: 0,
                stability_days: Some(1.0),
                difficulty: Some(3.0),
            })
            .retrievability;
        let r_hard = curve
            .predict(&PlForgettingInput {
                elapsed_ms: 86_400_000.0,
                review_count: 0,
                stability_days: Some(1.0),
                difficulty: Some(8.0),
            })
            .retrievability;
        assert!(r_easy > r_hard);
    }

    #[test]
    fn test_fallback_stability_used_when_none() {
        let curve = default_curve();
        let out = curve.predict(&PlForgettingInput {
            elapsed_ms: 86_400_000.0,
            review_count: 0,
            stability_days: None,
            difficulty: Some(5.0),
        });
        assert!(out.retrievability > 0.0 && out.retrievability < 1.0);
    }

    #[test]
    fn test_fallback_stability_used_when_zero() {
        let curve = default_curve();
        let out = curve.predict(&PlForgettingInput {
            elapsed_ms: 86_400_000.0,
            review_count: 0,
            stability_days: Some(0.0),
            difficulty: Some(5.0),
        });
        assert!(out.retrievability > 0.0 && out.retrievability < 1.0);
    }

    #[test]
    fn test_retrievability_bounded() {
        let curve = default_curve();
        for t in [0.0, 1000.0, 1e9, 1e15] {
            for n in [0, 1, 10, 100] {
                let out = curve.predict(&PlForgettingInput {
                    elapsed_ms: t,
                    review_count: n,
                    stability_days: Some(1.0),
                    difficulty: Some(5.0),
                });
                assert!(out.retrievability >= 0.0 && out.retrievability <= 1.0);
            }
        }
    }

    #[test]
    fn test_negative_elapsed_clamped() {
        let curve = default_curve();
        let out = curve.predict(&PlForgettingInput {
            elapsed_ms: -1000.0,
            review_count: 0,
            stability_days: Some(1.0),
            difficulty: Some(5.0),
        });
        assert!((out.retrievability - 1.0).abs() < 1e-10);
    }
}
