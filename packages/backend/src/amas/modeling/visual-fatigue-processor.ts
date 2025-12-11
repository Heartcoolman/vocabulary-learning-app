/**
 * 视觉疲劳处理器
 *
 * 处理来自前端的视觉疲劳指标：
 * - 数据验证和校准
 * - 用户档案管理
 * - 历史记录和趋势分析
 * - 个性化阈值学习
 */

import type { VisualFatigueInput, PersonalBaseline, ColdStartBaselineType } from '@danci/shared';
import { ThresholdLearner, type ThresholdObservation } from './threshold-learner';

/**
 * 视觉疲劳处理配置
 */
export interface VisualFatigueProcessorConfig {
  /** 数据有效期（毫秒），默认 30000 */
  dataMaxAge: number;
  /** 最小置信度阈值，默认 0.2 */
  minConfidence: number;
  /** 历史数据保留数量，默认 100 */
  historySize: number;
  /** 异常值过滤阈值（标准差倍数），默认 3 */
  outlierThreshold: number;
}

/**
 * 默认处理配置
 */
export const DEFAULT_VISUAL_PROCESSOR_CONFIG: VisualFatigueProcessorConfig = {
  dataMaxAge: 30000,
  minConfidence: 0.2,
  historySize: 100,
  outlierThreshold: 3,
};

/**
 * 处理后的视觉疲劳数据
 */
export interface ProcessedVisualFatigue {
  /** 视觉疲劳评分 [0-1] */
  score: number;
  /** 各项指标 */
  metrics: {
    perclos: number;
    blinkRate: number;
    yawnCount: number;
    headPitch: number;
    headYaw: number;
    // 扩展指标
    eyeAspectRatio?: number;
    avgBlinkDuration?: number;
    headRoll?: number;
    headStability?: number;
    squintIntensity?: number;
    expressionFatigueScore?: number;
    gazeOffScreenRatio?: number;
    browDownIntensity?: number;
    mouthOpenRatio?: number;
  };
  /** 置信度 [0-1] */
  confidence: number;
  /** 数据新鲜度 [0-1] */
  freshness: number;
  /** 是否有效 */
  isValid: boolean;
  /** 处理时间戳 */
  timestamp: number;
}

/**
 * 用户视觉疲劳档案
 */
export interface UserVisualProfile {
  /** 用户ID */
  userId: string;
  /** 个人基线 */
  baseline: PersonalBaseline | null;
  /** 基线类型 */
  baselineType: ColdStartBaselineType;
  /** 历史平均视觉疲劳 */
  avgVisualFatigue: number;
  /** 历史最高视觉疲劳 */
  maxVisualFatigue: number;
  /** 总记录数 */
  recordCount: number;
  /** 最后更新时间 */
  lastUpdateTime: number;
}

/**
 * 历史数据点
 */
interface HistoryPoint {
  score: number;
  perclos: number;
  blinkRate: number;
  timestamp: number;
}

/**
 * 视觉疲劳处理器类
 */
export class VisualFatigueProcessor {
  private config: VisualFatigueProcessorConfig;
  private profiles: Map<string, UserVisualProfile> = new Map();
  private history: Map<string, HistoryPoint[]> = new Map();
  private lastData: Map<string, ProcessedVisualFatigue> = new Map();
  private thresholdLearner: ThresholdLearner;

  constructor(config: Partial<VisualFatigueProcessorConfig> = {}) {
    this.config = { ...DEFAULT_VISUAL_PROCESSOR_CONFIG, ...config };
    this.thresholdLearner = new ThresholdLearner();
  }

  /**
   * 处理视觉疲劳输入
   * @param userId 用户ID
   * @param input 前端上报的视觉疲劳数据
   */
  process(userId: string, input: VisualFatigueInput): ProcessedVisualFatigue {
    // 验证输入数据
    if (!this.validateInput(input)) {
      return this.createInvalidResult();
    }

    // 获取用户档案
    const profile = this.getOrCreateProfile(userId);

    // 应用个人基线校准
    const calibratedScore = this.calibrateScore(input, profile);

    // 过滤异常值
    const filteredScore = this.filterOutlier(userId, calibratedScore);

    // 计算数据新鲜度
    const freshness = this.calculateFreshness(input.timestamp);

    // 创建处理结果
    const result: ProcessedVisualFatigue = {
      score: filteredScore,
      metrics: {
        perclos: input.perclos,
        blinkRate: input.blinkRate,
        yawnCount: input.yawnCount,
        headPitch: input.headPitch ?? 0,
        headYaw: input.headYaw ?? 0,
        // 扩展指标：直接传递前端上报的真实数据
        eyeAspectRatio: input.eyeAspectRatio,
        avgBlinkDuration: input.avgBlinkDuration,
        headRoll: input.headRoll,
        headStability: input.headStability,
        squintIntensity: input.squintIntensity,
        expressionFatigueScore: input.expressionFatigueScore,
        gazeOffScreenRatio: input.gazeOffScreenRatio,
        browDownIntensity: input.browDownIntensity,
        mouthOpenRatio: input.mouthOpenRatio,
      },
      confidence: input.confidence * freshness,
      freshness,
      isValid: freshness > 0 && input.confidence >= this.config.minConfidence,
      timestamp: Date.now(),
    };

    // 更新历史和档案
    this.updateHistory(userId, result);
    this.updateProfile(userId, result);

    // 缓存最新数据
    this.lastData.set(userId, result);

    return result;
  }

