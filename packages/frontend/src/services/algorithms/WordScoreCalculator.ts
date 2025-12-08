import { WordScore, AnswerRecord, AlgorithmConfig } from '../../types/models';

/**
 * 单词综合评分引擎
 * 基于正确率、答题速度、稳定性和熟练度计算综合得分
 */
export class WordScoreCalculator {
  private config: AlgorithmConfig;

  constructor(config: AlgorithmConfig) {
    this.config = config;
  }

  /**
   * 计算单词综合得分
   * 公式：总分 = 正确率×40 + 速度×30 + 稳定性×20 + 熟练度×10
   *
   * @param currentScore 当前单词得分
   * @param recentRecords 最近的答题记录（用于计算稳定性）
   * @returns 更新后的单词得分
   */
  calculateScore(currentScore: WordScore, recentRecords: AnswerRecord[]): Partial<WordScore> {
    // 计算各维度得分
    const accuracyScore = this.calculateAccuracyScore(currentScore);
    const speedScore = this.calculateSpeedScore(currentScore);
    const stabilityScore = this.calculateStabilityScore(recentRecords);
    const proficiencyScore = this.calculateProficiencyScore(currentScore);

    // 计算总分（使用配置的权重）
    const weights = this.config.scoreWeights;
    const totalScore =
      (accuracyScore / 40) * weights.accuracy +
      (speedScore / 30) * weights.speed +
      (stabilityScore / 20) * weights.stability +
      (proficiencyScore / 10) * weights.proficiency;

    return {
      totalScore,
      accuracyScore,
      speedScore,
      stabilityScore,
      proficiencyScore,
      updatedAt: Date.now(),
    };
  }

  /**
   * 计算正确率得分（0-40分）
   *
   * @param score 当前单词得分
   * @returns 正确率得分
   */
  calculateAccuracyScore(score: WordScore): number {
    if (score.totalAttempts === 0) {
      return 0;
    }

    const accuracy = score.correctAttempts / score.totalAttempts;

    // 正确率得分：正确率 * 40
    return accuracy * 40;
  }

  /**
   * 计算答题速度得分（0-30分）
   * 根据平均响应时间评分
   *
   * @param score 当前单词得分
   * @returns 答题速度得分
   */
  calculateSpeedScore(score: WordScore): number {
    const avgResponseTime = score.averageResponseTime;
    const thresholds = this.config.speedThresholds;

    if (avgResponseTime === 0) {
      return 0;
    }

    // 根据响应时间评分
    if (avgResponseTime < thresholds.excellent) {
      // < 3秒：满分30分
      return 30;
    } else if (avgResponseTime < thresholds.good) {
      // 3-5秒：20分
      return 20;
    } else if (avgResponseTime < thresholds.average) {
      // 5-10秒：10分
      return 10;
    } else {
      // > 10秒：0分
      return 0;
    }
  }

  /**
   * 计算稳定性得分（0-20分）
   * 基于最近5次答题的一致性
   *
   * @param recentRecords 最近的答题记录（最多5条）
   * @returns 稳定性得分
   */
  calculateStabilityScore(recentRecords: AnswerRecord[]): number {
    if (recentRecords.length === 0) {
      return 0;
    }

    // 只取最近5次
    const last5Records = recentRecords.slice(-5);

    // 计算错误次数
    const wrongCount = last5Records.filter((r) => !r.isCorrect).length;

    // 根据错误次数评分
    if (wrongCount === 0) {
      // 全对：20分
      return 20;
    } else if (wrongCount === 1) {
      // 1次错误：10分
      return 10;
    } else {
      // 2次及以上错误：0分
      return 0;
    }
  }

  /**
   * 计算熟练度得分（0-10分）
   * 基于平均停留时长
   *
   * @param score 当前单词得分
   * @returns 熟练度得分
   */
  calculateProficiencyScore(score: WordScore): number {
    const avgDwellTime = score.averageDwellTime;

    if (avgDwellTime === 0) {
      return 0;
    }

    // 根据停留时长评分（停留时间越短得分越高）
    if (avgDwellTime < 5000) {
      // < 5秒：10分
      return 10;
    } else if (avgDwellTime < 10000) {
      // 5-10秒：5分
      return 5;
    } else {
      // > 10秒：0分
      return 0;
    }
  }

  /**
   * 更新单词得分统计数据
   *
   * @param currentScore 当前单词得分
   * @param newRecord 新的答题记录
   * @returns 更新后的统计数据
   */
  updateScoreStatistics(currentScore: WordScore, newRecord: AnswerRecord): Partial<WordScore> {
    const totalAttempts = currentScore.totalAttempts + 1;
    const correctAttempts = currentScore.correctAttempts + (newRecord.isCorrect ? 1 : 0);

    // 更新平均响应时间
    const totalResponseTime = currentScore.averageResponseTime * currentScore.totalAttempts;
    const newResponseTime = newRecord.responseTime || 0;
    const averageResponseTime = (totalResponseTime + newResponseTime) / totalAttempts;

    // 更新平均停留时长
    const totalDwellTime = currentScore.averageDwellTime * currentScore.totalAttempts;
    const newDwellTime = newRecord.dwellTime || 0;
    const averageDwellTime = (totalDwellTime + newDwellTime) / totalAttempts;

    return {
      totalAttempts,
      correctAttempts,
      averageResponseTime,
      averageDwellTime,
      updatedAt: Date.now(),
    };
  }

  /**
   * 更新最近正确率（最近5次）
   *
   * @param recentRecords 最近的答题记录（最多5条）
   * @returns 最近正确率（0-1）
   */
  updateRecentAccuracy(recentRecords: AnswerRecord[]): number {
    if (recentRecords.length === 0) {
      return 0;
    }

    // 只取最近5次
    const last5Records = recentRecords.slice(-5);
    const correctCount = last5Records.filter((r) => r.isCorrect).length;

    return correctCount / last5Records.length;
  }

  /**
   * 判断单词是否需要重点学习
   *
   * @param score 单词得分
   * @returns 是否需要重点学习
   */
  needsIntensivePractice(score: WordScore): boolean {
    return score.totalScore < 40;
  }

  /**
   * 判断单词是否已熟练掌握
   *
   * @param score 单词得分
   * @param consecutiveHighScoreCount 连续高分次数
   * @returns 是否已熟练掌握
   */
  isMastered(score: WordScore, consecutiveHighScoreCount: number): boolean {
    return score.totalScore > 80 && consecutiveHighScoreCount >= 3;
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
