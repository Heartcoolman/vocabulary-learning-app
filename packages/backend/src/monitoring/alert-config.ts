/**
 * 告警配置中心
 *
 * 提供完整的告警配置，包括：
 * - 错误率阈值告警
 * - 响应时间告警
 * - 可用性告警
 * - 通知渠道配置
 */

import { AlertRule, AlertSeverity } from './alert-rules';
import { env } from '../config/env';

// ============================================
// 类型定义
// ============================================

/** 通知渠道类型 */
export type NotificationChannel = 'email' | 'webhook' | 'slack' | 'dingtalk' | 'console';

/** 通知配置 */
export interface NotificationConfig {
  channel: NotificationChannel;
  enabled: boolean;
  /** 最小告警级别（P0最高，P3最低） */
  minSeverity: AlertSeverity;
  /** 速率限制（分钟） */
  rateLimitMinutes: number;
  /** 渠道特定配置 */
  config: Record<string, unknown>;
}

/** Webhook 配置 */
export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeout: number;
  [key: string]: unknown;
}

/** 邮件配置 */
export interface EmailConfig {
  to: string[];
  cc?: string[];
  from: string;
  subject: string;
  [key: string]: unknown;
}

/** 告警升级配置 */
export interface EscalationConfig {
  /** 升级延迟（分钟） */
  delayMinutes: number;
  /** 升级后的严重程度 */
  toSeverity: AlertSeverity;
  /** 额外通知渠道 */
  additionalChannels: NotificationChannel[];
}

/** 告警抑制配置 */
export interface SuppressionConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 抑制匹配规则 */
  matchers: {
    /** 规则 ID 正则匹配 */
    ruleIdPattern?: string;
    /** 标签匹配 */
    labels?: Record<string, string>;
  }[];
  /** 抑制时间段（小时） */
  timeWindows?: {
    start: number; // 0-23
    end: number; // 0-23
    days?: number[]; // 0=周日, 1=周一...
  }[];
}

/** 完整告警配置 */
export interface AlertConfiguration {
  /** 是否启用告警系统 */
  enabled: boolean;
  /** 评估间隔（毫秒） */
  evaluationIntervalMs: number;
  /** 通知配置 */
  notifications: NotificationConfig[];
  /** 升级配置 */
  escalation: EscalationConfig[];
  /** 抑制配置 */
  suppression: SuppressionConfig;
  /** 自定义规则（覆盖默认规则） */
  customRules?: Partial<AlertRule>[];
}

// ============================================
// 默认配置
// ============================================

/**
 * 默认通知配置
 */
const DEFAULT_NOTIFICATIONS: NotificationConfig[] = [
  {
    channel: 'console',
    enabled: true,
    minSeverity: 'P3',
    rateLimitMinutes: 1,
    config: {},
  },
  {
    channel: 'webhook',
    enabled: false,
    minSeverity: 'P1',
    rateLimitMinutes: 5,
    config: {
      url: '',
      method: 'POST',
      timeout: 5000,
    } as WebhookConfig,
  },
  {
    channel: 'email',
    enabled: false,
    minSeverity: 'P0',
    rateLimitMinutes: 15,
    config: {
      to: [],
      from: 'alerts@danci.app',
      subject: '[Danci Alert] {{severity}}: {{ruleName}}',
    } as EmailConfig,
  },
];

/**
 * 默认升级配置
 */
const DEFAULT_ESCALATION: EscalationConfig[] = [
  {
    delayMinutes: 15,
    toSeverity: 'P0',
    additionalChannels: ['email'],
  },
];

/**
 * 默认抑制配置
 */
const DEFAULT_SUPPRESSION: SuppressionConfig = {
  enabled: false,
  matchers: [],
  timeWindows: [],
};

/**
 * 获取告警配置
 * 根据环境变量和默认值构建配置
 */
export function getAlertConfiguration(): AlertConfiguration {
  return {
    enabled: env.NODE_ENV !== 'test',
    evaluationIntervalMs: 30000,
    notifications: DEFAULT_NOTIFICATIONS,
    escalation: DEFAULT_ESCALATION,
    suppression: DEFAULT_SUPPRESSION,
  };
}

// ============================================
// 扩展告警规则
// ============================================

