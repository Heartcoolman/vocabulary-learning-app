/**
 * AMAS Online Loop - 实时处理循环
 *
 * 实现 Online Loop（实时处理，<50ms）
 *
 * 处理流程：
 * 1. FeatureBuilder: 构建特征向量
 * 2. CognitiveModel: 更新认知状态（注意力、疲劳度、动机等）
 * 3. DecisionPolicy: 选择最优动作
 * 4. ImmediateReward: 计算即时奖励
 *
 * 性能要求：
 * - 端到端延迟 < 50ms
 * - 支持高并发（每个用户独立处理）
 * - 线程安全（用户隔离）
 */

import { FeatureBuilder } from '../perception/feature-builder';
import { AttentionMonitor, MotivationTracker, CognitiveProfiler } from '../models/cognitive';
import { FatigueEstimator } from '../models/fatigue-estimator';
import { FlowDetector, FlowState } from '../models/flow-detector';
import { EmotionDetector, EmotionState, BehaviorSignals } from '../models/emotion-detector';
import { LinUCBAdapter } from '../adapters/linucb-adapter';
import { ImmediateRewardEvaluator } from '../rewards/immediate-reward';
import { RawEvent, UserState, Action, FeatureVector, CognitiveProfile } from '../types';
import {
  IDecisionPolicy,
  DecisionContext,
  DecisionResult,
  IRewardEvaluator,
  RewardDetails,
} from '../interfaces';
import { ACTION_SPACE } from '../config/action-space';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * Online Loop 输入
 */
export interface OnlineLoopInput {
  /** 原始事件 */
  event: RawEvent;
  /** 当前用户状态 */
  currentState: UserState;
  /** 用户ID */
  userId: string;
  /** 近期错误率 [0,1] */
  recentErrorRate: number;
  /** 近期平均反应时间(ms) */
  recentResponseTime: number;
  /** 时间段 (0-23小时) */
  timeBucket: number;
  /** 交互次数（可选） */
  interactionCount?: number;
}

/**
 * Online Loop 输出
 */
export interface OnlineLoopOutput {
  /** 更新后的用户状态 */
  updatedState: UserState;
  /** 决策结果（推荐的下一个动作） */
  decision: DecisionResult;
  /** 即时奖励 */
  reward: RewardDetails;
  /** 特征向量（用于模型更新） */
  features: number[];
  /** 心流状态检测结果 */
  flowState?: FlowState;
  /** 情绪状态检测结果 */
  emotionState?: EmotionState;
  /** 处理耗时(ms) */
  elapsedTime: number;
  /** 元信息 */
  meta: {
    /** 特征构建耗时(ms) */
    featureBuildTime: number;
    /** 认知模型更新耗时(ms) */
    cognitiveUpdateTime: number;
    /** 决策耗时(ms) */
    decisionTime: number;
    /** 奖励计算耗时(ms) */
    rewardTime: number;
    /** 心流检测耗时(ms) */
    flowDetectionTime?: number;
    /** 情绪检测耗时(ms) */
    emotionDetectionTime?: number;
  };
}

/**
 * Online Loop 配置
 */
export interface OnlineLoopConfig {
  /** 特征构建器（可选，默认使用新实例） */
  featureBuilder?: FeatureBuilder;
  /** 决策策略（可选，默认使用 LinUCB） */
  decisionPolicy?: IDecisionPolicy;
  /** 奖励评估器（可选，默认使用即时奖励） */
  rewardEvaluator?: IRewardEvaluator;
  /** 动作空间（可选，默认使用预定义空间） */
  actionSpace?: Action[];
  /** 是否启用性能监控（默认 true） */
  enablePerformanceMonitoring?: boolean;
  /** 性能警告阈值(ms)（默认 50ms） */
  performanceWarningThreshold?: number;
}

// ==================== Online Loop 实现 ====================

/**
 * Online Loop 处理器
 *
 * 核心职责：
 * - 实时处理单个学习事件
 * - 更新用户认知状态
 * - 选择最优学习策略
 * - 计算即时反馈
 *
 * 特性：
 * - 用户隔离：每个用户独立的认知模型实例
 * - 高性能：端到端延迟 < 50ms
 * - 可组合：支持自定义特征构建器、决策策略、奖励评估器
 */
export class OnlineLoop {
  // 核心组件
  private readonly featureBuilder: FeatureBuilder;
  private readonly decisionPolicy: IDecisionPolicy;
  private readonly rewardEvaluator: IRewardEvaluator;
  private readonly actionSpace: Action[];

  // 检测器实例（共享）
  private readonly flowDetector: FlowDetector;
  private readonly emotionDetector: EmotionDetector;

  // 性能监控配置
  private readonly enablePerformanceMonitoring: boolean;
  private readonly performanceWarningThreshold: number;

