/**
 * 个性化阈值学习器
 *
 * 使用贝叶斯更新从用户历史学习最优疲劳阈值
 *
 * 核心机制：
 * - 贝叶斯先验：使用群体数据作为初始阈值
 * - 在线学习：当视觉指标X时行为恶化，降低对应阈值
 * - 方差收缩：随观察增多减少不确定性
 *
 * 可学习阈值：
 * - perclosThreshold: PERCLOS 疲劳阈值，默认 0.15
 * - blinkRateThreshold: 眨眼频率阈值，默认 25 次/分钟
 * - fatigueScoreThreshold: 综合疲劳评分阈值，默认 0.6
 */

import type { PersonalizedThresholds, DEFAULT_PERSONALIZED_THRESHOLDS } from '@danci/shared';

// ==================== 类型定义 ====================

/**
 * 学习器配置
 */
export interface ThresholdLearnerConfig {
  /** 学习率 (贝叶斯更新强度) */
  learningRate: number;
  /** 最小方差 (防止过度收敛) */
  minVariance: number;
  /** 初始方差 */
  initialVariance: number;
  /** 行为恶化检测阈值 */
  behaviorDegradationThreshold: number;
  /** 最小样本数 (开始学习前) */
  minSamplesBeforeLearning: number;
  /** 阈值下限 */
  thresholdLowerBound: {
    perclos: number;
    blinkRate: number;
    fatigueScore: number;
  };
  /** 阈值上限 */
  thresholdUpperBound: {
    perclos: number;
    blinkRate: number;
    fatigueScore: number;
  };
}

/**
 * 默认配置
 */
export const DEFAULT_THRESHOLD_LEARNER_CONFIG: ThresholdLearnerConfig = {
  learningRate: 0.1,
  minVariance: 0.01,
  initialVariance: 0.1,
  behaviorDegradationThreshold: 0.3,
  minSamplesBeforeLearning: 10,
  thresholdLowerBound: {
    perclos: 0.05,
    blinkRate: 10,
    fatigueScore: 0.3,
  },
  thresholdUpperBound: {
    perclos: 0.3,
    blinkRate: 40,
    fatigueScore: 0.85,
  },
};

/**
 * 学习观察数据
 */
export interface ThresholdObservation {
  /** 视觉指标 */
  visual: {
    perclos: number;
    blinkRate: number;
    fatigueScore: number;
  };
  /** 行为指标 */
  behavior: {
    errorRate: number;
    responseTimeIncrease: number;
    fatigueScore: number;
  };
  /** 时间戳 */
  timestamp: number;
}

/**
 * 用户阈值状态
 */
interface UserThresholdState {
  /** 当前阈值 */
  thresholds: PersonalizedThresholds;
  /** 观察历史 */
  observations: ThresholdObservation[];
  /** 是否正在学习 */
  isLearning: boolean;
}

// ==================== 阈值学习器类 ====================

/**
 * 个性化阈值学习器
 */
export class ThresholdLearner {
  private config: ThresholdLearnerConfig;
  private userStates: Map<string, UserThresholdState> = new Map();

  constructor(config: Partial<ThresholdLearnerConfig> = {}) {
    this.config = {
      ...DEFAULT_THRESHOLD_LEARNER_CONFIG,
      ...config,
      thresholdLowerBound: {
        ...DEFAULT_THRESHOLD_LEARNER_CONFIG.thresholdLowerBound,
        ...config.thresholdLowerBound,
      },
      thresholdUpperBound: {
        ...DEFAULT_THRESHOLD_LEARNER_CONFIG.thresholdUpperBound,
        ...config.thresholdUpperBound,
      },
    };
  }

  /**
   * 获取用户的个性化阈值
   */
  getThresholds(userId: string): PersonalizedThresholds {
    const state = this.userStates.get(userId);
    if (!state) {
      return this.createDefaultThresholds();
    }
    return state.thresholds;
  }

  /**
   * 添加观察并更新阈值
   *
   * @param userId 用户ID
   * @param observation 观察数据
   * @returns 更新后的阈值
   */
  observe(userId: string, observation: ThresholdObservation): PersonalizedThresholds {
    const state = this.getOrCreateUserState(userId);

    // 添加观察
    state.observations.push(observation);

    // 限制历史长度
    if (state.observations.length > 100) {
      state.observations.shift();
    }

    // 检查是否应该开始学习
    if (!state.isLearning && state.observations.length >= this.config.minSamplesBeforeLearning) {
      state.isLearning = true;
    }

    // 如果正在学习，执行贝叶斯更新
    if (state.isLearning) {
      this.bayesianUpdate(state, observation);
    }

    // 更新时间戳和样本数
    state.thresholds.updatedAt = Date.now();
    state.thresholds.sampleCount++;

    return state.thresholds;
  }

  /**
   * 批量更新阈值
   *
   * @param userId 用户ID
   * @param observations 观察数据列表
   */
  batchObserve(userId: string, observations: ThresholdObservation[]): PersonalizedThresholds {
    let thresholds = this.getThresholds(userId);
    for (const obs of observations) {
      thresholds = this.observe(userId, obs);
    }
    return thresholds;
  }

  /**
   * 重置用户阈值到默认值
   */
  resetUser(userId: string): void {
    this.userStates.delete(userId);
  }

