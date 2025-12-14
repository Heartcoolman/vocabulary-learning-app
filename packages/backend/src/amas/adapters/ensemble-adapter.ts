/**
 * Ensemble 适配器
 *
 * 将现有的 EnsembleLearningFramework 适配到新的决策接口
 */

import { EnsembleLearningFramework, EnsembleContext } from '../decision/ensemble';
import { Action, UserState, ColdStartPhase } from '../types';
import { IDecisionPolicy, DecisionContext, DecisionResult } from '../interfaces';
import { amasLogger } from '../../logger';

/**
 * Ensemble 适配器选项
 */
export interface EnsembleAdapterOptions {
  /** Ensemble 实例（可选，用于复用现有实例） */
  ensemble?: EnsembleLearningFramework;
}

/**
 * Ensemble 决策策略适配器
 *
 * 实现 IDecisionPolicy 接口，将集成学习框架适配到统一决策接口
 *
 * 核心映射：
 * - selectAction: 调用 Ensemble.selectAction，返回集成决策结果
 * - updateModel: 调用 Ensemble.update，更新所有子学习器
 *
 * 特点：
 * - 冷启动阶段由 ColdStartManager 主导
 * - 成熟阶段多学习器加权投票
 * - 动态权重根据表现自适应调整
 */
export class EnsembleAdapter implements IDecisionPolicy {
  private readonly ensemble: EnsembleLearningFramework;
  /** 缓存最近的状态（用于 updateModel） */
  private lastState?: UserState;

  constructor(options: EnsembleAdapterOptions = {}) {
    // 初始化或复用 Ensemble 实例
    if (options.ensemble) {
      this.ensemble = options.ensemble;
    } else {
      this.ensemble = new EnsembleLearningFramework();
    }
  }

