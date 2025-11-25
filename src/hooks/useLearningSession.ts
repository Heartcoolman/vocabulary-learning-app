import { useState, useRef, useCallback } from 'react';
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
}

/**
 * 学习会话 Hook
 * 管理学习会话的完整生命周期
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

  // Refs
  const currentWordIdRef = useRef<string | null>(null);
  const precomputedResultsRef = useRef<PrecomputedResults>({
    wordId: null,
    correct: null,
    wrong: null,
  });

  // 计时器
  const timer = useLearningTimer();

  /**
   * 加载当前单词
   */
  const loadCurrentWord = useCallback(
    async (words: Word[], userId?: string) => {
      const word = LearningService.getCurrentWord();
      
      if (!word) {
        setIsCompleted(true);
        return;
      }

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
          
          // 防止竞态条件
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
            precomputedResultsRef.current = {
              wordId: word.id,
              correct: {
                masteryLevelBefore: masteryLevel,
                masteryLevelAfter: Math.min(5, masteryLevel + 1),
                score: state.score || 0,
                nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
              },
              wrong: {
                masteryLevelBefore: masteryLevel,
                masteryLevelAfter: Math.max(0, masteryLevel - 1),
                score: state.score || 0,
                nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
              },
            };
          } else {
            setWordState(null);
            precomputedResultsRef.current = {
              wordId: word.id,
              correct: {
                masteryLevelBefore: 0,
                masteryLevelAfter: 1,
                score: 0,
                nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
              },
              wrong: {
                masteryLevelBefore: 0,
                masteryLevelAfter: 0,
                score: 0,
                nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN'),
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
   */
  const initialize = useCallback(
    async (userId: string) => {
      try {
        setIsLoading(true);
        setError(null);
        setIsCompleted(false);

        const response = await ApiClient.getTodayWords();
        const words: Word[] = response.words;

        if (!words || words.length === 0) {
          setError('今天没有可学习的单词。可能原因：1) 未配置学习计划 2) 所有单词已学完且今天无复习任务 3) 词书为空');
          setIsLoading(false);
          return;
        }

        setAllWords(words);
        const wordIds = words.map((w) => w.id);
        await LearningService.startSession(wordIds, userId);
        await loadCurrentWord(words, userId);
        setIsLoading(false);
      } catch (err) {
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

      const isCorrect = answer === currentWord.meanings[0];

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

      // 后台提交答题（不阻塞UI）
      const submitWordId = currentWord.id;
      LearningService.submitAnswer(
        submitWordId,
        answer,
        isCorrect,
        finalResponseTime,
        finalDwellTime,
        userId
      )
        .then((result) => {
          if (result && currentWordIdRef.current === submitWordId) {
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
        });

      // 后台调用AMAS
      ApiClient.processLearningEvent({
        wordId: submitWordId,
        isCorrect,
        responseTime: finalResponseTime,
        dwellTime: finalDwellTime,
      })
        .then((result) => {
          if (currentWordIdRef.current === submitWordId) {
            setAmasResult(result);
            setAmasRefreshTrigger((prev) => prev + 1);
          }
        })
        .catch((err) => {
          console.error('AMAS处理失败:', err);
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

    loadCurrentWord(allWords, undefined);
  }, [allWords, loadCurrentWord]);

  /**
   * 重新开始
   */
  const restart = useCallback(() => {
    LearningService.endSession();
    setIsCompleted(false);
    timer.reset();
  }, [timer]);

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
    },
    // 操作
    actions: {
      initialize,
      handleSelectAnswer,
      handleNext,
      restart,
      loadCurrentWord,
    },
    // 计时器
    timer,
  };
}

export default useLearningSession;
