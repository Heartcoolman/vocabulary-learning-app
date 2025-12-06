import {
  WordLearningState,
  WordScore,
  AnswerRecord,
  AlgorithmConfig,
  WordState
} from '../../types/models';
import { SpacedRepetitionEngine } from './SpacedRepetitionEngine';
import { WordScoreCalculator } from './WordScoreCalculator';
import { PriorityQueueScheduler } from './PriorityQueueScheduler';
import { AdaptiveDifficultyEngine } from './AdaptiveDifficultyEngine';
import { WordStateManager, WordStateStorage } from './WordStateManager';
import { learningLogger } from '../../utils/logger';

/**
 * 学习会话信息
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  wordIds: string[];
  currentIndex: number;
  startTime: number;
  endTime?: number;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
}

/**
 * 答题结果
 */
export interface AnswerResult {
  isCorrect: boolean;
  wordState: WordLearningState;
  wordScore: WordScore;
  masteryLevelChange: number;
  scoreChange: number;
  nextReviewDate: number | null;
}

/**
 * 间隔重复核心服务
 * 整合所有算法引擎，提供完整的学习功能
 */
export class SpacedRepetitionService {
  private srEngine: SpacedRepetitionEngine;
  private scoreCalculator: WordScoreCalculator;
  private priorityScheduler: PriorityQueueScheduler;
  private difficultyEngine: AdaptiveDifficultyEngine;
  private stateManager: WordStateManager;
  private storage: WordStateStorage;

  private currentSession: SessionInfo | null = null;
  private sessionCount: number = 0;

  constructor(
    config: AlgorithmConfig,
    storage: WordStateStorage
  ) {
    this.srEngine = new SpacedRepetitionEngine(config);
    this.scoreCalculator = new WordScoreCalculator(config);
    this.priorityScheduler = new PriorityQueueScheduler(config);
    this.difficultyEngine = new AdaptiveDifficultyEngine(config);
    this.stateManager = new WordStateManager(storage);
    this.storage = storage;
  }

