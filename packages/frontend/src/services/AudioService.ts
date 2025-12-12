import { logger } from '../utils/logger';
import { ttsService, TtsConfig } from './TtsService';

/**
 * 音频服务 - 处理单词发音播放
 * 使用 Web Audio API 和 HTML5 Audio
 * 在 Tauri 环境中优先使用原生 TTS
 */
class AudioService {
  private audioContext: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private preloadQueue: Set<string> = new Set();
  private isPlaying = false;
  private maxCacheSize = 20; // 最多缓存20个音频
  private ttsInitialized = false;

  /**
   * 初始化音频上下文和 TTS
   */
  private async initAudio(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // 初始化 TTS 服务
    if (!this.ttsInitialized) {
      try {
        await ttsService.initialize();
        this.ttsInitialized = true;
      } catch (error) {
        logger.warn({ err: error }, 'TTS 初始化失败，将使用降级方案');
      }
    }
  }

  /**
   * 播放单词发音
   * @param word 单词拼写
   * @param config TTS 配置（可选）
   * @returns Promise，播放完成时resolve
   */
  async playPronunciation(word: string, config?: TtsConfig): Promise<void> {
    try {
      await this.initAudio();

      // 如果正在播放，先停止
      if (this.isPlaying && this.currentAudio) {
        this.stopAudio();
      }

      // 使用 TTS API 或预设音频
      const audioUrl = this.getAudioUrl(word);

      if (audioUrl && audioUrl.startsWith('http')) {
        // 如果有音频URL，使用HTML5 Audio播放
        await this.playFromUrl(word, audioUrl);
      } else {
        // 使用 TTS 服务（会自动选择 Tauri 原生或 Web Speech API）
        await this.playWithTts(word, config);
      }
    } catch (error) {
      logger.error({ err: error }, '发音播放失败');
      throw new Error('发音播放失败');
    }
  }

  /**
   * 从URL播放音频（使用缓存）
   */
  private async playFromUrl(word: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 尝试从缓存获取
      let audio = this.audioCache.get(word);

      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        this.addToCache(word, audio);
      }

      this.currentAudio = audio;
      this.isPlaying = true;

      // 重置播放位置
      audio.currentTime = 0;

      // 定义事件处理函数
      const onEnded = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        // 清理事件监听器，避免内存泄漏
        audio!.removeEventListener('ended', onEnded);
        audio!.removeEventListener('error', onError);
        resolve();
      };

      const onError = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        // 清理事件监听器，避免内存泄漏
        audio!.removeEventListener('ended', onEnded);
        audio!.removeEventListener('error', onError);
        reject(new Error('音频加载失败'));
      };

      // 使用 addEventListener 并在回调中手动移除，确保缓存的音频对象每次播放都能正确触发事件
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);

      audio.play().catch((err) => {
        // 播放失败时也要清理事件监听器
        audio!.removeEventListener('ended', onEnded);
        audio!.removeEventListener('error', onError);
        this.isPlaying = false;
        this.currentAudio = null;
        reject(err);
      });
    });
  }

  /**
   * 使用 TTS 服务播放（支持 Tauri 原生和 Web Speech API）
   */
  private async playWithTts(word: string, config?: TtsConfig): Promise<void> {
    this.isPlaying = true;
    try {
      await ttsService.speak(word, {
        language: config?.language || 'en-US',
        rate: config?.rate ?? 0.9, // 稍慢一点，便于学习
        pitch: config?.pitch ?? 1.0,
      });
    } finally {
      this.isPlaying = false;
    }
  }

  /**
   * 使用 Speech Synthesis API 播放
   * @deprecated 使用 playWithTts 代替
   */
  private async playWithSpeechSynthesis(word: string): Promise<void> {
    return this.playWithTts(word);
  }

  /**
   * 预加载音频（优化版）
   * @param word 单词拼写
   */
  async preloadAudio(word: string): Promise<void> {
    try {
      // 避免重复预加载
      if (this.audioCache.has(word) || this.preloadQueue.has(word)) {
        return;
      }

      const audioUrl = this.getAudioUrl(word);
      if (audioUrl && audioUrl.startsWith('http')) {
        this.preloadQueue.add(word);

        // 创建音频对象并预加载
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';

        // 监听加载完成
        audio.addEventListener(
          'canplaythrough',
          () => {
            this.addToCache(word, audio);
            this.preloadQueue.delete(word);
          },
          { once: true },
        );

        // 监听加载错误
        audio.addEventListener(
          'error',
          () => {
            logger.warn({ word }, '预加载音频失败');
            this.preloadQueue.delete(word);
          },
          { once: true },
        );

        // 触发加载
        audio.load();
      }
    } catch (error) {
      logger.error({ err: error }, '预加载音频失败');
      this.preloadQueue.delete(word);
      // 预加载失败不影响主流程
    }
  }

  /**
   * 批量预加载音频
   * @param words 单词列表
   */
  async preloadMultiple(words: string[]): Promise<void> {
    // 限制并发预加载数量，避免占用过多带宽
    const batchSize = 3;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((word) => this.preloadAudio(word)));
    }
  }

  /**
   * 添加到缓存（LRU策略）
   */
  private addToCache(word: string, audio: HTMLAudioElement): void {
    // 如果缓存已满，删除最早的项
    if (this.audioCache.size >= this.maxCacheSize) {
      const firstKey = this.audioCache.keys().next().value;
      if (firstKey) {
        const oldAudio = this.audioCache.get(firstKey);
        if (oldAudio) {
          oldAudio.src = ''; // 释放资源
        }
        this.audioCache.delete(firstKey);
      }
    }

    this.audioCache.set(word, audio);
  }

  /**
   * 停止当前播放
   */
  stopAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    // 停止 TTS 服务
    ttsService.stop().catch((err) => {
      logger.warn({ err }, '停止 TTS 失败');
    });

    this.isPlaying = false;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.audioCache.forEach((audio) => {
      audio.src = ''; // 释放资源
    });
    this.audioCache.clear();
    this.preloadQueue.clear();
  }

  /**
   * 获取音频URL
   * 实际项目中可以从服务器获取或使用第三方API
   */
  private getAudioUrl(_word: string): string {
    // 这里可以配置实际的音频URL
    // 例如：return `https://api.example.com/audio/${word}.mp3`;
    // 目前返回空字符串，使用 Speech Synthesis 作为降级
    return '';
  }

  /**
   * 检查是否正在播放
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取缓存状态
   */
  getCacheStats(): { size: number; maxSize: number; preloading: number } {
    return {
      size: this.audioCache.size,
      maxSize: this.maxCacheSize,
      preloading: this.preloadQueue.size,
    };
  }
}

export default new AudioService();
