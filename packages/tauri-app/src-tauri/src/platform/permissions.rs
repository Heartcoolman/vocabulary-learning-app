// 权限处理平台模块
// 提供跨平台的权限请求功能
//
// Android: 通过 JNI 调用原生权限 API
// Desktop: 返回不支持，让前端使用 Web API

use serde::{Deserialize, Serialize};

/// 权限类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionType {
    /// 摄像头权限
    Camera,
    /// 麦克风权限
    Microphone,
    /// 存储权限
    Storage,
    /// 通知权限
    Notification,
}

impl std::fmt::Display for PermissionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionType::Camera => write!(f, "camera"),
            PermissionType::Microphone => write!(f, "microphone"),
            PermissionType::Storage => write!(f, "storage"),
            PermissionType::Notification => write!(f, "notification"),
        }
    }
}

/// 权限状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    /// 未请求
    NotRequested,
    /// 已授权
    Granted,
    /// 已拒绝
    Denied,
    /// 需要设置中打开
    NeedSettings,
    /// 不支持
    Unsupported,
}

/// 权限错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionError {
    /// 平台不支持
    NotSupported,
    /// 请求失败
    RequestFailed(String),
    /// 无效的权限类型
    InvalidPermissionType,
}

impl std::fmt::Display for PermissionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionError::NotSupported => write!(f, "平台不支持原生权限请求"),
            PermissionError::RequestFailed(msg) => write!(f, "权限请求失败: {}", msg),
            PermissionError::InvalidPermissionType => write!(f, "无效的权限类型"),
        }
    }
}

impl std::error::Error for PermissionError {}

// ============================================
// Android 平台实现
// ============================================

#[cfg(target_os = "android")]
pub mod android {
    use super::*;

    /// 检查权限状态
    ///
    /// 注意：实际实现需要在 Kotlin 侧完成
    /// 步骤：
    /// 1. 创建 Kotlin 类 PermissionHelper
    /// 2. 使用 ActivityCompat.checkSelfPermission
    /// 3. 通过 JNI 桥接到 Rust
    pub fn check_permission(
        permission: PermissionType,
    ) -> Result<PermissionStatus, PermissionError> {
        // TODO: 实现 JNI 调用
        // let env = ...;
        // let class = env.find_class("com/danci/app/PermissionHelper")?;
        // let result = env.call_static_method(class, "checkPermission", ...)?;

        log::info!(
            "Android PermissionHelper.checkPermission({}) (待实现)",
            permission
        );

        // 暂时返回不支持，让前端降级到 Web 权限请求
        Err(PermissionError::NotSupported)
    }

    /// 请求权限
    ///
    /// 注意：实际实现需要在 Kotlin 侧完成
    /// 步骤：
    /// 1. 使用 ActivityCompat.requestPermissions
    /// 2. 在 Activity.onRequestPermissionsResult 中处理结果
    /// 3. 通过 JNI 回调到 Rust
    pub fn request_permission(
        permission: PermissionType,
    ) -> Result<PermissionStatus, PermissionError> {
        // TODO: 实现 JNI 调用
        log::info!(
            "Android PermissionHelper.requestPermission({}) (待实现)",
            permission
        );

        // 暂时返回不支持
        Err(PermissionError::NotSupported)
    }

    /// 打开应用设置页面
    ///
    /// 当权限被永久拒绝时，引导用户手动开启
    pub fn open_app_settings() -> Result<(), PermissionError> {
        // TODO: 实现 JNI 调用
        // Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        log::info!("Android PermissionHelper.openAppSettings() (待实现)");

        Err(PermissionError::NotSupported)
    }

    /// 检查是否应该显示权限解释
    ///
    /// 用于判断是否需要向用户解释为什么需要这个权限
    pub fn should_show_rationale(permission: PermissionType) -> bool {
        // TODO: 实现 JNI 调用
        // ActivityCompat.shouldShowRequestPermissionRationale
        log::info!(
            "Android PermissionHelper.shouldShowRationale({}) (待实现)",
            permission
        );

        false
    }
}

// ============================================
// 桌面平台实现
// ============================================

#[cfg(not(target_os = "android"))]
pub mod desktop {
    use super::*;

    /// 桌面平台不支持原生权限请求
    /// 前端应该使用 Web API (navigator.mediaDevices.getUserMedia)
    pub fn check_permission(
        _permission: PermissionType,
    ) -> Result<PermissionStatus, PermissionError> {
        Err(PermissionError::NotSupported)
    }

    pub fn request_permission(
        _permission: PermissionType,
    ) -> Result<PermissionStatus, PermissionError> {
        Err(PermissionError::NotSupported)
    }

    pub fn open_app_settings() -> Result<(), PermissionError> {
        Err(PermissionError::NotSupported)
    }

    pub fn should_show_rationale(_permission: PermissionType) -> bool {
        false
    }
}

// ============================================
// 统一接口
// ============================================

/// 检查权限状态
pub fn check_permission(permission: PermissionType) -> Result<PermissionStatus, PermissionError> {
    #[cfg(target_os = "android")]
    return android::check_permission(permission);

    #[cfg(not(target_os = "android"))]
    return desktop::check_permission(permission);
}

/// 请求权限
pub fn request_permission(permission: PermissionType) -> Result<PermissionStatus, PermissionError> {
    #[cfg(target_os = "android")]
    return android::request_permission(permission);

    #[cfg(not(target_os = "android"))]
    return desktop::request_permission(permission);
}

/// 打开应用设置
pub fn open_app_settings() -> Result<(), PermissionError> {
    #[cfg(target_os = "android")]
    return android::open_app_settings();

    #[cfg(not(target_os = "android"))]
    return desktop::open_app_settings();
}

/// 检查是否应该显示权限解释
pub fn should_show_rationale(permission: PermissionType) -> bool {
    #[cfg(target_os = "android")]
    return android::should_show_rationale(permission);

    #[cfg(not(target_os = "android"))]
    return desktop::should_show_rationale(permission);
}

/// 检查平台是否支持原生权限请求
pub fn is_native_permission_supported() -> bool {
    cfg!(target_os = "android")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_type_display() {
        assert_eq!(PermissionType::Camera.to_string(), "camera");
        assert_eq!(PermissionType::Microphone.to_string(), "microphone");
    }

    #[test]
    fn test_permission_error_display() {
        let err = PermissionError::NotSupported;
        assert!(err.to_string().contains("不支持"));
    }
}