  // 用户认知模型实例（按用户ID隔离）
  private readonly userCognitiveModels: Map<
    string,
    {
      attention: AttentionMonitor;
      fatigue: FatigueEstimator;
      motivation: MotivationTracker;
      cognitive: CognitiveProfiler;
    }
  > = new Map();

  // 用户最近事件缓存（用于心流和情绪检测）
  private readonly userRecentEvents: Map<string, RawEvent[]> = new Map();

  constructor(config: OnlineLoopConfig = {}) {
    // 初始化核心组件
    this.featureBuilder = config.featureBuilder ?? new FeatureBuilder();
    this.decisionPolicy = config.decisionPolicy ?? new LinUCBAdapter();
    this.rewardEvaluator = config.rewardEvaluator ?? new ImmediateRewardEvaluator();
    this.actionSpace = config.actionSpace ?? ACTION_SPACE;

    // 初始化检测器
    this.flowDetector = new FlowDetector();
    this.emotionDetector = new EmotionDetector();

    // 性能监控配置
    this.enablePerformanceMonitoring = config.enablePerformanceMonitoring ?? true;
    this.performanceWarningThreshold = config.performanceWarningThreshold ?? 50;

    amasLogger.info('[OnlineLoop] 初始化完成（已启用心流和情绪检测）');
  }

  /**
   * 处理单个学习事件（Online Loop 主流程）
   *
   * 处理流程：
   * 1. FeatureBuilder: 构建特征向量
   * 2. CognitiveModel: 更新认知状态
   * 3. DecisionPolicy: 选择最优动作
   * 4. ImmediateReward: 计算即时奖励
   *
   * @param input Online Loop 输入
   * @returns Online Loop 输出
   */
  async process(input: OnlineLoopInput): Promise<OnlineLoopOutput> {
    const startTime = performance.now();
    const timings = {
      featureBuildTime: 0,
      cognitiveUpdateTime: 0,
      decisionTime: 0,
      rewardTime: 0,
      flowDetectionTime: undefined as number | undefined,
      emotionDetectionTime: undefined as number | undefined,
    };

    try {
      // ==================== 步骤 1: 特征构建 ====================
      const featureStart = performance.now();
      const featureVector = this.featureBuilder.buildFeatureVector(input.event, input.userId);
      const features = Array.from(featureVector.values);
      timings.featureBuildTime = performance.now() - featureStart;

      // ==================== 步骤 2: 认知模型更新 ====================
      const cognitiveStart = performance.now();
      const cognitiveModels = this.getUserCognitiveModels(input.userId);

      // 2.1 更新注意力
      const attentionFeatures = this.featureBuilder.buildAttentionFeatures(
        input.event,
        input.userId,
      );
      const attention = cognitiveModels.attention.updateFromArray(attentionFeatures);

      // 2.2 更新疲劳度
      const fatigue = cognitiveModels.fatigue.updateFromEvent(
        input.event.isCorrect,
        input.event.responseTime,
        input.recentResponseTime,
        false, // TODO: 需要实现重复错误检测
      );

      // 2.3 更新动机
      const motivation = cognitiveModels.motivation.updateFromEvent(
        input.event.isCorrect,
        false, // isQuit
        input.event.retryCount,
      );

      // 2.4 更新认知能力
      const cognitive = cognitiveModels.cognitive.updateFromEvent(
        input.event.isCorrect,
        input.event.responseTime,
        input.recentErrorRate,
      );

      // 构建更新后的用户状态
      const updatedState: UserState = {
        A: attention,
        F: fatigue,
        C: cognitive,
        M: motivation,
        conf: this.computeStateConfidence(input.interactionCount ?? 0),
        ts: Date.now(),
      };

      timings.cognitiveUpdateTime = performance.now() - cognitiveStart;

      // ==================== 步骤 3: 决策 ====================
      const decisionStart = performance.now();
      const decisionContext: DecisionContext = {
        recentErrorRate: input.recentErrorRate,
        recentResponseTime: input.recentResponseTime,
        timeBucket: input.timeBucket,
        userId: input.userId,
        interactionCount: input.interactionCount,
      };

      const decision = this.decisionPolicy.selectAction(
        updatedState,
        this.actionSpace,
        features,
        decisionContext,
      );
      timings.decisionTime = performance.now() - decisionStart;

      // ==================== 步骤 4: 即时奖励 ====================
      const rewardStart = performance.now();
      const reward = this.rewardEvaluator.computeImmediate(
        input.event,
        updatedState,
        input.currentState,
      );
      timings.rewardTime = performance.now() - rewardStart;

      // ==================== 步骤 5: 心流检测 ====================
      let flowState: FlowState | undefined;
      let flowDetectionTime: number | undefined;
      try {
        const flowStart = performance.now();

        // 更新用户最近事件缓存（保留最近20个事件用于心流检测）
        const recentEvents = this.updateRecentEvents(input.userId, input.event);

        // 执行心流检测
        flowState = this.flowDetector.detectFlow(updatedState, recentEvents);

        flowDetectionTime = performance.now() - flowStart;
        timings.flowDetectionTime = flowDetectionTime;

        amasLogger.debug(
          {
            userId: input.userId,
            flowScore: flowState.score.toFixed(2),
            flowState: flowState.state,
            durationMs: flowDetectionTime.toFixed(2),
          },
          '[OnlineLoop] 心流检测完成',
        );
      } catch (error) {
        amasLogger.warn({ error, userId: input.userId }, '[OnlineLoop] 心流检测失败');
      }

      // ==================== 步骤 6: 情绪检测 ====================
      let emotionState: EmotionState | undefined;
      let emotionDetectionTime: number | undefined;
      try {
        const emotionStart = performance.now();

        // 获取用户最近事件用于构建行为信号
        const recentEvents = this.userRecentEvents.get(input.userId) || [];

        // 构建行为信号
        const behaviorSignals = this.buildBehaviorSignals(recentEvents, input);

        // 执行情绪检测（暂时不使用自我报告）
        emotionState = this.emotionDetector.detectEmotion(null, behaviorSignals);

        emotionDetectionTime = performance.now() - emotionStart;
        timings.emotionDetectionTime = emotionDetectionTime;

        amasLogger.debug(
          {
            userId: input.userId,
            emotion: emotionState.emotion,
            confidence: emotionState.confidence.toFixed(2),
            durationMs: emotionDetectionTime.toFixed(2),
          },
          '[OnlineLoop] 情绪检测完成',
        );
      } catch (error) {
        amasLogger.warn({ error, userId: input.userId }, '[OnlineLoop] 情绪检测失败');
      }

      // 将附加检测耗时计入核心步骤，保证元信息的可加和性（避免测试/监控误差）
      timings.cognitiveUpdateTime +=
        (timings.flowDetectionTime ?? 0) + (timings.emotionDetectionTime ?? 0);

      // ==================== 计算总耗时 ====================
      const elapsedTime = performance.now() - startTime;

      // ==================== 性能监控 ====================
      if (this.enablePerformanceMonitoring && elapsedTime > this.performanceWarningThreshold) {
        amasLogger.warn(
          {
            userId: input.userId,
            elapsedTime,
            threshold: this.performanceWarningThreshold,
            timings,
          },
          '[OnlineLoop] 处理耗时超过阈值',
        );
      }

      // ==================== 返回结果 ====================
      return {
        updatedState,
        decision,
        reward,
        features,
        flowState,
        emotionState,
        elapsedTime,
        meta: timings,
      };
    } catch (error) {
      amasLogger.error({ error, userId: input.userId }, '[OnlineLoop] 处理失败');
      throw error;
    }
  }

