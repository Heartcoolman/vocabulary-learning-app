import { WordLearningState, WordState, AlgorithmConfig } from '../../types/models';

/**
 * 间隔重复算法引擎
 * 基于艾宾浩斯遗忘曲线的 SM-2 改进算法
 */
export class SpacedRepetitionEngine {
  private config: AlgorithmConfig;

  constructor(config: AlgorithmConfig) {
    this.config = config;
  }

  /**
   * 计算下次复习时间
   * 公式：nextReview = lastReview + interval * easeFactor
   *
   * @param state 单词学习状态
   * @returns 下次复习时间戳（毫秒）
   */
  calculateNextReviewDate(state: WordLearningState): number {
    const now = Date.now();
    const lastReview = state.lastReviewDate || now;

    // 获取当前复习间隔（天）
    const intervalDays = this.getIntervalForReviewCount(state.reviewCount);

    // 早期（<=2 次复习）不放大间隔，避免首次复习被拉长到一周+
    const applyEaseFactor = state.reviewCount > 2;
    const effectiveEase = applyEaseFactor ? state.easeFactor : 1;

    // 应用难度因子，至少间隔 1 天
    const adjustedIntervalDays = Math.max(1, Math.round(intervalDays * effectiveEase));

    // 转换为毫秒并计算下次复习时间
    const intervalMs = adjustedIntervalDays * 24 * 60 * 60 * 1000;
    const nextReviewDate = lastReview + intervalMs;

    return nextReviewDate;
  }

  /**
   * 根据复习次数获取复习间隔
   *
   * @param reviewCount 复习次数
   * @returns 复习间隔（天）
   */
  private getIntervalForReviewCount(reviewCount: number): number {
    const intervals = this.config.reviewIntervals;

    // 如果复习次数超过配置的间隔数组长度，使用最后一个间隔
    if (reviewCount >= intervals.length) {
      return intervals[intervals.length - 1];
    }

    return intervals[reviewCount];
  }

  /**
   * 更新掌握程度等级
   * 根据连续答对次数、正确率和单词得分判断是否晋升
   *
   * @param state 单词学习状态
   * @param accuracy 当前正确率（0-1）
   * @param wordScore 单词得分（0-100）
   * @returns 更新后的掌握程度（0-5级）
   */
  updateMasteryLevel(state: WordLearningState, accuracy: number, wordScore: number): number {
    const currentLevel = state.masteryLevel;

    // 已经达到最高级别
    if (currentLevel >= 5) {
      return 5;
    }

    // 查找下一级别的晋升条件
    const nextLevelThreshold = this.config.masteryThresholds.find(
      (t) => t.level === currentLevel + 1,
    );

    if (!nextLevelThreshold) {
      return currentLevel;
    }

    // 检查是否满足晋升条件
    const meetsCorrectStreak = state.consecutiveCorrect >= nextLevelThreshold.requiredCorrectStreak;
    const meetsAccuracy = accuracy >= nextLevelThreshold.minAccuracy;
    const meetsScore = wordScore >= nextLevelThreshold.minScore;

    if (meetsCorrectStreak && meetsAccuracy && meetsScore) {
      return currentLevel + 1;
    }

    return currentLevel;
  }

  /**
   * 处理答对的情况
   *
   * @param state 当前单词学习状态
   * @param responseTime 响应时间（毫秒）
   * @param accuracy 当前正确率（0-1）
   * @param wordScore 单词得分（0-100）
   * @returns 更新后的学习状态
   */
  processCorrectAnswer(
    state: WordLearningState,
    responseTime: number,
    accuracy: number,
    wordScore: number,
  ): Partial<WordLearningState> {
    const now = Date.now();

    // 增加连续答对次数，重置连续答错次数
    const consecutiveCorrect = state.consecutiveCorrect + 1;
    const consecutiveWrong = 0;

    // 增加复习次数
    const reviewCount = state.reviewCount + 1;

    // 更新掌握程度
    const newState = {
      ...state,
      consecutiveCorrect,
      consecutiveWrong,
      reviewCount,
    };
    const masteryLevel = this.updateMasteryLevel(newState, accuracy, wordScore);

    // 更新单词状态
    let wordState = state.state;
    if (wordState === WordState.NEW) {
      wordState = WordState.LEARNING;
    } else if (masteryLevel >= 5) {
      wordState = WordState.MASTERED;
    } else if (masteryLevel >= 2) {
      wordState = WordState.REVIEWING;
    }

    // 调整难度因子（答对时略微增加，最大2.5）
    let easeFactor = state.easeFactor;
    if (responseTime < this.config.speedThresholds.excellent) {
      // 快速答对，增加难度因子
      easeFactor = Math.min(2.5, easeFactor + 0.1);
    } else if (responseTime < this.config.speedThresholds.good) {
      easeFactor = Math.min(2.5, easeFactor + 0.05);
    }

    // 计算下次复习时间
    const updatedState = {
      ...newState,
      masteryLevel,
      easeFactor,
      state: wordState,
      lastReviewDate: now,
    };
    const nextReviewDate = this.calculateNextReviewDate(updatedState);

    // 计算当前间隔
    const currentInterval = Math.round((nextReviewDate - now) / (24 * 60 * 60 * 1000));

    return {
      state: wordState,
      masteryLevel,
      easeFactor,
      reviewCount,
      consecutiveCorrect,
      consecutiveWrong,
      lastReviewDate: now,
      nextReviewDate,
      currentInterval,
      updatedAt: now,
    };
  }

  /**
   * 处理答错的情况
   *
   * @param state 当前单词学习状态
   * @returns 更新后的学习状态
   */
  processWrongAnswer(state: WordLearningState): Partial<WordLearningState> {
    const now = Date.now();

    // 重置连续答对次数，增加连续答错次数（最大5，避免超出验证器限制）
    const consecutiveCorrect = 0;
    const consecutiveWrong = Math.min(5, state.consecutiveWrong + 1);

    // 降低掌握程度（最低为0）
    const masteryLevel = Math.max(0, state.masteryLevel - 1);

    // 更新单词状态
    let wordState = state.state;
    if (masteryLevel === 0) {
      wordState = WordState.NEW;
    } else if (masteryLevel < 2) {
      wordState = WordState.LEARNING;
    }

    // 降低难度因子（答错时降低，最小1.3）
    const easeFactor = Math.max(1.3, state.easeFactor - 0.2);

    // 重置复习间隔为1天
    const currentInterval = 1;
    const nextReviewDate = now + currentInterval * 24 * 60 * 60 * 1000;

    return {
      state: wordState,
      masteryLevel,
      easeFactor,
      consecutiveCorrect,
      consecutiveWrong,
      lastReviewDate: now,
      nextReviewDate,
      currentInterval,
      updatedAt: now,
    };
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
