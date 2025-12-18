use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

const MAX_ANGLE: f64 = std::f64::consts::PI / 4.0;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct HeadPose {
    pub pitch: f64,
    pub yaw: f64,
    pub roll: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct HeadPoseResult {
    pub pitch: f64,
    pub yaw: f64,
    pub roll: f64,
    pub is_valid: bool,
    pub is_head_dropping: bool,
    pub stability: f64,
}

#[wasm_bindgen]
pub struct HeadPoseEstimator {
    smoothing_factor: f64,
    head_drop_threshold: f64,
    history_size: usize,
    last_pose: HeadPose,
    pitch_history: VecDeque<f64>,
    yaw_history: VecDeque<f64>,
}

#[inline]
fn normalize_angle(radians: f64) -> f64 {
    (radians / MAX_ANGLE).clamp(-1.0, 1.0)
}

#[inline]
fn standard_deviation(values: &VecDeque<f64>) -> f64 {
    let n = values.len();
    if n == 0 {
        return 0.0;
    }

    let mean: f64 = values.iter().sum::<f64>() / n as f64;
    let variance: f64 = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n as f64;
    variance.sqrt()
}

#[wasm_bindgen]
impl HeadPoseEstimator {
    #[wasm_bindgen(constructor)]
    pub fn new(smoothing_factor: Option<f64>, head_drop_threshold: Option<f64>, history_size: Option<u32>) -> Self {
        Self {
            smoothing_factor: smoothing_factor.unwrap_or(0.3),
            head_drop_threshold: head_drop_threshold.unwrap_or(0.3),
            history_size: history_size.unwrap_or(30) as usize,
            last_pose: HeadPose { pitch: 0.0, yaw: 0.0, roll: 0.0 },
            pitch_history: VecDeque::new(),
            yaw_history: VecDeque::new(),
        }
    }

    #[wasm_bindgen]
    pub fn estimate_from_matrix(&mut self, matrix: &[f64]) -> HeadPoseResult {
        if matrix.len() < 16 {
            return self.create_invalid_result();
        }

        // MediaPipe returns column-major 4x4 matrix
        // matrix[0..4] = column 0, matrix[4..8] = column 1, etc.
        // r00 = matrix[0], r10 = matrix[1], r20 = matrix[2]
        // r01 = matrix[4], r11 = matrix[5], r21 = matrix[6]
        // r02 = matrix[8], r12 = matrix[9], r22 = matrix[10]

        let r00 = matrix[0];
        let r10 = matrix[1];
        let r20 = matrix[2];
        let r21 = matrix[6];
        let r22 = matrix[10];

        // Extract Euler angles (ZYX order)
        let pitch = r21.atan2(r22);
        let yaw = (-r20).clamp(-1.0, 1.0).asin();
        let roll = r10.atan2(r00);

        let raw_pose = HeadPose {
            pitch: normalize_angle(pitch),
            yaw: normalize_angle(yaw),
            roll: normalize_angle(roll),
        };

        self.process_pose(raw_pose)
    }

    #[wasm_bindgen]
    pub fn estimate_from_landmarks(&mut self, coords: &[f64]) -> HeadPoseResult {
        // coords layout: [nose_tip(3), forehead(3), nose_root(3), left_cheek(3), right_cheek(3)] = 15 floats
        if coords.len() < 15 {
            return self.create_invalid_result();
        }

        let nose_tip_y = coords[1];
        let nose_root_y = coords[7];
        let left_cheek_x = coords[9];
        let left_cheek_y = coords[10];
        let right_cheek_x = coords[12];
        let right_cheek_y = coords[13];

        // Estimate Pitch: nose tip relative to nose root
        let pitch_raw = nose_tip_y - nose_root_y;
        let pitch = normalize_angle(pitch_raw * 5.0);

        // Estimate Yaw: left-right cheek x difference
        let yaw_raw = (right_cheek_x - left_cheek_x) / 2.0 - 0.5;
        let yaw = normalize_angle(yaw_raw * 4.0);

        // Estimate Roll: left-right cheek y difference
        let roll_raw = right_cheek_y - left_cheek_y;
        let roll = normalize_angle(roll_raw * 4.0);

        let raw_pose = HeadPose { pitch, yaw, roll };
        self.process_pose(raw_pose)
    }

    #[wasm_bindgen]
    pub fn estimate_from_landmarks_full(&mut self, landmarks_js: JsValue) -> HeadPoseResult {
        let landmarks: Vec<crate::ear::Point3D> = match serde_wasm_bindgen::from_value(landmarks_js) {
            Ok(l) => l,
            Err(_) => return self.create_invalid_result(),
        };

        if landmarks.len() < 500 {
            return self.create_invalid_result();
        }

        // Landmark indices:
        // 1: nose tip, 168: forehead center, 6: nose root
        // 234: left cheek, 454: right cheek
        let nose_tip = &landmarks[1];
        let nose_root = &landmarks[6];
        let left_cheek = &landmarks[234];
        let right_cheek = &landmarks[454];

        let pitch_raw = nose_tip.y - nose_root.y;
        let pitch = normalize_angle(pitch_raw * 5.0);

        let yaw_raw = (right_cheek.x - left_cheek.x) / 2.0 - 0.5;
        let yaw = normalize_angle(yaw_raw * 4.0);

        let roll_raw = right_cheek.y - left_cheek.y;
        let roll = normalize_angle(roll_raw * 4.0);

        let raw_pose = HeadPose { pitch, yaw, roll };
        self.process_pose(raw_pose)
    }

    #[wasm_bindgen]
    pub fn get_current_pose(&self) -> HeadPose {
        self.last_pose
    }

    #[wasm_bindgen]
    pub fn is_head_dropping(&self) -> bool {
        self.last_pose.pitch > self.head_drop_threshold
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.last_pose = HeadPose { pitch: 0.0, yaw: 0.0, roll: 0.0 };
        self.pitch_history.clear();
        self.yaw_history.clear();
    }

    fn process_pose(&mut self, raw_pose: HeadPose) -> HeadPoseResult {
        let smoothed = self.smooth_pose(raw_pose);
        self.add_to_history(smoothed);

        let is_head_dropping = smoothed.pitch > self.head_drop_threshold;
        let stability = self.calculate_stability();

        HeadPoseResult {
            pitch: smoothed.pitch,
            yaw: smoothed.yaw,
            roll: smoothed.roll,
            is_valid: true,
            is_head_dropping,
            stability,
        }
    }

    fn smooth_pose(&mut self, raw: HeadPose) -> HeadPose {
        let alpha = self.smoothing_factor;
        let smoothed = HeadPose {
            pitch: alpha * raw.pitch + (1.0 - alpha) * self.last_pose.pitch,
            yaw: alpha * raw.yaw + (1.0 - alpha) * self.last_pose.yaw,
            roll: alpha * raw.roll + (1.0 - alpha) * self.last_pose.roll,
        };
        self.last_pose = smoothed;
        smoothed
    }

    fn add_to_history(&mut self, pose: HeadPose) {
        self.pitch_history.push_back(pose.pitch);
        self.yaw_history.push_back(pose.yaw);

        while self.pitch_history.len() > self.history_size {
            self.pitch_history.pop_front();
        }
        while self.yaw_history.len() > self.history_size {
            self.yaw_history.pop_front();
        }
    }

    fn calculate_stability(&self) -> f64 {
        if self.pitch_history.len() < 5 {
            return 1.0;
        }

        let pitch_std = standard_deviation(&self.pitch_history);
        let yaw_std = standard_deviation(&self.yaw_history);

        let avg_std = (pitch_std + yaw_std) / 2.0;
        (1.0 - avg_std * 5.0).max(0.0)
    }

    fn create_invalid_result(&self) -> HeadPoseResult {
        HeadPoseResult {
            pitch: self.last_pose.pitch,
            yaw: self.last_pose.yaw,
            roll: self.last_pose.roll,
            is_valid: false,
            is_head_dropping: false,
            stability: 0.0,
        }
    }
}
