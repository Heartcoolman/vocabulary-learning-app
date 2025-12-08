/**
 * useStudyPlan Tests
 *
 * 测试学习计划 Hook 的功能，包括：
 * 1. 数据获取 - 加载今日学习计划
 * 2. 状态管理 - loading, error 状态
 * 3. 数据转换 - 从 API 响应提取计划数据
 * 4. 刷新功能 - 重新获取数据
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useStudyPlan, StudyPlan } from '../useStudyPlan';
import type { Word } from '../../types/models';

// Mock client
vi.mock('../../services/client', () => ({
  wordBookClient: {
    getTodayWords: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import the mocked module to get reference
import { wordBookClient } from '../../services/client';

const mockWordBookClient = wordBookClient as unknown as {
  getTodayWords: ReturnType<typeof vi.fn>;
};

describe('useStudyPlan', () => {
  const mockWords: Word[] = [
    {
      id: 'word-1',
      spelling: 'hello',
      phonetic: '/həˈloʊ/',
      meanings: ['你好', '喂'],
      examples: ['Hello, world!'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'word-2',
      spelling: 'world',
      phonetic: '/wɜːrld/',
      meanings: ['世界', '地球'],
      examples: ['The world is beautiful.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const mockTodayWordsResponse = {
    words: mockWords,
    progress: {
      todayStudied: 25,
      todayTarget: 50,
      totalStudied: 500,
      correctRate: 0.85,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWordBookClient.getTodayWords.mockResolvedValue(mockTodayWordsResponse);
  });

  // ==================== 数据获取测试 ====================

  describe('数据获取', () => {
    it('should fetch study plan on mount', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockWordBookClient.getTodayWords).toHaveBeenCalledTimes(1);
      expect(result.current.plan).not.toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should return words from API response', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan?.words).toEqual(mockWords);
      expect(result.current.plan?.words.length).toBe(2);
    });

    it('should return progress data from API response', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan?.todayStudied).toBe(25);
      expect(result.current.plan?.todayTarget).toBe(50);
      expect(result.current.plan?.totalStudied).toBe(500);
      expect(result.current.plan?.correctRate).toBe(0.85);
    });
  });

  // ==================== 状态管理测试 ====================

  describe('状态管理', () => {
    it('should start with loading state', async () => {
      let resolvePromise: (value: typeof mockTodayWordsResponse) => void;
      const promise = new Promise<typeof mockTodayWordsResponse>((resolve) => {
        resolvePromise = resolve;
      });
      mockWordBookClient.getTodayWords.mockReturnValueOnce(promise);

      const { result } = renderHook(() => useStudyPlan());

      expect(result.current.loading).toBe(true);
      expect(result.current.plan).toBeNull();
      expect(result.current.error).toBeNull();

      await act(async () => {
        resolvePromise!(mockTodayWordsResponse);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set loading to false after successful fetch', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan).not.toBeNull();
    });

    it('should set loading to false after failed fetch', async () => {
      mockWordBookClient.getTodayWords.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
    });
  });

  // ==================== 错误处理测试 ====================

  describe('错误处理', () => {
    it('should set error message on API failure', async () => {
      mockWordBookClient.getTodayWords.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('无法加载今日学习计划，请检查网络连接。');
      expect(result.current.plan).toBeNull();
    });

    it('should clear error on successful refresh', async () => {
      mockWordBookClient.getTodayWords.mockRejectedValueOnce(new Error('First call failed'));

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Reset mock for successful fetch
      mockWordBookClient.getTodayWords.mockResolvedValueOnce(mockTodayWordsResponse);

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.plan).not.toBeNull();
    });
  });

  // ==================== 刷新功能测试 ====================

  describe('刷新功能', () => {
    it('should provide refresh function', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refresh).toBe('function');
    });

    it('should refresh data when refresh is called', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockWordBookClient.getTodayWords).toHaveBeenCalledTimes(1);

      // Update mock data for refresh
      const updatedResponse = {
        ...mockTodayWordsResponse,
        progress: {
          ...mockTodayWordsResponse.progress,
          todayStudied: 30,
        },
      };
      mockWordBookClient.getTodayWords.mockResolvedValueOnce(updatedResponse);

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockWordBookClient.getTodayWords).toHaveBeenCalledTimes(2);
      expect(result.current.plan?.todayStudied).toBe(30);
    });

    it('should set loading true during refresh', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolvePromise: (value: typeof mockTodayWordsResponse) => void;
      const promise = new Promise<typeof mockTodayWordsResponse>((resolve) => {
        resolvePromise = resolve;
      });
      mockWordBookClient.getTodayWords.mockReturnValueOnce(promise);

      act(() => {
        result.current.refresh();
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!(mockTodayWordsResponse);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle refresh error', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockWordBookClient.getTodayWords.mockRejectedValueOnce(new Error('Refresh failed'));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBe('无法加载今日学习计划，请检查网络连接。');
    });
  });

  // ==================== 数据完整性测试 ====================

  describe('数据完整性', () => {
    it('should return StudyPlan with all required fields', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const plan = result.current.plan;
      expect(plan).toHaveProperty('words');
      expect(plan).toHaveProperty('todayStudied');
      expect(plan).toHaveProperty('todayTarget');
      expect(plan).toHaveProperty('totalStudied');
      expect(plan).toHaveProperty('correctRate');
    });

    it('should handle empty words array', async () => {
      const emptyResponse = {
        words: [],
        progress: {
          todayStudied: 0,
          todayTarget: 50,
          totalStudied: 0,
          correctRate: 0,
        },
      };
      mockWordBookClient.getTodayWords.mockResolvedValueOnce(emptyResponse);

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan?.words).toEqual([]);
      expect(result.current.plan?.todayStudied).toBe(0);
    });

    it('should handle 100% correct rate', async () => {
      const perfectResponse = {
        ...mockTodayWordsResponse,
        progress: {
          ...mockTodayWordsResponse.progress,
          correctRate: 1.0,
        },
      };
      mockWordBookClient.getTodayWords.mockResolvedValueOnce(perfectResponse);

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan?.correctRate).toBe(1.0);
    });

    it('should handle exceeding daily target', async () => {
      const exceededResponse = {
        ...mockTodayWordsResponse,
        progress: {
          ...mockTodayWordsResponse.progress,
          todayStudied: 75,
          todayTarget: 50,
        },
      };
      mockWordBookClient.getTodayWords.mockResolvedValueOnce(exceededResponse);

      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plan?.todayStudied).toBeGreaterThan(
        result.current.plan?.todayTarget ?? 0,
      );
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况', () => {
    it('should maintain data between renders', async () => {
      const { result, rerender } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const firstPlan = result.current.plan;

      // Rerender without changing anything
      rerender();

      // Plan should be the same reference or equivalent
      expect(result.current.plan).toEqual(firstPlan);
    });

    it('should handle multiple rapid refreshes', async () => {
      const { result } = renderHook(() => useStudyPlan());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Trigger multiple refreshes
      await act(async () => {
        result.current.refresh();
        result.current.refresh();
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should complete without errors
      expect(result.current.plan).not.toBeNull();
    });
  });
});
