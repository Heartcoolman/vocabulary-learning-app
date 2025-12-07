import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useAdjustWords,
  adjustWords,
  shouldAdjustQueue,
} from '../useAdjustWords';
import ApiClient from '../../../services/ApiClient';
import type { AdjustWordsParams, AdjustWordsResponse } from '../../../types/amas';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    adjustLearningWords: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  adjustLearningWords: ReturnType<typeof vi.fn>;
};

// 创建测试用的QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
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
const mockParams: AdjustWordsParams = {
  sessionId: 'session-123',
  currentWordIds: ['word-1', 'word-2', 'word-3'],
  masteredWordIds: ['word-4'],
  userState: {
    fatigue: 0.8,
    attention: 0.4,
    motivation: 0.5,
  },
  recentPerformance: {
    accuracy: 0.4,
    avgResponseTime: 8000,
    consecutiveWrong: 3,
  },
  adjustReason: 'struggling',
};

const mockResponse: AdjustWordsResponse = {
  adjustments: {
    remove: ['word-3'],
    add: [
      {
        id: 'word-5',
        spelling: 'easy',
        phonetic: '/ˈiːzi/',
        meanings: ['容易的'],
        examples: ['This is easy.'],
        difficulty: 0.3,
        isNew: true,
      },
    ],
  },
  targetDifficulty: {
    min: 0.2,
    max: 0.5,
  },
  reason: 'Adjusted to easier words due to struggling performance',
};

describe('useAdjustWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should adjust words successfully', async () => {
    mockApiClient.adjustLearningWords.mockResolvedValue(mockResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isPending).toBe(false);

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledTimes(1);
    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledWith(mockParams);
  });

  it('should handle adjustment error', async () => {
    const error = new Error('Adjustment failed');
    mockApiClient.adjustLearningWords.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords({ retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should call onSuccess callback with adjustment data', async () => {
    mockApiClient.adjustLearningWords.mockResolvedValue(mockResponse);
    const onSuccess = vi.fn();
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords({ onSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Check that onSuccess was called with at least the data and params
    expect(onSuccess.mock.calls[0][0]).toEqual(mockResponse);
    expect(onSuccess.mock.calls[0][1]).toEqual(mockParams);
  });

  it('should call onError callback', async () => {
    const error = new Error('Adjustment failed');
    mockApiClient.adjustLearningWords.mockRejectedValue(error);
    const onError = vi.fn();
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords({ onError, retry: false }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(mockParams);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    // Check that error was called with at least the error and params
    expect(onError.mock.calls[0][0]).toEqual(error);
    expect(onError.mock.calls[0][1]).toEqual(mockParams);
  });

  it('should use mutateAsync', async () => {
    mockApiClient.adjustLearningWords.mockResolvedValue(mockResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords(), {
      wrapper: createWrapper(queryClient),
    });

    const response = await result.current.mutateAsync(mockParams);

    expect(response).toEqual(mockResponse);
    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledTimes(1);
  });

  it('should handle different adjustment reasons', async () => {
    mockApiClient.adjustLearningWords.mockResolvedValue(mockResponse);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAdjustWords(), {
      wrapper: createWrapper(queryClient),
    });

    const reasons: Array<AdjustWordsParams['adjustReason']> = [
      'fatigue',
      'struggling',
      'excelling',
      'periodic',
    ];

    for (const reason of reasons) {
      const params = { ...mockParams, adjustReason: reason };
      await result.current.mutateAsync(params);

      expect(mockApiClient.adjustLearningWords).toHaveBeenCalledWith(params);
    }

    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledTimes(4);
  });
});

describe('adjustWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should adjust words directly', async () => {
    mockApiClient.adjustLearningWords.mockResolvedValue(mockResponse);

    const result = await adjustWords(mockParams);

    expect(result).toEqual(mockResponse);
    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledTimes(1);
    expect(mockApiClient.adjustLearningWords).toHaveBeenCalledWith(mockParams);
  });

  it('should handle API error', async () => {
    const error = new Error('Adjustment failed');
    mockApiClient.adjustLearningWords.mockRejectedValue(error);

    await expect(adjustWords(mockParams)).rejects.toThrow('Adjustment failed');
  });
});

describe('shouldAdjustQueue', () => {
  it('should return true for high fatigue', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.8, attention: 0.7, motivation: 0.7 },
      { accuracy: 0.8, avgResponseTime: 5000, consecutiveWrong: 0 }
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('fatigue');
  });

  it('should return true for low accuracy', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.3, attention: 0.7, motivation: 0.7 },
      { accuracy: 0.4, avgResponseTime: 5000, consecutiveWrong: 0 }
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('struggling');
  });

  it('should return true for consecutive wrong answers', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.3, attention: 0.7, motivation: 0.7 },
      { accuracy: 0.7, avgResponseTime: 5000, consecutiveWrong: 3 }
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('struggling');
  });

  it('should return true for slow response time', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.3, attention: 0.7, motivation: 0.7 },
      { accuracy: 0.7, avgResponseTime: 12000, consecutiveWrong: 0 }
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('struggling');
  });

  it('should return true for excellent performance', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.3, attention: 0.9, motivation: 0.9 },
      { accuracy: 0.95, avgResponseTime: 2500, consecutiveWrong: 0 }
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('excelling');
  });

  it('should return false for normal performance', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.4, attention: 0.7, motivation: 0.7 },
      { accuracy: 0.75, avgResponseTime: 5000, consecutiveWrong: 1 }
    );

    expect(result.shouldAdjust).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('should handle missing user state', () => {
    const result = shouldAdjustQueue(undefined, {
      accuracy: 0.4,
      avgResponseTime: 5000,
      consecutiveWrong: 0,
    });

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('struggling');
  });

  it('should handle missing performance data', () => {
    const result = shouldAdjustQueue(
      { fatigue: 0.8, attention: 0.7, motivation: 0.7 },
      undefined
    );

    expect(result.shouldAdjust).toBe(true);
    expect(result.reason).toBe('fatigue');
  });

  it('should return false when all parameters are missing', () => {
    const result = shouldAdjustQueue(undefined, undefined);

    expect(result.shouldAdjust).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});
