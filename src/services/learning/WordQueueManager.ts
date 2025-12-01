/**
 * 单词队列管理器
 * Word Queue Manager for Mastery-Based Learning
 */

export interface WordItem {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  audioUrl?: string;
  isNew: boolean;  // 是否新词
}

export interface WordProgress {
  wordId: string;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  attempts: number;
  lastAttemptTime: number;
}

export interface QueueConfig {
  targetMasteryCount: number;     // 目标掌握数量
  masteryThreshold: number;       // 连续正确次数阈值(由AMAS决定时忽略)
  maxActiveWords: number;         // 最大活跃队列大小
  minRepeatInterval: number;      // 最小重复间隔
  maxTotalQuestions: number;      // 最大总题数
  maxAttemptsPerWord: number;     // 单词最大尝试次数
}

export interface QueueProgress {
  masteredCount: number;
  targetCount: number;
  totalQuestions: number;
  activeCount: number;
  pendingCount: number;
}

/** 会话完成原因 */
export type CompletionReason = 'mastery_achieved' | 'question_limit' | 'words_exhausted';

/** 获取下一单词的结果 */
export interface NextWordResult {
  word: WordItem | null;
  isCompleted: boolean;
  completionReason?: CompletionReason;
}

export interface MasteryDecision {
  isMastered: boolean;
  confidence: number;
  suggestedRepeats: number;
}

/** 队列状态快照（用于持久化和恢复） */
export interface QueueState {
  activeWords: Array<[string, WordProgress]>;
  masteredWordIds: string[];
  pendingWordIds: string[];
  recentlyShown: string[];
  totalQuestions: number;
  words: WordItem[];
}

/**
 * 单词队列管理器
 * 负责管理pending/active/mastered三个队列
 */
export class WordQueueManager {
  private pendingWords: WordItem[] = [];
  private activeWords: Map<string, WordProgress> = new Map();
  private masteredWords: Set<string> = new Set();
  private recentlyShown: string[] = [];  // 最近出过的词
  private totalQuestions: number = 0;
  private config: QueueConfig;
  private wordMap: Map<string, WordItem> = new Map();

  constructor(words: WordItem[], config: Partial<QueueConfig> = {}) {
    this.pendingWords = [...words];
    this.config = {
      targetMasteryCount: config.targetMasteryCount ?? 20,
      masteryThreshold: config.masteryThreshold ?? 2,
      maxActiveWords: config.maxActiveWords ?? 6,
      minRepeatInterval: config.minRepeatInterval ?? 2,
      maxTotalQuestions: config.maxTotalQuestions ?? 100,
      maxAttemptsPerWord: config.maxAttemptsPerWord ?? 8
    };

    // 建立wordId到WordItem的映射
    words.forEach(word => {
      this.wordMap.set(word.id, word);
    });
  }

  /**
   * 获取下一个要出题的单词（带完成原因）
   * @param options.consume 是否消费（增加计数），默认true
   * @returns NextWordResult 包含单词和完成状态
   */
  getNextWordWithReason(options: { consume?: boolean } = {}): NextWordResult {
    const { consume = true } = options;

    // 1. 检查完成条件：达成目标
    if (this.masteredWords.size >= this.config.targetMasteryCount) {
      console.log('[WordQueue] 已达成目标掌握数');
      return { word: null, isCompleted: true, completionReason: 'mastery_achieved' };
    }

    // 2. 检查最大题目数
    if (this.totalQuestions >= this.config.maxTotalQuestions) {
      console.log('[WordQueue] 已达到最大题目数限制');
      return { word: null, isCompleted: true, completionReason: 'question_limit' };
    }

    // 3. 优先从活跃队列中选择(需要继续练习的词)
    const activeCandidate = this.selectFromActiveWords(!consume);
    if (activeCandidate) {
      if (consume) {
        this.totalQuestions++;
      }
      return { word: this.getWordItem(activeCandidate), isCompleted: false };
    }

    // 4. 活跃队列不够,从待学习池补充
    if (this.activeWords.size < this.config.maxActiveWords && this.pendingWords.length > 0) {
      // peek时也要移动队列（让词可被答题），只是不增加totalQuestions
      const newWord = this.pendingWords.shift()!;
      this.activeWords.set(newWord.id, {
        wordId: newWord.id,
        correctCount: 0,
        wrongCount: 0,
        consecutiveCorrect: 0,
        attempts: 0,
        lastAttemptTime: 0
      });
      if (consume) {
        this.totalQuestions++;
        this.updateRecentlyShown(newWord.id);
      }

      console.log(
        `[WordQueue] 补充新词到活跃队列: ${newWord.spelling}, ` +
        `active=${this.activeWords.size}, pending=${this.pendingWords.length}`
      );

      return { word: newWord, isCompleted: false };
    }

    // 5. 如果活跃队列还有词,强制选一个(忽略间隔)
    if (this.activeWords.size > 0) {
      const forcePick = Array.from(this.activeWords.keys())[0];
      if (consume) {
        this.totalQuestions++;
        this.updateRecentlyShown(forcePick);
      }

      console.log('[WordQueue] 强制选择活跃队列中的词');

      return { word: this.getWordItem(forcePick), isCompleted: false };
    }

    // 6. 队列空了
    return { word: null, isCompleted: true, completionReason: 'words_exhausted' };
  }

