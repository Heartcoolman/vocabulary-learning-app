/**
 * Rollout Monitoring - 灰度发布监控系统
 *
 * 提供错误率监控、性能指标对比和回滚触发条件
 */

import { getRolloutManager, RolloutStage } from '../config/rollout';
import { getFeatureFlagManager } from './featureFlags';

// ===================== 类型定义 =====================

/** 监控指标类型 */
export type MetricType =
  | 'error_rate' // 错误率
  | 'latency_p50' // P50 延迟
  | 'latency_p90' // P90 延迟
  | 'latency_p99' // P99 延迟
  | 'throughput' // 吞吐量
  | 'apdex' // 应用性能指数
  | 'custom'; // 自定义指标

/** 监控数据点 */
export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  tags?: Record<string, unknown>;
}

/** 监控指标 */
export interface MonitoringMetric {
  name: string;
  type: MetricType;
  featureKey: string;
  variant?: string; // 用于 A/B 测试对比
  dataPoints: MetricDataPoint[];
}

/** 告警级别 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/** 告警规则 */
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  featureKey: string;
  metricType: MetricType;
  condition: AlertCondition;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  cooldownPeriod: number; // 冷却期（毫秒）
  lastTriggered?: Date;
}

/** 告警条件 */
export interface AlertCondition {
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'increase_by' | 'decrease_by';
  threshold: number;
  duration?: number; // 持续时间（毫秒），用于防抖
  compareWith?: 'baseline' | 'previous' | 'control'; // 对比基准
}

/** 告警动作 */
export interface AlertAction {
  type: 'rollback' | 'pause' | 'notify' | 'webhook' | 'custom';
  config: Record<string, unknown>;
}

/** 告警事件 */
export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  featureKey: string;
  severity: AlertSeverity;
  message: string;
  metricValue: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  actions: AlertActionResult[];
}

/** 告警动作结果 */
export interface AlertActionResult {
  type: AlertAction['type'];
  success: boolean;
  message?: string;
  timestamp: Date;
}

/** 健康状态 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** 健康报告 */
export interface HealthReport {
  featureKey: string;
  status: HealthStatus;
  errorRate: number;
  latencyP99: number;
  throughput: number;
  apdex: number;
  activeAlerts: AlertEvent[];
  lastChecked: Date;
  recommendation?: string;
}

/** 监控配置 */
export interface MonitoringConfig {
  collectInterval: number; // 数据收集间隔
  retentionPeriod: number; // 数据保留期
  alertCheckInterval: number; // 告警检查间隔
  baselineWindow: number; // 基线计算窗口
  onAlert?: (event: AlertEvent) => void;
  onHealthChange?: (report: HealthReport) => void;
}

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: MonitoringConfig = {
  collectInterval: 10000, // 10秒
  retentionPeriod: 3600000, // 1小时
  alertCheckInterval: 30000, // 30秒
  baselineWindow: 300000, // 5分钟
};

// ===================== 回滚条件 =====================

/** 回滚条件 */
export interface RollbackCondition {
  id: string;
  name: string;
  featureKey: string;
  conditions: RollbackRule[];
  action: 'rollback' | 'pause' | 'alert_only';
  enabled: boolean;
}

/** 回滚规则 */
export interface RollbackRule {
  metric: MetricType;
  operator: 'greater_than' | 'less_than' | 'increase_percent' | 'decrease_percent';
  threshold: number;
  duration?: number; // 持续超过阈值的时间
}

// ===================== 监控管理器 =====================

