/**
 * AMAS Perception Layer - Feature Builder
 * 感知层 - 特征构建器
 */

import {
  FeatureVector,
  NormalizationStat,
  PerceptionConfig,
  RawEvent
} from '../types';
import { DEFAULT_PERCEPTION_CONFIG } from '../config/action-space';

// ==================== 工具函数 ====================

/**
 * 数值截断
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 安全的Z-score标准化
 */
function safeZScore(value: number, stat: NormalizationStat): number {
  const std = stat.std > 1e-6 ? stat.std : 1e-6;
  return (value - stat.mean) / std;
}

/**
 * Sigmoid函数
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ==================== 特征构建器 ====================

/**
 * 特征构建器
 * 负责将原始事件转换为标准化特征向量
 */
export class FeatureBuilder {
  private readonly config: PerceptionConfig;

  constructor(config: PerceptionConfig = DEFAULT_PERCEPTION_CONFIG) {
    this.config = config;
  }

  /**
   * 数据清洗和边界处理
   */
  sanitize(event: RawEvent): RawEvent {
    return {
      ...event,
      responseTime: clamp(event.responseTime, 1, this.config.maxResponseTime),
      dwellTime: clamp(event.dwellTime, 0, this.config.maxResponseTime),
      pauseCount: clamp(event.pauseCount, 0, this.config.maxPauseCount),
      switchCount: clamp(event.switchCount, 0, this.config.maxSwitchCount),
      focusLossDuration: clamp(event.focusLossDuration, 0, this.config.maxFocusLoss),
      interactionDensity: Math.max(0, event.interactionDensity),
      retryCount: Math.max(0, event.retryCount)
    };
  }

  /**
   * 异常检测
   */
  isAnomalous(event: RawEvent): boolean {
    // 检查数值有效性
    if (!Number.isFinite(event.responseTime) || event.responseTime <= 0) {
      return true;
    }
    if (!Number.isFinite(event.dwellTime) || event.dwellTime < 0) {
      return true;
    }
    if (!Number.isFinite(event.timestamp)) {
      return true;
    }

    // 检查极端值
    if (event.responseTime > this.config.maxResponseTime) {
      return true;
    }
    if (event.focusLossDuration > this.config.maxFocusLoss) {
      return true;
    }
    if (event.pauseCount > this.config.maxPauseCount) {
      return true;
    }
    if (event.switchCount > this.config.maxSwitchCount) {
      return true;
    }

    return false;
  }

  /**
   * 构建特征向量
   * 输出维度: 10 (MVP版本)
   */
  buildFeatureVector(raw: RawEvent): FeatureVector {
    const event = this.sanitize(raw);

    // 标准化特征
    const z_rt_mean = safeZScore(event.responseTime, this.config.rt);
    const z_rt_cv = 0; // MVP占位: 需要窗口级统计
    const z_pace_cv = 0; // MVP占位: 需要序列节奏统计
    const z_pause = safeZScore(event.pauseCount, this.config.pause);
    const z_switch = safeZScore(event.switchCount, this.config.switches);
    const z_drift = safeZScore(event.dwellTime, this.config.dwell);
    const z_interaction = safeZScore(event.interactionDensity, this.config.interactionDensity);
    const z_focus_loss = safeZScore(event.focusLossDuration, this.config.focusLoss);

    // 归一化特征
    const retry_norm = clamp(event.retryCount / 3, 0, 1);
    const correctness = event.isCorrect ? 1 : -1;

    // 构建Float32Array (性能优化)
    const values = new Float32Array([
      z_rt_mean,
      z_rt_cv,
      z_pace_cv,
      z_pause,
      z_switch,
      z_drift,
      z_interaction,
      z_focus_loss,
      retry_norm,
      correctness
    ]);

    const labels = [
      'z_rt_mean',
      'z_rt_cv',
      'z_pace_cv',
      'z_pause',
      'z_switch',
      'z_drift',
      'z_interaction',
      'z_focus_loss',
      'retry_norm',
      'correctness'
    ];

    return {
      values,
      ts: event.timestamp,
      labels
    };
  }

