import { v4 as uuidv4 } from 'uuid';
import { Word, LearningSession, WordLearningState, WordScore } from '../types/models';
import StorageService from './StorageService';
import ApiClient from './client';
import { learningLogger } from '../utils/logger';

/**
 * 学习服务 - 纯API封装层
 * 所有学习算法逻辑由后端Rust AMAS引擎处理
 */
class LearningService {
  private cachedProgress: { current: number; total: number } = { current: 0, total: 0 };
  private cachedCurrentWord: Word | null = null;
  private sessionWords: Word[] = [];
  private wordIndex: number = 0;
  private currentSession: LearningSession | null = null;

  /**
   * 开始学习会话
   * @param wordIds 要学习的单词ID列表
   * @param userId 用户ID（可选）
   */
  async startSession(wordIds: string[], userId?: string): Promise<LearningSession> {
    if (wordIds.length === 0) {
      throw new Error('词库为空，无法开始学习');
    }

    const allWords = await StorageService.getWords();
    const words = wordIds
      .map((id) => allWords.find((w) => w.id === id))
      .filter((w): w is Word => w !== undefined);

    if (words.length === 0) {
      throw new Error('未找到有效的单词');
    }

    this.cachedCurrentWord = words[0];
    this.cachedProgress = { current: 1, total: words.length };
    this.sessionWords = words;
    this.wordIndex = 0;

    const now = Date.now();
    const session: LearningSession = {
      id: uuidv4(),
      userId: userId || '',
      wordIds,
      currentIndex: 0,
      startTime: now,
      endTime: null,
      wordsStudied: 0,
      correctCount: 0,
      totalTime: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.currentSession = session;
    return session;
  }

  /**
   * 获取当前单词
   */
  getCurrentWord(): Word | null {
    return this.cachedCurrentWord;
  }

  /**
   * 移动到下一个单词
   */
  async nextWord(): Promise<Word | null> {
    this.wordIndex++;
    this.cachedProgress.current = this.wordIndex + 1;

    if (this.wordIndex >= this.sessionWords.length) {
      this.cachedCurrentWord = null;
      return null;
    }

    this.cachedCurrentWord = this.sessionWords[this.wordIndex];
    if (this.currentSession) {
      this.currentSession.currentIndex = this.wordIndex;
      this.currentSession.updatedAt = Date.now();
    }
    return this.cachedCurrentWord;
  }

  /**
   * 提交答案（调用后端AMAS处理）
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
    try {
      const currentState = userId ? await this.getWordState(userId, wordId) : null;
      const masteryLevelBefore = currentState?.masteryLevel ?? 0;

      const result = await ApiClient.processLearningEvent({
        wordId,
        isCorrect,
        responseTime,
        dwellTime,
      });

      if (this.currentSession) {
        this.currentSession.wordsStudied++;
        if (isCorrect) {
          this.currentSession.correctCount++;
        }
        this.currentSession.updatedAt = Date.now();
      }

      const masteryDecision = result.wordMasteryDecision;
      const isMastered = masteryDecision?.isMastered ?? false;
      const masteryLevelAfter = isMastered
        ? Math.min(masteryLevelBefore + 1, 5)
        : masteryLevelBefore;

      return {
        masteryLevelBefore,
        masteryLevelAfter,
        score: masteryDecision?.confidence ? masteryDecision.confidence * 100 : 0,
        nextReviewDate: null,
      };
    } catch (error) {
      learningLogger.error({ err: error }, '提交答案失败');
      return null;
    }
  }

  /**
   * 获取学习进度
   */
  getProgress(): { current: number; total: number } {
    return this.cachedProgress;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): LearningSession | null {
    return this.currentSession;
  }

  /**
   * 结束当前会话
   */
  async endSession(): Promise<boolean> {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.currentSession.totalTime = this.currentSession.endTime - this.currentSession.startTime;
      this.currentSession.updatedAt = Date.now();
    }
    this.cachedCurrentWord = null;
    this.cachedProgress = { current: 0, total: 0 };
    this.sessionWords = [];
    this.wordIndex = 0;
    this.currentSession = null;
    return true;
  }

  /**
   * 获取单词学习状态（调用后端API）
   */
  async getWordState(
    userId: string,
    wordId: string,
  ): Promise<{
    masteryLevel: number;
    score: number;
    nextReviewDate: number | null;
  } | null> {
    const state = await StorageService.getWordLearningState(userId, wordId);
    if (!state) return null;

    const score = await StorageService.getWordScore(userId, wordId);
    return {
      masteryLevel: state.masteryLevel,
      score: score?.totalScore || 0,
      nextReviewDate: state.nextReviewDate,
    };
  }

  /**
   * 获取单词得分（调用后端API）
   */
  async getWordScore(userId: string, wordId: string): Promise<WordScore | null> {
    return await StorageService.getWordScore(userId, wordId);
  }

  /**
   * 获取到期需要复习的单词（调用后端API）
   * 返回完整的WordLearningState对象以保留元数据
   */
  async getDueWords(userId: string): Promise<WordLearningState[]> {
    return await ApiClient.getDueWords();
  }

