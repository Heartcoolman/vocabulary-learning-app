use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct PERCLOSResult {
    pub perclos: f64,
    pub total_frames: u32,
    pub closed_frames: u32,
    pub window_duration: f64,
    pub is_valid: bool,
}

struct EARSample {
    ear: f64,
    timestamp: f64,
    is_closed: bool,
}

#[wasm_bindgen]
pub struct PERCLOSCalculator {
    samples: Vec<EARSample>,
    window_size_ms: f64,
    ear_threshold: f64,
    max_samples: usize,
}

#[wasm_bindgen]
impl PERCLOSCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new(window_size_seconds: Option<f64>, ear_threshold: Option<f64>, sample_rate: Option<u32>) -> Self {
        let window = window_size_seconds.unwrap_or(60.0);
        let rate = sample_rate.unwrap_or(10) as usize;
        Self {
            samples: Vec::with_capacity(window as usize * rate),
            window_size_ms: window * 1000.0,
            ear_threshold: ear_threshold.unwrap_or(0.25),
            max_samples: window as usize * rate,
        }
    }

    #[wasm_bindgen]
    pub fn add_sample(&mut self, ear: f64, timestamp: f64) {
        let is_closed = ear > 0.0 && ear < self.ear_threshold;
        self.samples.push(EARSample { ear, timestamp, is_closed });
        self.prune_old_samples(timestamp);
    }

    fn prune_old_samples(&mut self, now: f64) {
        let cutoff = now - self.window_size_ms;
        self.samples.retain(|s| s.timestamp >= cutoff);
        if self.samples.len() > self.max_samples {
            let excess = self.samples.len() - self.max_samples;
            self.samples.drain(0..excess);
        }
    }

    #[wasm_bindgen]
    pub fn calculate(&mut self) -> PERCLOSResult {
        if self.samples.is_empty() {
            return PERCLOSResult {
                perclos: 0.0,
                total_frames: 0,
                closed_frames: 0,
                window_duration: 0.0,
                is_valid: false,
            };
        }

        let total = self.samples.len() as u32;
        let closed = self.samples.iter().filter(|s| s.is_closed).count() as u32;

        let duration = if self.samples.len() > 1 {
            self.samples.last().unwrap().timestamp - self.samples.first().unwrap().timestamp
        } else {
            0.0
        };

        let min_samples = (self.max_samples as f64 * 0.3) as usize;
        let is_valid = self.samples.len() >= min_samples;
        let perclos = if total > 0 { closed as f64 / total as f64 } else { 0.0 };

        PERCLOSResult {
            perclos,
            total_frames: total,
            closed_frames: closed,
            window_duration: duration,
            is_valid,
        }
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.samples.clear();
    }
}
