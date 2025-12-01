/**
 * AMAS Decision Layer - Ensemble Learning Framework
 * 集成学习框架
 *
 * 核心设计:
 * - 冷启动阶段: ColdStartManager主导决策
 * - 成熟阶段: 多学习器加权投票
 * - 动态权重: 根据表现指数加权更新
 *
 * 集成成员与初始权重:
 * | 成员 | 权重 | 特长 |
 * |------|------|------|
 * | Thompson | 30% | 冷启动探索 |
 * | LinUCB | 30% | 成熟期利用 |
 * | ACT-R | 20% | 长期记忆建模 |
 * | Heuristic | 20% | 稳定基准 |
 *
 * 权重更新策略:
 * w_new = w_old * exp(η * gradient)
 * gradient = reward * alignment * (0.5 + confidence/2)
 * alignment = 1 if action matched, -0.5 otherwise
 */

import {
  Action,
  BanditModel,
  ColdStartPhase,
  UserState
} from '../types';
import {
  ActionSelection,
  BaseLearner,
  BaseLearnerContext,
  LearnerCapabilities
} from '../learning/base-learner';
import { ColdStartManager, ColdStartState } from '../learning/coldstart';
import { LinUCB, LinUCBContext } from '../learning/linucb';
import {
  ThompsonContext,
  ThompsonSampling,
  ThompsonSamplingState
} from '../learning/thompson-sampling';
import {
  ACTRContext,
  ACTRMemoryModel,
  ACTRState
} from '../modeling/actr-memory';
import {
  HeuristicContext,
  HeuristicLearner,
  HeuristicState
} from '../learning/heuristic';
import { ACTION_SPACE, getActionIndex } from '../config/action-space';

// ==================== 类型定义 ====================

/**
 * 集成成员标识
 */
export type EnsembleMember = 'thompson' | 'linucb' | 'actr' | 'heuristic';

/**
 * 集成权重
 */
export interface EnsembleWeights {
  thompson: number;
  linucb: number;
  actr: number;
  heuristic: number;
}

/**
 * 集成上下文
 */
export interface EnsembleContext {
  /** 当前阶段 */
  phase: ColdStartPhase;
  /** 基础上下文 */
  base?: BaseLearnerContext;
  /** LinUCB特定上下文 */
  linucb?: Partial<LinUCBContext>;
  /** Thompson特定上下文 */
  thompson?: Partial<ThompsonContext>;
  /** ACT-R特定上下文（含复习轨迹） */
  actr?: Partial<ACTRContext>;
  /** Heuristic特定上下文 */
  heuristic?: Partial<HeuristicContext>;
}

/**
 * 集成学习框架持久化状态
 */
export interface EnsembleState {
  /** 版本号 */
  version: string;
  /** 集成权重 */
  weights: EnsembleWeights;
  /** 更新计数 */
  updateCount: number;
  /** 冷启动状态 */
  coldStart: ColdStartState;
  /** LinUCB状态 */
  linucb: BanditModel;
  /** Thompson状态 */
  thompson: ThompsonSamplingState;
  /** ACT-R状态 */
  actr: ACTRState;
  /** Heuristic状态 */
  heuristic: HeuristicState;
  /** 上一次成员投票（用于决策轨迹记录） */
  lastVotes?: Record<string, unknown>;
  /** 上一次决策置信度（用于决策轨迹记录） */
  lastConfidence?: number;
}

/**
 * 聚合决策详情
 */
interface AggregationDetails {
  /** 各成员投票 */
  votes: Map<string, VoteDetail>;
  /** 最终选择 */
  winner: Action;
  /** 加权分数 */
  weightedScore: number;
  /** 综合置信度 */
  aggregatedConfidence: number;
}

/**
 * 单个投票详情
 */
interface VoteDetail {
  action: Action;
  rawScore: number;
  scaledScore: number;
  confidence: number;
  weight: number;
  contribution: number;
}

// ==================== 常量 ====================

/**
 * 初始权重配置
 *
 * 设计原则：
 * - LinUCB 作为主力学习器（40%）
 * - Thompson/ACT-R 作为辅助探索（各 25%）
 * - Heuristic 仅作为降级路径（10%）
 */
const INITIAL_WEIGHTS: EnsembleWeights = {
  thompson: 0.25,
  linucb: 0.40,
  actr: 0.25,
  heuristic: 0.10
};

