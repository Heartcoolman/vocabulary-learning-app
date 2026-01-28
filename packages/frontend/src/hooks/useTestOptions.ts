/**
 * useTestOptions Hook - 测试选项生成逻辑
 *
 * 从 LearningPage.tsx 中拆分出来，负责：
 * - 选项生成逻辑
 * - 干扰项生成
 * - 选项随机排序
 */
import { useState, useMemo, useCallback, useEffect } from 'react';

import { learningLogger } from '../utils/logger';

const EMPTY_STRING_ARRAY: string[] = [];
const DEFAULT_FALLBACK_DISTRACTORS = ['未知释义', '其他含义', '暂无解释'] as const;

export interface TestOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface UseTestOptionsConfig {
  correctAnswer: string;
  distractors?: string[];
  numberOfOptions?: number;
  shuffleOptions?: boolean;
}

export interface UseTestOptionsReturn {
  options: TestOption[];
  regenerateOptions: () => void;
  selectedOption: TestOption | null;
  selectOption: (option: TestOption) => void;
  isAnswered: boolean;
  resetSelection: () => void;
}

/**
 * 生成器配置 - 用于从单词库生成选项
 */
export interface TestOptionsGeneratorConfig<T> {
  /** 当前单词 */
  currentWord: T | null;
  /** 所有可用单词（用于生成干扰项） */
  allWords: T[];
  /** 选项数量 */
  numberOfOptions?: number;
  /** 备用干扰项 */
  fallbackDistractors?: string[];
}

export interface TestOptionsGeneratorReturn {
  /** 选项文本列表 */
  options: string[];
  /** 重新生成选项（强制刷新） */
  regenerateOptions: () => void;
  /** 当前题目索引 */
  questionIndex: number;
}

/**
 * Fisher-Yates 洗牌算法（带种子）
 * 使用种子确保可重复的随机结果
 */