  /**
   * 预览下一题，不增加计数
   * @returns NextWordResult 包含单词和完成状态
   */
  peekNextWordWithReason(): NextWordResult {
    return this.getNextWordWithReason({ consume: false });
  }

  /**
   * 获取下一个要出题的单词
   * @deprecated 使用 getNextWordWithReason() 以获取完成原因
   * @returns 下一个单词或null(学习完成)
   */
  getNextWord(): WordItem | null {
    return this.getNextWordWithReason().word;
  }

  /**
   * 从活跃队列选择下一个词
   * 策略: 优先选错误多的,且避免最近刚出过的
   * @param peek 是否为预览模式（不修改状态）
   */
  private selectFromActiveWords(peek: boolean = false): string | null {
    const candidates = Array.from(this.activeWords.entries())
      .filter(([wordId, progress]) => {
        // 过滤掉最近出现过的
        if (this.isRecentlyShown(wordId)) {
          return false;
        }

        // 过滤掉超过最大尝试次数的
        if (progress.attempts >= this.config.maxAttemptsPerWord) {
          if (!peek) {
            // 只有非peek模式才执行状态修改
            console.warn(
              `[WordQueue] 单词${wordId}已达最大尝试次数${this.config.maxAttemptsPerWord}, ` +
              `自动标记为掌握`
            );
            // 自动标记为掌握(降级处理)
            this.activeWords.delete(wordId);
            this.masteredWords.add(wordId);
          }
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // 错误多的优先
        const wrongDiff = b[1].wrongCount - a[1].wrongCount;
        if (wrongDiff !== 0) return wrongDiff;
        // 其次选尝试次数少的
        return a[1].attempts - b[1].attempts;
      });

    if (candidates.length > 0) {
      const selected = candidates[0][0];
      if (!peek) {
        this.updateRecentlyShown(selected);
      }
      return selected;
    }

    return null;
  }

  /**
   * 记录答题结果
   * @param wordId 单词ID
   * @param isCorrect 是否正确
   * @param responseTime 响应时间(ms)
   * @param amasDecision AMAS掌握判定(可选)
   * @returns 是否已掌握和进度
   */
  recordAnswer(
    wordId: string,
    isCorrect: boolean,
    responseTime: number,
    amasDecision?: MasteryDecision
  ): {
    mastered: boolean;
    progress: WordProgress;
  } {
    const progress = this.activeWords.get(wordId);
    if (!progress) {
      throw new Error(`Word ${wordId} not in active queue`);
    }

    progress.attempts++;
    progress.lastAttemptTime = Date.now();

    if (isCorrect) {
      progress.correctCount++;
      progress.consecutiveCorrect++;

      // 检查是否达到掌握标准
      if (this.checkMastery(progress, responseTime, amasDecision)) {
        this.activeWords.delete(wordId);
        this.masteredWords.add(wordId);

        console.log(
          `[WordQueue] 单词已掌握: ${this.getWordItem(wordId)?.spelling}, ` +
          `correct=${progress.correctCount}, attempts=${progress.attempts}, ` +
          `mastered=${this.masteredWords.size}/${this.config.targetMasteryCount}`
        );

        return { mastered: true, progress };
      }
    } else {
      progress.wrongCount++;
      progress.consecutiveCorrect = 0; // 重置连续正确

      console.log(
        `[WordQueue] 答错: ${this.getWordItem(wordId)?.spelling}, ` +
        `wrong=${progress.wrongCount}, attempts=${progress.attempts}`
      );
    }

    return { mastered: false, progress };
  }

  /**
   * 检查是否达到掌握标准
   * 优先使用AMAS判定,降级使用默认规则
   */
  private checkMastery(
    progress: WordProgress,
    responseTime: number,
    amasDecision?: MasteryDecision
  ): boolean {
    // 优先使用AMAS判定
    if (amasDecision && amasDecision.confidence > 0.7) {
      console.log(
        `[WordQueue] 使用AMAS判定: isMastered=${amasDecision.isMastered}, ` +
        `confidence=${amasDecision.confidence.toFixed(2)}`
      );
      return amasDecision.isMastered;
    }

    // 降级: 使用默认规则
    // 条件1: 连续正确N次
    if (progress.consecutiveCorrect >= this.config.masteryThreshold) {
      return true;
    }

    // 条件2: 首次秒答(<3秒)
    if (progress.attempts === 1 && progress.correctCount === 1 && responseTime < 3000) {
      return true;
    }

    // 条件3: 容错模式(3/4正确)
    if (progress.correctCount >= 3 && progress.wrongCount <= 1) {
      return true;
    }

    return false;
  }

  /**
   * 获取当前进度
   */
  getProgress(): QueueProgress {
    return {
      masteredCount: this.masteredWords.size,
      targetCount: this.config.targetMasteryCount,
      totalQuestions: this.totalQuestions,
      activeCount: this.activeWords.size,
      pendingCount: this.pendingWords.length
    };
  }

  /**
   * 获取单词状态
   * @param wordId 单词ID
   * @returns 'new' | 'learning' | 'almost' | 'mastered'
   */
  getWordStatus(wordId: string): 'new' | 'learning' | 'almost' | 'mastered' {
    if (this.masteredWords.has(wordId)) {
      return 'mastered';
    }

    const progress = this.activeWords.get(wordId);
    if (!progress) {
      return 'new';
    }

    if (progress.consecutiveCorrect === this.config.masteryThreshold - 1) {
      return 'almost';  // 差1次就掌握
    }

    return 'learning';
  }

  /**
   * 获取单词进度详情
   */
  getWordProgress(wordId: string): WordProgress | null {
    return this.activeWords.get(wordId) || null;
  }

  /**
   * 获取已掌握的单词ID列表
   */
  getMasteredWordIds(): string[] {
    return Array.from(this.masteredWords);
  }

  /**
   * 获取活跃队列的单词ID和进度
   */
  getActiveWordProgresses(): Array<[string, WordProgress]> {
    return Array.from(this.activeWords.entries());
  }

  /**
   * 获取待学习的单词ID列表
   */
  getPendingWordIds(): string[] {
    return this.pendingWords.map(w => w.id);
  }

  /**
   * 跳过当前单词
   * - 不计入题目数
   * - 从活跃队列移除，本次不再出现
   * @param wordId 要跳过的单词ID
   * @returns 是否成功跳过
   */
  skipWord(wordId: string): boolean {
    if (!this.activeWords.has(wordId)) {
      console.warn(`[WordQueue] 跳过失败: 单词${wordId}不在活跃队列`);
      return false;
    }

    this.activeWords.delete(wordId);
    console.log(`[WordQueue] 跳过单词: ${this.getWordItem(wordId)?.spelling}`);
    return true;
  }

  /**
   * 获取队列完整状态（用于持久化）
   */
  getState(): QueueState {
    return {
      activeWords: Array.from(this.activeWords.entries()),
      masteredWordIds: Array.from(this.masteredWords),
      pendingWordIds: this.pendingWords.map(w => w.id),
      recentlyShown: [...this.recentlyShown],
      totalQuestions: this.totalQuestions,
      words: Array.from(this.wordMap.values())
    };
  }

  /**
   * 恢复队列状态（用于会话恢复）
   * @param state 之前保存的状态
   */
  restoreState(state: QueueState): void {
    this.activeWords = new Map(state.activeWords);
    this.masteredWords = new Set(state.masteredWordIds);

    // 重建 pendingWords（需要从 wordMap 查找）
    this.pendingWords = state.pendingWordIds
      .map(id => this.wordMap.get(id))
      .filter((w): w is WordItem => w !== undefined);

    this.recentlyShown = [...state.recentlyShown];
    this.totalQuestions = state.totalQuestions;

    console.log(
      `[WordQueue] 状态已恢复: active=${this.activeWords.size}, ` +
      `mastered=${this.masteredWords.size}, pending=${this.pendingWords.length}`
    );
  }

  // ========== 私有辅助方法 ==========

  private isRecentlyShown(wordId: string): boolean {
    return this.recentlyShown
      .slice(-this.config.minRepeatInterval)
      .includes(wordId);
  }

  private updateRecentlyShown(wordId: string): void {
    this.recentlyShown.push(wordId);
    // 保留最近10个记录
    if (this.recentlyShown.length > 10) {
      this.recentlyShown.shift();
    }
  }

  private getWordItem(wordId: string): WordItem | null {
    return this.wordMap.get(wordId) || null;
  }
}
