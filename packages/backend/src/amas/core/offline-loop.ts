/**
 * AMAS Core - Offline Loop (异步处理，分钟级)
 * 离线循环处理模块
 *
 * 核心功能：
 * - DelayedReward：处理延迟奖励队列，计算多时间尺度的奖励增量
 * - RewardEvaluator：评估奖励质量，融合多源数据评估学习效果
 * - ParamUpdater：更新模型参数，应用奖励到 LinUCB/LinTS 模型
 *
 * 处理流程：
 * 1. DelayedReward → 从队列获取待处理的延迟奖励事件
 * 2. RewardEvaluator → 评估奖励是否有效，过滤低质量奖励
 * 3. ParamUpdater → 将有效奖励应用到用户模型，更新参数
 *
 * 设计特点：
 * - 异步处理：不阻塞主流程，定时批量处理
 * - 多时间尺度：支持即时、1小时、6小时、24小时、7天的奖励评估
 * - 质量控制：通过评估器过滤低质量奖励，防止模型污染
 * - 可配置性：支持自定义奖励时间表、评估阈值等参数
 */

import cron, { ScheduledTask } from 'node-cron';
import {
  DelayedRewardAggregator,
  AggregatedResult,
  RewardBreakdown,
  RewardSchedule,
} from '../rewards/delayed-reward-aggregator';
import { WordMasteryEvaluator, MasteryEvaluation } from '../rewards/evaluators';
import { PersistableFeatureVector, UserState } from '../types';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 奖励评估结果
 */
export interface RewardEvaluationResult {
  /** 是否为有效奖励 */
  isValid: boolean;
  /** 调整后的奖励值 */
  adjustedReward: number;
  /** 评估置信度 [0, 1] */
  confidence: number;
  /** 评估原因 */
  reason: string;
  /** 原始奖励值 */
  originalReward: number;
}

/**
 * 参数更新结果
 */
export interface ParamUpdateResult {
  /** 用户ID */
  userId: string;
  /** 更新的奖励数量 */
  updateCount: number;
  /** 总奖励增量 */
  totalReward: number;
  /** 平均置信度 */
  avgConfidence: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * Offline Loop 配置
 */
export interface OfflineLoopConfig {
  /** 延迟奖励时间表（可选，默认使用标准配置） */
  rewardSchedule?: RewardSchedule[];
  /** 奖励评估阈值（低于此阈值的奖励将被过滤，默认 0.3） */
  evaluationThreshold?: number;
  /** 是否启用质量控制（默认 true） */
  enableQualityControl?: boolean;
  /** 批处理大小（每次处理的最大用户数，默认 50） */
  batchSize?: number;
  /** 是否记录详细日志（默认 false） */
  verboseLogging?: boolean;
  /** 处理间隔（cron 表达式，默认每分钟 '* * * * *'） */
  cronSchedule?: string;
  /** 疲劳度过滤阈值（高于此值的用户将跳过处理，默认 0.8） */
  fatigueThreshold?: number;
}

/**
 * 奖励应用器接口
 * 用于依赖注入，支持测试和自定义实现
 */
export interface RewardApplier {
  /**
   * 应用奖励到用户模型
   * @param userId 用户ID
   * @param reward 奖励值
   * @param featureVector 特征向量（可选）
   * @param actionIndex 动作索引（可选）
   */
  applyReward(
    userId: string,
    reward: number,
    featureVector?: PersistableFeatureVector,
    actionIndex?: number,
  ): Promise<void>;
}

/**
 * 用户状态提供器接口
 * 用于获取用户状态，支持评估和过滤
 */
export interface UserStateProvider {
  /**
   * 获取用户状态
   * @param userId 用户ID
   * @returns 用户状态（如果不存在返回 null）
   */
  getUserState(userId: string): Promise<UserState | null>;
}

// ==================== 常量 ====================

/** 默认配置 */
const DEFAULT_CONFIG: Required<OfflineLoopConfig> = {
  rewardSchedule: [
    { delaySec: 0, weight: 0.3, label: 'immediate' },
    { delaySec: 3600, weight: 0.2, label: '1h' },
    { delaySec: 21600, weight: 0.15, label: '6h' },
    { delaySec: 86400, weight: 0.2, label: '24h' },
    { delaySec: 604800, weight: 0.15, label: '7d' },
  ],
  evaluationThreshold: 0.3,
  enableQualityControl: true,
  batchSize: 50,
  verboseLogging: false,
  cronSchedule: '* * * * *', // 每分钟
  fatigueThreshold: 0.8,
};

// ==================== 核心组件 ====================

/**
 * 延迟奖励处理器
 * 负责从队列获取待处理的延迟奖励事件
 */
export class DelayedRewardProcessor {
  private aggregator: DelayedRewardAggregator;

