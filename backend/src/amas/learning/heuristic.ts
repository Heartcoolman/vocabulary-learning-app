/**
 * AMAS Learning Layer - Heuristic Baseline Learner
 * 启发式基准学习器
 *
 * 核心设计:
 * - 基于认知科学经验规则的可解释策略
 * - 低计算成本，适合作为降级路径
 * - 综合考虑疲劳、注意力、动机和近期表现
 *
 * 打分维度:
 * | 维度 | 权重 | 含义 |
 * |------|------|------|
 * | 支持度 | 35% | 提示级别与疲劳适配 |
 * | 难度适配 | 25% | 难度与能力匹配 |
 * | 动机匹配 | 20% | 新词比例与动机匹配 |
 * | 节奏适配 | 15% | 间隔与速度匹配 |
 * | 负载惩罚 | -5% | 批量大小惩罚 |
 */

import { Action, UserState } from '../types';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities
} from './base-learner';
import { amasLogger } from '../../logger';

// ==================== 类型定义 ====================

/**
 * 启发式学习器上下文
 */
export interface HeuristicContext extends BaseLearnerContext {
  /** 疲劳偏置（调整用） */
  fatigueBias?: number;
  /** 动机偏置（调整用） */
  motivationBias?: number;
}

/**
 * 启发式学习器持久化状态
 */
export interface HeuristicState {
  /** 版本号 */
  version: string;
  /** 更新计数 */
  updateCount: number;
  /** 平均奖励（EMA） */
  avgReward: number;
  /** 平均错误率（EMA） */
  avgErrorRate: number;
  /** 上次更新时间戳 */
  lastUpdated: number;
}

// ==================== 常量 ====================

/** EMA平滑系数（历史权重） */
const EMA_ALPHA = 0.85;

/** 打分权重配置 */
const SCORE_WEIGHTS = {
  support: 0.35,      // 支持度权重
  difficulty: 0.25,   // 难度适配权重
  motivation: 0.20,   // 动机匹配权重
  pace: 0.15,         // 节奏适配权重
  loadPenalty: 0.05   // 负载惩罚权重
} as const;

/** 响应时间归一化范围 */
const RESPONSE_TIME_RANGE = { min: 500, max: 10000 };

// ==================== 实现 ====================

/**
 * 启发式基准学习器
 *
 * 适用场景:
 * - 集成学习中的稳定基准
 * - 其他模型失效时的降级路径
 * - 快速获得合理策略
 */
