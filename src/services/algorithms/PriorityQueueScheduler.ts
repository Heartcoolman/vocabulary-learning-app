import { WordLearningState, WordScore, WordState, AlgorithmConfig } from '../../types/models';

/**
 * 单词优先级信息
 */
interface WordPriority {
  wordId: string;
  priority: number;
  state: WordState;
  isOverdue: boolean;
  errorRate: number;
  score: number;
}

/**
 * 优先级队列调度引擎
 * 根据单词状态、错误率、逾期时间和得分计算优先级
 */
export class PriorityQueueScheduler {
  private config: AlgorithmConfig;

  constructor(config: AlgorithmConfig) {
    this.config = config;
  }

  /**
   * 生成学习队列
   * 
   * @param wordStates 所有单词的学习状态
   * @param wordScores 所有单词的得分
   * @param targetCount 目标单词数量
   * @param userAccuracy 用户整体正确率（0-1）
   * @returns 排序后的单词ID列表
   */
  generateLearningQueue(
    wordStates: WordLearningState[],
    wordScores: Map<string, WordScore>,
    targetCount: number,
    userAccuracy: number
  ): string[] {
    const now = Date.now();
    
    // 分类单词
    const newWords: WordLearningState[] = [];
    const reviewWords: WordLearningState[] = [];
    
    for (const state of wordStates) {
      if (state.state === WordState.NEW) {
        newWords.push(state);
      } else if (state.nextReviewDate && state.nextReviewDate <= now) {
        // 到期需要复习的单词
        reviewWords.push(state);
      }
    }
    
    // 计算新单词和复习单词的比例
    const newWordRatio = this.calculateNewWordRatio(userAccuracy);
    const newWordCount = Math.min(
      Math.round(targetCount * newWordRatio),
      newWords.length
    );
    const reviewWordCount = Math.min(
      targetCount - newWordCount,
      reviewWords.length
    );
    
    // 如果复习单词不足，用新单词补充
    const actualNewWordCount = newWordCount + Math.max(0, targetCount - newWordCount - reviewWordCount);
    
    // 混合新单词和复习单词
    const selectedWords = this.mixNewAndReviewWords(
      newWords,
      reviewWords,
      actualNewWordCount,
      reviewWordCount,
      wordScores
    );
    
    return selectedWords;
  }

  /**
   * 计算单词优先级
   * 综合考虑单词状态、错误率、逾期时间、单词得分
   * 
   * @param state 单词学习状态
   * @param score 单词得分
   * @returns 优先级分数（越高越优先）
   */
  calculatePriority(state: WordLearningState, score: WordScore | undefined): number {
    const now = Date.now();
    const weights = this.config.priorityWeights;
    
    // 1. 新单词权重
    const newWordScore = state.state === WordState.NEW ? weights.newWord : 0;
    
    // 2. 错误率权重
    let errorRateScore = 0;
    if (score && score.totalAttempts > 0) {
      const errorRate = 1 - (score.correctAttempts / score.totalAttempts);
      // 错误率超过50%给予更高权重
      errorRateScore = errorRate > 0.5 ? weights.errorRate : weights.errorRate * errorRate * 2;
    }
    
    // 3. 逾期时间权重
    let overdueScore = 0;
    if (state.nextReviewDate && state.nextReviewDate < now) {
      const overdueDays = (now - state.nextReviewDate) / (24 * 60 * 60 * 1000);
      // 逾期时间越长，权重越高（最多给满分）
      overdueScore = Math.min(weights.overdueTime, weights.overdueTime * (overdueDays / 7));
    }
    
    // 4. 单词得分权重（得分越低越优先）
    let scoreWeight = 0;
    if (score) {
      // 得分低于40分的单词给予更高权重
      if (score.totalScore < 40) {
        scoreWeight = weights.wordScore;
      } else {
        // 得分越高，权重越低
        scoreWeight = weights.wordScore * (1 - score.totalScore / 100);
      }
    }
    
    // 计算总优先级
    const totalPriority = newWordScore + errorRateScore + overdueScore + scoreWeight;
    
    return totalPriority;
  }

