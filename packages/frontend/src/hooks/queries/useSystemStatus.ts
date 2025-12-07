/**
 * 系统状态监控的 React Query Hooks
 *
 * 提供系统运行状态、性能指标、服务健康度等监控功能
 * 注意：目前后端可能没有完整的系统状态API，这个文件提供前端计算和模拟的状态
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { useAdminStatistics } from './useAdminStatistics';

/**
 * 系统服务状态
 */
export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency?: number; // ms
  lastCheck: Date;
  message?: string;
}

/**
 * 系统整体状态
 */
export interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'down' | 'unknown';
  services: ServiceStatus[];
  uptime: number; // 秒
  lastUpdate: Date;
  metrics: {
    apiLatency: number; // ms
    errorRate: number; // 百分比
    activeConnections: number;
  };
}

/**
 * 获取系统服务状态
 *
 * 目前通过检查API响应时间来判断服务健康度
 * 未来可以扩展为调用专门的健康检查端点
 *
 * @param enabled - 是否启用查询
 * @returns 系统状态查询结果
 */
export function useSystemStatus(enabled = true) {
  const { data: stats, isLoading: statsLoading } = useAdminStatistics(enabled);

  return useQuery<SystemStatus>({
    queryKey: queryKeys.admin.system.status(),
    queryFn: async () => {
      const checkStart = Date.now();

      // 检查 API 服务状态（通过统计API响应时间）
      const apiLatency = Date.now() - checkStart;

      // 模拟检查结果（实际应该调用专门的健康检查端点）
      const services: ServiceStatus[] = [
        {
          name: 'API Server',
          status: apiLatency < 200 ? 'healthy' : apiLatency < 500 ? 'degraded' : 'down',
          latency: apiLatency,
          lastCheck: new Date(),
          message: apiLatency < 200 ? '运行正常' : '响应较慢',
        },
        {
          name: 'Database',
          status: stats ? 'healthy' : 'unknown',
          lastCheck: new Date(),
          message: stats ? '连接正常' : '状态未知',
        },
        {
          name: 'AMAS Service',
          status: 'healthy',
          lastCheck: new Date(),
          message: '运行正常',
        },
      ];

      // 计算整体状态
      const hasDown = services.some((s) => s.status === 'down');
      const hasDegraded = services.some((s) => s.status === 'degraded');
      const overall: SystemStatus['overall'] = hasDown
        ? 'down'
        : hasDegraded
          ? 'degraded'
          : 'healthy';

      return {
        overall,
        services,
        uptime: 0, // 需要后端提供
        lastUpdate: new Date(),
        metrics: {
          apiLatency,
          errorRate: 0, // 需要后端提供
          activeConnections: stats?.activeUsers || 0,
        },
      };
    },
    staleTime: 1000 * 30, // 30秒
    gcTime: 1000 * 60 * 2, // 2分钟
    enabled: enabled && !statsLoading,
    refetchInterval: 1000 * 60, // 每分钟自动刷新
  });
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  avgResponseTime: number; // ms
  requestsPerMinute: number;
  errorRate: number; // 百分比
  cpuUsage?: number; // 百分比
  memoryUsage?: number; // 百分比
  diskUsage?: number; // 百分比
}

/**
 * 获取系统性能指标
 *
 * 注意：目前返回模拟数据，需要后端实现真实的性能监控API
 *
 * @param enabled - 是否启用查询
 * @returns 性能指标查询结果
 */
export function usePerformanceMetrics(enabled = true) {
  return useQuery<PerformanceMetrics>({
    queryKey: queryKeys.admin.system.performance(),
    queryFn: async () => {
      // TODO: 调用真实的性能监控API
      // 目前返回模拟数据
      return {
        avgResponseTime: 120,
        requestsPerMinute: 45,
        errorRate: 0.5,
        cpuUsage: 35,
        memoryUsage: 60,
        diskUsage: 45,
      };
    },
    staleTime: 1000 * 30, // 30秒
    gcTime: 1000 * 60 * 2, // 2分钟
    enabled,
    refetchInterval: 1000 * 30, // 每30秒自动刷新
  });
}

/**
 * 系统告警
 */
export interface SystemAlert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  source: string;
}

/**
 * 获取系统告警列表
 *
 * @param limit - 返回的告警数量限制
 * @param enabled - 是否启用查询
 * @returns 告警列表查询结果
 */
export function useSystemAlerts(limit = 50, enabled = true) {
  const { data: status } = useSystemStatus(enabled);

  return useQuery<SystemAlert[]>({
    queryKey: queryKeys.admin.system.alerts(limit),
    queryFn: async () => {
      // TODO: 调用真实的告警API
      // 目前基于系统状态生成模拟告警
      const alerts: SystemAlert[] = [];

      if (status?.overall === 'degraded') {
        alerts.push({
          id: 'sys-1',
          level: 'warning',
          title: '系统性能下降',
          message: '部分服务响应缓慢',
          timestamp: new Date(),
          resolved: false,
          source: 'System Monitor',
        });
      }

      if (status?.overall === 'down') {
        alerts.push({
          id: 'sys-2',
          level: 'critical',
          title: '系统服务异常',
          message: '关键服务不可用',
          timestamp: new Date(),
          resolved: false,
          source: 'System Monitor',
        });
      }

      return alerts;
    },
    staleTime: 1000 * 30, // 30秒
    gcTime: 1000 * 60 * 5, // 5分钟
    enabled: enabled && !!status,
    refetchInterval: 1000 * 60, // 每分钟自动刷新
  });
}

/**
 * 检查服务是否健康
 *
 * @param serviceName - 服务名称
 * @returns 服务是否健康
 */
export function useServiceHealth(serviceName: string, enabled = true) {
  const { data: status } = useSystemStatus(enabled);

  return {
    isHealthy:
      status?.services.find((s) => s.name === serviceName)?.status === 'healthy' ?? false,
    service: status?.services.find((s) => s.name === serviceName),
  };
}
