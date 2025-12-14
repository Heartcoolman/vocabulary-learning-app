/**
 * AMAS Core - Multi-Objective Optimizer
 * 多目标优化器
 *
 * 使用加权 Tchebycheff 方法进行多目标优化
 * 支持短期记忆、长期记忆、效率三个目标的优化
 */

import {
  LearningObjectives,
  LearningObjectiveMode,
  MultiObjectiveMetrics,
  ObjectiveEvaluation,
  StrategyParams,
  UserState,
} from '../types';

/**
 * 预设学习模式配置
 */
const PRESET_MODES: Record<LearningObjectiveMode, Partial<LearningObjectives>> = {
  exam: {
    mode: 'exam',
    primaryObjective: 'accuracy',
    weightShortTerm: 0.6,
    weightLongTerm: 0.3,
    weightEfficiency: 0.1,
    minAccuracy: 0.85,
  },
  daily: {
    mode: 'daily',
    primaryObjective: 'retention',
    weightShortTerm: 0.3,
    weightLongTerm: 0.5,
    weightEfficiency: 0.2,
    targetRetention: 0.8,
  },
  travel: {
    mode: 'travel',
    primaryObjective: 'efficiency',
    weightShortTerm: 0.2,
    weightLongTerm: 0.3,
    weightEfficiency: 0.5,
    maxDailyTime: 30,
  },
  custom: {
    mode: 'custom',
    primaryObjective: 'accuracy',
    weightShortTerm: 0.4,
    weightLongTerm: 0.4,
    weightEfficiency: 0.2,
  },
};

/**
 * 多目标优化器
 *
 * 核心功能:
 * 1. 计算短期记忆、长期记忆、效率三个目标的评分
 * 2. 使用 Tchebycheff 方法聚合多个目标
 * 3. 检查约束条件（最小准确率、最大学习时间等）
 * 4. 根据评估结果建议策略调整
 */
export class MultiObjectiveOptimizer {
  /**
   * 获取预设模式配置
   */
  static getPresetMode(mode: LearningObjectiveMode): Partial<LearningObjectives> {
    return PRESET_MODES[mode];
  }

  /**
   * 计算短期记忆指标
   * 基于当前会话的准确率和反应速度
   */
  static calculateShortTermScore(
    sessionAccuracy: number,
    avgResponseTime: number,
    userState: UserState,
  ): number {
    const accuracyComponent = sessionAccuracy;

    const normalizedResponseTime = Math.min(avgResponseTime / 10000, 1);
    const speedComponent = 1 - normalizedResponseTime;

    const attentionBonus = userState.A * 0.1;

    return Math.min(accuracyComponent * 0.7 + speedComponent * 0.2 + attentionBonus, 1.0);
  }

  /**
   * 计算长期记忆指标
   * 基于保留率、复习效果和记忆稳定性
   */
  static calculateLongTermScore(
    retentionRate: number,
    reviewSuccessRate: number,
    memoryStability: number,
  ): number {
    const retentionComponent = retentionRate * 0.5;
    const reviewComponent = reviewSuccessRate * 0.3;
    const stabilityComponent = memoryStability * 0.2;

    return Math.min(retentionComponent + reviewComponent + stabilityComponent, 1.0);
  }

  /**
   * 计算效率指标
   * 基于学习速度、时间利用率和认知负荷
   */
  static calculateEfficiencyScore(
    wordsPerMinute: number,
    timeUtilization: number,
    cognitiveLoad: number,
  ): number {
    const normalizedWPM = Math.min(wordsPerMinute / 10, 1);

    const efficiencyFromLoad = 1 - Math.abs(cognitiveLoad - 0.7);

    return Math.min(normalizedWPM * 0.4 + timeUtilization * 0.3 + efficiencyFromLoad * 0.3, 1.0);
  }

  /**
   * 聚合多目标指标
   * 使用加权 Tchebycheff 方法
   *
   * Tchebycheff 方法:
   * - 计算每个目标与理想点的加权距离
   * - 最小化最大加权距离
   * - 适合处理冲突目标
   */
  static aggregateObjectives(
    metrics: Omit<MultiObjectiveMetrics, 'aggregatedScore' | 'ts'>,
    objectives: LearningObjectives,
  ): number {
    const { shortTermScore, longTermScore, efficiencyScore } = metrics;
    const { weightShortTerm, weightLongTerm, weightEfficiency } = objectives;

    const idealPoint = { shortTerm: 1.0, longTerm: 1.0, efficiency: 1.0 };

    const deviations = [
      weightShortTerm * Math.abs(idealPoint.shortTerm - shortTermScore),
      weightLongTerm * Math.abs(idealPoint.longTerm - longTermScore),
      weightEfficiency * Math.abs(idealPoint.efficiency - efficiencyScore),
    ];

    const tchebycheffValue = Math.max(...deviations);

    return 1 - tchebycheffValue;
  }

