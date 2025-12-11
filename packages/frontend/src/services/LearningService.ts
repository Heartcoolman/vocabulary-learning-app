import { v4 as uuidv4 } from 'uuid';
import {
  Word,
  LearningSession,
  AnswerRecord,
  WordLearningState,
  WordScore,
  AlgorithmConfig,
} from '../types/models';
import StorageService from './StorageService';
import ApiClient from './client';
import { SpacedRepetitionService } from './algorithms/SpacedRepetitionService';
import { WordStateStorage } from './algorithms/WordStateManager';
import { learningLogger } from '../utils/logger';

/**
 * 存储适配器 - 将 StorageService 适配为 WordStateStorage 接口
 */
class StorageAdapter implements WordStateStorage {
  async saveState(state: WordLearningState): Promise<void> {
    await StorageService.saveWordLearningState(state);
  }

  async loadState(userId: string, wordId: string): Promise<WordLearningState | null> {
    return await StorageService.getWordLearningState(userId, wordId);
  }

  async batchLoadStates(userId: string, wordIds: string[]): Promise<WordLearningState[]> {
    return await StorageService.getWordLearningStates(userId, wordIds);
  }

  async loadAllStates(userId: string): Promise<WordLearningState[]> {
    // 获取所有单词，然后批量加载状态
    const words = await StorageService.getWords();
    const wordIds = words.map((w) => w.id);
    return await this.batchLoadStates(userId, wordIds);
  }

