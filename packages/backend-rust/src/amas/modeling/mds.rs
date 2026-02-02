use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdsConfig {
    pub a: f64,
    pub b: f64,
    pub eta: f64,
    pub kappa: f64,
    pub lambda: f64,
    pub mu: f64,
}

impl Default for MdsConfig {
    fn default() -> Self {
        Self {
            a: 0.5,
            b: 0.5,
            eta: 0.1,
            kappa: 0.3,
            lambda: 0.2,
            mu: 0.5,
        }
    }
}

pub struct MdsEvent {
    pub is_correct: bool,
    pub is_quit: bool,
}

pub struct MotivationDynamics {
    config: MdsConfig,
}

impl Default for MotivationDynamics {
    fn default() -> Self {
        Self::new(MdsConfig::default())
    }
}

impl MotivationDynamics {
    pub fn new(config: MdsConfig) -> Self {
        Self { config }
    }

    fn potential_gradient(&self, m: f64) -> f64 {
        // V(M) = -a·M² + b·M⁴  =>  dV/dM = -2a·M + 4b·M³
        // Force = -dV/dM = 2a·M - 4b·M³
        2.0 * self.config.a * m - 4.0 * self.config.b * m * m * m
    }

    fn stimulus(&self, event: &MdsEvent) -> f64 {
        if event.is_quit {
            -self.config.mu
        } else if event.is_correct {
            self.config.kappa
        } else {
            -self.config.lambda
        }
    }

    pub fn update(&self, current_m: f64, event: &MdsEvent) -> f64 {
        let force = self.potential_gradient(current_m);
        let s = self.stimulus(event);
        let new_m = current_m + self.config.eta * (force + s);
        new_m.clamp(-1.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_correct_increases_motivation() {
        let mds = MotivationDynamics::default();
        let m = mds.update(0.0, &MdsEvent { is_correct: true, is_quit: false });
        assert!(m > 0.0);
    }

    #[test]
    fn test_incorrect_decreases_motivation() {
        let mds = MotivationDynamics::default();
        let m = mds.update(0.0, &MdsEvent { is_correct: false, is_quit: false });
        assert!(m < 0.0);
    }

    #[test]
    fn test_quit_strongly_decreases() {
        let mds = MotivationDynamics::default();
        let m_incorrect = mds.update(0.0, &MdsEvent { is_correct: false, is_quit: false });
        let m_quit = mds.update(0.0, &MdsEvent { is_correct: false, is_quit: true });
        assert!(m_quit < m_incorrect);
    }

    #[test]
    fn test_bounded() {
        let mds = MotivationDynamics::default();
        let mut m = 0.5;
        for _ in 0..200 {
            m = mds.update(m, &MdsEvent { is_correct: true, is_quit: false });
        }
        assert!(m >= -1.0 && m <= 1.0);

        let mut m = -0.5;
        for _ in 0..200 {
            m = mds.update(m, &MdsEvent { is_correct: false, is_quit: true });
        }
        assert!(m >= -1.0 && m <= 1.0);
    }

    #[test]
    fn test_bistable_high_motivation_resilient() {
        let mds = MotivationDynamics::default();
        let mut m = 0.8;
        // A single failure should not crash motivation when high
        m = mds.update(m, &MdsEvent { is_correct: false, is_quit: false });
        assert!(m > 0.5, "High motivation should be resilient to single failure: {m}");
    }

    #[test]
    fn test_bistable_low_motivation_sticky() {
        let mds = MotivationDynamics::default();
        let mut m = -0.8;
        // A single success should not fully recover from deep low
        m = mds.update(m, &MdsEvent { is_correct: true, is_quit: false });
        assert!(m < -0.3, "Low motivation should be sticky: {m}");
    }
}