  constructor(schedule?: RewardSchedule[]) {
    this.aggregator = new DelayedRewardAggregator(schedule);
  }

  /**
   * 添加奖励事件到队列
   */
  addReward(
    userId: string,
    reward: number,
    options?: {
      featureVector?: PersistableFeatureVector;
      actionIndex?: number;
      timestamp?: number;
    },
  ): string {
    return this.aggregator.addReward(userId, reward, options?.timestamp, {
      featureVector: options?.featureVector,
      actionIndex: options?.actionIndex,
    });
  }

  /**
   * 聚合当前应发放的奖励
   * @param userId 可选，只聚合特定用户
   */
  aggregate(userId?: string): AggregatedResult {
    return this.aggregator.aggregate(Date.now(), userId);
  }

  /**
   * 获取待处理事件数
   */
  getPendingCount(userId?: string): number {
    return this.aggregator.getPendingCount(userId);
  }

  /**
   * 清空队列
   */
  clear(userId?: string): void {
    this.aggregator.clear(userId);
  }

  /**
   * 获取状态（用于持久化）
   */
  getState() {
    return this.aggregator.getState();
  }

  /**
   * 恢复状态
   */
  setState(state: unknown) {
    this.aggregator.setState(state as never);
  }
}

/**
 * 奖励评估器
 * 负责评估奖励质量，过滤低质量奖励
 */
export class RewardEvaluator {
  private evaluator: WordMasteryEvaluator;
  private threshold: number;
  private enableQualityControl: boolean;

  constructor(threshold = 0.3, enableQualityControl = true) {
    this.evaluator = new WordMasteryEvaluator();
    this.threshold = threshold;
    this.enableQualityControl = enableQualityControl;
  }

  /**
   * 评估奖励是否有效
   *
   * 评估策略：
   * 1. 如果禁用质量控制，直接通过
   * 2. 对于正奖励，检查是否超过阈值
   * 3. 对于负奖励，总是接受（失败是重要的学习信号）
   * 4. 对于零奖励，拒绝（无效信号）
   */
  async evaluateReward(
    breakdown: RewardBreakdown,
    userState?: UserState,
  ): Promise<RewardEvaluationResult> {
    const { increment, userId } = breakdown;

    // 质量控制禁用时，直接通过
    if (!this.enableQualityControl) {
      return {
        isValid: true,
        adjustedReward: increment,
        confidence: 1.0,
        reason: 'Quality control disabled',
        originalReward: increment,
      };
    }

    // 零奖励总是拒绝
    if (Math.abs(increment) < 1e-9) {
      return {
        isValid: false,
        adjustedReward: 0,
        confidence: 0,
        reason: 'Zero reward, no signal',
        originalReward: increment,
      };
    }

    // 负奖励总是接受（失败是重要信号）
    if (increment < 0) {
      return {
        isValid: true,
        adjustedReward: increment,
        confidence: 1.0,
        reason: 'Negative reward accepted (learning signal)',
        originalReward: increment,
      };
    }

    // 正奖励需要评估置信度
    const confidence = Math.abs(increment);

    // 考虑用户疲劳度（如果提供）
    let adjustedConfidence = confidence;
    if (userState) {
      const fatigueImpact = userState.F * 0.3;
      adjustedConfidence = confidence * (1 - fatigueImpact);
    }

    // 判断是否超过阈值
    const isValid = adjustedConfidence >= this.threshold;

    return {
      isValid,
      adjustedReward: isValid ? increment : 0,
      confidence: adjustedConfidence,
      reason: isValid
        ? `Reward passed threshold (${adjustedConfidence.toFixed(3)} >= ${this.threshold})`
        : `Reward below threshold (${adjustedConfidence.toFixed(3)} < ${this.threshold})`,
      originalReward: increment,
    };
  }

  /**
   * 批量评估奖励
   */
  async batchEvaluate(
    breakdowns: RewardBreakdown[],
    userStates: Map<string, UserState>,
  ): Promise<Map<string, RewardEvaluationResult>> {
    const results = new Map<string, RewardEvaluationResult>();

    for (const breakdown of breakdowns) {
      const userState = userStates.get(breakdown.userId);
      const result = await this.evaluateReward(breakdown, userState);
      results.set(breakdown.eventId, result);
    }

    return results;
  }
}

/**
 * 参数更新器
 * 负责将有效奖励应用到用户模型
 */
export class ParamUpdater {
  private rewardApplier: RewardApplier;
  private verboseLogging: boolean;

