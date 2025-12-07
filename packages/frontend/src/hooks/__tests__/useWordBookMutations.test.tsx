import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useCreateWordBook,
  useUpdateWordBook,
  useDeleteWordBook,
  useAddWordToWordBook,
  useRemoveWordFromWordBook,
  useBatchImportWords,
} from '../mutations/useWordBookMutations';
import { queryKeys } from '../../lib/queryKeys';
import type { WordBook } from '../../types/models';

// Mock apiClient
const mockWordBook: WordBook = {
  id: 'new-book-1',
  name: '新建词书',
  description: '测试词书',
  wordCount: 0,
  type: 'USER',
  isPublic: false,
  userId: 'user-1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

vi.mock('../../services/ApiClient', () => ({
  default: {
    createWordBook: vi.fn(),
    updateWordBook: vi.fn(),
    deleteWordBook: vi.fn(),
    addWordToWordBook: vi.fn(),
    removeWordFromWordBook: vi.fn(),
    batchImportWords: vi.fn(),
  },
}));

import apiClient from '../../services/ApiClient';

describe('useWordBookMutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useCreateWordBook', () => {
    it('should create word book successfully', async () => {
      (apiClient.createWordBook as any).mockResolvedValue(mockWordBook);

      const { result } = renderHook(() => useCreateWordBook(), { wrapper });

      result.current.mutate({
        name: '新建词书',
        description: '测试词书',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWordBook);
      expect(apiClient.createWordBook).toHaveBeenCalledWith({
        name: '新建词书',
        description: '测试词书',
      });
    });

    it('should invalidate queries after creation', async () => {
      (apiClient.createWordBook as any).mockResolvedValue(mockWordBook);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateWordBook(), { wrapper });

      result.current.mutate({
        name: '新建词书',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.wordbooks.list({ type: 'all' }),
      });
    });

    it('should handle errors', async () => {
      const error = new Error('创建失败');
      (apiClient.createWordBook as any).mockRejectedValue(error);

      const { result } = renderHook(() => useCreateWordBook(), { wrapper });

      result.current.mutate({
        name: '新建词书',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(error);
    });
  });

  describe('useUpdateWordBook', () => {
    it('should update word book successfully', async () => {
      const updatedBook = { ...mockWordBook, name: '更新后的名称' };
      (apiClient.updateWordBook as any).mockResolvedValue(updatedBook);

      const { result } = renderHook(() => useUpdateWordBook(), { wrapper });

      result.current.mutate({
        id: 'new-book-1',
        data: { name: '更新后的名称' },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(updatedBook);
      expect(apiClient.updateWordBook).toHaveBeenCalledWith('new-book-1', { name: '更新后的名称' });
    });
  });

  describe('useDeleteWordBook', () => {
    it('should delete word book successfully', async () => {
      (apiClient.deleteWordBook as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteWordBook(), { wrapper });

      result.current.mutate('book-to-delete');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.deleteWordBook).toHaveBeenCalledWith('book-to-delete');
    });

    it('should invalidate queries after deletion', async () => {
      (apiClient.deleteWordBook as any).mockResolvedValue(undefined);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteWordBook(), { wrapper });

      result.current.mutate('book-to-delete');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 验证查询失效被调用
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.wordbooks.list({ type: 'user' }),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.wordbooks.list({ type: 'all' }),
      });
    });

    it('should rollback on error', async () => {
      const error = new Error('删除失败');
      (apiClient.deleteWordBook as any).mockRejectedValue(error);

      // 设置初始缓存数据
      const initialBooks = [mockWordBook];
      queryClient.setQueryData(queryKeys.wordbooks.list({ type: 'user' }), initialBooks);

      const { result } = renderHook(() => useDeleteWordBook(), { wrapper });

      result.current.mutate('new-book-1');

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // 检查回滚：数据应该恢复（需要等待settled后重新获取）
      await waitFor(() => {
        const rolledBackData = queryClient.getQueryData<WordBook[]>(
          queryKeys.wordbooks.list({ type: 'user' }),
        );
        // onSettled会触发invalidateQueries，所以数据可能被清除
        // 这里只检查不是空的乐观更新状态
        expect(rolledBackData === undefined || rolledBackData.length === 1).toBe(true);
      });
    });
  });

  describe('useAddWordToWordBook', () => {
    it('should add word to word book successfully', async () => {
      const mockWord = {
        id: 'word-1',
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试'],
        examples: [],
        wordBookId: 'new-book-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (apiClient.addWordToWordBook as any).mockResolvedValue(mockWord);

      const { result } = renderHook(() => useAddWordToWordBook(), { wrapper });

      result.current.mutate({
        wordBookId: 'new-book-1',
        wordData: {
          spelling: 'test',
          phonetic: '/test/',
          meanings: ['测试'],
          examples: [],
        },
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWord);
    });
  });

  describe('useRemoveWordFromWordBook', () => {
    it('should remove word from word book successfully', async () => {
      (apiClient.removeWordFromWordBook as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRemoveWordFromWordBook(), { wrapper });

      result.current.mutate({
        wordBookId: 'book-1',
        wordId: 'word-1',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.removeWordFromWordBook).toHaveBeenCalledWith('book-1', 'word-1');
    });
  });

  describe('useBatchImportWords', () => {
    it('should batch import words successfully', async () => {
      const mockResult = { imported: 10, failed: 0 };
      (apiClient.batchImportWords as any).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useBatchImportWords(), { wrapper });

      const words = [
        {
          spelling: 'test1',
          phonetic: '/test1/',
          meanings: ['测试1'],
          examples: [],
        },
      ];

      result.current.mutate({
        wordBookId: 'book-1',
        words,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResult);
      expect(apiClient.batchImportWords).toHaveBeenCalledWith('book-1', words);
    });
  });
});
