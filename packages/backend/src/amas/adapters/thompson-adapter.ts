/**
 * Thompson Sampling 适配器
 *
 * 将现有的 ThompsonSampling 学习器适配到新的决策接口
 */

import { ThompsonSampling, ThompsonContext, ThompsonSamplingOptions } from '../algorithms/learners';
import { Action, UserState } from '../types';
import { IDecisionPolicy, DecisionContext, DecisionResult } from '../interfaces';
import { amasLogger } from '../../logger';

/**
 * Thompson Sampling 适配器选项
 */
export interface ThompsonAdapterOptions {
  /** Thompson Sampling 实例（可选，用于复用现有实例） */
  thompson?: ThompsonSampling;
  /** 先验 alpha（可选） */
  priorAlpha?: number;
  /** 先验 beta（可选） */
  priorBeta?: number;
  /** 上下文权重下限（可选） */
  minContextWeight?: number;
  /** 上下文权重上限（可选） */
  maxContextWeight?: number;
  /** 启用软更新模式（可选） */
  enableSoftUpdate?: boolean;
}

/**
 * Thompson Sampling 决策策略适配器
 *
 * 实现 IDecisionPolicy 接口，将 Thompson Sampling 算法适配到统一决策接口
 *
 * 核心映射：
 * - selectAction: 调用 ThompsonSampling.selectAction，返回最优 Action
 * - updateModel: 调用 ThompsonSampling.update，更新 Beta 分布参数
 *
 * 特点：
 * - 自然的探索-利用平衡（概率匹配）
 * - 冷启动友好（先验分布引导）
 * - 计算高效（O(|A|) 时间复杂度）
 */
export class ThompsonAdapter implements IDecisionPolicy {
  private readonly thompson: ThompsonSampling;
  private lastState: UserState | null = null; // 缓存最后一次的 UserState

  constructor(options: ThompsonAdapterOptions = {}) {
    // 初始化或复用 Thompson Sampling 实例
    if (options.thompson) {
      this.thompson = options.thompson;
    } else {
      const tsOptions: ThompsonSamplingOptions = {
        priorAlpha: options.priorAlpha,
        priorBeta: options.priorBeta,
        minContextWeight: options.minContextWeight,
        maxContextWeight: options.maxContextWeight,
        enableSoftUpdate: options.enableSoftUpdate,
      };
      this.thompson = new ThompsonSampling(tsOptions);
    }
  }

  /**
   * 选择最优动作
   *
   * 适配逻辑：
   * 1. 将 DecisionContext 转换为 ThompsonContext
   * 2. 调用 ThompsonSampling.selectAction 获取最优动作
   * 3. 包装为 DecisionResult 返回
   * 4. 缓存 state 用于后续的 updateModel 调用
   */
  selectAction(
    state: UserState,
    actions: Action[],
    features: number[],
    context: DecisionContext,
  ): DecisionResult {
    try {
      // 缓存 state 用于 updateModel
      this.lastState = state;

      // 转换上下文
      const thompsonContext: ThompsonContext = {
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket,
      };

      // 调用 Thompson Sampling 选择动作
      const selection = this.thompson.selectAction(state, actions, thompsonContext);

      // 构建解释
      const explanation = this.buildExplanation(selection, state, context);

      // 包装为 DecisionResult
      return {
        action: selection.action,
        confidence: selection.confidence,
        explanation,
        score: selection.score,
        meta: {
          algorithm: 'ThompsonSampling',
          ...selection.meta,
        },
      };
    } catch (error) {
      // 错误处理：回退到第一个动作
      amasLogger.error({ error, userId: context.userId }, '[ThompsonAdapter] 选择动作失败');

      return {
        action: actions[0],
        confidence: 0,
        explanation: '算法异常，使用默认策略',
        score: 0,
        meta: {
          algorithm: 'ThompsonSampling',
          error: String(error),
        },
      };
    }
  }

