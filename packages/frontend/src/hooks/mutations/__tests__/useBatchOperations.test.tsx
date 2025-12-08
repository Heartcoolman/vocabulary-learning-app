/**
 * useBatchOperations Hook 单元测试
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBatchImport, useBatchDelete, useBatchCreateRecords } from '../useBatchOperations';
import { wordClient, learningClient } from '../../../services/client';

// Mock API Client
vi.mock('../../../services/client', () => ({
  wordClient: {
    batchImportWords: vi.fn(),
    deleteWord: vi.fn(),
  },
  learningClient: {
    batchCreateRecords: vi.fn(),
  },
}));

describe('useBatchOperations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useBatchImport', () => {
    it('应该成功批量导入单词', async () => {
      const mockResult = {
        imported: 10,
        failed: 0,
        errors: [],
      };

      vi.mocked(wordClient.batchImportWords).mockResolvedValue(mockResult);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useBatchImport({ onSuccess }), { wrapper });

      const words = Array(10)
        .fill(null)
        .map((_, i) => ({
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: ['测试'],
          examples: ['example'],
        }));

      result.current.mutate({
        wordBookId: 'book-1',
        words,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(wordClient.batchImportWords).toHaveBeenCalledWith('book-1', words);
      expect(onSuccess).toHaveBeenCalled();
      const importResult = onSuccess.mock.calls[0][0];
      expect(importResult.imported).toBe(10);
      expect(importResult.failed).toBe(0);
    });

    it('应该报告导入进度', async () => {
      const mockResult = {
        imported: 5,
        failed: 0,
        errors: [],
      };

      vi.mocked(wordClient.batchImportWords).mockResolvedValue(mockResult);

      const onProgress = vi.fn();
      const { result } = renderHook(() => useBatchImport({ onProgress }), { wrapper });

      const words = Array(5)
        .fill(null)
        .map((_, i) => ({
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: ['测试'],
          examples: ['example'],
        }));

      result.current.mutate({
        wordBookId: 'book-1',
        words,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 应该至少调用两次进度回调（开始和结束）
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);

      // 第一次应该是0%
      expect(onProgress.mock.calls[0][0].progress).toBe(0);
      // 最后一次应该是100%
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.progress).toBe(100);
    });

    it('应该处理导入错误', async () => {
      const mockResult = {
        imported: 5,
        failed: 5,
        errors: ['错误1', '错误2', '错误3', '错误4', '错误5'],
      };

      vi.mocked(wordClient.batchImportWords).mockResolvedValue(mockResult);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useBatchImport({ onSuccess }), { wrapper });

      const words = Array(10)
        .fill(null)
        .map((_, i) => ({
          spelling: `word${i}`,
          phonetic: `/word${i}/`,
          meanings: ['测试'],
          examples: ['example'],
        }));

      result.current.mutate({
        wordBookId: 'book-1',
        words,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(onSuccess).toHaveBeenCalled();
      const importResult = onSuccess.mock.calls[0][0];
      expect(importResult.failed).toBe(5);
      expect(importResult.errors.length).toBe(5);
    });

    it('应该在API调用失败时触发错误回调', async () => {
      vi.mocked(wordClient.batchImportWords).mockRejectedValue(new Error('网络错误'));

      const onError = vi.fn();
      const { result } = renderHook(() => useBatchImport({ onError }), { wrapper });

      const words = [
        {
          spelling: 'word1',
          phonetic: '/word1/',
          meanings: ['测试'],
          examples: ['example'],
        },
      ];

      result.current.mutate({
        wordBookId: 'book-1',
        words,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('useBatchDelete', () => {
    it('应该成功批量删除单词', async () => {
      vi.mocked(wordClient.deleteWord).mockResolvedValue(undefined);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useBatchDelete({ onSuccess }), { wrapper });

      const wordIds = ['word1', 'word2', 'word3'];

      result.current.mutate({ wordIds });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(wordClient.deleteWord).toHaveBeenCalledTimes(3);
      expect(onSuccess).toHaveBeenCalled();
      const deleteResult = onSuccess.mock.calls[0][0];
      expect(deleteResult.deleted).toBe(3);
      expect(deleteResult.failed).toBe(0);
    });

    it('应该处理部分删除失败', async () => {
      vi.mocked(wordClient.deleteWord)
        .mockResolvedValueOnce(undefined) // 第一个成功
        .mockRejectedValueOnce(new Error('删除失败')) // 第二个失败
        .mockResolvedValueOnce(undefined); // 第三个成功

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useBatchDelete({ onSuccess }), { wrapper });

      const wordIds = ['word1', 'word2', 'word3'];

      result.current.mutate({ wordIds, batchSize: 1 });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(onSuccess).toHaveBeenCalled();
      const deleteResult = onSuccess.mock.calls[0][0];
      expect(deleteResult.deleted).toBe(2);
      expect(deleteResult.failed).toBe(1);
      expect(deleteResult.errors.length).toBe(1);
    });
  });

  describe('useBatchCreateRecords', () => {
    it('应该成功批量创建学习记录', async () => {
      const mockRecords = [
        {
          id: '1',
          userId: 'user-1',
          wordId: 'word-1',
          timestamp: Date.now(),
          selectedAnswer: 'hello',
          correctAnswer: 'hello',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      vi.mocked(learningClient.batchCreateRecords).mockResolvedValue(mockRecords as any);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useBatchCreateRecords({ onSuccess }), { wrapper });

      const records = [
        {
          userId: 'user-1',
          wordId: 'word-1',
          timestamp: Date.now(),
          selectedAnswer: 'hello',
          correctAnswer: 'hello',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      result.current.mutate({ records });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(learningClient.batchCreateRecords).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
      const createResult = onSuccess.mock.calls[0][0];
      expect(createResult.created).toBe(1);
      expect(createResult.failed).toBe(0);
    });

    it('应该支持分批处理', async () => {
      const mockBatch1 = [
        {
          id: '1',
          userId: 'user-1',
          wordId: 'word-1',
          timestamp: Date.now(),
          selectedAnswer: 'hello',
          correctAnswer: 'hello',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const mockBatch2 = [
        {
          id: '2',
          userId: 'user-1',
          wordId: 'word-2',
          timestamp: Date.now(),
          selectedAnswer: 'world',
          correctAnswer: 'world',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      vi.mocked(learningClient.batchCreateRecords)
        .mockResolvedValueOnce(mockBatch1 as any)
        .mockResolvedValueOnce(mockBatch2 as any);

      const onProgress = vi.fn();
      const { result } = renderHook(() => useBatchCreateRecords({ onProgress }), { wrapper });

      const records = [
        {
          userId: 'user-1',
          wordId: 'word-1',
          timestamp: Date.now(),
          selectedAnswer: 'hello',
          correctAnswer: 'hello',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          userId: 'user-1',
          wordId: 'word-2',
          timestamp: Date.now(),
          selectedAnswer: 'world',
          correctAnswer: 'world',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      result.current.mutate({ records, batchSize: 1 });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // 应该调用两次API（每批一次）
      expect(learningClient.batchCreateRecords).toHaveBeenCalledTimes(2);
      // 应该报告进度
      expect(onProgress).toHaveBeenCalled();
    });
  });
});
