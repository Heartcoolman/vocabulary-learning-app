/**
 * TTS (Text-to-Speech) 服务
 *
 * 提供跨平台的文本转语音功能：
 * - Tauri 移动端：使用原生 TTS API
 * - Web 端：使用 Web Speech API
 *
 * 自动检测运行环境并选择合适的实现
 */

import { isTauri } from '../utils/platform';

// ===================== 类型定义 =====================

/**
 * TTS 配置选项
 */
export interface TtsConfig {
  /** 语言代码 (如 "en-US", "zh-CN") */
  language?: string;
  /** 语速 (0.5 - 2.0, 1.0 为正常) */
  rate?: number;
  /** 音调 (0.5 - 2.0, 1.0 为正常) */
  pitch?: number;
}

/**
 * TTS 状态
 */
export interface TtsStatus {
  /** 是否可用 */
  available: boolean;
  /** 是否正在播放 */
  speaking: boolean;
  /** 支持的语言列表 */
  supportedLanguages: string[];
  /** 平台信息 */
  platform: string;
  /** 错误信息 */
  error?: string;
}

/**
 * TTS 服务接口
 */
export interface ITtsService {
  /** 播放文本 */
  speak(text: string, config?: TtsConfig): Promise<void>;
  /** 停止播放 */
  stop(): Promise<void>;
  /** 获取状态 */
  getStatus(): Promise<TtsStatus>;
  /** 初始化 */
  initialize(): Promise<boolean>;
  /** 检查语言是否支持 */
  isLanguageSupported(language: string): Promise<boolean>;
}

// ===================== Tauri TTS 实现 =====================

/**
 * Tauri 原生 TTS 服务
 * 通过 invoke 调用 Rust 命令
 */
class TauriTtsService implements ITtsService {
  private invokePromise: Promise<typeof import('@tauri-apps/api/core').invoke> | null = null;
  private initialized = false;

  private async getInvoke() {
    if (!this.invokePromise) {
      this.invokePromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const module = (await import(/* @vite-ignore */ '@tauri-apps/api/core')) as any;
        return module.invoke;
      })();
    }
    return this.invokePromise;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      const invoke = await this.getInvoke();
      const result = await invoke<{ success: boolean; error?: string }>('tts_initialize');

      if (result.success) {
        this.initialized = true;
        return true;
      }

      // 如果原生 TTS 不支持，返回 false 让调用者使用 Web Speech API
      console.log('[TauriTts] 原生 TTS 不可用:', result.error);
      return false;
    } catch (error) {
      console.warn('[TauriTts] 初始化失败:', error);
      return false;
    }
  }

  async speak(text: string, config?: TtsConfig): Promise<void> {
    const invoke = await this.getInvoke();
    const result = await invoke<{ success: boolean; error?: string }>('tts_speak', {
      request: {
        text,
        language: config?.language,
        rate: config?.rate,
        pitch: config?.pitch,
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'TTS 播放失败');
    }
  }

  async stop(): Promise<void> {
    const invoke = await this.getInvoke();
    await invoke('tts_stop');
  }

  async getStatus(): Promise<TtsStatus> {
    const invoke = await this.getInvoke();
    const result = await invoke<{
      available: boolean;
      speaking: boolean;
      supported_languages: string[];
      platform: string;
      error?: string;
    }>('tts_get_status');

    return {
      available: result.available,
      speaking: result.speaking,
      supportedLanguages: result.supported_languages,
      platform: result.platform,
      error: result.error,
    };
  }

  async isLanguageSupported(language: string): Promise<boolean> {
    const invoke = await this.getInvoke();
    return invoke<boolean>('tts_is_language_supported', { language });
  }
}

// ===================== Web Speech API 实现 =====================

/**
 * Web Speech API TTS 服务
 * 使用浏览器原生的语音合成功能
 */
