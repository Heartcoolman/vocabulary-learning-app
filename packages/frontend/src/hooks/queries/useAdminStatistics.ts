/**
 * 管理后台统计数据的 React Query Hooks
 *
 * 提供管理后台的统计数据查询功能，包括：
 * - 系统整体统计
 * - 用户统计
 * - 词库统计
 * - 学习记录统计
 *
 * 使用 QUERY_PRESETS.admin 预设配置
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_PRESETS } from '../../lib/cacheConfig';
import apiClient, { AdminStatistics } from '../../services/client';
import {
  HEALTH_THRESHOLDS,
  HEALTH_PENALTIES,
  HEALTH_STATUS_THRESHOLDS,
} from '../../constants/systemHealth';

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
 * - 使用 QUERY_PRESETS.admin 预设配置
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
    ...QUERY_PRESETS.admin,
    enabled,
    retry: false, // 统计数据失败时不重试
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
  const avgWordsPerBook = stats.totalWordBooks > 0 ? stats.totalWords / stats.totalWordBooks : 0;
  const avgRecordsPerUser = stats.totalUsers > 0 ? stats.totalRecords / stats.totalUsers : 0;

  // 检查活跃率
  if (activeRate < HEALTH_THRESHOLDS.ACTIVE_RATE.LOW) {
    issues.push(`用户活跃率较低（< ${HEALTH_THRESHOLDS.ACTIVE_RATE.LOW}%）`);
    score -= HEALTH_PENALTIES.LOW_ACTIVE_RATE;
  } else if (activeRate < HEALTH_THRESHOLDS.ACTIVE_RATE.MEDIUM) {
    issues.push(`用户活跃率偏低（< ${HEALTH_THRESHOLDS.ACTIVE_RATE.MEDIUM}%）`);
    score -= HEALTH_PENALTIES.MEDIUM_ACTIVE_RATE;
  }

  // 检查系统词库
  if (stats.systemWordBooks < HEALTH_THRESHOLDS.MIN_SYSTEM_WORDBOOKS) {
    issues.push(`系统词库数量较少（< ${HEALTH_THRESHOLDS.MIN_SYSTEM_WORDBOOKS}个）`);
    score -= HEALTH_PENALTIES.LOW_WORDBOOKS;
  }

  // 检查单词数量
  if (avgWordsPerBook < HEALTH_THRESHOLDS.MIN_AVG_WORDS_PER_BOOK) {
    issues.push(`平均词库单词数较少（< ${HEALTH_THRESHOLDS.MIN_AVG_WORDS_PER_BOOK}个）`);
    score -= HEALTH_PENALTIES.LOW_WORDS;
  }

  // 检查学习记录
  if (avgRecordsPerUser < HEALTH_THRESHOLDS.MIN_AVG_RECORDS_PER_USER) {
    issues.push(`用户学习活跃度低（平均 < ${HEALTH_THRESHOLDS.MIN_AVG_RECORDS_PER_USER}条记录）`);
    score -= HEALTH_PENALTIES.LOW_RECORDS;
  }

  // 检查总用户数
  if (stats.totalUsers < HEALTH_THRESHOLDS.MIN_USERS) {
    issues.push('系统尚无用户');
    score -= HEALTH_PENALTIES.NO_USERS;
  }

  // 确保分数不低于0
  score = Math.max(0, score);

  // 确定健康状态
  let status: SystemHealth['status'] = 'excellent';
  if (score < HEALTH_STATUS_THRESHOLDS.ERROR) status = 'error';
  else if (score < HEALTH_STATUS_THRESHOLDS.WARNING) status = 'warning';
  else if (score < HEALTH_STATUS_THRESHOLDS.GOOD) status = 'good';

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
