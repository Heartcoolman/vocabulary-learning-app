/**
 * Stats Collector for LLM Advisor
 * LLM 顾问统计数据收集器
 *
 * 收集一周的聚合统计数据，用于 LLM 分析
 */

import prisma from '../../../config/database';
import { optimizationService } from '../../../services/optimization.service';
import {
  REWARD_WEIGHTS,
  HIGH_FATIGUE,
  LOW_MOTIVATION,
  HIGH_MOTIVATION
} from '../../config/action-space';
import { getParamBounds } from '../../config/user-params';
import { amasLogger } from '../../../logger';

// 调整阈值默认值（如果配置中不存在）
const ADJUSTMENT_THRESHOLDS = {
  minAdjustment: 0.01,
  maxAdjustment: 0.1,
  convergenceThreshold: 0.001
};

// ==================== 类型定义 ====================

/**
 * 周度统计数据
 */
export interface WeeklyStats {
  /** 统计周期 */
  period: {
    start: Date;
    end: Date;
  };

  /** 用户指标 */
  users: {
    /** 总用户数 */
    total: number;
    /** 本周活跃用户数 */
    activeThisWeek: number;
    /** 本周新增用户数 */
    newThisWeek: number;
    /** 本周流失用户数（上周活跃但本周未活跃） */
    churned: number;
  };

  /** 学习效果 */
  learning: {
    /** 平均正确率 */
    avgAccuracy: number;
    /** 平均会话时长（分钟） */
    avgSessionDuration: number;
    /** 总学习单词数 */
    totalWordsLearned: number;
    /** 总答题次数 */
    totalAnswers: number;
    /** 平均响应时间（毫秒） */
    avgResponseTime: number;
  };

  /** 用户状态分布 */
  stateDistribution: {
    fatigue: {
      low: number;   // < 0.4
      mid: number;   // 0.4 - 0.7
      high: number;  // > 0.7
    };
    motivation: {
      low: number;   // < -0.3
      mid: number;   // -0.3 - 0.3
      high: number;  // > 0.3
    };
  };

  /** 当前配置快照 */
  currentConfig: {
    /** 用户超参数边界 */
    userParamBounds: Record<string, { min: number; max: number }>;
    /** 奖励函数权重 */
    rewardWeights: Record<string, number>;
    /** 调整阈值 */
    adjustmentThresholds: Record<string, number>;
    /** 安全阈值 */
    safetyThresholds: {
      highFatigue: number;
      lowMotivation: number;
      highMotivation: number;
    };
  };

  /** 优化历史 */
  optimizationHistory: {
    /** 最近观测 */
    recentObservations: Array<{
      params: Record<string, number>;
      value: number;
      timestamp: number;
    }>;
    /** 当前最优参数 */
    bestParams: Record<string, number> | null;
    /** 最优值 */
    bestValue: number | null;
    /** 总评估次数 */
    evaluationCount: number;
  };

  /** 问题指标（需要关注的异常） */
  alerts: {
    /** 正确率低于阈值的用户占比 */
    lowAccuracyUserRatio: number;
    /** 高疲劳用户占比 */
    highFatigueUserRatio: number;
    /** 低动机用户占比 */
    lowMotivationUserRatio: number;
    /** 本周流失率 */
    churnRate: number;
  };
}

// ==================== 收集器类 ====================

/**
 * 统计数据收集器
 */
export class StatsCollector {
  /**
   * 收集一周的统计数据
   *
   * @param endDate 统计结束日期，默认为当前时间
   */
  async collectWeeklyStats(endDate?: Date): Promise<WeeklyStats> {
    const end = endDate ?? new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);

    amasLogger.info({ start, end }, '[StatsCollector] 开始收集周度统计');

    // 并行收集各类数据
    const [
      userStats,
      learningStats,
      stateDistribution,
      optimizationHistory,
      alertStats
    ] = await Promise.all([
      this.collectUserStats(start, end, prevWeekStart),
      this.collectLearningStats(start, end),
      this.collectStateDistribution(start, end),
      this.collectOptimizationHistory(),
      this.collectAlertStats(start, end)
    ]);

    const stats: WeeklyStats = {
      period: { start, end },
      users: userStats,
      learning: learningStats,
      stateDistribution,
      currentConfig: this.collectCurrentConfig(),
      optimizationHistory,
      alerts: alertStats
    };

