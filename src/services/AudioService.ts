import { logger } from '../utils/logger';

/**
 * 音频服务 - 处理单词发音播放
 * 使用 Web Audio API 和 HTML5 Audio
 */
class AudioService {
  private audioContext: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private preloadQueue: Set<string> = new Set();
  private isPlaying = false;
  private maxCacheSize = 20; // 最多缓存20个音频

  /**
   * 初始化音频上下文
   */
  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  /**
   * 播放单词发音
   * @param word 单词拼写
   * @returns Promise，播放完成时resolve
   */
  async playPronunciation(word: string): Promise<void> {
    try {
      this.initAudioContext();

      // 如果正在播放，先停止
      if (this.isPlaying && this.currentAudio) {
        this.stopAudio();
      }

      // 使用 TTS API 或预设音频
      // 这里使用浏览器的 Speech Synthesis API 作为降级方案
      const audioUrl = this.getAudioUrl(word);

      if (audioUrl && audioUrl.startsWith('http')) {
        // 如果有音频URL，使用HTML5 Audio播放
        await this.playFromUrl(word, audioUrl);
      } else {
        // 使用 Speech Synthesis API
        await this.playWithSpeechSynthesis(word);
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

      audio.onended = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = () => {
        this.isPlaying = false;
        this.currentAudio = null;
        reject(new Error('音频加载失败'));
      };

      audio.play().catch(reject);
    });
  }

  /**
   * 使用 Speech Synthesis API 播放
   */
  private async playWithSpeechSynthesis(word: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('浏览器不支持语音合成'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9; // 稍慢一点，便于学习

      this.isPlaying = true;

      utterance.onend = () => {
        this.isPlaying = false;
        resolve();
      };

      utterance.onerror = (event) => {
        this.isPlaying = false;
        reject(new Error(`语音合成失败: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
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
        audio.addEventListener('canplaythrough', () => {
          this.addToCache(word, audio);
          this.preloadQueue.delete(word);
        }, { once: true });

        // 监听加载错误
        audio.addEventListener('error', () => {
          logger.warn({ word }, '预加载音频失败');
          this.preloadQueue.delete(word);
        }, { once: true });

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
      await Promise.allSettled(batch.map(word => this.preloadAudio(word)));
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

    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    this.isPlaying = false;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.audioCache.forEach(audio => {
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
