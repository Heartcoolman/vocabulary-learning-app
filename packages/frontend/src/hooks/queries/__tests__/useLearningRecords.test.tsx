import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLearningRecords, prefetchLearningRecords } from '../useLearningRecords';
import { learningClient } from '../../../services/client';
import type { AnswerRecord } from '../../../types/models';

// Mock learningClient
vi.mock('../../../services/client', () => ({
  learningClient: {
    getRecords: vi.fn(),
  },
}));

const mockLearningClient = learningClient as unknown as {
  getRecords: ReturnType<typeof vi.fn>;
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
    userId: 'user-1',
    wordId: 'word-1',
    selectedAnswer: '答案1',
    correctAnswer: '答案1',
    isCorrect: true,
    timestamp: Date.now() - 1000,
    responseTime: 3000,
    dwellTime: 5000,
    sessionId: 'session-1',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
  },
  {
    id: 'record-2',
    userId: 'user-1',
    wordId: 'word-2',
    selectedAnswer: '答案2',
    correctAnswer: '正确答案2',
    isCorrect: false,
    timestamp: Date.now() - 2000,
    responseTime: 5000,
    dwellTime: 8000,
    sessionId: 'session-1',
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 2000,
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
    mockLearningClient.getRecords.mockResolvedValue({
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
    expect(mockLearningClient.getRecords).toHaveBeenCalledTimes(1);
  });

  it('should fetch with pagination options', async () => {
    mockLearningClient.getRecords.mockResolvedValue({
      records: mockRecords,
      pagination: { ...mockPagination, page: 2 },
    });
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useLearningRecords({ page: 2, pageSize: 10 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockLearningClient.getRecords).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
    });
  });

  it('should handle empty records', async () => {
    mockLearningClient.getRecords.mockResolvedValue({
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
    mockLearningClient.getRecords.mockRejectedValue(error);
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
    mockLearningClient.getRecords.mockResolvedValue({
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
          },
        ),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    // 查询不应该自动执行
    expect(result.current.isLoading).toBe(false);
    expect(mockLearningClient.getRecords).not.toHaveBeenCalled();
  });
});

describe('prefetchLearningRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should prefetch records data', async () => {
    mockLearningClient.getRecords.mockResolvedValue({
      records: mockRecords,
      pagination: mockPagination,
    });
    const queryClient = createTestQueryClient();

    await prefetchLearningRecords(queryClient, { page: 1, pageSize: 20 });

    expect(mockLearningClient.getRecords).toHaveBeenCalledTimes(1);
    expect(mockLearningClient.getRecords).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });
});