  /**
   * 获取到期单词ID列表（简化版）
   */
  async getDueWordIds(userId: string): Promise<string[]> {
    const dueList = await ApiClient.getDueWords();
    return dueList.map((item) => item.wordId);
  }

  /**
   * 获取学习趋势分析（调用后端API）
   */
  async getTrendAnalysis() {
    try {
      const trend = await ApiClient.getCurrentTrend();
      return {
        isImproving: trend.state === 'up',
        averageAccuracy: trend.consecutiveDays || 0,
        recommendation: trend.stateDescription || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取建议的单词数量（由后端AMAS控制）
   */
  getRecommendedWordCount(baseWordCount: number): number {
    return baseWordCount;
  }

  /**
   * 记录单词停留时长（合并到submitAnswer）
   */
  recordDwellTime(_duration: number): void {
    // 停留时长现在通过submitAnswer参数传递
  }

  simplifyMeaning(meaning: string): string {
    const trimmed = meaning.trim();
    if (!trimmed) return trimmed;
    const [firstPart] = trimmed.split(/[；;、]/);
    return (firstPart ?? '').trim() || trimmed;
  }

  /**
   * 生成测试选项（纯UI逻辑，保留在前端）
   */
  generateTestOptions(
    correctWord: Word,
    allWords: Word[],
    optionCount: number = 4,
  ): { options: string[]; correctAnswer: string } {
    const requestedCount = Math.max(2, Math.min(4, optionCount));
    const rawCorrectAnswer = correctWord.meanings[0];

    if (!rawCorrectAnswer) {
      throw new Error(`单词 ${correctWord.spelling} 缺少释义，无法生成测验选项`);
    }
    const correctAnswer = this.simplifyMeaning(rawCorrectAnswer);

    const otherMeanings = Array.from(
      new Set(
        allWords
          .filter((w) => w.id !== correctWord.id)
          .flatMap((w) => w.meanings)
          .map((m) => this.simplifyMeaning(m))
          .filter((m: string) => m && m !== correctAnswer),
      ),
    );

    const requiredDistractorCount = requestedCount - 1;
    let distractors = this.shuffleArray(otherMeanings).slice(0, requiredDistractorCount);

    if (distractors.length < requiredDistractorCount) {
      const additionalMeanings = correctWord.meanings
        .map((m) => this.simplifyMeaning(m))
        .filter((m: string) => m && m !== correctAnswer && !distractors.includes(m))
        .slice(0, requiredDistractorCount - distractors.length);
      distractors = [...distractors, ...additionalMeanings];
    }

    distractors = Array.from(new Set(distractors));
    if (distractors.length > requiredDistractorCount) {
      distractors = distractors.slice(0, requiredDistractorCount);
    }

    let actualDistractorCount = Math.min(distractors.length, requiredDistractorCount);

    if (actualDistractorCount < requiredDistractorCount) {
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
   * 检查答案是否正确（纯UI逻辑，保留在前端）
   */
  isAnswerCorrect(answer: string, word: Word): boolean {
    const normalizedAnswer = answer.trim();
    return word.meanings.some((meaning: string) => meaning.trim() === normalizedAnswer);
  }

  /**
   * 生成反向测试选项（纯UI逻辑，保留在前端）
   */
  generateReverseTestOptions(
    word: { id: string; spelling: string; meanings: string[] },
    allWords: { id: string; spelling: string; meanings: string[] }[],
    count: number = 4,
  ): { options: string[]; correctAnswer: string } {
    const correctAnswer = word.spelling;
    const requiredDistractorCount = count - 1;

    const otherWords = allWords.filter((w) => w.id !== word.id);
    const shuffled = [...otherWords].sort(() => Math.random() - 0.5);
    let distractors = shuffled.slice(0, requiredDistractorCount).map((w) => w.spelling);

    if (distractors.length < requiredDistractorCount) {
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

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ==================== 手动调整功能（调用后端API）====================

  /**
   * 标记单词为已掌握
   */
  async markAsMastered(userId: string, wordId: string, _reason?: string): Promise<void> {
    await ApiClient.markWordAsMastered(wordId);
  }

  /**
   * 标记单词为需要重点学习
   */
  async markAsNeedsPractice(userId: string, wordId: string, _reason?: string): Promise<void> {
    await ApiClient.markWordAsNeedsPractice(wordId);
  }

  /**
   * 重置单词学习进度
   */
  async resetProgress(userId: string, wordId: string, _reason?: string): Promise<void> {
    await ApiClient.resetWordProgress(wordId);
  }

  /**
   * 批量更新单词状态
   */
  async batchUpdateWords(
    userId: string,
    wordIds: string[],
    operation: 'mastered' | 'needsPractice' | 'reset',
    _reason?: string,
  ): Promise<void> {
    await ApiClient.batchUpdateWordStates(wordIds, operation);
  }

  /**
   * 删除单词学习状态
   */
  async deleteState(userId: string, wordId: string): Promise<void> {
    await ApiClient.deleteWordLearningState(wordId);
  }
}

export default new LearningService();
