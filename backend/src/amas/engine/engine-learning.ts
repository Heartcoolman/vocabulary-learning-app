/**
 * AMAS Engine - 学习层编排模块
 *
 * 负责动作选择、模型更新和奖励计算
 */

import { LinUCB } from '../learning/linucb';
import { EnsembleLearningFramework, EnsembleContext } from '../decision/ensemble';
import {
  isColdStartEnabled,
  isEnsembleEnabled,
  isUserParamsManagerEnabled,
  getEnsembleLearnerFlags
} from '../config/feature-flags';
import {
  ACTION_SPACE,
  REWARD_WEIGHTS,
  REFERENCE_RESPONSE_TIME
} from '../config/action-space';
import { RewardProfile, REWARD_PROFILES } from '../config/reward-profiles';
import { Action, ColdStartPhase, RawEvent, UserState } from '../types';
import { UserModels, WordReviewHistory, clamp } from './engine-types';
import { ReviewTrace } from '../modeling/actr-memory';
import { recordModelDrift } from '../../monitoring/amas-metrics';

/**
 * 决策上下文
 * 继承 BaseLearnerContext 的索引签名以保持类型兼容
 */
export interface DecisionContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
  /** 扩展字段（兼容 BaseLearnerContext） */
  [key: string]: unknown;
}

/**
 * 动作选择结果
 */
export interface ActionSelection {
  action: Action;
  contextVec?: Float32Array;
  confidence?: number;
}

/**
 * 学习层管理器
 *
 * 负责：
 * - 动作选择逻辑
 * - 模型更新逻辑
 * - 奖励计算
 */
export class LearningManager {
  /**
   * 选择动作
   *
   * 根据用户状态、阶段和启用的模块选择最佳动作
   * @param wordReviewHistory 单词复习历史（用于 ACT-R 模型）
   */
  selectAction(
    state: UserState,
    models: UserModels,
    context: DecisionContext,
    coldStartPhase: ColdStartPhase,
    interactionCount: number,
    recentAccuracy: number,
    wordReviewHistory?: WordReviewHistory[]
  ): ActionSelection {
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;
    const inColdStartPhase = coldStartPhase !== 'normal';

    // 应用用户参数（如果启用）
    if (models.userParams && isUserParamsManagerEnabled()) {
      // 用户参数管理器会在外部处理
    } else if (models.bandit instanceof LinUCB && !inColdStartPhase) {
      // 使用默认冷启动探索率
      const alpha = models.bandit.getColdStartAlpha(interactionCount, recentAccuracy, state.F);
      models.bandit.setAlpha(alpha);
    }

    // 转换 WordReviewHistory 为 ReviewTrace（ACT-R 使用的格式）
    const actrTrace: ReviewTrace[] = (wordReviewHistory ?? []).map(h => ({
      secondsAgo: h.secondsAgo,
      isCorrect: h.isCorrect
    }));

    let action: Action;
    let contextVec: Float32Array | undefined;
    let confidence: number | undefined;

    if (inColdStartPhase && coldStartEnabled && models.coldStart) {
      // 冷启动阶段: 使用 ColdStartManager
      const selection = models.coldStart.selectAction(state, ACTION_SPACE, context);
      action = selection.action;

      // 构建 LinUCB 上下文向量用于延迟奖励
      contextVec = this.buildContextVector(models, state, action, context);
    } else if (isEnsembleEnabled() && models.bandit instanceof EnsembleLearningFramework) {
      // 成熟阶段 + Ensemble 启用: 使用 EnsembleLearningFramework
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: context,
        linucb: context,
        thompson: context,
        actr: { ...context, trace: actrTrace },
        heuristic: context
      };

      // 应用学习器功能开关
      const learnerFlags = getEnsembleLearnerFlags();
      const ensembleState = models.bandit.getState();
      const weights = { ...ensembleState.weights };
      if (!learnerFlags.thompson) weights.thompson = 0;
      if (!learnerFlags.actr) weights.actr = 0;
      if (!learnerFlags.heuristic) weights.heuristic = 0;
      models.bandit.setState({ ...ensembleState, weights });

      const selection = models.bandit.selectAction(state, ACTION_SPACE, ensembleContext);
      action = selection.action;

      // 构建 LinUCB 上下文向量用于延迟奖励
      const internalLinUCB = new LinUCB();
      internalLinUCB.setModel(ensembleState.linucb);
      contextVec = internalLinUCB.buildContextVector({
        state,
        action,
        ...context
      });
    } else {
      // 默认: 使用 LinUCB
      if (models.bandit instanceof LinUCB) {
        const selection = models.bandit.selectAction(state, ACTION_SPACE, context);
        action = selection.action;
        confidence = selection.confidence;
        contextVec = models.bandit.buildContextVector({
          state,
          action,
          ...context
        });
      } else {
        // 回退到默认动作
        action = ACTION_SPACE[0];
      }
    }