  /**
   * 获取用户最新的视觉疲劳数据
   */
  getLatest(userId: string): ProcessedVisualFatigue | null {
    const data = this.lastData.get(userId);
    if (!data) {
      return null;
    }

    // 检查数据是否过期
    const age = Date.now() - data.timestamp;
    if (age > this.config.dataMaxAge) {
      return null;
    }

    return {
      ...data,
      freshness: this.calculateFreshness(data.timestamp),
    };
  }

  /**
   * 获取用户档案
   */
  getProfile(userId: string): UserVisualProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  /**
   * 设置用户基线
   */
  setBaseline(userId: string, baseline: PersonalBaseline): void {
    const profile = this.getOrCreateProfile(userId);
    profile.baseline = baseline;
    profile.lastUpdateTime = Date.now();
  }

  /**
   * 获取视觉疲劳趋势
   * @param userId 用户ID
   * @param windowSize 窗口大小（数据点数量）
   */
  getTrend(userId: string, windowSize: number = 10): number {
    const history = this.history.get(userId);
    if (!history || history.length < windowSize * 2) {
      return 0;
    }

    // 比较最近 windowSize 和之前 windowSize 的平均值
    const recent = history.slice(-windowSize);
    const earlier = history.slice(-windowSize * 2, -windowSize);

    const recentAvg = recent.reduce((sum, p) => sum + p.score, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, p) => sum + p.score, 0) / earlier.length;

