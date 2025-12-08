/**
 * 系统状态仪表板
 *
 * 显示系统健康状态、性能指标和告警信息
 * 用于运维监控和问题排查
 */

import React, { useState, useEffect, useCallback } from 'react';
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
 * 获取状态颜色
 */
function getStatusColor(status: 'healthy' | 'unhealthy' | 'degraded' | string): string {
  switch (status) {
    case 'healthy':
      return '#4caf50';
    case 'degraded':
      return '#ff9800';
    case 'unhealthy':
      return '#f44336';
    default:
      return '#9e9e9e';
  }
}

/**
 * 获取告警严重程度颜色
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#f44336';
    case 'warning':
      return '#ff9800';
    case 'info':
      return '#2196f3';
    default:
      return '#9e9e9e';
  }
}

// ============================================
// 组件样式
// ============================================

const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#333',
    margin: 0,
  } as React.CSSProperties,
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'white',
  } as React.CSSProperties,
  metricItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
  } as React.CSSProperties,
  metricLabel: {
    color: '#666',
    fontSize: '14px',
  } as React.CSSProperties,
  metricValue: {
    color: '#333',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  alertList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  } as React.CSSProperties,
  alertItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '8px',
    backgroundColor: '#f9f9f9',
  } as React.CSSProperties,
  alertDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginTop: '4px',
    flexShrink: 0,
  } as React.CSSProperties,
  alertContent: {
    flex: 1,
  } as React.CSSProperties,
  alertName: {
    fontWeight: 500,
    fontSize: '14px',
    color: '#333',
    marginBottom: '4px',
  } as React.CSSProperties,
  alertTime: {
    fontSize: '12px',
    color: '#999',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    color: '#999',
    padding: '20px',
  } as React.CSSProperties,
  loadingState: {
    textAlign: 'center' as const,
    color: '#666',
    padding: '40px',
  } as React.CSSProperties,
  errorState: {
    textAlign: 'center' as const,
    color: '#f44336',
    padding: '40px',
  } as React.CSSProperties,
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '8px',
  } as React.CSSProperties,
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  } as React.CSSProperties,
};

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
      <div style={styles.card}>
        <div style={styles.cardTitle}>系统健康状态</div>
        <div style={styles.loadingState}>加载中...</div>
      </div>
    );
  }

  if (!health) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>系统健康状态</div>
        <div style={styles.errorState}>无法获取健康状态</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        系统健康状态
        <span
          style={{
            ...styles.statusBadge,
            backgroundColor: getStatusColor(health.status),
          }}
        >
          {health.status === 'healthy' ? '健康' : health.status === 'degraded' ? '降级' : '异常'}
        </span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>版本</span>
        <span style={styles.metricValue}>{health.version || 'unknown'}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>运行时间</span>
        <span style={styles.metricValue}>{formatUptime(health.uptime)}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>数据库</span>
        <span
          style={{
            ...styles.metricValue,
            color: health.checks.database === 'connected' ? '#4caf50' : '#f44336',
          }}
        >
          {health.checks.database === 'connected' ? '已连接' : '未连接'}
        </span>
      </div>
      {health.details?.databaseLatency !== undefined && (
        <div style={styles.metricItem}>
          <span style={styles.metricLabel}>数据库延迟</span>
          <span style={styles.metricValue}>{health.details.databaseLatency}ms</span>
        </div>
      )}
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>内存状态</span>
        <span
          style={{
            ...styles.metricValue,
            color: health.checks.memory ? '#4caf50' : '#f44336',
          }}
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
      <div style={styles.card}>
        <div style={styles.cardTitle}>性能指标</div>
        <div style={styles.loadingState}>加载中...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>性能指标</div>
        <div style={styles.errorState}>无法获取性能指标</div>
      </div>
    );
  }

  const memoryPercent =
    (metrics.process.memoryUsage.heapUsed / metrics.process.memoryUsage.heapTotal) * 100;

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>性能指标</div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>请求总数</span>
        <span style={styles.metricValue}>{metrics.http.totalRequests.toLocaleString()}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>5xx 错误数</span>
        <span
          style={{
            ...styles.metricValue,
            color: metrics.http.errorRequests5xx > 0 ? '#f44336' : '#4caf50',
          }}
        >
          {metrics.http.errorRequests5xx}
        </span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>平均响应时间</span>
        <span style={styles.metricValue}>{metrics.http.requestDuration.avg.toFixed(2)}ms</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>P95 响应时间</span>
        <span style={styles.metricValue}>{metrics.http.requestDuration.p95.toFixed(2)}ms</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>P99 响应时间</span>
        <span style={styles.metricValue}>{metrics.http.requestDuration.p99.toFixed(2)}ms</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>慢查询数</span>
        <span
          style={{
            ...styles.metricValue,
            color: metrics.database.slowQueryTotal > 10 ? '#ff9800' : '#333',
          }}
        >
          {metrics.database.slowQueryTotal}
        </span>
      </div>
      <div style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={styles.metricLabel}>堆内存使用</span>
          <span style={styles.metricValue}>
            {formatBytes(metrics.process.memoryUsage.heapUsed)} /{' '}
            {formatBytes(metrics.process.memoryUsage.heapTotal)}
          </span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${memoryPercent}%`,
              backgroundColor:
                memoryPercent > 90 ? '#f44336' : memoryPercent > 70 ? '#ff9800' : '#4caf50',
            }}
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
      <div style={styles.card}>
        <div style={styles.cardTitle}>系统信息</div>
        <div style={styles.loadingState}>加载中...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>系统信息</div>
        <div style={styles.errorState}>无法获取系统信息</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>系统信息</div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>主机名</span>
        <span style={styles.metricValue}>{metrics.system.hostname}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>平台</span>
        <span style={styles.metricValue}>
          {metrics.system.platform} / {metrics.system.arch}
        </span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>Node 版本</span>
        <span style={styles.metricValue}>{metrics.system.nodeVersion}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>CPU 核心数</span>
        <span style={styles.metricValue}>{metrics.system.cpuCount}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>系统负载 (1/5/15分钟)</span>
        <span style={styles.metricValue}>
          {metrics.system.loadAverage.map((l) => l.toFixed(2)).join(' / ')}
        </span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>系统运行时间</span>
        <span style={styles.metricValue}>{formatUptime(metrics.system.uptime)}</span>
      </div>
      <div style={styles.metricItem}>
        <span style={styles.metricLabel}>进程 PID</span>
        <span style={styles.metricValue}>{metrics.process.pid}</span>
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
      <div style={styles.card}>
        <div style={styles.cardTitle}>活跃告警</div>
        <div style={styles.loadingState}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        活跃告警
        {alerts.length > 0 && (
          <span
            style={{
              ...styles.statusBadge,
              backgroundColor: '#f44336',
            }}
          >
            {alerts.length}
          </span>
        )}
      </div>
      {alerts.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={{ fontSize: '32px' }}>✓</span>
          <p>无活跃告警</p>
        </div>
      ) : (
        <ul style={styles.alertList}>
          {alerts.map((alert, index) => (
            <li key={index} style={styles.alertItem}>
              <div
                style={{
                  ...styles.alertDot,
                  backgroundColor: getSeverityColor(alert.severity),
                }}
              />
              <div style={styles.alertContent}>
                <div style={styles.alertName}>{alert.ruleName}</div>
                <div style={styles.alertTime}>{new Date(alert.triggeredAt).toLocaleString()}</div>
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
    } catch (e) {
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>系统状态仪表板</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {lastUpdate && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              更新时间: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button style={styles.refreshButton} onClick={refresh} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            ...styles.card,
            backgroundColor: '#ffebee',
            marginBottom: '24px',
          }}
        >
          <div style={{ color: '#f44336' }}>{error}</div>
        </div>
      )}

      <div style={styles.grid}>
        <HealthCard health={health} loading={loading} />
        <MetricsCard metrics={metrics} loading={loading} />
        <SystemInfoCard metrics={metrics} loading={loading} />
        <AlertsCard alerts={alerts} loading={loading} />
      </div>
    </div>
  );
};

export default SystemStatusDashboard;