  /**
   * 获取用户学习状态
   */
  getLearningStatus(userId: string): {
    isLearning: boolean;
    sampleCount: number;
    samplesUntilLearning: number;
  } {
    const state = this.userStates.get(userId);
    if (!state) {
      return {
        isLearning: false,
        sampleCount: 0,
        samplesUntilLearning: this.config.minSamplesBeforeLearning,
      };
    }

    return {
      isLearning: state.isLearning,
      sampleCount: state.observations.length,
      samplesUntilLearning: Math.max(
        0,
        this.config.minSamplesBeforeLearning - state.observations.length,
      ),
    };
  }

  /**
   * 导出用户阈值状态 (用于持久化)
   */
  exportUserState(userId: string): UserThresholdState | null {
    const state = this.userStates.get(userId);
    return state ? { ...state } : null;
  }

  /**
   * 导入用户阈值状态 (从持久化恢复)
   */
  importUserState(userId: string, state: UserThresholdState): void {
    this.userStates.set(userId, { ...state });
  }

  // ==================== 私有方法 ====================

  /**
   * 创建默认阈值
   */
  private createDefaultThresholds(): PersonalizedThresholds {
    return {
      perclos: { mean: 0.15, std: this.config.initialVariance },
      blinkRate: { mean: 25, std: this.config.initialVariance * 50 },
      fatigueScore: { mean: 0.6, std: this.config.initialVariance },
      updatedAt: Date.now(),
      sampleCount: 0,
    };
  }

  /**
   * 获取或创建用户状态
   */
  private getOrCreateUserState(userId: string): UserThresholdState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        thresholds: this.createDefaultThresholds(),
        observations: [],
        isLearning: false,
      };
      this.userStates.set(userId, state);
    }
    return state;
  }

  /**
   * 贝叶斯更新
   *
   * 当检测到行为恶化且视觉指标高于当前阈值时，降低阈值
   * 当检测到行为良好且视觉指标低于当前阈值时，提高阈值
   */
  private bayesianUpdate(state: UserThresholdState, observation: ThresholdObservation): void {
    const { visual, behavior } = observation;
    const thresholds = state.thresholds;
    const config = this.config;

    // 检测行为是否恶化
    const isBehaviorDegraded =
      behavior.errorRate > config.behaviorDegradationThreshold ||
      behavior.responseTimeIncrease > 0.3 ||
      behavior.fatigueScore > 0.6;

    // PERCLOS 阈值更新
    this.updateThreshold(
      thresholds.perclos,
      visual.perclos,
      isBehaviorDegraded,
      config.thresholdLowerBound.perclos,
      config.thresholdUpperBound.perclos,
    );

    // 眨眼频率阈值更新
    // 注意：高眨眼频率可能是疲劳信号，低眨眼频率也可能是（干眼）
    // 这里简化为：异常高的眨眼频率视为疲劳
    this.updateThreshold(
      thresholds.blinkRate,
      visual.blinkRate,
      isBehaviorDegraded,
      config.thresholdLowerBound.blinkRate,
      config.thresholdUpperBound.blinkRate,
    );

    // 疲劳评分阈值更新
    this.updateThreshold(
      thresholds.fatigueScore,
      visual.fatigueScore,
      isBehaviorDegraded,
      config.thresholdLowerBound.fatigueScore,
      config.thresholdUpperBound.fatigueScore,
    );

    // 方差收缩 (增加观察后置信度增加)
    this.shrinkVariance(thresholds.perclos);
    this.shrinkVariance(thresholds.blinkRate);
    this.shrinkVariance(thresholds.fatigueScore);
  }

  /**
   * 更新单个阈值
   *
   * @param threshold 阈值对象 { mean, std }
   * @param observedValue 观察到的值
   * @param isBehaviorDegraded 行为是否恶化
   * @param lowerBound 阈值下限
   * @param upperBound 阈值上限
   */
  private updateThreshold(
    threshold: { mean: number; std: number },
    observedValue: number,
    isBehaviorDegraded: boolean,
    lowerBound: number,
    upperBound: number,
  ): void {
    const lr = this.config.learningRate;

    if (isBehaviorDegraded && observedValue > threshold.mean) {
      // 行为恶化 + 视觉指标高于阈值 → 降低阈值 (更敏感)
      const delta = (observedValue - threshold.mean) * lr;
      threshold.mean = Math.max(lowerBound, threshold.mean - delta * 0.5);
    } else if (!isBehaviorDegraded && observedValue < threshold.mean * 0.7) {
      // 行为良好 + 视觉指标远低于阈值 → 可以稍微提高阈值
      const delta = (threshold.mean - observedValue) * lr;
      threshold.mean = Math.min(upperBound, threshold.mean + delta * 0.1);
    }
  }

  /**
   * 方差收缩
   *
   * 随着观察增多，减少不确定性
   */
  private shrinkVariance(threshold: { mean: number; std: number }): void {
    const shrinkRate = 0.99; // 每次观察后方差缩小 1%
    threshold.std = Math.max(this.config.minVariance, threshold.std * shrinkRate);
  }
}

// ==================== 导出 ====================

/**
 * 创建阈值学习器
 */
export function createThresholdLearner(config?: Partial<ThresholdLearnerConfig>): ThresholdLearner {
  return new ThresholdLearner(config);
}

/**
 * 默认实例
 */
export const defaultThresholdLearner = new ThresholdLearner();
