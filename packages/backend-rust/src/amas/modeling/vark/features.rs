use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VarkFeatures {
    pub img_view_normalized: f64,
    pub img_zoom_normalized: f64,
    pub img_press_normalized: f64,
    pub dwell_for_visual: f64,
    pub audio_play_normalized: f64,
    pub audio_replay_normalized: f64,
    pub speed_adjust: f64,
    pub pronunciation_clicks: f64,
    pub def_read_normalized: f64,
    pub example_read_normalized: f64,
    pub dwell_for_reading: f64,
    pub reading_no_audio: f64,
    pub response_speed: f64,
    pub response_variance: f64,
    pub page_switch_rate: f64,
    pub note_write_normalized: f64,
}

impl VarkFeatures {
    pub const DIM: usize = 16;

    pub fn to_vec(&self) -> Vec<f64> {
        vec![
            self.img_view_normalized,
            self.img_zoom_normalized,
            self.img_press_normalized,
            self.dwell_for_visual,
            self.audio_play_normalized,
            self.audio_replay_normalized,
            self.speed_adjust,
            self.pronunciation_clicks,
            self.def_read_normalized,
            self.example_read_normalized,
            self.dwell_for_reading,
            self.reading_no_audio,
            self.response_speed,
            self.response_variance,
            self.page_switch_rate,
            self.note_write_normalized,
        ]
    }

    pub fn from_interaction(
        image_view_count: i32,
        image_zoom_count: i32,
        image_long_press_ms: i64,
        dwell_time: i64,
        audio_play_count: i32,
        audio_replay_count: i32,
        audio_speed_adjust: bool,
        definition_read_ms: i64,
        example_read_ms: i64,
        note_write_count: i32,
        response_time: Option<i64>,
    ) -> Self {
        Self {
            img_view_normalized: (image_view_count as f64 / 10.0).min(1.0),
            img_zoom_normalized: (image_zoom_count as f64 / 5.0).min(1.0),
            img_press_normalized: (image_long_press_ms as f64 / 10000.0).min(1.0),
            dwell_for_visual: (dwell_time as f64 / 10000.0).min(1.0),
            audio_play_normalized: (audio_play_count as f64 / 5.0).min(1.0),
            audio_replay_normalized: (audio_replay_count as f64 / 3.0).min(1.0),
            speed_adjust: if audio_speed_adjust { 1.0 } else { 0.0 },
            pronunciation_clicks: 0.0,
            def_read_normalized: (definition_read_ms as f64 / 10000.0).min(1.0),
            example_read_normalized: (example_read_ms as f64 / 10000.0).min(1.0),
            dwell_for_reading: ((dwell_time as f64 - 5000.0).max(0.0) / 10000.0).min(1.0),
            reading_no_audio: if audio_play_count == 0 { 1.0 } else { 0.5 },
            response_speed: 1.0 / (1.0 + response_time.unwrap_or(0) as f64 / 1000.0),
            response_variance: 0.0,
            page_switch_rate: 0.0,
            note_write_normalized: (note_write_count as f64 / 3.0).min(1.0),
        }
    }
}

#[derive(Debug, Clone)]
pub struct VarkLabels {
    pub visual: f64,
    pub auditory: f64,
    pub reading: f64,
    pub kinesthetic: f64,
}

impl VarkLabels {
    pub fn infer(
        image_view_count: i32,
        image_zoom_count: i32,
        image_long_press_ms: i64,
        dwell_time: i64,
        audio_play_count: i32,
        audio_replay_count: i32,
        note_write_count: i32,
        response_time: Option<i64>,
    ) -> Self {
        let has_visual =
            image_view_count > 0 || image_zoom_count > 0 || image_long_press_ms > 500;

        let has_auditory = audio_play_count > 0 || audio_replay_count > 0;

        let has_reading = dwell_time > 5000 && audio_play_count == 0;

        let has_kinesthetic =
            note_write_count > 0 || response_time.map(|t| t < 2000).unwrap_or(false);

        Self {
            visual: if has_visual { 1.0 } else { 0.0 },
            auditory: if has_auditory { 1.0 } else { 0.0 },
            reading: if has_reading { 1.0 } else { 0.0 },
            kinesthetic: if has_kinesthetic { 1.0 } else { 0.0 },
        }
    }
}