/** 权重下限（防止被完全淘汰） */
const MIN_WEIGHT = 0.05;

/** 权重学习率 */
const WEIGHT_LEARNING_RATE = 0.25;

/** 分数缩放因子（用于tanh归一化） */
const SCORE_SCALE = 2.0;

// ==================== 实现 ====================

/**
 * 集成学习框架
 *
 * 适用场景:
 * - 新用户冷启动过渡
 * - 多策略融合决策
 * - 稳健性要求高的场景
 */
export class EnsembleLearningFramework
  implements BaseLearner<UserState, Action, EnsembleContext, EnsembleState>
{
  private static readonly NAME = 'EnsembleLearningFramework';
  private static readonly VERSION = '1.0.0';

  /** 子学习器 */
  private readonly coldStart = new ColdStartManager();
  private readonly linucb = new LinUCB();
  private readonly thompson = new ThompsonSampling();
  private readonly actr = new ACTRMemoryModel();
  private readonly heuristic = new HeuristicLearner();

  /** 集成权重 */
  private weights: EnsembleWeights = { ...INITIAL_WEIGHTS };

  /** 更新计数 */
  private updateCount = 0;

  /** 上一次各成员决策（用于权重更新） */
  private lastDecisions: Partial<Record<EnsembleMember, ActionSelection<Action>>> = {};

  /** 上一次成员投票（用于轨迹记录） */
  private lastVotes: Record<string, unknown> | undefined;

  /** 上一次决策置信度（用于轨迹记录） */
  private lastConfidence: number | undefined;

  // ==================== BaseLearner接口实现 ====================

  /**
   * 选择最优动作
   *
   * 策略:
   * - 非normal阶段: ColdStartManager全权决策
   * - normal阶段: 多学习器加权投票
   */
  selectAction(
    state: UserState,
    actions: Action[],
    context: EnsembleContext
  ): ActionSelection<Action> {
    if (!actions || actions.length === 0) {
      throw new Error('[EnsembleLearningFramework] 动作列表不能为空');
    }

    const ctx = this.normalizeContext(context);

    // 冷启动/探索阶段: ColdStartManager主导
    if (ctx.phase !== 'normal') {
      const cold = this.coldStart.selectAction(state, actions, ctx.base);
      this.lastDecisions = {};
      this.lastVotes = undefined;
      this.lastConfidence = cold.confidence;

      return {
        ...cold,
        meta: {
          ...cold.meta,
          ensemblePhase: ctx.phase,
          weights: { ...this.weights },
          decisionSource: 'coldstart'
        }
      };
    }

    // 成熟阶段: 多学习器投票
    const decisions = this.collectDecisions(state, actions, ctx);
    const aggregation = this.aggregateDecisions(decisions, actions);

    this.lastDecisions = decisions;
    this.lastVotes = this.serializeVotes(aggregation.votes);
    this.lastConfidence = aggregation.aggregatedConfidence;

    return {
      action: aggregation.winner,
      score: aggregation.weightedScore,
      confidence: aggregation.aggregatedConfidence,
      meta: {
        ensemblePhase: ctx.phase,
        weights: { ...this.weights },
        decisionSource: 'ensemble',
        memberVotes: this.lastVotes
      }
    };
  }

  /**
   * 更新模型
   *
   * 流程:
   * - 非normal阶段: 更新所有子学习器（确保成熟前已有数据）
   * - normal阶段: 更新主学习器并更新集成权重，跳过coldStart以保持稳定
   */
  update(
    state: UserState,
    action: Action,
    reward: number,
    context: EnsembleContext
  ): void {
    const ctx = this.normalizeContext(context);
    const boundedReward = this.clamp(reward, -1, 1);

    if (ctx.phase === 'normal') {
      // normal阶段：更新主学习器，跳过coldStart以保持其状态稳定
      this.linucb.update(state, action, boundedReward, ctx.linucb);
      this.thompson.update(state, action, boundedReward, ctx.thompson);
      this.actr.update(state, action, boundedReward, ctx.actr);
      this.heuristic.update(state, action, boundedReward, ctx.heuristic);

      // 更新集成权重
      this.updateWeights(boundedReward, action);
      this.updateCount += 1;
    } else {
      // 非normal阶段：更新所有子学习器（确保成熟前已有数据）
      this.coldStart.update(state, action, boundedReward, ctx.base);
      this.linucb.update(state, action, boundedReward, ctx.linucb);
      this.thompson.update(state, action, boundedReward, ctx.thompson);
      this.actr.update(state, action, boundedReward, ctx.actr);
      this.heuristic.update(state, action, boundedReward, ctx.heuristic);

      // 清空决策记录
      this.lastDecisions = {};
    }
  }

  /**
   * 获取状态（用于持久化）
   */
  getState(): EnsembleState {
    return {
      version: EnsembleLearningFramework.VERSION,
      weights: { ...this.weights },
      updateCount: this.updateCount,
      coldStart: this.coldStart.getState(),
      linucb: this.cloneBanditModel(this.linucb.getModel()),
      thompson: this.thompson.getState(),
      actr: this.actr.getState(),
      heuristic: this.heuristic.getState(),
      lastVotes: this.lastVotes,
      lastConfidence: this.lastConfidence
    };
  }

  /**
   * 恢复状态（带数值校验）
   */
  setState(state: EnsembleState): void {
    if (!state) {
      console.warn('[EnsembleLearningFramework] 无效状态，跳过恢复');
      return;
    }

    // 版本检查
    if (state.version !== EnsembleLearningFramework.VERSION) {
      console.log(
        `[EnsembleLearningFramework] 版本迁移: ${state.version} → ${EnsembleLearningFramework.VERSION}`
      );
    }

    // 恢复权重（带校验和归一化）
    this.weights = this.normalizeWeights(state.weights);
    this.updateCount = Math.max(0, state.updateCount ?? 0);

    // 恢复子学习器状态
    if (state.coldStart) {
      this.coldStart.setState(state.coldStart);
    }
    if (state.linucb) {
      this.linucb.setModel(state.linucb);
    }
    if (state.thompson) {
      this.thompson.setState(state.thompson);
    }
    if (state.actr) {
      this.actr.setState(state.actr);
    }
    if (state.heuristic) {
      this.heuristic.setState(state.heuristic);
    }

    // 恢复轨迹记录字段
    this.lastVotes = state.lastVotes;
    this.lastConfidence = state.lastConfidence;

    // 清空临时状态
    this.lastDecisions = {};
  }

  /**
   * 重置到初始状态
   */
  reset(): void {
    this.weights = { ...INITIAL_WEIGHTS };
    this.updateCount = 0;
    this.lastDecisions = {};
    this.lastVotes = undefined;
    this.lastConfidence = undefined;

    this.coldStart.reset();
    this.linucb.reset();
    this.thompson.reset();
    this.actr.reset();
    this.heuristic.reset();
  }

  getName(): string {
    return EnsembleLearningFramework.NAME;
  }

  getVersion(): string {
    return EnsembleLearningFramework.VERSION;
  }

  getCapabilities(): LearnerCapabilities {
    return {
      supportsOnlineLearning: true,
      supportsBatchUpdate: true,
      requiresPretraining: false,
      minSamplesForReliability: this.coldStart.getCapabilities().minSamplesForReliability,
      primaryUseCase: '冷启动过渡与多学习器集成决策'
    };
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  // ==================== 公开便捷方法 ====================

  /**
   * 获取当前权重
   */
  getWeights(): EnsembleWeights {
    return { ...this.weights };
  }

  /**
   * 获取当前阶段
   */
  getPhase(): ColdStartPhase {
    return this.coldStart.getPhase();
  }

  /**
   * 是否完成冷启动
   */
  isWarm(): boolean {
    return this.coldStart.isCompleted();
  }

  /**
   * 获取冷启动进度
   */
  getColdStartProgress(): number {
    return this.coldStart.getProgress();
  }

  /**
   * 获取各子学习器更新计数
   */
  getMemberUpdateCounts(): Record<EnsembleMember | 'coldstart', number> {
    return {
      coldstart: this.coldStart.getUpdateCount(),
      thompson: this.thompson.getUpdateCount(),
      linucb: this.linucb.getUpdateCount(),
      actr: this.actr.getUpdateCount(),
      heuristic: this.heuristic.getUpdateCount()
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 收集各成员决策
   */
  private collectDecisions(
    state: UserState,
    actions: Action[],
    ctx: NormalizedContext
  ): Partial<Record<EnsembleMember, ActionSelection<Action>>> {
    const decisions: Partial<Record<EnsembleMember, ActionSelection<Action>>> = {};

    try {
      decisions.linucb = this.linucb.selectAction(state, actions, ctx.linucb);
    } catch (e) {
      console.warn('[EnsembleLearningFramework] LinUCB决策失败:', e);
    }

    try {
      decisions.thompson = this.thompson.selectAction(state, actions, ctx.thompson);
    } catch (e) {
      console.warn('[EnsembleLearningFramework] Thompson决策失败:', e);
    }

    try {
      decisions.actr = this.actr.selectAction(state, actions, ctx.actr);
    } catch (e) {
      console.warn('[EnsembleLearningFramework] ACT-R决策失败:', e);
    }

    try {
      decisions.heuristic = this.heuristic.selectAction(state, actions, ctx.heuristic);
    } catch (e) {
      console.warn('[EnsembleLearningFramework] Heuristic决策失败:', e);
    }

    return decisions;
  }

  /**
   * 聚合各成员决策
   *
   * 策略: 按动作分组，加权求和投票
   * 置信度使用实际参与成员的权重归一化，避免缺失成员导致稀释
   */
  private aggregateDecisions(
    decisions: Partial<Record<EnsembleMember, ActionSelection<Action>>>,
    actions: Action[]
  ): AggregationDetails {
    const votes = new Map<string, VoteDetail>();
    const actionBuckets = new Map<string, {
      action: Action;
      totalScore: number;
      totalConfidence: number;
      totalWeight: number;
    }>();

    // 计算实际参与成员的总权重（用于归一化）
    const members: EnsembleMember[] = ['linucb', 'thompson', 'actr', 'heuristic'];
    let participatingWeight = 0;
    for (const member of members) {
      if (decisions[member]) {
        participatingWeight += this.weights[member];
      }
    }

    // 如果无成员参与，使用默认权重
    if (participatingWeight <= 0) {
      participatingWeight = 1;
    }

    // 收集投票，按实际参与成员重新归一化权重
    for (const member of members) {
      const decision = decisions[member];
      if (!decision) continue;

      // 重新归一化权重（基于实际参与成员）
      const normalizedWeight = this.weights[member] / participatingWeight;
      const actionKey = this.getActionKey(decision.action);
      const scaledScore = Math.tanh(decision.score / SCORE_SCALE);
      const confidence = this.clamp(decision.confidence ?? 0, 0, 1);
      const contribution = normalizedWeight * scaledScore * (0.5 + confidence / 2);

      // 记录投票详情
      votes.set(member, {
        action: decision.action,
        rawScore: decision.score,
        scaledScore,
        confidence,
        weight: normalizedWeight,
        contribution
      });

      // 累加到动作桶
      const bucket = actionBuckets.get(actionKey) ?? {
        action: decision.action,
        totalScore: 0,
        totalConfidence: 0,
        totalWeight: 0
      };
      bucket.totalScore += contribution;
      bucket.totalConfidence += normalizedWeight * confidence;
      bucket.totalWeight += normalizedWeight;
      actionBuckets.set(actionKey, bucket);
    }

    // 选择得分最高的动作
    let winner: Action = actions[0];
    let maxScore = -Infinity;
    let winnerConfidence = 0;

    for (const bucket of actionBuckets.values()) {
      if (bucket.totalScore > maxScore) {
        maxScore = bucket.totalScore;
        winner = bucket.action;
        // 置信度已基于归一化权重计算，直接使用
        winnerConfidence = bucket.totalWeight > 0
          ? bucket.totalConfidence / bucket.totalWeight
          : 0;
      }
    }

    // 回退保护
    if (actionBuckets.size === 0) {
      const fallback = decisions.linucb ??
        decisions.thompson ??
        decisions.actr ??
        decisions.heuristic;

      if (fallback) {
        return {
          votes,
          winner: fallback.action,
          weightedScore: fallback.score,
          aggregatedConfidence: fallback.confidence ?? 0
        };
      }
    }

    return {
      votes,
      winner,
      weightedScore: maxScore,
      aggregatedConfidence: this.clamp(winnerConfidence, 0, 1)
    };
  }

  /**
   * 更新集成权重
   *
   * 指数加权更新: w' = w * exp(η * gradient)
   *
   * 修复: 对缺席/异常成员应用衰减惩罚，避免权重被保留
   * 并使用与aggregateDecisions一致的归一化权重基准
   */
  private updateWeights(reward: number, executedAction: Action): void {
    if (Object.keys(this.lastDecisions).length === 0) {
      return;
    }

    // 计算实际参与成员的总权重（与aggregateDecisions保持一致）
    const members: EnsembleMember[] = ['thompson', 'linucb', 'actr', 'heuristic'];
    let participatingWeight = 0;
    for (const member of members) {
      if (this.lastDecisions[member]) {
        participatingWeight += this.weights[member];
      }
    }
    if (participatingWeight <= 0) {
      participatingWeight = 1;
    }

    const updated: Partial<EnsembleWeights> = {};

    for (const member of members) {
      const decision = this.lastDecisions[member];
      const currentWeight = this.weights[member];

      if (!decision) {
        // 缺席/异常的成员应用衰减惩罚（向MIN_WEIGHT收敛）
        // 使用0.95的衰减因子，使权重逐渐降低
        const ABSENCE_DECAY = 0.95;
        const decayed = currentWeight * ABSENCE_DECAY;
        updated[member] = Math.max(MIN_WEIGHT, decayed);
        continue;
      }

      // 使用归一化权重（与aggregateDecisions保持一致）
      const normalizedWeight = currentWeight / participatingWeight;

      // 计算对齐度：选择与实际执行一致为正，否则为负
      const aligned = this.actionsEqual(decision.action, executedAction) ? 1 : -0.5;
      const confidence = this.clamp(decision.confidence ?? 0, 0, 1);

      // 梯度 = 奖励 * 对齐度 * (0.5 + 置信度/2)
      // 使用归一化权重作为基准计算梯度影响
      const gradient = reward * aligned * (0.5 + confidence / 2);

      // 指数加权更新（基于原始权重，但梯度考虑了归一化贡献）
      const raw = currentWeight * Math.exp(WEIGHT_LEARNING_RATE * gradient * normalizedWeight);
      updated[member] = Math.max(MIN_WEIGHT, raw);
    }

    // 归一化
    this.weights = this.normalizeWeights(updated);
  }

  /**
   * 归一化上下文
   *
   * 自动修正phase：当ColdStartManager已完成但外部传入非normal时，强制切换
   */
  private normalizeContext(context: EnsembleContext): NormalizedContext {
    let phase = context?.phase ?? 'classify';

    // 自动过渡兜底：如果ColdStartManager已完成但传入非normal，强制切换
    if (phase !== 'normal' && this.coldStart.isCompleted()) {
      phase = 'normal';
    }

    // 基础上下文
    const baseError = this.clamp(context?.base?.recentErrorRate ?? 0.5, 0, 1);
    const baseResponse = this.clamp(context?.base?.recentResponseTime ?? 2000, 50, 60000);
    const baseTime = Math.round(this.clamp(context?.base?.timeBucket ?? 12, 0, 23));

    const base: BaseLearnerContext = {
      recentErrorRate: baseError,
      recentResponseTime: baseResponse,
      timeBucket: baseTime
    };

    // LinUCB上下文
    const linucb: LinUCBContext = {
      recentErrorRate: this.clamp(
        context?.linucb?.recentErrorRate ?? baseError,
        0,
        1
      ),
      recentResponseTime: this.clamp(
        context?.linucb?.recentResponseTime ?? baseResponse,
        50,
        60000
      ),
      timeBucket: Math.round(this.clamp(
        context?.linucb?.timeBucket ?? baseTime,
        0,
        23
      ))
    };

    // Thompson上下文
    const thompson: ThompsonContext = {
      recentErrorRate: this.clamp(
        context?.thompson?.recentErrorRate ?? baseError,
        0,
        1
      ),
      recentResponseTime: this.clamp(
        context?.thompson?.recentResponseTime ?? baseResponse,
        50,
        60000
      ),
      timeBucket: Math.round(this.clamp(
        context?.thompson?.timeBucket ?? baseTime,
        0,
        23
      ))
    };

    // ACT-R上下文
    const actr: ACTRContext = {
      recentErrorRate: baseError,
      recentResponseTime: baseResponse,
      timeBucket: baseTime,
      trace: context?.actr?.trace ?? []
    };

    // Heuristic上下文
    const heuristic: HeuristicContext = {
      recentErrorRate: baseError,
      recentResponseTime: baseResponse,
      timeBucket: baseTime,
      fatigueBias: context?.heuristic?.fatigueBias,
      motivationBias: context?.heuristic?.motivationBias
    };

    return { phase, base, linucb, thompson, actr, heuristic };
  }

  /**
   * 归一化权重（确保和为1）
   */
  private normalizeWeights(weights: Partial<EnsembleWeights>): EnsembleWeights {
    const merged: EnsembleWeights = {
      thompson: Math.max(MIN_WEIGHT, weights.thompson ?? INITIAL_WEIGHTS.thompson),
      linucb: Math.max(MIN_WEIGHT, weights.linucb ?? INITIAL_WEIGHTS.linucb),
      actr: Math.max(MIN_WEIGHT, weights.actr ?? INITIAL_WEIGHTS.actr),
      heuristic: Math.max(MIN_WEIGHT, weights.heuristic ?? INITIAL_WEIGHTS.heuristic)
    };

    const total = merged.thompson + merged.linucb + merged.actr + merged.heuristic;

    if (!Number.isFinite(total) || total <= 0) {
      return { ...INITIAL_WEIGHTS };
    }

    // 归一化后再次确保最小权重约束
    const normalized = {
      thompson: merged.thompson / total,
      linucb: merged.linucb / total,
      actr: merged.actr / total,
      heuristic: merged.heuristic / total
    };

    // 如果归一化后有权重低于 MIN_WEIGHT，需要重新调整
    const belowMin = Object.entries(normalized).filter(([_, v]) => v < MIN_WEIGHT);
    if (belowMin.length > 0) {
      // 将低于最小值的权重提升到 MIN_WEIGHT，其余按比例缩放
      const minTotal = belowMin.length * MIN_WEIGHT;
      const remainingTotal = 1 - minTotal;
      const aboveMinTotal = Object.entries(normalized)
        .filter(([_, v]) => v >= MIN_WEIGHT)
        .reduce((sum, [_, v]) => sum + v, 0);

      if (aboveMinTotal > 0) {
        const scale = remainingTotal / aboveMinTotal;
        return {
          thompson: normalized.thompson < MIN_WEIGHT ? MIN_WEIGHT : normalized.thompson * scale,
          linucb: normalized.linucb < MIN_WEIGHT ? MIN_WEIGHT : normalized.linucb * scale,
          actr: normalized.actr < MIN_WEIGHT ? MIN_WEIGHT : normalized.actr * scale,
          heuristic: normalized.heuristic < MIN_WEIGHT ? MIN_WEIGHT : normalized.heuristic * scale
        };
      }
    }

    return normalized;
  }

  /**
   * 获取动作唯一键
   */
  private getActionKey(action: Action): string {
    const idx = getActionIndex(action);
    if (idx >= 0) {
      return `idx:${idx}`;
    }
    return [
      action.interval_scale,
      action.new_ratio,
      action.difficulty,
      action.batch_size,
      action.hint_level
    ].join('|');
  }

  /**
   * 判断两个动作是否相等
   */
  private actionsEqual(a: Action, b: Action): boolean {
    return (
      a.interval_scale === b.interval_scale &&
      a.new_ratio === b.new_ratio &&
      a.difficulty === b.difficulty &&
      a.batch_size === b.batch_size &&
      a.hint_level === b.hint_level
    );
  }

  /**
   * 序列化投票信息（用于meta输出）
   */
  private serializeVotes(
    votes: Map<string, VoteDetail>
  ): Record<string, { action: string; contribution: number; confidence: number }> {
    const result: Record<string, { action: string; contribution: number; confidence: number }> = {};
    for (const [member, detail] of votes.entries()) {
      result[member] = {
        action: this.getActionKey(detail.action),
        contribution: Math.round(detail.contribution * 1000) / 1000,
        confidence: Math.round(detail.confidence * 100) / 100
      };
    }
    return result;
  }

  /**
   * 克隆BanditModel
   */
  private cloneBanditModel(model: BanditModel): BanditModel {
    return {
      d: model.d,
      lambda: model.lambda,
      alpha: model.alpha,
      A: new Float32Array(model.A),
      b: new Float32Array(model.b),
      L: new Float32Array(model.L),
      updateCount: model.updateCount
    };
  }

  /**
   * 数值截断
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

// ==================== 内部类型 ====================

interface NormalizedContext {
  phase: ColdStartPhase;
  base: BaseLearnerContext;
  linucb: LinUCBContext;
  thompson: ThompsonContext;
  actr: ACTRContext;
  heuristic: HeuristicContext;
}

// ==================== 导出默认实例 ====================

export const defaultEnsembleLearner = new EnsembleLearningFramework();
