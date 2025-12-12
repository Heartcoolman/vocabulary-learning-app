/**
 * useOpsEnhance - 运维增强相关 Hooks
 *
 * 封装 OpsEnhanceClient 中的方法，提供 React Query 集成
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opsEnhanceClient } from '../../services/client';
import type { AlertStatus, AlertSeverity, UserSegment, AlertInput } from '../../services/client';

// ==================== Query Keys ====================

export const opsEnhanceKeys = {
  all: ['opsEnhance'] as const,
  // 告警分析
  alertAnalyses: () => [...opsEnhanceKeys.all, 'alertAnalyses'] as const,
  alertAnalysis: (id: string) => [...opsEnhanceKeys.all, 'alertAnalysis', id] as const,
  alertStats: () => [...opsEnhanceKeys.all, 'alertStats'] as const,
  // 周报
  weeklyReports: () => [...opsEnhanceKeys.all, 'weeklyReports'] as const,
  weeklyReport: (id: string) => [...opsEnhanceKeys.all, 'weeklyReport', id] as const,
  latestWeeklyReport: () => [...opsEnhanceKeys.all, 'latestWeeklyReport'] as const,
  healthTrend: () => [...opsEnhanceKeys.all, 'healthTrend'] as const,
  // 洞察
  insights: () => [...opsEnhanceKeys.all, 'insights'] as const,
  insight: (id: string) => [...opsEnhanceKeys.all, 'insight', id] as const,
  segments: () => [...opsEnhanceKeys.all, 'segments'] as const,
};

// ==================== 告警分析 Hooks ====================

/**
 * 获取告警分析列表
 */
export function useAlertAnalyses(options?: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...opsEnhanceKeys.alertAnalyses(), options],
    queryFn: () => opsEnhanceClient.getAlertAnalyses(options),
    staleTime: 30 * 1000,
  });
}

/**
 * 获取单个分析详情
 */
export function useAlertAnalysis(id: string) {
  return useQuery({
    queryKey: opsEnhanceKeys.alertAnalysis(id),
    queryFn: () => opsEnhanceClient.getAlertAnalysis(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * 获取告警分析统计
 */
export function useAlertStats() {
  return useQuery({
    queryKey: opsEnhanceKeys.alertStats(),
    queryFn: () => opsEnhanceClient.getAlertStats(),
    staleTime: 60 * 1000,
  });
}

/**
 * 分析告警 mutation
 */
export function useAnalyzeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      alert,
      options,
    }: {
      alert: AlertInput;
      options?: {
        includeHistoricalContext?: boolean;
        maxRelatedAlerts?: number;
      };
    }) => opsEnhanceClient.analyzeAlert(alert, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.alertAnalyses(),
      });
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.alertStats(),
      });
    },
  });
}

/**
 * 更新告警状态 mutation
 */
export function useUpdateAlertStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      resolution,
    }: {
      id: string;
      status: AlertStatus;
      resolution?: string;
    }) => opsEnhanceClient.updateAlertStatus(id, status, resolution),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.alertAnalysis(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.alertAnalyses(),
      });
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.alertStats(),
      });
    },
  });
}

// ==================== 周报 Hooks ====================

/**
 * 获取周报列表
 */
export function useWeeklyReports(options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: [...opsEnhanceKeys.weeklyReports(), options],
    queryFn: () => opsEnhanceClient.getWeeklyReports(options),
    staleTime: 60 * 1000,
  });
}

/**
 * 获取单个周报
 */
export function useWeeklyReport(id: string) {
  return useQuery({
    queryKey: opsEnhanceKeys.weeklyReport(id),
    queryFn: () => opsEnhanceClient.getWeeklyReport(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * 获取最新周报
 */
export function useLatestWeeklyReport() {
  return useQuery({
    queryKey: opsEnhanceKeys.latestWeeklyReport(),
    queryFn: () => opsEnhanceClient.getLatestWeeklyReport(),
    staleTime: 60 * 1000,
  });
}

/**
 * 获取健康度趋势
 */
export function useHealthTrend(weeks?: number) {
  return useQuery({
    queryKey: [...opsEnhanceKeys.healthTrend(), weeks],
    queryFn: () => opsEnhanceClient.getHealthTrend(weeks),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 生成周报 mutation
 */
export function useGenerateWeeklyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { endDate?: Date; includeDetailedMetrics?: boolean }) =>
      opsEnhanceClient.generateWeeklyReport(options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.weeklyReports(),
      });
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.latestWeeklyReport(),
      });
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.healthTrend(),
      });
    },
  });
}

// ==================== 用户行为洞察 Hooks ====================

/**
 * 获取洞察列表
 */
export function useInsights(options?: { segment?: UserSegment; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: [...opsEnhanceKeys.insights(), options],
    queryFn: () => opsEnhanceClient.getInsights(options),
    staleTime: 60 * 1000,
  });
}

/**
 * 获取单个洞察详情
 */
export function useInsight(id: string) {
  return useQuery({
    queryKey: opsEnhanceKeys.insight(id),
    queryFn: () => opsEnhanceClient.getInsight(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * 获取可用的用户分群列表
 */
export function useSegments() {
  return useQuery({
    queryKey: opsEnhanceKeys.segments(),
    queryFn: () => opsEnhanceClient.getSegments(),
    staleTime: 24 * 60 * 60 * 1000, // 24小时缓存，分群列表基本不变
  });
}

/**
 * 生成洞察 mutation
 */
export function useGenerateInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { segment?: UserSegment; daysToAnalyze?: number }) =>
      opsEnhanceClient.generateInsight(options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: opsEnhanceKeys.insights(),
      });
    },
  });
}
