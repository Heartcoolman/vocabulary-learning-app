// TTS (Text-to-Speech) 平台模块
// 提供跨平台的文本转语音功能
//
// Android: 通过 JNI 调用 Android TextToSpeech API
// Desktop: 返回不支持，让前端使用 Web Speech API

use serde::{Deserialize, Serialize};

/// TTS 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsConfig {
    /// 语言代码 (如 "en-US", "zh-CN")
    pub language: String,
    /// 语速 (0.5 - 2.0, 1.0 为正常)
    pub rate: f32,
    /// 音调 (0.5 - 2.0, 1.0 为正常)
    pub pitch: f32,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            language: "en-US".to_string(),
            rate: 0.9, // 稍慢一点，便于学习
            pitch: 1.0,
        }
    }
}

/// TTS 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsStatus {
    /// 是否可用
    pub available: bool,
    /// 是否正在播放
    pub speaking: bool,
    /// 支持的语言列表
    pub supported_languages: Vec<String>,
    /// 错误信息
    pub error: Option<String>,
}

/// TTS 错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TtsError {
    /// 平台不支持
    NotSupported,
    /// 初始化失败
    InitFailed(String),
    /// 语言不支持
    LanguageNotSupported(String),
    /// 播放失败
    SpeakFailed(String),
    /// 被取消
    Cancelled,
}

impl std::fmt::Display for TtsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TtsError::NotSupported => write!(f, "TTS 不支持当前平台"),
            TtsError::InitFailed(msg) => write!(f, "TTS 初始化失败: {}", msg),
            TtsError::LanguageNotSupported(lang) => write!(f, "不支持的语言: {}", lang),
            TtsError::SpeakFailed(msg) => write!(f, "TTS 播放失败: {}", msg),
            TtsError::Cancelled => write!(f, "TTS 已取消"),
        }
    }
}

impl std::error::Error for TtsError {}

// ============================================
// Android 平台实现
// ============================================

#[cfg(target_os = "android")]
pub mod android {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// Android TTS 状态
    static TTS_INITIALIZED: AtomicBool = AtomicBool::new(false);
    static TTS_SPEAKING: AtomicBool = AtomicBool::new(false);

    /// 初始化 Android TTS
    ///
    /// 注意：实际的 JNI 调用需要在 Kotlin/Java 侧实现
    /// 这里只是定义接口，真正的实现需要通过 Tauri 的 Android 插件机制
    pub fn initialize() -> Result<(), TtsError> {
        // TODO: 实际实现需要通过 JNI 调用 Android TextToSpeech
        // 目前返回成功，让前端可以尝试使用
        TTS_INITIALIZED.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// 播放文本
    pub fn speak(text: &str, config: &TtsConfig) -> Result<(), TtsError> {
        if !TTS_INITIALIZED.load(Ordering::SeqCst) {
            initialize()?;
        }

        TTS_SPEAKING.store(true, Ordering::SeqCst);

        // TODO: 实际实现需要通过 JNI 调用
        // android.speech.tts.TextToSpeech.speak()

        log::info!(
            "Android TTS speak: text='{}', lang='{}', rate={}",
            text,
            config.language,
            config.rate
        );

        // 模拟播放完成
        TTS_SPEAKING.store(false, Ordering::SeqCst);

        Ok(())
    }

    /// 停止播放
    pub fn stop() -> Result<(), TtsError> {
        TTS_SPEAKING.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// 获取 TTS 状态
    pub fn get_status() -> TtsStatus {
        TtsStatus {
            available: TTS_INITIALIZED.load(Ordering::SeqCst),
            speaking: TTS_SPEAKING.load(Ordering::SeqCst),
            supported_languages: vec![
                "en-US".to_string(),
                "en-GB".to_string(),
                "zh-CN".to_string(),
                "zh-TW".to_string(),
            ],
            error: None,
        }
    }

    /// 检查语言是否支持
    pub fn is_language_supported(language: &str) -> bool {
        let supported = ["en-US", "en-GB", "zh-CN", "zh-TW", "ja-JP", "ko-KR"];
        supported.contains(&language)
    }
}

// ============================================
// 桌面平台实现 (使用前端 Web Speech API)
// ============================================

#[cfg(not(target_os = "android"))]
pub mod desktop {
    use super::*;

    /// 桌面平台不提供原生 TTS，返回不支持状态
    /// 让前端使用 Web Speech API
    pub fn initialize() -> Result<(), TtsError> {
        Err(TtsError::NotSupported)
    }

    pub fn speak(_text: &str, _config: &TtsConfig) -> Result<(), TtsError> {
        Err(TtsError::NotSupported)
    }

    pub fn stop() -> Result<(), TtsError> {
        Ok(())
    }

    pub fn get_status() -> TtsStatus {
        TtsStatus {
            available: false,
            speaking: false,
            supported_languages: vec![],
            error: Some("桌面平台请使用 Web Speech API".to_string()),
        }
    }

    pub fn is_language_supported(_language: &str) -> bool {
        false
    }
}

// ============================================
// 统一接口
// ============================================

/// 初始化 TTS
pub fn initialize() -> Result<(), TtsError> {
    #[cfg(target_os = "android")]
    return android::initialize();

    #[cfg(not(target_os = "android"))]
    return desktop::initialize();
}

/// 播放文本
pub fn speak(text: &str, config: Option<TtsConfig>) -> Result<(), TtsError> {
    let config = config.unwrap_or_default();

    #[cfg(target_os = "android")]
    return android::speak(text, &config);

    #[cfg(not(target_os = "android"))]
    return desktop::speak(text, &config);
}

/// 停止播放
pub fn stop() -> Result<(), TtsError> {
    #[cfg(target_os = "android")]
    return android::stop();

    #[cfg(not(target_os = "android"))]
    return desktop::stop();
}

/// 获取 TTS 状态
pub fn get_status() -> TtsStatus {
    #[cfg(target_os = "android")]
    return android::get_status();

    #[cfg(not(target_os = "android"))]
    return desktop::get_status();
}

/// 检查语言是否支持
pub fn is_language_supported(language: &str) -> bool {
    #[cfg(target_os = "android")]
    return android::is_language_supported(language);

    #[cfg(not(target_os = "android"))]
    return desktop::is_language_supported(language);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = TtsConfig::default();
        assert_eq!(config.language, "en-US");
        assert!(config.rate > 0.0);
        assert!(config.pitch > 0.0);
    }

    #[test]
    fn test_tts_error_display() {
        let err = TtsError::NotSupported;
        assert!(err.to_string().contains("不支持"));
    }
}
