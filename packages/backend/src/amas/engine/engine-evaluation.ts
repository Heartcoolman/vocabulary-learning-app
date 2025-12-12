/**
 * AMAS Engine - 评估层管理器
 *
 * 封装评估层的各个模块，提供统一的调用接口:
 * - DelayedRewardAggregator: 多时间尺度延迟奖励聚合
 * - CausalInference: 因果推断验证
 *
 * 设计原则:
 * - 所有操作都是可选的，通过 feature flags 控制
 * - 失败时不影响主流程，仅记录日志
 * - 异步操作不阻塞决策
 */

import {
  DelayedRewardAggregator,
  AggregatedResult,
  RewardBreakdown,
} from '../evaluation/delayed-reward-aggregator';
import { CausalInference } from '../evaluation/causal-inference';
import {
  isDelayedRewardAggregatorEnabled,
  isCausalInferenceEnabled,
} from '../config/feature-flags';
import { amasLogger } from '../../logger';
import { Action, PersistableFeatureVector, UserState } from '../types';

// ==================== 类型定义 ====================

/**
 * 延迟奖励更新结果
 */
export interface DelayedRewardUpdateResult {
  /** 本次聚合的总增量奖励 */
  totalIncrement: number;
  /** 需要更新模型的分解明细（带特征向量） */
  updatableBreakdown: RewardBreakdown[];
  /** 队列中剩余事件数 */
  pendingCount: number;
}

/**
 * 因果观察记录参数
 */
export interface CausalObservationParams {
  /** 用户ID */
  userId: string;
  /** 处理强度（如间隔缩放因子） */
  treatment: number;
  /** 结果奖励 */
  outcome: number;
  /** 协变量特征 */
  covariates: number[];
  /** 倾向得分（可选，用于 IPW 校正） */
  propensityScore?: number;
}

/**
 * 奖励记录参数
 */
export interface RewardRecordParams {
  /** 时间戳 */
  timestamp: number;
  /** 奖励值 */
  reward: number;
  /** 执行的动作 */
  action: Action;
  /** 上下文信息 */
  context: {
    wordId: string;
    eventType?: string;
  };
}

// ==================== 实现 ====================

/**
 * 评估层管理器
 *
 * 职责:
 * 1. 管理延迟奖励聚合器的生命周期
 * 2. 管理因果推断模块的观察记录
 * 3. 提供线程安全的操作封装
 */
export class EvaluationManager {
  /** 延迟奖励聚合器实例（全局共享） */
  private delayedRewardAggregator: DelayedRewardAggregator | null = null;

  /** 因果推断实例（全局共享） */
  private causalInference: CausalInference | null = null;

  /** 贝叶斯优化触发计数器（每用户） */
  private optimizationTriggerCounts: Map<string, number> = new Map();

  /** 优化触发间隔（每 N 次事件触发一次优化检查） */
  private readonly OPTIMIZATION_INTERVAL = 20;

  constructor() {
    this.initializeModules();
  }

  /**
   * 初始化评估模块
   */
  private initializeModules(): void {
    // 根据 feature flags 初始化模块
    if (isDelayedRewardAggregatorEnabled()) {
      this.delayedRewardAggregator = new DelayedRewardAggregator();
      amasLogger.info('[EvaluationManager] DelayedRewardAggregator 已初始化');
    }

    if (isCausalInferenceEnabled()) {
      this.causalInference = new CausalInference();
      amasLogger.info('[EvaluationManager] CausalInference 已初始化');
    }
  }

  // ==================== 延迟奖励聚合 ====================

  /**
   * 应用延迟奖励更新
   *
   * 从延迟奖励队列中获取当前应发放的奖励增量，
   * 返回需要用于模型更新的数据
   *
   * @param userId 用户ID
   * @returns 延迟奖励更新结果，如果未启用返回 null
   */
  applyDelayedRewardUpdate(userId: string): DelayedRewardUpdateResult | null {
    if (!isDelayedRewardAggregatorEnabled() || !this.delayedRewardAggregator) {
      return null;
    }

    try {
      const result = this.delayedRewardAggregator.aggregate(Date.now(), userId);

      // 过滤出有特征向量的分解（可用于模型更新）
      const updatableBreakdown = result.breakdown.filter((b) => b.featureVector !== undefined);

      return {
        totalIncrement: result.totalIncrement,
        updatableBreakdown,
        pendingCount: result.pendingCount,
      };
    } catch (error) {
      amasLogger.warn(
        { userId, error: (error as Error).message },
        '[EvaluationManager] applyDelayedRewardUpdate 失败',
      );
      return null;
    }
  }

  /**
   * 记录奖励到延迟聚合器
   *
   * 将即时奖励加入延迟聚合队列，以便在后续时间点发放
   *
   * @param userId 用户ID
   * @param params 奖励记录参数
   * @param featureVector 关联的特征向量（用于延迟模型更新）
   */
  recordRewardForAggregation(
    userId: string,
    params: RewardRecordParams,
    featureVector?: PersistableFeatureVector,
  ): void {
    if (!isDelayedRewardAggregatorEnabled() || !this.delayedRewardAggregator) {
      return;
    }

    try {
      this.delayedRewardAggregator.addReward(userId, params.reward, params.timestamp, {
        featureVector,
        meta: {
          wordId: params.context.wordId,
          eventType: params.context.eventType,
          action: params.action,
        },
      });
    } catch (error) {
      amasLogger.warn(
        { userId, error: (error as Error).message },
        '[EvaluationManager] recordRewardForAggregation 失败',
      );
    }
  }

  // ==================== 因果推断 ====================