class WebTtsService implements ITtsService {
  private synthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];

  async initialize(): Promise<boolean> {
    if (!('speechSynthesis' in window)) {
      console.warn('[WebTts] 浏览器不支持 Speech Synthesis API');
      return false;
    }

    this.synthesis = window.speechSynthesis;

    // 等待声音列表加载
    return new Promise((resolve) => {
      const loadVoices = () => {
        this.voices = this.synthesis?.getVoices() || [];
        if (this.voices.length > 0) {
          resolve(true);
        }
      };

      // 某些浏览器需要异步加载声音列表
      if (this.synthesis && this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = loadVoices;
      }

      // 立即尝试一次
      loadVoices();

      // 设置超时，避免无限等待
      setTimeout(() => resolve(true), 1000);
    });
  }

  async speak(text: string, config?: TtsConfig): Promise<void> {
    if (!this.synthesis) {
      await this.initialize();
    }

    if (!this.synthesis) {
      throw new Error('Speech Synthesis API 不可用');
    }

    // 停止当前播放
    this.synthesis.cancel();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // 应用配置
      utterance.lang = config?.language || 'en-US';
      utterance.rate = config?.rate ?? 0.9;
      utterance.pitch = config?.pitch ?? 1.0;

      // 尝试选择匹配的声音
      const voice = this.voices.find(
        (v) => v.lang === utterance.lang || v.lang.startsWith(utterance.lang.split('-')[0]),
      );
      if (voice) {
        utterance.voice = voice;
      }

      this.currentUtterance = utterance;

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        reject(new Error(`语音合成失败: ${event.error}`));
      };

      this.synthesis!.speak(utterance);
    });
  }

  async stop(): Promise<void> {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }

  async getStatus(): Promise<TtsStatus> {
    const available = 'speechSynthesis' in window;
    const speaking = this.synthesis?.speaking || false;

    // 获取支持的语言
    const languages = [...new Set(this.voices.map((v) => v.lang))];

    return {
      available,
      speaking,
      supportedLanguages: languages.length > 0 ? languages : ['en-US', 'zh-CN'],
      platform: 'web',
      error: available ? undefined : '浏览器不支持语音合成',
    };
  }

  async isLanguageSupported(language: string): Promise<boolean> {
    if (this.voices.length === 0) {
      await this.initialize();
    }

    return this.voices.some(
      (v) => v.lang === language || v.lang.startsWith(language.split('-')[0]),
    );
  }
}

// ===================== 混合 TTS 服务 =====================

/**
 * 混合 TTS 服务
 * 优先使用 Tauri 原生 TTS，如果不可用则降级到 Web Speech API
 */
class HybridTtsService implements ITtsService {
  private tauriService: TauriTtsService | null = null;
  private webService: WebTtsService;
  private useTauri = false;
  private initialized = false;

  constructor() {
    this.webService = new WebTtsService();

    if (isTauri()) {
      this.tauriService = new TauriTtsService();
    }
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    // 优先尝试 Tauri 原生 TTS
    if (this.tauriService) {
      const tauriAvailable = await this.tauriService.initialize();
      if (tauriAvailable) {
        this.useTauri = true;
        this.initialized = true;
        console.log('[HybridTts] 使用 Tauri 原生 TTS');
        return true;
      }
    }

    // 降级到 Web Speech API
    const webAvailable = await this.webService.initialize();
    this.useTauri = false;
    this.initialized = true;
    console.log('[HybridTts] 使用 Web Speech API');
    return webAvailable;
  }

  async speak(text: string, config?: TtsConfig): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.useTauri && this.tauriService) {
      try {
        await this.tauriService.speak(text, config);
        return;
      } catch (error) {
        console.warn('[HybridTts] Tauri TTS 播放失败，降级到 Web:', error);
        // 降级到 Web Speech API
      }
    }

    await this.webService.speak(text, config);
  }

  async stop(): Promise<void> {
    if (this.useTauri && this.tauriService) {
      await this.tauriService.stop();
    }
    await this.webService.stop();
  }

  async getStatus(): Promise<TtsStatus> {
    if (this.useTauri && this.tauriService) {
      return this.tauriService.getStatus();
    }
    return this.webService.getStatus();
  }

  async isLanguageSupported(language: string): Promise<boolean> {
    if (this.useTauri && this.tauriService) {
      return this.tauriService.isLanguageSupported(language);
    }
    return this.webService.isLanguageSupported(language);
  }

  /**
   * 获取当前使用的 TTS 类型
   */
  getTtsType(): 'tauri' | 'web' {
    return this.useTauri ? 'tauri' : 'web';
  }
}

// ===================== 导出 =====================

/** TTS 服务单例 */
export const ttsService = new HybridTtsService();

export default ttsService;
