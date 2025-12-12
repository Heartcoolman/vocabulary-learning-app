// Platform 模块 - 平台特定功能
// 用于处理不同平台 (iOS, Android, Windows, macOS, Linux) 的差异

pub mod fatigue;
pub mod permissions;
pub mod tts;

/// 获取当前平台名称
pub fn get_platform() -> &'static str {
    #[cfg(target_os = "android")]
    return "android";

    #[cfg(target_os = "ios")]
    return "ios";

    #[cfg(target_os = "windows")]
    return "windows";

    #[cfg(target_os = "macos")]
    return "macos";

    #[cfg(target_os = "linux")]
    return "linux";

    #[cfg(not(any(
        target_os = "android",
        target_os = "ios",
        target_os = "windows",
        target_os = "macos",
        target_os = "linux"
    )))]
    return "unknown";
}

/// 检查是否为移动平台
pub fn is_mobile() -> bool {
    matches!(get_platform(), "android" | "ios")
}

/// 检查是否为桌面平台
pub fn is_desktop() -> bool {
    matches!(get_platform(), "windows" | "macos" | "linux")
}