  /**
   * 选择最优动作
   *
   * 适配逻辑：
   * 1. 将 DecisionContext 转换为 EnsembleContext
   * 2. 调用 Ensemble.selectAction 获取集成决策
   * 3. 包装为 DecisionResult 返回
   */
  selectAction(
    state: UserState,
    actions: Action[],
    features: number[],
    context: DecisionContext,
  ): DecisionResult {
    try {
      // 缓存状态，供 updateModel 使用
      this.lastState = state;

      // 获取当前阶段
      const phase = this.ensemble.getPhase();

      // 转换上下文
      const ensembleContext: EnsembleContext = {
        phase,
        base: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        linucb: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        thompson: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        actr: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
          trace: [],
        },
        heuristic: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
      };

      // 调用 Ensemble 选择动作
      const selection = this.ensemble.selectAction(state, actions, ensembleContext);

      // 构建解释
      const explanation = this.buildExplanation(selection, state, phase);

      // 包装为 DecisionResult
      return {
        action: selection.action,
        confidence: selection.confidence,
        explanation,
        score: selection.score,
        meta: {
          algorithm: 'Ensemble',
          phase,
          weights: this.ensemble.getWeights(),
          ...selection.meta,
        },
      };
    } catch (error) {
      // 错误处理：回退到第一个动作
      amasLogger.error({ error, userId: context.userId }, '[EnsembleAdapter] 选择动作失败');

      return {
        action: actions[0],
        confidence: 0,
        explanation: '算法异常，使用默认策略',
        score: -Number.MAX_VALUE,
        meta: {
          algorithm: 'Ensemble',
          error: String(error),
        },
      };
    }
  }

  /**
   * 更新模型
   *
   * 适配逻辑：
   * 1. 使用 selectAction 缓存的 UserState
   * 2. 将 DecisionContext 转换为 EnsembleContext
   * 3. 调用 Ensemble.update 更新所有子学习器
   *
   * 注意：
   * - features 参数当前未使用，因为 EnsembleLearningFramework 基于 UserState 而非特征向量
   * - 使用缓存的 lastState 确保学习更新语义正确，避免虚拟状态污染
   * - 如果 lastState 不可用（例如未调用 selectAction），使用虚拟状态作为降级方案
   */
  updateModel(action: Action, reward: number, features: number[], context: DecisionContext): void {
    try {
      // 使用缓存的状态，或降级到虚拟状态
      const state = this.lastState ?? this.createDummyUserState();

      if (!this.lastState) {
        amasLogger.warn(
          { userId: context.userId },
          '[EnsembleAdapter] updateModel 在 selectAction 之前调用，使用虚拟状态',
        );
      }

      // 获取当前阶段
      const phase = this.ensemble.getPhase();

      // 转换上下文
      const ensembleContext: EnsembleContext = {
        phase,
        base: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        linucb: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        thompson: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
        actr: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
          trace: [],
        },
        heuristic: {
          recentErrorRate: context.recentErrorRate,
          recentResponseTime: context.recentResponseTime,
          timeBucket: context.timeBucket,
        },
      };

      // 调用 Ensemble 更新
      this.ensemble.update(state, action, reward, ensembleContext);

      // 清空缓存的状态，防止误用陈旧数据
      this.lastState = undefined;
    } catch (error) {
      amasLogger.error({ error, userId: context.userId }, '[EnsembleAdapter] 更新模型失败');
    }
  }

  /**
   * 获取策略名称
   */
  getName(): string {
    return 'EnsembleAdapter';
  }

  /**
   * 获取策略版本
   */
  getVersion(): string {
    return '1.0.0';
  }

  // ==================== 便捷方法 ====================

  /**
   * 获取底层 Ensemble 实例（用于高级操作）
   */
  getEnsemble(): EnsembleLearningFramework {
    return this.ensemble;
  }

  /**
   * 获取当前权重
   */
  getWeights(): { thompson: number; linucb: number; actr: number; heuristic: number } {
    return this.ensemble.getWeights();
  }

  /**
   * 获取当前阶段
   */
  getPhase(): ColdStartPhase {
    return this.ensemble.getPhase();
  }

  /**
   * 是否完成冷启动
   */
  isWarm(): boolean {
    return this.ensemble.isWarm();
  }

  /**
   * 获取冷启动进度 [0,1]
   */
  getColdStartProgress(): number {
    return this.ensemble.getColdStartProgress();
  }

  /**
   * 获取更新次数
   */
  getUpdateCount(): number {
    return this.ensemble.getUpdateCount();
  }

  /**
   * 重置模型
   */
  reset(): void {
    this.ensemble.reset();
    this.lastState = undefined;
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
    phase: ColdStartPhase,
  ): string {
    const parts: string[] = [];

    // 基于阶段生成解释
    switch (phase) {
      case 'classify':
        parts.push('用户分类阶段');
        break;
      case 'explore':
        parts.push('策略探索阶段');
        break;
      case 'normal':
        parts.push('集成决策');
        break;
    }

    // 基于权重生成解释
    if (phase === 'normal' && selection.meta?.weights) {
      const weights = selection.meta.weights as Record<string, number>;
      const topLearner = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];

      if (topLearner) {
        const [name, weight] = topLearner;
        parts.push(`主导: ${this.translateLearner(name)}(${Math.round(weight * 100)}%)`);
      }
    }

    // 基于动作参数生成解释
    const { action } = selection;
    if (action.interval_scale !== 1.0) {
      parts.push(`间隔${action.interval_scale}x`);
    }

    parts.push(`难度${this.translateDifficulty(action.difficulty)}`);

    if (action.new_ratio > 0.2) {
      parts.push(`新词${Math.round(action.new_ratio * 100)}%`);
    }

    // 基于状态生成解释
    if (state.F > 0.6) {
      parts.push('检测疲劳');
    }

    if (state.A < 0.4) {
      parts.push('注意力低');
    }

    if (state.M < -0.3) {
      parts.push('动机下降');
    }

    return parts.join(', ');
  }

  /**
   * 翻译学习器名称
   */
  private translateLearner(learner: string): string {
    const map: Record<string, string> = {
      linucb: 'LinUCB',
      thompson: 'Thompson',
      actr: 'ACT-R',
      heuristic: '启发式',
    };
    return map[learner] || learner;
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
   * 创建虚拟用户状态（用于不需要完整状态的操作）
   */
  private createDummyUserState(): UserState {
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
export const defaultEnsembleAdapter = new EnsembleAdapter();
