/**
 * 配置历史记录的 React Query Hooks
 *
 * 提供算法配置历史的查询功能，包括：
 * - 获取配置历史列表
 * - 获取配置变更详情
 * - 配置版本比较
 *
 * 用于审计和追踪配置变更
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { amasClient } from '../../services/client';
import type { ConfigHistory } from '../../types/models';

/**
 * 获取算法配置历史记录列表
 *
 * @param limit - 限制返回的记录数量，默认50条
 * @param enabled - 是否启用查询，默认true
 * @returns 配置历史记录的查询结果
 *
 * @example
 * ```tsx
 * const { data: history, isLoading } = useConfigHistory(20);
 *
 * if (isLoading) return <Loading />;
 *
 * return (
 *   <Timeline>
 *     {history?.map(record => (
 *       <TimelineItem key={record.id} record={record} />
 *     ))}
 *   </Timeline>
 * );
 * ```
 */
export function useConfigHistory(limit = 50, enabled = true) {
  return useQuery<ConfigHistory[]>({
    queryKey: queryKeys.admin.configHistory.list(limit),
    queryFn: async () => {
      return await amasClient.getConfigHistory(limit);
    },
    staleTime: 1000 * 60 * 2, // 2分钟
    gcTime: 1000 * 60 * 10, // 10分钟
    enabled,
  });
}

/**
 * 配置变更详情（包含前后对比）
 */
export interface ConfigChangeDetail {
  id: string;
  timestamp: Date;
  changedBy: string;
  changeReason?: string;
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
    changeType: 'added' | 'modified' | 'removed';
  }>;
}

/**
 * 比较两个配置版本，生成变更详情
 *
 * @param oldConfig - 旧配置
 * @param newConfig - 新配置
 * @returns 变更详情列表
 */
function compareConfigs(
  oldConfig: Record<string, unknown> | null | undefined,
  newConfig: Record<string, unknown> | null | undefined,
): ConfigChangeDetail['changes'] {
  const changes: ConfigChangeDetail['changes'] = [];

  // 获取所有键的并集
  const allKeys = new Set([...Object.keys(oldConfig || {}), ...Object.keys(newConfig || {})]);

  for (const key of allKeys) {
    const oldValue = oldConfig?.[key];
    const newValue = newConfig?.[key];

    // 跳过内部字段
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }

    if (oldValue === undefined && newValue !== undefined) {
      // 新增字段
      changes.push({
        field: key,
        oldValue: null,
        newValue,
        changeType: 'added',
      });
    } else if (oldValue !== undefined && newValue === undefined) {
      // 删除字段
      changes.push({
        field: key,
        oldValue,
        newValue: null,
        changeType: 'removed',
      });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      // 修改字段
      changes.push({
        field: key,
        oldValue,
        newValue,
        changeType: 'modified',
      });
    }
  }

  return changes;
}

/**
 * 获取配置变更详情（带前后对比）
 *
 * @param historyId - 历史记录ID
 * @param enabled - 是否启用查询
 * @returns 配置变更详情的查询结果
 *
 * @example
 * ```tsx
 * const { data: detail } = useConfigChangeDetail(historyId);
 *
 * return (
 *   <ChangeDetail>
 *     {detail?.changes.map(change => (
 *       <ChangeItem
 *         key={change.field}
 *         field={change.field}
 *         oldValue={change.oldValue}
 *         newValue={change.newValue}
 *         type={change.changeType}
 *       />
 *     ))}
 *   </ChangeDetail>
 * );
 * ```
 */
export function useConfigChangeDetail(historyId: string, enabled = true) {
  const { data: history } = useConfigHistory();

  return useQuery<ConfigChangeDetail | null>({
    queryKey: queryKeys.admin.configHistory.detail(historyId),
    queryFn: async () => {
      if (!history) return null;

      const record = history.find((h) => h.id === historyId);
      if (!record) return null;

      const changes = compareConfigs(record.previousValue, record.newValue);

      return {
        id: record.id,
        timestamp: new Date(record.timestamp),
        changedBy: record.changedBy,
        changeReason: record.changeReason,
        changes,
      };
    },
    staleTime: 1000 * 60 * 5, // 5分钟（历史记录不会变化）
    gcTime: 1000 * 60 * 30, // 30分钟
    enabled: enabled && !!history,
  });
}

/**
 * 配置变更统计
 */
export interface ConfigChangeStats {
  totalChanges: number;
  changedBy: Record<string, number>; // 用户ID -> 变更次数
  changeReasons: Record<string, number>; // 原因 -> 次数
  recentChanges: number; // 最近7天的变更次数
  mostChangedFields: Array<{ field: string; count: number }>;
}

/**
 * 获取配置变更统计信息
 *
 * @param enabled - 是否启用查询
 * @returns 配置变更统计的查询结果
 *
 * @example
 * ```tsx
 * const { data: stats } = useConfigChangeStats();
 *
 * return (
 *   <StatsPanel>
 *     <Stat label="总变更次数" value={stats.totalChanges} />
 *     <Stat label="最近7天" value={stats.recentChanges} />
 *     <TopChangers data={stats.changedBy} />
 *   </StatsPanel>
 * );
 * ```
 */
export function useConfigChangeStats(enabled = true) {
  const { data: history } = useConfigHistory(undefined, enabled);

  return useQuery<ConfigChangeStats>({
    queryKey: [...queryKeys.admin.configHistory.all, 'stats'],
    queryFn: async () => {
      if (!history) {
        return {
          totalChanges: 0,
          changedBy: {},
          changeReasons: {},
          recentChanges: 0,
          mostChangedFields: [],
        };
      }

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // 统计变更人员
      const changedBy: Record<string, number> = {};
      // 统计变更原因
      const changeReasons: Record<string, number> = {};
      // 统计变更字段
      const fieldChanges: Record<string, number> = {};
      // 最近7天的变更数
      let recentChanges = 0;

      for (const record of history) {
        // 统计变更人员
        changedBy[record.changedBy] = (changedBy[record.changedBy] || 0) + 1;

        // 统计变更原因
        if (record.changeReason) {
          changeReasons[record.changeReason] = (changeReasons[record.changeReason] || 0) + 1;
        }

        // 统计最近7天的变更
        const recordTime = new Date(record.timestamp).getTime();
        if (recordTime >= sevenDaysAgo) {
          recentChanges++;
        }

        // 统计变更字段
        const changes = compareConfigs(record.previousValue, record.newValue);
        for (const change of changes) {
          fieldChanges[change.field] = (fieldChanges[change.field] || 0) + 1;
        }
      }

      // 排序最常变更的字段
      const mostChangedFields = Object.entries(fieldChanges)
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalChanges: history.length,
        changedBy,
        changeReasons,
        recentChanges,
        mostChangedFields,
      };
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 30, // 30分钟
    enabled: enabled && !!history,
  });
}

/**
 * 获取指定用户的配置变更历史
 *
 * @param userId - 用户ID
 * @param enabled - 是否启用查询
 * @returns 用户配置变更历史的查询结果
 */
export function useUserConfigHistory(userId: string, enabled = true) {
  const { data: history, ...rest } = useConfigHistory(undefined, enabled);

  return {
    ...rest,
    data: history?.filter((h) => h.changedBy === userId) || [],
  };
}
