/**
 * useWordMutations Hook 测试
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  useCreateWord,
  useUpdateWord,
  useDeleteWord,
  useBatchCreateWords,
  useWordMutations,
} from '../useWordMutations';
import { wordService } from '../../../services/word.service';

// Mock wordService
vi.mock('../../../services/word.service', () => ({
  wordService: {
    createWord: vi.fn(),
    updateWord: vi.fn(),
    deleteWord: vi.fn(),
    batchCreateWords: vi.fn(),
  },
}));

// 创建 React Query 测试包装器
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useCreateWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功创建单词', async () => {
    const mockWord = {
      id: '1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.createWord).mockResolvedValue({
      data: mockWord,
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useCreateWord({ onSuccess }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: ['This is a test.'],
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(wordService.createWord).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(mockWord);
  });

  it('应该处理创建错误', async () => {
    const errorMessage = '创建失败';
    vi.mocked(wordService.createWord).mockRejectedValue(new Error(errorMessage));

    const onError = vi.fn();
    const { result } = renderHook(() => useCreateWord({ onError }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: ['This is a test.'],
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('useUpdateWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功更新单词', async () => {
    const mockWord = {
      id: '1',
      spelling: 'updated',
      phonetic: '/updated/',
      meanings: ['已更新'],
      examples: ['Updated example.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.updateWord).mockResolvedValue({
      data: mockWord,
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useUpdateWord({ onSuccess }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({
        id: '1',
        data: {
          spelling: 'updated',
          meanings: ['已更新'],
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(wordService.updateWord).toHaveBeenCalledWith('1', {
      spelling: 'updated',
      meanings: ['已更新'],
    });
    expect(onSuccess).toHaveBeenCalledWith(mockWord);
  });
});

describe('useDeleteWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功删除单词', async () => {
    vi.mocked(wordService.deleteWord).mockResolvedValue(undefined);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeleteWord({ onSuccess }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate('1');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(wordService.deleteWord).toHaveBeenCalledWith('1');
    expect(onSuccess).toHaveBeenCalledWith('1');
  });

  it('应该处理删除错误', async () => {
    const errorMessage = '删除失败';
    vi.mocked(wordService.deleteWord).mockRejectedValue(new Error(errorMessage));

    const onError = vi.fn();
    const { result } = renderHook(() => useDeleteWord({ onError }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate('1');
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('useBatchCreateWords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功批量创建单词', async () => {
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

    vi.mocked(wordService.batchCreateWords).mockResolvedValue({
      data: mockWords,
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBatchCreateWords({ onSuccess }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate([
        {
          spelling: 'test1',
          phonetic: '/test1/',
          meanings: ['测试1'],
          examples: ['Test 1'],
        },
        {
          spelling: 'test2',
          phonetic: '/test2/',
          meanings: ['测试2'],
          examples: ['Test 2'],
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(wordService.batchCreateWords).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(mockWords);
  });
});

describe('useWordMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该提供所有 CRUD 操作', async () => {
    const mockWord = {
      id: '1',
      spelling: 'test',
      phonetic: '/test/',
      meanings: ['测试'],
      examples: ['This is a test.'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(wordService.createWord).mockResolvedValue({ data: mockWord });
    vi.mocked(wordService.updateWord).mockResolvedValue({ data: mockWord });
    vi.mocked(wordService.deleteWord).mockResolvedValue(undefined);

    const { result } = renderHook(() => useWordMutations(), {
      wrapper: createWrapper(),
    });

    expect(result.current.createWord).toBeDefined();
    expect(result.current.updateWord).toBeDefined();
    expect(result.current.deleteWord).toBeDefined();
    expect(result.current.batchCreate).toBeDefined();
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.isAnyPending).toBe(false);
  });

  it('应该正确跟踪加载状态', async () => {
    vi.mocked(wordService.createWord).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} as any }), 100)),
    );

    const { result } = renderHook(() => useWordMutations(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.createWord({
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: ['This is a test.'],
      });
    });

    // 应该立即进入加载状态
    expect(result.current.isCreating).toBe(true);
    expect(result.current.isAnyPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isCreating).toBe(false);
    });

    expect(result.current.isAnyPending).toBe(false);
  });
});
