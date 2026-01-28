/**
 * 系统状态仪表板
 *
 * 显示系统健康状态、性能指标和告警信息
 * 用于运维监控和问题排查
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle } from '../../../components/Icon';
import { env } from '../../../config/env';

// ============================================
// 类型定义
// ============================================

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version?: string;
  checks: {
    database?: string;
    memory?: boolean;
    process?: boolean;
  };
  details?: {
    databaseLatency?: number;
    memoryUsage?: number;
    memoryLimit?: number;
  };
}

interface SystemMetrics {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    uptime: number;
    loadAverage: number[];
    cpuCount: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpuUsage: {
      user: number;
      system: number;
    };
  };
  http: {
    totalRequests: number;
    errorRequests5xx: number;
    requestDuration: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      count: number;
    };
  };
  database: {
    slowQueryTotal: number;
  };
  alerts: {
    activeCount: number;
    active: Array<{
      ruleName: string;
      severity: string;
      triggeredAt: string;
    }>;
  };
}

interface Alert {
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  triggeredAt: string;
  message?: string;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);

  return parts.join(' ') || '刚启动';
}

/**
 * 获取状态样式类
 */
function getStatusClass(status: 'healthy' | 'unhealthy' | 'degraded' | string): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-amber-500';
    case 'unhealthy':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * 获取告警严重程度样式类
 */
function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    case 'info':
      return 'bg-blue-500';
    default:
      return 'bg-gray-400';
  }
}

// ============================================
// 子组件
// ============================================

/**
 * 健康状态卡片
 */