  /**
   * 构建注意力特征子集
   * 用于注意力模型计算
   */
  buildAttentionFeatures(raw: RawEvent): Float32Array {
    const event = this.sanitize(raw);

    return new Float32Array([
      safeZScore(event.responseTime, this.config.rt),
      0, // z_rt_cv placeholder
      0, // z_pace_cv placeholder
      safeZScore(event.pauseCount, this.config.pause),
      safeZScore(event.switchCount, this.config.switches),
      safeZScore(event.dwellTime, this.config.dwell),
      safeZScore(event.interactionDensity, this.config.interactionDensity),
      safeZScore(event.focusLossDuration, this.config.focusLoss)
    ]);
  }

  /**
   * 获取特征维度
   */
  getFeatureDimension(): number {
    return 10;
  }

  /**
   * 获取特征标签
   */
  getFeatureLabels(): string[] {
    return [
      'z_rt_mean',
      'z_rt_cv',
      'z_pace_cv',
      'z_pause',
      'z_switch',
      'z_drift',
      'z_interaction',
      'z_focus_loss',
      'retry_norm',
      'correctness'
    ];
  }
}

// ==================== 窗口统计器 ====================

/**
 * 滑动窗口统计器
 * 用于计算窗口级特征(如CV, trend等)
 */
export class WindowStatistics {
  private readonly maxSize: number;
  private readonly values: number[] = [];

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  /**
   * 添加新值
   */
  push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  /**
   * 获取均值
   */
  mean(): number {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  /**
   * 获取标准差
   */
  std(): number {
    if (this.values.length < 2) return 0;
    const m = this.mean();
    const variance = this.values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / this.values.length;
    return Math.sqrt(variance);
  }

  /**
   * 获取变异系数 (CV)
   */
  cv(): number {
    const m = this.mean();
    if (Math.abs(m) < 1e-6) return 0;
    return this.std() / Math.abs(m);
  }

  /**
   * 获取当前窗口大小
   */
  size(): number {
    return this.values.length;
  }

  /**
   * 清空窗口
   */
  clear(): void {
    this.values.length = 0;
  }

  /**
   * 获取最近k个值
   */
  lastK(k: number): number[] {
    return this.values.slice(-k);
  }
}

// ==================== 增强特征构建器 ====================

/**
 * 增强特征构建器
 * 支持窗口级统计特征
 */
export class EnhancedFeatureBuilder extends FeatureBuilder {
  private rtWindow: WindowStatistics;
  private paceWindow: WindowStatistics;
  private baselineRT: number = 3200;

  constructor(config?: PerceptionConfig, windowSize: number = 10) {
    super(config);
    this.rtWindow = new WindowStatistics(windowSize);
    this.paceWindow = new WindowStatistics(windowSize);
  }

  /**
   * 更新窗口并构建增强特征向量
   */
  buildEnhancedFeatureVector(raw: RawEvent): FeatureVector {
    const event = this.sanitize(raw);

    // 更新窗口
    this.rtWindow.push(event.responseTime);
    this.paceWindow.push(event.dwellTime);

    // 计算窗口级特征
    const z_rt_cv = this.rtWindow.cv();
    const z_pace_cv = this.paceWindow.cv();
    const z_drift = (this.rtWindow.mean() - this.baselineRT) / this.baselineRT;

    // 构建特征向量
    const values = new Float32Array([
      safeZScore(event.responseTime, { mean: 3200, std: 800 }),
      z_rt_cv,
      z_pace_cv,
      safeZScore(event.pauseCount, { mean: 0.3, std: 0.6 }),
      safeZScore(event.switchCount, { mean: 0.2, std: 0.5 }),
      z_drift,
      safeZScore(event.interactionDensity, { mean: 2.0, std: 1.2 }),
      safeZScore(event.focusLossDuration, { mean: 3000, std: 2500 }),
      clamp(event.retryCount / 3, 0, 1),
      event.isCorrect ? 1 : -1
    ]);

    return {
      values,
      ts: event.timestamp,
      labels: this.getFeatureLabels()
    };
  }

  /**
   * 设置基线反应时间
   */
  setBaselineRT(baseline: number): void {
    this.baselineRT = baseline;
  }

  /**
   * 重置窗口
   */
  reset(): void {
    this.rtWindow.clear();
    this.paceWindow.clear();
  }
}

// ==================== 导出实例 ====================

/** 默认特征构建器实例 */
export const defaultFeatureBuilder = new FeatureBuilder();