  constructor(rewardApplier: RewardApplier, verboseLogging = false) {
    this.rewardApplier = rewardApplier;
    this.verboseLogging = verboseLogging;
  }

  /**
   * 更新单个用户的参数
   */
  async updateUserParams(
    userId: string,
    breakdowns: RewardBreakdown[],
    evaluations: Map<string, RewardEvaluationResult>,
  ): Promise<ParamUpdateResult> {
    let updateCount = 0;
    let totalReward = 0;
    let totalConfidence = 0;
    let validCount = 0;

    for (const breakdown of breakdowns) {
      const evaluation = evaluations.get(breakdown.eventId);

      if (!evaluation || !evaluation.isValid) {
        if (this.verboseLogging) {
          amasLogger.debug(
            {
              userId,
              eventId: breakdown.eventId,
              reason: evaluation?.reason,
            },
            '[ParamUpdater] 跳过低质量奖励',
          );
        }
        continue;
      }

      try {
        // 应用奖励到模型
        await this.rewardApplier.applyReward(
          userId,
          evaluation.adjustedReward,
          breakdown.featureVector,
          breakdown.actionIndex,
        );

        updateCount++;
        totalReward += evaluation.adjustedReward;
        totalConfidence += evaluation.confidence;
        validCount++;

        if (this.verboseLogging) {
          amasLogger.debug(
            {
              userId,
              eventId: breakdown.eventId,
              reward: evaluation.adjustedReward,
              confidence: evaluation.confidence,
            },
            '[ParamUpdater] 应用奖励',
          );
        }
      } catch (err) {
        amasLogger.error(
          {
            err,
            userId,
            eventId: breakdown.eventId,
          },
          '[ParamUpdater] 应用奖励失败',
        );

        return {
          userId,
          updateCount,
          totalReward,
          avgConfidence: validCount > 0 ? totalConfidence / validCount : 0,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      userId,
      updateCount,
      totalReward,
      avgConfidence: validCount > 0 ? totalConfidence / validCount : 0,
      success: true,
    };
  }

  /**
   * 批量更新多个用户的参数
   */
  async batchUpdateParams(
    breakdownsByUser: Map<string, RewardBreakdown[]>,
    evaluations: Map<string, RewardEvaluationResult>,
  ): Promise<Map<string, ParamUpdateResult>> {
    const results = new Map<string, ParamUpdateResult>();

    for (const [userId, breakdowns] of breakdownsByUser) {
      const result = await this.updateUserParams(userId, breakdowns, evaluations);
      results.set(userId, result);
    }

    return results;
  }
}

// ==================== Offline Loop 主流程 ====================

/**
 * Offline Loop 处理器
 * 整合 DelayedReward → RewardEvaluator → ParamUpdater 流程
 */
export class OfflineLoop {
  private config: Required<OfflineLoopConfig>;
  private processor: DelayedRewardProcessor;
  private evaluator: RewardEvaluator;
  private updater: ParamUpdater;
  private userStateProvider: UserStateProvider | null;
  private cronTask: ScheduledTask | null = null;

  constructor(
    rewardApplier: RewardApplier,
    userStateProvider?: UserStateProvider,
    config?: OfflineLoopConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.processor = new DelayedRewardProcessor(this.config.rewardSchedule);
    this.evaluator = new RewardEvaluator(
      this.config.evaluationThreshold,
      this.config.enableQualityControl,
    );
    this.updater = new ParamUpdater(rewardApplier, this.config.verboseLogging);
    this.userStateProvider = userStateProvider ?? null;
  }

  /**
   * 添加奖励事件到队列
   */
  addReward(
    userId: string,
    reward: number,
    options?: {
      featureVector?: PersistableFeatureVector;
      actionIndex?: number;
      timestamp?: number;
    },
  ): string {
    return this.processor.addReward(userId, reward, options);
  }

  /**
   * 执行一次完整的离线循环处理
   * DelayedReward → RewardEvaluator → ParamUpdater
   */
  async processOnce(): Promise<{
    totalUsers: number;
    totalRewards: number;
    successCount: number;
    failureCount: number;
    filteredCount: number;
  }> {
    const startTime = Date.now();

    // Step 1: 聚合延迟奖励
    const aggregated = this.processor.aggregate();

    if (aggregated.breakdown.length === 0) {
      if (this.config.verboseLogging) {
        amasLogger.debug('[OfflineLoop] 无待处理奖励');
      }
      return {
        totalUsers: 0,
        totalRewards: 0,
        successCount: 0,
        failureCount: 0,
        filteredCount: 0,
      };
    }

    // 按用户分组
    const breakdownsByUser = new Map<string, RewardBreakdown[]>();
    const userIds = new Set<string>();

    for (const breakdown of aggregated.breakdown) {
      userIds.add(breakdown.userId);
      const userBreakdowns = breakdownsByUser.get(breakdown.userId) ?? [];
      userBreakdowns.push(breakdown);
      breakdownsByUser.set(breakdown.userId, userBreakdowns);
    }

    // Step 2: 获取用户状态（用于评估）
    const userStates = new Map<string, UserState>();
    if (this.userStateProvider) {
      for (const userId of userIds) {
        try {
          const state = await this.userStateProvider.getUserState(userId);
          if (state) {
            // 过滤高疲劳度用户
            if (state.F > this.config.fatigueThreshold) {
              amasLogger.info(
                {
                  userId,
                  fatigue: state.F,
                  threshold: this.config.fatigueThreshold,
                },
                '[OfflineLoop] 跳过高疲劳度用户',
              );
              breakdownsByUser.delete(userId);
              continue;
            }
            userStates.set(userId, state);
          }
        } catch (err) {
          amasLogger.warn({ err, userId }, '[OfflineLoop] 获取用户状态失败');
        }
      }
    }

    // Step 3: 评估奖励质量
    const evaluations = await this.evaluator.batchEvaluate(aggregated.breakdown, userStates);

    // 统计过滤的奖励数量
    let filteredCount = 0;
    for (const evaluation of evaluations.values()) {
      if (!evaluation.isValid) {
        filteredCount++;
      }
    }

    // Step 4: 更新模型参数
    const updateResults = await this.updater.batchUpdateParams(breakdownsByUser, evaluations);

    // 统计结果
    let successCount = 0;
    let failureCount = 0;

    for (const result of updateResults.values()) {
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;

    amasLogger.info(
      {
        totalUsers: userIds.size,
        totalRewards: aggregated.breakdown.length,
        successCount,
        failureCount,
        filteredCount,
        pendingCount: aggregated.pendingCount,
        duration,
      },
      '[OfflineLoop] 处理完成',
    );

    return {
      totalUsers: userIds.size,
      totalRewards: aggregated.breakdown.length,
      successCount,
      failureCount,
      filteredCount,
    };
  }

  /**
   * 启动定时任务
   */
  start(): void {
    if (this.cronTask) {
      amasLogger.warn('[OfflineLoop] 任务已在运行');
      return;
    }

    amasLogger.info({ schedule: this.config.cronSchedule }, '[OfflineLoop] 启动定时任务');

    this.cronTask = cron.schedule(this.config.cronSchedule, async () => {
      try {
        await this.processOnce();
      } catch (err) {
        amasLogger.error({ err }, '[OfflineLoop] 处理失败');
      }
    });

    this.cronTask.start();
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (!this.cronTask) {
      amasLogger.warn('[OfflineLoop] 任务未运行');
      return;
    }

    this.cronTask.stop();
    this.cronTask = null;
    amasLogger.info('[OfflineLoop] 定时任务已停止');
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    pendingCount: number;
    schedule: RewardSchedule[];
  } {
    return {
      pendingCount: this.processor.getPendingCount(),
      schedule: this.config.rewardSchedule,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(userId?: string): void {
    this.processor.clear(userId);
    amasLogger.info({ userId: userId ?? 'all' }, '[OfflineLoop] 队列已清空');
  }

  /**
   * 获取持久化状态
   */
  getState() {
    return {
      processor: this.processor.getState(),
      config: this.config,
    };
  }

  /**
   * 恢复持久化状态
   */
  setState(state: { processor: unknown; config?: OfflineLoopConfig }) {
    this.processor.setState(state.processor);
    if (state.config) {
      this.config = { ...DEFAULT_CONFIG, ...state.config };
    }
    amasLogger.info('[OfflineLoop] 状态已恢复');
  }
}

// ==================== 导出 ====================

export { DelayedRewardAggregator, WordMasteryEvaluator } from '../rewards';
