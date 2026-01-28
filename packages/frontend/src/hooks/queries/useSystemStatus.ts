/**
 * 系统状态监控的 React Query Hooks
 *
 * 提供系统运行状态、性能指标、服务健康度等监控功能
 * 通过调用后端健康检查 API 获取真实数据
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_PRESETS, REFETCH_INTERVALS } from '../../lib/cacheConfig';
import { getHealthMetrics, getHealthReady } from '../../services/aboutApi';
import { useAdminStatistics, calculateSystemHealth, type SystemHealth } from './useAdminStatistics';
import {
  RUNTIME_HEALTH_THRESHOLDS,
  RUNTIME_HEALTH_PENALTIES,
  COMBINED_HEALTH_WEIGHTS,
  HEALTH_STATUS_THRESHOLDS,
} from '../../constants/systemHealth';

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
 * 通过调用 /api/health/ready 获取真实的系统状态
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

      // 调用健康检查 API 获取真实数据
      const [healthReady, healthMetrics] = await Promise.all([
        getHealthReady(),
        getHealthMetrics(),
      ]);
      const apiLatency = Date.now() - checkStart;
      const totalRequests = healthMetrics.http.totalRequests || 0;
      const errorRate =
        totalRequests > 0 ? (healthMetrics.http.errorRequests5xx / totalRequests) * 100 : 0;

      // 根据健康检查结果构建服务状态
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
          status:
            healthReady.checks.database === 'connected'
              ? 'healthy'
              : healthReady.checks.database === 'timeout'
                ? 'degraded'
                : 'down',
          latency: healthReady.details?.databaseLatency,
          lastCheck: new Date(),
          message:
            healthReady.checks.database === 'connected'
              ? '连接正常'
              : healthReady.checks.database === 'timeout'
                ? '连接超时'
                : '连接断开',
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
        uptime: healthReady.uptime, // 从 API 获取真实的 uptime
        lastUpdate: new Date(),
        metrics: {
          apiLatency,
          errorRate: Math.round(errorRate * 100) / 100,
          activeConnections: healthMetrics.http.requestDuration.count || stats?.activeUsers || 0,
        },
      };
    },
    ...QUERY_PRESETS.realtime,
    enabled: enabled && !statsLoading,
    refetchInterval: REFETCH_INTERVALS.FREQUENT,
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
 * 通过调用 /api/health/metrics 获取真实的性能数据
 *
 * @param enabled - 是否启用查询
 * @returns 性能指标查询结果
 */
export function usePerformanceMetrics(enabled = true) {
  return useQuery<PerformanceMetrics>({
    queryKey: queryKeys.admin.system.performance(),
    queryFn: async () => {
      // 调用真实的性能监控API
      const metrics = await getHealthMetrics();

      // 从 API 响应中提取并转换数据
      const { http, process: processInfo } = metrics;

      // 计算错误率：5xx 错误数 / 总请求数 * 100
      const errorRate =
        http.totalRequests > 0 ? (http.errorRequests5xx / http.totalRequests) * 100 : 0;

      // 计算 CPU 使用率：将 cpuUsage 转换为百分比
      // cpuUsage 返回的是用户态和系统态的 CPU 时间（微秒）
      // 这里简化处理，使用系统负载作为近似值（1 分钟负载平均值 / CPU 核心数 * 100）
      const cpuUsage = Math.min(
        (metrics.system.loadAverage[0] / metrics.system.cpuCount) * 100,
        100,
      );

      // 计算内存使用率
      // Rust 后端 heapTotal 为 0，使用 rss 作为内存占用（单位：字节）
      // 转换为 MB 显示更直观
      const rss = processInfo.memoryUsage?.rss ?? 0;
      const memoryUsageMB = Math.round(rss / 1024 / 1024);

      return {
        avgResponseTime: http.requestDuration.avg,
        requestsPerMinute: http.requestDuration.count, // 使用请求计数作为近似值
        errorRate: Math.round(errorRate * 100) / 100, // 保留两位小数
        cpuUsage: Math.round(cpuUsage * 100) / 100,
        memoryUsage: memoryUsageMB, // MB 单位，不是百分比
        diskUsage: undefined, // 后端暂不提供磁盘使用率
      };
    },
    ...QUERY_PRESETS.realtime,
    enabled,
    refetchInterval: REFETCH_INTERVALS.REALTIME,
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
      const metrics = await getHealthMetrics();

      const alerts: SystemAlert[] =
        metrics.alerts?.active?.map((item, idx) => ({
          id: `health-${idx}-${item.ruleName}`,
          level:
            item.severity === 'critical'
              ? 'critical'
              : item.severity === 'warning'
                ? 'warning'
                : 'info',
          title: item.ruleName,
          message: item.severity === 'critical' ? '需要立即处理的系统告警' : '系统健康提示',
          timestamp: new Date(item.triggeredAt),
          resolved: false,
          source: 'Health Metrics',
        })) || [];

      // 如果健康检查已降级/宕机，补充概要告警
      if (status?.overall === 'degraded') {
        alerts.unshift({
          id: 'sys-degraded',
          level: 'warning',
          title: '系统性能下降',
          message: '部分服务响应缓慢',
          timestamp: new Date(),
          resolved: false,
          source: 'Health Ready',
        });
      }

      if (status?.overall === 'down') {
        alerts.unshift({
          id: 'sys-down',
          level: 'critical',
          title: '系统服务异常',
          message: '关键服务不可用',
          timestamp: new Date(),
          resolved: false,
          source: 'Health Ready',
        });
      }

      return alerts.slice(0, limit);
    },
    ...QUERY_PRESETS.realtime,
    enabled: enabled && !!status,
    refetchInterval: REFETCH_INTERVALS.FREQUENT,
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
    isHealthy: status?.services.find((s) => s.name === serviceName)?.status === 'healthy' || false,
    service: status?.services.find((s) => s.name === serviceName),
  };
}

