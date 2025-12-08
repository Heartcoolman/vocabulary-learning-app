import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNextWords, fetchNextWords } from '../useNextWords';
import { learningClient } from '../../../services/client';
import type { NextWordsParams, NextWordsResult } from '../useNextWords';

// Mock learningClient
vi.mock('../../../services/client', () => ({
  learningClient: {
    getNextWords: vi.fn(),
  },
}));

const mockLearningClient = learningClient as unknown as {
  getNextWords: ReturnType<typeof vi.fn>;
};

// 创建测试用的QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

// Wrapper组件
const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Mock数据
const mockParams: NextWordsParams = {
  currentWordIds: ['word-1', 'word-2'],
  masteredWordIds: ['word-3'],
  sessionId: 'session-123',
  count: 5,
};

const mockResult: NextWordsResult = {
  words: [
    {
      id: 'word-4',
      spelling: 'hello',
      phonetic: '/həˈləʊ/',
      meanings: ['你好'],
      examples: ['Hello, world!'],
      difficulty: 0.5,
      isNew: true,
    },
    {
      id: 'word-5',
      spelling: 'world',
      phonetic: '/wɜːld/',
      meanings: ['世界'],
      examples: ['Hello, world!'],
      difficulty: 0.6,
      isNew: false,
    },
  ],
  strategy: {
    new_ratio: 0.3,
    difficulty: 'mid',
    batch_size: 10,
    session_length: 20,
    review_ratio: 0.7,
  },
  reason: 'User needs more practice with mid-difficulty words',
};

describe('useNextWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not fetch automatically when enabled is false', async () => {
    mockLearningClient.getNextWords.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams), {
      wrapper: createWrapper(queryClient),
    });

    // 默认enabled为false，不应自动查询
    expect(result.current.isLoading).toBe(false);
    expect(mockLearningClient.getNextWords).not.toHaveBeenCalled();
  });

  it('should fetch when manually triggered', async () => {
    mockLearningClient.getNextWords.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams), {
      wrapper: createWrapper(queryClient),
    });

    // 手动触发
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResult);
    expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(1);
    expect(mockLearningClient.getNextWords).toHaveBeenCalledWith(mockParams);
  });

  it('should fetch when enabled is true', async () => {
    mockLearningClient.getNextWords.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams, { enabled: true }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResult);
    expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(1);
  });

  it('should handle API error', async () => {
    const error = new Error('API Error');
    mockLearningClient.getNextWords.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams, { enabled: true }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should not cache results (staleTime: 0)', async () => {
    mockLearningClient.getNextWords.mockResolvedValue(mockResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams), {
      wrapper: createWrapper(queryClient),
    });

    // 第一次查询
    result.current.refetch();
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(1);

    // 第二次查询应该重新请求
    result.current.refetch();
    await waitFor(() => {
      expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(2);
    });
  });

  it('should not retry on failure', async () => {
    const error = new Error('Network Error');
    mockLearningClient.getNextWords.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams, { enabled: true }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // 应该只调用一次，不重试
    expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(1);
  });

  it('should handle empty words array', async () => {
    const emptyResult = {
      ...mockResult,
      words: [],
    };
    mockLearningClient.getNextWords.mockResolvedValue(emptyResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useNextWords(mockParams, { enabled: true }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.words).toEqual([]);
  });
});

describe('fetchNextWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch next words directly', async () => {
    mockLearningClient.getNextWords.mockResolvedValue(mockResult);

    const result = await fetchNextWords(mockParams);

    expect(result).toEqual(mockResult);
    expect(mockLearningClient.getNextWords).toHaveBeenCalledTimes(1);
    expect(mockLearningClient.getNextWords).toHaveBeenCalledWith(mockParams);
  });

  it('should handle API error', async () => {
    const error = new Error('API Error');
    mockLearningClient.getNextWords.mockRejectedValue(error);

    await expect(fetchNextWords(mockParams)).rejects.toThrow('API Error');
  });
});