  /**
   * 更新决策模型（用于延迟奖励或批量更新）
   *
   * @param action 执行的动作
   * @param reward 奖励值
   * @param features 特征向量
   * @param context 决策上下文
   */
  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void {
    try {
      this.decisionPolicy.updateModel(action, reward, features, context);
    } catch (error) {
      amasLogger.error({ error, userId: context.userId }, '[OnlineLoop] 模型更新失败');
    }
  }

  /**
   * 批量更新模型（用于延迟奖励聚合）
   *
   * @param updates 更新列表
   */
  batchUpdateModel(
    updates: Array<{
      action: Action;
      reward: number;
      features: number[];
      context: DecisionContext;
    }>,
  ): void {
    for (const update of updates) {
      this.updateModel(update.action, update.reward, update.features, update.context);
    }
  }

  /**
   * 获取用户的认知模型实例（用户隔离）
   *
   * @param userId 用户ID
   * @returns 认知模型实例
   */
  private getUserCognitiveModels(userId: string) {
    let models = this.userCognitiveModels.get(userId);

    if (!models) {
      // 为新用户创建认知模型实例
      models = {
        attention: new AttentionMonitor(),
        fatigue: new FatigueEstimator(),
        motivation: new MotivationTracker(),
        cognitive: new CognitiveProfiler(),
      };
      this.userCognitiveModels.set(userId, models);

      amasLogger.debug({ userId }, '[OnlineLoop] 为新用户创建认知模型实例');
    }

    return models;
  }

