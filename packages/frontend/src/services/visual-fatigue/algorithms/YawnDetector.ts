/**
 * 打哈欠检测器
 *
 * 使用 MAR (Mouth Aspect Ratio) 检测打哈欠
 * MAR = |TOP - BOTTOM| / |LEFT - RIGHT|
 *
 * 打哈欠特征：
 * - MAR 值显著增加（通常 > 0.6）
 * - 持续时间 > 2 秒
 */

import { MOUTH_LANDMARKS, type YawnEvent } from '@danci/shared';

/**
 * 3D 点坐标
 */
interface Point3D {
  x: number;
  y: number;
  z?: number;
}

/**
 * 打哈欠检测配置
 */
export interface YawnDetectorConfig {
  /** MAR 打哈欠阈值，默认 0.6 */
  marThreshold: number;
  /** 最小打哈欠持续时间（ms），默认 2000 */
  minYawnDuration: number;
  /** 最大打哈欠持续时间（ms），默认 8000 */
  maxYawnDuration: number;
  /** 统计窗口大小（秒），默认 300（5分钟） */
  windowSizeSeconds: number;
}

/**
 * 默认打哈欠检测配置
 */
export const DEFAULT_YAWN_CONFIG: YawnDetectorConfig = {
  marThreshold: 0.6,
  minYawnDuration: 2000,
  maxYawnDuration: 8000,
  windowSizeSeconds: 300,
};

/**
 * MAR 计算结果
 */
export interface MARResult {
  /** MAR 值 */
  mar: number;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * 打哈欠检测状态
 */
type YawnState = 'NORMAL' | 'YAWNING';

/**
 * 打哈欠统计
 */
export interface YawnStats {
  /** 窗口内打哈欠次数 */
  yawnCount: number;
  /** 平均打哈欠持续时间（ms） */
  avgYawnDuration: number;
  /** 统计窗口时长（ms） */
  windowDuration: number;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * 计算两点之间的欧几里得距离
 */
function euclideanDistance(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 打哈欠检测器类
 */
export class YawnDetector {
  private config: YawnDetectorConfig;
  private state: YawnState = 'NORMAL';
  private yawnStartTime: number = 0;
  private yawnEvents: YawnEvent[] = [];
  private lastMAR: number = 0.15;

  constructor(config: Partial<YawnDetectorConfig> = {}) {
    this.config = { ...DEFAULT_YAWN_CONFIG, ...config };
  }

  /**
   * 计算 MAR (Mouth Aspect Ratio)
   * @param landmarks MediaPipe Face Mesh 返回的关键点
   */
  calculateMAR(landmarks: Point3D[]): MARResult {
    try {
      const top = landmarks[MOUTH_LANDMARKS.TOP];
      const bottom = landmarks[MOUTH_LANDMARKS.BOTTOM];
      const left = landmarks[MOUTH_LANDMARKS.LEFT];
      const right = landmarks[MOUTH_LANDMARKS.RIGHT];

      if (!top || !bottom || !left || !right) {
        return { mar: -1, isValid: false };
      }

      const vertical = euclideanDistance(top, bottom);
      const horizontal = euclideanDistance(left, right);

      if (horizontal < 0.001) {
        return { mar: -1, isValid: false };
      }

      const mar = vertical / horizontal;
      return { mar, isValid: true };
    } catch {
      return { mar: -1, isValid: false };
    }
  }

  /**
   * 检测打哈欠事件
   * @param mar 当前 MAR 值
   * @param timestamp 时间戳（可选）
   * @returns 检测到的打哈欠事件（如果有）
   */
  detectYawn(mar: number, timestamp?: number): YawnEvent | null {
    const ts = timestamp ?? Date.now();
    let yawnEvent: YawnEvent | null = null;

    // 状态机逻辑
    switch (this.state) {
      case 'NORMAL':
        // 正常状态，检测是否开始打哈欠
        if (mar > this.config.marThreshold) {
          this.state = 'YAWNING';
          this.yawnStartTime = ts;
        }
        break;

      case 'YAWNING':
        // 正在打哈欠
        if (mar <= this.config.marThreshold) {
          // 打哈欠结束
          const duration = ts - this.yawnStartTime;

          // 验证打哈欠时长
          if (duration >= this.config.minYawnDuration && duration <= this.config.maxYawnDuration) {
            yawnEvent = {
              startTime: this.yawnStartTime,
              endTime: ts,
              duration,
            };
            this.addYawnEvent(yawnEvent);
          }

          this.state = 'NORMAL';
        } else {
          // 检查是否超过最大时长（可能是误检）
          const currentDuration = ts - this.yawnStartTime;
          if (currentDuration > this.config.maxYawnDuration) {
            this.state = 'NORMAL';
          }
        }
        break;
    }

    this.lastMAR = mar;
    return yawnEvent;
  }

  /**
   * 一步完成 MAR 计算和打哈欠检测
   * @param landmarks MediaPipe Face Mesh 返回的关键点
   * @param timestamp 时间戳（可选）
   */
  process(
    landmarks: Point3D[],
    timestamp?: number,
  ): { mar: MARResult; yawnEvent: YawnEvent | null } {
    const mar = this.calculateMAR(landmarks);
    const yawnEvent = mar.isValid ? this.detectYawn(mar.mar, timestamp) : null;
    return { mar, yawnEvent };
  }

  /**
   * 获取打哈欠统计
   */
  getStats(): YawnStats {
    // 清理过期事件
    this.pruneOldEvents();

    const count = this.yawnEvents.length;

    if (count === 0) {
      return {
        yawnCount: 0,
        avgYawnDuration: 0,
        windowDuration: this.config.windowSizeSeconds * 1000,
        isValid: true,
      };
    }

    // 计算窗口时长
    const now = Date.now();
    const windowStart = now - this.config.windowSizeSeconds * 1000;
    const windowDuration = this.config.windowSizeSeconds * 1000;

    // 计算平均打哈欠持续时间
    const totalDuration = this.yawnEvents.reduce((sum, e) => sum + e.duration, 0);
    const avgYawnDuration = count > 0 ? totalDuration / count : 0;

    return {
      yawnCount: count,
      avgYawnDuration,
      windowDuration,
      isValid: true,
    };
  }

  /**
   * 更新 MAR 阈值
   */
  setMarThreshold(threshold: number): void {
    this.config.marThreshold = threshold;
  }

  /**
   * 获取当前状态
   */
  getState(): YawnState {
    return this.state;
  }

  /**
   * 获取窗口内打哈欠次数
   */
  getYawnCount(): number {
    this.pruneOldEvents();
    return this.yawnEvents.length;
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.state = 'NORMAL';
    this.yawnStartTime = 0;
    this.lastMAR = 0.15;
    this.yawnEvents = [];
  }

  /**
   * 添加打哈欠事件
   */
  private addYawnEvent(event: YawnEvent): void {
    this.yawnEvents.push(event);
    this.pruneOldEvents();
  }

  /**
   * 清理超出窗口的旧事件
   */
  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.config.windowSizeSeconds * 1000;
    this.yawnEvents = this.yawnEvents.filter((e) => e.endTime > cutoff);
  }
}

/**
 * 创建打哈欠检测器实例
 */
export function createYawnDetector(config?: Partial<YawnDetectorConfig>): YawnDetector {
  return new YawnDetector(config);
}
