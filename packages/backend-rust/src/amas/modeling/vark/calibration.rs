use crate::services::user_profile::LearningStyleScores;

pub fn compute_ml_confidence(scores: &LearningStyleScores, sample_count: i64) -> f64 {
    let base_confidence = compute_confidence(scores, sample_count);

    let ml_bonus = if sample_count >= 100 {
        0.05
    } else if sample_count >= 50 {
        0.02
    } else {
        0.0
    };

    (base_confidence + ml_bonus).min(0.95)
}

fn compute_confidence(scores: &LearningStyleScores, sample_count: i64) -> f64 {
    let sample_confidence = (sample_count as f64 / 100.0).min(0.5);
    let model_confidence = compute_score_gap(scores);
    (sample_confidence + model_confidence).min(0.95)
}

fn compute_score_gap(scores: &LearningStyleScores) -> f64 {
    let mut sorted = [
        scores.visual,
        scores.auditory,
        scores.reading,
        scores.kinesthetic,
    ];

    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

    sorted[0] - sorted[1]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_confidence_bounded() {
        let scores = LearningStyleScores {
            visual: 0.9,
            auditory: 0.05,
            reading: 0.03,
            kinesthetic: 0.02,
        };
        let confidence = compute_ml_confidence(&scores, 10000);
        assert!(confidence <= 0.95);
        assert!(confidence >= 0.0);
    }

    #[test]
    fn test_confidence_with_uniform_scores() {
        let scores = LearningStyleScores {
            visual: 0.25,
            auditory: 0.25,
            reading: 0.25,
            kinesthetic: 0.25,
        };
        let confidence = compute_ml_confidence(&scores, 100);
        assert!(confidence < 0.6);
    }

    #[test]
    fn test_sample_confidence_capped() {
        let scores = LearningStyleScores::default();
        let conf_50 = compute_ml_confidence(&scores, 50);
        let conf_100 = compute_ml_confidence(&scores, 100);
        let conf_1000 = compute_ml_confidence(&scores, 1000);
        assert!(conf_100 > conf_50);
        assert!((conf_1000 - conf_100).abs() < 0.1);
    }
}
