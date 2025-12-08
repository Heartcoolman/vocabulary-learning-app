/**
 * useWordDetail Hook 测试
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWordDetail, useWordDetails } from '../useWordDetail';
import { wordService } from '../../../services/word.service';

// Mock wordService
vi.mock('../../../services/word.service', () => ({
  wordService: {
    getWordById: vi.fn(),
  },
}));

// 创建 React Query 测试包装器
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useWordDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该在 ID 存在时获取单词详情', async () => {
    const mockWord = {
      id: '1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.getWordById).mockResolvedValue({
      data: mockWord,
    });

    const { result } = renderHook(() => useWordDetail({ id: '1' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.word).toEqual(mockWord);
    expect(result.current.isSuccess).toBe(true);
    expect(wordService.getWordById).toHaveBeenCalledWith('1');
  });

  it('应该在 ID 为空时不触发查询', async () => {
    const { result } = renderHook(() => useWordDetail({ id: '' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(wordService.getWordById).not.toHaveBeenCalled();
  });

  it('应该在 enabled=false 时不触发查询', async () => {
    const { result } = renderHook(() => useWordDetail({ id: '1', enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(wordService.getWordById).not.toHaveBeenCalled();
  });

  it('应该处理获取错误', async () => {
    const errorMessage = '单词不存在';
    vi.mocked(wordService.getWordById).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useWordDetail({ id: '1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe(errorMessage);
    expect(result.current.word).toBeUndefined();
  });

  it('应该支持手动刷新', async () => {
    const mockWord = {
      id: '1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.getWordById).mockResolvedValue({
      data: mockWord,
    });

    const { result } = renderHook(() => useWordDetail({ id: '1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(wordService.getWordById).toHaveBeenCalledTimes(1);

    // 手动刷新
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    expect(wordService.getWordById).toHaveBeenCalledTimes(2);
  });

  it('应该尊重 staleTime 配置', async () => {
    const mockWord = {
      id: '1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.getWordById).mockResolvedValue({
      data: mockWord,
    });

    const { result } = renderHook(
      () =>
        useWordDetail({
          id: '1',
          staleTime: 60000, // 1 分钟
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.word).toEqual(mockWord);
    expect(wordService.getWordById).toHaveBeenCalledTimes(1);
  });
});

describe('useWordDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该批量获取多个单词详情', async () => {
    const mockWords = [
      {
        id: '1',
        spelling: 'test1',
        phonetic: '/test1/',
        meanings: ['测试1'],
        examples: ['Test 1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: '2',
        spelling: 'test2',
        phonetic: '/test2/',
        meanings: ['测试2'],
        examples: ['Test 2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    vi.mocked(wordService.getWordById)
      .mockResolvedValueOnce({ data: mockWords[0] })
      .mockResolvedValueOnce({ data: mockWords[1] });

    const { result } = renderHook(() => useWordDetails(['1', '2']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.every((r) => !r.isLoading)).toBe(true);
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].word).toEqual(mockWords[0]);
    expect(result.current[1].word).toEqual(mockWords[1]);
  });

  it('应该处理空数组', () => {
    const { result } = renderHook(() => useWordDetails([]), {
      wrapper: createWrapper(),
    });

    expect(result.current).toEqual([]);
  });
});
