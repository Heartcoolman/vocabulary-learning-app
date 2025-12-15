/**
 * AMAS 监控 - 告警引擎
 *
 * 设计目标：
 * - KISS：仅支持阈值规则（operator + threshold）
 * - 支持 duration（持续触发才告警）与 cooldown（告警重复触发的最小间隔）
 * - 维护 active alerts 与 history（默认记录 firing 事件）
 *
 * 说明：
 * - cooldown 的语义对齐单测：在持续触发期间，超过 cooldown 后会再次产生 firing 事件（用于“重复提醒”）
 * - 当指标恢复正常时，active alert 会被清除（history 默认不记录 resolved 事件，避免噪声）
 */

import {
  AlertRule,
  AlertSeverity,
  AlertChannelConfig,
  ALERT_RULES,
  DEFAULT_ALERT_CHANNELS,
} from './alert-config';

export type AlertStatus = 'firing' | 'resolved';

export interface MetricValue {
  metric: string;
  value: number;
  timestamp: number;
}

export interface Alert {
  id: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  labels?: Record<string, string>;
  firedAt: Date;
}

export interface RuleState {
  rule: AlertRule;
  alert: Alert | null;
}

interface RuleRuntimeState {
  violationStartAt?: number;
  lastFiredAt?: number;
  alert: Alert | null;
}

function renderTemplate(
  template: string,
  vars: { value: number; threshold: number; metric: string; ruleName: string },
): string {
  return template
    .split('{value}')
    .join(String(vars.value))
    .split('{threshold}')
    .join(String(vars.threshold))
    .split('{metric}')
    .join(vars.metric)
    .split('{ruleName}')
    .join(vars.ruleName);
}

function compare(op: AlertRule['operator'], value: number, threshold: number): boolean {
  switch (op) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
    case '!=':
      return value !== threshold;
    default:
      return false;
  }
}

function toMs(seconds: number): number {
  return Math.max(0, seconds) * 1000;
}

export class AlertEngine {
  private readonly rules: AlertRule[];
  private readonly channels: AlertChannelConfig[];
  private readonly runtime = new Map<string, RuleRuntimeState>();
  private readonly history: Alert[] = [];
  private idSeq = 0;

  constructor(
    rules: AlertRule[] = ALERT_RULES,
    channels: AlertChannelConfig[] = DEFAULT_ALERT_CHANNELS,
  ) {
    this.rules = rules.filter((r) => r.enabled);
    this.channels = channels;

    for (const rule of this.rules) {
      this.runtime.set(rule.name, { alert: null });
    }
  }

  evaluateMetric(metricValue: MetricValue): Alert[] {
    if (
      !metricValue ||
      !Number.isFinite(metricValue.value) ||
      !Number.isFinite(metricValue.timestamp)
    ) {
      return [];
    }

    const now = metricValue.timestamp;
    const emitted: Alert[] = [];

    for (const rule of this.rules) {
      if (rule.metric !== metricValue.metric) continue;

      const state = this.runtime.get(rule.name) ?? { alert: null };
      const violated = compare(rule.operator, metricValue.value, rule.threshold);

      if (!violated) {
        state.violationStartAt = undefined;
        state.lastFiredAt = undefined;
        state.alert = null;
        this.runtime.set(rule.name, state);
        continue;
      }

      // duration 累计
      if (rule.duration > 0) {
        if (state.violationStartAt === undefined) {
          state.violationStartAt = now;
        }
        if (now - state.violationStartAt < toMs(rule.duration)) {
          this.runtime.set(rule.name, state);
          continue;
        }
      }

      // cooldown 检查（对齐单测：持续触发时允许周期性重复 firing）
      if (state.lastFiredAt !== undefined && rule.cooldown > 0) {
        if (now - state.lastFiredAt < toMs(rule.cooldown)) {
          this.runtime.set(rule.name, state);
          continue;
        }
      }

      const alert = this.createFiringAlert(rule, metricValue, now);
      state.alert = alert;
      state.lastFiredAt = now;
      this.runtime.set(rule.name, state);

      this.history.push(alert);
      emitted.push(alert);

      // 当前实现不依赖 channels；保留字段以支持后续扩展（例如 webhook/console 输出）
      void this.channels;
    }

    return emitted;
  }

  evaluateMetrics(metrics: MetricValue[]): Alert[] {
    if (!Array.isArray(metrics) || metrics.length === 0) return [];
    const alerts: Alert[] = [];
    for (const metric of metrics) {
      alerts.push(...this.evaluateMetric(metric));
    }
    return alerts;
  }

  getActiveAlerts(): Alert[] {
    const active: Alert[] = [];
    for (const state of this.runtime.values()) {
      if (state.alert && state.alert.status === 'firing') {
        active.push(state.alert);
      }
    }
    return active;
  }

  getAlertHistory(limit = 100): Alert[] {
    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0) return [];
    return this.history.slice(-safeLimit);
  }

  getRuleState(ruleName: string): RuleState | null {
    const rule = this.rules.find((r) => r.name === ruleName);
    if (!rule) return null;
    const state = this.runtime.get(ruleName) ?? { alert: null };
    return { rule, alert: state.alert ?? null };
  }

  manualResolveAlert(alertId: string): boolean {
    if (!alertId) return false;

    for (const [ruleName, state] of this.runtime.entries()) {
      if (state.alert?.id === alertId) {
        state.alert = null;
        state.violationStartAt = undefined;
        state.lastFiredAt = undefined;
        this.runtime.set(ruleName, state);
        return true;
      }
    }
    return false;
  }

  private createFiringAlert(rule: AlertRule, metricValue: MetricValue, now: number): Alert {
    const id = `${now}-${++this.idSeq}`;
    const template =
      rule.messageTemplate ?? '告警触发：{ruleName} ({metric}) value={value} threshold={threshold}';
    const message = renderTemplate(template, {
      value: metricValue.value,
      threshold: rule.threshold,
      metric: metricValue.metric,
      ruleName: rule.name,
    });

    return {
      id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      metric: metricValue.metric,
      value: metricValue.value,
      threshold: rule.threshold,
      message,
      labels: rule.labels,
      firedAt: new Date(now),
    };
  }
}

export function createDefaultAlertEngine(): AlertEngine {
  return new AlertEngine(ALERT_RULES, DEFAULT_ALERT_CHANNELS);
}
