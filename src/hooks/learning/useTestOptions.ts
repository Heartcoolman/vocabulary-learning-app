import { useState, useEffect, useMemo } from 'react';
import LearningService from '../../services/LearningService';
import { learningLogger } from '../../utils/logger';
import type { WordItem } from '../../services/learning/WordQueueManager';

/**
 * 测试选项生成 Hook
 *
 * 用于为当前学习的单词生成测试选项，
 * 包含正确答案和干扰项。
 */
export interface UseTestOptionsResult {
  /** 当前生成的测试选项列表 */
  testOptions: string[];
  /** 当前题目索引（用于强制刷新选项） */
  questionIndex: number;
  /** 递增题目索引，强制重新生成选项 */
  incrementQuestionIndex: () => void;
}

export interface UseTestOptionsOptions {
  /** 当前正在学习的单词 */
  currentWord: WordItem | null;
  /** 所有可用的单词列表（用于生成干扰项） */
  allWords: WordItem[];
  /** 选项数量，默认为 4 */
  optionCount?: number;
}

/**
 * 用于生成测试选项的单词格式转换器
 * 将 Word 类型转换为 LearningService 需要的格式
 */
interface WordForOptions {
  id: string;
  spelling: string;
  phonetic: string;
  meanings: string[];
  examples: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 测试选项生成 Hook
 *
 * @param options - 配置选项
 * @returns 测试选项相关的状态和方法
 *
 * @example
 * ```tsx
 * const { testOptions, incrementQuestionIndex } = useTestOptions({
 *   currentWord,
 *   allWords,
 *   optionCount: 4,
 * });
 * ```
 */
export function useTestOptions({
  currentWord,
  allWords,
  optionCount = 4,
}: UseTestOptionsOptions): UseTestOptionsResult {
  const [testOptions, setTestOptions] = useState<string[]>([]);
  // 用于跟踪当前题目，防止同一单词重复出现时选项不更新
  const [questionIndex, setQuestionIndex] = useState(0);

  // 转换所有单词为选项生成所需的格式
  const allWordsForOptions = useMemo<WordForOptions[]>(() =>
    allWords.map(w => ({
      id: w.id,
      spelling: w.spelling,
      phonetic: w.phonetic,
      meanings: w.meanings,
      examples: w.examples,
      createdAt: 0,
      updatedAt: 0,
    })), [allWords]);

  // 当 currentWord 或 questionIndex 变化时重新生成选项
  // questionIndex 用于处理同一单词连续出现的情况
  useEffect(() => {
    if (!currentWord) return;

    try {
      const wordForOptions: WordForOptions = {
        ...currentWord,
        createdAt: 0,
        updatedAt: 0,
      };
      const { options } = LearningService.generateTestOptions(
        wordForOptions,
        allWordsForOptions,
        optionCount
      );
      setTestOptions(options);
    } catch (e) {
      learningLogger.warn({ err: e, wordId: currentWord.id }, '生成测试选项失败，使用备用方案');
      // 回退方案：确保至少2个选项，使用预设干扰项
      const correctAnswer = currentWord.meanings[0];
      const fallbackDistractors = [
        '未知释义',
        '其他含义',
        '暂无解释',
      ];
      // 从干扰项中随机选择一个，确保至少有2个选项
      const randomDistractor = fallbackDistractors[Math.floor(Math.random() * fallbackDistractors.length)];
      // 随机打乱顺序
      const fallbackOptions = Math.random() > 0.5
        ? [correctAnswer, randomDistractor]
        : [randomDistractor, correctAnswer];
      setTestOptions(fallbackOptions);
    }
  }, [currentWord, allWordsForOptions, questionIndex, optionCount]);

  // 递增题目索引，强制触发选项重新生成
  const incrementQuestionIndex = () => {
    setQuestionIndex(prev => prev + 1);
  };

  return {
    testOptions,
    questionIndex,
    incrementQuestionIndex,
  };
}

export default useTestOptions;
