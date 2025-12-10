/**
 * 视觉疲劳统计数据的 React Query Hook
 *
 * 提供管理后台的视觉疲劳统计数据查询功能
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { adminClient, type VisualFatigueStats } from '../../services/client';

/**
 * 获取视觉疲劳统计数据（管理员）
 *
 * @param enabled - 是否启用查询，默认为 true
 * @returns 视觉疲劳统计数据的查询结果
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading, error } = useVisualFatigueStats();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <div>
 *     <StatCard label="总记录数" value={stats.dataVolume.totalRecords} />
 *     <StatCard label="启用率" value={stats.usage.enableRate} />
 *   </div>
 * );
 * ```
 */
export function useVisualFatigueStats(enabled = true) {
  return useQuery<VisualFatigueStats>({
    queryKey: queryKeys.admin.visualFatigue.stats(),
    queryFn: async () => {
      return await adminClient.getVisualFatigueStats();
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 10, // 10分钟
    enabled,
    retry: false, // 统计数据失败时不重试
    refetchOnWindowFocus: false, // 不在窗口获得焦点时重新获取
  });
}
