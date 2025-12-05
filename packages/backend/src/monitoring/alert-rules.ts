/**
 * Alert Rule Catalog for AMAS Monitoring System
 *
 * Defines threshold and trend-based alerting rules for critical system metrics.
 * Rules are categorized by severity (P0-P3) and support:
 * - Threshold comparison (>, >=, <, <=, ==, !=)
 * - Trend detection (increasing/decreasing slopes)
 * - Consecutive period requirements (anti-flapping)
 * - Cooldown periods (notification rate limiting)
 */

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertRuleType = 'threshold' | 'trend';

/**
 * Metric keys that can be monitored by alert rules.
 * These are computed from raw AMAS metrics in monitoring-service.
 */
export type AlertMetricKey =
  | 'http.request.duration.p95'
  | 'db.slow_queries.per_min'
  | 'http.error_rate.5xx'
  | 'decision.confidence.p50';

export interface BaseAlertRule {
  id: string;
  description: string;
  severity: AlertSeverity;
  metric: AlertMetricKey;
  type: AlertRuleType;
  cooldownSeconds: number;
  labels?: Record<string, string>;
  /** Consecutive evaluation periods required before firing (anti-flapping) */
  consecutivePeriods?: number;
  /** Pre-formatted message for notifications */
  message?: string;
}

export interface ThresholdRule extends BaseAlertRule {
  type: 'threshold';
  comparison: '>' | '>=' | '<' | '<=' | '==' | '!=';
  threshold: number;
}

export interface TrendRule extends BaseAlertRule {
  type: 'trend';
  /** Direction of slope to monitor */
  direction: 'increasing' | 'decreasing';
  /** Number of samples to use for slope calculation */
  windowSize: number;
  /** Minimum slope (per minute) required to trigger */
  minSlope: number;
  /** Minimum absolute value required before evaluating trend */
  floor?: number;
}

export type AlertRule = ThresholdRule | TrendRule;

export const DEFAULT_EVALUATION_INTERVAL_MS = 30_000; // 30 seconds
export const DEFAULT_EVALUATION_JITTER_MS = 5_000; // 5 second jitter

/**
 * Production alert rules for AMAS system.
 *
 * P0: Critical issues affecting availability or core functionality
 * P1: Warning conditions that may lead to degradation
 */
export const ALERT_RULES: AlertRule[] = [
  // ==================== P0 Rules ====================

  {
    id: 'http_latency_p95_p0',
    description: 'HTTP p95 latency above 1s (availability risk)',
    severity: 'P0',
    metric: 'http.request.duration.p95',
    type: 'threshold',
    comparison: '>',
    threshold: 1.0, // seconds
    consecutivePeriods: 2, // require 2 consecutive periods to avoid single-spike alerts
    cooldownSeconds: 300, // 5 minutes
    labels: { component: 'edge', signal: 'latency', priority: 'P0' },
    message: 'P0: http_request_duration p95 exceeded 1s'
  },

  {
    id: 'db_slow_queries_rate_p0',
    description: 'Slow DB queries above 10/min (backend overload)',
    severity: 'P0',
    metric: 'db.slow_queries.per_min',
    type: 'threshold',
    comparison: '>',
    threshold: 10,
    consecutivePeriods: 1,
    cooldownSeconds: 300, // 5 minutes
    labels: { component: 'database', signal: 'slow_query' },
    message: 'P0: db_slow_query_total rate above 10/min'
  },

  // ==================== P1 Rules ====================

  {
    id: 'http_5xx_rate_p1',
    description: 'HTTP 5xx rate exceeds 1%',
    severity: 'P1',
    metric: 'http.error_rate.5xx',
    type: 'threshold',
    comparison: '>',
    threshold: 0.01, // 1%
    consecutivePeriods: 2,
    cooldownSeconds: 180, // 3 minutes
    labels: { component: 'edge', signal: 'error_rate', priority: 'P1' },
    message: 'P1: http 5xx error-rate over 1%'
  },

  {
    id: 'http_5xx_rate_trend_p1',
    description: 'HTTP 5xx rate rising quickly (trend detection)',
    severity: 'P1',
    metric: 'http.error_rate.5xx',
    type: 'trend',
    direction: 'increasing',
    windowSize: 3,
    minSlope: 0.002, // +0.2% per minute slope
    floor: 0.0025, // only evaluate trend once base error rate is non-trivial
    consecutivePeriods: 1,
    cooldownSeconds: 300, // 5 minutes
    labels: { component: 'edge', signal: 'error_rate_trend', priority: 'P1' },
    message: 'P1: http 5xx error-rate accelerating upward'
  },

  {
    id: 'decision_confidence_low_p1',
    description: 'Decision confidence median falling below 0.5',
    severity: 'P1',
    metric: 'decision.confidence.p50',
    type: 'threshold',
    comparison: '<',
    threshold: 0.5,
    consecutivePeriods: 2,
    cooldownSeconds: 180, // 3 minutes
    labels: { component: 'amas', signal: 'quality', priority: 'P1' },
    message: 'P1: decision_confidence p50 below 0.5'
  }
];
