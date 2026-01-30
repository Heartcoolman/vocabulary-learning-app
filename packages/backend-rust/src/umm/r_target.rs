//! R_target personalization - Dynamic retention target based on user burden
//!
//! Formula:
//! burden = 0.5 × (actual_review_count / target_review_count) + 0.5 × (actual_time / target_time)
//! R_target = clamp(0.9 × (1 + 0.1 × (1 - burden)), 0.75, 0.95)
//!
//! Window: 7-day sliding window

const R_TARGET_MIN: f64 = 0.75;
const R_TARGET_MAX: f64 = 0.95;
const R_TARGET_BASE: f64 = 0.90;
const BURDEN_SENSITIVITY: f64 = 0.1;

pub struct RTargetCalculator;

impl RTargetCalculator {
    pub fn compute(
        actual_review_count: i32,
        target_review_count: i32,
        actual_time_minutes: f64,
        target_time_minutes: f64,
    ) -> f64 {
        let count_ratio = if target_review_count > 0 {
            actual_review_count as f64 / target_review_count as f64
        } else {
            1.0
        };

        let time_ratio = if target_time_minutes > 0.0 {
            actual_time_minutes / target_time_minutes
        } else {
            1.0
        };

        let burden = 0.5 * count_ratio + 0.5 * time_ratio;
        let r_target = R_TARGET_BASE * (1.0 + BURDEN_SENSITIVITY * (1.0 - burden));
        r_target.clamp(R_TARGET_MIN, R_TARGET_MAX)
    }

    pub fn default_target() -> f64 {
        R_TARGET_BASE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_balanced_burden() {
        let r = RTargetCalculator::compute(50, 50, 30.0, 30.0);
        assert!((r - R_TARGET_BASE).abs() < 0.01);
    }

    #[test]
    fn test_low_burden_increases_target() {
        let r = RTargetCalculator::compute(25, 50, 15.0, 30.0);
        assert!(r > R_TARGET_BASE);
    }

    #[test]
    fn test_high_burden_decreases_target() {
        let r = RTargetCalculator::compute(75, 50, 45.0, 30.0);
        assert!(r < R_TARGET_BASE);
    }

    #[test]
    fn test_clamped_to_bounds() {
        let r_high = RTargetCalculator::compute(0, 50, 0.0, 30.0);
        assert!(r_high <= R_TARGET_MAX);

        let r_low = RTargetCalculator::compute(200, 50, 120.0, 30.0);
        assert!(r_low >= R_TARGET_MIN);
    }
}