/**
 * 扩展的告警规则
 * 补充默认规则，增加更多监控维度
 */
export const EXTENDED_ALERT_RULES: AlertRule[] = [
  // ==================== 可用性告警 ====================
  {
    id: 'availability_health_check_failed',
    description: '健康检查失败',
    severity: 'P0',
    metric: 'http.error_rate.5xx',
    type: 'threshold',
    comparison: '>',
    threshold: 0.5, // 50% 错误率视为不可用
    consecutivePeriods: 3,
    cooldownSeconds: 60,
    labels: { component: 'availability', signal: 'health_check' },
    message: 'P0: 系统可用性告警 - 健康检查失败率过高',
  },

  // ==================== 响应时间告警 ====================
  {
    id: 'http_latency_p95_warning',
    description: 'HTTP P95 延迟超过 500ms（警告）',
    severity: 'P2',
    metric: 'http.request.duration.p95',
    type: 'threshold',
    comparison: '>',
    threshold: 0.5, // 500ms
    consecutivePeriods: 3,
    cooldownSeconds: 300,
    labels: { component: 'edge', signal: 'latency', priority: 'P2' },
    message: 'P2: HTTP P95 响应时间超过 500ms',
  },

  {
    id: 'http_latency_trend_rising',
    description: 'HTTP 延迟持续上升趋势',
    severity: 'P2',
    metric: 'http.request.duration.p95',
    type: 'trend',
    direction: 'increasing',
    windowSize: 5,
    minSlope: 0.05, // 每分钟增加 50ms
    floor: 0.1, // 基准延迟超过 100ms 才检测趋势
    consecutivePeriods: 2,
    cooldownSeconds: 600,
    labels: { component: 'edge', signal: 'latency_trend', priority: 'P2' },
    message: 'P2: HTTP 响应时间呈上升趋势',
  },

  // ==================== 错误率告警 ====================
  {
    id: 'http_4xx_rate_high',
    description: 'HTTP 4xx 错误率过高',
    severity: 'P2',
    metric: 'http.error_rate.5xx', // 注意：实际需要 4xx 指标
    type: 'threshold',
    comparison: '>',
    threshold: 0.1, // 10%
    consecutivePeriods: 3,
    cooldownSeconds: 300,
    labels: { component: 'edge', signal: 'client_error_rate', priority: 'P2' },
    message: 'P2: HTTP 4xx 客户端错误率超过 10%',
  },

  {
    id: 'http_5xx_rate_critical',
    description: 'HTTP 5xx 错误率严重',
    severity: 'P0',
    metric: 'http.error_rate.5xx',
    type: 'threshold',
    comparison: '>',
    threshold: 0.05, // 5%
    consecutivePeriods: 2,
    cooldownSeconds: 120,
    labels: { component: 'edge', signal: 'server_error_rate', priority: 'P0' },
    message: 'P0: HTTP 5xx 服务端错误率超过 5%',
  },

  // ==================== 数据库告警 ====================
  {
    id: 'db_slow_queries_warning',
    description: '慢查询警告',
    severity: 'P2',
    metric: 'db.slow_queries.per_min',
    type: 'threshold',
    comparison: '>',
    threshold: 5,
    consecutivePeriods: 2,
    cooldownSeconds: 300,
    labels: { component: 'database', signal: 'slow_query', priority: 'P2' },
    message: 'P2: 数据库慢查询每分钟超过 5 次',
  },

  {
    id: 'db_slow_queries_trend',
    description: '慢查询上升趋势',
    severity: 'P1',
    metric: 'db.slow_queries.per_min',
    type: 'trend',
    direction: 'increasing',
    windowSize: 5,
    minSlope: 1, // 每分钟增加 1 次慢查询
    floor: 2,
    consecutivePeriods: 2,
    cooldownSeconds: 600,
    labels: { component: 'database', signal: 'slow_query_trend', priority: 'P1' },
    message: 'P1: 数据库慢查询呈上升趋势',
  },

  // ==================== AMAS 算法质量告警 ====================
  {
    id: 'amas_confidence_very_low',
    description: 'AMAS 决策置信度极低',
    severity: 'P0',
    metric: 'decision.confidence.p50',
    type: 'threshold',
    comparison: '<',
    threshold: 0.3,
    consecutivePeriods: 3,
    cooldownSeconds: 300,
    labels: { component: 'amas', signal: 'quality', priority: 'P0' },
    message: 'P0: AMAS 决策置信度中位数低于 0.3，算法可能异常',
  },

  {
    id: 'amas_confidence_declining',
    description: 'AMAS 决策置信度下降趋势',
    severity: 'P2',
    metric: 'decision.confidence.p50',
    type: 'trend',
    direction: 'decreasing',
    windowSize: 5,
    minSlope: -0.02, // 每分钟下降 0.02
    floor: 0.4,
    consecutivePeriods: 2,
    cooldownSeconds: 600,
    labels: { component: 'amas', signal: 'quality_trend', priority: 'P2' },
    message: 'P2: AMAS 决策置信度呈下降趋势',
  },
];

