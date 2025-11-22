import { v4 as uuidv4 } from 'uuid';
import { Word, LearningSession, AnswerRecord } from '../types/models';
import StorageService from './StorageService';

/**
 * 学习服务 - 管理学习会话和逻辑
 */
class LearningService {
  private currentSession: LearningSession | null = null;
  private words: Word[] = [];

  /**
   * 开始学习会话
   * @param wordIds 要学习的单词ID列表
   */
  async startSession(wordIds: string[]): Promise<LearningSession> {
    if (wordIds.length === 0) {
      throw new Error('词库为空，无法开始学习');
    }

    // 加载单词数据
    const allWords = await StorageService.getWords();
    this.words = allWords.filter(w => wordIds.includes(w.id));

    if (this.words.length === 0) {
      throw new Error('未找到有效的单词');
    }

    // 创建新会话
    this.currentSession = {
      id: this.generateId(),
      wordIds,
      currentIndex: 0,
      startTime: Date.now(),
    };

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
   */
  nextWord(): Word | null {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.currentIndex++;

    if (this.currentSession.currentIndex >= this.words.length) {
      // 学习完成
      this.currentSession.endTime = Date.now();
      return null;
    }

    return this.getCurrentWord();
  }

  /**
   * 提交答案
   * @param wordId 单词ID
   * @param answer 用户选择的答案
   * @param isCorrect 是否正确
   */
  async submitAnswer(wordId: string, answer: string, isCorrect: boolean): Promise<void> {
    const word = this.words.find(w => w.id === wordId);
    if (!word) {
      throw new Error('单词不存在');
    }

    const record: AnswerRecord = {
      id: this.generateId(),
      wordId,
      selectedAnswer: answer,
      correctAnswer: word.meanings[0], // 使用第一个释义作为正确答案
      isCorrect,
      timestamp: Date.now(),
    };

    // 统一通过 StorageService 持久化，避免重复上传
    try {
      await StorageService.saveAnswerRecord(record);
    } catch (error) {
      console.error('保存学习记录失败:', error);
      // 记录失败不阻断学习流程
    }
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
   */
  endSession(): void {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.currentSession = null;
      this.words = [];
    }
  }

  /**
   * 生成测试选项
   * @param correctWord 正确的单词
   * @param allWords 所有可用单词
   * @param optionCount 选项数量2-4
   * @returns { options: string[], correctAnswer: string } 选项数组和正确答案
   */
  generateTestOptions(correctWord: Word, allWords: Word[], optionCount: number = 4): { options: string[], correctAnswer: string } {
    const count = Math.max(2, Math.min(4, optionCount));

    // 固定使用第一个释义作为正确答案，确保与判分逻辑一致
    const correctAnswer = correctWord.meanings[0];

    // 收集其他单词的释义作为干扰项，并去重
    const otherMeanings = Array.from(new Set(
      allWords
        .filter(w => w.id !== correctWord.id)
        .flatMap(w => w.meanings)
        .filter(m => m !== correctAnswer)
    ));

    // 如果干扰项不足，使用当前单词的其他释义补充
    let distractors = this.shuffleArray(otherMeanings).slice(0, count - 1);

    if (distractors.length < count - 1) {
      // 干扰项不足时，添加当前单词的其他释义作为补充
      const additionalMeanings = correctWord.meanings
        .filter(m => m !== correctAnswer)
        .slice(0, count - 1 - distractors.length);
      distractors = [...distractors, ...additionalMeanings];
    }

    // 如果仍然不足，循环使用已有的干扰项（但避免连续重复）
    const originalDistractorsLength = distractors.length;
    let cycleIndex = 0;
    while (distractors.length < count - 1 && originalDistractorsLength > 0) {
      const sourceIndex = cycleIndex % originalDistractorsLength;
      distractors.push(distractors[sourceIndex]);
      cycleIndex++;
    }

    // 兜底：如果干扰项为空（极端情况：只有一个单词且只有一个释义）
    // 生成通用的占位选项，确保至少有指定数量的选项
    if (distractors.length === 0) {
      const fallbackOptions = [
        '（其他释义）',
        '（待补充）',
        '（暂无）',
      ];
      distractors = fallbackOptions.slice(0, count - 1);
    }

    const options = [correctAnswer, ...distractors];
    return {
      options: this.shuffleArray(options),
      correctAnswer,
    };
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
}

export default new LearningService();