  /**
   * 记录因果推断观察
   *
   * 将学习事件记录为因果观察数据，用于后续的策略效果验证
   *
   * @param params 因果观察参数
   */
  recordCausalObservation(params: CausalObservationParams): void {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return;
    }

    try {
      // 将连续 treatment 映射为二值（高强度 vs 低强度）
      // interval_scale < 1.0 表示高强度（复习间隔缩短），>= 1.0 表示低强度
      const binaryTreatment = params.treatment < 1.0 ? 1 : 0;

      this.causalInference.addObservation({
        features: params.covariates,
        treatment: binaryTreatment,
        outcome: params.outcome,
        timestamp: Date.now(),
        userId: params.userId,
      });
    } catch (error) {
      amasLogger.warn(
        { userId: params.userId, error: (error as Error).message },
        '[EvaluationManager] recordCausalObservation 失败',
      );
    }
  }

  /**
   * 获取策略因果效应估计
   *
   * 使用 AIPW 估计器计算策略的平均处理效应（ATE）
   * 要求: 总样本 >= 10, 处理组 >= 5, 对照组 >= 5
   *
   * @returns ATE估计结果，或 null（样本不足或未启用）
   */
  getCausalStrategyEffect(): {
    ate: number;
    standardError: number;
    confidenceInterval: [number, number];
    sampleSize: number;
    effectiveSampleSize: number;
    pValue: number;
    significant: boolean;
  } | null {
    if (!isCausalInferenceEnabled() || !this.causalInference) {
      return null;
    }

    try {
      const state = this.causalInference.getState();
      const observations = state.observations;

      // 检查样本量要求
      const totalSamples = observations.length;
      const treatmentSamples = observations.filter((o) => o.treatment === 1).length;
      const controlSamples = observations.filter((o) => o.treatment === 0).length;

      // 样本量门控：总样本>=10, 处理组>=5, 对照组>=5
      if (totalSamples < 10 || treatmentSamples < 5 || controlSamples < 5) {
        amasLogger.debug(
          { totalSamples, treatmentSamples, controlSamples },
          '[EvaluationManager] 样本量不足，跳过因果效应估计',
        );
        return null;
      }

      // 调用 AIPW 估计器
      const estimate = this.causalInference.estimateATE();

      return estimate;
    } catch (error) {
      amasLogger.warn(
        { error: (error as Error).message },
        '[EvaluationManager] getCausalStrategyEffect 失败',
      );
      return null;
    }
  }

  /**
   * 从状态中提取协变量特征
   *
   * @param state 当前用户状态
   * @param prevState 前一状态
   * @returns 协变量特征向量
   */
  extractCovariates(state: UserState, prevState: UserState): number[] {
    return [
      state.A, // 注意力
      state.F, // 疲劳度
      state.M, // 动机
      state.C.mem, // 记忆力
      state.C.speed, // 速度
      state.C.stability, // 稳定性
      state.conf, // 置信度
      // 状态变化量
      state.A - prevState.A,
      state.F - prevState.F,
      state.M - prevState.M,
    ];
  }

  /**
   * 估计倾向得分
   *
   * 简单的倾向得分估计，基于用户状态
   *
   * @param state 用户状态
   * @param action 执行的动作
   * @returns 倾向得分 [0, 1]
   */
  estimatePropensity(state: UserState, action: Action): number {
    // 简单的基于状态的倾向得分
    // 高疲劳/低注意力用户更可能被分配低强度策略
    const fatigueScore = state.F;
    const attentionScore = 1 - state.A;

    // 如果 interval_scale < 1.0（高强度），倾向得分基于用户状态
    if (action.interval_scale < 1.0) {
      // 高强度策略：低疲劳、高注意力的用户更可能被分配
      return 1 - (fatigueScore * 0.5 + attentionScore * 0.5);
    } else {
      // 低强度策略：高疲劳、低注意力的用户更可能被分配
      return fatigueScore * 0.5 + attentionScore * 0.5;
    }
  }

  // ==================== 优化触发控制 ====================

  /**
   * 检查是否应该触发优化
   *
   * 控制贝叶斯优化的触发频率，避免过于频繁的优化调用
   *
   * @param userId 用户ID
   * @returns 是否应该触发优化
   */
  shouldTriggerOptimization(userId: string): boolean {
    const count = (this.optimizationTriggerCounts.get(userId) || 0) + 1;
    this.optimizationTriggerCounts.set(userId, count);

    if (count >= this.OPTIMIZATION_INTERVAL) {
      this.optimizationTriggerCounts.set(userId, 0);
      return true;
    }
    return false;
  }

  // ==================== 状态管理 ====================

  /**
   * 获取延迟奖励聚合器状态（用于诊断）
   */
  getDelayedRewardStats(userId?: string): {
    enabled: boolean;
    pendingCount: number;
  } {
    if (!this.delayedRewardAggregator) {
      return { enabled: false, pendingCount: 0 };
    }
    return {
      enabled: true,
      pendingCount: this.delayedRewardAggregator.getPendingCount(userId),
    };
  }

  /**
   * 获取因果推断状态（用于诊断）
   */
  getCausalInferenceStats(): {
    enabled: boolean;
    observationCount: number;
    fitted: boolean;
  } {
    if (!this.causalInference) {
      return { enabled: false, observationCount: 0, fitted: false };
    }

    const state = this.causalInference.getState();
    return {
      enabled: true,
      observationCount: state.observations.length,
      fitted: state.fitted,
    };
  }

  /**
   * 清理用户数据
   */
  clearUserData(userId: string): void {
    this.delayedRewardAggregator?.clear(userId);
    this.optimizationTriggerCounts.delete(userId);
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.delayedRewardAggregator = null;
    this.causalInference = null;
    this.optimizationTriggerCounts.clear();
  }
}
