/**
 * AMAS 监控 - 告警配置
 *
 * 该模块为 AMAS 监控子系统提供最小可用的配置与类型：
 * - AlertRule/AlertSeverity：告警规则定义
 * - ALERT_RULES：默认规则集合（用于单测与基础使用）
 * - DEFAULT_ALERT_CHANNELS：默认通知渠道配置（当前仅占位，便于扩展）
 * - DEFAULT_SLO：健康度评估阈值（供 MetricsCollector 使用）
 */

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type AlertOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface AlertRule {
  name: string;
  description: string;
  severity: AlertSeverity;
  metric: string;
  operator: AlertOperator;
  threshold: number;
  /** 持续时间（秒）：指标持续触发达到该时长后才进入 firing */
  duration: number;
  /** 冷却时间（秒）：firing 期间重复触发的最小间隔 */
  cooldown: number;
  enabled: boolean;
  labels?: Record<string, string>;
  /** 支持占位符：{value}、{threshold}、{metric}、{ruleName} */
  messageTemplate?: string;
}

export type NotificationChannel = 'console' | 'webhook';

export interface AlertChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
}

export const DEFAULT_ALERT_CHANNELS: AlertChannelConfig[] = [
  { channel: 'console', enabled: true },
  { channel: 'webhook', enabled: false },
];

/**
 * 默认告警规则（尽量保持简单，仅覆盖 AMAS 核心链路指标）
 */
export const ALERT_RULES: AlertRule[] = [
  {
    name: 'DecisionLatencyP99High',
    description: '决策 P99 延迟过高',
    severity: 'P2',
    metric: 'amas.decision.latency_p99',
    operator: '>',
    threshold: 500,
    duration: 0,
    cooldown: 300,
    enabled: true,
    messageTemplate: 'AMAS 决策延迟过高：{value}ms > {threshold}ms',
    labels: { component: 'amas', signal: 'latency' },
  },
];

/**
 * SLO 阈值配置（单位：ms 或 rate）
 *
 * - decisionLatencyP95 / decisionLatencyP99：决策链路延迟阈值
 * - errorRateDegraded / errorRateUnhealthy：错误率阈值
 * - circuitOpenRateDegraded / circuitOpenRateUnhealthy：熔断打开比例阈值
 * - rewardFailureRateDegraded / rewardFailureRateUnhealthy：奖励处理失败比例阈值
 */
export interface SLOConfig {
  decisionLatencyP95: number;
  decisionLatencyP99: number;
  errorRateDegraded: number;
  errorRateUnhealthy: number;
  circuitOpenRateDegraded: number;
  circuitOpenRateUnhealthy: number;
  rewardFailureRateDegraded: number;
  rewardFailureRateUnhealthy: number;
}

export const DEFAULT_SLO: SLOConfig = {
  decisionLatencyP95: 150,
  decisionLatencyP99: 500,
  errorRateDegraded: 0.2,
  errorRateUnhealthy: 0.5,
  circuitOpenRateDegraded: 0.3,
  circuitOpenRateUnhealthy: 0.5,
  rewardFailureRateDegraded: 0.1,
  rewardFailureRateUnhealthy: 0.5,
};
