/**
 * 自适应队列管理器
 * Adaptive Queue Manager for dynamic word queue adjustments
 */

import { AdjustReason } from '../../types/amas';
import { learningLogger } from '../../utils/logger';

export interface RecentPerformance {
  accuracy: number;
  avgResponseTime: number;
  consecutiveWrong: number;
}

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface PerformanceTrend {
  direction: TrendDirection;
  magnitude: number;
}

export interface AdjustmentCheckResult {
  should: boolean;
  reason?: AdjustReason;
  trend?: TrendDirection;
  trendMagnitude?: number;
  suggestedDifficulty?: 'easier' | 'harder';
}

export interface UserStateSnapshot {
  fatigue: number;
  attention: number;
  motivation: number;
}

export class AdaptiveQueueManager {
  private answerCount: number = 0;
  private consecutiveWrong: number = 0;
  private recentAnswers: Array<{ isCorrect: boolean; responseTime: number }> = [];

  private readonly HISTORY_SIZE = 10;
  private readonly PERIODIC_CHECK_INTERVAL = 3;
  private readonly FATIGUE_THRESHOLD = 0.8;
  private readonly CONSECUTIVE_WRONG_THRESHOLD = 3;
  private readonly EXCELLING_ACCURACY_THRESHOLD = 0.9;
  private readonly EXCELLING_RESPONSE_TIME_THRESHOLD = 2000;

  /**
   * 提交答案并检查是否需要调整
   */
  onAnswerSubmitted(
    isCorrect: boolean,
    responseTime: number,
    userState?: UserStateSnapshot,
    currentWordDifficulty: number = 0.5,
  ): AdjustmentCheckResult {
    this.answerCount++;
    this.updatePerformance(isCorrect, responseTime);

    // 1. 紧急检查：连续错误 (struggling)
    if (this.consecutiveWrong >= this.CONSECUTIVE_WRONG_THRESHOLD) {
      learningLogger.info({ consecutiveWrong: this.consecutiveWrong }, '触发调整: 连续错误');
      return { should: true, reason: 'struggling', suggestedDifficulty: 'easier' };
    }

    // 2. 紧急检查：疲劳度过高 (fatigue)
    if (userState && userState.fatigue > this.FATIGUE_THRESHOLD) {
      learningLogger.info({ fatigue: userState.fatigue }, '触发调整: 疲劳度过高');
      return { should: true, reason: 'fatigue', suggestedDifficulty: 'easier' };
    }

    // 3. 动态周期检查
    const perf = this.getRecentPerformance();
    const dynamicInterval = this.calculateAdaptiveInterval(userState, perf);

    if (this.answerCount >= dynamicInterval) {
      const trend = this.detectPerformanceTrend();
      const difficultyMismatch = this.detectDifficultyMismatch(perf, currentWordDifficulty);

      let reason: AdjustReason = 'periodic';
      let suggestedDifficulty: 'easier' | 'harder' | undefined = difficultyMismatch || undefined;

      // 预测性触发优先级
      if (difficultyMismatch === 'harder' && trend.direction === 'improving') {
        reason = 'excelling';
      } else if (difficultyMismatch === 'easier' && trend.direction === 'declining') {
        reason = 'struggling';
      } else if (
        perf.accuracy > this.EXCELLING_ACCURACY_THRESHOLD &&
        perf.avgResponseTime < this.EXCELLING_RESPONSE_TIME_THRESHOLD
      ) {
        reason = 'excelling';
        suggestedDifficulty = 'harder';
      }

      learningLogger.info(
        `[AdaptiveQueue] 触发调整: ${reason} (间隔:${dynamicInterval}, 趋势:${trend.direction}, 难度建议:${suggestedDifficulty || 'none'})`,
      );

      return {
        should: true,
        reason,
        trend: trend.direction,
        trendMagnitude: trend.magnitude,
        suggestedDifficulty,
      };
    }

    return { should: false };
  }

