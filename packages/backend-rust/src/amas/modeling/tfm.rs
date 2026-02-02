use serde::{Deserialize, Serialize};

use crate::amas::types::{EnergyLevel, VisualFatigueRawMetrics};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FatiguePoolConfig {
    pub r_fast: f64,
    pub r_slow: f64,
    pub spill_threshold: f64,
    pub w_fast: f64,
    pub w_slow: f64,
    pub tau_fast_min: f64,
    pub tau_slow_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TfmConfig {
    pub cognitive: FatiguePoolConfig,
    pub visual: FatiguePoolConfig,
    pub mental: FatiguePoolConfig,
    pub visual_weights: VisualLoadWeights,
    pub blink_baseline: f64,
    pub min_visual_confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualLoadWeights {
    pub perclos: f64,
    pub blink: f64,
    pub ear: f64,
    pub squint: f64,
    pub gaze_off: f64,
}

impl Default for TfmConfig {
    fn default() -> Self {
        Self {
            cognitive: FatiguePoolConfig {
                r_fast: 0.7,
                r_slow: 0.95,
                spill_threshold: 0.6,
                w_fast: 0.6,
                w_slow: 0.4,
                tau_fast_min: 2.0,
                tau_slow_min: 15.0,
            },
            visual: FatiguePoolConfig {
                r_fast: 0.8,
                r_slow: 0.97,
                spill_threshold: 0.5,
                w_fast: 0.5,
                w_slow: 0.5,
                tau_fast_min: 3.0,
                tau_slow_min: 20.0,
            },
            mental: FatiguePoolConfig {
                r_fast: 0.6,
                r_slow: 0.90,
                spill_threshold: 0.7,
                w_fast: 0.7,
                w_slow: 0.3,
                tau_fast_min: 1.0,
                tau_slow_min: 10.0,
            },
            visual_weights: VisualLoadWeights {
                perclos: 0.35,
                blink: 0.20,
                ear: 0.20,
                squint: 0.15,
                gaze_off: 0.10,
            },
            blink_baseline: 17.0,
            min_visual_confidence: 0.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FatiguePool {
    pub fast: f64,
    pub slow: f64,
}

impl FatiguePool {
    pub fn update(&mut self, load: f64, config: &FatiguePoolConfig) {
        self.fast = (self.fast * config.r_fast + load).clamp(0.0, 1.0);
        let spill = (self.fast - config.spill_threshold).max(0.0);
        self.slow = (self.slow * config.r_slow + spill).clamp(0.0, 1.0);
    }

    pub fn apply_rest(&mut self, break_minutes: f64, config: &FatiguePoolConfig) {
        if break_minutes > 0.0 {
            self.fast *= (-break_minutes / config.tau_fast_min).exp();
            self.slow *= (-break_minutes / config.tau_slow_min).exp();
        }
    }

    pub fn level(&self, config: &FatiguePoolConfig) -> f64 {
        (config.w_fast * self.fast + config.w_slow * self.slow).clamp(0.0, 1.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TriPoolFatigueState {
    pub cognitive: FatiguePool,
    pub visual: FatiguePool,
    pub mental: FatiguePool,
}

pub struct CognitiveFatigueInput {
    pub error_rate_trend: f64,
    pub rt_increase_rate: f64,
    pub repeat_errors: i32,
}

pub struct MentalFatigueInput {
    pub consecutive_failures: i32,
    pub is_quit: bool,
    pub motivation: f64,
}

pub struct TriPoolFatigue {
    config: TfmConfig,
}

impl Default for TriPoolFatigue {
    fn default() -> Self {
        Self::new(TfmConfig::default())
    }
}

impl TriPoolFatigue {
    pub fn new(config: TfmConfig) -> Self {
        Self { config }
    }

    fn compute_cognitive_load(&self, input: &CognitiveFatigueInput) -> f64 {
        let error_component = input.error_rate_trend.clamp(0.0, 1.0) * 0.4;
        let rt_component = input.rt_increase_rate.clamp(0.0, 1.0) * 0.35;
        let repeat_component = (input.repeat_errors as f64 / 5.0).clamp(0.0, 1.0) * 0.25;
        (error_component + rt_component + repeat_component).clamp(0.0, 1.0)
    }

    fn compute_visual_load(&self, raw: &VisualFatigueRawMetrics) -> f64 {
        let w = &self.config.visual_weights;
        let blink_deviation =
            (raw.blink_rate - self.config.blink_baseline).abs() / self.config.blink_baseline;
        let ear_component = 1.0 - raw.eye_aspect_ratio.clamp(0.0, 1.0);

        let load = w.perclos * raw.perclos.clamp(0.0, 1.0)
            + w.blink * blink_deviation.clamp(0.0, 2.0) / 2.0
            + w.ear * ear_component
            + w.squint * raw.squint_intensity.clamp(0.0, 1.0)
            + w.gaze_off * raw.gaze_off_screen_ratio.clamp(0.0, 1.0);
        load.clamp(0.0, 1.0)
    }

    fn compute_mental_load(&self, input: &MentalFatigueInput) -> f64 {
        let failure_component = (input.consecutive_failures as f64 / 5.0).clamp(0.0, 1.0) * 0.3;
        let quit_component = if input.is_quit { 0.5 } else { 0.0 };
        let motivation_component = (1.0 - input.motivation.clamp(-1.0, 1.0)) * 0.1;
        (failure_component + quit_component + motivation_component).clamp(0.0, 1.0)
    }

    pub fn update(
        &self,
        state: &mut TriPoolFatigueState,
        cognitive_input: &CognitiveFatigueInput,
        visual_raw: Option<&VisualFatigueRawMetrics>,
        mental_input: &MentalFatigueInput,
        break_minutes: Option<f64>,
    ) -> TfmOutput {
        self.update_with_energy(state, cognitive_input, visual_raw, mental_input, break_minutes, None)
    }

    pub fn update_with_energy(
        &self,
        state: &mut TriPoolFatigueState,
        cognitive_input: &CognitiveFatigueInput,
        visual_raw: Option<&VisualFatigueRawMetrics>,
        mental_input: &MentalFatigueInput,
        break_minutes: Option<f64>,
        energy_level: Option<EnergyLevel>,
    ) -> TfmOutput {
        // Apply energy level calibration factor
        let calibration = energy_level
            .map(|e| e.fatigue_calibration_factor())
            .unwrap_or(1.0);

        if let Some(brk) = break_minutes {
            state.cognitive.apply_rest(brk, &self.config.cognitive);
            state.visual.apply_rest(brk, &self.config.visual);
            state.mental.apply_rest(brk, &self.config.mental);
        }

        let cog_load = self.compute_cognitive_load(cognitive_input) * calibration;
        state.cognitive.update(cog_load.clamp(0.0, 1.0), &self.config.cognitive);

        if let Some(raw) = visual_raw {
            if raw.confidence >= self.config.min_visual_confidence {
                let vis_load = self.compute_visual_load(raw) * calibration;
                let blended = raw.confidence * vis_load.clamp(0.0, 1.0)
                    + (1.0 - raw.confidence) * state.visual.level(&self.config.visual);
                state.visual.fast = (state.visual.fast * self.config.visual.r_fast + blended)
                    .clamp(0.0, 1.0);
                let spill =
                    (state.visual.fast - self.config.visual.spill_threshold).max(0.0);
                state.visual.slow =
                    (state.visual.slow * self.config.visual.r_slow + spill).clamp(0.0, 1.0);
            }
        }

        let mental_load = self.compute_mental_load(mental_input) * calibration;
        state.mental.update(mental_load.clamp(0.0, 1.0), &self.config.mental);

        let f_cog = state.cognitive.level(&self.config.cognitive);
        let f_vis = state.visual.level(&self.config.visual);
        let f_men = state.mental.level(&self.config.mental);
        let total = (0.4 * f_cog + 0.35 * f_vis + 0.25 * f_men).clamp(0.0, 1.0);

        TfmOutput {
            cognitive: f_cog,
            visual: f_vis,
            mental: f_men,
            total,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TfmOutput {
    pub cognitive: f64,
    pub visual: f64,
    pub mental: f64,
    pub total: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_model() -> TriPoolFatigue {
        TriPoolFatigue::default()
    }

    #[test]
    fn test_initial_state_zero() {
        let state = TriPoolFatigueState::default();
        let config = TfmConfig::default();
        assert_eq!(state.cognitive.level(&config.cognitive), 0.0);
        assert_eq!(state.visual.level(&config.visual), 0.0);
        assert_eq!(state.mental.level(&config.mental), 0.0);
    }

    #[test]
    fn test_cognitive_fatigue_accumulates() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        for _ in 0..10 {
            tfm.update(
                &mut state,
                &CognitiveFatigueInput { error_rate_trend: 0.5, rt_increase_rate: 0.3, repeat_errors: 2 },
                None,
                &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
                None,
            );
        }
        assert!(state.cognitive.level(&tfm.config.cognitive) > 0.0);
    }

    #[test]
    fn test_rest_reduces_fatigue() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        for _ in 0..10 {
            tfm.update(
                &mut state,
                &CognitiveFatigueInput { error_rate_trend: 0.8, rt_increase_rate: 0.5, repeat_errors: 3 },
                None,
                &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
                None,
            );
        }
        let before_rest = state.cognitive.level(&tfm.config.cognitive);
        tfm.update(
            &mut state,
            &CognitiveFatigueInput { error_rate_trend: 0.0, rt_increase_rate: 0.0, repeat_errors: 0 },
            None,
            &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
            Some(10.0),
        );
        let after_rest = state.cognitive.level(&tfm.config.cognitive);
        assert!(after_rest < before_rest);
    }

    #[test]
    fn test_quit_signal_increases_mental_fatigue() {
        let tfm = default_model();
        let mut s1 = TriPoolFatigueState::default();
        let mut s2 = TriPoolFatigueState::default();
        let cog = CognitiveFatigueInput { error_rate_trend: 0.0, rt_increase_rate: 0.0, repeat_errors: 0 };
        tfm.update(&mut s1, &cog, None,
            &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 }, None);
        tfm.update(&mut s2, &cog, None,
            &MentalFatigueInput { consecutive_failures: 0, is_quit: true, motivation: 0.5 }, None);
        assert!(s2.mental.level(&tfm.config.mental) > s1.mental.level(&tfm.config.mental));
    }

    #[test]
    fn test_visual_load_with_raw_metrics() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        let raw = VisualFatigueRawMetrics {
            perclos: 0.3,
            blink_rate: 25.0,
            eye_aspect_ratio: 0.6,
            squint_intensity: 0.4,
            gaze_off_screen_ratio: 0.2,
            avg_blink_duration: 200.0,
            head_stability: 0.8,
            yawn_count: 1,
            confidence: 0.9,
            timestamp_ms: 0,
        };
        tfm.update(
            &mut state,
            &CognitiveFatigueInput { error_rate_trend: 0.0, rt_increase_rate: 0.0, repeat_errors: 0 },
            Some(&raw),
            &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
            None,
        );
        assert!(state.visual.level(&tfm.config.visual) > 0.0);
    }

    #[test]
    fn test_low_confidence_visual_ignored() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        let raw = VisualFatigueRawMetrics {
            perclos: 0.9,
            confidence: 0.1,
            ..Default::default()
        };
        tfm.update(
            &mut state,
            &CognitiveFatigueInput { error_rate_trend: 0.0, rt_increase_rate: 0.0, repeat_errors: 0 },
            Some(&raw),
            &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
            None,
        );
        assert_eq!(state.visual.level(&tfm.config.visual), 0.0);
    }

    #[test]
    fn test_output_bounded() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        for _ in 0..100 {
            let out = tfm.update(
                &mut state,
                &CognitiveFatigueInput { error_rate_trend: 1.0, rt_increase_rate: 1.0, repeat_errors: 10 },
                None,
                &MentalFatigueInput { consecutive_failures: 10, is_quit: true, motivation: -1.0 },
                None,
            );
            assert!(out.total >= 0.0 && out.total <= 1.0);
            assert!(out.cognitive >= 0.0 && out.cognitive <= 1.0);
            assert!(out.visual >= 0.0 && out.visual <= 1.0);
            assert!(out.mental >= 0.0 && out.mental <= 1.0);
        }
    }

    #[test]
    fn test_spill_mechanism() {
        let tfm = default_model();
        let mut state = TriPoolFatigueState::default();
        for _ in 0..20 {
            tfm.update(
                &mut state,
                &CognitiveFatigueInput { error_rate_trend: 0.9, rt_increase_rate: 0.8, repeat_errors: 5 },
                None,
                &MentalFatigueInput { consecutive_failures: 0, is_quit: false, motivation: 0.5 },
                None,
            );
        }
        assert!(state.cognitive.slow > 0.0, "Slow pool should accumulate via spill");
    }
}
