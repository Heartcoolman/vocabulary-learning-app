import { useRef, useState, useCallback } from 'react';
import {
  WordQueueManager,
  WordItem,
  QueueProgress,
  CompletionReason,
  QueueState,
  MasteryDecision
} from '../../services/learning/WordQueueManager';
import { AdaptiveQueueManager, RecentPerformance } from '../../services/learning/AdaptiveQueueManager';
import { learningLogger } from '../../utils/logger';

/**
 * useWordQueue 配置选项
 */
export interface UseWordQueueOptions {
  /** 目标掌握数量 */
  targetMasteryCount: number;
  /** 连续正确次数阈值 */
  masteryThreshold?: number;
  /** 最大总题数 */
  maxTotalQuestions?: number;
}

/**
 * 队列配置（用于外部访问）
 */
export interface QueueConfig {
  masteryThreshold: number;
  maxTotalQuestions: number;
}

/**
 * useWordQueue 返回值
 */
export interface UseWordQueueReturn {
  /** 队列管理器引用 */
  queueManagerRef: React.MutableRefObject<WordQueueManager | null>;
  /** 自适应管理器引用 */
  adaptiveManagerRef: React.MutableRefObject<AdaptiveQueueManager | null>;
  /** 当前单词 */
  currentWord: WordItem | null;
  /** 所有单词 */
  allWords: WordItem[];
  /** 当前进度 */
  progress: QueueProgress;
  /** 是否已完成 */
  isCompleted: boolean;
  /** 完成原因 */
  completionReason: CompletionReason | undefined;
  /** 队列配置引用 */
  configRef: React.MutableRefObject<QueueConfig>;
  /** 初始化队列 */
  initializeQueue: (words: WordItem[], config: Partial<QueueConfig>) => void;
  /** 恢复队列状态 */
  restoreQueue: (words: WordItem[], state: QueueState, config: QueueConfig) => void;
  /** 从管理器更新状态 */
  updateFromManager: (options?: { consume?: boolean }) => void;
  /** 获取当前单词 */
  getCurrentWord: () => WordItem | null;
  /** 获取所有单词 */
  getAllWords: () => WordItem[];
  /** 记录答题 */
  recordAnswer: (
    wordId: string,
    isCorrect: boolean,
    responseTime: number,
    masteryDecision?: MasteryDecision
  ) => { mastered: boolean };
  /** 跳过单词 */
  skipWord: (wordId: string) => boolean;
  /** 获取队列状态（用于持久化） */
  getQueueState: () => QueueState | null;
  /** 获取当前队列中的单词ID */
  getCurrentWordIds: () => string[];
  /** 获取已掌握的单词ID */
  getMasteredWordIds: () => string[];
  /** 应用队列调整 */
  applyAdjustments: (adjustments: { remove: string[]; add: WordItem[] }) => void;
  /** 添加新单词到队列 */
  addWords: (words: WordItem[]) => void;
  /** 获取自适应管理器的最近表现 */
  getRecentPerformance: () => RecentPerformance | null;
  /** 重置自适应计数器 */
  resetAdaptiveCounter: () => void;
  /** 重置队列状态 */
  resetQueue: () => void;
  /** 设置所有单词（用于按需加载） */
  setAllWords: React.Dispatch<React.SetStateAction<WordItem[]>>;
}

const DEFAULT_MASTERY_THRESHOLD = 2;
const DEFAULT_MAX_TOTAL_QUESTIONS = 100;

/**
 * 单词队列管理 Hook
 *
 * 从 useMasteryLearning 中提取的队列管理逻辑，负责：
 * - WordQueueManager 实例管理
 * - AdaptiveQueueManager 实例管理
 * - 队列状态同步到 React 状态
 * - 队列操作封装
 */