export class RolloutMonitor {
  private config: MonitoringConfig;
  private metrics: Map<string, MonitoringMetric> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertEvents: AlertEvent[] = [];
  private rollbackConditions: Map<string, RollbackCondition> = new Map();
  private collectTimer?: ReturnType<typeof setInterval>;
  private alertCheckTimer?: ReturnType<typeof setInterval>;
  private errorCounts: Map<string, number> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private latencies: Map<string, number[]> = new Map();

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
    this.startMonitoring();
  }

  /**
   * 从存储加载
   */
  private loadFromStorage(): void {
    try {
      // 加载告警规则
      const storedRules = localStorage.getItem('rollout_alert_rules');
      if (storedRules) {
        const rules = JSON.parse(storedRules) as AlertRule[];
        rules.forEach((rule) => this.alertRules.set(rule.id, rule));
      }

      // 加载回滚条件
      const storedConditions = localStorage.getItem('rollout_rollback_conditions');
      if (storedConditions) {
        const conditions = JSON.parse(storedConditions) as RollbackCondition[];
        conditions.forEach((cond) => this.rollbackConditions.set(cond.id, cond));
      }
    } catch (error) {
      console.error('Failed to load monitoring config:', error);
    }
  }

  /**
   * 保存到存储
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(
        'rollout_alert_rules',
        JSON.stringify(Array.from(this.alertRules.values())),
      );
      localStorage.setItem(
        'rollout_rollback_conditions',
        JSON.stringify(Array.from(this.rollbackConditions.values())),
      );
    } catch (error) {
      console.error('Failed to save monitoring config:', error);
    }
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    // 定期收集指标
    this.collectTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectInterval);

    // 定期检查告警
    this.alertCheckTimer = setInterval(() => {
      this.checkAlerts();
      this.checkRollbackConditions();
    }, this.config.alertCheckInterval);
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    // 清理过期数据
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.metrics.forEach((metric) => {
      metric.dataPoints = metric.dataPoints.filter((dp) => dp.timestamp.getTime() > cutoff);
    });
  }

  // ===================== 指标记录 =====================

  /**
   * 记录错误
   */
  recordError(featureKey: string, error?: Error, metadata?: Record<string, unknown>): void {
    const count = (this.errorCounts.get(featureKey) || 0) + 1;
    this.errorCounts.set(featureKey, count);

    this.addDataPoint(featureKey, 'error_rate', this.calculateErrorRate(featureKey), {
      error: error?.message,
      ...metadata,
    });
  }

  /**
   * 记录成功请求
   */
  recordSuccess(featureKey: string, latencyMs: number, metadata?: Record<string, unknown>): void {
    const count = (this.requestCounts.get(featureKey) || 0) + 1;
    this.requestCounts.set(featureKey, count);

    // 记录延迟
    if (!this.latencies.has(featureKey)) {
      this.latencies.set(featureKey, []);
    }
    const latencyList = this.latencies.get(featureKey)!;
    latencyList.push(latencyMs);

    // 保持最近 1000 条
    if (latencyList.length > 1000) {
      latencyList.shift();
    }

    // 添加延迟数据点
    this.addDataPoint(featureKey, 'latency_p99', this.calculateP99(featureKey), metadata);
  }

  /**
   * 记录自定义指标
   */
  recordMetric(
    featureKey: string,
    metricType: MetricType,
    value: number,
    metadata?: Record<string, unknown>,
  ): void {
    this.addDataPoint(featureKey, metricType, value, metadata);
  }

  /**
   * 添加数据点
   */
  private addDataPoint(
    featureKey: string,
    type: MetricType,
    value: number,
    tags?: Record<string, unknown>,
  ): void {
    const key = `${featureKey}:${type}`;
    let metric = this.metrics.get(key);

    if (!metric) {
      metric = {
        name: `${featureKey}_${type}`,
        type,
        featureKey,
        dataPoints: [],
      };
      this.metrics.set(key, metric);
    }

    metric.dataPoints.push({
      timestamp: new Date(),
      value,
      tags,
    });
  }

  /**
   * 计算错误率
   */
  private calculateErrorRate(featureKey: string): number {
    const errors = this.errorCounts.get(featureKey) || 0;
    const requests = this.requestCounts.get(featureKey) || 0;
    return requests > 0 ? errors / requests : 0;
  }

  /**
   * 计算 P99 延迟
   */
  private calculateP99(featureKey: string): number {
    const latencies = this.latencies.get(featureKey) || [];
    if (latencies.length === 0) return 0;

    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.ceil(0.99 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // ===================== 告警管理 =====================

  /**
   * 注册告警规则
   */
  registerAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.saveToStorage();
  }

  /**
   * 移除告警规则
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    this.saveToStorage();
  }

  /**
   * 获取告警规则
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * 检查告警
   */
  private checkAlerts(): void {
    this.alertRules.forEach((rule) => {
      if (!rule.enabled) return;

      // 检查冷却期
      if (rule.lastTriggered) {
        const elapsed = Date.now() - rule.lastTriggered.getTime();
        if (elapsed < rule.cooldownPeriod) return;
      }

      const metricValue = this.getCurrentMetricValue(rule.featureKey, rule.metricType);
      const shouldAlert = this.evaluateAlertCondition(rule, metricValue);

      if (shouldAlert) {
        this.triggerAlert(rule, metricValue);
      }
    });
  }

  /**
   * 获取当前指标值
   */
  private getCurrentMetricValue(featureKey: string, metricType: MetricType): number {
    switch (metricType) {
      case 'error_rate':
        return this.calculateErrorRate(featureKey);
      case 'latency_p99':
        return this.calculateP99(featureKey);
      case 'latency_p50':
      case 'latency_p90': {
        const latencies = this.latencies.get(featureKey) || [];
        if (latencies.length === 0) return 0;
        const sorted = [...latencies].sort((a, b) => a - b);
        const percentile = metricType === 'latency_p50' ? 0.5 : 0.9;
        const index = Math.ceil(percentile * sorted.length) - 1;
        return sorted[Math.max(0, index)];
      }
      default: {
        const key = `${featureKey}:${metricType}`;
        const metric = this.metrics.get(key);
        if (!metric || metric.dataPoints.length === 0) return 0;
        return metric.dataPoints[metric.dataPoints.length - 1].value;
      }
    }
  }

  /**
   * 评估告警条件
   */
  private evaluateAlertCondition(rule: AlertRule, currentValue: number): boolean {
    const { condition } = rule;
    const { operator, threshold } = condition;

    switch (operator) {
      case 'greater_than':
        return currentValue > threshold;
      case 'less_than':
        return currentValue < threshold;
      case 'equals':
        return currentValue === threshold;
      case 'not_equals':
        return currentValue !== threshold;
      case 'increase_by': {
        const baseline = this.getBaselineValue(rule.featureKey, rule.metricType);
        return currentValue > baseline * (1 + threshold / 100);
      }
      case 'decrease_by': {
        const baseline = this.getBaselineValue(rule.featureKey, rule.metricType);
        return currentValue < baseline * (1 - threshold / 100);
      }
      default:
        return false;
    }
  }

  /**
   * 获取基线值
   */
  private getBaselineValue(featureKey: string, metricType: MetricType): number {
    const key = `${featureKey}:${metricType}`;
    const metric = this.metrics.get(key);
    if (!metric || metric.dataPoints.length === 0) return 0;

    // 使用基线窗口内的平均值
    const cutoff = Date.now() - this.config.baselineWindow;
    const windowPoints = metric.dataPoints.filter((dp) => dp.timestamp.getTime() > cutoff);

    if (windowPoints.length === 0) return 0;
    const sum = windowPoints.reduce((acc, dp) => acc + dp.value, 0);
    return sum / windowPoints.length;
  }

  /**
   * 触发告警
   */
  private triggerAlert(rule: AlertRule, metricValue: number): void {
    const event: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      featureKey: rule.featureKey,
      severity: rule.severity,
      message: `Alert: ${rule.name} - ${rule.metricType} is ${metricValue} (threshold: ${rule.condition.threshold})`,
      metricValue,
      threshold: rule.condition.threshold,
      timestamp: new Date(),
      resolved: false,
      actions: [],
    };

    // 执行告警动作
    rule.actions.forEach((action) => {
      const result = this.executeAlertAction(action, rule, event);
      event.actions.push(result);
    });

    // 更新规则状态
    rule.lastTriggered = new Date();
    this.alertEvents.push(event);

    // 通知回调
    this.config.onAlert?.(event);

    console.warn('Alert triggered:', event);
  }

  /**
   * 执行告警动作
   */
  private executeAlertAction(
    action: AlertAction,
    rule: AlertRule,
    event: AlertEvent,
  ): AlertActionResult {
    const result: AlertActionResult = {
      type: action.type,
      success: false,
      timestamp: new Date(),
    };

    try {
      switch (action.type) {
        case 'rollback': {
          const rolloutManager = getRolloutManager();
          const rollout = rolloutManager.getRolloutByFeature(rule.featureKey);
          if (rollout) {
            rolloutManager.rollbackRollout(rollout.id, event.message);
            result.success = true;
            result.message = `Rolled back rollout: ${rollout.id}`;
          } else {
            result.message = 'No active rollout found';
          }
          break;
        }

        case 'pause': {
          const rolloutManager = getRolloutManager();
          const rollout = rolloutManager.getRolloutByFeature(rule.featureKey);
          if (rollout) {
            rolloutManager.pauseRollout(rollout.id);
            result.success = true;
            result.message = `Paused rollout: ${rollout.id}`;
          } else {
            result.message = 'No active rollout found';
          }
          break;
        }

        case 'notify': {
          // 发送通知（可以集成各种通知渠道）
          console.log('Notification:', event.message);
          result.success = true;
          result.message = 'Notification sent';
          break;
        }

        case 'webhook': {
          // 调用 webhook
          const webhookUrl = action.config.url as string;
          if (webhookUrl) {
            fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(event),
            })
              .then(() => {
                result.success = true;
                result.message = 'Webhook called';
              })
              .catch((err) => {
                result.message = `Webhook failed: ${err.message}`;
              });
          }
          break;
        }

        case 'custom': {
          const customHandler = action.config.handler as ((event: AlertEvent) => void) | undefined;
          if (customHandler) {
            customHandler(event);
            result.success = true;
            result.message = 'Custom action executed';
          }
          break;
        }
      }
    } catch (error) {
      result.message = `Action failed: ${(error as Error).message}`;
    }

    return result;
  }

  // ===================== 回滚条件管理 =====================

  /**
   * 注册回滚条件
   */
  registerRollbackCondition(condition: RollbackCondition): void {
    this.rollbackConditions.set(condition.id, condition);
    this.saveToStorage();
  }

  /**
   * 移除回滚条件
   */
  removeRollbackCondition(conditionId: string): void {
    this.rollbackConditions.delete(conditionId);
    this.saveToStorage();
  }

  /**
   * 检查回滚条件
   */
  private checkRollbackConditions(): void {
    this.rollbackConditions.forEach((condition) => {
      if (!condition.enabled) return;

      const shouldTrigger = condition.conditions.every((rule) => {
        const value = this.getCurrentMetricValue(condition.featureKey, rule.metric);
        return this.evaluateRollbackRule(rule, value, condition.featureKey);
      });

      if (shouldTrigger) {
        this.executeRollbackAction(condition);
      }
    });
  }

  /**
   * 评估回滚规则
   */
  private evaluateRollbackRule(
    rule: RollbackRule,
    currentValue: number,
    featureKey: string,
  ): boolean {
    switch (rule.operator) {
      case 'greater_than':
        return currentValue > rule.threshold;
      case 'less_than':
        return currentValue < rule.threshold;
      case 'increase_percent': {
        const baseline = this.getBaselineValue(featureKey, rule.metric);
        return baseline > 0 && ((currentValue - baseline) / baseline) * 100 > rule.threshold;
      }
      case 'decrease_percent': {
        const baseline = this.getBaselineValue(featureKey, rule.metric);
        return baseline > 0 && ((baseline - currentValue) / baseline) * 100 > rule.threshold;
      }
      default:
        return false;
    }
  }

  /**
   * 执行回滚动作
   */
  private executeRollbackAction(condition: RollbackCondition): void {
    const rolloutManager = getRolloutManager();
    const rollout = rolloutManager.getRolloutByFeature(condition.featureKey);

    if (!rollout) return;

    switch (condition.action) {
      case 'rollback':
        rolloutManager.rollbackRollout(rollout.id, `Auto rollback: ${condition.name}`);
        break;
      case 'pause':
        rolloutManager.pauseRollout(rollout.id);
        break;
      case 'alert_only':
        console.warn(`Rollback condition triggered (alert only): ${condition.name}`);
        break;
    }
  }

  // ===================== 健康报告 =====================

  /**
   * 获取健康报告
   */
  getHealthReport(featureKey: string): HealthReport {
    const errorRate = this.calculateErrorRate(featureKey);
    const latencyP99 = this.calculateP99(featureKey);
    const requests = this.requestCounts.get(featureKey) || 0;

    // 计算 Apdex
    const apdex = this.calculateApdex(featureKey);

    // 确定健康状态
    let status: HealthStatus = 'healthy';
    let recommendation: string | undefined;

    if (errorRate > 0.05 || latencyP99 > 3000) {
      status = 'unhealthy';
      recommendation = 'Consider rolling back or pausing the rollout';
    } else if (errorRate > 0.02 || latencyP99 > 1500) {
      status = 'degraded';
      recommendation = 'Monitor closely and consider pausing if metrics worsen';
    }

    // 获取活跃告警
    const activeAlerts = this.alertEvents.filter((e) => e.featureKey === featureKey && !e.resolved);

    return {
      featureKey,
      status,
      errorRate,
      latencyP99,
      throughput: requests,
      apdex,
      activeAlerts,
      lastChecked: new Date(),
      recommendation,
    };
  }

  /**
   * 计算 Apdex 分数
   */
  private calculateApdex(featureKey: string, targetLatency: number = 500): number {
    const latencies = this.latencies.get(featureKey) || [];
    if (latencies.length === 0) return 1;

    let satisfied = 0;
    let tolerating = 0;

    latencies.forEach((latency) => {
      if (latency <= targetLatency) {
        satisfied++;
      } else if (latency <= targetLatency * 4) {
        tolerating++;
      }
    });

    return (satisfied + tolerating / 2) / latencies.length;
  }

  /**
   * 获取所有健康报告
   */
  getAllHealthReports(): HealthReport[] {
    const featureKeys = new Set<string>();

    this.metrics.forEach((metric) => featureKeys.add(metric.featureKey));
    this.errorCounts.forEach((_, key) => featureKeys.add(key));
    this.requestCounts.forEach((_, key) => featureKeys.add(key));

    return Array.from(featureKeys).map((key) => this.getHealthReport(key));
  }

  /**
   * 获取告警事件
   */
  getAlertEvents(featureKey?: string, includeResolved: boolean = false): AlertEvent[] {
    let events = this.alertEvents;

    if (featureKey) {
      events = events.filter((e) => e.featureKey === featureKey);
    }

    if (!includeResolved) {
      events = events.filter((e) => !e.resolved);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 解决告警
   */
  resolveAlert(eventId: string): void {
    const event = this.alertEvents.find((e) => e.id === eventId);
    if (event) {
      event.resolved = true;
      event.resolvedAt = new Date();
    }
  }

  /**
   * 比较不同阶段/变体的指标
   */
  compareMetrics(
    featureKey: string,
    metricType: MetricType,
    groupA: string,
    groupB: string,
  ): {
    groupA: { avg: number; min: number; max: number };
    groupB: { avg: number; min: number; max: number };
    difference: number;
    percentChange: number;
  } | null {
    const keyA = `${featureKey}:${groupA}:${metricType}`;
    const keyB = `${featureKey}:${groupB}:${metricType}`;

    const metricA = this.metrics.get(keyA);
    const metricB = this.metrics.get(keyB);

    if (!metricA || !metricB) return null;

    const statsA = this.calculateStats(metricA.dataPoints);
    const statsB = this.calculateStats(metricB.dataPoints);

    return {
      groupA: statsA,
      groupB: statsB,
      difference: statsA.avg - statsB.avg,
      percentChange: statsB.avg !== 0 ? ((statsA.avg - statsB.avg) / statsB.avg) * 100 : 0,
    };
  }

  /**
   * 计算统计数据
   */
  private calculateStats(dataPoints: MetricDataPoint[]): {
    avg: number;
    min: number;
    max: number;
  } {
    if (dataPoints.length === 0) {
      return { avg: 0, min: 0, max: 0 };
    }

    const values = dataPoints.map((dp) => dp.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  /**
   * 重置指标
   */
  resetMetrics(featureKey?: string): void {
    if (featureKey) {
      this.errorCounts.delete(featureKey);
      this.requestCounts.delete(featureKey);
      this.latencies.delete(featureKey);

      const keysToDelete: string[] = [];
      this.metrics.forEach((_, key) => {
        if (key.startsWith(featureKey)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.metrics.delete(key));
    } else {
      this.errorCounts.clear();
      this.requestCounts.clear();
      this.latencies.clear();
      this.metrics.clear();
    }
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
    }
    if (this.alertCheckTimer) {
      clearInterval(this.alertCheckTimer);
    }
    this.metrics.clear();
    this.alertRules.clear();
    this.alertEvents = [];
  }
}

// ===================== 单例实例 =====================

let rolloutMonitor: RolloutMonitor | null = null;

/**
 * 获取监控器实例
 */
export function getRolloutMonitor(): RolloutMonitor {
  if (!rolloutMonitor) {
    rolloutMonitor = new RolloutMonitor();
  }
  return rolloutMonitor;
}

/**
 * 初始化监控器
 */
export function initRolloutMonitor(config?: Partial<MonitoringConfig>): RolloutMonitor {
  if (rolloutMonitor) {
    rolloutMonitor.destroy();
  }
  rolloutMonitor = new RolloutMonitor(config);
  return rolloutMonitor;
}

// ===================== 便捷函数 =====================

/**
 * 记录错误
 */
export function recordRolloutError(featureKey: string, error?: Error): void {
  getRolloutMonitor().recordError(featureKey, error);
}

/**
 * 记录成功
 */
export function recordRolloutSuccess(featureKey: string, latencyMs: number): void {
  getRolloutMonitor().recordSuccess(featureKey, latencyMs);
}

/**
 * 获取健康报告
 */
export function getFeatureHealthReport(featureKey: string): HealthReport {
  return getRolloutMonitor().getHealthReport(featureKey);
}

// ===================== 预定义告警规则 =====================

export const DEFAULT_ALERT_RULES: Omit<AlertRule, 'id' | 'featureKey'>[] = [
  {
    name: '高错误率告警',
    description: '当错误率超过 5% 时触发',
    metricType: 'error_rate',
    condition: {
      operator: 'greater_than',
      threshold: 0.05,
    },
    severity: 'critical',
    actions: [
      { type: 'rollback', config: {} },
      { type: 'notify', config: {} },
    ],
    enabled: true,
    cooldownPeriod: 300000, // 5分钟
  },
  {
    name: '高延迟告警',
    description: '当 P99 延迟超过 3 秒时触发',
    metricType: 'latency_p99',
    condition: {
      operator: 'greater_than',
      threshold: 3000,
    },
    severity: 'warning',
    actions: [
      { type: 'pause', config: {} },
      { type: 'notify', config: {} },
    ],
    enabled: true,
    cooldownPeriod: 300000,
  },
  {
    name: '错误率急剧上升告警',
    description: '当错误率比基线上升 100% 时触发',
    metricType: 'error_rate',
    condition: {
      operator: 'increase_by',
      threshold: 100,
      compareWith: 'baseline',
    },
    severity: 'critical',
    actions: [{ type: 'rollback', config: {} }],
    enabled: true,
    cooldownPeriod: 180000, // 3分钟
  },
];

/**
 * 创建默认告警规则
 */
export function createDefaultAlertRules(featureKey: string): AlertRule[] {
  return DEFAULT_ALERT_RULES.map((rule, index) => ({
    ...rule,
    id: `${featureKey}_rule_${index}`,
    featureKey,
  }));
}