/**
 * 系统运行健康度
 */
export interface RuntimeHealth {
  status: 'excellent' | 'good' | 'warning' | 'error' | 'unknown';
  score: number;
  issues: string[];
}

/**
 * 计算系统运行健康度评分
 */
export function calculateRuntimeHealth(
  systemStatus: SystemStatus | undefined,
  perfMetrics: PerformanceMetrics | undefined,
): RuntimeHealth {
  if (!systemStatus) {
    return {
      status: 'unknown',
      score: 0,
      issues: ['系统状态不可用'],
    };
  }

  const issues: string[] = [];
  let score = 100;

  const dbService = systemStatus.services.find((s) => s.name === 'Database');
  if (dbService) {
    if (dbService.status === 'down') {
      issues.push('数据库连接断开');
      score -= RUNTIME_HEALTH_PENALTIES.DB_DISCONNECTED;
    } else if (dbService.status === 'degraded') {
      issues.push('数据库连接超时');
      score -= RUNTIME_HEALTH_PENALTIES.DB_TIMEOUT;
    } else if (dbService.latency) {
      if (dbService.latency > RUNTIME_HEALTH_THRESHOLDS.DB_LATENCY_ERROR) {
        issues.push(`数据库延迟过高（${dbService.latency}ms）`);
        score -= RUNTIME_HEALTH_PENALTIES.DB_LATENCY_HIGH;
      } else if (dbService.latency > RUNTIME_HEALTH_THRESHOLDS.DB_LATENCY_WARNING) {
        issues.push(`数据库延迟较高（${dbService.latency}ms）`);
        score -= RUNTIME_HEALTH_PENALTIES.DB_LATENCY_MEDIUM;
      }
    }
  }

  if (perfMetrics?.memoryUsage !== undefined) {
    if (perfMetrics.memoryUsage > RUNTIME_HEALTH_THRESHOLDS.MEMORY_ERROR) {
      issues.push(`内存占用过高（${Math.round(perfMetrics.memoryUsage)} MB）`);
      score -= RUNTIME_HEALTH_PENALTIES.MEMORY_HIGH;
    } else if (perfMetrics.memoryUsage > RUNTIME_HEALTH_THRESHOLDS.MEMORY_WARNING) {
      issues.push(`内存占用较高（${Math.round(perfMetrics.memoryUsage)} MB）`);
      score -= RUNTIME_HEALTH_PENALTIES.MEMORY_MEDIUM;
    }
  }

  const apiLatency = systemStatus.metrics.apiLatency ?? 0;
  const errorRate = systemStatus.metrics.errorRate ?? 0;

  if (apiLatency > RUNTIME_HEALTH_THRESHOLDS.API_LATENCY_ERROR) {
    issues.push(`API 响应延迟过高（${apiLatency}ms）`);
    score -= RUNTIME_HEALTH_PENALTIES.API_LATENCY_HIGH;
  } else if (apiLatency > RUNTIME_HEALTH_THRESHOLDS.API_LATENCY_WARNING) {
    issues.push(`API 响应延迟较高（${apiLatency}ms）`);
    score -= RUNTIME_HEALTH_PENALTIES.API_LATENCY_MEDIUM;
  }

  if (errorRate > RUNTIME_HEALTH_THRESHOLDS.ERROR_RATE_ERROR) {
    issues.push(`错误率过高（${errorRate}%）`);
    score -= RUNTIME_HEALTH_PENALTIES.ERROR_RATE_HIGH;
  } else if (errorRate > RUNTIME_HEALTH_THRESHOLDS.ERROR_RATE_WARNING) {
    issues.push(`错误率较高（${errorRate}%）`);
    score -= RUNTIME_HEALTH_PENALTIES.ERROR_RATE_MEDIUM;
  }

  score = Math.max(0, score);

  let status: RuntimeHealth['status'] = 'excellent';
  if (score < HEALTH_STATUS_THRESHOLDS.ERROR) status = 'error';
  else if (score < HEALTH_STATUS_THRESHOLDS.WARNING) status = 'warning';
  else if (score < HEALTH_STATUS_THRESHOLDS.GOOD) status = 'good';

  return { status, score, issues };
}

