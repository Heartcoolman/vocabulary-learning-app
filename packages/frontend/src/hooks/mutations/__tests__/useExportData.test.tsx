/**
 * useExportData Hook 单元测试
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useExportData, ExportDataParams } from '../useExportData';
import { apiClient } from '../../../services/client';

// Mock API Client
vi.mock('../../../services/client', () => {
  const client = {
    getWords: vi.fn(),
    getRecords: vi.fn(),
    getStudyConfig: vi.fn(),
    getStatistics: vi.fn(),
    getWordBookById: vi.fn(),
    getWordBookWords: vi.fn(),
  };
  return {
    apiClient: client,
    default: client,
  };
});

describe('useExportData', () => {
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

  it('应该成功导出单词数据（JSON格式）', async () => {
    const mockWords = [
      {
        id: '1',
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好', '问候'],
        examples: ['Hello, world!'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (apiClient.getWords as Mock).mockResolvedValue(mockWords);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useExportData({ onSuccess }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'words',
      format: 'json',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalled();
    const exportResult = onSuccess.mock.calls[0][0];
    expect(exportResult.count).toBe(1);
    expect(exportResult.filename).toContain('words-export');
    expect(exportResult.filename).toContain('.json');
  });

  it('应该成功导出单词数据（CSV格式）', async () => {
    const mockWords = [
      {
        id: '1',
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好', '问候'],
        examples: ['Hello, world!'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (apiClient.getWords as Mock).mockResolvedValue(mockWords);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useExportData({ onSuccess }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'words',
      format: 'csv',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalled();
    const exportResult = onSuccess.mock.calls[0][0];
    expect(exportResult.filename).toContain('.csv');
    expect(typeof exportResult.data).toBe('string');
  });

  it('应该成功导出学习记录', async () => {
    const mockRecords = [
      {
        id: '1',
        wordId: 'word-1',
        timestamp: Date.now(),
        selectedAnswer: 'hello',
        correctAnswer: 'hello',
        isCorrect: true,
      },
    ];

    (apiClient.getRecords as Mock).mockResolvedValue({
      records: mockRecords,
      pagination: { page: 1, pageSize: 10000, total: 1, totalPages: 1 },
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useExportData({ onSuccess }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'records',
      format: 'json',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalled();
    const exportResult = onSuccess.mock.calls[0][0];
    expect(exportResult.count).toBe(1);
    expect(exportResult.filename).toContain('records-export');
  });

  it('应该在导出过程中报告进度', async () => {
    const mockWords = [
      {
        id: '1',
        spelling: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: ['你好'],
        examples: ['Hello!'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (apiClient.getWords as Mock).mockResolvedValue(mockWords);

    const onProgress = vi.fn();
    const { result } = renderHook(() => useExportData({ onProgress }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'words',
      format: 'json',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // 应该至少调用一次进度回调
    expect(onProgress).toHaveBeenCalled();
    // 最后一次调用应该是100%
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastCall.progress).toBe(100);
  });

  it('应该在导出失败时调用错误回调', async () => {
    (apiClient.getWords as Mock).mockRejectedValue(new Error('获取数据失败'));

    const onError = vi.fn();
    const { result } = renderHook(() => useExportData({ onError }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'words',
      format: 'json',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalled();
  });

  it('应该支持按日期范围过滤学习记录', async () => {
    const mockRecords = [
      {
        id: '1',
        wordId: 'word-1',
        timestamp: new Date('2024-01-01').getTime(),
        selectedAnswer: 'hello',
        correctAnswer: 'hello',
        isCorrect: true,
      },
      {
        id: '2',
        wordId: 'word-2',
        timestamp: new Date('2024-12-01').getTime(),
        selectedAnswer: 'world',
        correctAnswer: 'world',
        isCorrect: true,
      },
    ];

    (apiClient.getRecords as Mock).mockResolvedValue({
      records: mockRecords,
      pagination: { page: 1, pageSize: 10000, total: 2, totalPages: 1 },
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useExportData({ onSuccess }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'records',
      format: 'json',
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalled();
    const exportResult = onSuccess.mock.calls[0][0];
    // 只有一条记录在日期范围内
    expect(exportResult.count).toBe(1);
  });

  it('应该正确处理CSV格式中的特殊字符', async () => {
    const mockWords = [
      {
        id: '1',
        spelling: 'test',
        phonetic: '/test/',
        meanings: ['测试,含逗号', '测试\n换行'],
        examples: ['Test, "quoted"'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (apiClient.getWords as Mock).mockResolvedValue(mockWords);

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useExportData({ onSuccess }), { wrapper });

    const params: ExportDataParams = {
      dataType: 'words',
      format: 'csv',
    };

    result.current.mutate(params);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalled();
    const exportResult = onSuccess.mock.calls[0][0];
    // CSV应该正确转义特殊字符
    expect(exportResult.data).toContain('"');
  });
});
