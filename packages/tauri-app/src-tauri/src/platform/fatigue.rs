// 视觉疲劳检测平台模块
// 提供跨平台的视觉疲劳检测功能
//
// Android: 通过 Kotlin 调用 MediaPipe Android SDK
// Desktop: 返回不支持，让前端使用 Web MediaPipe

use serde::{Deserialize, Serialize};

/// 疲劳检测指标
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FatigueMetrics {
    /// EAR (Eye Aspect Ratio) 眼睛纵横比
    pub ear: f64,
    /// PERCLOS (眼睛闭合时间百分比)
    pub perclos: f64,
    /// 眨眼频率 (次/分钟)
    pub blink_rate: f64,
    /// 打哈欠检测
    pub yawn_detected: bool,
    /// 头部姿态 (俯仰角)
    pub head_pitch: f64,
    /// 头部姿态 (偏航角)
    pub head_yaw: f64,
    /// 综合疲劳评分 (0-100)
    pub fatigue_score: f64,
    /// 疲劳等级 (0-4: 清醒、轻度、中度、重度、危险)
    pub fatigue_level: u8,
    /// 时间戳
    pub timestamp: i64,
}

/// 检测配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FatigueDetectionConfig {
    /// 检测间隔 (毫秒)
    pub detection_interval_ms: u32,
    /// 是否启用 Blendshapes
    pub enable_blendshapes: bool,
    /// 是否使用 GPU
    pub use_gpu: bool,
}

impl Default for FatigueDetectionConfig {
    fn default() -> Self {
        Self {
            detection_interval_ms: 200, // 5 FPS
            enable_blendshapes: true,
            use_gpu: false,
        }
    }
}

/// 平台能力信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformCapability {
    /// 是否支持
    pub supported: bool,
    /// 面部关键点数量
    pub landmark_count: u32,
    /// 是否支持 Blendshapes
    pub has_blendshapes: bool,
    /// Blendshapes 数量
    pub blendshape_count: u32,
    /// 平台标识
    pub platform: String,
    /// 不支持的原因
    pub unsupported_reason: Option<String>,
}

/// 检测状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionState {
    /// 是否正在检测
    pub is_detecting: bool,
    /// 是否已初始化
    pub is_initialized: bool,
    /// 是否支持
    pub is_supported: bool,
    /// 当前 FPS
    pub current_fps: f32,
    /// 错误信息
    pub error: Option<String>,
}

/// 疲劳检测错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FatigueError {
    /// 平台不支持
    NotSupported,
    /// 初始化失败
    InitFailed(String),
    /// 相机访问失败
    CameraAccessDenied,
    /// 检测失败
    DetectionFailed(String),
}

impl std::fmt::Display for FatigueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FatigueError::NotSupported => write!(f, "平台不支持视觉疲劳检测"),
            FatigueError::InitFailed(msg) => write!(f, "初始化失败: {}", msg),
            FatigueError::CameraAccessDenied => write!(f, "相机访问被拒绝"),
            FatigueError::DetectionFailed(msg) => write!(f, "检测失败: {}", msg),
        }
    }
}

impl std::error::Error for FatigueError {}

// ============================================
// Android 平台实现
// ============================================

#[cfg(target_os = "android")]
pub mod android {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// Android 检测器状态
    static IS_INITIALIZED: AtomicBool = AtomicBool::new(false);
    static IS_DETECTING: AtomicBool = AtomicBool::new(false);

    /// 初始化 Android 疲劳检测器
    ///
    /// 注意：实际实现需要在 Kotlin 侧完成
    /// 步骤：
    /// 1. 创建 Kotlin 类 FatigueDetector
    /// 2. 使用 MediaPipe FaceLandmarker API
    /// 3. 通过 JNI 桥接到 Rust
    pub fn initialize(_config: &FatigueDetectionConfig) -> Result<(), FatigueError> {
        // TODO: 实现 JNI 调用
        // let env = ...;
        // let class = env.find_class("com/danci/app/fatigue/FatigueDetector")?;
        // let instance = env.new_object(class, ...)?;

        log::info!("Android FatigueDetector 初始化 (待实现)");

        // 暂时返回不支持
        Err(FatigueError::NotSupported)
    }

