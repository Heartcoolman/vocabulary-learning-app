/**
 * 眨眼检测器
 *
 * 使用状态机检测眨眼事件：
 * OPEN -> CLOSING -> CLOSED -> OPENING -> OPEN
 *
 * 正常眨眼特征：
 * - 频率：15-20 次/分钟
 * - 持续时间：100-400ms
 *
 * 疲劳信号：
 * - 眨眼频率增加
 * - 眨眼持续时间延长
 */

import type { BlinkEvent } from '@danci/shared';

/**
 * 眨眼检测状态
 */
type BlinkState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING';

/**
 * 眨眼检测配置
 */
export interface BlinkDetectorConfig {
  /** EAR 闭眼阈值，默认 0.2 */
  earThreshold: number;
  /** 最小眨眼持续时间（ms），默认 50 */
  minBlinkDuration: number;
  /** 最大眨眼持续时间（ms），默认 500 */
  maxBlinkDuration: number;
  /** 统计窗口大小（秒），默认 60 */
  windowSizeSeconds: number;
}

/**
 * 默认眨眼检测配置
 */
export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  earThreshold: 0.25, // 提高阈值，更容易触发
  minBlinkDuration: 30, // 降低最小时长，捕捉快速眨眼
  maxBlinkDuration: 800, // 增加最大时长
  windowSizeSeconds: 60,
};

/**
 * 眨眼统计结果
 */
export interface BlinkStats {
  /** 每分钟眨眼次数 */
  blinkRate: number;
  /** 平均眨眼持续时间（ms） */
  avgBlinkDuration: number;
  /** 窗口内眨眼次数 */
  blinkCount: number;
  /** 统计窗口时长（ms） */
  windowDuration: number;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * 眨眼检测器类
 */
export class BlinkDetector {
  private config: BlinkDetectorConfig;
  private state: BlinkState = 'OPEN';
  private closeStartTime: number = 0;
  private lastEAR: number = 0.3;
  private blinkEvents: BlinkEvent[] = [];

  // Blendshape 辅助检测
  private lastBlinkIntensity: number = 0;
  private blendshapeBlinkStart: number = 0;
  private blendshapeBlinkActive: boolean = false;
  private static readonly BLENDSHAPE_BLINK_THRESHOLD = 0.4; // 眨眼检测阈值

  constructor(config: Partial<BlinkDetectorConfig> = {}) {
    this.config = { ...DEFAULT_BLINK_CONFIG, ...config };
  }

  /**
   * 处理 EAR 值，检测眨眼事件
   * @param ear 当前 EAR 值
   * @param timestamp 时间戳（可选）
   * @returns 检测到的眨眼事件（如果有）
   */
  detectBlink(ear: number, timestamp?: number): BlinkEvent | null {
    const ts = timestamp ?? Date.now();
    const threshold = this.config.earThreshold;
    let blinkEvent: BlinkEvent | null = null;

    // 简化的状态机逻辑
    switch (this.state) {
      case 'OPEN':
        // 眼睛睁开状态，检测是否开始闭眼
        if (ear < threshold) {
          this.state = 'CLOSING';
          this.closeStartTime = ts;
          console.log('[BlinkDetector] Started closing at', ts);
        }
        break;

      case 'CLOSING':
        // 正在闭眼，检测是否完全闭合或恢复
        if (ear < threshold * 0.85) {
          // 眼睛闭合程度足够
          this.state = 'CLOSED';
        } else if (ear >= threshold * 1.1) {
          // 恢复睁开，可能是假眨眼
          this.state = 'OPEN';
        }
        break;

      case 'CLOSED':
        // 眼睛闭合状态，检测是否开始睁眼
        if (ear >= threshold * 0.85) {
          this.state = 'OPENING';
        }
        break;

      case 'OPENING':
        // 正在睁眼
        if (ear >= threshold) {
          // 完成一次眨眼
          const duration = ts - this.closeStartTime;

          console.log(
            '[BlinkDetector] Blink completed, duration:',
            duration,
            'ms, range:',
            this.config.minBlinkDuration,
            '-',
            this.config.maxBlinkDuration,
          );

          // 验证眨眼时长（放宽限制）
          if (duration >= this.config.minBlinkDuration) {
            // 移除最大时长限制，因为慢眨眼也应该被检测
            blinkEvent = {
              timestamp: ts,
              duration: Math.min(duration, this.config.maxBlinkDuration), // 限制记录的时长
            };
            this.addBlinkEvent(blinkEvent);
            console.log('[BlinkDetector] ✓ Blink recorded!', blinkEvent);
          } else {
            console.log('[BlinkDetector] ✗ Blink too short, ignored');
          }

          this.state = 'OPEN';
        } else if (ear < threshold * 0.7) {
          // 又闭眼了
          this.state = 'CLOSED';
        }
        break;
    }

    this.lastEAR = ear;
    return blinkEvent;
  }