export function useWordQueue(options: UseWordQueueOptions): UseWordQueueReturn {
  const {
    targetMasteryCount,
    masteryThreshold = DEFAULT_MASTERY_THRESHOLD,
    maxTotalQuestions = DEFAULT_MAX_TOTAL_QUESTIONS
  } = options;

  // 队列管理器引用
  const queueManagerRef = useRef<WordQueueManager | null>(null);
  const adaptiveManagerRef = useRef<AdaptiveQueueManager | null>(null);

  // 配置引用
  const configRef = useRef<QueueConfig>({
    masteryThreshold,
    maxTotalQuestions
  });

  // React 状态
  const [currentWord, setCurrentWord] = useState<WordItem | null>(null);
  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionReason, setCompletionReason] = useState<CompletionReason | undefined>();
  const [progress, setProgress] = useState<QueueProgress>({
    masteredCount: 0,
    targetCount: targetMasteryCount,
    totalQuestions: 0,
    activeCount: 0,
    pendingCount: 0
  });

  /**
   * 从队列管理器更新 React 状态
   */
  const updateFromManager = useCallback((updateOptions: { consume?: boolean } = {}) => {
    const { consume = false } = updateOptions;
    if (!queueManagerRef.current) return;

    // 使用 peek 预览（不增加计数），只有 consume 时才真正消费
    const result = consume
      ? queueManagerRef.current.getNextWordWithReason()
      : queueManagerRef.current.peekNextWordWithReason();

    // 消费后重新获取 progress，确保题数同步
    const newProgress = queueManagerRef.current.getProgress();
    setProgress(newProgress);
    setCurrentWord(result.word);

    if (result.isCompleted) {
      setIsCompleted(true);
      setCompletionReason(result.completionReason);
    }
  }, []);

  /**
   * 初始化队列（新会话）
   */
  const initializeQueue = useCallback((words: WordItem[], config: Partial<QueueConfig> = {}) => {
    // 更新配置
    if (config.masteryThreshold !== undefined) {
      configRef.current.masteryThreshold = config.masteryThreshold;
    }
    if (config.maxTotalQuestions !== undefined) {
      configRef.current.maxTotalQuestions = config.maxTotalQuestions;
    }

    // 创建队列管理器
    queueManagerRef.current = new WordQueueManager(words, {
      targetMasteryCount,
      masteryThreshold: configRef.current.masteryThreshold,
      maxTotalQuestions: configRef.current.maxTotalQuestions
    });

    // 创建自适应管理器
    adaptiveManagerRef.current = new AdaptiveQueueManager();

    // 更新状态
    setAllWords(words);
    setIsCompleted(false);
    setCompletionReason(undefined);

    learningLogger.info(
      { wordCount: words.length, targetMasteryCount },
      '队列已初始化'
    );
  }, [targetMasteryCount]);

  /**
   * 恢复队列状态（从缓存恢复）
   */
  const restoreQueue = useCallback((
    words: WordItem[],
    state: QueueState,
    config: QueueConfig
  ) => {
    // 更新配置
    configRef.current = { ...config };

    // 创建队列管理器并恢复状态
    const manager = new WordQueueManager(words, {
      targetMasteryCount,
      masteryThreshold: config.masteryThreshold,
      maxTotalQuestions: config.maxTotalQuestions
    });
    manager.restoreState(state);

    queueManagerRef.current = manager;
    adaptiveManagerRef.current = new AdaptiveQueueManager();

    // 更新状态
    setAllWords(words);
    setIsCompleted(false);
    setCompletionReason(undefined);

    learningLogger.info(
      { wordCount: words.length, targetMasteryCount },
      '队列已恢复'
    );
  }, [targetMasteryCount]);

  /**
   * 获取当前单词
   */
  const getCurrentWord = useCallback((): WordItem | null => {
    return currentWord;
  }, [currentWord]);

  /**
   * 获取所有单词
   */
  const getAllWords = useCallback((): WordItem[] => {
    return allWords;
  }, [allWords]);

  /**
   * 记录答题结果
   */
  const recordAnswer = useCallback((
    wordId: string,
    isCorrect: boolean,
    responseTime: number,
    masteryDecision?: MasteryDecision
  ): { mastered: boolean } => {
    if (!queueManagerRef.current) {
      return { mastered: false };
    }

    const result = queueManagerRef.current.recordAnswer(
      wordId,
      isCorrect,
      responseTime,
      masteryDecision
    );

    // 更新进度状态
    const newProgress = queueManagerRef.current.getProgress();
    setProgress(newProgress);

    return { mastered: result.mastered };
  }, []);

  /**
   * 跳过单词
   */
  const skipWord = useCallback((wordId: string): boolean => {
    if (!queueManagerRef.current) {
      return false;
    }

    return queueManagerRef.current.skipWord(wordId);
  }, []);

  /**
   * 获取队列状态（用于持久化）
   */
  const getQueueState = useCallback((): QueueState | null => {
    if (!queueManagerRef.current) {
      return null;
    }
    return queueManagerRef.current.getState();
  }, []);

  /**
   * 获取当前队列中的单词ID
   */
  const getCurrentWordIds = useCallback((): string[] => {
    if (!queueManagerRef.current) {
      return [];
    }
    return queueManagerRef.current.getCurrentWordIds();
  }, []);

  /**
   * 获取已掌握的单词ID
   */
  const getMasteredWordIds = useCallback((): string[] => {
    if (!queueManagerRef.current) {
      return [];
    }
    return queueManagerRef.current.getMasteredWordIds();
  }, []);

  /**
   * 应用队列调整
   */
  const applyAdjustments = useCallback((adjustments: { remove: string[]; add: WordItem[] }) => {
    if (!queueManagerRef.current) {
      return;
    }

    queueManagerRef.current.applyAdjustments(adjustments);

    // 如果有新增单词，更新 allWords
    if (adjustments.add.length > 0) {
      setAllWords(prev => [...prev, ...adjustments.add]);
    }
  }, []);

  /**
   * 添加新单词到队列（用于按需加载）
   */
  const addWords = useCallback((words: WordItem[]) => {
    if (!queueManagerRef.current || words.length === 0) {
      return;
    }

    queueManagerRef.current.applyAdjustments({
      remove: [],
      add: words
    });

    setAllWords(prev => [...prev, ...words]);

    learningLogger.info({ count: words.length }, '已添加新单词到队列');
  }, []);

  /**
   * 获取自适应管理器的最近表现
   */
  const getRecentPerformance = useCallback((): RecentPerformance | null => {
    if (!adaptiveManagerRef.current) {
      return null;
    }
    return adaptiveManagerRef.current.getRecentPerformance();
  }, []);

  /**
   * 重置自适应计数器
   */
  const resetAdaptiveCounter = useCallback(() => {
    if (adaptiveManagerRef.current) {
      adaptiveManagerRef.current.resetCounter();
    }
  }, []);

  /**
   * 重置队列状态
   */
  const resetQueue = useCallback(() => {
    queueManagerRef.current = null;
    adaptiveManagerRef.current = null;
    setCurrentWord(null);
    setAllWords([]);
    setIsCompleted(false);
    setCompletionReason(undefined);
    setProgress({
      masteredCount: 0,
      targetCount: targetMasteryCount,
      totalQuestions: 0,
      activeCount: 0,
      pendingCount: 0
    });

    // 重置配置
    configRef.current = {
      masteryThreshold: DEFAULT_MASTERY_THRESHOLD,
      maxTotalQuestions: DEFAULT_MAX_TOTAL_QUESTIONS
    };

    learningLogger.info('队列已重置');
  }, [targetMasteryCount]);

  return {
    queueManagerRef,
    adaptiveManagerRef,
    currentWord,
    allWords,
    progress,
    isCompleted,
    completionReason,
    configRef,
    initializeQueue,
    restoreQueue,
    updateFromManager,
    getCurrentWord,
    getAllWords,
    recordAnswer,
    skipWord,
    getQueueState,
    getCurrentWordIds,
    getMasteredWordIds,
    applyAdjustments,
    addWords,
    getRecentPerformance,
    resetAdaptiveCounter,
    resetQueue,
    setAllWords
  };
}