// ============================================
// 告警阈值常量
// ============================================

/**
 * 告警阈值配置
 * 集中管理所有告警阈值，便于调整
 */
export const ALERT_THRESHOLDS = {
  // HTTP 相关
  http: {
    /** P95 延迟阈值 */
    latency: {
      warning: 500, // ms
      critical: 1000, // ms
      severe: 2000, // ms
    },
    /** 错误率阈值 */
    errorRate: {
      warning: 0.01, // 1%
      critical: 0.05, // 5%
      severe: 0.1, // 10%
    },
  },

  // 数据库相关
  database: {
    /** 慢查询每分钟阈值 */
    slowQueries: {
      warning: 5,
      critical: 10,
      severe: 20,
    },
    /** 连接池使用率阈值 */
    connectionPoolUsage: {
      warning: 0.7, // 70%
      critical: 0.85, // 85%
      severe: 0.95, // 95%
    },
  },

  // AMAS 相关
  amas: {
    /** 决策置信度阈值 */
    confidence: {
      warning: 0.5,
      critical: 0.3,
      severe: 0.2,
    },
  },

  // 系统资源
  system: {
    /** 内存使用率阈值 */
    memoryUsage: {
      warning: 0.7, // 70%
      critical: 0.85, // 85%
      severe: 0.95, // 95%
    },
    /** CPU 使用率阈值 */
    cpuUsage: {
      warning: 0.7, // 70%
      critical: 0.85, // 85%
      severe: 0.95, // 95%
    },
  },
};

// ============================================
// 告警消息模板
// ============================================

/**
 * 告警消息模板
 */
export const ALERT_MESSAGE_TEMPLATES = {
  threshold: {
    triggered:
      '[{{severity}}] {{ruleName}}: {{metric}} 当前值 {{currentValue}}{{unit}} {{comparison}} 阈值 {{threshold}}{{unit}}',
    resolved: '[已恢复] {{ruleName}}: {{metric}} 已恢复正常，当前值 {{currentValue}}{{unit}}',
  },
  trend: {
    triggered: '[{{severity}}] {{ruleName}}: {{metric}} 呈 {{direction}} 趋势，斜率 {{slope}}',
    resolved: '[已恢复] {{ruleName}}: {{metric}} 趋势已稳定',
  },
};

/**
 * 格式化告警消息
 */
export function formatAlertMessage(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    if (value === undefined) return `{{${key}}}`;
    if (typeof value === 'number') {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  });
}

// ============================================
// 告警级别描述
// ============================================

/**
 * 告警级别描述
 */
export const SEVERITY_DESCRIPTIONS: Record<
  AlertSeverity,
  { name: string; description: string; color: string }
> = {
  P0: {
    name: '紧急',
    description: '影响核心功能或系统可用性，需要立即处理',
    color: '#f44336',
  },
  P1: {
    name: '重要',
    description: '可能导致服务降级，需要尽快处理',
    color: '#ff9800',
  },
  P2: {
    name: '警告',
    description: '存在潜在问题，需要关注',
    color: '#ffeb3b',
  },
  P3: {
    name: '信息',
    description: '一般性提示信息',
    color: '#2196f3',
  },
};

// ============================================
// 导出
// ============================================

export { DEFAULT_NOTIFICATIONS, DEFAULT_ESCALATION, DEFAULT_SUPPRESSION };
