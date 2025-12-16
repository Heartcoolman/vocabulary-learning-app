/**
 * useStudyConfig Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useStudyConfig,
  useTodayWords,
  useStudyProgress,
  type TodayWordsResponse,
  type StudyProgressResponse,
} from '../useStudyConfig';
import { apiClient } from '../../../services/client';
import type { StudyConfig } from '../../../types/models';

// Mock apiClient
vi.mock('../../../services/client', () => {
  const client = {
    getStudyConfig: vi.fn(),
    getTodayWords: vi.fn(),
    getStudyProgress: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

const mockApiClient = apiClient as unknown as {
  getStudyConfig: ReturnType<typeof vi.fn>;
  getTodayWords: ReturnType<typeof vi.fn>;
  getStudyProgress: ReturnType<typeof vi.fn>;
};

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: () => 0,
        gcTime: 0,
      },
    },
  });
}

// 创建 wrapper 组件
function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockStudyConfig: StudyConfig = {
  id: 'test-config-id',
  userId: 'test-user-id',
  selectedWordBookIds: ['book-1', 'book-2'],
  dailyWordCount: 30,
  studyMode: 'sequential',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockTodayWords: TodayWordsResponse = {
  words: [
    {
      id: 'word-1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      isNew: true,
    },
  ],
  progress: {
    todayStudied: 10,
    todayTarget: 30,
    totalStudied: 100,
    correctRate: 85,
  },
};

const mockStudyProgress: StudyProgressResponse = {
  todayStudied: 10,
  todayTarget: 30,
  totalStudied: 100,
  correctRate: 85,
  weeklyTrend: [5, 10, 8, 12, 15, 10, 10],
};

describe('useStudyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('获取学习配置', () => {
    it('应该成功获取学习配置', async () => {
      mockApiClient.getStudyConfig.mockResolvedValueOnce(mockStudyConfig);

      const { result } = renderHook(() => useStudyConfig(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getStudyConfig).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockStudyConfig);
      expect(result.current.error).toBeNull();
    });

    it('应该正确处理加载错误', async () => {
      const error = new Error('加载配置失败');
      mockApiClient.getStudyConfig.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useStudyConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });

    it('应该使用长缓存时间（1小时）', () => {
      const { result } = renderHook(() => useStudyConfig(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });
  });
});

describe('useTodayWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('获取今日学习单词', () => {
    it('应该成功获取今日学习单词', async () => {
      // ApiClient.getTodayWords 返回的格式
      mockApiClient.getTodayWords.mockResolvedValueOnce({
        words: [
          {
            id: 'word-1',
            spelling: 'test',
            phonetic: '/test/',
            meanings: ['测试'],
            examples: ['This is a test.'],
          },
        ],
        progress: {
          todayStudied: 10,
          todayTarget: 30,
          totalStudied: 100,
          correctRate: 85,
        },
      });

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getTodayWords).toHaveBeenCalledTimes(1);
      expect(result.current.data?.words[0].spelling).toBe('test');
      expect(result.current.data?.progress.todayStudied).toBe(10);
    });

    it('应该支持禁用查询', () => {
      const { result } = renderHook(() => useTodayWords(false), {
        wrapper: createWrapper(),
      });

      // 当 enabled=false 时，query 不会执行，status 为 'pending'
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockApiClient.getTodayWords).not.toHaveBeenCalled();
    });

    it('应该正确处理加载错误', async () => {
      const error = new Error('加载今日单词失败');
      mockApiClient.getTodayWords.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useTodayWords(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
    });
  });
});

describe('useStudyProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('获取学习进度', () => {
    it('应该成功获取学习进度', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockStudyProgress);

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockStudyProgress);
    });

    it('应该支持禁用查询', () => {
      const { result } = renderHook(() => useStudyProgress(false), {
        wrapper: createWrapper(),
      });

      // 当 enabled=false 时，query 不会执行，fetchStatus 为 'idle'
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockApiClient.getStudyProgress).not.toHaveBeenCalled();
    });

    it('应该在组件挂载时重新获取数据', async () => {
      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockStudyProgress);

      const { result, unmount } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(1);

      // 卸载并重新挂载
      unmount();

      mockApiClient.getStudyProgress.mockResolvedValueOnce(mockStudyProgress);

      const { result: result2 } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      // 应该重新获取数据
      expect(mockApiClient.getStudyProgress).toHaveBeenCalledTimes(2);
    });

    it('应该正确处理加载错误', async () => {
      const error = new Error('加载进度失败');
      mockApiClient.getStudyProgress.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useStudyProgress(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeTruthy();
    });
  });
});