const HealthCard: React.FC<{ health: HealthStatus | null; loading: boolean }> = ({
  health,
  loading,
}) => {
  if (loading) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          系统健康状态
        </div>
        <div className="py-10 text-center text-gray-600 dark:text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          系统健康状态
        </div>
        <div className="py-10 text-center text-red-500">无法获取健康状态</div>
      </div>
    );
  }

  return (
    <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
        系统健康状态
        <span
          className={`inline-block rounded-card px-3 py-1 text-xs font-medium text-white ${getStatusClass(health.status)}`}
        >
          {health.status === 'healthy' ? '健康' : health.status === 'degraded' ? '降级' : '异常'}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">版本</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {health.version || 'unknown'}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">运行时间</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {formatUptime(health.uptime)}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">数据库</span>
        <span
          className={`text-sm font-medium ${
            health.checks.database === 'connected' ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {health.checks.database === 'connected' ? '已连接' : '未连接'}
        </span>
      </div>
      {health.details?.databaseLatency !== undefined && (
        <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
          <span className="text-sm text-gray-600 dark:text-slate-400">数据库延迟</span>
          <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
            {health.details.databaseLatency}ms
          </span>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">内存状态</span>
        <span
          className={`text-sm font-medium ${
            health.checks.memory ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {health.checks.memory ? '正常' : '警告'}
        </span>
      </div>
    </div>
  );
};

/**
 * 性能指标卡片
 */
const MetricsCard: React.FC<{ metrics: SystemMetrics | null; loading: boolean }> = ({
  metrics,
  loading,
}) => {
  if (loading) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          性能指标
        </div>
        <div className="py-10 text-center text-gray-600 dark:text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          性能指标
        </div>
        <div className="py-10 text-center text-red-500">无法获取性能指标</div>
      </div>
    );
  }

  const memoryPercent =
    (metrics.process.memoryUsage.heapUsed / metrics.process.memoryUsage.heapTotal) * 100;

  return (
    <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
        性能指标
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">请求总数</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.http.totalRequests.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">5xx 错误数</span>
        <span
          className={`text-sm font-medium ${
            metrics.http.errorRequests5xx > 0 ? 'text-red-500' : 'text-green-500'
          }`}
        >
          {metrics.http.errorRequests5xx}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">平均响应时间</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.http.requestDuration.avg.toFixed(2)}ms
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">P95 响应时间</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.http.requestDuration.p95.toFixed(2)}ms
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">P99 响应时间</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.http.requestDuration.p99.toFixed(2)}ms
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">慢查询数</span>
        <span
          className={`text-sm font-medium ${
            metrics.database.slowQueryTotal > 10
              ? 'text-amber-500'
              : 'text-gray-800 dark:text-slate-200'
          }`}
        >
          {metrics.database.slowQueryTotal}
        </span>
      </div>
      <div className="mt-4">
        <div className="flex justify-between">
          <span className="text-sm text-gray-600 dark:text-slate-400">堆内存使用</span>
          <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
            {formatBytes(metrics.process.memoryUsage.heapUsed)} /{' '}
            {formatBytes(metrics.process.memoryUsage.heapTotal)}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-300 dark:bg-slate-600">
          <div
            className={`h-full rounded transition-all duration-g3-normal ${
              memoryPercent > 90
                ? 'bg-red-500'
                : memoryPercent > 70
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${memoryPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * 系统信息卡片
 */
const SystemInfoCard: React.FC<{ metrics: SystemMetrics | null; loading: boolean }> = ({
  metrics,
  loading,
}) => {
  if (loading) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          系统信息
        </div>
        <div className="py-10 text-center text-gray-600 dark:text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          系统信息
        </div>
        <div className="py-10 text-center text-red-500">无法获取系统信息</div>
      </div>
    );
  }

  return (
    <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
        系统信息
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">主机名</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.system.hostname}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">平台</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.system.platform} / {metrics.system.arch}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">Node 版本</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.system.nodeVersion}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">CPU 核心数</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.system.cpuCount}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">系统负载 (1/5/15分钟)</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.system.loadAverage.map((l) => l.toFixed(2)).join(' / ')}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">系统运行时间</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {formatUptime(metrics.system.uptime)}
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-slate-700">
        <span className="text-sm text-gray-600 dark:text-slate-400">进程 PID</span>
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {metrics.process.pid}
        </span>
      </div>
    </div>
  );
};

/**
 * 告警列表卡片
 */
const AlertsCard: React.FC<{ alerts: Alert[]; loading: boolean }> = ({ alerts, loading }) => {
  if (loading) {
    return (
      <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
          活跃告警
        </div>
        <div className="py-10 text-center text-gray-600 dark:text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="rounded-button bg-white p-5 shadow-soft dark:bg-slate-800">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-slate-200">
        活跃告警
        {alerts.length > 0 && (
          <span className="inline-block rounded-card bg-red-500 px-3 py-1 text-xs font-medium text-white">
            {alerts.length}
          </span>
        )}
      </div>
      {alerts.length === 0 ? (
        <div className="p-5 text-center text-gray-400 dark:text-slate-500">
          <CheckCircle size={32} className="mx-auto text-green-500" />
          <p>无活跃告警</p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {alerts.map((alert, index) => (
            <li
              key={index}
              className="mb-2 flex items-start gap-3 rounded bg-gray-50 p-3 dark:bg-slate-700"
            >
              <div
                className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${getSeverityClass(alert.severity)}`}
              />
              <div className="flex-1">
                <div className="mb-1 text-sm font-medium text-gray-800 dark:text-slate-200">
                  {alert.ruleName}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {new Date(alert.triggeredAt).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

/**
 * 系统状态仪表板
 */
export const SystemStatusDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  /**
   * 获取健康状态
   */
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${env.apiUrl}/health/ready`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
      }
    } catch (e) {
      console.error('Failed to fetch health:', e);
    }
  }, []);

  /**
   * 获取指标
   */
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${env.apiUrl}/health/metrics`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setAlerts(data.alerts?.active || []);
      }
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    }
  }, []);

  /**
   * 刷新所有数据
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([fetchHealth(), fetchMetrics()]);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh status dashboard:', error);
      setError('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [fetchHealth, fetchMetrics]);

  // 初始加载和定时刷新
  useEffect(() => {
    refresh();

    // 每 30 秒自动刷新
    const interval = setInterval(refresh, 30000);

    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-gray-100 p-6 dark:bg-slate-900">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-gray-800 dark:text-white">系统状态仪表板</h1>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-sm text-gray-600 dark:text-slate-400">
              更新时间: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            className="cursor-pointer rounded border-none bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-button bg-red-50 p-5 shadow-soft dark:bg-red-900/20">
          <div className="text-red-500">{error}</div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <HealthCard health={health} loading={loading} />
        <MetricsCard metrics={metrics} loading={loading} />
        <SystemInfoCard metrics={metrics} loading={loading} />
        <AlertsCard alerts={alerts} loading={loading} />
      </div>
    </div>
  );
};

export default SystemStatusDashboard;
