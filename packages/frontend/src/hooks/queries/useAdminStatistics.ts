/**
 * 管理后台统计数据的 React Query Hooks
 *
 * 提供管理后台的统计数据查询功能，包括：
 * - 系统整体统计
 * - 用户统计
 * - 词库统计
 * - 学习记录统计
 *
 * 缓存时间为5分钟，因为统计数据不需要实时更新
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import apiClient, { AdminStatistics } from '../../services/ApiClient';

/**
 * 获取系统整体统计数据
 *
 * 包括：
 * - 总用户数
 * - 活跃用户数
 * - 总词库数（系统词库+用户词库）
 * - 总单词数
 * - 总学习记录数
 *
 * 特点：
 * - 5分钟缓存时间
 * - 失败时不重试（避免频繁请求）
 * - 可通过 enabled 参数控制是否启用
 *
 * @param enabled - 是否启用查询，默认为 true
 * @returns 系统统计数据的查询结果
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading, error } = useAdminStatistics();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <div>
 *     <StatCard label="总用户数" value={stats.totalUsers} />
 *     <StatCard label="活跃用户" value={stats.activeUsers} />
 *   </div>
 * );
 * ```
 */
export function useAdminStatistics(enabled = true) {
  return useQuery<AdminStatistics>({
    queryKey: queryKeys.admin.statistics.overview(),
    queryFn: async () => {
      return await apiClient.adminGetStatistics();
    },
    staleTime: 1000 * 60 * 5, // 5分钟
    gcTime: 1000 * 60 * 10, // 10分钟
    enabled,
    retry: false, // 统计数据失败时不重试
    refetchOnWindowFocus: false, // 不在窗口获得焦点时重新获取
  });
}

/**
 * 系统健康度检查结果
 */
export interface SystemHealth {
  status: 'excellent' | 'good' | 'warning' | 'error' | 'unknown';
  score: number; // 0-100
  issues: string[];
  metrics: {
    activeRate: number; // 活跃率百分比
    avgWordsPerBook: number; // 平均每词库单词数
    avgRecordsPerUser: number; // 平均每用户学习记录数
  };
}

/**
 * 计算系统健康度
 *
 * 根据统计数据计算系统健康度分数和问题列表
 *
 * @param stats - 系统统计数据
 * @returns 系统健康度信息
 */
export function calculateSystemHealth(stats: AdminStatistics): SystemHealth {
  if (!stats) {
    return {
      status: 'unknown',
      score: 0,
      issues: ['统计数据不可用'],
      metrics: {
        activeRate: 0,
        avgWordsPerBook: 0,
        avgRecordsPerUser: 0,
      },
    };
  }

  const issues: string[] = [];
  let score = 100;

  // 计算关键指标
  const activeRate = stats.totalUsers > 0 ? (stats.activeUsers / stats.totalUsers) * 100 : 0;
  const avgWordsPerBook =
    stats.totalWordBooks > 0 ? stats.totalWords / stats.totalWordBooks : 0;
  const avgRecordsPerUser =
    stats.totalUsers > 0 ? stats.totalRecords / stats.totalUsers : 0;

  // 检查活跃率
  if (activeRate < 30) {
    issues.push('用户活跃率较低（< 30%）');
    score -= 20;
  } else if (activeRate < 50) {
    issues.push('用户活跃率偏低（< 50%）');
    score -= 10;
  }

  // 检查系统词库
  if (stats.systemWordBooks < 3) {
    issues.push('系统词库数量较少（< 3个）');
    score -= 15;
  }

  // 检查单词数量
  if (avgWordsPerBook < 50) {
    issues.push('平均词库单词数较少（< 50个）');
    score -= 15;
  }

  // 检查学习记录
  if (avgRecordsPerUser < 10) {
    issues.push('用户学习活跃度低（平均 < 10条记录）');
    score -= 10;
  }

  // 检查总用户数
  if (stats.totalUsers < 1) {
    issues.push('系统尚无用户');
    score -= 30;
  }

  // 确保分数不低于0
  score = Math.max(0, score);

  // 确定健康状态
  let status: SystemHealth['status'] = 'excellent';
  if (score < 60) status = 'error';
  else if (score < 75) status = 'warning';
  else if (score < 90) status = 'good';

  return {
    status,
    score,
    issues,
    metrics: {
      activeRate,
      avgWordsPerBook,
      avgRecordsPerUser,
    },
  };
}

/**
 * 获取系统健康度（基于统计数据计算）
 *
 * 这是一个便捷 hook，自动从统计数据计算系统健康度
 *
 * @param enabled - 是否启用查询，默认为 true
 * @returns 系统健康度的查询结果
 *
 * @example
 * ```tsx
 * const { data: health, isLoading } = useSystemHealth();
 *
 * if (isLoading) return <Loading />;
 *
 * return (
 *   <HealthIndicator
 *     status={health.status}
 *     score={health.score}
 *     issues={health.issues}
 *   />
 * );
 * ```
 */
export function useSystemHealth(enabled = true) {
  const { data: stats, ...rest } = useAdminStatistics(enabled);

  return {
    ...rest,
    data: stats ? calculateSystemHealth(stats) : undefined,
  };
}
