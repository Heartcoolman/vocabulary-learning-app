/**
 * useExportHistory Hook 单元测试
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useExportHistory,
  useExportStatistics,
  addExportHistory,
  clearExportHistory,
  deleteExportHistoryItem,
} from '../useExportHistory';

describe('useExportHistory', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    // 清空 localStorage
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useExportHistory', () => {
    it('应该在没有历史记录时返回空数组', async () => {
      const { result } = renderHook(() => useExportHistory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('应该正确读取导出历史', async () => {
      // 添加一些测试数据
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'words-export.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportHistory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].dataType).toBe('words');
    });

    it('应该支持按类型过滤', async () => {
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'words-export.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
        {
          id: 'export-2',
          dataType: 'records' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'records-export.json',
          count: 20,
          size: 200,
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportHistory({ dataType: 'words' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].dataType).toBe('words');
    });

    it('应该支持限制返回数量', async () => {
      const mockHistory = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `export-${i}`,
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: `export-${i}.json`,
          count: 10,
          size: 100,
          timestamp: Date.now() - i * 1000,
        }));

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportHistory({ limit: 5 }), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(5);
    });

    it('应该按时间倒序排序', async () => {
      const now = Date.now();
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'old.json',
          count: 10,
          size: 100,
          timestamp: now - 1000,
        },
        {
          id: 'export-2',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'new.json',
          count: 10,
          size: 100,
          timestamp: now,
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportHistory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.[0].filename).toBe('new.json');
      expect(result.current.data?.[1].filename).toBe('old.json');
    });
  });

  describe('useExportStatistics', () => {
    it('应该在没有历史记录时返回零统计', async () => {
      const { result } = renderHook(() => useExportStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.totalExports).toBe(0);
      expect(result.current.data?.successCount).toBe(0);
      expect(result.current.data?.failedCount).toBe(0);
    });

    it('应该正确计算统计信息', async () => {
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'export1.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
        {
          id: 'export-2',
          dataType: 'records' as const,
          format: 'csv' as const,
          status: 'failed' as const,
          data: '{}',
          filename: 'export2.csv',
          count: 20,
          size: 200,
          timestamp: Date.now(),
          error: '导出失败',
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.totalExports).toBe(2);
      expect(result.current.data?.successCount).toBe(1);
      expect(result.current.data?.failedCount).toBe(1);
      expect(result.current.data?.totalRecords).toBe(30);
    });

    it('应该按类型分组统计', async () => {
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'export1.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
        {
          id: 'export-2',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'export2.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
        {
          id: 'export-3',
          dataType: 'records' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'export3.json',
          count: 20,
          size: 200,
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.byType.words).toBe(2);
      expect(result.current.data?.byType.records).toBe(1);
    });

    it('应该按格式分组统计', async () => {
      const mockHistory = [
        {
          id: 'export-1',
          dataType: 'words' as const,
          format: 'json' as const,
          status: 'success' as const,
          data: '{}',
          filename: 'export1.json',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
        {
          id: 'export-2',
          dataType: 'words' as const,
          format: 'csv' as const,
          status: 'success' as const,
          data: '',
          filename: 'export2.csv',
          count: 10,
          size: 100,
          timestamp: Date.now(),
        },
      ];

      localStorage.setItem('export-history', JSON.stringify(mockHistory));

      const { result } = renderHook(() => useExportStatistics(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.byFormat.json).toBe(1);
      expect(result.current.data?.byFormat.csv).toBe(1);
    });
  });

  describe('工具函数', () => {
    it('addExportHistory 应该添加新记录', () => {
      addExportHistory({
        dataType: 'words',
        format: 'json',
        status: 'success',
        data: '{}',
        filename: 'test.json',
        count: 10,
        size: 100,
        timestamp: Date.now(),
      });

      const stored = localStorage.getItem('export-history');
      expect(stored).not.toBeNull();

      const history = JSON.parse(stored!);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBeDefined();
    });

    it('clearExportHistory 应该清空历史记录', () => {
      addExportHistory({
        dataType: 'words',
        format: 'json',
        status: 'success',
        data: '{}',
        filename: 'test.json',
        count: 10,
        size: 100,
        timestamp: Date.now(),
      });

      clearExportHistory();

      const stored = localStorage.getItem('export-history');
      expect(stored).toBeNull();
    });

    it('deleteExportHistoryItem 应该删除指定记录', () => {
      addExportHistory({
        dataType: 'words',
        format: 'json',
        status: 'success',
        data: '{}',
        filename: 'test.json',
        count: 10,
        size: 100,
        timestamp: Date.now(),
      });

      const stored = localStorage.getItem('export-history');
      const history = JSON.parse(stored!);
      const id = history[0].id;

      const result = deleteExportHistoryItem(id);
      expect(result).toBe(true);

      const updatedStored = localStorage.getItem('export-history');
      const updatedHistory = JSON.parse(updatedStored!);
      expect(updatedHistory).toHaveLength(0);
    });

    it('deleteExportHistoryItem 在记录不存在时应返回false', () => {
      const result = deleteExportHistoryItem('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
