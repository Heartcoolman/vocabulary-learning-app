import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLearningRecords, prefetchLearningRecords } from '../useLearningRecords';
import ApiClient from '../../../services/ApiClient';
import type { AnswerRecord } from '../../../types/models';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getAnswerRecords: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  getAnswerRecords: ReturnType<typeof vi.fn>;
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
const mockRecords: AnswerRecord[] = [
  {
    id: 'record-1',
    wordId: 'word-1',
    selectedAnswer: '答案1',
    correctAnswer: '答案1',
    isCorrect: true,
    timestamp: Date.now() - 1000,
    responseTime: 3000,
    dwellTime: 5000,
    sessionId: 'session-1',
  },
  {
    id: 'record-2',
    wordId: 'word-2',
    selectedAnswer: '答案2',
    correctAnswer: '正确答案2',
    isCorrect: false,
    timestamp: Date.now() - 2000,
    responseTime: 5000,
    dwellTime: 8000,
    sessionId: 'session-1',
  },
];

const mockPagination = {
  page: 1,
  pageSize: 20,
  total: 2,
  totalPages: 1,
};

describe('useLearningRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch learning records successfully', async () => {
    mockApiClient.getAnswerRecords.mockResolvedValue({
      records: mockRecords,
      pagination: mockPagination,
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useLearningRecords(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.records).toEqual(mockRecords);
    expect(result.current.data?.pagination).toEqual(mockPagination);
    expect(mockApiClient.getAnswerRecords).toHaveBeenCalledTimes(1);
  });

  it('should fetch with pagination options', async () => {
    mockApiClient.getAnswerRecords.mockResolvedValue({
      records: mockRecords,
      pagination: { ...mockPagination, page: 2 },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useLearningRecords({ page: 2, pageSize: 10 }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.getAnswerRecords).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
    });
  });

  it('should handle empty records', async () => {
    mockApiClient.getAnswerRecords.mockResolvedValue({
      records: [],
      pagination: { ...mockPagination, total: 0 },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useLearningRecords(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.records).toEqual([]);
    expect(result.current.data?.pagination.total).toBe(0);
  });

  it('should handle API error', async () => {
    const error = new Error('API Error');
    mockApiClient.getAnswerRecords.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useLearningRecords(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });

  it('should support custom query options', async () => {
    mockApiClient.getAnswerRecords.mockResolvedValue({
      records: mockRecords,
      pagination: mockPagination,
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () =>
        useLearningRecords(
          {},
          {
            enabled: false,
          }
        ),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    // 查询不应该自动执行
    expect(result.current.isLoading).toBe(false);
    expect(mockApiClient.getAnswerRecords).not.toHaveBeenCalled();
  });
});

describe('prefetchLearningRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prefetch records data', async () => {
    mockApiClient.getAnswerRecords.mockResolvedValue({
      records: mockRecords,
      pagination: mockPagination,
    });
    const queryClient = createTestQueryClient();

    await prefetchLearningRecords(queryClient, { page: 1, pageSize: 20 });

    expect(mockApiClient.getAnswerRecords).toHaveBeenCalledTimes(1);
    expect(mockApiClient.getAnswerRecords).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });
});