    return { action, contextVec, confidence };
  }

  /**
   * 构建上下文向量
   * Optimization #1: 改为public以支持在alignedAction后重建contextVector
   */
  public buildContextVector(
    models: UserModels,
    state: UserState,
    action: Action,
    context: DecisionContext
  ): Float32Array | undefined {
    if (models.bandit instanceof LinUCB) {
      return models.bandit.buildContextVector({
        state,
        action,
        ...context
      });
    } else if (models.bandit instanceof EnsembleLearningFramework) {
      // 从 Ensemble 内部的 LinUCB 构建上下文向量
      const ensembleState = models.bandit.getState();
      const internalLinUCB = new LinUCB();
      internalLinUCB.setModel(ensembleState.linucb);
      return internalLinUCB.buildContextVector({
        state,
        action,
        ...context
      });
    }
    return undefined;
  }

  /**
   * 更新模型
   *
   * 更新决策模型、冷启动管理器和用户参数管理器
   * @param wordReviewHistory 单词复习历史（用于 ACT-R 模型）
   */
  updateModels(
    models: UserModels,
    state: UserState,
    prevState: UserState,
    action: Action,
    reward: number,
    context: DecisionContext,
    coldStartPhase: ColdStartPhase,
    userId: string,
    isCorrect: boolean,
    wordReviewHistory?: WordReviewHistory[]
  ): void {
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;

    // 转换 WordReviewHistory 为 ReviewTrace（ACT-R 使用的格式）
    const actrTrace: ReviewTrace[] = (wordReviewHistory ?? []).map(h => ({
      secondsAgo: h.secondsAgo,
      isCorrect: h.isCorrect
    }));

    // 更新决策模型
    if (models.bandit instanceof EnsembleLearningFramework) {
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: context,
        linucb: context,
        thompson: context,
        actr: { ...context, trace: actrTrace },
        heuristic: context
      };
      models.bandit.update(state, action, reward, ensembleContext);
      recordModelDrift({ model: 'ensemble', phase: coldStartPhase });
    } else if (models.bandit instanceof LinUCB) {
      models.bandit.update(state, action, reward, context);
      recordModelDrift({ model: 'linucb', phase: coldStartPhase });
    }

    // 更新冷启动管理器
    if (coldStartEnabled && models.coldStart) {
      models.coldStart.update(state, action, reward, context);
    }

    // 更新用户参数管理器
    if (models.userParams && isUserParamsManagerEnabled()) {
      models.userParams.updateParams(userId, {
        accuracy: isCorrect ? 1 : 0,
        fatigueChange: state.F - prevState.F,
        motivationChange: state.M - prevState.M,
        reward
      });
    }
  }

  /**
   * 计算奖励
   *
   * 混合奖励计算，考虑正确率、疲劳、速度和挫折
   * 支持多目标优化 - 根据用户选择的学习模式调整权重
   */
  computeReward(
    event: RawEvent,
    state: UserState,
    profile: RewardProfile = REWARD_PROFILES.standard
  ): number {
    const { correct, fatigue, speed, frustration, engagement } = profile.weights;

    const correctValue = event.isCorrect ? 1 : -1;
    const fatiguePenalty = state.F;
    const speedGain = clamp(
      REFERENCE_RESPONSE_TIME / Math.max(event.responseTime, 1000) - 1,
      -1,
      1
    );
    const frustrationValue = (event.retryCount > 1 || state.M < 0) ? 1 : 0;

    // 新增: 参与度计算
    const engagementValue = this.computeEngagement(event, state);

    const rawReward =
      correct * correctValue -
      fatigue * fatiguePenalty +
      speed * speedGain -
      frustration * frustrationValue +
      engagement * engagementValue;

    // 归一化到 [-1, 1]
    return clamp(rawReward / 2, -1, 1);
  }

  /**
   * 计算参与度值
   *
   * 基于停留时间和交互密度判断用户参与度
   */
  private computeEngagement(event: RawEvent, state: UserState): number {
    const optimalDwellTime = 3000; // 最佳停留时间：3秒

    // 停留时间得分: 越接近最佳值得分越高
    const dwellScore = 1 - Math.abs((event.dwellTime || 0) - optimalDwellTime) / optimalDwellTime;
    const normalizedDwellScore = clamp(dwellScore, 0, 1);

    // 交互密度得分
    const interactionScore = event.interactionDensity || 0.5;

    // 综合得分
    return clamp((normalizedDwellScore + interactionScore) / 2, 0, 1);
  }

  /**
   * 应用用户参数
   */
  applyUserParams(
    models: UserModels,
    userId: string,
    interactionCount: number,
    recentAccuracy: number,
    fatigue: number,
    inColdStartPhase: boolean
  ): void {
    if (models.userParams && isUserParamsManagerEnabled()) {
      const params = models.userParams.getParams(userId);
      if (models.bandit instanceof LinUCB) {
        models.bandit.setAlpha(params.alpha);
      }
    } else if (models.bandit instanceof LinUCB && !inColdStartPhase) {
      // 使用默认冷启动探索率
      const alpha = models.bandit.getColdStartAlpha(interactionCount, recentAccuracy, fatigue);
      models.bandit.setAlpha(alpha);
    }
  }
}