    /// 开始检测
    pub fn start_detection() -> Result<(), FatigueError> {
        if !IS_INITIALIZED.load(Ordering::SeqCst) {
            return Err(FatigueError::InitFailed("检测器未初始化".to_string()));
        }

        IS_DETECTING.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// 停止检测
    pub fn stop_detection() -> Result<(), FatigueError> {
        IS_DETECTING.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// 获取最新指标
    pub fn get_latest_metrics() -> Option<FatigueMetrics> {
        // TODO: 从 Kotlin 侧获取最新检测结果
        None
    }

    /// 获取平台能力
    pub fn get_capability() -> PlatformCapability {
        PlatformCapability {
            supported: false,    // 暂时返回不支持
            landmark_count: 478, // MediaPipe Android SDK 支持 478 个关键点
            has_blendshapes: true,
            blendshape_count: 52, // 完整的 52 个 Blendshapes
            platform: "android".to_string(),
            unsupported_reason: Some("Android MediaPipe SDK 原生实现开发中".to_string()),
        }
    }

    /// 获取检测状态
    pub fn get_state() -> DetectionState {
        DetectionState {
            is_detecting: IS_DETECTING.load(Ordering::SeqCst),
            is_initialized: IS_INITIALIZED.load(Ordering::SeqCst),
            is_supported: false,
            current_fps: 0.0,
            error: Some("Android 原生实现开发中".to_string()),
        }
    }
}

// ============================================
// 桌面平台实现
// ============================================

#[cfg(not(target_os = "android"))]
pub mod desktop {
    use super::*;

    pub fn initialize(_config: &FatigueDetectionConfig) -> Result<(), FatigueError> {
        Err(FatigueError::NotSupported)
    }

    pub fn start_detection() -> Result<(), FatigueError> {
        Err(FatigueError::NotSupported)
    }

    pub fn stop_detection() -> Result<(), FatigueError> {
        Ok(())
    }

    pub fn get_latest_metrics() -> Option<FatigueMetrics> {
        None
    }

    pub fn get_capability() -> PlatformCapability {
        PlatformCapability {
            supported: false,
            landmark_count: 0,
            has_blendshapes: false,
            blendshape_count: 0,
            platform: "desktop".to_string(),
            unsupported_reason: Some("桌面平台请使用 Web MediaPipe".to_string()),
        }
    }

    pub fn get_state() -> DetectionState {
        DetectionState {
            is_detecting: false,
            is_initialized: false,
            is_supported: false,
            current_fps: 0.0,
            error: Some("桌面平台不支持原生疲劳检测".to_string()),
        }
    }
}

// ============================================
// 统一接口
// ============================================

/// 初始化疲劳检测器
pub fn initialize(config: Option<FatigueDetectionConfig>) -> Result<(), FatigueError> {
    let config = config.unwrap_or_default();

    #[cfg(target_os = "android")]
    return android::initialize(&config);

    #[cfg(not(target_os = "android"))]
    return desktop::initialize(&config);
}

/// 开始检测
pub fn start_detection() -> Result<(), FatigueError> {
    #[cfg(target_os = "android")]
    return android::start_detection();

    #[cfg(not(target_os = "android"))]
    return desktop::start_detection();
}

/// 停止检测
pub fn stop_detection() -> Result<(), FatigueError> {
    #[cfg(target_os = "android")]
    return android::stop_detection();

    #[cfg(not(target_os = "android"))]
    return desktop::stop_detection();
}

/// 获取最新指标
pub fn get_latest_metrics() -> Option<FatigueMetrics> {
    #[cfg(target_os = "android")]
    return android::get_latest_metrics();

    #[cfg(not(target_os = "android"))]
    return desktop::get_latest_metrics();
}

/// 获取平台能力
pub fn get_capability() -> PlatformCapability {
    #[cfg(target_os = "android")]
    return android::get_capability();

    #[cfg(not(target_os = "android"))]
    return desktop::get_capability();
}

/// 获取检测状态
pub fn get_state() -> DetectionState {
    #[cfg(target_os = "android")]
    return android::get_state();

    #[cfg(not(target_os = "android"))]
    return desktop::get_state();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = FatigueDetectionConfig::default();
        assert_eq!(config.detection_interval_ms, 200);
        assert!(config.enable_blendshapes);
    }

    #[test]
    fn test_fatigue_error_display() {
        let err = FatigueError::NotSupported;
        assert!(err.to_string().contains("不支持"));
    }
}