/**
 * 合并健康度结果
 */
export interface CombinedHealth {
  status: 'excellent' | 'good' | 'warning' | 'error' | 'unknown';
  score: number;
  businessScore: number;
  runtimeScore: number;
  issues: string[];
}

/**
 * 计算合并健康度
 */
export function calculateCombinedHealth(
  businessHealth: SystemHealth | undefined,
  runtimeHealth: RuntimeHealth | undefined,
): CombinedHealth {
  const hasBusinessData = businessHealth && businessHealth.status !== 'unknown';
  const hasRuntimeData = runtimeHealth && runtimeHealth.status !== 'unknown';

  if (!hasBusinessData && !hasRuntimeData) {
    return {
      status: 'unknown',
      score: 0,
      businessScore: 0,
      runtimeScore: 0,
      issues: ['健康度数据不可用'],
    };
  }

  const businessScore = hasBusinessData ? businessHealth.score : 0;
  const runtimeScore = hasRuntimeData ? runtimeHealth.score : 0;

  let score: number;
  if (hasBusinessData && hasRuntimeData) {
    score = Math.round(
      businessScore * COMBINED_HEALTH_WEIGHTS.BUSINESS +
        runtimeScore * COMBINED_HEALTH_WEIGHTS.RUNTIME,
    );
  } else if (hasBusinessData) {
    score = businessScore;
  } else {
    score = runtimeScore;
  }

  const issues: string[] = [];
  if (hasBusinessData && businessHealth.issues) {
    issues.push(...businessHealth.issues.map((i) => `[业务] ${i}`));
  }
  if (hasRuntimeData && runtimeHealth.issues) {
    issues.push(...runtimeHealth.issues.map((i) => `[运行] ${i}`));
  }

  let status: CombinedHealth['status'] = 'excellent';
  if (score < HEALTH_STATUS_THRESHOLDS.ERROR) status = 'error';
  else if (score < HEALTH_STATUS_THRESHOLDS.WARNING) status = 'warning';
  else if (score < HEALTH_STATUS_THRESHOLDS.GOOD) status = 'good';

  return { status, score, businessScore, runtimeScore, issues };
}

/**
 * 获取合并健康度
 */
export function useCombinedHealth(enabled = true) {
  const { data: stats, isLoading: statsLoading } = useAdminStatistics(enabled);
  const { data: systemStatus, isLoading: statusLoading } = useSystemStatus(enabled);
  const { data: perfMetrics, isLoading: perfLoading } = usePerformanceMetrics(enabled);

  const isLoading = statsLoading || statusLoading || perfLoading;

  const businessHealth = stats ? calculateSystemHealth(stats) : undefined;
  const runtimeHealth = calculateRuntimeHealth(systemStatus, perfMetrics);
  const combinedHealth = calculateCombinedHealth(businessHealth, runtimeHealth);

  return {
    data: combinedHealth,
    businessHealth,
    runtimeHealth,
    isLoading,
  };
}
