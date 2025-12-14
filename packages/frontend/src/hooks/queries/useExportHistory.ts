/**
 * useExportHistory - 导出历史 Query Hook
 *
 * 功能：
 * - 查询导出历史记录
 * - 缓存导出历史
 * - 支持分页和过滤
 * - 提供导出统计信息
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import type { ExportDataResult } from '../mutations/useExportData';
import { storageLogger } from '../../utils/logger';
import { env } from '../../config/env';

/**
 * 导出历史项
 */
export interface ExportHistoryItem extends ExportDataResult {
  /** 导出ID */
  id: string;
  /** 导出类型 */
  dataType: 'words' | 'records' | 'progress' | 'all';
  /** 导出格式 */
  format: 'json' | 'csv';
  /** 导出状态 */
  status: 'success' | 'failed' | 'pending';
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 导出统计信息
 */
export interface ExportStatistics {
  /** 总导出次数 */
  totalExports: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failedCount: number;
  /** 总导出记录数 */
  totalRecords: number;
  /** 最后导出时间 */
  lastExportTime?: number;
  /** 按类型分组的统计 */
  byType: Record<string, number>;
  /** 按格式分组的统计 */
  byFormat: Record<string, number>;
}

/**
 * 查询导出历史的 Hook
 *
 * @example
 * ```tsx
 * function ExportHistoryList() {
 *   const { data: history, isLoading } = useExportHistory({
 *     limit: 10,
 *   });
 *
 *   if (isLoading) return <div>加载中...</div>;
 *
 *   return (
 *     <ul>
 *       {history?.map(item => (
 *         <li key={item.id}>
 *           {item.filename} - {item.count} 条记录
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useExportHistory(options?: {
  /** 限制返回数量 */
  limit?: number;
  /** 按数据类型过滤 */
  dataType?: 'words' | 'records' | 'progress' | 'all';
  /** 是否启用查询 */
  enabled?: boolean;
}) {
  const { limit = 20, dataType, enabled = true } = options || {};

  const loadFromServer = async (): Promise<ExportHistoryItem[]> => {
    const search = new URLSearchParams();
    search.append('limit', limit.toString());
    if (dataType) search.append('dataType', dataType);

    const response = await fetch(`${env.apiUrl}/api/admin/export/history?${search.toString()}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`远程导出历史获取失败: ${response.status}`);
    }

    const result = await response.json();
    if (Array.isArray(result?.data)) {
      return result.data as ExportHistoryItem[];
    }

    return [];
  };

  return useQuery({
    queryKey: queryKeys.export.history({ limit, dataType }),
    queryFn: async (): Promise<ExportHistoryItem[]> => {
      // 优先尝试后端导出历史，失败则回退本地
      try {
        const remote = await loadFromServer();
        if (remote.length > 0) {
          return remote.slice(0, limit);
        }
      } catch (error) {
        storageLogger.warn({ err: error }, '后端导出历史获取失败，回退本地缓存');
      }

      // 从本地缓存获取导出历史
      // 注意：这里使用前端缓存，因为导出历史通常不需要同步到后端
      const storageKey = 'export-history';
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        return [];
      }

      try {
        const history: ExportHistoryItem[] = JSON.parse(stored);

        // 按时间倒序排序
        const sorted = history.sort((a, b) => b.timestamp - a.timestamp);

        // 应用过滤
        let filtered = sorted;
        if (dataType) {
          filtered = sorted.filter((item) => item.dataType === dataType);
        }

        // 应用限制
        return filtered.slice(0, limit);
      } catch (error) {
        storageLogger.error({ err: error }, '解析导出历史失败');
        return [];
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 30 * 60 * 1000, // 30分钟 (原cacheTime)
  });
}

/**
 * 查询导出统计信息的 Hook
 *
 * @example
 * ```tsx
 * function ExportStats() {
 *   const { data: stats } = useExportStatistics();
 *
 *   return (
 *     <div>
 *       <p>总导出次数: {stats?.totalExports}</p>
 *       <p>成功: {stats?.successCount}</p>
 *       <p>失败: {stats?.failedCount}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useExportStatistics(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {};

  return useQuery({
    queryKey: queryKeys.export.statistics(),
    queryFn: async (): Promise<ExportStatistics> => {
      const storageKey = 'export-history';
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        return {
          totalExports: 0,
          successCount: 0,
          failedCount: 0,
          totalRecords: 0,
          byType: {},
          byFormat: {},
        };
      }

      try {
        const history: ExportHistoryItem[] = JSON.parse(stored);

        const stats: ExportStatistics = {
          totalExports: history.length,
          successCount: history.filter((h) => h.status === 'success').length,
          failedCount: history.filter((h) => h.status === 'failed').length,
          totalRecords: history.reduce((sum, h) => sum + h.count, 0),
          lastExportTime:
            history.length > 0 ? Math.max(...history.map((h) => h.timestamp)) : undefined,
          byType: {},
          byFormat: {},
        };

        // 按类型统计
        history.forEach((item) => {
          stats.byType[item.dataType] = (stats.byType[item.dataType] || 0) + 1;
        });

        // 按格式统计
        history.forEach((item) => {
          stats.byFormat[item.format] = (stats.byFormat[item.format] || 0) + 1;
        });

        return stats;
      } catch (error) {
        storageLogger.error({ err: error }, '解析导出统计失败');
        return {
          totalExports: 0,
          successCount: 0,
          failedCount: 0,
          totalRecords: 0,
          byType: {},
          byFormat: {},
        };
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 30 * 60 * 1000, // 30分钟
  });
}

/**
 * 添加导出历史记录
 * 注意：这是一个工具函数，通常在 useExportData 的 onSuccess 中自动调用
 */
export function addExportHistory(item: Omit<ExportHistoryItem, 'id'>): void {
  const storageKey = 'export-history';
  const stored = localStorage.getItem(storageKey);

  let history: ExportHistoryItem[] = [];
  if (stored) {
    try {
      history = JSON.parse(stored);
    } catch (error) {
      storageLogger.error({ err: error }, '解析导出历史失败');
    }
  }

  // 添加新记录（带ID）
  const newItem: ExportHistoryItem = {
    ...item,
    id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  history.unshift(newItem);

  // 只保留最近100条记录
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(history));
  } catch (error) {
    storageLogger.error({ err: error }, '保存导出历史失败');
  }
}

/**
 * 清空导出历史
 */
export function clearExportHistory(): void {
  const storageKey = 'export-history';
  localStorage.removeItem(storageKey);
}

/**
 * 删除特定导出记录
 */
export function deleteExportHistoryItem(id: string): boolean {
  const storageKey = 'export-history';
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    return false;
  }

  try {
    const history: ExportHistoryItem[] = JSON.parse(stored);
    const filtered = history.filter((item) => item.id !== id);

    if (filtered.length === history.length) {
      return false; // 没有找到要删除的项
    }

    localStorage.setItem(storageKey, JSON.stringify(filtered));
    return true;
  } catch (error) {
    storageLogger.error({ err: error }, '删除导出历史失败');
    return false;
  }
}