  /**
   * 更新模型
   *
   * 适配逻辑：
   * 1. 使用缓存的 UserState（来自上一次 selectAction 调用）
   * 2. 将 DecisionContext 转换为 ThompsonContext
   * 3. 调用 ThompsonSampling.update 更新 Beta 分布参数
   *
   * 注意：features 参数被忽略，因为 ThompsonSampling 不使用特征向量，
   * 而是基于 UserState 和上下文构建个性化的上下文键
   */
  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void {
    try {
      // 转换上下文
      const thompsonContext: ThompsonContext = {
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket,
      };

      // 使用缓存的 state，如果没有则使用默认状态
      const state = this.lastState ?? this.createDefaultUserState();

      if (!this.lastState) {
        amasLogger.warn(
          { userId: context.userId },
          '[ThompsonAdapter] updateModel 在 selectAction 之前调用，使用默认状态',
        );
      }

      // 调用 Thompson Sampling 更新
      this.thompson.update(state, action, reward, thompsonContext);
    } catch (error) {
      amasLogger.error({ error, userId: context.userId }, '[ThompsonAdapter] 更新模型失败');
    }
  }

  /**
   * 获取策略名称
   */
  getName(): string {
    return 'ThompsonAdapter';
  }

  /**
   * 获取策略版本
   */
  getVersion(): string {
    return '1.0.0';
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取底层 Thompson Sampling 实例（用于高级操作）
   */
  getThompson(): ThompsonSampling {
    return this.thompson;
  }

  /**
   * 获取动作的期望成功率
   */
  getExpectedReward(action: Action): number {
    return this.thompson.getExpectedReward(action);
  }

  /**
   * 获取动作的样本量
   */
  getSampleCount(action: Action): number {
    return this.thompson.getSampleCount(action);
  }

  /**
   * 获取更新次数
   */
  getUpdateCount(): number {
    return this.thompson.getUpdateCount();
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.thompson.reset();
  }

  // ==================== 私有方法 ====================

  /**
   * 构建决策解释
   */
  private buildExplanation(
    selection: {
      action: Action;
      score: number;
      confidence: number;
      meta?: Record<string, unknown>;
    },
    state: UserState,
    context: DecisionContext,
  ): string {
    const { action, meta } = selection;
    const parts: string[] = [];

    // 基于采样元数据生成解释
    if (meta) {
      if (typeof meta.globalSample === 'number' && typeof meta.contextualSample === 'number') {
        const globalSample = meta.globalSample as number;
        const contextualSample = meta.contextualSample as number;
        const diff = Math.abs(globalSample - contextualSample);

        if (diff > 0.2) {
          if (contextualSample > globalSample) {
            parts.push('个性化策略优势明显');
          } else {
            parts.push('全局策略更优');
          }
        }
      }

      if (typeof meta.globalAlpha === 'number' && typeof meta.globalBeta === 'number') {
        const alpha = meta.globalAlpha as number;
        const beta = meta.globalBeta as number;
        const total = alpha + beta;
        const successRate = alpha / total;

        if (total > 10) {
          parts.push(`历史成功率${Math.round(successRate * 100)}%`);
        } else {
          parts.push('探索阶段');
        }
      }
    }

    // 基于动作参数生成解释
    if (action.interval_scale !== 1.0) {
      if (action.interval_scale > 1.0) {
        parts.push(`延长间隔${action.interval_scale}x`);
      } else {
        parts.push(`缩短间隔${action.interval_scale}x`);
      }
    }

    parts.push(`难度${this.translateDifficulty(action.difficulty)}`);

    if (action.new_ratio > 0.2) {
      parts.push(`新词${Math.round(action.new_ratio * 100)}%`);
    }

    // 基于状态生成解释
    if (state.F > 0.6) {
      parts.push('考虑疲劳');
    }

    if (state.A < 0.4) {
      parts.push('注意力低');
    }

    return parts.length > 0 ? `Thompson策略: ${parts.join(', ')}` : 'Thompson策略: 探索决策';
  }

  /**
   * 翻译难度等级
   */
  private translateDifficulty(difficulty: 'easy' | 'mid' | 'hard'): string {
    const map = {
      easy: '简单',
      mid: '中等',
      hard: '困难',
    };
    return map[difficulty];
  }

  /**
   * 创建默认用户状态（当 updateModel 在 selectAction 之前调用时使用）
   */
  private createDefaultUserState(): UserState {
    return {
      A: 0.7,
      F: 0.3,
      C: { mem: 0.6, speed: 0.6, stability: 0.6 },
      M: 0,
      conf: 0.5,
      ts: Date.now(),
    };
  }
}

/**
 * 导出默认适配器实例
 */
export const defaultThompsonAdapter = new ThompsonAdapter();
