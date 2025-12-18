use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct BlinkEvent {
    pub timestamp: f64,
    pub duration: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct BlinkStats {
    pub blink_rate: f64,
    pub avg_blink_duration: f64,
    pub blink_count: u32,
}

#[derive(Clone, Copy, PartialEq)]
enum BlinkState {
    Open,
    Closing,
    Closed,
    Opening,
}

#[wasm_bindgen]
pub struct BlinkDetector {
    state: BlinkState,
    ear_threshold: f64,
    min_blink_duration: f64,
    max_blink_duration: f64,
    close_start_time: f64,
    blink_events: Vec<BlinkEvent>,
    window_size_ms: f64,
}

#[wasm_bindgen]
impl BlinkDetector {
    #[wasm_bindgen(constructor)]
    pub fn new(
        ear_threshold: Option<f64>,
        min_blink_duration: Option<f64>,
        max_blink_duration: Option<f64>,
    ) -> Self {
        Self {
            state: BlinkState::Open,
            ear_threshold: ear_threshold.unwrap_or(0.25),
            min_blink_duration: min_blink_duration.unwrap_or(50.0),
            max_blink_duration: max_blink_duration.unwrap_or(400.0),
            close_start_time: 0.0,
            blink_events: Vec::with_capacity(100),
            window_size_ms: 60000.0,
        }
    }

    #[wasm_bindgen]
    pub fn detect_blink(&mut self, ear: f64, timestamp: f64) -> Option<BlinkEvent> {
        let threshold = self.ear_threshold;
        let closed_threshold = threshold * 0.8;
        let mut blink_event: Option<BlinkEvent> = None;

        match self.state {
            BlinkState::Open => {
                if ear < threshold {
                    self.state = BlinkState::Closing;
                    self.close_start_time = timestamp;
                }
            }
            BlinkState::Closing => {
                if ear < closed_threshold {
                    self.state = BlinkState::Closed;
                } else if ear >= threshold {
                    self.state = BlinkState::Open;
                }
            }
            BlinkState::Closed => {
                if ear >= closed_threshold {
                    self.state = BlinkState::Opening;
                }
            }
            BlinkState::Opening => {
                if ear >= threshold {
                    let duration = timestamp - self.close_start_time;
                    if duration >= self.min_blink_duration && duration <= self.max_blink_duration {
                        let event = BlinkEvent { timestamp, duration };
                        self.add_blink_event(event);
                        blink_event = Some(event);
                    }
                    self.state = BlinkState::Open;
                } else if ear < closed_threshold {
                    self.state = BlinkState::Closed;
                }
            }
        }

        self.prune_old_events(timestamp);
        blink_event
    }

    fn add_blink_event(&mut self, event: BlinkEvent) {
        self.blink_events.push(event);
    }

    fn prune_old_events(&mut self, now: f64) {
        let cutoff = now - self.window_size_ms;
        self.blink_events.retain(|e| e.timestamp >= cutoff);
    }

    #[wasm_bindgen]
    pub fn get_stats(&self) -> BlinkStats {
        let count = self.blink_events.len() as u32;

        let avg_duration = if count > 0 {
            self.blink_events.iter().map(|e| e.duration).sum::<f64>() / count as f64
        } else {
            0.0
        };

        let blink_rate = if self.blink_events.len() >= 2 {
            let first = self.blink_events.first().unwrap().timestamp;
            let last = self.blink_events.last().unwrap().timestamp;
            let duration_min = (last - first) / 60000.0;
            if duration_min > 0.0 { count as f64 / duration_min } else { 0.0 }
        } else {
            0.0
        };

        BlinkStats {
            blink_rate,
            avg_blink_duration: avg_duration,
            blink_count: count,
        }
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.state = BlinkState::Open;
        self.blink_events.clear();
    }
}
