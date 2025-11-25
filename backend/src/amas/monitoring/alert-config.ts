/**
 * Alert Configuration - 告警配置
 * 定义告警规则、阈值和分级
 */

/**
 * 告警严重级别
 */
export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * 告警状态
 */
export type AlertStatus = 'firing' | 'resolved';

/**
 * 告警规则
 */
export interface AlertRule {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 严重级别 */
  severity: AlertSeverity;
  /** 指标名称 */
  metric: string;
  /** 比较操作符 */
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  /** 阈值 */
  threshold: number;
  /** 持续时间(秒),指标必须持续超过阈值多久才触发告警 */
  duration: number;
  /** 告警间隔(秒),相同告警的最小间隔 */
  cooldown: number;
  /** 是否启用 */
  enabled: boolean;
  /** 标签(用于分组和路由) */
  labels?: Record<string, string>;
  /** 告警消息模板 */
  messageTemplate?: string;
}

/**
 * SLO/SLA 指标配置
 */
export interface SLOConfig {
  /** 决策延迟 P95 (毫秒) */
  decisionLatencyP95: number;
  /** 决策延迟 P99 (毫秒) */
  decisionLatencyP99: number;
  /** 错误率阈值 (0-1) */
  errorRate: number;
  /** 熔断器打开率阈值 (0-1) */
  circuitOpenRate: number;
  /** 降级率阈值 (0-1) */
  degradationRate: number;
  /** 超时率阈值 (0-1) */
  timeoutRate: number;
  /** 延迟奖励队列积压阈值 */
  rewardQueueBacklog: number;
  /** 延迟奖励失败率阈值 (0-1) */
  rewardFailureRate: number;
}

/**
 * 默认 SLO 配置
 */
export const DEFAULT_SLO: SLOConfig = {
  decisionLatencyP95: 100, // 100ms
  decisionLatencyP99: 200, // 200ms
  errorRate: 0.05, // 5%
  circuitOpenRate: 0.1, // 10%
  degradationRate: 0.2, // 20%
  timeoutRate: 0.05, // 5%
  rewardQueueBacklog: 1000, // 1000个任务
  rewardFailureRate: 0.1 // 10%
};

/**
 * 预定义告警规则
 */
