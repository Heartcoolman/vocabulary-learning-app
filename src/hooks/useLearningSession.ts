import { useState, useRef, useCallback, useEffect } from 'react';
import { Word } from '../types/models';
import LearningService from '../services/LearningService';
import ApiClient from '../services/ApiClient';
import AudioService from '../services/AudioService';
import { handleError } from '../utils/errorHandler';
import { useLearningTimer } from './useLearningTimer';
import { AmasProcessResult } from '../types/amas';

/**
 * 答题反馈信息
 */
export interface AnswerFeedback {
  masteryLevelBefore: number;
  masteryLevelAfter: number;
  score: number;
  nextReviewDate: string;
}

/**
 * 单词学习状态
 */
export interface WordLearningState {
  masteryLevel: number;
  score: number;
  nextReviewDate: string;
}

/**
 * 预计算结果缓存
 */
interface PrecomputedResults {
  wordId: string | null;
  correct: AnswerFeedback | null;
  wrong: AnswerFeedback | null;
}

/**
 * 学习会话状态
 */
export interface LearningSessionState {
  currentWord: Word | null;
  allWords: Word[];
  testOptions: string[];
  selectedAnswer: string | undefined;
  showResult: boolean;
  progress: { current: number; total: number };
  isLoading: boolean;
  error: string | null;
  isCompleted: boolean;
  answerFeedback: AnswerFeedback | null;
  wordState: WordLearningState | null;
  amasResult: AmasProcessResult | null;
  amasRefreshTrigger: number;
  submitError: string | null;
}

/**
 * 学习会话 Hook
 * 管理学习会话的完整生命周期
 * 修复：添加会话代际追踪，防止跨会话数据混用
 */
