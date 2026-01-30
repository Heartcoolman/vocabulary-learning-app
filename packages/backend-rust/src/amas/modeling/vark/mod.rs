pub mod calibration;
pub mod classifier;
pub mod features;
pub mod persistence;

pub use calibration::compute_ml_confidence;
pub use classifier::{BinaryClassifier, VarkClassifier};
pub use features::{VarkFeatures, VarkLabels};
pub use persistence::{load_vark_model, save_vark_model};

use sqlx::PgPool;

/// VARK interaction data for ML model update
#[derive(Debug, Clone, Default)]
pub struct VarkInteractionData {
    pub image_view_count: i32,
    pub image_zoom_count: i32,
    pub image_long_press_ms: i64,
    pub dwell_time: i64,
    pub audio_play_count: i32,
    pub audio_replay_count: i32,
    pub audio_speed_adjust: bool,
    pub definition_read_ms: i64,
    pub example_read_ms: i64,
    pub note_write_count: i32,
    pub response_time: Option<i64>,
    pub timestamp_ms: i64,
}

/// Update the user's VARK ML model after each answer interaction
pub async fn update_learning_style_model(
    pool: &PgPool,
    user_id: &str,
    data: &VarkInteractionData,
) -> Result<(), String> {
    let mut classifier = load_vark_model(pool, user_id)
        .await
        .map_err(|e| format!("Failed to load VARK model: {}", e))?
        .unwrap_or_else(VarkClassifier::new);

    let features = VarkFeatures::from_interaction(
        data.image_view_count,
        data.image_zoom_count,
        data.image_long_press_ms,
        data.dwell_time,
        data.audio_play_count,
        data.audio_replay_count,
        data.audio_speed_adjust,
        data.definition_read_ms,
        data.example_read_ms,
        data.note_write_count,
        data.response_time,
    );

    let labels = VarkLabels::infer(
        data.image_view_count,
        data.image_zoom_count,
        data.image_long_press_ms,
        data.dwell_time,
        data.audio_play_count,
        data.audio_replay_count,
        data.note_write_count,
        data.response_time,
    );

    classifier.update(&features.to_vec(), data.timestamp_ms, &labels);

    save_vark_model(pool, user_id, &classifier)
        .await
        .map_err(|e| format!("Failed to save VARK model: {}", e))?;

    Ok(())
}
