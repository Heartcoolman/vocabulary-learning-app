use crate::amas::config::MotivationParams;

#[derive(Debug, Clone)]
pub struct MotivationEvent {
    pub is_correct: bool,
    pub is_quit: bool,
    pub streak_length: i32,
}

impl Default for MotivationEvent {
    fn default() -> Self {
        Self {
            is_correct: true,
            is_quit: false,
            streak_length: 0,
        }
    }
}

pub struct MotivationTracker {
    params: MotivationParams,
    current_value: f64,
    streak: i32,
}

impl MotivationTracker {
    pub fn new(params: MotivationParams) -> Self {
        Self {
            params,
            current_value: 0.5,
            streak: 0,
        }
    }

    pub fn update(&mut self, event: MotivationEvent) -> f64 {
        if event.is_quit {
            self.current_value = self.params.rho * self.current_value - self.params.mu;
            self.streak = 0;
        } else if event.is_correct {
            self.streak += 1;
            let streak_bonus = (self.streak as f64 / 10.0).min(0.5) * self.params.kappa;
            self.current_value =
                self.params.rho * self.current_value + self.params.kappa + streak_bonus;
        } else {
            self.streak = 0;
            self.current_value = self.params.rho * self.current_value - self.params.lambda;
        }

        self.current_value = self.current_value.clamp(-1.0, 1.0);
        self.current_value
    }

    pub fn current(&self) -> f64 {
        self.current_value
    }

    pub fn streak(&self) -> i32 {
        self.streak
    }

    pub fn reset(&mut self) {
        self.current_value = 0.5;
        self.streak = 0;
    }

    pub fn set_value(&mut self, value: f64) {
        self.current_value = value.clamp(-1.0, 1.0);
    }
}

impl Default for MotivationTracker {
    fn default() -> Self {
        Self::new(MotivationParams::default())
    }
}
