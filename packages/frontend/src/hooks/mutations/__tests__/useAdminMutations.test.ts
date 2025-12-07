/**
 * useAdminMutations Hook 测试
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  useCreateSystemWordBook,
  useUpdateSystemWordBook,
  useDeleteSystemWordBook,
  useBatchAddWords,
  useBatchDeleteUsers,
} from '../useAdminMutations';
import apiClient from '../../../services/ApiClient';

// Mock API Client
vi.mock('../../../services/ApiClient', () => ({
  default: {
    adminCreateSystemWordBook: vi.fn(),
    adminUpdateSystemWordBook: vi.fn(),
    adminDeleteSystemWordBook: vi.fn(),
    adminBatchAddWordsToSystemWordBook: vi.fn(),
    adminDeleteUser: vi.fn(),
  },
}));

// 创建测试用的 QueryClient
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });
}

// Wrapper 组件
function createWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
  return Wrapper;
}

describe('useCreateSystemWordBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功创建系统词���', async () => {
    const mockWordBook = {
      id: 'wordbook-1',
      name: 'CET-4',
      description: '大学英语四级词汇',
      type: 'SYSTEM' as const,
      isPublic: true,
      wordCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(apiClient.adminCreateSystemWordBook).mockResolvedValueOnce(mockWordBook);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCreateSystemWordBook(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      name: 'CET-4',
      description: '大学英语四级词汇',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockWordBook);
    expect(apiClient.adminCreateSystemWordBook).toHaveBeenCalledWith({
      name: 'CET-4',
      description: '大学英语四级词汇',
    });
  });

  it('应该处理创建失败的情况', async () => {
    const error = new Error('创建失败');
    vi.mocked(apiClient.adminCreateSystemWordBook).mockRejectedValueOnce(error);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCreateSystemWordBook(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      name: 'CET-4',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeTruthy();
  });
});

describe('useUpdateSystemWordBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功更新系统词库', async () => {
    const mockWordBook = {
      id: 'wordbook-1',
      name: '新名称',
      description: '新描述',
      type: 'SYSTEM' as const,
      isPublic: true,
      wordCount: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(apiClient.adminUpdateSystemWordBook).mockResolvedValueOnce(mockWordBook);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUpdateSystemWordBook(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      id: 'wordbook-1',
      name: '新名称',
      description: '新描述',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockWordBook);
    expect(apiClient.adminUpdateSystemWordBook).toHaveBeenCalledWith('wordbook-1', {
      name: '新名称',
      description: '新描述',
    });
  });
});

describe('useDeleteSystemWordBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功删除系统词库', async () => {
    vi.mocked(apiClient.adminDeleteSystemWordBook).mockResolvedValueOnce(undefined);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useDeleteSystemWordBook(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate('wordbook-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiClient.adminDeleteSystemWordBook).toHaveBeenCalledWith('wordbook-1');
  });
});

describe('useBatchAddWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功批量添加单词', async () => {
    const mockWords = [
      {
        id: 'word-1',
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好'],
        examples: ['Hello, world!'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const mockResult = {
      count: 1,
      words: mockWords,
    };

    vi.mocked(apiClient.adminBatchAddWordsToSystemWordBook).mockResolvedValueOnce(
      mockResult,
    );

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBatchAddWords(), {
      wrapper: createWrapper(queryClient),
    });

    const words = [
      {
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好'],
        examples: ['Hello, world!'],
      },
    ];

    result.current.mutate({
      wordBookId: 'wordbook-1',
      words,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.count).toBe(1);
    expect(apiClient.adminBatchAddWordsToSystemWordBook).toHaveBeenCalledWith(
      'wordbook-1',
      words,
    );
  });
});

describe('useBatchDeleteUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功批量删除用户', async () => {
    vi.mocked(apiClient.adminDeleteUser)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBatchDeleteUsers(), {
      wrapper: createWrapper(queryClient),
    });

    const userIds = ['user-1', 'user-2'];
    result.current.mutate(userIds);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(2);
    expect(result.current.data?.failed).toBe(0);
    expect(result.current.data?.errors).toHaveLength(0);
  });

  it('应该处理部分失败的情况', async () => {
    vi.mocked(apiClient.adminDeleteUser)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('删除失败'));

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBatchDeleteUsers(), {
      wrapper: createWrapper(queryClient),
    });

    const userIds = ['user-1', 'user-2'];
    result.current.mutate(userIds);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(1);
    expect(result.current.data?.failed).toBe(1);
    expect(result.current.data?.errors).toHaveLength(1);
    expect(result.current.data?.errors[0].id).toBe('user-2');
  });

  it('应该处理全部失败的情况', async () => {
    vi.mocked(apiClient.adminDeleteUser)
      .mockRejectedValueOnce(new Error('删除失败'))
      .mockRejectedValueOnce(new Error('删除失败'));

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useBatchDeleteUsers(), {
      wrapper: createWrapper(queryClient),
    });

    const userIds = ['user-1', 'user-2'];
    result.current.mutate(userIds);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(0);
    expect(result.current.data?.failed).toBe(2);
    expect(result.current.data?.errors).toHaveLength(2);
  });
});
