/**
 * Alert Engine - 告警引擎
 * 评估规则，触发告警，管理告警生命周期
 */

import {
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertChannel,
  ALERT_RULES,
  DEFAULT_ALERT_CHANNELS
} from './alert-config';
import { monitorLogger } from '../../logger';

/**
 * 告警事件
 */
export interface Alert {
  /** 告警ID */
  id: string;
  /** 规则名称 */
  ruleName: string;
  /** 严重级别 */
  severity: AlertSeverity;
  /** 告警状态 */
  status: AlertStatus;
  /** 告警消息 */
  message: string;
  /** 指标值 */
  value: number;
  /** 阈值 */
  threshold: number;
  /** 标签 */
  labels: Record<string, string>;
  /** 触发时间 */
  firedAt: Date;
  /** 解决时间 */
  resolvedAt?: Date;
  /** 最后更新时间 */
  lastUpdateAt: Date;
}

/**
 * 告警状态跟踪
 */
interface AlertState {
  /** 当前告警 */
  alert: Alert | null;
  /** 上次触发时间 */
  lastFiredAt: number;
  /** 超过阈值的持续时间(秒) */
  exceedDuration: number;
  /** 上次检查时间 */
  lastCheckAt: number;
}

/**
 * 指标值
 */
export interface MetricValue {
  /** 指标名称 */
  metric: string;
  /** 指标值 */
  value: number;
  /** 时间戳 */
  timestamp: number;
  /** 标签 */
  labels?: Record<string, string>;
}

/**
 * 告警引擎
 */
export class AlertEngine {
  private rules: Map<string, AlertRule> = new Map();
  private states: Map<string, AlertState> = new Map();
  private channels: AlertChannel[] = [];
  private alertHistory: Alert[] = [];

  constructor(
    rules: AlertRule[] = ALERT_RULES,
    channels: AlertChannel[] = DEFAULT_ALERT_CHANNELS
  ) {
    // 加载规则
    rules.filter(r => r.enabled).forEach(rule => {
      this.rules.set(rule.name, rule);
      this.states.set(rule.name, {
        alert: null,
        lastFiredAt: 0,
        exceedDuration: 0,
        lastCheckAt: Date.now()
      });
    });

    // 加载通道
    this.channels = channels.filter(c => c.enabled);
  }

  /**
   * 评估指标并触发告警
   */
  evaluateMetric(metric: MetricValue): Alert[] {
    const firedAlerts: Alert[] = [];
    const now = Date.now();

    // 遍历所有规则
    for (const [ruleName, rule] of this.rules.entries()) {
      if (rule.metric !== metric.metric) continue;

      const state = this.states.get(ruleName)!;
      const timeSinceLastCheck = (now - state.lastCheckAt) / 1000;

      // 检查是否超过阈值
      const isExceeded = this.checkThreshold(metric.value, rule.operator, rule.threshold);

      if (isExceeded) {
        // 累积超过阈值的持续时间
        state.exceedDuration += timeSinceLastCheck;

        // 检查是否达到触发持续时间
        if (state.exceedDuration >= rule.duration) {
          // 检查冷却时间
          const timeSinceLastFired = (now - state.lastFiredAt) / 1000;
          if (timeSinceLastFired >= rule.cooldown) {
            // 触发告警
            const alert = this.fireAlert(rule, metric.value, now);
            state.alert = alert;
            state.lastFiredAt = now;
            firedAlerts.push(alert);
          }
        }
      } else {
        // 重置持续时间
        state.exceedDuration = 0;

        // 如果有活动告警，解决它
        if (state.alert && state.alert.status === 'firing') {
          this.resolveAlert(state.alert, now);
        }
      }

      state.lastCheckAt = now;
    }

    return firedAlerts;
  }

  /**
   * 批量评估多个指标
   */
  evaluateMetrics(metrics: MetricValue[]): Alert[] {
    const allAlerts: Alert[] = [];
    for (const metric of metrics) {
      const alerts = this.evaluateMetric(metric);
      allAlerts.push(...alerts);
    }
    return allAlerts;
  }

  /**
   * 获取所有活动告警
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.states.values())
      .filter(state => state.alert && state.alert.status === 'firing')
      .map(state => state.alert!);
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * 获取规则状态
   */
  getRuleState(ruleName: string): AlertState | null {
    return this.states.get(ruleName) ?? null;
  }

  /**
   * 手动解决告警
   */
  manualResolveAlert(alertId: string): boolean {
    for (const state of this.states.values()) {
      if (state.alert && state.alert.id === alertId) {
        this.resolveAlert(state.alert, Date.now());
        return true;
      }
    }
    return false;
  }

