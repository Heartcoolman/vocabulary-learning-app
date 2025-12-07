import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUserWords } from '../useUserDetail';
import apiClient from '../../../services/ApiClient';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    adminGetUserWords: vi.fn(),
  },
}));

describe('useUserWords', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('应该成功获取用户单词列表', async () => {
    const mockResponse = {
      words: [
        {
          word: {
            id: 'word-1',
            spelling: 'hello',
            phonetic: '/həˈloʊ/',
            meanings: ['你好'],
            examples: ['Hello, world!'],
          },
          score: 85,
          masteryLevel: 3,
          accuracy: 90,
          reviewCount: 10,
          lastReviewDate: '2024-01-15',
          nextReviewDate: '2024-01-20',
          state: 'LEARNING',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    };

    vi.mocked(apiClient.adminGetUserWords).mockResolvedValue(mockResponse);

    const { result } = renderHook(
      () =>
        useUserWords({
          userId: 'user-1',
          page: 1,
          pageSize: 20,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.words).toHaveLength(1);
    expect(result.current.data?.words[0].word.spelling).toBe('hello');
    expect(apiClient.adminGetUserWords).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 20,
      sortBy: 'lastReview',
      sortOrder: 'desc',
    });
  });

  it('应该支持筛选参数', async () => {
    const mockResponse = {
      words: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    };

    vi.mocked(apiClient.adminGetUserWords).mockResolvedValue(mockResponse);

    const { result } = renderHook(
      () =>
        useUserWords({
          userId: 'user-1',
          page: 1,
          pageSize: 20,
          scoreRange: 'high',
          masteryLevel: 3,
          state: 'mastered',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.adminGetUserWords).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 20,
      scoreRange: 'high',
      masteryLevel: 3,
      state: 'mastered',
      sortBy: 'lastReview',
      sortOrder: 'desc',
    });
  });

  it('应该支持排序参数', async () => {
    const mockResponse = {
      words: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    };

    vi.mocked(apiClient.adminGetUserWords).mockResolvedValue(mockResponse);

    const { result } = renderHook(
      () =>
        useUserWords({
          userId: 'user-1',
          page: 1,
          pageSize: 20,
          sortBy: 'score',
          sortOrder: 'asc',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.adminGetUserWords).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 20,
      sortBy: 'score',
      sortOrder: 'asc',
    });
  });

  it('应该在 userId 为空时禁用查询', async () => {
    const { result } = renderHook(
      () =>
        useUserWords({
          userId: '',
          page: 1,
          pageSize: 20,
        }),
      { wrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.adminGetUserWords).not.toHaveBeenCalled();
  });

  it('应该处理分页切换', async () => {
    const mockResponse = {
      words: [],
      pagination: {
        page: 2,
        pageSize: 20,
        total: 100,
        totalPages: 5,
      },
    };

    vi.mocked(apiClient.adminGetUserWords).mockResolvedValue(mockResponse);

    const { result } = renderHook(
      () =>
        useUserWords({
          userId: 'user-1',
          page: 2,
          pageSize: 20,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pagination.page).toBe(2);
    expect(apiClient.adminGetUserWords).toHaveBeenCalledWith('user-1', {
      page: 2,
      pageSize: 20,
      sortBy: 'lastReview',
      sortOrder: 'desc',
    });
  });

  it('应该使用 placeholderData 避免分页闪烁', async () => {
    const mockResponse1 = {
      words: [
        {
          word: {
            id: 'word-1',
            spelling: 'test',
            phonetic: '/test/',
            meanings: ['测试'],
            examples: [],
          },
          score: 85,
          masteryLevel: 3,
          accuracy: 90,
          reviewCount: 10,
          lastReviewDate: '2024-01-15',
          nextReviewDate: '2024-01-20',
          state: 'LEARNING',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 100,
        totalPages: 5,
      },
    };

    vi.mocked(apiClient.adminGetUserWords).mockResolvedValue(mockResponse1);

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useUserWords({
          userId: 'user-1',
          page,
          pageSize: 20,
        }),
      { wrapper, initialProps: { page: 1 } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 第一页数据已加载
    expect(result.current.data?.pagination.page).toBe(1);

    // 切换到第二页
    rerender({ page: 2 });

    // 在新数据加载时，应该显示 placeholderData（即第一页的数据）
    expect(result.current.data?.pagination.page).toBe(1); // 仍然显示旧数据

    // 等待新数据加载
    await waitFor(() => expect(apiClient.adminGetUserWords).toHaveBeenCalledTimes(2));
  });

  it('应该处理加载错误', async () => {
    vi.mocked(apiClient.adminGetUserWords).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(
      () =>
        useUserWords({
          userId: 'user-1',
          page: 1,
          pageSize: 20,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