export function useLearningSession() {
  // 状态
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [testOptions, setTestOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [wordState, setWordState] = useState<WordLearningState | null>(null);
  const [amasResult, setAmasResult] = useState<AmasProcessResult | null>(null);
  const [amasRefreshTrigger, setAmasRefreshTrigger] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs
  const currentWordIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  // 复用 AMAS 会话，避免每题新建 sessionId
  const amasSessionIdRef = useRef<string | null>(null);
  const precomputedResultsRef = useRef<PrecomputedResults>({
    wordId: null,
    correct: null,
    wrong: null,
  });

  // 会话代际追踪：用于防止跨会话/跨用户数据混用
  const sessionGenerationRef = useRef<number>(0);
  // 组件是否已卸载
  const isMountedRef = useRef<boolean>(true);

  // 组件卸载时标记
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 计时器
  const timer = useLearningTimer();

  /**
   * 加载当前单词
   * 修复：添加会话代际检查，防止跨会话数据覆盖
   */
  const loadCurrentWord = useCallback(
    async (words: Word[], userId?: string) => {
      const word = LearningService.getCurrentWord();
      // 捕获当前会话代际
      const currentGeneration = sessionGenerationRef.current;

      if (!word) {
        if (isMountedRef.current) {
          setIsCompleted(true);
        }
        return;
      }

      if (!isMountedRef.current) return;
      setCurrentWord(word);
      currentWordIdRef.current = word.id;
      setSelectedAnswer(undefined);
      setShowResult(false);
      setAnswerFeedback(null);
      timer.startTimers();

      // 获取单词状态并预计算结果
      if (userId) {
        try {
          const state = await LearningService.getWordState(userId, word.id);

          // 防止竞态条件：检查组件是否卸载、会话代际是否变化、单词是否变化
          if (!isMountedRef.current) return;
          if (sessionGenerationRef.current !== currentGeneration) return;
          if (currentWordIdRef.current !== word.id) return;

          if (state) {
            const masteryLevel = state.masteryLevel;
            const currentState: WordLearningState = {
              masteryLevel,
              score: state.score || 0,
              nextReviewDate: state.nextReviewDate
                ? new Date(state.nextReviewDate).toLocaleDateString('zh-CN')
                : '未知',
            };
            setWordState(currentState);

            // 预计算答对/答错结果
            // 注意：这是前端预计算的近似值，实际结果由后端 SRS 算法决定
            // 答对：掌握度 +1（最高5级）
            const newMasteryOnCorrect = Math.min(5, masteryLevel + 1);

            // 答错：掌握度 -1（最低0级）
            const newMasteryOnWrong = Math.max(0, masteryLevel - 1);

            // 计算下次复习时间（基于当前间隔和难度因子）
            // 修复问题#22: 使用统一的日期格式化函数，避免时区不一致
            const formatLocalDate = (date: Date): string => {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              return `${year}/${month}/${day}`;
            };

            const reviewIntervals = [1, 3, 7, 15, 30]; // 默认配置
            const intervalIndex = Math.min(newMasteryOnCorrect, reviewIntervals.length - 1);
            const nextIntervalDays = reviewIntervals[intervalIndex] || 1;
            const nextReviewOnCorrect = formatLocalDate(new Date(
              Date.now() + nextIntervalDays * 24 * 60 * 60 * 1000
            ));
            // 答错时下次复习设为1天后
            const nextReviewOnWrong = formatLocalDate(new Date(
              Date.now() + 1 * 24 * 60 * 60 * 1000
            ));

            precomputedResultsRef.current = {
              wordId: word.id,
              correct: {
                masteryLevelBefore: masteryLevel,
                masteryLevelAfter: newMasteryOnCorrect,
                score: state.score || 0,
                nextReviewDate: nextReviewOnCorrect,
              },
              wrong: {
                masteryLevelBefore: masteryLevel,
                masteryLevelAfter: newMasteryOnWrong,
                score: state.score || 0,
                nextReviewDate: nextReviewOnWrong,
              },
            };
          } else {
            setWordState(null);
            // 新单词的预计算结果
            precomputedResultsRef.current = {
              wordId: word.id,
              correct: {
                masteryLevelBefore: 0,
                masteryLevelAfter: 1,
                score: 0,
                nextReviewDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
              },
              wrong: {
                masteryLevelBefore: 0,
                masteryLevelAfter: 0,
                score: 0,
                nextReviewDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
              },
            };
          }
        } catch (err) {
          console.error('获取单词状态失败:', err);
          setWordState(null);
          precomputedResultsRef.current = { wordId: null, correct: null, wrong: null };
        }
      } else {
        setWordState(null);
        precomputedResultsRef.current = { wordId: null, correct: null, wrong: null };
      }

      // 生成测试选项
      const { options } = LearningService.generateTestOptions(word, words, 4);
      setTestOptions(options);
      setProgress(LearningService.getProgress());

      // 预加载音频
      if (word.audioUrl) {
        AudioService.preloadAudio(word.audioUrl).catch(() => {});
      }

      // 预加载下一个单词的音频
      const currentIndex = words.findIndex((w) => w.id === word.id);
      if (currentIndex >= 0 && currentIndex < words.length - 1) {
        const nextWord = words[currentIndex + 1];
        if (nextWord.audioUrl) {
          AudioService.preloadAudio(nextWord.audioUrl).catch(() => {});
        }
      }
    },
    [timer]
  );

  /**
   * 初始化学习会话
   * 修复：增加会话代际，防止旧请求覆盖新会话状态
   */
  const initialize = useCallback(
    async (userId: string) => {
      // 增加会话代际，使旧请求的回调失效
      sessionGenerationRef.current += 1;
      const currentGeneration = sessionGenerationRef.current;
      // 重置 AMAS 会话ID
      amasSessionIdRef.current = null;

      try {
        setIsLoading(true);
        setError(null);
        setIsCompleted(false);
        setSubmitError(null); // 清空上一会话的提交错误
        userIdRef.current = userId;

        const response = await ApiClient.getTodayWords();

        // 检查会话代际是否变化（用户可能已切换）
        if (!isMountedRef.current) return;
        if (sessionGenerationRef.current !== currentGeneration) return;

        const words: Word[] = response.words;

        if (!words || words.length === 0) {
          setError('今天没有可学习的单词。可能原因：1) 未配置学习计划 2) 所有单词已学完且今天无复习任务 3) 词书为空');
          setIsLoading(false);
          return;
        }

        setAllWords(words);
        const wordIds = words.map((w) => w.id);
        await LearningService.startSession(wordIds, userId);

        // 再次检查会话代际
        if (!isMountedRef.current) return;
        if (sessionGenerationRef.current !== currentGeneration) return;

        await loadCurrentWord(words, userId);
        setIsLoading(false);
      } catch (err) {
        // 只有当前会话才处理错误
        if (!isMountedRef.current) return;
        if (sessionGenerationRef.current !== currentGeneration) return;

        const errorMessage = handleError(err);
        setError(errorMessage || '加载学习内容失败');
        setIsLoading(false);
      }
    },
    [loadCurrentWord]
  );

  /**
   * 处理答题
   */
  const handleSelectAnswer = useCallback(
    async (answer: string, userId?: string) => {
      if (!currentWord || showResult) return;

      const finalResponseTime = timer.stopTimers();
      const finalDwellTime = timer.getDwellTime();

      setSelectedAnswer(answer);
      setShowResult(true);

      // 使用 LearningService 的方法检查答案（支持多释义）
      const isCorrect = LearningService.isAnswerCorrect(answer, currentWord);

      // 使用预计算结果（0延迟）
      const precomputed = precomputedResultsRef.current;
      const precomputedResult =
        precomputed.wordId === currentWord.id
          ? isCorrect
            ? precomputed.correct
            : precomputed.wrong
          : null;

      if (precomputedResult) {
        setAnswerFeedback(precomputedResult);
      } else {
        // 降级方案
        const currentMasteryLevel = wordState?.masteryLevel || 0;
        setAnswerFeedback({
          masteryLevelBefore: currentMasteryLevel,
          masteryLevelAfter: isCorrect
            ? Math.min(5, currentMasteryLevel + 1)
            : Math.max(0, currentMasteryLevel - 1),
          score: wordState?.score || 0,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
        });
      }

      // 清除之前的提交错误
      setSubmitError(null);

      // 捕获当前会话代际，用于回调中检查会话是否已切换
      const submitGeneration = sessionGenerationRef.current;
      const submitWordId = currentWord.id;

      // 后台提交答题（不阻塞UI）
      // 修复问题#6: 添加会话代际检查，防止跨会话数据污染
      LearningService.submitAnswer(
        submitWordId,
        answer,
        isCorrect,
        finalResponseTime,
        finalDwellTime,
        userId
      )
        .then((result) => {
          // 检查组件是否卸载、会话是否切换、单词是否变化
          if (!isMountedRef.current) return;
          if (sessionGenerationRef.current !== submitGeneration) return;
          if (currentWordIdRef.current !== submitWordId) return;

          if (result) {
            setAnswerFeedback({
              masteryLevelBefore: result.masteryLevelBefore || 0,
              masteryLevelAfter: result.masteryLevelAfter || 0,
              score: result.score || 0,
              nextReviewDate: result.nextReviewDate
                ? new Date(result.nextReviewDate).toLocaleDateString('zh-CN')
                : '未知',
            });
          }
        })
        .catch((err) => {
          console.error('保存答题记录失败:', err);
          // 只有当前会话且同一题时才显示错误
          if (!isMountedRef.current) return;
          if (sessionGenerationRef.current !== submitGeneration) return;
          if (currentWordIdRef.current === submitWordId) {
            setSubmitError('答题记录保存失败，请检查网络连接');
          }
        });

      // 后台调用AMAS（复用sessionId以关联同一学习会话）
      // 修复问题#6: 添加会话代际检查
      ApiClient.processLearningEvent({
        wordId: submitWordId,
        isCorrect,
        responseTime: finalResponseTime,
        dwellTime: finalDwellTime,
        sessionId: amasSessionIdRef.current || undefined,
      })
        .then((result) => {
          // 检查组件是否卸载、会话是否切换
          if (!isMountedRef.current) return;
          if (sessionGenerationRef.current !== submitGeneration) return;
          if (currentWordIdRef.current !== submitWordId) return;

          // 保存返回的sessionId供后续答题复用
          if (result.sessionId) {
            amasSessionIdRef.current = result.sessionId;
          }
          setAmasResult(result);
          setAmasRefreshTrigger((prev) => prev + 1);
        })
        .catch((err) => {
          console.error('AMAS处理失败:', err);
          // AMAS失败不影响主要流程，但记录错误供调试
        });
    },
    [currentWord, showResult, timer, wordState]
  );

  /**
   * 进入下一个单词
   */
  const handleNext = useCallback(() => {
    setAmasResult(null);

    const nextWord = LearningService.nextWord();
    if (!nextWord) {
      setIsCompleted(true);
      return;
    }

    // 使用存储的 userId 加载单词状态
    loadCurrentWord(allWords, userIdRef.current);
  }, [allWords, loadCurrentWord]);

  /**
   * 重新开始
   */
  const restart = useCallback(() => {
    LearningService.endSession();
    setIsCompleted(false);
    setSubmitError(null); // 清空提交错误
    timer.reset();
    // 重置 AMAS 会话ID
    amasSessionIdRef.current = null;
  }, [timer]);

  /**
   * 清除提交错误
   */
  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    // 状态
    state: {
      currentWord,
      allWords,
      testOptions,
      selectedAnswer,
      showResult,
      progress,
      isLoading,
      error,
      isCompleted,
      answerFeedback,
      wordState,
      amasResult,
      amasRefreshTrigger,
      submitError,
    },
    // 操作
    actions: {
      initialize,
      handleSelectAnswer,
      handleNext,
      restart,
      loadCurrentWord,
      clearSubmitError,
    },
    // 计时器
    timer,
  };
}

export default useLearningSession;
