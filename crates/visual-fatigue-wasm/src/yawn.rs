use wasm_bindgen::prelude::*;

const MOUTH_TOP: usize = 13;
const MOUTH_BOTTOM: usize = 14;
const MOUTH_LEFT: usize = 61;
const MOUTH_RIGHT: usize = 291;

#[derive(Clone, Copy, PartialEq)]
enum YawnState {
    Normal,
    Yawning,
}

#[derive(Clone)]
struct YawnEventInternal {
    start_time: f64,
    end_time: f64,
    duration: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct MARResult {
    pub mar: f64,
    pub is_valid: bool,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct YawnEvent {
    pub start_time: f64,
    pub end_time: f64,
    pub duration: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct YawnStats {
    pub yawn_count: u32,
    pub avg_yawn_duration: f64,
    pub window_duration: f64,
    pub is_valid: bool,
}

#[wasm_bindgen]
pub struct YawnDetector {
    mar_threshold: f64,
    min_yawn_duration: f64,
    max_yawn_duration: f64,
    window_size_ms: f64,
    state: YawnState,
    yawn_start_time: f64,
    yawn_events: Vec<YawnEventInternal>,
}

#[inline]
fn euclidean_distance_2d(x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    (dx * dx + dy * dy).sqrt()
}

#[wasm_bindgen]
impl YawnDetector {
    #[wasm_bindgen(constructor)]
    pub fn new(
        mar_threshold: Option<f64>,
        min_yawn_duration: Option<f64>,
        max_yawn_duration: Option<f64>,
        window_size_seconds: Option<f64>,
    ) -> Self {
        Self {
            mar_threshold: mar_threshold.unwrap_or(0.6),
            min_yawn_duration: min_yawn_duration.unwrap_or(2000.0),
            max_yawn_duration: max_yawn_duration.unwrap_or(8000.0),
            window_size_ms: window_size_seconds.unwrap_or(300.0) * 1000.0,
            state: YawnState::Normal,
            yawn_start_time: 0.0,
            yawn_events: Vec::new(),
        }
    }

    #[wasm_bindgen]
    pub fn calculate_mar(&self, coords: &[f64]) -> MARResult {
        if coords.len() < 12 {
            return MARResult { mar: -1.0, is_valid: false };
        }

        let top_x = coords[0];
        let top_y = coords[1];
        let bottom_x = coords[3];
        let bottom_y = coords[4];
        let left_x = coords[6];
        let left_y = coords[7];
        let right_x = coords[9];
        let right_y = coords[10];

        let vertical = euclidean_distance_2d(top_x, top_y, bottom_x, bottom_y);
        let horizontal = euclidean_distance_2d(left_x, left_y, right_x, right_y);

        if horizontal < 0.001 {
            return MARResult { mar: -1.0, is_valid: false };
        }

        let mar = vertical / horizontal;
        MARResult { mar, is_valid: true }
    }

    #[wasm_bindgen]
    pub fn calculate_mar_from_landmarks(&self, landmarks_js: JsValue) -> MARResult {
        let landmarks: Vec<crate::ear::Point3D> = match serde_wasm_bindgen::from_value(landmarks_js) {
            Ok(l) => l,
            Err(_) => return MARResult { mar: -1.0, is_valid: false },
        };

        if landmarks.len() < 300 {
            return MARResult { mar: -1.0, is_valid: false };
        }

        let top = &landmarks[MOUTH_TOP];
        let bottom = &landmarks[MOUTH_BOTTOM];
        let left = &landmarks[MOUTH_LEFT];
        let right = &landmarks[MOUTH_RIGHT];

        let vertical = euclidean_distance_2d(top.x, top.y, bottom.x, bottom.y);
        let horizontal = euclidean_distance_2d(left.x, left.y, right.x, right.y);

        if horizontal < 0.001 {
            return MARResult { mar: -1.0, is_valid: false };
        }

        let mar = vertical / horizontal;
        MARResult { mar, is_valid: true }
    }

    #[wasm_bindgen]
    pub fn detect_yawn(&mut self, mar: f64, timestamp: f64) -> Option<YawnEvent> {
        let mut yawn_event: Option<YawnEvent> = None;

        match self.state {
            YawnState::Normal => {
                if mar > self.mar_threshold {
                    self.state = YawnState::Yawning;
                    self.yawn_start_time = timestamp;
                }
            }
            YawnState::Yawning => {
                if mar <= self.mar_threshold {
                    let duration = timestamp - self.yawn_start_time;

                    if duration >= self.min_yawn_duration && duration <= self.max_yawn_duration {
                        let event = YawnEvent {
                            start_time: self.yawn_start_time,
                            end_time: timestamp,
                            duration,
                        };
                        self.yawn_events.push(YawnEventInternal {
                            start_time: self.yawn_start_time,
                            end_time: timestamp,
                            duration,
                        });
                        yawn_event = Some(event);
                    }

                    self.state = YawnState::Normal;
                } else {
                    let current_duration = timestamp - self.yawn_start_time;
                    if current_duration > self.max_yawn_duration {
                        self.state = YawnState::Normal;
                    }
                }
            }
        }

        self.prune_old_events(timestamp);
        yawn_event
    }

    #[wasm_bindgen]
    pub fn process(&mut self, coords: &[f64], timestamp: f64) -> MARResult {
        let mar_result = self.calculate_mar(coords);
        if mar_result.is_valid {
            self.detect_yawn(mar_result.mar, timestamp);
        }
        mar_result
    }

    #[wasm_bindgen]
    pub fn process_from_landmarks(&mut self, landmarks_js: JsValue, timestamp: f64) -> MARResult {
        let mar_result = self.calculate_mar_from_landmarks(landmarks_js);
        if mar_result.is_valid {
            self.detect_yawn(mar_result.mar, timestamp);
        }
        mar_result
    }

    #[wasm_bindgen]
    pub fn get_last_yawn_event(&self) -> Option<YawnEvent> {
        self.yawn_events.last().map(|e| YawnEvent {
            start_time: e.start_time,
            end_time: e.end_time,
            duration: e.duration,
        })
    }

    #[wasm_bindgen]
    pub fn get_stats(&self) -> YawnStats {
        let count = self.yawn_events.len() as u32;

        if count == 0 {
            return YawnStats {
                yawn_count: 0,
                avg_yawn_duration: 0.0,
                window_duration: self.window_size_ms,
                is_valid: true,
            };
        }

        let total_duration: f64 = self.yawn_events.iter().map(|e| e.duration).sum();
        let avg_duration = total_duration / count as f64;

        YawnStats {
            yawn_count: count,
            avg_yawn_duration: avg_duration,
            window_duration: self.window_size_ms,
            is_valid: true,
        }
    }

    #[wasm_bindgen]
    pub fn get_yawn_count(&self) -> u32 {
        self.yawn_events.len() as u32
    }

    #[wasm_bindgen]
    pub fn set_mar_threshold(&mut self, threshold: f64) {
        self.mar_threshold = threshold;
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.state = YawnState::Normal;
        self.yawn_start_time = 0.0;
        self.yawn_events.clear();
    }

    fn prune_old_events(&mut self, now: f64) {
        let cutoff = now - self.window_size_ms;
        self.yawn_events.retain(|e| e.end_time > cutoff);
    }
}
