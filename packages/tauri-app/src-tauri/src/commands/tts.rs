// TTS Tauri Commands
// 提供前端调用的 TTS 命令接口

use crate::platform::tts::{self, TtsConfig, TtsError, TtsStatus};
use serde::{Deserialize, Serialize};

/// TTS 播放请求
#[derive(Debug, Deserialize)]
pub struct SpeakRequest {
    /// 要播放的文本
    pub text: String,
    /// 语言代码 (可选，默认 "en-US")
    pub language: Option<String>,
    /// 语速 (可选，默认 0.9)
    pub rate: Option<f32>,
    /// 音调 (可选，默认 1.0)
    pub pitch: Option<f32>,
}

/// TTS 播放响应
#[derive(Debug, Serialize)]
pub struct SpeakResponse {
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// TTS 状态响应
#[derive(Debug, Serialize)]
pub struct TtsStatusResponse {
    /// 是否可用
    pub available: bool,
    /// 是否正在播放
    pub speaking: bool,
    /// 支持的语言列表
    pub supported_languages: Vec<String>,
    /// 平台信息
    pub platform: String,
    /// 错误信息
    pub error: Option<String>,
}

/// 播放文本
///
/// # Arguments
/// * `request` - 播放请求参数
///
/// # Returns
/// * `SpeakResponse` - 播放结果
#[tauri::command]
pub fn tts_speak(request: SpeakRequest) -> SpeakResponse {
    let config = TtsConfig {
        language: request.language.unwrap_or_else(|| "en-US".to_string()),
        rate: request.rate.unwrap_or(0.9),
        pitch: request.pitch.unwrap_or(1.0),
    };

    match tts::speak(&request.text, Some(config)) {
        Ok(()) => SpeakResponse {
            success: true,
            error: None,
        },
        Err(e) => SpeakResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 停止播放
///
/// # Returns
/// * `SpeakResponse` - 操作结果
#[tauri::command]
pub fn tts_stop() -> SpeakResponse {
    match tts::stop() {
        Ok(()) => SpeakResponse {
            success: true,
            error: None,
        },
        Err(e) => SpeakResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 获取 TTS 状态
///
/// # Returns
/// * `TtsStatusResponse` - TTS 状态信息
#[tauri::command]
pub fn tts_get_status() -> TtsStatusResponse {
    let status = tts::get_status();
    let platform = crate::platform::get_platform();

    TtsStatusResponse {
        available: status.available,
        speaking: status.speaking,
        supported_languages: status.supported_languages,
        platform: platform.to_string(),
        error: status.error,
    }
}

/// 初始化 TTS
///
/// # Returns
/// * `SpeakResponse` - 初始化结果
#[tauri::command]
pub fn tts_initialize() -> SpeakResponse {
    match tts::initialize() {
        Ok(()) => SpeakResponse {
            success: true,
            error: None,
        },
        Err(e) => SpeakResponse {
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// 检查语言是否支持
///
/// # Arguments
/// * `language` - 语言代码
///
/// # Returns
/// * `bool` - 是否支持
#[tauri::command]
pub fn tts_is_language_supported(language: String) -> bool {
    tts::is_language_supported(&language)
}
