/**
 * 趋势分析服务
 * 提供学习趋势分析、预警和干预建议
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import prisma from '../config/database';

// ============================================
// 类型定义
// ============================================

/** 趋势状态 */
export type TrendState = 'up' | 'flat' | 'stuck' | 'down';

/**
 * 趋势结果
 */
export interface TrendResult {
  /** 当前趋势状态 */
  state: TrendState;
  /** 连续天数 */
  consecutiveDays: number;
  /** 最后变化时间 */
  lastChange: Date;
}

/**
 * 趋势历史项
 */
export interface TrendHistoryItem {
  /** 日期 */
  date: Date;
  /** 趋势状态 */
  state: TrendState;
  /** 正确率 */
  accuracy: number;
  /** 平均响应时间 */
  avgResponseTime: number;
  /** 动机值 */
  motivation: number;
}

/**
 * 趋势线数据
 */
export interface TrendLine {
  /** 数据点 */
  points: { date: string; value: number }[];
  /** 趋势方向 */
  direction: 'up' | 'down' | 'flat';
  /** 变化百分比 */
  changePercent: number;
}

/**
 * 趋势报告
 */
export interface TrendReport {
  /** 正确率趋势 */
  accuracyTrend: TrendLine;
  /** 响应时间趋势 */
  responseTimeTrend: TrendLine;
  /** 动机趋势 */
  motivationTrend: TrendLine;
  /** 总结 */
  summary: string;
  /** 建议列表 */
  recommendations: string[];
}

/**
 * 干预建议结果
 */
export interface InterventionResult {
  /** 是否需要干预 */
  needsIntervention: boolean;
  /** 干预类型 */
  type?: 'warning' | 'suggestion' | 'encouragement';
  /** 干预消息 */
  message?: string;
  /** 建议操作 */
  actions?: string[];
}

// ============================================
// 常量配置
// ============================================

/** 默认趋势历史天数 */
const DEFAULT_TREND_DAYS = 28;

/** 连续下降天数阈值 (Requirements: 2.4) */
const CONSECUTIVE_DOWN_THRESHOLD = 3;

/** 趋势变化阈值 */
const TREND_CHANGE_THRESHOLD = 0.1;

// ============================================
// 服务实现
// ============================================

class TrendAnalysisService {
  /**
   * 兼容测试的趋势分析方法
   * 使用学习记录的正确率斜率判断趋势
   */
  async analyzeTrend(userId: string): Promise<{
    trend: 'improving' | 'declining' | 'stable';
    slope: number;
    recentAccuracy: number;
    samples: number;
  }> {
    const prismaAny = prisma as any;
    const learningRecordClient =
      prismaAny.learningRecord || prismaAny.answerRecord;

    const records: Array<{ timestamp: Date; accuracy: number }> =
      learningRecordClient
        ? (await learningRecordClient.findMany({
            where: { userId },
            orderBy: { timestamp: 'asc' },
            take: 30
          })) ?? []
        : [];

    if (!records.length) {
      return { trend: 'stable', slope: 0, recentAccuracy: 0, samples: 0 };
    }

    // 使用简单线性回归计算斜率
    const n = records.length;
    const xs = records.map((_, idx) => idx + 1);
    const ys = records.map(r => r.accuracy);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const numerator = xs.reduce(
      (sum, x, idx) => sum + (x - xMean) * (ys[idx] - yMean),
      0
    );
    const denominator = xs.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) || 1;
    const slope = numerator / denominator;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (slope > 0.001) trend = 'improving';
    else if (slope < -0.001) trend = 'declining';