  /**
   * 触发告警
   */
  private fireAlert(rule: AlertRule, value: number, timestamp: number): Alert {
    const alert: Alert = {
      id: this.generateAlertId(rule.name, timestamp),
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      message: this.formatMessage(rule.messageTemplate || rule.description, value, rule.threshold),
      value,
      threshold: rule.threshold,
      labels: rule.labels || {},
      firedAt: new Date(timestamp),
      lastUpdateAt: new Date(timestamp)
    };

    // 添加到历史
    this.alertHistory.push(alert);

    // 发送告警
    this.sendAlert(alert);

    monitorLogger.warn({ alertId: alert.id, message: alert.message, severity: alert.severity }, 'Alert fired');

    return alert;
  }

  /**
   * 解决告警
   */
  private resolveAlert(alert: Alert, timestamp: number): void {
    alert.status = 'resolved';
    alert.resolvedAt = new Date(timestamp);
    alert.lastUpdateAt = new Date(timestamp);

    // 发送解决通知
    this.sendAlert(alert);

    monitorLogger.info({ alertId: alert.id, ruleName: alert.ruleName }, 'Alert resolved');
  }

  /**
   * 发送告警到所有通道
   */
  private sendAlert(alert: Alert): void {
    for (const channel of this.channels) {
      // 检查严重级别过滤
      if (this.shouldSendToChannel(alert.severity, channel.minSeverity)) {
        this.sendToChannel(alert, channel);
      }
    }
  }

  /**
   * 发送告警到指定通道
   */
  private sendToChannel(alert: Alert, channel: AlertChannel): void {
    try {
      switch (channel.type) {
        case 'console':
          this.sendToConsole(alert);
          break;
        case 'webhook':
          this.sendToWebhook(alert, channel.config);
          break;
        // 其他通道可扩展
        default:
          monitorLogger.warn({ channelType: channel.type }, 'Unknown channel type');
      }
    } catch (error) {
      monitorLogger.error({ err: error, channelName: channel.name }, 'Failed to send alert');
    }
  }

  /**
   * 发送到控制台
   */
  private sendToConsole(alert: Alert): void {
    const logData = {
      severity: alert.severity,
      status: alert.status,
      message: alert.message
    };
    if (alert.status === 'firing') {
      monitorLogger.warn(logData, 'Console alert');
    } else {
      monitorLogger.info(logData, 'Console alert');
    }
  }

  /**
   * 发送到 Webhook
   */
  private async sendToWebhook(alert: Alert, config: any): Promise<void> {
    if (!config.url) return;

    const payload = {
      id: alert.id,
      ruleName: alert.ruleName,
      severity: alert.severity,
      status: alert.status,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      labels: alert.labels,
      firedAt: alert.firedAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString()
    };

    // 异步发送，不阻塞主流程
    fetch(config.url, {
      method: config.method || 'POST',
      headers: config.headers || { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(error => {
      monitorLogger.error({ err: error, url: config.url }, 'Webhook send failed');
    });
  }

  /**
   * 检查阈值
   */
  private checkThreshold(
    value: number,
    operator: string,
    threshold: number
  ): boolean {
    switch (operator) {
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

  /**
   * 检查是否应该发送到通道
   */
  private shouldSendToChannel(
    alertSeverity: AlertSeverity,
    minSeverity: AlertSeverity
  ): boolean {
    const severityOrder: AlertSeverity[] = ['P0', 'P1', 'P2', 'P3'];
    const alertLevel = severityOrder.indexOf(alertSeverity);
    const minLevel = severityOrder.indexOf(minSeverity);
    return alertLevel <= minLevel;
  }

  /**
   * 格式化告警消息
   */
  private formatMessage(
    template: string,
    value: number,
    threshold: number
  ): string {
    return template
      .replace('{value}', value.toFixed(2))
      .replace('{threshold}', threshold.toFixed(2));
  }

  /**
   * 生成告警ID
   */
  private generateAlertId(ruleName: string, timestamp: number): string {
    return `${ruleName}_${timestamp}`;
  }

  /**
   * 获取严重级别颜色
   */
  private getSeverityColor(severity: AlertSeverity): string {
    const colors = {
      P0: '\x1b[31m', // 红色
      P1: '\x1b[33m', // 黄色
      P2: '\x1b[36m', // 青色
      P3: '\x1b[37m' // 白色
    };
    return colors[severity] + '%s\x1b[0m';
  }
}

/**
 * 创建默认告警引擎
 */
export function createDefaultAlertEngine(): AlertEngine {
  return new AlertEngine(ALERT_RULES, DEFAULT_ALERT_CHANNELS);
}
