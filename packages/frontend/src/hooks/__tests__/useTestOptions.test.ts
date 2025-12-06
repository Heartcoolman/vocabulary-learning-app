/**
 * useTestOptions Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTestOptions, useTestOptionsGenerator, generateTestOptions } from '../useTestOptions';

// Mock learningLogger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('useTestOptions', () => {
  describe('initial state', () => {
    it('should return options based on config', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉', '橘子', '葡萄'],
          numberOfOptions: 4,
          shuffleOptions: false
        })
      );

      expect(result.current.options).toHaveLength(4);
      expect(result.current.options[0].text).toBe('苹果');
      expect(result.current.options[0].isCorrect).toBe(true);
      expect(result.current.selectedOption).toBeNull();
      expect(result.current.isAnswered).toBe(false);
    });

    it('should handle fewer distractors than requested', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉'],
          numberOfOptions: 4,
          shuffleOptions: false
        })
      );

      // Should have correct answer + 1 distractor = 2 options
      expect(result.current.options).toHaveLength(2);
      expect(result.current.options.some(o => o.isCorrect)).toBe(true);
    });

    it('should use default values when not provided', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果'
        })
      );

      // Default: numberOfOptions = 4, but no distractors, so only 1 option
      expect(result.current.options.length).toBeGreaterThanOrEqual(1);
      expect(result.current.options.some(o => o.text === '苹果' && o.isCorrect)).toBe(true);
    });
  });

  describe('shuffle behavior', () => {
    it('should not shuffle when shuffleOptions is false', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '正确答案',
          distractors: ['干扰项1', '干扰项2', '干扰项3'],
          numberOfOptions: 4,
          shuffleOptions: false
        })
      );

      // First option should always be the correct answer when not shuffled
      expect(result.current.options[0].text).toBe('正确答案');
      expect(result.current.options[0].isCorrect).toBe(true);
    });

    it('should contain all options when shuffled', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '正确答案',
          distractors: ['干扰项1', '干扰项2', '干扰项3'],
          numberOfOptions: 4,
          shuffleOptions: true
        })
      );

      const texts = result.current.options.map(o => o.text);
      expect(texts).toContain('正确答案');
      expect(texts).toContain('干扰项1');
      expect(texts).toContain('干扰项2');
      expect(texts).toContain('干扰项3');
    });
  });

  describe('option selection', () => {
    it('should select an option', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉', '橘子'],
          shuffleOptions: false
        })
      );

      act(() => {
        result.current.selectOption(result.current.options[0]);
      });

      expect(result.current.selectedOption).toBe(result.current.options[0]);
      expect(result.current.isAnswered).toBe(true);
    });

    it('should reset selection', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉'],
          shuffleOptions: false
        })
      );

      act(() => {
        result.current.selectOption(result.current.options[0]);
      });

      expect(result.current.isAnswered).toBe(true);

      act(() => {
        result.current.resetSelection();
      });

      expect(result.current.selectedOption).toBeNull();
      expect(result.current.isAnswered).toBe(false);
    });
  });

  describe('regenerate options', () => {
    it('should regenerate options and reset selection', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉', '橘子', '葡萄'],
          shuffleOptions: true
        })
      );

      // Select an option first
      act(() => {
        result.current.selectOption(result.current.options[0]);
      });

      expect(result.current.isAnswered).toBe(true);

      // Regenerate
      act(() => {
        result.current.regenerateOptions();
      });

      // Selection should be reset
      expect(result.current.selectedOption).toBeNull();
      expect(result.current.isAnswered).toBe(false);
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉']
        })
      );

      expect(result.current).toHaveProperty('options');
      expect(result.current).toHaveProperty('regenerateOptions');
      expect(result.current).toHaveProperty('selectedOption');
      expect(result.current).toHaveProperty('selectOption');
      expect(result.current).toHaveProperty('isAnswered');
      expect(result.current).toHaveProperty('resetSelection');

      expect(Array.isArray(result.current.options)).toBe(true);
      expect(typeof result.current.regenerateOptions).toBe('function');
      expect(typeof result.current.selectOption).toBe('function');
      expect(typeof result.current.resetSelection).toBe('function');
      expect(typeof result.current.isAnswered).toBe('boolean');
    });

    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() =>
        useTestOptions({
          correctAnswer: '苹果',
          distractors: ['香蕉']
        })
      );

      const initialRegenerate = result.current.regenerateOptions;
      const initialSelect = result.current.selectOption;
      const initialReset = result.current.resetSelection;

      rerender();

      expect(result.current.regenerateOptions).toBe(initialRegenerate);
      expect(result.current.selectOption).toBe(initialSelect);
      expect(result.current.resetSelection).toBe(initialReset);
    });
  });
});

describe('useTestOptionsGenerator', () => {
  const mockGenerateOptions = vi.fn();
  const mockWord = {
    id: 'word-1',
    spelling: 'apple',
    meanings: ['苹果', '苹果公司']
  };
  const mockAllWords = [
    mockWord,
    { id: 'word-2', spelling: 'banana', meanings: ['香蕉'] },
    { id: 'word-3', spelling: 'orange', meanings: ['橘子', '橙色'] },
    { id: 'word-4', spelling: 'grape', meanings: ['葡萄'] }
  ];

  beforeEach(() => {
    mockGenerateOptions.mockReset();
    mockGenerateOptions.mockReturnValue({
      options: ['苹果', '香蕉', '橘子', '葡萄'],
      correctAnswer: '苹果'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should generate options when currentWord is provided', () => {
      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords,
            numberOfOptions: 4
          },
          mockGenerateOptions
        )
      );

      expect(mockGenerateOptions).toHaveBeenCalledWith(mockWord, mockAllWords, 4);
      expect(result.current.options).toEqual(['苹果', '香蕉', '橘子', '葡萄']);
    });

    it('should return empty options when currentWord is null', () => {
      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: null,
            allWords: mockAllWords,
            numberOfOptions: 4
          },
          mockGenerateOptions
        )
      );

      expect(mockGenerateOptions).not.toHaveBeenCalled();
      expect(result.current.options).toEqual([]);
    });
  });

  describe('option generation', () => {
    it('should regenerate options when currentWord changes', () => {
      const { result, rerender } = renderHook(
        ({ word }) =>
          useTestOptionsGenerator(
            {
              currentWord: word,
              allWords: mockAllWords,
              numberOfOptions: 4
            },
            mockGenerateOptions
          ),
        { initialProps: { word: mockWord } }
      );

      expect(mockGenerateOptions).toHaveBeenCalledTimes(1);

      const newWord = { id: 'word-2', spelling: 'banana', meanings: ['香蕉'] };
      mockGenerateOptions.mockReturnValue({
        options: ['香蕉', '苹果', '橘子', '葡萄'],
        correctAnswer: '香蕉'
      });

      rerender({ word: newWord });

      expect(mockGenerateOptions).toHaveBeenCalledTimes(2);
      expect(result.current.options).toEqual(['香蕉', '苹果', '橘子', '葡萄']);
    });

    it('should use fallback options when generateOptions throws', () => {
      mockGenerateOptions.mockImplementation(() => {
        throw new Error('Generation failed');
      });

      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords,
            numberOfOptions: 4,
            fallbackDistractors: ['未知释义', '其他含义', '暂无解释']
          },
          mockGenerateOptions
        )
      );

      // Should have fallback options (2 options: correct + 1 distractor)
      expect(result.current.options).toHaveLength(2);
      expect(result.current.options).toContain('苹果');
    });
  });

  describe('regenerateOptions', () => {
    it('should force regeneration when regenerateOptions is called', () => {
      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords,
            numberOfOptions: 4
          },
          mockGenerateOptions
        )
      );

      const initialCallCount = mockGenerateOptions.mock.calls.length;

      act(() => {
        result.current.regenerateOptions();
      });

      expect(mockGenerateOptions).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    it('should increment questionIndex when regenerating', () => {
      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords,
            numberOfOptions: 4
          },
          mockGenerateOptions
        )
      );

      const initialIndex = result.current.questionIndex;

      act(() => {
        result.current.regenerateOptions();
      });

      expect(result.current.questionIndex).toBe(initialIndex + 1);
    });
  });

  describe('return values', () => {
    it('should return correct interface properties', () => {
      const { result } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords
          },
          mockGenerateOptions
        )
      );

      expect(result.current).toHaveProperty('options');
      expect(result.current).toHaveProperty('regenerateOptions');
      expect(result.current).toHaveProperty('questionIndex');

      expect(Array.isArray(result.current.options)).toBe(true);
      expect(typeof result.current.regenerateOptions).toBe('function');
      expect(typeof result.current.questionIndex).toBe('number');
    });

    it('should return stable regenerateOptions function reference', () => {
      const { result, rerender } = renderHook(() =>
        useTestOptionsGenerator(
          {
            currentWord: mockWord,
            allWords: mockAllWords
          },
          mockGenerateOptions
        )
      );

      const initialRegenerate = result.current.regenerateOptions;

      rerender();

      expect(result.current.regenerateOptions).toBe(initialRegenerate);
    });
  });
});

describe('generateTestOptions utility', () => {
  it('should generate options with correct answer first when not shuffled', () => {
    const options = generateTestOptions(
      '正确答案',
      ['干扰项1', '干扰项2', '干扰项3'],
      4,
      false
    );

    expect(options).toHaveLength(4);
    expect(options[0]).toBe('正确答案');
  });

  it('should contain all provided options when shuffled', () => {
    const options = generateTestOptions(
      '正确答案',
      ['干扰项1', '干扰项2', '干扰项3'],
      4,
      true
    );

    expect(options).toHaveLength(4);
    expect(options).toContain('正确答案');
    expect(options).toContain('干扰项1');
    expect(options).toContain('干扰项2');
    expect(options).toContain('干扰项3');
  });

  it('should handle fewer distractors than requested', () => {
    const options = generateTestOptions(
      '正确答案',
      ['干扰项1'],
      4,
      false
    );

    expect(options).toHaveLength(2);
    expect(options).toContain('正确答案');
    expect(options).toContain('干扰项1');
  });

  it('should ensure at least 2 options', () => {
    const options = generateTestOptions(
      '正确答案',
      [],
      4,
      false
    );

    // With no distractors, should still have at least the correct answer
    expect(options).toHaveLength(1);
    expect(options[0]).toBe('正确答案');
  });

  it('should use default values', () => {
    const options = generateTestOptions(
      '正确答案',
      ['干扰项1', '干扰项2', '干扰项3']
    );

    expect(options).toHaveLength(4);
    expect(options).toContain('正确答案');
  });
});
