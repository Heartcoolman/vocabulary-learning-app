/**
 * LinUCB 适配器
 *
 * 将现有的 LinUCB 学习器适配到新的决策接口
 */

import { LinUCB, LinUCBContext } from '../algorithms/learners';
import { Action, UserState } from '../types';
import { IDecisionPolicy, DecisionContext, DecisionResult, IFeatureBuilder } from '../interfaces';
import { amasLogger } from '../../logger';

/**
 * LinUCB 适配器选项
 */
export interface LinUCBAdapterOptions {
  /** LinUCB 实例（可选，用于复用现有实例） */
  linucb?: LinUCB;
  /** 探索系数 alpha（可选） */
  alpha?: number;
  /** 正则化系数 lambda（可选） */
  lambda?: number;
  /** 特征维度（可选） */
  dimension?: number;
  /** 特征构建器（可选，用于自定义特征构建） */
  featureBuilder?: IFeatureBuilder;
}

/**
 * LinUCB 决策策略适配器
 *
 * 实现 IDecisionPolicy 接口，将 LinUCB 算法适配到统一决策接口
 *
 * 核心映射：
 * - selectAction: 调用 LinUCB.selectAction，返回最优 Action
 * - updateModel: 调用 LinUCB.update，更新模型参数
 * - 特征构建: 使用 LinUCB 内置的 buildContextVector
 */
export class LinUCBAdapter implements IDecisionPolicy {
  private readonly linucb: LinUCB;
  private readonly featureBuilder?: IFeatureBuilder;

  constructor(options: LinUCBAdapterOptions = {}) {
    // 初始化或复用 LinUCB 实例
    if (options.linucb) {
      this.linucb = options.linucb;
    } else {
      this.linucb = new LinUCB({
        alpha: options.alpha,
        lambda: options.lambda,
        dimension: options.dimension,
      });
    }

    this.featureBuilder = options.featureBuilder;
  }

  /**
   * 选择最优动作
   *
   * 适配逻辑：
   * 1. 将 DecisionContext 转换为 LinUCBContext
   * 2. 调用 LinUCB.selectAction 获取最优动作
   * 3. 包装为 DecisionResult 返回
   */
  selectAction(
    state: UserState,
    actions: Action[],
    features: number[],
    context: DecisionContext,
  ): DecisionResult {
    try {
      // 转换上下文
      const linucbContext: LinUCBContext = {
        recentErrorRate: context.recentErrorRate,
        recentResponseTime: context.recentResponseTime,
        timeBucket: context.timeBucket,
      };

      // 调用 LinUCB 选择动作
      const selection = this.linucb.selectAction(state, actions, linucbContext);

      // 构建解释
      const explanation = this.buildExplanation(selection, state, context);

      // 包装为 DecisionResult
      return {
        action: selection.action,
        // LinUCB 的 uncertainty 并非天然落在 [0,1]，这里映射为决策置信度
        confidence: this.normalizeConfidence(selection.confidence),
        explanation,
        score: selection.score,
        meta: {
          algorithm: 'LinUCB',
          ...selection.meta,
        },
      };
    } catch (error) {
      // 错误处理：回退到第一个动作
      amasLogger.error({ error, userId: context.userId }, '[LinUCBAdapter] 选择动作失败');

      return {
        action: actions[0],
        confidence: 0,
        explanation: '算法异常，使用默认策略',
        score: -Number.MAX_VALUE,
        meta: {
          algorithm: 'LinUCB',
          error: String(error),
        },
      };
    }
  }

  /**
   * 更新模型
   *
   * 适配逻辑：
   * 直接使用传入的 features 参数更新模型，确保与选择时使用的特征一致
   *
   * 注意：features 参数应该是选择动作时使用的相同特征向量，
   * 这样可以确保学习更新的语义正确性（使用相同特征的动作-奖励对）
   */
  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void {
    try {
      // 直接使用传入的特征向量更新模型
      // 这确保了更新时使用的特征与选择时一致，避免特征不匹配
      this.linucb.updateWithFeatureVector(features, reward);
    } catch (error) {
      amasLogger.error({ error, userId: context.userId }, '[LinUCBAdapter] 更新模型失败');
    }
  }

  /**
   * 获取策略名称
   */
  getName(): string {
    return 'LinUCBAdapter';
  }

  /**
   * 获取策略版本
   */
  getVersion(): string {
    return '1.0.0';
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取底层 LinUCB 实例（用于高级操作）
   */
  getLinUCB(): LinUCB {
    return this.linucb;
  }

  /**
   * 设置探索系数
   */
  setAlpha(alpha: number): void {
    this.linucb.setAlpha(alpha);
  }

  /**
   * 获取探索系数
   */
  getAlpha(): number {
    return this.linucb.getAlpha();
  }

  /**
   * 获取更新次数
   */
  getUpdateCount(): number {
    return this.linucb.getUpdateCount();
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.linucb.reset();
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
    const { action } = selection;
    const parts: string[] = [];

    // 基于动作参数生成解释
    if (action.interval_scale !== 1.0) {
      if (action.interval_scale > 1.0) {
        parts.push(`延长复习间隔(${action.interval_scale}x)`);
      } else {
        parts.push(`缩短复习间隔(${action.interval_scale}x)`);
      }
    }

    if (action.new_ratio > 0.2) {
      parts.push(`增加新词比例(${Math.round(action.new_ratio * 100)}%)`);
    }

    parts.push(`难度${this.translateDifficulty(action.difficulty)}`);

    if (action.batch_size !== 12) {
      parts.push(`批量大小${action.batch_size}`);
    }

    if (action.hint_level > 0) {
      parts.push(`提示级别${action.hint_level}`);
    }

    // 基于状态生成解释
    if (state.F > 0.6) {
      parts.push('检测到疲劳');
    }

    if (state.A < 0.4) {
      parts.push('注意力偏低');
    }

    if (state.M < -0.3) {
      parts.push('动机下降');
    }

    return parts.length > 0 ? `LinUCB 策略: ${parts.join(', ')}` : 'LinUCB 策略: 标准参数';
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

  private normalizeConfidence(uncertainty: number): number {
    if (!Number.isFinite(uncertainty) || uncertainty < 0) return 0;
    return 1 / (1 + uncertainty);
  }
}

/**
 * 导出默认适配器实例
 */
export const defaultLinUCBAdapter = new LinUCBAdapter();