function shuffleArray<T>(array: T[], seed: number): T[] {
  const result = [...array];
  // 简单的伪随机数生成器 (LCG)
  let currentSeed = seed;
  const random = () => {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    return currentSeed / 0x7fffffff;
  };

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 简单随机打乱数组
 */
function randomShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 测试选项管理 Hook（基础版本）
 *
 * @param config - 配置选项
 * @returns 选项列表和操作方法
 *
 * @example
 * ```tsx
 * const { options, selectOption, isAnswered } = useTestOptions({
 *   correctAnswer: '苹果',
 *   distractors: ['香蕉', '橘子', '葡萄'],
 *   numberOfOptions: 4,
 *   shuffleOptions: true
 * });
 * ```
 */
export function useTestOptions(config: UseTestOptionsConfig): UseTestOptionsReturn {
  const correctAnswer = config.correctAnswer;
  const distractors = config.distractors ?? EMPTY_STRING_ARRAY;
  const numberOfOptions = config.numberOfOptions ?? 4;
  const shuffleOptions = config.shuffleOptions ?? true;

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [optionsSeed, setOptionsSeed] = useState(() => Date.now());

  const options = useMemo(() => {
    // 生成正确答案选项
    const correct: TestOption = {
      id: 'correct',
      text: correctAnswer,
      isCorrect: true,
    };

    // 生成干扰项选项
    const incorrectOptions = distractors.slice(0, numberOfOptions - 1).map((text, index) => ({
      id: `distractor-${index}`,
      text,
      isCorrect: false,
    }));

    const allOptions = [correct, ...incorrectOptions];

    // 如果需要，打乱选项顺序
    if (shuffleOptions) {
      return shuffleArray(allOptions, optionsSeed);
    }
    return allOptions;
  }, [correctAnswer, distractors, numberOfOptions, shuffleOptions, optionsSeed]);

  /**
   * 重新生成选项（重新打乱顺序）
   */
  const regenerateOptions = useCallback(() => {
    setOptionsSeed(Date.now());
    setSelectedOptionId(null);
  }, []);

  /**
   * 选择一个选项
   */
  const selectOption = useCallback((option: TestOption) => {
    setSelectedOptionId(option.id);
  }, []);

  /**
   * 重置选择状态
   */
  const resetSelection = useCallback(() => {
    setSelectedOptionId(null);
  }, []);

  const selectedOption = useMemo(() => {
    if (!selectedOptionId) return null;
    return options.find((o) => o.id === selectedOptionId) ?? null;
  }, [options, selectedOptionId]);

  return {
    options,
    regenerateOptions,
    selectedOption,
    selectOption,
    isAnswered: selectedOptionId !== null,
    resetSelection,
  };
}

/**
 * 测试选项生成器 Hook（适用于 LearningPage）
 *
 * 从 LearningPage.tsx 中拆分出来的选项生成逻辑，
 * 封装了选项生成、干扰项选择、随机排序等功能。
 *
 * 此 Hook 只负责选项生成，不管理选择状态（selectedAnswer/showResult），
 * 因为这些状态可能被多个 Hook 共享（如 useAutoPlayPronunciation）。
 *
 * @param config - 生成器配置
 * @param generateOptions - 选项生成函数
 * @returns 选项列表和重新生成方法
 *
 * @example
 * ```tsx
 * const { options, regenerateOptions, questionIndex } = useTestOptionsGenerator({
 *   currentWord,
 *   allWords,
 *   numberOfOptions: 4,
 *   fallbackDistractors: ['未知释义', '其他含义', '暂无解释']
 * }, LearningService.generateTestOptions);
 * ```
 */
export function useTestOptionsGenerator<T extends { id: string; meanings: string[] }>(
  config: TestOptionsGeneratorConfig<T>,
  generateOptions: (
    word: T,
    allWords: T[],
    count: number,
  ) => { options: string[]; correctAnswer: string },
): TestOptionsGeneratorReturn {
  const currentWord = config.currentWord;
  const allWords = config.allWords;
  const numberOfOptions = config.numberOfOptions ?? 4;
  const fallbackDistractors = config.fallbackDistractors ?? DEFAULT_FALLBACK_DISTRACTORS;
  const fallbackDistractorsKey = useMemo(
    () => fallbackDistractors.join('\u0000'),
    [fallbackDistractors],
  );

  const [testOptions, setTestOptions] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);

  // 当 currentWord 或 questionIndex 变化时重新生成选项
  useEffect(() => {
    if (!currentWord) return;

    try {
      const { options } = generateOptions(currentWord, allWords, numberOfOptions);
      setTestOptions(options);
    } catch (e) {
      learningLogger.warn({ err: e, wordId: currentWord.id }, '生成测试选项失败，使用备用方案');

      // 回退方案：确保至少2个选项，使用预设干扰项
      const rawMeaning = currentWord.meanings[0] || '';
      const correctAnswer = rawMeaning.split(/[；;、]/)[0]?.trim() || rawMeaning;
      // 从干扰项中随机选择一个，确保至少有2个选项
      const randomDistractor =
        fallbackDistractors[Math.floor(Math.random() * fallbackDistractors.length)];
      // 随机打乱顺序
      const fallbackOptions =
        Math.random() > 0.5 ? [correctAnswer, randomDistractor] : [randomDistractor, correctAnswer];
      setTestOptions(fallbackOptions);
    }
    // fallbackDistractorsKey is a memoized representation of fallbackDistractors
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentWord,
    allWords,
    numberOfOptions,
    questionIndex,
    generateOptions,
    fallbackDistractorsKey,
  ]);

  /**
   * 重新生成选项（递增 questionIndex 强制触发重新生成）
   */
  const regenerateOptions = useCallback(() => {
    setQuestionIndex((prev) => prev + 1);
  }, []);

  return {
    options: testOptions,
    regenerateOptions,
    questionIndex,
  };
}

/**
 * 生成测试选项的工具函数
 *
 * @param correctAnswer - 正确答案
 * @param distractors - 干扰项列表
 * @param numberOfOptions - 选项数量
 * @param shuffle - 是否打乱顺序
 * @returns 选项列表
 */
export function generateTestOptions(
  correctAnswer: string,
  distractors: string[],
  numberOfOptions: number = 4,
  shuffle: boolean = true,
): string[] {
  // 确保至少有2个选项
  const requiredDistractors = Math.max(1, numberOfOptions - 1);
  const selectedDistractors = distractors.slice(0, requiredDistractors);

  const options = [correctAnswer, ...selectedDistractors];

  if (shuffle) {
    return randomShuffle(options);
  }
  return options;
}

export default useTestOptions;