  /**
   * 使用 Blendshape 数据检测眨眼（辅助方法）
   * 当 EAR 检测因帧率过低而漏检时，使用 Blendshape 补充
   * @param blinkIntensity Blendshape 的眨眼强度 (eyeBlinkLeft + eyeBlinkRight) / 2
   * @param timestamp 时间戳
   * @returns 检测到的眨眼事件（如果有）
   */
  detectBlinkFromBlendshape(blinkIntensity: number, timestamp?: number): BlinkEvent | null {
    const ts = timestamp ?? Date.now();
    const threshold = BlinkDetector.BLENDSHAPE_BLINK_THRESHOLD;
    let blinkEvent: BlinkEvent | null = null;

    // 检测眨眼开始（从低到高）
    if (
      !this.blendshapeBlinkActive &&
      blinkIntensity >= threshold &&
      this.lastBlinkIntensity < threshold
    ) {
      this.blendshapeBlinkActive = true;
      this.blendshapeBlinkStart = ts;
    }

    // 检测眨眼结束（从高到低）
    if (this.blendshapeBlinkActive && blinkIntensity < threshold * 0.7) {
      const duration = ts - this.blendshapeBlinkStart;

      // 验证时长合理性
      if (
        duration >= this.config.minBlinkDuration &&
        duration <= this.config.maxBlinkDuration * 2
      ) {
        blinkEvent = {
          timestamp: ts,
          duration: Math.min(duration, this.config.maxBlinkDuration),
        };
        this.addBlinkEvent(blinkEvent);
        console.log('[BlinkDetector] ✓ Blendshape blink detected!', blinkEvent);
      }

      this.blendshapeBlinkActive = false;
    }

    this.lastBlinkIntensity = blinkIntensity;
    return blinkEvent;
  }

  /**
   * 获取眨眼统计
   */
  getStats(): BlinkStats {
    // 清理过期事件
    this.pruneOldEvents();

    const count = this.blinkEvents.length;

    if (count === 0) {
      return {
        blinkRate: 0,
        avgBlinkDuration: 0,
        blinkCount: 0,
        windowDuration: 0,
        isValid: false,
      };
    }

    // 计算窗口时长
    const now = Date.now();
    const windowStart = this.blinkEvents[0]?.timestamp ?? now;
    const windowDuration = now - windowStart;

    // 需要至少 10 秒的数据
    const isValid = windowDuration >= 10000;

    // 计算每分钟眨眼次数
    const windowMinutes = windowDuration / 60000;
    const blinkRate = windowMinutes > 0 ? count / windowMinutes : 0;

    // 计算平均眨眼持续时间
    const totalDuration = this.blinkEvents.reduce((sum, e) => sum + e.duration, 0);
    const avgBlinkDuration = count > 0 ? totalDuration / count : 0;

    return {
      blinkRate,
      avgBlinkDuration,
      blinkCount: count,
      windowDuration,
      isValid,
    };
  }

  /**
   * 更新闭眼阈值
   */
  setEarThreshold(threshold: number): void {
    this.config.earThreshold = threshold;
  }

  /**
   * 获取当前状态
   */
  getState(): BlinkState {
    return this.state;
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.state = 'OPEN';
    this.closeStartTime = 0;
    this.lastEAR = 0.3;
    this.blinkEvents = [];
    // 重置 Blendshape 状态
    this.lastBlinkIntensity = 0;
    this.blendshapeBlinkStart = 0;
    this.blendshapeBlinkActive = false;
  }

  /**
   * 添加眨眼事件
   */
  private addBlinkEvent(event: BlinkEvent): void {
    this.blinkEvents.push(event);
    this.pruneOldEvents();
  }

  /**
   * 清理超出窗口的旧事件
   */
  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.config.windowSizeSeconds * 1000;
    this.blinkEvents = this.blinkEvents.filter((e) => e.timestamp > cutoff);
  }
}

/**
 * 创建眨眼检测器实例
 */
export function createBlinkDetector(config?: Partial<BlinkDetectorConfig>): BlinkDetector {
  return new BlinkDetector(config);
}
