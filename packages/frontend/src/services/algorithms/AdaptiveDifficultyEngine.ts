import { AlgorithmConfig } from '../../types/models';

/**
 * 会话统计信息
 */
interface SessionStats {
  sessionId: string;
  totalWords: number;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  accuracy: number;
  timestamp: number;
}

/**
 * 难度调整结果
 */
interface DifficultyAdjustment {
  shouldAdjust: boolean;
  newWordCount?: number;
  reason?: string;
}

/**
 * 自适应难度引擎
 * 根据用户表现动态调整学习难度和单词数量
 */
export class AdaptiveDifficultyEngine {
  private config: AlgorithmConfig;
  private sessionHistory: SessionStats[] = [];
  private lastAdjustmentSession: number = 0;

  constructor(config: AlgorithmConfig) {
    this.config = config;
  }

  /**
   * 调整难度
   * 根据连续答对/答错次数调整单词数量
   *
   * @param currentWordCount 当前单词数量
   * @param consecutiveCorrect 连续答对次数
   * @param consecutiveWrong 连续答错次数
   * @param sessionCount 当前会话数
   * @returns 难度调整结果
   */
  adjustDifficulty(
    currentWordCount: number,
    consecutiveCorrect: number,
    consecutiveWrong: number,
    sessionCount: number,
  ): DifficultyAdjustment {
    // 检查是否满足调整间隔限制
    const sessionsSinceLastAdjustment = sessionCount - this.lastAdjustmentSession;
    if (sessionsSinceLastAdjustment < this.config.difficultyAdjustmentInterval) {
      return {
        shouldAdjust: false,
        reason: '未达到最小调整间隔',
      };
    }

    // 检查连续答对阈值
    if (consecutiveCorrect >= this.config.consecutiveCorrectThreshold) {
      // 增加难度：增加单词数量（最多增加50%）
      const increase = Math.round(currentWordCount * 0.5);
      const newWordCount = currentWordCount + increase;

      this.lastAdjustmentSession = sessionCount;

      return {
        shouldAdjust: true,
        newWordCount,
        reason: `连续答对${consecutiveCorrect}次，增加难度`,
      };
    }

    // 检查连续答错阈值
    if (consecutiveWrong >= this.config.consecutiveWrongThreshold) {
      // 降低难度：减少单词数量（最少减少到5个）
      const decrease = Math.round(currentWordCount * 0.3);
      const newWordCount = Math.max(5, currentWordCount - decrease);

      this.lastAdjustmentSession = sessionCount;

      return {
        shouldAdjust: true,
        newWordCount,
        reason: `连续答错${consecutiveWrong}次，降低难度`,
      };
    }

    return {
      shouldAdjust: false,
      reason: '未达到调整阈值',
    };
  }

  /**
   * 计算新单词比例
   * 根据会话正确率调整新单词比例
   *
   * @param sessionAccuracy 会话正确率（0-1）
   * @returns 新单词比例（0-1）
   */
  calculateNewWordRatio(sessionAccuracy: number): number {
    const ratioConfig = this.config.newWordRatio;

    if (sessionAccuracy > 0.9) {
      // 正确率超过90%：增加新单词比例
      return ratioConfig.highAccuracy;
    } else if (sessionAccuracy < 0.6) {
      // 正确率低于60%：减少新单词比例
      return ratioConfig.lowAccuracy;
    } else {
      // 正常正确率：使用默认比例
      return ratioConfig.default;
    }
  }

  /**
   * 记录会话统计
   *
   * @param stats 会话统计信息
   */
  recordSessionStats(stats: SessionStats): void {
    this.sessionHistory.push(stats);

    // 只保留最近10次会话的记录
    if (this.sessionHistory.length > 10) {
      this.sessionHistory.shift();
    }
  }

  /**
   * 获取会话统计历史
   *
   * @returns 会话统计历史
   */
  getSessionHistory(): SessionStats[] {
    return [...this.sessionHistory];
  }

  /**
   * 计算整体趋势
   * 分析最近几次会话的表现趋势
   *
   * @returns 趋势分析结果
   */
  analyzeTrend(): {
    isImproving: boolean;
    averageAccuracy: number;
    recommendation: string;
  } {
    if (this.sessionHistory.length < 3) {
      return {
        isImproving: false,
        averageAccuracy: 0,
        recommendation: '数据不足，继续学习',
      };
    }

    // 取最近5次会话
    const recentSessions = this.sessionHistory.slice(-5);

    // 计算平均正确率
    const totalAccuracy = recentSessions.reduce((sum, s) => sum + s.accuracy, 0);
    const averageAccuracy = totalAccuracy / recentSessions.length;

    // 分析趋势：比较前半部分和后半部分的正确率
    const midPoint = Math.floor(recentSessions.length / 2);
    const firstHalf = recentSessions.slice(0, midPoint);
    const secondHalf = recentSessions.slice(midPoint);

    const firstHalfAccuracy = firstHalf.reduce((sum, s) => sum + s.accuracy, 0) / firstHalf.length;
    const secondHalfAccuracy =
      secondHalf.reduce((sum, s) => sum + s.accuracy, 0) / secondHalf.length;

    const isImproving = secondHalfAccuracy > firstHalfAccuracy;

    // 生成建议
    let recommendation = '';
    if (isImproving) {
      if (averageAccuracy > 0.85) {
        recommendation = '表现优秀！可以尝试增加学习量或学习新单词';
      } else {
        recommendation = '进步明显！继续保持';
      }
    } else {
      if (averageAccuracy < 0.6) {
        recommendation = '建议减少学习量，多复习已学单词';
      } else {
        recommendation = '保持当前节奏，注意复习';
      }
    }

    return {
      isImproving,
      averageAccuracy,
      recommendation,
    };
  }

  /**
   * 重置调整历史
   * 用于开始新的学习周期
   */
  resetAdjustmentHistory(): void {
    this.lastAdjustmentSession = 0;
    this.sessionHistory = [];
  }

  /**
   * 获取建议的单词数量
   * 基于用户历史表现
   *
   * @param baseWordCount 基础单词数量
   * @returns 建议的单词数量
   */
  getRecommendedWordCount(baseWordCount: number): number {
    if (this.sessionHistory.length === 0) {
      return baseWordCount;
    }

    const trend = this.analyzeTrend();

    if (trend.isImproving && trend.averageAccuracy > 0.85) {
      // 表现优秀且在进步：建议增加20%
      return Math.round(baseWordCount * 1.2);
    } else if (!trend.isImproving && trend.averageAccuracy < 0.6) {
      // 表现下降且正确率低：建议减少30%
      return Math.max(5, Math.round(baseWordCount * 0.7));
    }

    return baseWordCount;
  }

  /**
   * 更新配置
   *
   * @param config 新的算法配置
   */
  updateConfig(config: AlgorithmConfig): void {
    this.config = config;
  }
}
