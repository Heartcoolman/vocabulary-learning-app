use serde::{Deserialize, Serialize};

const DEFAULT_OPTIMAL_GAP: f64 = 100.0;
const DEFAULT_ZPD_WIDTH: f64 = 200.0;
const ZPD_PRIORITY_WEIGHT: f64 = 0.25;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Zone {
    TooEasy,
    ZPD,
    TooHard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZPDConfig {
    pub optimal_gap: f64,
    pub zpd_width: f64,
    pub priority_weight: f64,
}

impl Default for ZPDConfig {
    fn default() -> Self {
        Self {
            optimal_gap: DEFAULT_OPTIMAL_GAP,
            zpd_width: DEFAULT_ZPD_WIDTH,
            priority_weight: ZPD_PRIORITY_WEIGHT,
        }
    }
}

pub fn zpd_score(user_elo: f64, word_elo: f64, config: &ZPDConfig) -> f64 {
    let gap = word_elo - user_elo;
    let distance = gap - config.optimal_gap;
    let width = config.zpd_width.max(1.0);
    (-distance.powi(2) / (2.0 * width.powi(2))).exp()
}

pub fn classify_zone(user_elo: f64, word_elo: f64) -> Zone {
    let gap = word_elo - user_elo;
    if gap < -300.0 {
        Zone::TooEasy
    } else if gap > 400.0 {
        Zone::TooHard
    } else {
        Zone::ZPD
    }
}

pub fn adjust_priority(
    base_priority: f64,
    user_elo: f64,
    word_elo: f64,
    config: &ZPDConfig,
) -> f64 {
    let zpd = zpd_score(user_elo, word_elo, config);
    base_priority * (1.0 + config.priority_weight * (zpd - 0.5))
}

pub fn filter_by_zone(
    user_elo: f64,
    word_elos: &[(String, f64)],
    exclude_too_hard: bool,
) -> Vec<String> {
    word_elos
        .iter()
        .filter(|(_, word_elo)| {
            let zone = classify_zone(user_elo, *word_elo);
            if exclude_too_hard {
                zone != Zone::TooHard
            } else {
                true
            }
        })
        .map(|(id, _)| id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zpd_score_at_optimal() {
        let config = ZPDConfig::default();
        let score = zpd_score(1200.0, 1300.0, &config);
        assert!((score - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_zpd_score_far_from_optimal() {
        let config = ZPDConfig::default();
        let score = zpd_score(1200.0, 1600.0, &config);
        assert!(score < 0.5);
    }

    #[test]
    fn test_zone_classification() {
        assert_eq!(classify_zone(1200.0, 800.0), Zone::TooEasy);
        assert_eq!(classify_zone(1200.0, 1300.0), Zone::ZPD);
        assert_eq!(classify_zone(1200.0, 1700.0), Zone::TooHard);
    }

    #[test]
    fn test_priority_adjustment() {
        let config = ZPDConfig::default();
        let base = 50.0;
        let adjusted_zpd = adjust_priority(base, 1200.0, 1300.0, &config);
        let adjusted_far = adjust_priority(base, 1200.0, 1600.0, &config);
        assert!(adjusted_zpd > adjusted_far);
    }
}
