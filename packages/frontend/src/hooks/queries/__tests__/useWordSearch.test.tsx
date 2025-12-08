/**
 * useWordSearch Hook 测试
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWordSearch } from '../useWordSearch';
import { wordService, type SearchWordResult } from '../../../services/word.service';

// Mock wordService
vi.mock('../../../services/word.service', () => ({
  wordService: {
    searchWords: vi.fn(),
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

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useWordSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该在查询词为空时不触发搜索', async () => {
    const { result } = renderHook(() => useWordSearch({ query: '' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(wordService.searchWords).not.toHaveBeenCalled();
  });

  it('应该对搜索词进行防抖处理', async () => {
    vi.mocked(wordService.searchWords).mockResolvedValue({
      data: [
        {
          id: '1',
          spelling: 'hello',
          phonetic: '/həˈloʊ/',
          meanings: ['你好'],
          examples: ['Hello, world!'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ] as SearchWordResult[],
    });

    const { result, rerender } = renderHook(
      ({ query }) => useWordSearch({ query, debounceMs: 100 }),
      {
        wrapper: createWrapper(),
        initialProps: { query: '' },
      },
    );

    // 快速连续修改搜索词
    rerender({ query: 'h' });
    rerender({ query: 'he' });
    rerender({ query: 'hel' });
    rerender({ query: 'hello' });

    // 等待防抖延迟
    await waitFor(
      () => {
        expect(result.current.debouncedQuery).toBe('hello');
      },
      { timeout: 200 },
    );

    // 等待查询完成
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 1000 },
    );

    // 应该只调用一次 API
    expect(wordService.searchWords).toHaveBeenCalledTimes(1);
    expect(wordService.searchWords).toHaveBeenCalledWith('hello', 20);
  });

  it('应该返回搜索结果', async () => {
    const mockResults: SearchWordResult[] = [
      {
        id: '1',
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: ['This is a test.'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    vi.mocked(wordService.searchWords).mockResolvedValue({
      data: mockResults,
    });

    const { result } = renderHook(() => useWordSearch({ query: 'test', debounceMs: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results).toEqual(mockResults);
    expect(result.current.hasResults).toBe(true);
  });

  it('应该处理搜索错误', async () => {
    const errorMessage = '搜索失败';
    vi.mocked(wordService.searchWords).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useWordSearch({ query: 'test', debounceMs: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toBe(errorMessage);
    expect(result.current.results).toEqual([]);
  });

  it('应该尊重最小搜索长度限制', async () => {
    const { result, rerender } = renderHook(
      ({ query }) => useWordSearch({ query, minSearchLength: 3 }),
      {
        wrapper: createWrapper(),
        initialProps: { query: '' },
      },
    );

    // 搜索词长度小于 3
    rerender({ query: 'ab' });

    await waitFor(() => {
      expect(result.current.debouncedQuery).toBe('ab');
    });

    expect(wordService.searchWords).not.toHaveBeenCalled();

    // 搜索词长度大于等于 3
    vi.mocked(wordService.searchWords).mockResolvedValue({ data: [] });
    rerender({ query: 'abc' });

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 1000 },
    );

    expect(wordService.searchWords).toHaveBeenCalled();
  });

  it('应该支持自定义 limit 参数', async () => {
    vi.mocked(wordService.searchWords).mockResolvedValue({ data: [] });

    const { result } = renderHook(
      () =>
        useWordSearch({
          query: 'test',
          limit: 50,
          debounceMs: 0,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(wordService.searchWords).toHaveBeenCalledWith('test', 50);
  });

  it('应该在 enabled=false 时不触发搜索', async () => {
    const { result } = renderHook(
      () =>
        useWordSearch({
          query: 'test',
          enabled: false,
          debounceMs: 0,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(wordService.searchWords).not.toHaveBeenCalled();
  });
});