  /**
   * 检查约束条件
   */
  static checkConstraints(
    metrics: MultiObjectiveMetrics,
    objectives: LearningObjectives,
    currentSessionTime: number,
  ): {
    satisfied: boolean;
    violations: Array<{ constraint: string; expected: number; actual: number }>;
  } {
    const violations: Array<{ constraint: string; expected: number; actual: number }> = [];

    if (objectives.minAccuracy && metrics.shortTermScore < objectives.minAccuracy) {
      violations.push({
        constraint: 'minAccuracy',
        expected: objectives.minAccuracy,
        actual: metrics.shortTermScore,
      });
    }

    if (objectives.maxDailyTime && currentSessionTime > objectives.maxDailyTime * 60 * 1000) {
      violations.push({
        constraint: 'maxDailyTime',
        expected: objectives.maxDailyTime * 60 * 1000,
        actual: currentSessionTime,
      });
    }

    if (objectives.targetRetention && metrics.longTermScore < objectives.targetRetention) {
      violations.push({
        constraint: 'targetRetention',
        expected: objectives.targetRetention,
        actual: metrics.longTermScore,
      });
    }

    return {
      satisfied: violations.length === 0,
      violations,
    };
  }

  /**
   * 评估当前策略效果
   */
  static evaluateStrategy(
    metrics: Omit<MultiObjectiveMetrics, 'aggregatedScore' | 'ts'>,
    objectives: LearningObjectives,
    currentSessionTime: number,
  ): ObjectiveEvaluation {
    const aggregatedScore = this.aggregateObjectives(metrics, objectives);

    const fullMetrics: MultiObjectiveMetrics = {
      ...metrics,
      aggregatedScore,
      ts: Date.now(),
    };

    const constraintCheck = this.checkConstraints(fullMetrics, objectives, currentSessionTime);

    const suggestedAdjustments = this.suggestAdjustments(
      fullMetrics,
      objectives,
      constraintCheck.violations,
    );

    return {
      metrics: fullMetrics,
      constraintsSatisfied: constraintCheck.satisfied,
      constraintViolations: constraintCheck.violations,
      suggestedAdjustments,
    };
  }

  /**
   * 建议策略调整
   */
  private static suggestAdjustments(
    metrics: MultiObjectiveMetrics,
    objectives: LearningObjectives,
    violations: Array<{ constraint: string; expected: number; actual: number }>,
  ): Partial<StrategyParams> | undefined {
    if (violations.length === 0 && metrics.aggregatedScore > 0.8) {
      return undefined;
    }

    const adjustments: Partial<StrategyParams> = {};

    for (const violation of violations) {
      switch (violation.constraint) {
        case 'minAccuracy':
          adjustments.difficulty = 'easy';
          adjustments.hint_level = 2;
          adjustments.new_ratio = 0.1;
          break;

        case 'maxDailyTime':
          adjustments.batch_size = 5;
          adjustments.new_ratio = 0.2;
          break;

        case 'targetRetention':
          adjustments.interval_scale = 0.8;
          adjustments.new_ratio = 0.2;
          break;
      }
    }

    if (metrics.shortTermScore < 0.6) {
      adjustments.difficulty = 'easy';
      adjustments.hint_level = Math.max(adjustments.hint_level || 0, 1);
    }

    if (metrics.longTermScore < 0.6) {
      adjustments.interval_scale = 0.8;
    }

    if (metrics.efficiencyScore < 0.6) {
      adjustments.batch_size = 8;
    }

    return Object.keys(adjustments).length > 0 ? adjustments : undefined;
  }

  /**
   * 验证权重总和
   */
  static validateWeights(objectives: LearningObjectives): boolean {
    const sum =
      objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency;

    return Math.abs(sum - 1.0) < 0.01;
  }

  /**
   * 归一化权重
   */
  static normalizeWeights(objectives: LearningObjectives): LearningObjectives {
    const sum =
      objectives.weightShortTerm + objectives.weightLongTerm + objectives.weightEfficiency;

    if (Math.abs(sum - 1.0) < 0.01) {
      return objectives;
    }

    // 防止除零：权重总和为0时使用默认均等权重
    if (sum <= 0) {
      return {
        ...objectives,
        weightShortTerm: 1 / 3,
        weightLongTerm: 1 / 3,
        weightEfficiency: 1 / 3,
      };
    }

    return {
      ...objectives,
      weightShortTerm: objectives.weightShortTerm / sum,
      weightLongTerm: objectives.weightLongTerm / sum,
      weightEfficiency: objectives.weightEfficiency / sum,
    };
  }
}
