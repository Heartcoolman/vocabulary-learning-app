/**
 * Multi-Objective Decision Engine for AMAS
 * 基于多目标优化的决策引擎
 */

import {
  LearningObjectives,
  MultiObjectiveMetrics,
  ObjectiveEvaluation,
  SessionStats,
  StrategyParams,
  UserState,
} from '../types';
import { MultiObjectiveOptimizer } from '../optimization/multi-objective-optimizer';

/**
 * 多目标决策引擎
 */
export class MultiObjectiveDecisionEngine {
  /**
   * 计算多目标指标
   */
  static computeMetrics(
    sessionStats: SessionStats,
    userState: UserState,
  ): Omit<MultiObjectiveMetrics, 'aggregatedScore' | 'ts'> {
    const shortTermScore = MultiObjectiveOptimizer.calculateShortTermScore(
      sessionStats.accuracy,
      sessionStats.avgResponseTime,
      userState,
    );

    const longTermScore = MultiObjectiveOptimizer.calculateLongTermScore(
      sessionStats.retentionRate,
      sessionStats.reviewSuccessRate,
      sessionStats.memoryStability,
    );

    const efficiencyScore = MultiObjectiveOptimizer.calculateEfficiencyScore(
      sessionStats.wordsPerMinute,
      sessionStats.timeUtilization,
      sessionStats.cognitiveLoad,
    );

    return {
      shortTermScore,
      longTermScore,
      efficiencyScore,
    };
  }

  /**
   * 做出策略决策
   */
  static makeDecision(
    currentStrategy: StrategyParams,
    objectives: LearningObjectives,
    sessionStats: SessionStats,
    userState: UserState,
  ): {
    newStrategy: StrategyParams;
    evaluation: ObjectiveEvaluation;
    shouldAdjust: boolean;
  } {
    const metrics = this.computeMetrics(sessionStats, userState);

    const evaluation = MultiObjectiveOptimizer.evaluateStrategy(
      metrics,
      objectives,
      sessionStats.sessionDuration,
    );

    const shouldAdjust =
      !evaluation.constraintsSatisfied || evaluation.metrics.aggregatedScore < 0.7;

    let newStrategy = currentStrategy;

    if (shouldAdjust && evaluation.suggestedAdjustments) {
      newStrategy = this.applyAdjustments(
        currentStrategy,
        evaluation.suggestedAdjustments,
        objectives,
      );
    }

    return {
      newStrategy,
      evaluation,
      shouldAdjust,
    };
  }

  /**
   * 应用策略调整
   * 根据学习目标权重进一步调整策略参数
   */
  private static applyAdjustments(
    currentStrategy: StrategyParams,
    adjustments: Partial<StrategyParams> | undefined,
    objectives: LearningObjectives,
  ): StrategyParams {
    if (!adjustments) {
      return currentStrategy;
    }
    const baseStrategy = { ...currentStrategy };

    if (adjustments.difficulty !== undefined) {
      baseStrategy.difficulty = adjustments.difficulty;
    }

    if (adjustments.hint_level !== undefined) {
      baseStrategy.hint_level = adjustments.hint_level;
    }

    if (adjustments.new_ratio !== undefined) {
      baseStrategy.new_ratio = this.smoothAdjustment(
        currentStrategy.new_ratio,
        adjustments.new_ratio,
        0.05,
      );
    }

    if (adjustments.interval_scale !== undefined) {
      baseStrategy.interval_scale = this.smoothAdjustment(
        currentStrategy.interval_scale,
        adjustments.interval_scale,
        0.1,
      );
    }

    if (adjustments.batch_size !== undefined) {
      baseStrategy.batch_size = adjustments.batch_size;
    }

    // 根据学习目标权重微调策略
    // 长期记忆权重高时，增加复习间隔以强化长期记忆
    if (objectives.weightLongTerm > 0.5) {
      const longTermFactor = 1 + (objectives.weightLongTerm - 0.5) * 0.4; // 0.5权重时为1.0，1.0权重时为1.2
      baseStrategy.interval_scale = this.smoothAdjustment(
        baseStrategy.interval_scale,
        baseStrategy.interval_scale * longTermFactor,
        0.15,
      );
    }

    // 效率权重高时，增加批量大小以提升学习效率
    if (objectives.weightEfficiency > 0.5) {
      const efficiencyFactor = 1 + (objectives.weightEfficiency - 0.5) * 0.5; // 0.5权重时为1.0，1.0权重时为1.25
      const suggestedBatchSize = Math.round(baseStrategy.batch_size * efficiencyFactor);
      baseStrategy.batch_size = Math.min(suggestedBatchSize, 20); // 最大批量20
    }

    // 短期记忆权重高时，降低新词比例以强化当前词汇
    if (objectives.weightShortTerm > 0.5) {
      const shortTermFactor = 1 - (objectives.weightShortTerm - 0.5) * 0.3; // 0.5权重时为1.0，1.0权重时为0.85
      baseStrategy.new_ratio = this.smoothAdjustment(
        baseStrategy.new_ratio,
        baseStrategy.new_ratio * shortTermFactor,
        0.05,
      );
    }

    return baseStrategy;
  }

