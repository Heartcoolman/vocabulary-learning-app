const BEHAVIORAL_WEIGHT: f64 = 0.4;
const VISUAL_WEIGHT: f64 = 0.4;
const TEMPORAL_WEIGHT: f64 = 0.2;
const CONFIDENCE_THRESHOLD: f64 = 0.2;
const TEMPORAL_DECAY_K: f64 = 0.05;
const TEMPORAL_THRESHOLD_MIN: f64 = 30.0;

fn temporal_fatigue(duration_minutes: f64) -> f64 {
    let effective = (duration_minutes - TEMPORAL_THRESHOLD_MIN).max(0.0);
    1.0 - (-TEMPORAL_DECAY_K * effective).exp()
}

pub fn fuse_fatigue(
    behavioral: f64,
    visual: Option<f64>,
    confidence: Option<f64>,
    study_duration_min: f64,
) -> f64 {
    let conf = confidence.unwrap_or(0.0);
    let temporal = temporal_fatigue(study_duration_min);

    match visual {
        Some(v) if conf >= CONFIDENCE_THRESHOLD => {
            (BEHAVIORAL_WEIGHT * behavioral + VISUAL_WEIGHT * v + TEMPORAL_WEIGHT * temporal)
                .clamp(0.0, 1.0)
        }
        _ => behavioral.clamp(0.0, 1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuse_with_valid_visual() {
        let result = fuse_fatigue(0.5, Some(0.6), Some(0.8), 60.0);
        assert!(result > 0.0 && result < 1.0);
    }

    #[test]
    fn test_fallback_low_confidence() {
        let result = fuse_fatigue(0.5, Some(0.9), Some(0.1), 60.0);
        assert!((result - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_fallback_no_visual() {
        let result = fuse_fatigue(0.3, None, Some(0.8), 60.0);
        assert!((result - 0.3).abs() < 1e-6);
    }
}
