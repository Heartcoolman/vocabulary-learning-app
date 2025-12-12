// 权限管理 Tauri Commands
// 提供前端调用的权限管理命令接口

use crate::platform::permissions::{self, PermissionStatus, PermissionType};
use serde::{Deserialize, Serialize};

/// 权限检查响应
#[derive(Debug, Serialize)]
pub struct PermissionCheckResponse {
    /// 权限状态
    pub status: PermissionStatus,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 权限请求响应
#[derive(Debug, Serialize)]
pub struct PermissionRequestResponse {
    /// 权限状态
    pub status: PermissionStatus,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 通用操作响应
#[derive(Debug, Serialize)]
pub struct PermissionResponse {
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 检查指定权限状态
///
/// # Arguments
/// * `permission` - 权限类型 (camera, microphone, storage, notification)
///
/// # Returns
/// * `PermissionCheckResponse` - 权限检查结果
#[tauri::command]
pub fn check_permission(permission: PermissionType) -> PermissionCheckResponse {
    match permissions::check_permission(permission) {
        Ok(status) => PermissionCheckResponse {
            status,
            success: true,
            error: None,
        },
        Err(e) => PermissionCheckResponse {
            status: PermissionStatus::Unsupported,
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 请求指定权限
///
/// # Arguments
/// * `permission` - 权限类型 (camera, microphone, storage, notification)
///
/// # Returns
/// * `PermissionRequestResponse` - 权限请求结果
#[tauri::command]
pub fn request_permission(permission: PermissionType) -> PermissionRequestResponse {
    match permissions::request_permission(permission) {
        Ok(status) => PermissionRequestResponse {
            status,
            success: true,
            error: None,
        },
        Err(e) => PermissionRequestResponse {
            status: PermissionStatus::Unsupported,
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 打开应用设置页面
///
/// 当权限被永久拒绝时，引导用户到系统设置手动开启权限
///
/// # Returns
/// * `PermissionResponse` - 操作结果
#[tauri::command]
pub fn open_app_settings() -> PermissionResponse {
    match permissions::open_app_settings() {
        Ok(()) => PermissionResponse {
            success: true,
            error: None,
        },
        Err(e) => PermissionResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 检查是否应该显示权限解释
///
/// 用于判断是否需要向用户解释为什么需要这个权限
/// Android 上在用户拒绝过一次权限后返回 true
///
/// # Arguments
/// * `permission` - 权限类型
///
/// # Returns
/// * `bool` - 是否应该显示权限解释
#[tauri::command]
pub fn should_show_rationale(permission: PermissionType) -> bool {
    permissions::should_show_rationale(permission)
}

/// 检查平台是否支持原生权限请求
///
/// Android 平台支持原生权限请求
/// 桌面平台不支持，前端应该降级使用 Web API
///
/// # Returns
/// * `bool` - 是否支持原生权限
#[tauri::command]
pub fn is_native_permission_supported() -> bool {
    permissions::is_native_permission_supported()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::permissions::PermissionType;

    /// 测试检查摄像头权限命令
    /// 在桌面平台应返回 NotSupported
    #[test]
    fn test_check_permission_camera() {
        let response = check_permission(PermissionType::Camera);

        // 桌面平台返回失败（不支持原生权限）
        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
            assert!(response.error.is_some());
        }
    }

    /// 测试检查麦克风权限命令
    #[test]
    fn test_check_permission_microphone() {
        let response = check_permission(PermissionType::Microphone);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
        }
    }

    /// 测试检查存储权限命令
    #[test]
    fn test_check_permission_storage() {
        let response = check_permission(PermissionType::Storage);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
        }
    }

    /// 测试检查通知权限命令
    #[test]
    fn test_check_permission_notification() {
        let response = check_permission(PermissionType::Notification);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
        }
    }

    /// 测试请求摄像头权限命令
    #[test]
    fn test_request_permission_camera() {
        let response = request_permission(PermissionType::Camera);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
            assert!(response.error.is_some());
        }
    }

    /// 测试请求麦克风权限命令
    #[test]
    fn test_request_permission_microphone() {
        let response = request_permission(PermissionType::Microphone);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert_eq!(response.status, PermissionStatus::Unsupported);
        }
    }

    /// 测试打开应用设置命令
    #[test]
    fn test_open_app_settings() {
        let response = open_app_settings();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!response.success);
            assert!(response.error.is_some());
        }
    }

    /// 测试是否应该显示权限解释
    /// 桌面平台始终返回 false
    #[test]
    fn test_should_show_rationale() {
        let result = should_show_rationale(PermissionType::Camera);

        #[cfg(not(target_os = "android"))]
        {
            assert!(!result);
        }
    }

    /// 测试是否支持原生权限
    /// 桌面平台返回 false
    #[test]
    fn test_is_native_permission_supported() {
        let result = is_native_permission_supported();

        #[cfg(not(target_os = "android"))]
        {
            assert!(!result);
        }

        #[cfg(target_os = "android")]
        {
            assert!(result);
        }
    }

    /// 测试权限检查响应结构体序列化
    #[test]
    fn test_permission_check_response_serialize() {
        let response = PermissionCheckResponse {
            status: PermissionStatus::Unsupported,
            success: false,
            error: Some("测试错误".to_string()),
        };

        let json = serde_json::to_string(&response).expect("序列化失败");
        assert!(json.contains("unsupported"));
        assert!(json.contains("success"));
        assert!(json.contains("测试错误"));
    }

    /// 测试权限请求响应结构体序列化
    #[test]
    fn test_permission_request_response_serialize() {
        let response = PermissionRequestResponse {
            status: PermissionStatus::Granted,
            success: true,
            error: None,
        };

        let json = serde_json::to_string(&response).expect("序列化失败");
        assert!(json.contains("granted"));
        assert!(json.contains("\"success\":true"));
    }

    /// 测试通用权限响应结构体序列化
    #[test]
    fn test_permission_response_serialize() {
        let response = PermissionResponse {
            success: true,
            error: None,
        };

        let json = serde_json::to_string(&response).expect("序列化失败");
        assert!(json.contains("\"success\":true"));
    }

    /// 测试所有权限类型的检查命令
    #[test]
    fn test_check_all_permission_types() {
        let permission_types = [
            PermissionType::Camera,
            PermissionType::Microphone,
            PermissionType::Storage,
            PermissionType::Notification,
        ];

        for permission in permission_types {
            let response = check_permission(permission);

            #[cfg(not(target_os = "android"))]
            {
                assert!(
                    !response.success,
                    "Permission {:?} should not be supported on desktop",
                    permission
                );
                assert_eq!(response.status, PermissionStatus::Unsupported);
            }
        }
    }

    /// 测试所有权限类型的请求命令
    #[test]
    fn test_request_all_permission_types() {
        let permission_types = [
            PermissionType::Camera,
            PermissionType::Microphone,
            PermissionType::Storage,
            PermissionType::Notification,
        ];

        for permission in permission_types {
            let response = request_permission(permission);

            #[cfg(not(target_os = "android"))]
            {
                assert!(
                    !response.success,
                    "Permission {:?} should not be supported on desktop",
                    permission
                );
                assert_eq!(response.status, PermissionStatus::Unsupported);
            }
        }
    }
}