  /**
   * 平滑调整（避免剧烈变化）
   */
  private static smoothAdjustment(current: number, target: number, maxDelta: number): number {
    const delta = target - current;
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
    return current + clampedDelta;
  }

  /**
   * 根据模式初始化策略
   */
  static initializeStrategyForMode(mode: LearningObjectives['mode']): StrategyParams {
    switch (mode) {
      case 'exam':
        return {
          interval_scale: 0.8,
          new_ratio: 0.2,
          difficulty: 'mid',
          batch_size: 12,
          hint_level: 1,
        };

      case 'daily':
        return {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 16,
          hint_level: 1,
        };

      case 'travel':
        return {
          interval_scale: 1.2,
          new_ratio: 0.4,
          difficulty: 'easy',
          batch_size: 8,
          hint_level: 2,
        };

      case 'custom':
      default:
        return {
          interval_scale: 1.0,
          new_ratio: 0.3,
          difficulty: 'mid',
          batch_size: 12,
          hint_level: 1,
        };
    }
  }

  /**
   * 计算决策置信度
   */
  static calculateConfidence(evaluation: ObjectiveEvaluation, userState: UserState): number {
    let confidence = 0.5;

    if (evaluation.constraintsSatisfied) {
      confidence += 0.2;
    }

    confidence += evaluation.metrics.aggregatedScore * 0.2;

    confidence += userState.conf * 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * 判断是否需要切换模式
   */
  static shouldSwitchMode(
    currentMode: LearningObjectives['mode'],
    evaluation: ObjectiveEvaluation,
    consecutiveViolations: number,
  ): boolean {
    if (currentMode === 'custom') {
      return false;
    }

    if (evaluation.metrics.aggregatedScore < 0.5 && consecutiveViolations >= 3) {
      return true;
    }

    return false;
  }

  /**
   * 建议替代模式
   */
  static suggestAlternativeMode(
    currentMode: LearningObjectives['mode'],
    evaluation: ObjectiveEvaluation,
  ): LearningObjectives['mode'] | null {
    if (currentMode === 'custom') {
      return null;
    }

    const { shortTermScore, longTermScore, efficiencyScore } = evaluation.metrics;

    let suggestedMode: LearningObjectives['mode'] | null = null;

    if (shortTermScore < 0.5) {
      // 短期表现差，建议使用考试模式（强化短期记忆）
      suggestedMode = 'exam';
    } else if (longTermScore < 0.5) {
      // 长期表现差，建议使用日常模式（强化长期记忆）
      suggestedMode = 'daily';
    } else if (efficiencyScore < 0.5) {
      // 效率低，建议使用旅行模式（优化学习效率）
      suggestedMode = 'travel';
    }

    // 如果建议的模式与当前模式相同，返回 null
    if (suggestedMode === currentMode) {
      return null;
    }

    return suggestedMode;
  }
}
