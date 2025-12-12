// 视觉疲劳检测 Tauri Commands
// 提供前端调用的视觉疲劳检测命令接口

use crate::platform::fatigue::{
    self, DetectionState, FatigueDetectionConfig, FatigueMetrics, PlatformCapability,
};
use serde::{Deserialize, Serialize};

/// 初始化请求
#[derive(Debug, Deserialize)]
pub struct FatigueInitRequest {
    /// 检测间隔 (毫秒)
    pub detection_interval_ms: Option<u32>,
    /// 是否启用 Blendshapes
    pub enable_blendshapes: Option<bool>,
    /// 是否使用 GPU
    pub use_gpu: Option<bool>,
}

/// 通用响应
#[derive(Debug, Serialize)]
pub struct FatigueResponse {
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 初始化视觉疲劳检测器
///
/// 注意：桌面平台不支持原生检测，会返回失败
/// 前端应该在收到失败后降级到 Web MediaPipe
#[tauri::command]
pub fn fatigue_initialize(request: Option<FatigueInitRequest>) -> FatigueResponse {
    let config = request.map(|r| FatigueDetectionConfig {
        detection_interval_ms: r.detection_interval_ms.unwrap_or(200),
        enable_blendshapes: r.enable_blendshapes.unwrap_or(true),
        use_gpu: r.use_gpu.unwrap_or(false),
    });

    match fatigue::initialize(config) {
        Ok(()) => FatigueResponse {
            success: true,
            error: None,
        },
        Err(e) => FatigueResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 开始检测
#[tauri::command]
pub fn fatigue_start_detection() -> FatigueResponse {
    match fatigue::start_detection() {
        Ok(()) => FatigueResponse {
            success: true,
            error: None,
        },
        Err(e) => FatigueResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 停止检测
#[tauri::command]
pub fn fatigue_stop_detection() -> FatigueResponse {
    match fatigue::stop_detection() {
        Ok(()) => FatigueResponse {
            success: true,
            error: None,
        },
        Err(e) => FatigueResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 获取最新疲劳指标
#[tauri::command]
pub fn fatigue_get_metrics() -> Option<FatigueMetrics> {
    fatigue::get_latest_metrics()
}

/// 获取平台能力信息
#[tauri::command]
pub fn fatigue_get_capability() -> PlatformCapability {
    fatigue::get_capability()
}

/// 获取检测状态
#[tauri::command]
pub fn fatigue_get_state() -> DetectionState {
    fatigue::get_state()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试疲劳检测初始化命令
    /// 桌面平台应返回失败（不支持原生检测）
    #[test]
    fn test_fatigue_initialize_no_config() {
        let response = fatigue_initialize(None);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert!(response.error.is_some());
            assert!(response.error.as_ref().unwrap().contains("不支持"));
        }
    }

    /// 测试带配置的疲劳检测初始化
    #[test]
    fn test_fatigue_initialize_with_config() {
        let request = FatigueInitRequest {
            detection_interval_ms: Some(100),
            enable_blendshapes: Some(true),
            use_gpu: Some(false),
        };

        let response = fatigue_initialize(Some(request));

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert!(response.error.is_some());
        }
    }

    /// 测试带部分配置的初始化
    #[test]
    fn test_fatigue_initialize_partial_config() {
        let request = FatigueInitRequest {
            detection_interval_ms: Some(500),
            enable_blendshapes: None,
            use_gpu: None,
        };

        let response = fatigue_initialize(Some(request));

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
        }
    }

    /// 测试开始检测命令
    /// 桌面平台应返回失败
    #[test]
    fn test_fatigue_start_detection() {
        let response = fatigue_start_detection();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert!(response.error.is_some());
        }
    }

    /// 测试停止检测命令
    /// 桌面平台应返回成功（安全停止）
    #[test]
    fn test_fatigue_stop_detection() {
        let response = fatigue_stop_detection();

        #[cfg(not(target_os = "android"))]
        {
            // 桌面平台 stop_detection 返回 Ok
            assert!(response.success);
            assert!(response.error.is_none());
        }
    }

    /// 测试获取疲劳指标命令
    /// 桌面平台应返回 None
    #[test]
    fn test_fatigue_get_metrics() {
        let metrics = fatigue_get_metrics();

        #[cfg(not(target_os = "android"))]
        {
            assert!(metrics.is_none());
        }
    }

    /// 测试获取平台能力命令
    #[test]
    fn test_fatigue_get_capability() {
        let capability = fatigue_get_capability();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!capability.supported);
            assert_eq!(capability.platform, "desktop");
            assert!(capability.unsupported_reason.is_some());
            assert_eq!(capability.landmark_count, 0);
            assert!(!capability.has_blendshapes);
        }
    }

    /// 测试获取检测状态命令
    #[test]
    fn test_fatigue_get_state() {
        let state = fatigue_get_state();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!state.is_detecting);
            assert!(!state.is_initialized);
            assert!(!state.is_supported);
            assert_eq!(state.current_fps, 0.0);
            assert!(state.error.is_some());
        }
    }

    /// 测试初始化请求反序列化
    #[test]
    fn test_fatigue_init_request_deserialize() {
        let json = r#"{
            "detection_interval_ms": 200,
            "enable_blendshapes": true,
            "use_gpu": false
        }"#;

        let request: FatigueInitRequest = serde_json::from_str(json).expect("反序列化失败");

        assert_eq!(request.detection_interval_ms, Some(200));
        assert_eq!(request.enable_blendshapes, Some(true));
        assert_eq!(request.use_gpu, Some(false));
    }

    /// 测试部分字段的初始化请求反序列化
    #[test]
    fn test_fatigue_init_request_partial_deserialize() {
        let json = r#"{"detection_interval_ms": 100}"#;

        let request: FatigueInitRequest = serde_json::from_str(json).expect("反序列化失败");

        assert_eq!(request.detection_interval_ms, Some(100));
        assert!(request.enable_blendshapes.is_none());
        assert!(request.use_gpu.is_none());
    }

    /// 测试空配置的初始化请求反序列化
    #[test]
    fn test_fatigue_init_request_empty_deserialize() {
        let json = r#"{}"#;

        let request: FatigueInitRequest = serde_json::from_str(json).expect("反序列化失败");

        assert!(request.detection_interval_ms.is_none());
        assert!(request.enable_blendshapes.is_none());
        assert!(request.use_gpu.is_none());
    }

    /// 测试 FatigueResponse 序列化
    #[test]
    fn test_fatigue_response_serialize() {
        let response = FatigueResponse {
            success: true,
            error: None,
        };

        let json = serde_json::to_string(&response).expect("序列化失败");
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"error\":null"));
    }

    /// 测试带错误的 FatigueResponse 序列化
    #[test]
    fn test_fatigue_response_with_error_serialize() {
        let response = FatigueResponse {
            success: false,
            error: Some("测试错误信息".to_string()),
        };

        let json = serde_json::to_string(&response).expect("序列化失败");
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("测试错误信息"));
    }

    /// 测试 PlatformCapability 序列化
    #[test]
    fn test_platform_capability_serialize() {
        let capability = fatigue_get_capability();
        let json = serde_json::to_string(&capability).expect("序列化失败");

        assert!(json.contains("supported"));
        assert!(json.contains("platform"));
        assert!(json.contains("landmark_count"));
    }

    /// 测试 DetectionState 序列化
    #[test]
    fn test_detection_state_serialize() {
        let state = fatigue_get_state();
        let json = serde_json::to_string(&state).expect("序列化失败");

        assert!(json.contains("is_detecting"));
        assert!(json.contains("is_initialized"));
        assert!(json.contains("is_supported"));
        assert!(json.contains("current_fps"));
    }

    /// 测试检测流程 - 初始化 -> 开始 -> 停止
    #[test]
    fn test_fatigue_detection_flow() {
        // 初始化
        let init_response = fatigue_initialize(None);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!init_response.success);
        }

        // 尝试开始检测
        let start_response = fatigue_start_detection();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!start_response.success);
        }

        // 停止检测（应该总是成功）
        let stop_response = fatigue_stop_detection();

        #[cfg(not(target_os = "android"))]
        {
            assert!(stop_response.success);
        }

        // 验证状态
        let state = fatigue_get_state();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!state.is_detecting);
            assert!(!state.is_initialized);
        }
    }

    /// 测试多次停止检测（幂等性）
    #[test]
    fn test_fatigue_stop_detection_idempotent() {
        for _ in 0..3 {
            let response = fatigue_stop_detection();

            #[cfg(not(target_os = "android"))]
            {
                assert!(response.success);
            }
        }
    }

    /// 测试 FatigueMetrics 默认值
    #[test]
    fn test_fatigue_metrics_default() {
        let metrics = FatigueMetrics::default();

        assert_eq!(metrics.ear, 0.0);
        assert_eq!(metrics.perclos, 0.0);
        assert_eq!(metrics.blink_rate, 0.0);
        assert!(!metrics.yawn_detected);
        assert_eq!(metrics.head_pitch, 0.0);
        assert_eq!(metrics.head_yaw, 0.0);
        assert_eq!(metrics.fatigue_score, 0.0);
        assert_eq!(metrics.fatigue_level, 0);
        assert_eq!(metrics.timestamp, 0);
    }
}