export const ALERT_RULES: AlertRule[] = [
  // P0: 关键告警(立即响应)
  {
    name: 'DecisionLatencyP99Critical',
    description: '决策延迟P99超过关键阈值',
    severity: 'P0',
    metric: 'amas.decision.latency_p99',
    operator: '>',
    threshold: 500, // 500ms
    duration: 60, // 持续1分钟
    cooldown: 300, // 5分钟冷却
    enabled: true,
    labels: { component: 'decision', impact: 'user_experience' },
    messageTemplate:
      '🚨 [P0] AMAS决策延迟P99达到 {value}ms，超过阈值 {threshold}ms！可能影响用户体验。'
  },
  {
    name: 'ErrorRateCritical',
    description: '系统错误率超过关键阈值',
    severity: 'P0',
    metric: 'amas.error_rate',
    operator: '>',
    threshold: 0.1, // 10%
    duration: 120, // 持续2分钟
    cooldown: 600, // 10分钟冷却
    enabled: true,
    labels: { component: 'system', impact: 'availability' },
    messageTemplate: '🚨 [P0] AMAS系统错误率达到 {value}%，超过阈值 {threshold}%！'
  },

  // P1: 高优先级告警(工作时间响应)
  {
    name: 'DecisionLatencyP95High',
    description: '决策延迟P95超过目标阈值',
    severity: 'P1',
    metric: 'amas.decision.latency_p95',
    operator: '>',
    threshold: 150, // 150ms
    duration: 300, // 持续5分钟
    cooldown: 600, // 10分钟冷却
    enabled: true,
    labels: { component: 'decision', impact: 'performance' },
    messageTemplate:
      '⚠️ [P1] AMAS决策延迟P95达到 {value}ms，超过目标 {threshold}ms。'
  },
  {
    name: 'CircuitBreakerOpen',
    description: '熔断器处于打开状态',
    severity: 'P1',
    metric: 'amas.circuit.open_rate',
    operator: '>',
    threshold: 0.3, // 30%时间处于打开
    duration: 180, // 持续3分钟
    cooldown: 600, // 10分钟冷却
    enabled: true,
    labels: { component: 'circuit', impact: 'availability' },
    messageTemplate:
      '⚠️ [P1] AMAS熔断器打开率达到 {value}%，服务可能不稳定。'
  },
  {
    name: 'DegradationRateHigh',
    description: '降级率过高',
    severity: 'P1',
    metric: 'amas.degradation_rate',
    operator: '>',
    threshold: 0.3, // 30%
    duration: 300, // 持续5分钟
    cooldown: 600, // 10分钟冷却
    enabled: true,
    labels: { component: 'fallback', impact: 'quality' },
    messageTemplate:
      '⚠️ [P1] AMAS降级率达到 {value}%，大量请求使用降级策略。'
  },
  {
    name: 'RewardQueueBacklog',
    description: '延迟奖励队列积压',
    severity: 'P1',
    metric: 'amas.reward_queue.backlog',
    operator: '>',
    threshold: 1000, // 1000个任务
    duration: 600, // 持续10分钟
    cooldown: 1800, // 30分钟冷却
    enabled: true,
    labels: { component: 'reward', impact: 'data_quality' },
    messageTemplate:
      '⚠️ [P1] 延迟奖励队列积压达到 {value}个任务，可能影响模型更新。'
  },

  // P2: 中优先级告警(工作时间关注)
  {
    name: 'TimeoutRateModerate',
    description: '超时率偏高',
    severity: 'P2',
    metric: 'amas.timeout_rate',
    operator: '>',
    threshold: 0.05, // 5%
    duration: 600, // 持续10分钟
    cooldown: 1800, // 30分钟冷却
    enabled: true,
    labels: { component: 'decision', impact: 'performance' },
    messageTemplate: 'ℹ️ [P2] AMAS超时率达到 {value}%，请关注性能问题。'
  },
  {
    name: 'RewardFailureRateModerate',
    description: '延迟奖励失败率偏高',
    severity: 'P2',
    metric: 'amas.reward.failure_rate',
    operator: '>',
    threshold: 0.15, // 15%
    duration: 900, // 持续15分钟
    cooldown: 3600, // 1小时冷却
    enabled: true,
    labels: { component: 'reward', impact: 'data_quality' },
    messageTemplate:
      'ℹ️ [P2] 延迟奖励失败率达到 {value}%，部分模型更新可能失败。'
  },

  // P3: 低优先级告警(信息性)
  {
    name: 'DecisionLatencyP95Elevated',
    description: '决策延迟P95略高',
    severity: 'P3',
    metric: 'amas.decision.latency_p95',
    operator: '>',
    threshold: 120, // 120ms
    duration: 900, // 持续15分钟
    cooldown: 3600, // 1小时冷却
    enabled: true,
    labels: { component: 'decision', impact: 'minor' },
    messageTemplate:
      'ℹ️ [P3] AMAS决策延迟P95为 {value}ms，略高于优化目标。'
  }
];

/**
 * 告警通道配置
 */
export interface AlertChannel {
  /** 通道类型 */
  type: 'console' | 'webhook' | 'email' | 'slack';
  /** 通道名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 严重级别过滤(只接收指定级别或更高的告警) */
  minSeverity: AlertSeverity;
  /** 配置参数 */
  config: Record<string, any>;
}

/**
 * 默认告警通道
 */
export const DEFAULT_ALERT_CHANNELS: AlertChannel[] = [
  {
    type: 'console',
    name: 'Console Logger',
    enabled: true,
    minSeverity: 'P3', // 所有告警都输出到控制台
    config: {}
  },
  {
    type: 'webhook',
    name: 'Webhook (P0/P1)',
    enabled: false, // 需要配置后启用
    minSeverity: 'P1',
    config: {
      url: process.env.ALERT_WEBHOOK_URL || '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }
];

/**
 * 告警分级响应时间 SLA
 */
export const ALERT_SLA: Record<AlertSeverity, { responseTime: string; description: string }> = {
  P0: {
    responseTime: '立即(15分钟内)',
    description: '关键告警,影响核心功能,需要立即响应'
  },
  P1: {
    responseTime: '1小时内',
    description: '高优先级,影响性能或部分功能,工作时间内响应'
  },
  P2: {
    responseTime: '4小时内',
    description: '中优先级,影响较小,工作时间内关注'
  },
  P3: {
    responseTime: '24小时内',
    description: '低优先级,信息性告警,常规处理'
  }
};