    return recentAvg - earlierAvg;
  }

  /**
   * 获取统计数据
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    avgFatigue: number;
  } {
    const now = Date.now();
    let activeCount = 0;
    let totalFatigue = 0;

    for (const data of this.lastData.values()) {
      if (now - data.timestamp < this.config.dataMaxAge) {
        activeCount++;
        totalFatigue += data.score;
      }
    }

    return {
      totalUsers: this.profiles.size,
      activeUsers: activeCount,
      avgFatigue: activeCount > 0 ? totalFatigue / activeCount : 0,
    };
  }

  /**
   * 清理过期数据
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.dataMaxAge * 10; // 保留更长时间

    for (const [userId, data] of this.lastData.entries()) {
      if (now - data.timestamp > maxAge) {
        this.lastData.delete(userId);
      }
    }

    // 清理历史数据
    for (const [userId, history] of this.history.entries()) {
      const cutoff = now - maxAge;
      const filtered = history.filter((p) => p.timestamp > cutoff);
      if (filtered.length === 0) {
        this.history.delete(userId);
      } else {
        this.history.set(userId, filtered);
      }
    }
  }

  /**
   * 重置用户数据
   */
  resetUser(userId: string): void {
    this.profiles.delete(userId);
    this.history.delete(userId);
    this.lastData.delete(userId);
    this.thresholdLearner.resetUser(userId);
  }

  /**
   * 获取用户的个性化阈值
   */
  getPersonalizedThresholds(userId: string) {
    return this.thresholdLearner.getThresholds(userId);
  }

  /**
   * 记录行为观察用于阈值学习
   *
   * @param userId 用户ID
   * @param behaviorMetrics 行为指标
   */
  recordBehaviorObservation(
    userId: string,
    behaviorMetrics: {
      errorRate: number;
      responseTimeIncrease: number;
      fatigueScore: number;
    },
  ): void {
    const visualData = this.lastData.get(userId);
    if (!visualData || !visualData.isValid) {
      return;
    }

    const observation: ThresholdObservation = {
      visual: {
        perclos: visualData.metrics.perclos,
        blinkRate: visualData.metrics.blinkRate,
        fatigueScore: visualData.score,
      },
      behavior: behaviorMetrics,
      timestamp: Date.now(),
    };

    this.thresholdLearner.observe(userId, observation);
  }

  /**
   * 获取阈值学习器（用于高级访问）
   */
  getThresholdLearner(): ThresholdLearner {
    return this.thresholdLearner;
  }

  /**
   * 验证输入数据
   */
  private validateInput(input: VisualFatigueInput): boolean {
    if (!input || typeof input.score !== 'number') {
      return false;
    }

    // 检查数值范围
    if (
      input.score < 0 ||
      input.score > 1 ||
      input.perclos < 0 ||
      input.perclos > 1 ||
      input.blinkRate < 0 ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      return false;
    }

    return true;
  }

  /**
   * 获取或创建用户档案
   */
  private getOrCreateProfile(userId: string): UserVisualProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        baseline: null,
        baselineType: 'default',
        avgVisualFatigue: 0,
        maxVisualFatigue: 0,
        recordCount: 0,
        lastUpdateTime: Date.now(),
      };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  /**
   * 应用基线校准
   */
  private calibrateScore(input: VisualFatigueInput, profile: UserVisualProfile): number {
    // 如果没有个人基线，直接返回原始分数
    if (!profile.baseline) {
      return input.score;
    }

    // 基于个人基线调整 PERCLOS 阈值影响
    const baseline = profile.baseline;
    // 计算 EAR 阈值：mean - 1.5 * std
    // 使用 0.05 作为下限，防止 earThreshold 为负数或过小导致 perclosRatio 异常放大
    const earThreshold = Math.max(0.05, baseline.ear.mean - baseline.ear.std * 1.5);
    const perclosRatio = input.perclos / earThreshold;

    // 综合调整
    const adjustmentFactor = Math.min(1.5, Math.max(0.5, perclosRatio));
    return Math.min(1, input.score * adjustmentFactor);
  }

  /**
   * 过滤异常值
   */
  private filterOutlier(userId: string, score: number): number {
    const history = this.history.get(userId);
    if (!history || history.length < 5) {
      return score;
    }

    // 计算历史数据的均值和标准差
    const scores = history.map((p) => p.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length,
    );

    // 如果超出阈值，限制到阈值范围
    const threshold = this.config.outlierThreshold * std;
    if (Math.abs(score - mean) > threshold) {
      return mean + Math.sign(score - mean) * threshold;
    }

    return score;
  }

  /**
   * 计算数据新鲜度
   */
  private calculateFreshness(timestamp: number): number {
    const age = Date.now() - timestamp;
    if (age > this.config.dataMaxAge) {
      return 0;
    }
    // 线性衰减
    return 1 - age / this.config.dataMaxAge;
  }

  /**
   * 更新历史数据
   */
  private updateHistory(userId: string, result: ProcessedVisualFatigue): void {
    let history = this.history.get(userId);
    if (!history) {
      history = [];
      this.history.set(userId, history);
    }

    history.push({
      score: result.score,
      perclos: result.metrics.perclos,
      blinkRate: result.metrics.blinkRate,
      timestamp: result.timestamp,
    });

    // 限制历史大小
    if (history.length > this.config.historySize) {
      history.shift();
    }
  }

  /**
   * 更新用户档案
   */
  private updateProfile(userId: string, result: ProcessedVisualFatigue): void {
    const profile = this.profiles.get(userId);
    if (!profile) return;

    // 更新平均值（EMA）
    const alpha = 0.1;
    profile.avgVisualFatigue = alpha * result.score + (1 - alpha) * profile.avgVisualFatigue;

    // 更新最高值
    profile.maxVisualFatigue = Math.max(profile.maxVisualFatigue, result.score);

    // 更新记录数
    profile.recordCount++;
    profile.lastUpdateTime = result.timestamp;
  }

  /**
   * 创建无效结果
   */
  private createInvalidResult(): ProcessedVisualFatigue {
    return {
      score: 0,
      metrics: {
        perclos: 0,
        blinkRate: 0,
        yawnCount: 0,
        headPitch: 0,
        headYaw: 0,
      },
      confidence: 0,
      freshness: 0,
      isValid: false,
      timestamp: Date.now(),
    };
  }
}

/**
 * 创建视觉疲劳处理器实例
 */
export function createVisualFatigueProcessor(
  config?: Partial<VisualFatigueProcessorConfig>,
): VisualFatigueProcessor {
  return new VisualFatigueProcessor(config);
}

/**
 * 默认处理器实例
 */
export const defaultVisualFatigueProcessor = new VisualFatigueProcessor();