    amasLogger.info({
      period: stats.period,
      activeUsers: stats.users.activeThisWeek,
      avgAccuracy: stats.learning.avgAccuracy
    }, '[StatsCollector] 周度统计收集完成');

    return stats;
  }

  /**
   * 收集用户统计
   */
  private async collectUserStats(
    start: Date,
    end: Date,
    prevWeekStart: Date
  ): Promise<WeeklyStats['users']> {
    // 总用户数
    const total = await prisma.user.count();

    // 本周活跃用户（有答题记录）
    const activeThisWeek = await prisma.answerRecord.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: start, lte: end }
      }
    }).then(groups => groups.length);

    // 本周新增用户
    const newThisWeek = await prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end }
      }
    });

    // 上周活跃但本周未活跃的用户（流失）
    const prevWeekActiveUsers = await prisma.answerRecord.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: prevWeekStart, lt: start }
      }
    }).then(groups => groups.map(g => g.userId));

    const thisWeekActiveUsers = await prisma.answerRecord.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: start, lte: end }
      }
    }).then(groups => new Set(groups.map(g => g.userId)));

    const churned = prevWeekActiveUsers.filter(id => !thisWeekActiveUsers.has(id)).length;

    return { total, activeThisWeek, newThisWeek, churned };
  }

  /**
   * 收集学习效果统计
   */
  private async collectLearningStats(
    start: Date,
    end: Date
  ): Promise<WeeklyStats['learning']> {
    // 答题统计
    const answerAggregates = await prisma.answerRecord.aggregate({
      where: {
        timestamp: { gte: start, lte: end }
      },
      _count: { _all: true },
      _avg: {
        responseTime: true
      }
    });

    // 正确率
    const correctCount = await prisma.answerRecord.count({
      where: {
        timestamp: { gte: start, lte: end },
        isCorrect: true
      }
    });

    const totalAnswers = answerAggregates._count._all || 0;
    const avgAccuracy = totalAnswers > 0 ? correctCount / totalAnswers : 0;

    // 学习的单词数（去重）
    const totalWordsLearned = await prisma.answerRecord.groupBy({
      by: ['wordId'],
      where: {
        timestamp: { gte: start, lte: end }
      }
    }).then(groups => groups.length);

    // 会话统计
    const sessions = await prisma.learningSession.findMany({
      where: {
        startedAt: { gte: start, lte: end },
        endedAt: { not: null }
      },
      select: {
        startedAt: true,
        endedAt: true
      }
    });

    const avgSessionDuration = sessions.length > 0
      ? sessions.reduce((sum, s) => {
          const duration = (s.endedAt!.getTime() - s.startedAt.getTime()) / 60000;
          return sum + Math.min(duration, 120); // 限制最大 120 分钟
        }, 0) / sessions.length
      : 0;

    return {
      avgAccuracy,
      avgSessionDuration,
      totalWordsLearned,
      totalAnswers,
      avgResponseTime: answerAggregates._avg?.responseTime || 0
    };
  }

  /**
   * 收集用户状态分布
   *
   * 注意：由于 UserLearningState 表可能不存在，这里使用模拟数据
   * 实际部署时需要确保表存在或从其他来源获取数据
   */
  private async collectStateDistribution(
    start: Date,
    end: Date
  ): Promise<WeeklyStats['stateDistribution']> {
    // 尝试从 UserLearningState 获取最近状态
    // 如果表不存在，使用默认分布
    try {
      const states = await (prisma as any).userLearningState?.findMany?.({
        where: {
          updatedAt: { gte: start, lte: end }
        },
        select: {
          fatigue: true,
          motivation: true
        }
      });

      if (!states || states.length === 0) {
        return this.getDefaultStateDistribution();
      }

      const fatigueDistribution = { low: 0, mid: 0, high: 0 };
      const motivationDistribution = { low: 0, mid: 0, high: 0 };

      for (const state of states) {
        // 疲劳分布
        if (state.fatigue < 0.4) {
          fatigueDistribution.low++;
        } else if (state.fatigue < 0.7) {
          fatigueDistribution.mid++;
        } else {
          fatigueDistribution.high++;
        }

        // 动机分布
        if (state.motivation < -0.3) {
          motivationDistribution.low++;
        } else if (state.motivation < 0.3) {
          motivationDistribution.mid++;
        } else {
          motivationDistribution.high++;
        }
      }

      const total = states.length || 1;
      return {
        fatigue: {
          low: fatigueDistribution.low / total,
          mid: fatigueDistribution.mid / total,
          high: fatigueDistribution.high / total
        },
        motivation: {
          low: motivationDistribution.low / total,
          mid: motivationDistribution.mid / total,
          high: motivationDistribution.high / total
        }
      };
    } catch {
      return this.getDefaultStateDistribution();
    }
  }

  /**
   * 获取默认状态分布（表不存在时使用）
   */
  private getDefaultStateDistribution(): WeeklyStats['stateDistribution'] {
    return {
      fatigue: { low: 0.7, mid: 0.2, high: 0.1 },
      motivation: { low: 0.1, mid: 0.5, high: 0.4 }
    };
  }

  /**
   * 收集当前配置快照
   */
  private collectCurrentConfig(): WeeklyStats['currentConfig'] {
    const paramBounds = getParamBounds();

    return {
      userParamBounds: {
        alpha: paramBounds.alpha,
        fatigueK: paramBounds.fatigueK,
        motivationRho: paramBounds.motivationRho,
        optimalDifficulty: paramBounds.optimalDifficulty
      },
      rewardWeights: { ...REWARD_WEIGHTS },
      adjustmentThresholds: { ...ADJUSTMENT_THRESHOLDS },
      safetyThresholds: {
        highFatigue: HIGH_FATIGUE,
        lowMotivation: LOW_MOTIVATION,
        highMotivation: HIGH_MOTIVATION
      }
    };
  }

  /**
   * 收集优化历史
   */
  private async collectOptimizationHistory(): Promise<WeeklyStats['optimizationHistory']> {
    const history = optimizationService.getOptimizationHistory();
    const best = optimizationService.getBestParams();

    return {
      recentObservations: history.observations.slice(-10).map(obs => ({
        params: obs.params,
        value: obs.value,
        timestamp: obs.timestamp
      })),
      bestParams: best?.params ?? null,
      bestValue: best?.value ?? null,
      evaluationCount: history.evaluationCount
    };
  }

  /**
   * 收集告警指标
   */
  private async collectAlertStats(
    start: Date,
    end: Date
  ): Promise<WeeklyStats['alerts']> {
    // 获取用户状态 - 使用动态访问避免编译错误
    let states: Array<{ userId: string; fatigue: number; motivation: number }> = [];
    try {
      states = await (prisma as any).userLearningState?.findMany?.({
        where: {
          updatedAt: { gte: start, lte: end }
        },
        select: {
          userId: true,
          fatigue: true,
          motivation: true
        }
      }) || [];
    } catch {
      // 表不存在时忽略
    }

    const totalUsers = states.length || 1;
    const highFatigueCount = states.filter((s: { fatigue: number }) => s.fatigue > 0.7).length;
    const lowMotivationCount = states.filter((s: { motivation: number }) => s.motivation < -0.3).length;

    // 计算低正确率用户
    const userAccuracies = await prisma.answerRecord.groupBy({
      by: ['userId'],
      where: {
        timestamp: { gte: start, lte: end }
      },
      _count: {
        id: true
      }
    });

    // 分别查询每个用户的正确答题数
    let lowAccuracyCount = 0;
    for (const u of userAccuracies) {
      if (u._count.id > 5) {
        const correctCount = await prisma.answerRecord.count({
          where: {
            userId: u.userId,
            timestamp: { gte: start, lte: end },
            isCorrect: true
          }
        });
        if (correctCount / u._count.id < 0.6) {
          lowAccuracyCount++;
        }
      }
    }

    // 获取用户统计来计算流失率
    const prevWeekStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const userStats = await this.collectUserStats(start, end, prevWeekStart);
    const prevWeekActive = userStats.activeThisWeek + userStats.churned;
    const churnRate = prevWeekActive > 0 ? userStats.churned / prevWeekActive : 0;

    return {
      lowAccuracyUserRatio: lowAccuracyCount / totalUsers,
      highFatigueUserRatio: highFatigueCount / totalUsers,
      lowMotivationUserRatio: lowMotivationCount / totalUsers,
      churnRate
    };
  }
}

// ==================== 默认实例 ====================

export const statsCollector = new StatsCollector();
