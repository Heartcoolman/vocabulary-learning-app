/**
 * Rollout Monitoring Hooks - 灰度发布监控 React Hooks
 *
 * 提供监控指标、健康报告和告警管理的 React 集成
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getRolloutMonitor,
  HealthReport,
  AlertEvent,
  AlertRule,
  MetricType,
} from '../utils/rolloutMonitoring';

// ===================== Health Report Hook =====================

/**
 * 使用健康报告
 *
 * @example
 * ```tsx
 * function FeatureHealthCard({ featureKey }: { featureKey: string }) {
 *   const { report, isHealthy, isDegraded } = useHealthReport(featureKey);
 *
 *   return (
 *     <div className={isHealthy ? 'bg-green' : isDegraded ? 'bg-yellow' : 'bg-red'}>
 *       <p>Error Rate: {(report.errorRate * 100).toFixed(2)}%</p>
 *       <p>P99 Latency: {report.latencyP99}ms</p>
 *       <p>Apdex: {report.apdex.toFixed(2)}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useHealthReport(
  featureKey: string,
  refreshInterval: number = 10000,
): {
  report: HealthReport;
  isHealthy: boolean;
  isDegraded: boolean;
  isUnhealthy: boolean;
  refresh: () => void;
} {
  const [report, setReport] = useState<HealthReport>(() =>
    getRolloutMonitor().getHealthReport(featureKey),
  );

  const refresh = useCallback(() => {
    setReport(getRolloutMonitor().getHealthReport(featureKey));
  }, [featureKey]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [featureKey, refreshInterval, refresh]);

  return {
    report,
    isHealthy: report.status === 'healthy',
    isDegraded: report.status === 'degraded',
    isUnhealthy: report.status === 'unhealthy',
    refresh,
  };
}

/**
 * 使用所有健康报告
 */
export function useAllHealthReports(refreshInterval: number = 30000): {
  reports: HealthReport[];
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  refresh: () => void;
} {
  const [reports, setReports] = useState<HealthReport[]>([]);

  const refresh = useCallback(() => {
    setReports(getRolloutMonitor().getAllHealthReports());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, refresh]);

  const counts = useMemo(
    () => ({
      healthyCount: reports.filter((r) => r.status === 'healthy').length,
      degradedCount: reports.filter((r) => r.status === 'degraded').length,
      unhealthyCount: reports.filter((r) => r.status === 'unhealthy').length,
    }),
    [reports],
  );

  return {
    reports,
    ...counts,
    refresh,
  };
}

// ===================== Alert Hooks =====================

/**
 * 使用告警事件
 *
 * @example
 * ```tsx
 * function AlertList() {
 *   const { alerts, resolve, hasAlerts } = useAlerts();
 *
 *   if (!hasAlerts) return <p>No active alerts</p>;
 *
 *   return (
 *     <ul>
 *       {alerts.map(alert => (
 *         <li key={alert.id}>
 *           {alert.message}
 *           <button onClick={() => resolve(alert.id)}>Resolve</button>
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useAlerts(
  featureKey?: string,
  includeResolved: boolean = false,
): {
  alerts: AlertEvent[];
  hasAlerts: boolean;
  criticalCount: number;
  warningCount: number;
  resolve: (alertId: string) => void;
  refresh: () => void;
} {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const refresh = useCallback(() => {
    setAlerts(getRolloutMonitor().getAlertEvents(featureKey, includeResolved));
  }, [featureKey, includeResolved]);

  const resolve = useCallback(
    (alertId: string) => {
      getRolloutMonitor().resolveAlert(alertId);
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const counts = useMemo(
    () => ({
      criticalCount: alerts.filter((a) => a.severity === 'critical').length,
      warningCount: alerts.filter((a) => a.severity === 'warning').length,
    }),
    [alerts],
  );

  return {
    alerts,
    hasAlerts: alerts.length > 0,
    ...counts,
    resolve,
    refresh,
  };
}

/**
 * 使用告警规则管理
 */