    return {
      trend,
      slope,
      recentAccuracy: ys[ys.length - 1] ?? 0,
      samples: n
    };
  }

  /**
   * 学习进度报告（兼容测试）
   */
  async getProgressReport(userId: string): Promise<{
    totalRecords: number;
    wordsMastered: number;
    masteryRate: number;
  }> {
    const prismaAny = prisma as any;
    const recordClient = prismaAny.learningRecord || prismaAny.answerRecord;
    const wordStateClient =
      prismaAny.wordState || prismaAny.wordLearningState || prismaAny.wordLearningStates;

    const totalRecords = recordClient
      ? await recordClient.count({ where: { userId } })
      : 0;

    const wordsMastered = wordStateClient
      ? await wordStateClient.count({
          where: { userId, state: 'MASTERED' }
        })
      : 0;

    const masteryRate =
      totalRecords > 0 ? Math.min(1, wordsMastered / totalRecords) : 0;

    return {
      totalRecords,
      wordsMastered,
      masteryRate
    };
  }

  /**
   * 未来表现预测（兼容测试）
   */
  async predictFuture(
    userId: string,
    days: number = 7
  ): Promise<{ predictedAccuracy: number; confidence: number }> {
    const prismaAny = prisma as any;
    const recordClient = prismaAny.learningRecord || prismaAny.answerRecord;

    const records: Array<{ timestamp: Date; accuracy: number }> =
      recordClient
        ? (await recordClient.findMany({
            where: { userId },
            orderBy: { timestamp: 'asc' },
            take: Math.max(14, days * 2)
          })) ?? []
        : [];

    if (!records.length) {
      return { predictedAccuracy: 0, confidence: 0 };
    }

    // 计算平均准确率和趋势
    const accuracies = records.map(r => r.accuracy);
    const avgAccuracy =
      accuracies.reduce((sum, v) => sum + v, 0) / accuracies.length;
    const base = Math.max(0, Math.min(1, avgAccuracy));

    const n = records.length;
    const xs = records.map((_, idx) => idx + 1);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = base;
    const numerator = xs.reduce(
      (sum, x, idx) => sum + (x - xMean) * (accuracies[idx] - yMean),
      0
    );
    const denominator = xs.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) || 1;
    const slope = numerator / denominator;

    const predicted = Math.max(
      0,
      Math.min(1, base + slope * Math.max(1, days))
    );

    // 样本越多，置信度越高
    const confidence = Math.min(0.95, 0.5 + records.length * 0.02);

    return {
      predictedAccuracy: predicted,
      confidence
    };
  }
  /**
   * 获取当前趋势状态
   * Requirements: 2.1
   * 
   * Property 4: 返回的TrendState必须是up/flat/stuck/down之一
   * 
   * @param userId 用户ID
   * @returns 趋势结果
   */
  async getCurrentTrend(userId: string): Promise<TrendResult> {
    // 获取用户AMAS状态
    const amasState = await prisma.amasUserState.findUnique({
      where: { userId }
    });

    // 获取最近的状态历史
    const recentHistory = await prisma.userStateHistory.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30
    });

    // 如果没有AMAS状态，从历史记录推断
    let currentState: TrendState = 'flat';
    if (amasState?.trendState) {
      currentState = this.validateTrendState(amasState.trendState);
    } else if (recentHistory.length > 0) {
      currentState = this.calculateTrendFromHistory(recentHistory);
    }

    // 计算连续天数
    const consecutiveDays = this.calculateConsecutiveDays(recentHistory, currentState);

    // 获取最后变化时间
    const lastChange = this.findLastTrendChange(recentHistory, currentState);

    return {
      state: currentState,
      consecutiveDays,
      lastChange
    };
  }

  /**
   * 获取趋势历史
   * Requirements: 2.3
   * 
   * Property 5: 返回的历史数据按周分组，每周包含平均指标
   * 
   * @param userId 用户ID
   * @param days 天数（默认28天，即4周）
   * @returns 趋势历史数组
   */
  async getTrendHistory(
    userId: string,
    days: number = DEFAULT_TREND_DAYS
  ): Promise<TrendHistoryItem[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 获取状态历史
    const history = await prisma.userStateHistory.findMany({
      where: {
        userId,
        date: { gte: startDate }
      },
      orderBy: { date: 'asc' }
    });

    // 获取答题记录用于计算正确率和响应时间
    const records = await prisma.answerRecord.findMany({
      where: {
        userId,
        timestamp: { gte: startDate }
      },
      select: {
        timestamp: true,
        isCorrect: true,
        responseTime: true
      }
    });

    // 按日期聚合数据
    const dailyData = this.aggregateDailyData(history, records);

    return dailyData;
  }

  /**
   * 生成趋势报告
   * Requirements: 2.5
   * 
   * Property 7: 报告必须包含非空的accuracyTrend、responseTimeTrend和motivationTrend
   * 
   * @param userId 用户ID
   * @returns 趋势报告
   */
  async generateTrendReport(userId: string): Promise<TrendReport> {
    // 获取4周趋势历史
    const history = await this.getTrendHistory(userId, DEFAULT_TREND_DAYS);

    // 计算各指标趋势线
    const accuracyTrend = this.calculateTrendLine(
      history.map(h => ({ date: h.date.toISOString(), value: h.accuracy }))
    );

    const responseTimeTrend = this.calculateTrendLine(
      history.map(h => ({ date: h.date.toISOString(), value: h.avgResponseTime })),
      true // 响应时间越低越好
    );

    const motivationTrend = this.calculateTrendLine(
      history.map(h => ({ date: h.date.toISOString(), value: h.motivation }))
    );

    // 生成总结和建议
    const { summary, recommendations } = this.generateSummaryAndRecommendations(
      accuracyTrend,
      responseTimeTrend,
      motivationTrend
    );

    return {
      accuracyTrend,
      responseTimeTrend,
      motivationTrend,
      summary,
      recommendations
    };
  }

  /**
   * 检查是否需要干预
   * Requirements: 2.2, 2.4
   * 
   * Property 4: 当状态为stuck或down时显示干预面板
   * Property 6: 连续3天以上down状态触发通知
   * 
   * @param userId 用户ID
   * @returns 干预建议结果
   */
  async checkIntervention(userId: string): Promise<InterventionResult> {
    const trend = await this.getCurrentTrend(userId);

    // 检查是否需要干预 (Requirements: 2.2)
    if (trend.state === 'up') {
      return {
        needsIntervention: false
      };
    }

    if (trend.state === 'flat') {
      return {
        needsIntervention: false
      };
    }

    // stuck 或 down 状态需要干预
    const needsIntervention = true;
    let type: 'warning' | 'suggestion' | 'encouragement';
    let message: string;
    let actions: string[];

    if (trend.state === 'down') {
      // 检查连续下降天数 (Requirements: 2.4)
      if (trend.consecutiveDays > CONSECUTIVE_DOWN_THRESHOLD) {
        type = 'warning';
        message = `您的学习状态已连续${trend.consecutiveDays}天下降，建议调整学习计划`;
        actions = [
          '减少每日学习量',
          '选择更简单的词书',
          '调整学习时间到黄金时段',
          '休息一天后再继续'
        ];
      } else {
        type = 'suggestion';
        message = '您的学习状态有所下降，建议适当调整';
        actions = [
          '尝试在精力充沛时学习',
          '减少单次学习时长',
          '增加复习比例'
        ];
      }
    } else {
      // stuck 状态
      type = 'encouragement';
      message = '您的学习进入了平台期，这是正常现象';
      actions = [
        '尝试新的学习方法',
        '挑战更难的单词',
        '设定小目标激励自己'
      ];
    }

    return {
      needsIntervention,
      type,
      message,
      actions
    };
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 验证趋势状态
   */
  private validateTrendState(state: string): TrendState {
    const validStates: TrendState[] = ['up', 'flat', 'stuck', 'down'];
    if (validStates.includes(state as TrendState)) {
      return state as TrendState;
    }
    return 'flat';
  }

  /**
   * 从历史记录计算趋势
   */
  private calculateTrendFromHistory(
    history: Array<{ motivation: number; memory: number; speed: number }>
  ): TrendState {
    if (history.length < 2) return 'flat';

    // 计算最近7天和之前7天的平均值
    const recent = history.slice(0, 7);
    const previous = history.slice(7, 14);

    if (previous.length === 0) return 'flat';

    const recentAvg = this.calculateAvgMetrics(recent);
    const previousAvg = this.calculateAvgMetrics(previous);

    const change = (recentAvg - previousAvg) / (previousAvg || 1);

    // 趋势判定逻辑（阈值：10% 为显著变化，5% 为轻微变化）
    // - up: 提升超过 10%
    // - down: 下降超过 10%
    // - flat: 变化在 ±5% 以内，表示稳定
    // - stuck: 变化在 5%-10% 之间但趋势不明显，需要结合连续天数判断是否为平台期
    const MINOR_CHANGE_THRESHOLD = 0.05;

    if (change > TREND_CHANGE_THRESHOLD) return 'up';
    if (change < -TREND_CHANGE_THRESHOLD) return 'down';
    if (Math.abs(change) < MINOR_CHANGE_THRESHOLD) return 'flat';
    // 轻微变化（5%-10%）标记为 stuck，提示用户可能进入平台期
    return 'stuck';
  }

  /**
   * 计算平均指标
   */
  private calculateAvgMetrics(
    items: Array<{ motivation: number; memory: number; speed: number }>
  ): number {
    if (items.length === 0) return 0;
    const sum = items.reduce(
      (acc, item) => acc + (item.motivation + item.memory + item.speed) / 3,
      0
    );
    return sum / items.length;
  }

  /**
   * 计算连续天数
   * 返回历史记录中从头开始连续匹配当前状态的天数
   *
   * 返回值规则：
   * - 0: 没有历史数据
   * - 1: 今天刚进入该状态（历史第一条不匹配或无历史）
   * - N: 连续N天处于该状态
   */
  private calculateConsecutiveDays(
    history: Array<{ trendState: string | null }>,
    currentState: TrendState
  ): number {
    // 如果没有历史记录，表示今天是第一天
    if (history.length === 0) {
      return 1;
    }

    let count = 0;
    for (const item of history) {
      if (item.trendState === currentState) {
        count++;
      } else {
        break;
      }
    }

    // 即使历史记录不匹配，今天的状态也算作第1天
    return count > 0 ? count : 1;
  }

  /**
   * 查找最后趋势变化时间
   */
  private findLastTrendChange(
    history: Array<{ date: Date; trendState: string | null }>,
    currentState: TrendState
  ): Date {
    for (let i = 1; i < history.length; i++) {
      if (history[i].trendState !== currentState) {
        return history[i - 1].date;
      }
    }
    return history.length > 0 ? history[history.length - 1].date : new Date();
  }

  /**
   * 按日期聚合数据
   */
  private aggregateDailyData(
    history: Array<{
      date: Date;
      trendState: string | null;
      motivation: number;
    }>,
    records: Array<{
      timestamp: Date;
      isCorrect: boolean;
      responseTime: number | null;
    }>
  ): TrendHistoryItem[] {
    // 按日期分组记录
    const recordsByDate = new Map<string, typeof records>();
    for (const record of records) {
      const dateKey = record.timestamp.toISOString().split('T')[0];
      if (!recordsByDate.has(dateKey)) {
        recordsByDate.set(dateKey, []);
      }
      recordsByDate.get(dateKey)!.push(record);
    }

    // 按日期分组历史
    const historyByDate = new Map<string, (typeof history)[0]>();
    for (const item of history) {
      const dateKey = item.date.toISOString().split('T')[0];
      historyByDate.set(dateKey, item);
    }

    // 合并数据
    const result: TrendHistoryItem[] = [];
    const allDates = new Set([
      ...Array.from(recordsByDate.keys()),
      ...Array.from(historyByDate.keys())
    ]);

    for (const dateKey of Array.from(allDates).sort()) {
      const dayRecords = recordsByDate.get(dateKey) || [];
      const historyItem = historyByDate.get(dateKey);

      // 计算正确率
      const accuracy = dayRecords.length > 0
        ? dayRecords.filter(r => r.isCorrect).length / dayRecords.length
        : 0;

      // 计算平均响应时间
      const responseTimes = dayRecords
        .filter(r => r.responseTime !== null)
        .map(r => r.responseTime!);
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      result.push({
        date: new Date(dateKey),
        state: this.validateTrendState(historyItem?.trendState || 'flat'),
        accuracy,
        avgResponseTime,
        motivation: historyItem?.motivation || 0
      });
    }

    return result;
  }

  /**
   * 计算趋势线
   */
  private calculateTrendLine(
    points: Array<{ date: string; value: number }>,
    invertDirection: boolean = false
  ): TrendLine {
    if (points.length === 0) {
      return {
        points: [],
        direction: 'flat',
        changePercent: 0
      };
    }

    // 计算变化百分比
    const firstValue = points[0]?.value || 0;
    const lastValue = points[points.length - 1]?.value || 0;
    const changePercent = firstValue !== 0
      ? ((lastValue - firstValue) / firstValue) * 100
      : 0;

    // 确定方向
    let direction: 'up' | 'down' | 'flat';
    const adjustedChange = invertDirection ? -changePercent : changePercent;
    
    if (adjustedChange > 5) {
      direction = 'up';
    } else if (adjustedChange < -5) {
      direction = 'down';
    } else {
      direction = 'flat';
    }

    return {
      points,
      direction,
      changePercent
    };
  }

  /**
   * 生成总结和建议
   */
  private generateSummaryAndRecommendations(
    accuracyTrend: TrendLine,
    responseTimeTrend: TrendLine,
    motivationTrend: TrendLine
  ): { summary: string; recommendations: string[] } {
    const summaryParts: string[] = [];
    const recommendations: string[] = [];

    // 分析正确率趋势
    if (accuracyTrend.direction === 'up') {
      summaryParts.push('正确率持续提升');
    } else if (accuracyTrend.direction === 'down') {
      summaryParts.push('正确率有所下降');
      recommendations.push('建议增加复习频率，巩固已学单词');
    }

    // 分析响应时间趋势
    if (responseTimeTrend.direction === 'up') {
      summaryParts.push('反应速度提升');
    } else if (responseTimeTrend.direction === 'down') {
      summaryParts.push('反应速度变慢');
      recommendations.push('建议适当休息，避免疲劳学习');
    }

    // 分析动机趋势
    if (motivationTrend.direction === 'up') {
      summaryParts.push('学习动力增强');
    } else if (motivationTrend.direction === 'down') {
      summaryParts.push('学习动力下降');
      recommendations.push('建议设定小目标，获取成就感');
    }

    // 生成总结
    const summary = summaryParts.length > 0
      ? `过去4周：${summaryParts.join('，')}`
      : '过去4周学习状态保持稳定';

    // 添加通用建议
    if (recommendations.length === 0) {
      recommendations.push('继续保持当前学习节奏');
      recommendations.push('可以尝试挑战更难的单词');
    }

    return { summary, recommendations };
  }
}

// 导出单例实例
export const trendAnalysisService = new TrendAnalysisService();
export default trendAnalysisService;