  /**
   * 开始学习会话
   * 
   * @param userId 用户ID
   * @param availableWordIds 可用的单词ID列表
   * @param targetCount 目标单词数量
   * @param userAccuracy 用户整体正确率（0-1）
   * @returns 学习会话信息
   */
  async startSession(
    userId: string,
    availableWordIds: string[],
    targetCount: number,
    userAccuracy: number
  ): Promise<SessionInfo> {
    // 获取所有单词的学习状态
    const wordStates = await this.stateManager.batchGetStates(userId, availableWordIds);
    
    // 为没有状态的单词初始化状态
    const stateMap = new Map<string, WordLearningState>();
    for (const state of wordStates) {
      stateMap.set(state.wordId, state);
    }
    
    // 初始化缺失的状态
    for (const wordId of availableWordIds) {
      if (!stateMap.has(wordId)) {
        const newState = await this.stateManager.initializeWordState(userId, wordId);
        stateMap.set(wordId, newState);
      }
    }
    
    // 获取所有单词的得分（容错处理：失败时使用空 Map，不阻断会话创建）
    const wordScores = new Map<string, WordScore>();
    try {
      if (this.storage.batchLoadScores) {
        // 优先使用批量加载
        const scores = await this.storage.batchLoadScores(userId, availableWordIds);
        for (const score of scores) {
          wordScores.set(score.wordId, score);
        }
      } else if (this.storage.loadScore) {
        // 降级为单个加载，使用 Promise.allSettled 容错
        const scorePromises = availableWordIds.map(async wordId => {
          const score = await this.storage.loadScore!(userId, wordId);
          return score ? { wordId, score } : null;
        });
        const results = await Promise.allSettled(scorePromises);
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value?.score) {
            wordScores.set(result.value.wordId, result.value.score);
          }
        }
      }
    } catch {
      // 批量加载失败时继续使用空 Map
    }

    // 生成学习队列
    const selectedWordIds = this.priorityScheduler.generateLearningQueue(
      Array.from(stateMap.values()),
      wordScores,
      targetCount,
      userAccuracy
    );
    
    // 创建会话
    const sessionId = `session-${userId}-${Date.now()}`;
    this.currentSession = {
      sessionId,
      userId,
      wordIds: selectedWordIds,
      currentIndex: 0,
      startTime: Date.now(),
      correctCount: 0,
      wrongCount: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0
    };
    
    this.sessionCount++;
    
    return this.currentSession;
  }

  /**
   * 提交答题
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param isCorrect 是否正确
   * @param responseTime 响应时间（毫秒）
   * @param dwellTime 停留时长（毫秒）
   * @param selectedAnswer 选择的答案
   * @param correctAnswer 正确答案
   * @returns 答题结果
   */
  async submitAnswer(
    userId: string,
    wordId: string,
    isCorrect: boolean,
    responseTime: number,
    dwellTime: number,
    selectedAnswer: string,
    correctAnswer: string
  ): Promise<AnswerResult> {
    // 获取当前单词状态
    let wordState = await this.stateManager.getState(userId, wordId);
    if (!wordState) {
      wordState = await this.stateManager.initializeWordState(userId, wordId);
    }
    
    const masteryLevelBefore = wordState.masteryLevel;

    // 获取当前单词得分（从存储中加载，如果不存在则创建新的）
    let wordScore: WordScore = await this.storage.loadScore?.(userId, wordId) || {
      id: `score-${userId}-${wordId}`,
      userId,
      wordId,
      totalScore: 0,
      accuracyScore: 0,
      speedScore: 0,
      stabilityScore: 0,
      proficiencyScore: 0,
      totalAttempts: 0,
      correctAttempts: 0,
      averageResponseTime: 0,
      averageDwellTime: 0,
      recentAccuracy: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 保存旧的得分，用于计算本次变化量
    const scoreBefore = wordScore.totalScore;
    
    // 创建答题记录
    const answerRecord: AnswerRecord = {
      id: `record-${userId}-${wordId}-${Date.now()}`,
      wordId,
      selectedAnswer,
      correctAnswer,
      isCorrect,
      timestamp: Date.now(),
      responseTime,
      dwellTime,
      sessionId: this.currentSession?.sessionId,
      masteryLevelBefore,
      masteryLevelAfter: 0 // 稍后更新
    };
    
    // 获取最近的答题记录（用于计算稳定性）
    let recentRecords: AnswerRecord[] = [];
    if (this.storage.loadRecentAnswerRecords) {
      try {
        recentRecords = await this.storage.loadRecentAnswerRecords(userId, wordId, 5);
      } catch (error) {
        // 获取历史记录失败不阻断答题流程
      }
    }
    
    // 更新单词得分统计
    const scoreStats = this.scoreCalculator.updateScoreStatistics(wordScore, answerRecord);
    wordScore = { ...wordScore, ...scoreStats };

    // 计算新的得分
    // 将当前记录放在开头（最新），确保稳定性计算使用最近的记录
    const allRecords = [answerRecord, ...recentRecords].slice(0, 5);
    const newScores = this.scoreCalculator.calculateScore(wordScore, allRecords);
    wordScore = { ...wordScore, ...newScores };
    
    // 计算正确率
    const accuracy = wordScore.totalAttempts > 0 
      ? wordScore.correctAttempts / wordScore.totalAttempts 
      : 0;
    
    // 根据答题结果更新单词状态
    let stateUpdates: Partial<WordLearningState>;
    if (isCorrect) {
      stateUpdates = this.srEngine.processCorrectAnswer(
        wordState,
        responseTime,
        accuracy,
        wordScore.totalScore
      );
      
      // 更新会话统计
      if (this.currentSession) {
        this.currentSession.correctCount++;
        this.currentSession.consecutiveCorrect++;
        this.currentSession.consecutiveWrong = 0;
      }
    } else {
      stateUpdates = this.srEngine.processWrongAnswer(wordState);
      
      // 更新会话统计
      if (this.currentSession) {
        this.currentSession.wrongCount++;
        this.currentSession.consecutiveWrong++;
        this.currentSession.consecutiveCorrect = 0;
      }
    }
    
    // 更新单词状态
    const updatedState = await this.stateManager.updateState(userId, wordId, stateUpdates);
    
    // 更新答题记录的掌握程度
    answerRecord.masteryLevelAfter = updatedState.masteryLevel;
    
    // 检查是否需要调整难度
    if (this.currentSession) {
      const adjustment = this.difficultyEngine.adjustDifficulty(
        this.currentSession.wordIds.length,
        this.currentSession.consecutiveCorrect,
        this.currentSession.consecutiveWrong,
        this.sessionCount
      );
      
      if (adjustment.shouldAdjust && adjustment.newWordCount) {
        // 难度调整信息可用于分析和调优
      }
    }
    
    return {
      isCorrect,
      wordState: updatedState,
      wordScore,
      masteryLevelChange: updatedState.masteryLevel - masteryLevelBefore,
      scoreChange: wordScore.totalScore - scoreBefore,
      nextReviewDate: updatedState.nextReviewDate
    };
  }

  /**
   * 结束学习会话
   * 
   * @returns 会话统计信息
   */
  async endSession(): Promise<SessionInfo | null> {
    if (!this.currentSession) {
      return null;
    }
    
    this.currentSession.endTime = Date.now();
    
    // 记录会话统计到自适应难度引擎
    const totalWords = this.currentSession.correctCount + this.currentSession.wrongCount;
    const accuracy = totalWords > 0 
      ? this.currentSession.correctCount / totalWords 
      : 0;
    
    this.difficultyEngine.recordSessionStats({
      sessionId: this.currentSession.sessionId,
      totalWords,
      correctCount: this.currentSession.correctCount,
      wrongCount: this.currentSession.wrongCount,
      consecutiveCorrect: this.currentSession.consecutiveCorrect,
      consecutiveWrong: this.currentSession.consecutiveWrong,
      accuracy,
      timestamp: Date.now()
    });
    
    const session = this.currentSession;
    this.currentSession = null;
    
    return session;
  }

  /**
   * 获取单词状态
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 单词学习状态
   */
  async getWordState(userId: string, wordId: string): Promise<WordLearningState | null> {
    return await this.stateManager.getState(userId, wordId);
  }

  /**
   * 获取单词得分
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 单词得分
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    try {
      // 从存储中查询得分数据
      const score = await this.storage.loadScore?.(userId, wordId);
      return score || null;
    } catch (error) {
      learningLogger.error({ err: error }, '获取单词得分失败');
      return null;
    }
  }

  /**
   * 获取到期需要复习的单词
   * 
   * @param userId 用户ID
   * @returns 到期单词的ID列表
   */
  async getDueWords(userId: string): Promise<string[]> {
    return await this.stateManager.getDueWords(userId);
  }

  /**
   * 获取按状态分类的单词
   * 
   * @param userId 用户ID
   * @param state 单词状态
   * @returns 符合条件的单词ID列表
   */
  async getWordsByState(userId: string, state: WordState): Promise<string[]> {
    return await this.stateManager.getWordsByState(userId, state);
  }

  /**
   * 获取当前会话信息
   * 
   * @returns 当前会话信息
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * 获取学习趋势分析
   * 
   * @returns 趋势分析结果
   */
  getTrendAnalysis() {
    return this.difficultyEngine.analyzeTrend();
  }

  /**
   * 获取建议的单词数量
   * 
   * @param baseWordCount 基础单词数量
   * @returns 建议的单词数量
   */
  getRecommendedWordCount(baseWordCount: number): number {
    return this.difficultyEngine.getRecommendedWordCount(baseWordCount);
  }

  /**
   * 更新算法配置
   * 
   * @param config 新的算法配置
   */
  updateConfig(config: AlgorithmConfig): void {
    this.srEngine.updateConfig(config);
    this.scoreCalculator.updateConfig(config);
    this.priorityScheduler.updateConfig(config);
    this.difficultyEngine.updateConfig(config);
  }

  /**
   * 清除用户缓存
   * 
   * @param userId 用户ID
   */
  clearUserCache(userId: string): void {
    this.stateManager.clearCache(userId);
  }

  // ==================== 手动调整功能 ====================

  /**
   * 标记单词为已掌握
   * 将掌握程度设置为5级，复习间隔设置为30天
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   * @returns 更新后的单词状态
   */
  async markAsMastered(
    userId: string,
    wordId: string,
    reason?: string
  ): Promise<WordLearningState> {
    const now = Date.now();

    const updates: Partial<WordLearningState> = {
      state: WordState.MASTERED,
      masteryLevel: 5,
      currentInterval: 30,
      nextReviewDate: now + (30 * 24 * 60 * 60 * 1000),
      updatedAt: now
    };

    const updatedState = await this.stateManager.updateState(userId, wordId, updates);

    // 记录手动调整日志（用于审计）
    learningLogger.info( {
      userId,
      wordId,
      reason: reason || '未提供原因',
      timestamp: new Date(now).toISOString()
    });

    return updatedState;
  }

  /**
   * 标记单词为需要重点学习
   * 将掌握程度重置为0级，立即加入学习队列
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   * @returns 更新后的单词状态
   */
  async markAsNeedsPractice(
    userId: string,
    wordId: string,
    reason?: string
  ): Promise<WordLearningState> {
    const now = Date.now();

    const updates: Partial<WordLearningState> = {
      state: WordState.NEW,
      masteryLevel: 0,
      easeFactor: 2.5,
      currentInterval: 1,
      nextReviewDate: now, // 立即可学
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      updatedAt: now
    };

    const updatedState = await this.stateManager.updateState(userId, wordId, updates);

    // 记录手动调整日志（用于审计）
    learningLogger.info( {
      userId,
      wordId,
      reason: reason || '未提供原因',
      timestamp: new Date(now).toISOString()
    });

    return updatedState;
  }

  /**
   * 重置单词学习进度
   * 清除所有学习历史，恢复为新单词状态
   * 
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   * @returns 重置后的单词状态
   */
  async resetProgress(
    userId: string,
    wordId: string,
    reason?: string
  ): Promise<WordLearningState> {
    // 重新初始化单词状态
    const newState = await this.stateManager.initializeWordState(userId, wordId);

    // 记录手动调整日志（用于审计）
    learningLogger.info( {
      userId,
      wordId,
      reason: reason || '未提供原因',
      timestamp: new Date().toISOString()
    });

    return newState;
  }

  /**
   * 批量更新单词状态
   * 支持批量标记、批量重置功能
   * 
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @param operation 操作类型：'mastered' | 'needsPractice' | 'reset'
   * @param reason 调整原因（可选）
   * @returns 更新后的单词状态列表
   */
  async batchUpdateWords(
    userId: string,
    wordIds: string[],
    operation: 'mastered' | 'needsPractice' | 'reset',
    reason?: string
  ): Promise<WordLearningState[]> {
    const results: WordLearningState[] = [];
    
    for (const wordId of wordIds) {
      try {
        let updatedState: WordLearningState;
        
        switch (operation) {
          case 'mastered':
            updatedState = await this.markAsMastered(userId, wordId, reason);
            break;
          case 'needsPractice':
            updatedState = await this.markAsNeedsPractice(userId, wordId, reason);
            break;
          case 'reset':
            updatedState = await this.resetProgress(userId, wordId, reason);
            break;
          default:
            throw new Error(`未知的操作类型: ${operation}`);
        }
        
        results.push(updatedState);
      } catch (error) {
        learningLogger.error({ err: error, wordId }, '批量更新单词失败');
        // 继续处理其他单词
      }
    }
    
    // 批量操作已完成
    
    return results;
  }
}