export function useAlertRules(): {
  rules: AlertRule[];
  addRule: (rule: AlertRule) => void;
  removeRule: (ruleId: string) => void;
  toggleRule: (ruleId: string) => void;
} {
  const [rules, setRules] = useState<AlertRule[]>([]);

  const refresh = useCallback(() => {
    setRules(getRolloutMonitor().getAlertRules());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRule = useCallback(
    (rule: AlertRule) => {
      getRolloutMonitor().registerAlertRule(rule);
      refresh();
    },
    [refresh],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      getRolloutMonitor().removeAlertRule(ruleId);
      refresh();
    },
    [refresh],
  );

  const toggleRule = useCallback(
    (ruleId: string) => {
      const rule = rules.find((r) => r.id === ruleId);
      if (rule) {
        getRolloutMonitor().registerAlertRule({
          ...rule,
          enabled: !rule.enabled,
        });
        refresh();
      }
    },
    [rules, refresh],
  );

  return {
    rules,
    addRule,
    removeRule,
    toggleRule,
  };
}

// ===================== Metrics Hooks =====================

/**
 * 使用指标记录
 *
 * @example
 * ```tsx
 * function MyFeature() {
 *   const { recordSuccess, recordError } = useMetricsRecorder('new_feature');
 *
 *   const handleAction = async () => {
 *     const start = performance.now();
 *     try {
 *       await doSomething();
 *       recordSuccess(performance.now() - start);
 *     } catch (error) {
 *       recordError(error);
 *     }
 *   };
 *
 *   return <button onClick={handleAction}>Do Something</button>;
 * }
 * ```
 */
export function useMetricsRecorder(featureKey: string): {
  recordSuccess: (latencyMs: number, metadata?: Record<string, unknown>) => void;
  recordError: (error?: Error, metadata?: Record<string, unknown>) => void;
  recordMetric: (metricType: MetricType, value: number, metadata?: Record<string, unknown>) => void;
} {
  const recordSuccess = useCallback(
    (latencyMs: number, metadata?: Record<string, unknown>) => {
      getRolloutMonitor().recordSuccess(featureKey, latencyMs, metadata);
    },
    [featureKey],
  );

  const recordError = useCallback(
    (error?: Error, metadata?: Record<string, unknown>) => {
      getRolloutMonitor().recordError(featureKey, error, metadata);
    },
    [featureKey],
  );

  const recordMetric = useCallback(
    (metricType: MetricType, value: number, metadata?: Record<string, unknown>) => {
      getRolloutMonitor().recordMetric(featureKey, metricType, value, metadata);
    },
    [featureKey],
  );

  return {
    recordSuccess,
    recordError,
    recordMetric,
  };
}

/**
 * 自动性能监控 HOC 风格的 Hook
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { wrapAsync, isLoading, error } = usePerformanceMonitor('my_feature');
 *
 *   const handleClick = wrapAsync(async () => {
 *     await fetchData();
 *   });
 *
 *   return (
 *     <button onClick={handleClick} disabled={isLoading}>
 *       {isLoading ? 'Loading...' : 'Fetch Data'}
 *     </button>
 *   );
 * }
 * ```
 */
export function usePerformanceMonitor(featureKey: string): {
  wrapAsync: <T>(fn: () => Promise<T>) => () => Promise<T | undefined>;
  isLoading: boolean;
  error: Error | null;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { recordSuccess, recordError } = useMetricsRecorder(featureKey);

  const wrapAsync = useCallback(
    <T>(fn: () => Promise<T>) => {
      return async (): Promise<T | undefined> => {
        const start = performance.now();
        setIsLoading(true);
        setError(null);

        try {
          const result = await fn();
          recordSuccess(performance.now() - start);
          return result;
        } catch (err) {
          const e = err as Error;
          setError(e);
          recordError(e);
          return undefined;
        } finally {
          setIsLoading(false);
        }
      };
    },
    [recordSuccess, recordError],
  );

  return {
    wrapAsync,
    isLoading,
    error,
  };
}

// ===================== Metrics Comparison Hook =====================

/**
 * 使用指标对比
 *
 * @example
 * ```tsx
 * function MetricsComparison() {
 *   const comparison = useMetricsComparison('new_feature', 'error_rate', 'canary', 'stable');
 *
 *   if (!comparison) return <p>No data</p>;
 *
 *   return (
 *     <div>
 *       <p>Canary: {comparison.groupA.avg}</p>
 *       <p>Stable: {comparison.groupB.avg}</p>
 *       <p>Difference: {comparison.percentChange}%</p>
 *     </div>
 *   );
 * }
 * ```
 */
type MetricsComparisonResult = {
  groupA: { avg: number; min: number; max: number };
  groupB: { avg: number; min: number; max: number };
  difference: number;
  percentChange: number;
} | null;

export function useMetricsComparison(
  featureKey: string,
  metricType: MetricType,
  groupA: string,
  groupB: string,
): MetricsComparisonResult {
  const [comparison, setComparison] = useState<MetricsComparisonResult>(null);

  useEffect(() => {
    const refresh = () => {
      setComparison(getRolloutMonitor().compareMetrics(featureKey, metricType, groupA, groupB));
    };

    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [featureKey, metricType, groupA, groupB]);

  return comparison;
}

// ===================== Dashboard Hook =====================

/**
 * 灰度发布仪表板数据 Hook
 *
 * @example
 * ```tsx
 * function RolloutDashboard() {
 *   const dashboard = useRolloutDashboard();
 *
 *   return (
 *     <div>
 *       <StatusCard
 *         healthy={dashboard.healthyFeatures}
 *         degraded={dashboard.degradedFeatures}
 *         unhealthy={dashboard.unhealthyFeatures}
 *       />
 *       <AlertsSection alerts={dashboard.activeAlerts} />
 *       <ReportsGrid reports={dashboard.healthReports} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useRolloutDashboard(): {
  healthReports: HealthReport[];
  activeAlerts: AlertEvent[];
  alertRules: AlertRule[];
  totalFeatures: number;
  healthyFeatures: number;
  degradedFeatures: number;
  unhealthyFeatures: number;
  criticalAlerts: number;
  warningAlerts: number;
  refresh: () => void;
} {
  const {
    reports,
    healthyCount,
    degradedCount,
    unhealthyCount,
    refresh: refreshReports,
  } = useAllHealthReports();
  const { alerts, criticalCount, warningCount, refresh: refreshAlerts } = useAlerts();
  const { rules } = useAlertRules();

  const refresh = useCallback(() => {
    refreshReports();
    refreshAlerts();
  }, [refreshReports, refreshAlerts]);

  return {
    healthReports: reports,
    activeAlerts: alerts,
    alertRules: rules,
    totalFeatures: reports.length,
    healthyFeatures: healthyCount,
    degradedFeatures: degradedCount,
    unhealthyFeatures: unhealthyCount,
    criticalAlerts: criticalCount,
    warningAlerts: warningCount,
    refresh,
  };
}