  async deleteState(_userId: string, wordId: string): Promise<void> {
    try {
      // 调用 ApiClient 删除单词学习状态（userId 通过 token 识别）
      await ApiClient.deleteWordLearningState(wordId);

      // 缓存会在下次获取时重新加载
    } catch (error) {
      learningLogger.error({ err: error }, '删除单词学习状态失败');
      throw new Error(
        `删除单词学习状态失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }

  async loadScore(userId: string, wordId: string): Promise<WordScore | null> {
    return await StorageService.getWordScore(userId, wordId);
  }

  async batchLoadScores(userId: string, wordIds: string[]): Promise<WordScore[]> {
    return await StorageService.getWordScores(userId, wordIds);
  }

  async loadRecentAnswerRecords(
    _userId: string,
    wordId: string,
    limit: number = 5,
  ): Promise<AnswerRecord[]> {
    const records = await StorageService.getAnswerRecords(wordId);
    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
}

/**
 * 学习服务 - 管理学习会话和逻辑
 * 集成间隔重复算法，提供智能学习功能
 */
class LearningService {
  private currentSession: LearningSession | null = null;
  private words: Word[] = [];
  private srService: SpacedRepetitionService | null = null;
  private wordDwellTime: number = 0;

  /**
   * 初始化间隔重复服务
   * @param userId 用户ID
   */
  private async initSRService(_userId: string): Promise<void> {
    if (this.srService) {
      return;
    }

    // 获取算法配置（如果没有则使用默认配置）
    let config = await StorageService.getAlgorithmConfig();
    if (!config) {
      config = this.getDefaultConfig();
    }

    // 创建存储适配器
    const storage = new StorageAdapter();

    // 创建间隔重复服务
    this.srService = new SpacedRepetitionService(config, storage);
  }

  /**
   * 获取默认算法配置
   */
  private getDefaultConfig(): AlgorithmConfig {
    return {
      id: 'default',
      name: '默认配置',
      description: '系统默认的算法配置',
      reviewIntervals: [1, 3, 7, 15, 30],
      consecutiveCorrectThreshold: 5,
      consecutiveWrongThreshold: 3,
      difficultyAdjustmentInterval: 1,
      priorityWeights: {
        newWord: 40,
        errorRate: 30,
        overdueTime: 20,
        wordScore: 10,
      },
      masteryThresholds: [
        { level: 1, requiredCorrectStreak: 2, minAccuracy: 0.6, minScore: 40 },
        { level: 2, requiredCorrectStreak: 3, minAccuracy: 0.7, minScore: 50 },
        { level: 3, requiredCorrectStreak: 4, minAccuracy: 0.75, minScore: 60 },
        { level: 4, requiredCorrectStreak: 5, minAccuracy: 0.8, minScore: 70 },
        { level: 5, requiredCorrectStreak: 6, minAccuracy: 0.85, minScore: 80 },
      ],
      scoreWeights: {
        accuracy: 40,
        speed: 30,
        stability: 20,
        proficiency: 10,
      },
      speedThresholds: {
        excellent: 3000,
        good: 5000,
        average: 10000,
        slow: 15000,
      },
      newWordRatio: {
        default: 0.3,
        highAccuracy: 0.5,
        lowAccuracy: 0.1,
        highAccuracyThreshold: 0.85,
        lowAccuracyThreshold: 0.65,
      },
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * 开始学习会话
   * @param wordIds 要学习的单词ID列表
   * @param userId 用户ID（可选，用于启用智能算法）
   */
  async startSession(wordIds: string[], userId?: string): Promise<LearningSession> {
    if (wordIds.length === 0) {
      throw new Error('词库为空，无法开始学习');
    }

    // 加载单词数据
    const allWords = await StorageService.getWords();

    // 如果提供了用户ID，初始化间隔重复服务（用于答题后的状态更新）
    // 注意：单词排序已由后端完成，前端不再重复排序
    const selectedWordIds = wordIds;
    if (userId) {
      try {
        // 初始化间隔重复服务（用于 submitAnswer 时更新状态）
        await this.initSRService(userId);

        // 启动间隔重复会话，初始化会话统计（连续正确/错误计数等）
        if (this.srService) {
          // 从用户统计获取真实正确率，失败时回退到默认值
          let userAccuracy = 0.7; // 默认正确率
          try {
            const stats = await ApiClient.getUserStatistics();
            if (stats.correctRate > 0 && stats.correctRate <= 1) {
              userAccuracy = stats.correctRate;
            }
          } catch {
            // 获取统计失败时使用默认值，不阻塞学习流程
          }

          await this.srService.startSession(userId, wordIds, wordIds.length, userAccuracy);
        }
      } catch (error) {
        learningLogger.error({ err: error }, '初始化间隔重复服务失败');
      }
    }

    // 按照 selectedWordIds 的顺序构建 words 数组，保持算法调度的优先级
    this.words = selectedWordIds
      .map((id) => allWords.find((w) => w.id === id))
      .filter((w): w is Word => w !== undefined);

    if (this.words.length === 0) {
      throw new Error('未找到有效的单词');
    }

    // 创建新会话
    const now = Date.now();
    this.currentSession = {
      id: this.generateId(),
      userId: userId || '',
      wordIds: selectedWordIds,
      currentIndex: 0,
      startTime: now,
      endTime: null,
      wordsStudied: 0,
      correctCount: 0,
      totalTime: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.wordDwellTime = 0;

    return this.currentSession;
  }

  /**
   * 获取当前单词
   */
  getCurrentWord(): Word | null {
    if (!this.currentSession || this.words.length === 0) {
      return null;
    }

    if (this.currentSession.currentIndex >= this.words.length) {
      return null;
    }

    return this.words[this.currentSession.currentIndex];
  }

  /**
   * 移动到下一个单词
   * 应用自适应难度调整
   */
  async nextWord(): Promise<Word | null> {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.currentIndex++;

    if (this.currentSession.currentIndex >= this.words.length) {
      // 学习完成
      this.currentSession.endTime = Date.now();

      // 结束间隔重复会话
      if (this.srService) {
        try {
          await this.srService.endSession();
        } catch (error) {
          learningLogger.error({ err: error }, '结束间隔重复会话失败');
          // 继续执行，不阻塞学习流程
        }
      }

      return null;
    }

    // 重置停留时长
    this.wordDwellTime = 0;

    return this.getCurrentWord();
  }

  /**
   * 提交答案
   * @param wordId 单词ID
   * @param answer 用户选择的答案
   * @param isCorrect 是否正确
   * @param responseTime 响应时间（毫秒）
   * @param dwellTime 停留时长（毫秒）
   * @param userId 用户ID（可选，用于启用智能算法）
   * @returns 答题反馈信息
   */
  async submitAnswer(
    wordId: string,
    answer: string,
    isCorrect: boolean,
    responseTime: number,
    dwellTime: number,
    userId?: string,
  ): Promise<{
    masteryLevelBefore: number;
    masteryLevelAfter: number;
    score: number;
    nextReviewDate: number | null;
  } | null> {
    const word = this.words.find((w) => w.id === wordId);
    if (!word) {
      throw new Error('单词不存在');
    }

    const now = Date.now();

    const record: AnswerRecord = {
      id: this.generateId(),
      userId: userId || '',
      wordId,
      selectedAnswer: answer,
      correctAnswer: word.meanings[0], // 使用第一个释义作为正确答案
      isCorrect,
      timestamp: now,
      responseTime,
      dwellTime,
      sessionId: this.currentSession?.id,
      createdAt: now,
      updatedAt: now,
    };

    let feedbackInfo = null;

    // 如果提供了用户ID且启用了智能算法，更新单词状态和得分
    if (userId && this.srService) {
      try {
        const result = await this.srService.submitAnswer(
          userId,
          wordId,
          isCorrect,
          responseTime,
          dwellTime,
          answer,
          word.meanings[0],
        );

        // 持久化学习状态和得分到后端
        await StorageService.saveWordLearningState(result.wordState);
        await StorageService.saveWordScore(result.wordScore);

        // 更新答题记录的掌握程度信息（添加边界检查防止负数）
        record.masteryLevelBefore = Math.max(
          0,
          result.wordState.masteryLevel - result.masteryLevelChange,
        );
        record.masteryLevelAfter = result.wordState.masteryLevel;

        // 准备反馈信息
        feedbackInfo = {
          masteryLevelBefore: record.masteryLevelBefore,
          masteryLevelAfter: record.masteryLevelAfter,
          score: result.wordScore.totalScore,
          nextReviewDate: result.nextReviewDate,
        };

        // 答题结果已处理
      } catch (error) {
        learningLogger.error({ err: error }, '更新单词状态失败');
        // 失败不阻断学习流程
      }
    }

    // 统一通过 StorageService 持久化
    try {
      // 使用扩展版本保存答题记录（包含新字段）
      await StorageService.saveAnswerRecordExtended(record);
    } catch (error) {
      learningLogger.error({ err: error }, '保存学习记录失败');
      // 记录失败不阻断学习流程
    }

    // 重置停留时长
    this.wordDwellTime = 0;

    return feedbackInfo;
  }

  /**
   * 获取学习进度
   */
  getProgress(): { current: number; total: number } {
    if (!this.currentSession) {
      return { current: 0, total: 0 };
    }

    // 确保 current 不会超过 total，避免显示 "6/5" 等异常进度
    const current = Math.min(this.currentSession.currentIndex + 1, this.words.length);

    return {
      current,
      total: this.words.length,
    };
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): LearningSession | null {
    return this.currentSession;
  }

  /**
   * 结束当前会话
   * @returns 是否成功结束会话
   */
  async endSession(): Promise<boolean> {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();

      // 结束间隔重复会话
      let endSessionSuccess = true;
      if (this.srService) {
        try {
          await this.srService.endSession();
        } catch (error) {
          learningLogger.error({ err: error }, '结束间隔重复会话失败');
          endSessionSuccess = false;
        }
      }

      this.currentSession = null;
      this.words = [];
      return endSessionSuccess;
    }
    return true;
  }

  /**
   * 获取单词学习状态
   * @param userId 用户ID
   * @param wordId 单词ID
   * @returns 包含掌握程度、得分和下次复习时间的状态信息
   */
  async getWordState(
    userId: string,
    wordId: string,
  ): Promise<{
    masteryLevel: number;
    score: number;
    nextReviewDate: number | null;
  } | null> {
    await this.initSRService(userId);

    if (!this.srService) {
      learningLogger.warn({ userId, wordId }, '间隔重复服务未初始化，无法获取单词状态');
      return null;
    }

    const state = await this.srService.getWordState(userId, wordId);
    if (!state) {
      return null;
    }

    // 尝试获取得分信息
    const score = await this.srService.getWordScore(userId, wordId);

    return {
      masteryLevel: state.masteryLevel,
      score: score?.totalScore || 0,
      nextReviewDate: state.nextReviewDate,
    };
  }

  /**
   * 获取单词得分
   * @param userId 用户ID
   * @param wordId 单词ID
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    await this.initSRService(userId);
    if (!this.srService) {
      learningLogger.warn({ userId, wordId }, '间隔重复服务未初始化，无法获取单词得分');
      return null;
    }
    return await this.srService.getWordScore(userId, wordId);
  }

  /**
   * 获取到期需要复习的单词
   * @param userId 用户ID
   */
  async getDueWords(userId: string): Promise<string[]> {
    await this.initSRService(userId);
    if (!this.srService) {
      learningLogger.warn({ userId }, '间隔重复服务未初始化，无法获取到期单词');
      return [];
    }
    return await this.srService.getDueWords(userId);
  }

  /**
   * 获取学习趋势分析
   */
  getTrendAnalysis() {
    if (!this.srService) {
      return null;
    }
    return this.srService.getTrendAnalysis();
  }

  /**
   * 获取建议的单词数量
   * @param baseWordCount 基础单词数量
   */
  getRecommendedWordCount(baseWordCount: number): number {
    if (!this.srService) {
      return baseWordCount;
    }
    return this.srService.getRecommendedWordCount(baseWordCount);
  }

  /**
   * 记录单词停留时长
   * 用于追踪用户在单词上的总停留时间
   * @param duration 停留时长（毫秒）
   */
  recordDwellTime(duration: number): void {
    this.wordDwellTime += duration;
  }

  /**
   * 生成测试选项
   * @param correctWord 正确的单词
   * @param allWords 所有可用单词
   * @param optionCount 选项数量2-4
   * @returns { options: string[], correctAnswer: string } 选项数组和正确答案
   */
  generateTestOptions(
    correctWord: Word,
    allWords: Word[],
    optionCount: number = 4,
  ): { options: string[]; correctAnswer: string } {
    const requestedCount = Math.max(2, Math.min(4, optionCount));

    // 固定使用第一个释义作为正确答案，确保与判分逻辑一致
    const correctAnswer = correctWord.meanings[0];

    // 边界情况：单词缺少释义
    if (!correctAnswer) {
      throw new Error(`单词 ${correctWord.spelling} 缺少释义，无法生成测验选项`);
    }

    // 收集其他单词的释义作为干扰项，并去重
    // 排除正确答案及其近似（避免混淆）
    const otherMeanings = Array.from(
      new Set(
        allWords
          .filter((w) => w.id !== correctWord.id)
          .flatMap((w) => w.meanings)
          .filter((m: string) => m && m !== correctAnswer && m.trim() !== correctAnswer.trim()),
      ),
    );

    // 所需干扰项数量
    const requiredDistractorCount = requestedCount - 1;

    // 如果干扰项不足，使用当前单词的其他释义补充
    let distractors = this.shuffleArray(otherMeanings).slice(0, requiredDistractorCount);

    if (distractors.length < requiredDistractorCount) {
      // 干扰项不足时，添加当前单词的其他释义作为补充
      const additionalMeanings = correctWord.meanings
        .filter((m: string) => m !== correctAnswer && !distractors.includes(m))
        .slice(0, requiredDistractorCount - distractors.length);
      distractors = [...distractors, ...additionalMeanings];
    }

    // 确保去重
    distractors = Array.from(new Set(distractors));
    if (distractors.length > requiredDistractorCount) {
      distractors = distractors.slice(0, requiredDistractorCount);
    }

    // 动态调整选项数量：如果干扰项不足，使用备用干扰项
    // 最少保留2个选项（1个正确答案 + 1个干扰项）
    let actualDistractorCount = Math.min(distractors.length, requiredDistractorCount);

    // 极端情况：干扰项不足时，使用预设的备用干扰项
    if (actualDistractorCount < requiredDistractorCount) {
      learningLogger.warn({ word: correctWord.spelling }, '单词干扰项不足，使用备用干扰项补充');
      const fallbackDistractors = ['未知释义', '其他含义', '暂无解释', '无此选项'];
      const availableFallbacks = fallbackDistractors.filter(
        (f) => f !== correctAnswer && !distractors.includes(f),
      );
      const needed = requiredDistractorCount - actualDistractorCount;
      distractors = [...distractors, ...this.shuffleArray(availableFallbacks).slice(0, needed)];
      actualDistractorCount = Math.min(distractors.length, requiredDistractorCount);
    }

    const options = [correctAnswer, ...distractors.slice(0, actualDistractorCount)];
    return {
      options: this.shuffleArray(options),
      correctAnswer,
    };
  }

  /**
   * 检查答案是否正确（支持多释义）
   * @param answer 用户选择的答案
   * @param word 正确的单词
   * @returns 是否正确
   */
  isAnswerCorrect(answer: string, word: Word): boolean {
    // 检查答案是否匹配任何释义（不区分前后空格）
    const normalizedAnswer = answer.trim();
    return word.meanings.some((meaning: string) => meaning.trim() === normalizedAnswer);
  }

  /**
   * 生成反向测试选项（根据释义选择单词拼写）
   * @param word 正确的单词
   * @param allWords 所有可用单词
   * @param count 选项数量
   * @returns { options: string[], correctAnswer: string } 选项数组和正确答案
   */
  generateReverseTestOptions(
    word: { id: string; spelling: string; meanings: string[] },
    allWords: { id: string; spelling: string; meanings: string[] }[],
    count: number = 4,
  ): { options: string[]; correctAnswer: string } {
    const correctAnswer = word.spelling;
    const requiredDistractorCount = count - 1;

    // 从其他单词中获取干扰项
    const otherWords = allWords.filter((w) => w.id !== word.id);
    const shuffled = [...otherWords].sort(() => Math.random() - 0.5);
    let distractors = shuffled.slice(0, requiredDistractorCount).map((w) => w.spelling);

    // 干扰项不足时，使用备用干扰项
    if (distractors.length < requiredDistractorCount) {
      learningLogger.warn({ word: word.spelling }, '反向测试干扰项不足，使用备用干扰项补充');
      const fallbackDistractors = ['unknown', 'other', 'none', 'N/A'];
      const availableFallbacks = fallbackDistractors.filter(
        (f) => f !== correctAnswer && !distractors.includes(f),
      );
      const needed = requiredDistractorCount - distractors.length;
      distractors = [...distractors, ...this.shuffleArray(availableFallbacks).slice(0, needed)];
    }

    const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);
    return { options, correctAnswer };
  }

  /**
   * 随机打乱数组
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 生成唯一ID（UUID格式）
   */
  private generateId(): string {
    return uuidv4();
  }

  // ==================== 手动调整功能 ====================

  /**
   * 标记单词为已掌握
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   */
  async markAsMastered(userId: string, wordId: string, reason?: string): Promise<void> {
    await this.initSRService(userId);
    if (!this.srService) {
      throw new Error('间隔重复服务未初始化，无法标记单词为已掌握');
    }
    await this.srService.markAsMastered(userId, wordId, reason);
  }

  /**
   * 标记单词为需要重点学习
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   */
  async markAsNeedsPractice(userId: string, wordId: string, reason?: string): Promise<void> {
    await this.initSRService(userId);
    if (!this.srService) {
      throw new Error('间隔重复服务未初始化，无法标记单词为需要重点学习');
    }
    await this.srService.markAsNeedsPractice(userId, wordId, reason);
  }

  /**
   * 重置单词学习进度
   * @param userId 用户ID
   * @param wordId 单词ID
   * @param reason 调整原因（可选）
   */
  async resetProgress(userId: string, wordId: string, reason?: string): Promise<void> {
    await this.initSRService(userId);
    if (!this.srService) {
      throw new Error('间隔重复服务未初始化，无法重置单词学习进度');
    }
    await this.srService.resetProgress(userId, wordId, reason);
  }

  /**
   * 批量更新单词状态
   * @param userId 用户ID
   * @param wordIds 单词ID列表
   * @param operation 操作类型
   * @param reason 调整原因（可选）
   */
  async batchUpdateWords(
    userId: string,
    wordIds: string[],
    operation: 'mastered' | 'needsPractice' | 'reset',
    reason?: string,
  ): Promise<void> {
    await this.initSRService(userId);
    if (!this.srService) {
      throw new Error('间隔重复服务未初始化，无法批量更新单词状态');
    }
    await this.srService.batchUpdateWords(userId, wordIds, operation, reason);
  }

  /**
   * 删除单词学习状态
   * @param userId 用户ID
   * @param wordId 单词ID
   */
  async deleteState(userId: string, wordId: string): Promise<void> {
    try {
      // 调用 ApiClient 删除单词学习状态
      await ApiClient.deleteWordLearningState(wordId);

      // 清除本地缓存，确保下次获取时重新加载
      if (this.srService) {
        this.srService.clearUserCache(userId);
      }
    } catch (error) {
      learningLogger.error({ err: error }, '删除单词学习状态失败');
      throw new Error(
        `删除单词学习状态失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }
}

export default new LearningService();