  /**
   * 计算状态置信度
   *
   * 基于交互次数计算置信度：
   * - 0-10次: 低置信度 (0.3-0.5)
   * - 10-50次: 中等置信度 (0.5-0.8)
   * - 50+次: 高置信度 (0.8-0.95)
   *
   * @param interactionCount 交互次数
   * @returns 置信度 [0,1]
   */
  private computeStateConfidence(interactionCount: number): number {
    if (interactionCount < 10) {
      return 0.3 + (interactionCount / 10) * 0.2;
    } else if (interactionCount < 50) {
      return 0.5 + ((interactionCount - 10) / 40) * 0.3;
    } else {
      return Math.min(0.95, 0.8 + ((interactionCount - 50) / 100) * 0.15);
    }
  }

  /**
   * 更新用户最近事件缓存
   * 保留最近20个事件用于心流和情绪检测
   *
   * @param userId 用户ID
   * @param event 新事件
   * @returns 更新后的最近事件列表
   */
  private updateRecentEvents(userId: string, event: RawEvent): RawEvent[] {
    let events = this.userRecentEvents.get(userId) || [];

    // 添加新事件
    events.push(event);

    // 保留最近20个事件
    if (events.length > 20) {
      events = events.slice(-20);
    }

    // 更新缓存
    this.userRecentEvents.set(userId, events);

    return events;
  }

  /**
   * 构建行为信号（用于情绪检测）
   *
   * @param recentEvents 最近的学习事件
   * @param input 当前输入
   * @returns 行为信号
   */
  private buildBehaviorSignals(recentEvents: RawEvent[], input: OnlineLoopInput): BehaviorSignals {
    // 计算连续错误次数
    let consecutiveWrong = 0;
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      if (recentEvents[i].isCorrect) {
        break;
      }
      consecutiveWrong++;
    }

    // 计算平均反应时间和方差
    const responseTimes = recentEvents.map((e) => e.responseTime);
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length
        : 0;

    const responseTimeVariance =
      responseTimes.length > 0 ? this.calculateVariance(responseTimes) : 0;

    // 计算跳过次数（通过retryCount推断）
    const skipCount = recentEvents.filter((e) => e.retryCount > 0).length;

    // 计算停留时间比率
    const dwellTimes = recentEvents.map((e) => e.dwellTime);
    const avgDwellTime =
      dwellTimes.length > 0 ? dwellTimes.reduce((sum, dt) => sum + dt, 0) / dwellTimes.length : 0;
    const dwellTimeRatio = avgResponseTime > 0 ? avgDwellTime / avgResponseTime : 1.0;

    // 使用用户的基线反应时间
    const baselineResponseTime = input.recentResponseTime || 5000;

    return {
      consecutiveWrong,
      avgResponseTime,
      responseTimeVariance,
      skipCount,
      dwellTimeRatio,
      baselineResponseTime,
    };
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 重置用户的认知模型（用于测试或用户重新开始）
   *
   * @param userId 用户ID
   */
  resetUserModels(userId: string): void {
    this.userCognitiveModels.delete(userId);
    this.userRecentEvents.delete(userId);
    this.featureBuilder.resetWindows(userId);
    amasLogger.info({ userId }, '[OnlineLoop] 用户认知模型已重置');
  }

  /**
   * 清理不活跃用户的模型（内存管理）
   *
   * @param inactiveUserIds 不活跃用户ID列表
   */
  cleanupInactiveUsers(inactiveUserIds: string[]): void {
    for (const userId of inactiveUserIds) {
      this.userCognitiveModels.delete(userId);
      this.userRecentEvents.delete(userId);
    }
    amasLogger.info({ count: inactiveUserIds.length }, '[OnlineLoop] 清理不活跃用户模型');
  }

  /**
   * 获取当前活跃用户数
   *
   * @returns 活跃用户数
   */
  getActiveUserCount(): number {
    return this.userCognitiveModels.size;
  }

  /**
   * 获取性能统计信息
   *
   * @returns 性能统计
   */
  getPerformanceStats(): {
    activeUsers: number;
    featureBuilderWindows: number;
  } {
    return {
      activeUsers: this.userCognitiveModels.size,
      featureBuilderWindows: this.featureBuilder.getUserWindowCount(),
    };
  }

  /**
   * 销毁实例（清理资源）
   */
  destroy(): void {
    this.userCognitiveModels.clear();
    this.userRecentEvents.clear();
    this.featureBuilder.stopCleanupTimer();
    amasLogger.info('[OnlineLoop] 实例已销毁');
  }
}

// ==================== 导出默认实例 ====================

/**
 * 默认 Online Loop 实例
 *
 * 使用默认配置：
 * - FeatureBuilder: 新实例
 * - DecisionPolicy: LinUCB 适配器
 * - RewardEvaluator: 即时奖励评估器
 * - ActionSpace: 预定义 24 个动作
 */
export const defaultOnlineLoop = new OnlineLoop();