  /**
   * 混合新单词和复习单词
   * 
   * @param newWords 新单词列表
   * @param reviewWords 复习单词列表
   * @param newWordCount 需要的新单词数量
   * @param reviewWordCount 需要的复习单词数量
   * @param wordScores 单词得分映射
   * @returns 混合后的单词ID列表
   */
  mixNewAndReviewWords(
    newWords: WordLearningState[],
    reviewWords: WordLearningState[],
    newWordCount: number,
    reviewWordCount: number,
    wordScores: Map<string, WordScore>
  ): string[] {
    const now = Date.now();
    
    // 计算所有单词的优先级
    const allWordPriorities: WordPriority[] = [];
    
    // 处理新单词
    for (const state of newWords) {
      const score = wordScores.get(state.wordId);
      const priority = this.calculatePriority(state, score);
      allWordPriorities.push({
        wordId: state.wordId,
        priority,
        state: state.state,
        isOverdue: false,
        errorRate: score ? 1 - (score.correctAttempts / score.totalAttempts) : 0,
        score: score?.totalScore || 0
      });
    }
    
    // 处理复习单词
    for (const state of reviewWords) {
      const score = wordScores.get(state.wordId);
      const priority = this.calculatePriority(state, score);
      const isOverdue = state.nextReviewDate ? state.nextReviewDate < now : false;
      allWordPriorities.push({
        wordId: state.wordId,
        priority,
        state: state.state,
        isOverdue,
        errorRate: score ? 1 - (score.correctAttempts / score.totalAttempts) : 0,
        score: score?.totalScore || 0
      });
    }
    
    // 排序：新单词 > 逾期复习 > 高错误率 > 正常复习
    allWordPriorities.sort((a, b) => {
      // 1. 新单词优先
      if (a.state === WordState.NEW && b.state !== WordState.NEW) return -1;
      if (a.state !== WordState.NEW && b.state === WordState.NEW) return 1;
      
      // 2. 逾期复习优先
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      
      // 3. 高错误率优先（错误率 > 50%）
      const aHighError = a.errorRate > 0.5;
      const bHighError = b.errorRate > 0.5;
      if (aHighError && !bHighError) return -1;
      if (!aHighError && bHighError) return 1;
      
      // 4. 按优先级分数排序
      return b.priority - a.priority;
    });
    
    // 选择指定数量的单词
    const selectedNewWords = allWordPriorities
      .filter(w => w.state === WordState.NEW)
      .slice(0, newWordCount)
      .map(w => w.wordId);
    
    const selectedReviewWords = allWordPriorities
      .filter(w => w.state !== WordState.NEW)
      .slice(0, reviewWordCount)
      .map(w => w.wordId);
    
    // 合并并返回
    return [...selectedNewWords, ...selectedReviewWords];
  }

  /**
   * 计算新单词比例
   * 根据用户整体正确率调整
   * 
   * @param userAccuracy 用户整体正确率（0-1）
   * @returns 新单词比例（0-1）
   */
  private calculateNewWordRatio(userAccuracy: number): number {
    const ratioConfig = this.config.newWordRatio;
    
    if (userAccuracy >= ratioConfig.highAccuracyThreshold) {
      // 高正确率：增加新单词比例
      return ratioConfig.highAccuracy;
    } else if (userAccuracy <= ratioConfig.lowAccuracyThreshold) {
      // 低正确率：减少新单词比例
      return ratioConfig.lowAccuracy;
    } else {
      // 正常正确率：使用默认比例
      return ratioConfig.default;
    }
  }

  /**
   * 获取到期需要复习的单词
   * 
   * @param wordStates 所有单词的学习状态
   * @returns 到期单词的ID列表
   */
  getDueWords(wordStates: WordLearningState[]): string[] {
    const now = Date.now();
    
    return wordStates
      .filter(state => 
        state.nextReviewDate && 
        state.nextReviewDate <= now &&
        state.state !== WordState.NEW
      )
      .map(state => state.wordId);
  }

  /**
   * 获取即将到期的单词（未来N天内）
   * 
   * @param wordStates 所有单词的学习状态
   * @param days 天数
   * @returns 即将到期单词的ID列表
   */
  getUpcomingWords(wordStates: WordLearningState[], days: number): string[] {
    const now = Date.now();
    const futureTime = now + (days * 24 * 60 * 60 * 1000);
    
    return wordStates
      .filter(state => 
        state.nextReviewDate && 
        state.nextReviewDate > now &&
        state.nextReviewDate <= futureTime &&
        state.state !== WordState.NEW
      )
      .map(state => state.wordId);
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