export class HeuristicLearner
  implements BaseLearner<UserState, Action, HeuristicContext, HeuristicState>
{
  private static readonly NAME = 'HeuristicLearner';
  private static readonly VERSION = '1.0.0';

  /** 内部状态 */
  private state: HeuristicState = this.createInitialState();

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择最优动作
   *
   * 策略: 根据用户状态和上下文对每个动作打分
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: HeuristicContext
  ): ActionSelection<Action> {
    if (!actions || actions.length === 0) {
      throw new Error('[HeuristicLearner] 动作列表不能为空');
    }

    const ctx = this.normalizeContext(state, context);
    const confidence = this.computeConfidence(ctx);

    let bestSelection: ActionSelection<Action> | null = null;

    for (const action of actions) {
      const { score, breakdown } = this.scoreAction(state, action, ctx);

      if (!bestSelection || score > bestSelection.score) {
        bestSelection = {
          action,
          score,
          confidence,
          meta: {
            breakdown,
            fatigue: state.F,
            attention: state.A,
            motivation: state.M,
            recentErrorRate: ctx.recentErrorRate
          }
        };
      }
    }

    return bestSelection ?? {
      action: actions[0],
      score: 0,
      confidence: 0
    };
  }

  /**
   * 更新模型
   *
   * 仅更新EMA统计量，不学习复杂参数
   * 当context缺失时，基于reward推导即时错误率
   */
  update(
    _state: UserState,
    _action: Action,
    reward: number,
    context: HeuristicContext
  ): void {
    const boundedReward = this.clamp(reward, -1, 1);

    // 错误率推导：context有值则使用，否则基于reward推导
    // reward > 0 视为正确（错误率降低），reward <= 0 视为错误（错误率升高）
    let errorRate: number;
    if (context?.recentErrorRate !== undefined) {
      errorRate = this.clamp(context.recentErrorRate, 0, 1);
    } else {
      // 基于reward推导：reward=1时错误率=0，reward=-1时错误率=1
      errorRate = (1 - boundedReward) / 2;
    }

    // EMA更新
    this.state.avgReward =
      EMA_ALPHA * this.state.avgReward + (1 - EMA_ALPHA) * boundedReward;
    this.state.avgErrorRate =
      EMA_ALPHA * this.state.avgErrorRate + (1 - EMA_ALPHA) * errorRate;
    this.state.updateCount += 1;
    this.state.lastUpdated = Date.now();
  }

  /**
   * 获取状态（用于持久化）
   */
  getState(): HeuristicState {
    return {
      version: HeuristicLearner.VERSION,
      updateCount: this.state.updateCount,
      avgReward: this.state.avgReward,
      avgErrorRate: this.state.avgErrorRate,
      lastUpdated: this.state.lastUpdated
    };
  }

  /**
   * 恢复状态（带数值校验）
   */
  setState(state: HeuristicState): void {
    if (!state) {
      amasLogger.warn('[HeuristicLearner] 无效状态，跳过恢复');
      return;
    }

    // 版本检查
    if (state.version !== HeuristicLearner.VERSION) {
      amasLogger.debug({ from: state.version, to: HeuristicLearner.VERSION }, '[HeuristicLearner] 版本迁移');
    }

    this.state = {
      version: HeuristicLearner.VERSION,
      updateCount: this.validateNonNegativeInt(state.updateCount, 0),
      avgReward: this.clamp(
        this.validateNumber(state.avgReward, 0),
        -1,
        1
      ),
      avgErrorRate: this.clamp(
        this.validateNumber(state.avgErrorRate, 0.5),
        0,
        1
      ),
      lastUpdated: this.validateNumber(state.lastUpdated, Date.now())
    };
  }

  /**
   * 重置到初始状态
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  getName(): string {
    return HeuristicLearner.NAME;
  }

  getVersion(): string {
    return HeuristicLearner.VERSION;
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: false,
      requiresPretraining: false,
      minSamplesForReliability: 1,
      primaryUseCase: '低成本基准策略与降级路径'
    };
  }

  getUpdateCount(): number {
    return this.state.updateCount;
  }

  // ==================== 公开便捷方法 ====================

  /**
   * 获取平均奖励
   */
  getAvgReward(): number {
    return this.state.avgReward;
  }

  /**
   * 获取平均错误率
   */
  getAvgErrorRate(): number {
    return this.state.avgErrorRate;
  }

  // ==================== 私有方法 ====================

  /**
   * 创建初始状态
   */
  private createInitialState(): HeuristicState {
    return {
      version: HeuristicLearner.VERSION,
      updateCount: 0,
      avgReward: 0,
      avgErrorRate: 0.5,
      lastUpdated: Date.now()
    };
  }

  /**
   * 归一化上下文
   *
   * 对所有数值字段进行有限性检查，防止NaN/Infinity污染
   */
  private normalizeContext(
    state: UserState,
    context?: HeuristicContext
  ): NormalizedContext {
    const fatigueBias = this.clamp(context?.fatigueBias ?? 0, -0.3, 0.3);
    const motivationBias = this.clamp(context?.motivationBias ?? 0, -0.3, 0.3);

    // 安全提取state字段（防止NaN/Infinity）
    const safeFatigue = this.safeNumber(state.F, 0.5);
    const safeAttention = this.safeNumber(state.A, 0.5);
    const safeMotivation = this.safeNumber(state.M, 0);
    const safeMemory = this.safeNumber(state.C?.mem, 0.5);
    const safeSpeed = this.safeNumber(state.C?.speed, 0.5);

    return {
      recentErrorRate: this.clamp(
        context?.recentErrorRate ?? this.state.avgErrorRate,
        0,
        1
      ),
      recentResponseTime: this.clamp(
        context?.recentResponseTime ?? 2000,
        RESPONSE_TIME_RANGE.min,
        RESPONSE_TIME_RANGE.max
      ),
      timeBucket: Math.round(this.clamp(context?.timeBucket ?? 12, 0, 23)),
      fatigue: this.clamp(safeFatigue + fatigueBias, 0, 1),
      attention: this.clamp(safeAttention, 0, 1),
      motivationNorm: this.clamp((safeMotivation + 1) / 2 + motivationBias, 0, 1),
      memoryCapacity: this.clamp(safeMemory, 0, 1),
      speed: this.clamp(safeSpeed, 0, 1)
    };
  }

  /**
   * 对动作打分
   *
   * @returns 分数和分解明细
   */
  private scoreAction(
    _state: UserState,
    action: Action,
    ctx: NormalizedContext
  ): { score: number; breakdown: ScoreBreakdown } {
    const breakdown: ScoreBreakdown = {
      support: 0,
      difficulty: 0,
      motivation: 0,
      pace: 0,
      loadPenalty: 0
    };

    // 1. 支持度得分：提示级别与疲劳的匹配
    // 疲劳高时，高提示级别得分高
    const hintLevel = action.hint_level / 2; // 归一化到[0,1]
    const fatigueDemand = ctx.fatigue;
    breakdown.support = hintLevel * (0.5 + fatigueDemand * 0.5) +
      (1 - ctx.recentErrorRate) * 0.3;

    // 2. 难度适配得分：难度与能力的匹配
    // 能力高且疲劳低时，高难度得分高
    const difficultyValue = this.normalizeDifficulty(action.difficulty);
    const capabilityHeadroom = ctx.memoryCapacity * (1 - ctx.fatigue);
    const difficultyMatch = 1 - Math.abs(difficultyValue - capabilityHeadroom);
    breakdown.difficulty = difficultyMatch * (1 - ctx.recentErrorRate);

    // 3. 动机匹配得分：新词比例与动机的匹配
    // 动机高时，新词多得分高
    const newRatioNorm = action.new_ratio / 0.4; // 归一化到约[0.25,1]
    const motivationMatch = ctx.motivationNorm * newRatioNorm +
      (1 - ctx.motivationNorm) * (1 - newRatioNorm);
    breakdown.motivation = motivationMatch * ctx.attention;

    // 4. 节奏适配得分：间隔与速度的匹配
    // 速度快时，短间隔得分高
    const paceMatch = 1 - Math.abs(action.interval_scale - 1);
    const speedFactor = ctx.speed > 0.5 ? 1 - action.interval_scale / 2 : action.interval_scale / 2;
    breakdown.pace = (paceMatch + speedFactor) / 2;

    // 5. 负载惩罚：批量大小惩罚
    // 疲劳高时，大批量惩罚大
    const batchNorm = (action.batch_size - 5) / 11; // [5,16] → [0,1]
    breakdown.loadPenalty = batchNorm * ctx.fatigue;

    // 加权求和
    const score =
      SCORE_WEIGHTS.support * breakdown.support +
      SCORE_WEIGHTS.difficulty * breakdown.difficulty +
      SCORE_WEIGHTS.motivation * breakdown.motivation +
      SCORE_WEIGHTS.pace * breakdown.pace -
      SCORE_WEIGHTS.loadPenalty * breakdown.loadPenalty;

    return { score, breakdown };
  }

  /**
   * 计算置信度
   */
  private computeConfidence(ctx: NormalizedContext): number {
    // 基于稳定性、疲劳余量和历史奖励
    const stability = 1 - ctx.recentErrorRate;
    const fatigueHeadroom = 1 - ctx.fatigue;
    const rewardSignal = (this.state.avgReward + 1) / 2; // [-1,1] → [0,1]

    return this.clamp(
      0.4 * stability + 0.35 * fatigueHeadroom + 0.25 * rewardSignal,
      0.1,
      0.9
    );
  }

  /**
   * 归一化难度等级
   */
  private normalizeDifficulty(difficulty: Action['difficulty']): number {
    switch (difficulty) {
      case 'easy':
        return 0.2;
      case 'hard':
        return 0.8;
      case 'mid':
      default:
        return 0.5;
    }
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 校验数字有效性
   */
  private validateNumber(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }

  /**
   * 校验非负整数
   */
  private validateNonNegativeInt(value: unknown, fallback: number): number {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return fallback;
    }
    return Math.floor(value);
  }

  /**
   * 安全数字提取（防止NaN/Infinity）
   */
  private safeNumber(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }
}

// ==================== 内部类型 ====================

interface NormalizedContext {
  recentErrorRate: number;
  recentResponseTime: number;
  timeBucket: number;
  fatigue: number;
  attention: number;
  motivationNorm: number;
  memoryCapacity: number;
  speed: number;
}

interface ScoreBreakdown {
  support: number;
  difficulty: number;
  motivation: number;
  pace: number;
  loadPenalty: number;
}

// ==================== 导出默认实例 ====================

export const defaultHeuristicLearner = new HeuristicLearner();
