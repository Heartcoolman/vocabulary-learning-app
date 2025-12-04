/**
 * AMAS Learning Layer - Thompson Explore Hook
 *
 * 将 Thompson Sampling 的核心采样能力封装为可选探索钩子，
 * 用于在 ColdStart 的 explore 阶段增强探索能力
 *
 * 设计目的：
 * - 保留 Thompson 的 Beta 采样优势
 * - 简化为探索专用接口
 * - 可选集成到 ColdStart 阶段
 */

import { Action, UserState } from '../types';
import { ThompsonSampling } from './thompson-sampling';
import { ThompsonExploreHook, ExploreContext } from '../engine/engine-types';

/**
 * 探索概率配置
 */
interface ExploreConfig {
  /** 基础探索概率 [0,1] */
  baseExploreRate: number;
  /** 交互次数衰减因子 */
  decayFactor: number;
  /** 最小探索概率 */
  minExploreRate: number;
  /** 疲劳惩罚因子 */
  fatiguePenalty: number;
}

const DEFAULT_CONFIG: ExploreConfig = {
  baseExploreRate: 0.3,
  decayFactor: 0.02,
  minExploreRate: 0.05,
  fatiguePenalty: 0.1
};

/**
 * Thompson 探索钩子实现
 *
 * 将 ThompsonSampling 封装为轻量级探索钩子
 */
export class ThompsonExploreHookImpl implements ThompsonExploreHook {
  private thompson: ThompsonSampling;
  private config: ExploreConfig;

  constructor(config: Partial<ExploreConfig> = {}) {
    this.thompson = new ThompsonSampling();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 判断是否应该进行探索
   *
   * 探索概率随交互次数递减，同时考虑疲劳度
   */
  shouldExplore(state: UserState, context: ExploreContext): boolean {
    const { baseExploreRate, decayFactor, minExploreRate, fatiguePenalty } = this.config;

    // 计算动态探索概率
    const decayedRate = baseExploreRate * Math.exp(-decayFactor * context.interactionCount);
    const fatigueAdjusted = decayedRate * (1 - fatiguePenalty * state.F);
    const exploreRate = Math.max(minExploreRate, fatigueAdjusted);

    // 随机决定是否探索
    return Math.random() < exploreRate;
  }

  /**
   * 选择探索动作
   *
   * 使用 Thompson Sampling 的 Beta 采样策略
   */
  selectExploreAction(
    state: UserState,
    actions: Action[],
    context: ExploreContext
  ): Action {
    if (actions.length === 0) {
      throw new Error('Action list cannot be empty');
    }

    if (actions.length === 1) {
      return actions[0];
    }

    // 使用 Thompson Sampling 选择动作
    const selection = this.thompson.selectAction(state, actions, {
      recentErrorRate: context.recentErrorRate,
      recentResponseTime: context.recentResponseTime,
      timeBucket: context.timeBucket
    });

    return selection.action;
  }

  /**
   * 更新探索模型
   */
  updateExplore(
    state: UserState,
    action: Action,
    reward: number,
    context: ExploreContext
  ): void {
    this.thompson.update(state, action, reward, {
      recentErrorRate: context.recentErrorRate,
      recentResponseTime: context.recentResponseTime,
      timeBucket: context.timeBucket
    });
  }

  /**
   * 获取内部 Thompson Sampling 状态（用于调试）
   */
  getState(): unknown {
    return this.thompson.getState();
  }

  /**
   * 重置探索模型
   */
  reset(): void {
    this.thompson.reset();
  }
}

/**
 * 创建默认的 Thompson 探索钩子
 */
export function createThompsonExploreHook(
  config?: Partial<ExploreConfig>
): ThompsonExploreHook {
  return new ThompsonExploreHookImpl(config);
}
