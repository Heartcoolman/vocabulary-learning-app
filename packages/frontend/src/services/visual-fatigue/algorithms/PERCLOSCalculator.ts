/**
 * PERCLOS (Percentage of Eye Closure) 计算器
 *
 * PERCLOS 定义：在指定时间窗口内，眼睛闭合超过特定比例的时间占比
 * 标准定义使用 80% ���合阈值（P80）
 *
 * 疲劳判定：
 * - PERCLOS < 0.10: 清醒
 * - PERCLOS 0.10-0.15: 轻度疲劳
 * - PERCLOS 0.15-0.25: 中度疲劳
 * - PERCLOS > 0.25: 重度疲劳
 */

/**
 * PERCLOS 配置
 */
export interface PERCLOSConfig {
  /** 滑动窗口大小（秒），默认 60 */
  windowSizeSeconds: number;
  /** EAR 闭眼阈值，默认 0.2 */
  earThreshold: number;
  /** 采样率（每秒帧数），默认 5 */
  sampleRate: number;
}

/**
 * 默认 PERCLOS 配置
 */
export const DEFAULT_PERCLOS_CONFIG: PERCLOSConfig = {
  windowSizeSeconds: 60,
  earThreshold: 0.25, // 与眨眼检测阈值一致
  sampleRate: 10, // 匹配检测频率
};

/**
 * EAR 样本数据
 */
interface EARSample {
  ear: number;
  timestamp: number;
  isClosed: boolean;
}

/**
 * PERCLOS 计算结果
 */
export interface PERCLOSResult {
  /** PERCLOS 值 [0-1] */
  perclos: number;
  /** 窗口内总帧数 */
  totalFrames: number;
  /** 闭眼帧数 */
  closedFrames: number;
  /** 窗口时长（毫秒） */
  windowDuration: number;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * PERCLOS 计算器类
 */
export class PERCLOSCalculator {
  private config: PERCLOSConfig;
  private samples: EARSample[] = [];
  private maxSamples: number;

  constructor(config: Partial<PERCLOSConfig> = {}) {
    this.config = { ...DEFAULT_PERCLOS_CONFIG, ...config };
    // 最大样本数 = 窗口时长 * 采样率
    this.maxSamples = this.config.windowSizeSeconds * this.config.sampleRate;
  }

  /**
   * 添加 EAR 样本
   * @param ear EAR 值
   * @param timestamp 时间戳（可选，默认当前时间）
   */
  addSample(ear: number, timestamp?: number): void {
    const ts = timestamp ?? Date.now();
    const isClosed = ear > 0 && ear < this.config.earThreshold;

    this.samples.push({
      ear,
      timestamp: ts,
      isClosed,
    });

    // 移除超出窗口的旧样本
    this.pruneOldSamples();
  }

  /**
   * 计算当前 PERCLOS 值
   */
  calculate(): PERCLOSResult {
    if (this.samples.length === 0) {
      return {
        perclos: 0,
        totalFrames: 0,
        closedFrames: 0,
        windowDuration: 0,
        isValid: false,
      };
    }

    // 移除过期样本
    this.pruneOldSamples();

    const totalFrames = this.samples.length;
    const closedFrames = this.samples.filter((s) => s.isClosed).length;

    // 计算窗口时长
    const windowDuration =
      totalFrames > 1 ? this.samples[totalFrames - 1].timestamp - this.samples[0].timestamp : 0;

    // 需要至少有一定数量的样本才认为有效
    const minSamples = Math.floor(this.maxSamples * 0.3); // 至少 30% 的窗口数据
    const isValid = totalFrames >= minSamples;

    // PERCLOS = 闭眼帧数 / 总帧数
    const perclos = totalFrames > 0 ? closedFrames / totalFrames : 0;

    return {
      perclos,
      totalFrames,
      closedFrames,
      windowDuration,
      isValid,
    };
  }

  /**
   * 获取疲劳等级
   * @param perclos PERCLOS 值
   */
  getFatigueLevel(perclos: number): 'alert' | 'mild' | 'moderate' | 'severe' {
    if (perclos < 0.1) return 'alert';
    if (perclos < 0.15) return 'mild';
    if (perclos < 0.25) return 'moderate';
    return 'severe';
  }

  /**
   * 更新闭眼阈值（用于个性化校准）
   */
  setEarThreshold(threshold: number): void {
    this.config.earThreshold = threshold;
    // 重新计算所有样本的闭眼状态
    this.samples = this.samples.map((s) => ({
      ...s,
      isClosed: s.ear > 0 && s.ear < threshold,
    }));
  }

  /**
   * 清除所有样本
   */
  reset(): void {
    this.samples = [];
  }

  /**
   * 获取样本数量
   */
  getSampleCount(): number {
    return this.samples.length;
  }

  /**
   * 移除超出时间窗口的旧样本
   */
  private pruneOldSamples(): void {
    const now = Date.now();
    const windowMs = this.config.windowSizeSeconds * 1000;
    const cutoff = now - windowMs;

    // 移除过期样本
    this.samples = this.samples.filter((s) => s.timestamp > cutoff);

    // 同时限制最大样本数
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples);
    }
  }
}

/**
 * 创建 PERCLOS 计算器实例
 */
export function createPERCLOSCalculator(config?: Partial<PERCLOSConfig>): PERCLOSCalculator {
  return new PERCLOSCalculator(config);
}
