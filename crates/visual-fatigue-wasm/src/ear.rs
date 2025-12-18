use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct Point3D {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub z: f64,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct EARResult {
    pub left_ear: f64,
    pub right_ear: f64,
    pub avg_ear: f64,
    pub is_valid: bool,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct EnhancedEARResult {
    pub left_ear: f64,
    pub right_ear: f64,
    pub avg_ear: f64,
    pub left_ear_multi: f64,
    pub right_ear_multi: f64,
    pub iris_visibility: f64,
    pub confidence: f64,
    pub is_valid: bool,
}

// MediaPipe Face Mesh eye landmark indices (基础6点)
const LEFT_EYE: [usize; 6] = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE: [usize; 6] = [362, 385, 387, 263, 373, 380];

// 增强版：更多眼睑关键点 (16点/眼)
// 左眼轮廓点 (顺时针)
const LEFT_EYE_CONTOUR: [usize; 16] = [
    33,   // 外眼角
    246, 161, 160, 159, 158, 157, 173,  // 上眼睑
    133,  // 内眼角
    155, 154, 153, 145, 144, 163, 7,    // 下眼睑
];

// 右眼轮廓点 (顺时针)
const RIGHT_EYE_CONTOUR: [usize; 16] = [
    362,  // 内眼角
    398, 384, 385, 386, 387, 388, 466,  // 上眼睑
    263,  // 外眼角
    249, 390, 373, 374, 380, 381, 382,  // 下眼睑
];

// 虹膜中心点 (478点模型)
const LEFT_IRIS_CENTER: usize = 468;
const RIGHT_IRIS_CENTER: usize = 473;

#[inline]
fn euclidean_distance(p1: &Point3D, p2: &Point3D) -> f64 {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dz = p2.z - p1.z;
    (dx * dx + dy * dy + dz * dz).sqrt()
}

fn compute_single_eye_ear(landmarks: &[Point3D], indices: &[usize; 6]) -> f64 {
    if landmarks.len() < 400 {
        return -1.0;
    }

    let p1 = &landmarks[indices[0]];
    let p2 = &landmarks[indices[1]];
    let p3 = &landmarks[indices[2]];
    let p4 = &landmarks[indices[3]];
    let p5 = &landmarks[indices[4]];
    let p6 = &landmarks[indices[5]];

    let vertical1 = euclidean_distance(p2, p6);
    let vertical2 = euclidean_distance(p3, p5);
    let horizontal = euclidean_distance(p1, p4);

    if horizontal < 0.001 {
        return -1.0;
    }

    (vertical1 + vertical2) / (2.0 * horizontal)
}

#[wasm_bindgen]
pub struct EARCalculator {
    smoothing_factor: f64,
    last_ear: f64,
}

#[wasm_bindgen]
impl EARCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new(smoothing_factor: Option<f64>) -> Self {
        Self {
            smoothing_factor: smoothing_factor.unwrap_or(0.3),
            last_ear: 0.3,
        }
    }

    #[wasm_bindgen]
    pub fn calculate(&mut self, landmarks_js: JsValue) -> EARResult {
        let landmarks: Vec<Point3D> = match serde_wasm_bindgen::from_value(landmarks_js) {
            Ok(l) => l,
            Err(_) => return EARResult { left_ear: -1.0, right_ear: -1.0, avg_ear: -1.0, is_valid: false },
        };

        if landmarks.len() < 400 {
            return EARResult { left_ear: -1.0, right_ear: -1.0, avg_ear: -1.0, is_valid: false };
        }

        let left_ear = compute_single_eye_ear(&landmarks, &LEFT_EYE);
        let right_ear = compute_single_eye_ear(&landmarks, &RIGHT_EYE);

        if left_ear < 0.0 || right_ear < 0.0 {
            return EARResult { left_ear, right_ear, avg_ear: -1.0, is_valid: false };
        }

        let raw_avg = (left_ear + right_ear) / 2.0;
        let smoothed = self.smoothing_factor * raw_avg + (1.0 - self.smoothing_factor) * self.last_ear;
        self.last_ear = smoothed;

        EARResult { left_ear, right_ear, avg_ear: smoothed, is_valid: true }
    }

    /// 优化版本：直接传递12个眼睛关键点的坐标（避免序列化478个点）
    /// coords: [left_p1_x, left_p1_y, left_p1_z, left_p2_x, ..., right_p6_z] (36个f64)
    #[wasm_bindgen]
    pub fn calculate_from_coords(&mut self, coords: &[f64]) -> EARResult {
        if coords.len() < 36 {
            return EARResult { left_ear: -1.0, right_ear: -1.0, avg_ear: -1.0, is_valid: false };
        }

        let extract_point = |offset: usize| -> Point3D {
            Point3D {
                x: coords[offset],
                y: coords[offset + 1],
                z: coords[offset + 2],
            }
        };

        // 左眼6个点 (indices 0-5, coords 0-17)
        let left_points: [Point3D; 6] = [
            extract_point(0), extract_point(3), extract_point(6),
            extract_point(9), extract_point(12), extract_point(15),
        ];

        // 右眼6个点 (indices 6-11, coords 18-35)
        let right_points: [Point3D; 6] = [
            extract_point(18), extract_point(21), extract_point(24),
            extract_point(27), extract_point(30), extract_point(33),
        ];

        let compute_ear = |points: &[Point3D; 6]| -> f64 {
            let v1 = euclidean_distance(&points[1], &points[5]);
            let v2 = euclidean_distance(&points[2], &points[4]);
            let h = euclidean_distance(&points[0], &points[3]);
            if h < 0.001 { -1.0 } else { (v1 + v2) / (2.0 * h) }
        };

        let left_ear = compute_ear(&left_points);
        let right_ear = compute_ear(&right_points);

        if left_ear < 0.0 || right_ear < 0.0 {
            return EARResult { left_ear, right_ear, avg_ear: -1.0, is_valid: false };
        }

        let raw_avg = (left_ear + right_ear) / 2.0;
        let smoothed = self.smoothing_factor * raw_avg + (1.0 - self.smoothing_factor) * self.last_ear;
        self.last_ear = smoothed;

        EARResult { left_ear, right_ear, avg_ear: smoothed, is_valid: true }
    }

    #[wasm_bindgen]
    pub fn is_eye_closed(&self, ear: f64, threshold: Option<f64>) -> bool {
        let t = threshold.unwrap_or(0.2);
        ear > 0.0 && ear < t
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.last_ear = 0.3;
    }

    /// 增强版EAR计算：使用更多关键点提升精度
    /// coords 布局: [左眼16点 + 右眼16点 + 左虹膜 + 右虹膜] × 3坐标 = 102个f64
    #[wasm_bindgen]
    pub fn calculate_enhanced(&mut self, coords: &[f64]) -> EnhancedEARResult {
        if coords.len() < 102 {
            return EnhancedEARResult {
                left_ear: -1.0, right_ear: -1.0, avg_ear: -1.0,
                left_ear_multi: -1.0, right_ear_multi: -1.0,
                iris_visibility: 0.0, confidence: 0.0, is_valid: false,
            };
        }

        let extract_point = |offset: usize| -> Point3D {
            Point3D {
                x: coords[offset],
                y: coords[offset + 1],
                z: coords[offset + 2],
            }
        };

        // 提取左眼16个点 (0-47)
        let mut left_points: [Point3D; 16] = [Point3D { x: 0.0, y: 0.0, z: 0.0 }; 16];
        for i in 0..16 {
            left_points[i] = extract_point(i * 3);
        }

        // 提取右眼16个点 (48-95)
        let mut right_points: [Point3D; 16] = [Point3D { x: 0.0, y: 0.0, z: 0.0 }; 16];
        for i in 0..16 {
            right_points[i] = extract_point(48 + i * 3);
        }

        // 提取虹膜中心 (96-101)
        let left_iris = extract_point(96);
        let right_iris = extract_point(99);

        // 计算基础EAR (使用轮廓中的6个关键点)
        // 左眼: P1=0(外眼角), P2=3(上眼睑), P3=5(上眼睑), P4=8(内眼角), P5=11(下眼睑), P6=13(下眼睑)
        let left_ear = compute_ear_6pt(&left_points[0], &left_points[3], &left_points[5],
                                        &left_points[8], &left_points[11], &left_points[13]);

        // 右眼: 同样的索引映射
        let right_ear = compute_ear_6pt(&right_points[0], &right_points[3], &right_points[5],
                                         &right_points[8], &right_points[11], &right_points[13]);

        // 计算多点EAR (使用更多垂直距离的平均值)
        let left_ear_multi = compute_multi_point_ear(&left_points);
        let right_ear_multi = compute_multi_point_ear(&right_points);

        // 计算虹膜可见度 (虹膜中心到眼睑的距离比)
        let iris_visibility = compute_iris_visibility(&left_points, &left_iris, &right_points, &right_iris);

        // 综合EAR (加权平均)
        let combined_left = 0.6 * left_ear + 0.4 * left_ear_multi;
        let combined_right = 0.6 * right_ear + 0.4 * right_ear_multi;

        if left_ear < 0.0 || right_ear < 0.0 {
            return EnhancedEARResult {
                left_ear, right_ear, avg_ear: -1.0,
                left_ear_multi, right_ear_multi,
                iris_visibility, confidence: 0.0, is_valid: false,
            };
        }

        let raw_avg = (combined_left + combined_right) / 2.0;
        let smoothed = self.smoothing_factor * raw_avg + (1.0 - self.smoothing_factor) * self.last_ear;
        self.last_ear = smoothed;

        // 计算置信度 (基于左右眼一致性和虹膜可见度)
        let lr_diff = (left_ear - right_ear).abs();
        let consistency = 1.0 - (lr_diff / 0.1).min(1.0);
        let confidence = 0.7 * consistency + 0.3 * iris_visibility.min(1.0);

        EnhancedEARResult {
            left_ear, right_ear, avg_ear: smoothed,
            left_ear_multi, right_ear_multi,
            iris_visibility, confidence, is_valid: true,
        }
    }
}

fn compute_ear_6pt(p1: &Point3D, p2: &Point3D, p3: &Point3D,
                   p4: &Point3D, p5: &Point3D, p6: &Point3D) -> f64 {
    let v1 = euclidean_distance(p2, p6);
    let v2 = euclidean_distance(p3, p5);
    let h = euclidean_distance(p1, p4);
    if h < 0.001 { -1.0 } else { (v1 + v2) / (2.0 * h) }
}

fn compute_multi_point_ear(points: &[Point3D; 16]) -> f64 {
    // 使用多个垂直距离计算更稳定的EAR
    // 上眼睑点: 1,2,3,4,5,6 (索引1-6)
    // 下眼睑点: 9,10,11,12,13,14 (索引9-14)
    let mut total_vertical = 0.0;
    let mut count = 0;

    // 计算多对垂直距离
    for i in 0..6 {
        let upper_idx = 1 + i;  // 上眼睑
        let lower_idx = 9 + i;  // 下眼睑
        if upper_idx < 16 && lower_idx < 16 {
            total_vertical += euclidean_distance(&points[upper_idx], &points[lower_idx]);
            count += 1;
        }
    }

    let avg_vertical = if count > 0 { total_vertical / count as f64 } else { 0.0 };
    let horizontal = euclidean_distance(&points[0], &points[8]); // 外眼角到内眼角

    if horizontal < 0.001 { -1.0 } else { avg_vertical / horizontal }
}

fn compute_iris_visibility(left_points: &[Point3D; 16], left_iris: &Point3D,
                           right_points: &[Point3D; 16], right_iris: &Point3D) -> f64 {
    // 计算虹膜中心到上下眼睑的距离比
    // 虹膜完全可见时，距离比接近0.5；闭眼时接近0或1

    let compute_single = |points: &[Point3D; 16], iris: &Point3D| -> f64 {
        let upper_center = Point3D {
            x: (points[3].x + points[4].x) / 2.0,
            y: (points[3].y + points[4].y) / 2.0,
            z: (points[3].z + points[4].z) / 2.0,
        };
        let lower_center = Point3D {
            x: (points[11].x + points[12].x) / 2.0,
            y: (points[11].y + points[12].y) / 2.0,
            z: (points[11].z + points[12].z) / 2.0,
        };

        let to_upper = euclidean_distance(iris, &upper_center);
        let to_lower = euclidean_distance(iris, &lower_center);
        let total = to_upper + to_lower;

        if total < 0.001 { 0.0 } else {
            // 返回虹膜相对位置的对称性 (0.5最佳)
            let ratio = to_upper / total;
            1.0 - (ratio - 0.5).abs() * 2.0
        }
    };

    let left_vis = compute_single(left_points, left_iris);
    let right_vis = compute_single(right_points, right_iris);

    (left_vis + right_vis) / 2.0
}