  /**
   * 获取最近表现统计
   */
  getRecentPerformance(): RecentPerformance {
    if (this.recentAnswers.length === 0) {
      return {
        accuracy: 0.5, // 默认中等准确率
        avgResponseTime: 3000, // 默认3秒
        consecutiveWrong: this.consecutiveWrong,
      };
    }

    const correctCount = this.recentAnswers.filter((a) => a.isCorrect).length;
    const totalTime = this.recentAnswers.reduce((sum, a) => sum + a.responseTime, 0);

    return {
      accuracy: correctCount / this.recentAnswers.length,
      avgResponseTime: totalTime / this.recentAnswers.length,
      consecutiveWrong: this.consecutiveWrong,
    };
  }

  /**
   * 重置计数器（在调整后调用）
   */
  resetCounter(): void {
    this.answerCount = 0;
    // 注意：consecutiveWrong 和 recentAnswers 不重置，保持历史连续性
  }

  /**
   * 获取当前答题计数
   */
  getAnswerCount(): number {
    return this.answerCount;
  }

  /**
   * 获取连续错误数
   */
  getConsecutiveWrong(): number {
    return this.consecutiveWrong;
  }

  /**
   * 计算动态检查间隔
   * 根据用户状态和表现动态调整下次检查的答题间隔
   */
  private calculateAdaptiveInterval(
    userState: UserStateSnapshot | undefined,
    performance: RecentPerformance,
  ): number {
    // 挣扎中：需要立即干预
    if (performance.consecutiveWrong >= 2 || performance.accuracy < 0.4) {
      return 1;
    }

    // 疲劳或注意力低：更频繁检查
    if (userState && (userState.fatigue > 0.6 || userState.attention < 0.4)) {
      return 2;
    }

    // 表现优秀：减少检查频率
    if (
      performance.accuracy > this.EXCELLING_ACCURACY_THRESHOLD &&
      performance.avgResponseTime < this.EXCELLING_RESPONSE_TIME_THRESHOLD
    ) {
      return 5;
    }

    return this.PERIODIC_CHECK_INTERVAL;
  }

  /**
   * 检测表现趋势
   * 通过对比前半段和后半段答题数据，判断表现是在进步、下降还是稳定
   */
  private detectPerformanceTrend(): PerformanceTrend {
    if (this.recentAnswers.length < 4) {
      return { direction: 'stable', magnitude: 0 };
    }

    const mid = Math.floor(this.recentAnswers.length / 2);
    const oldHalf = this.recentAnswers.slice(0, mid);
    const newHalf = this.recentAnswers.slice(mid);

    const calculateAccuracy = (answers: typeof this.recentAnswers): number => {
      if (answers.length === 0) return 0.5;
      return answers.filter((a) => a.isCorrect).length / answers.length;
    };

    const accuracyDiff = calculateAccuracy(newHalf) - calculateAccuracy(oldHalf);
    const magnitude = Math.abs(accuracyDiff);

    if (accuracyDiff > 0.15) {
      return { direction: 'improving', magnitude };
    }
    if (accuracyDiff < -0.15) {
      return { direction: 'declining', magnitude };
    }
    return { direction: 'stable', magnitude };
  }

  /**
   * 检测难度不匹配
   * 判断当前单词难度是否与用户实际能力匹配
   */
  private detectDifficultyMismatch(
    performance: RecentPerformance,
    currentDifficulty: number,
  ): 'harder' | 'easier' | null {
    // 表现优秀但难度太低：建议增加难度
    if (performance.accuracy > 0.9 && currentDifficulty < 0.3) {
      return 'harder';
    }

    // 表现不佳且难度太高：建议降低难度
    if (performance.accuracy < 0.3 && currentDifficulty > 0.7) {
      return 'easier';
    }

    return null;
  }

  private updatePerformance(isCorrect: boolean, responseTime: number): void {
    // 更新连续错误计数
    if (isCorrect) {
      this.consecutiveWrong = 0;
    } else {
      this.consecutiveWrong++;
    }

    // 更新最近回答历史
    this.recentAnswers.push({ isCorrect, responseTime });
    if (this.recentAnswers.length > this.HISTORY_SIZE) {
      this.recentAnswers.shift();
    }
  }
}
