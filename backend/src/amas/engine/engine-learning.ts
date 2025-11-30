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
import { Action, ColdStartPhase, RawEvent, UserState } from '../types';
import { UserModels, clamp } from './engine-types';

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
   */
  selectAction(
    state: UserState,
    models: UserModels,
    context: DecisionContext,
    coldStartPhase: ColdStartPhase,
    interactionCount: number,
    recentAccuracy: number
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

    let action: Action;
    let contextVec: Float32Array | undefined;

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
        actr: { ...context, trace: [] },
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
        action = models.bandit.selectFromActionSpace(state, context);
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

    return { action, contextVec };
  }

  /**
   * 构建上下文向量
   */
  private buildContextVector(
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
    isCorrect: boolean
  ): void {
    const coldStartEnabled = isColdStartEnabled() && models.coldStart !== null;

    // 更新决策模型
    if (models.bandit instanceof EnsembleLearningFramework) {
      const ensembleContext: EnsembleContext = {
        phase: coldStartPhase,
        base: context,
        linucb: context,
        thompson: context,
        actr: { ...context, trace: [] },
        heuristic: context
      };
      models.bandit.update(state, action, reward, ensembleContext);
    } else if (models.bandit instanceof LinUCB) {
      models.bandit.update(state, action, reward, context);
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
   */
  computeReward(event: RawEvent, state: UserState): number {
    const { correct, fatigue, speed, frustration } = REWARD_WEIGHTS;

    const correctValue = event.isCorrect ? 1 : -1;
    const fatiguePenalty = state.F;
    const speedGain = clamp(
      REFERENCE_RESPONSE_TIME / Math.max(event.responseTime, 1000) - 1,
      -1,
      1
    );
    const frustrationValue = (event.retryCount > 1 || state.M < 0) ? 1 : 0;

    const rawReward =
      correct * correctValue -
      fatigue * fatiguePenalty +
      speed * speedGain -
      frustration * frustrationValue;

    // 归一化到 [-1, 1]
    return clamp(rawReward / 2, -1, 1);
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
