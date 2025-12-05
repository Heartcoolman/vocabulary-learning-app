/**
 * Alert Engine - Rule Evaluation, Lifecycle Management, and Webhook Notification
 *
 * Architecture:
 * - AlertEngine: Evaluates rules against metric snapshots, manages alert state lifecycle
 * - WebhookNotifier: Async notification delivery with retry and rate limiting
 *
 * Performance:
 * - Evaluation target: <10ms per tick
 * - Non-blocking I/O: Webhook calls are fire-and-forget
 * - Memory-efficient: Fixed-size history buffer (200 events)
 */

import axios from 'axios';
import {
  ALERT_RULES,
  AlertMetricKey,
  AlertRule,
  AlertSeverity,
  ThresholdRule,
  TrendRule
} from './alert-rules';
import { monitorLogger } from '../logger';

export type AlertLifecycleStatus = 'pending' | 'firing' | 'resolved';

/**
 * Alert event representing a state transition (firing or resolved).
 */
export interface AlertEvent {
  id: string;
  ruleId: string;
  metric: AlertMetricKey;
  severity: AlertSeverity;
  status: AlertLifecycleStatus;
  message: string;
  value: number;
  threshold?: number;
  trendSlope?: number;
  labels?: Record<string, string>;
  occurredAt: number;
}

/**
 * Snapshot of pre-computed metric values pushed into the engine.
 * The monitoring service captures raw metrics and builds this snapshot.
 */
export interface AlertMetricSnapshot {
  timestamp: number;
  metrics: Partial<Record<AlertMetricKey, number>>;
}

/**
 * Internal state tracking for each rule.
 */
interface RuleState {
  status: AlertLifecycleStatus;
  consecutive: number;
  series: Array<{ ts: number; value: number }>;
  lastNotifiedAt?: number;
  lastValue?: number;
}

interface WebhookNotifierOptions {
  genericUrl?: string;
  slackUrl?: string;
  timeoutMs?: number;
  maxPerMinute?: number;
  retryCount?: number;
  retryDelayMs?: number;
}

interface WebhookTarget {
  url: string;
  kind: 'generic' | 'slack';
}

/**
 * Webhook notifier with retry logic and token bucket rate limiting.
 *
 * Rate limiting prevents overwhelming webhook endpoints during alert storms.
 * Retry logic handles transient network failures.
 */
class WebhookNotifier {
  private readonly options: Required<
    Pick<WebhookNotifierOptions, 'timeoutMs' | 'maxPerMinute' | 'retryCount' | 'retryDelayMs'>
  >;
  private readonly genericUrl?: string;
  private readonly slackUrl?: string;
  private sentTimestamps: number[] = [];

  constructor(options: WebhookNotifierOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 2500,
      maxPerMinute: options.maxPerMinute ?? 12,
      retryCount: options.retryCount ?? 3,
      retryDelayMs: options.retryDelayMs ?? 500
    };
    this.genericUrl = options.genericUrl ?? process.env.ALERT_WEBHOOK_URL;
    this.slackUrl = options.slackUrl ?? process.env.SLACK_WEBHOOK_URL;
  }

  async notify(event: AlertEvent): Promise<void> {
    const targets = this.getTargets();
    if (targets.length === 0) return;

    // Fire webhooks concurrently to avoid slow endpoint blocking others
    const promises = targets.map(async target => {
      if (!this.consumeToken()) {
        monitorLogger.warn('Webhook rate limited, skipping notification');
        return;
      }

      const payload =
        target.kind === 'slack' ? this.toSlackPayload(event) : this.toGenericPayload(event);

      try {
        await this.sendWithRetry(target.url, payload);
      } catch (error) {
        monitorLogger.error({ err: error, kind: target.kind }, 'Failed to send alert to webhook');
      }
    });

    await Promise.all(promises);
  }

  private getTargets(): WebhookTarget[] {
    const targets: WebhookTarget[] = [];
    if (this.genericUrl) {
      targets.push({ url: this.genericUrl, kind: 'generic' });
    }
    if (this.slackUrl) {
      targets.push({ url: this.slackUrl, kind: 'slack' });
    }
    return targets;
  }

  /**
   * Token bucket rate limiter: tracks sent timestamps in a 60-second window.
   */
  private consumeToken(): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    this.sentTimestamps = this.sentTimestamps.filter(ts => now - ts < windowMs);

    if (this.sentTimestamps.length >= this.options.maxPerMinute) {
      return false;
    }

    this.sentTimestamps.push(now);
    return true;
  }

  private toGenericPayload(event: AlertEvent): Record<string, unknown> {
    return {
      id: event.id,
      ruleId: event.ruleId,
      metric: event.metric,
      severity: event.severity,
      status: event.status,
      message: event.message,
      value: event.value,
      threshold: event.threshold,
      trendSlope: event.trendSlope,
      labels: event.labels,
      occurredAt: new Date(event.occurredAt).toISOString()
    };
  }

  private toSlackPayload(event: AlertEvent): Record<string, unknown> {
    const emoji = event.status === 'resolved' ? ':white_check_mark:' : ':rotating_light:';
    const title = `${emoji} [${event.severity}] ${event.ruleId}`;
    const summary = `Status: ${event.status.toUpperCase()} | Metric: ${event.metric} | Value: ${event.value.toFixed(4)}`;
    const thresholdText = event.threshold !== undefined ? `Threshold: ${event.threshold}` : '';
    const trendText =
      event.trendSlope !== undefined ? `Trend: ${event.trendSlope.toFixed(4)}/min` : '';

    return {
      text: `${title}\n${summary} ${thresholdText} ${trendText}\n${event.message}`
    };
  }

  private async sendWithRetry(url: string, payload: Record<string, unknown>): Promise<void> {
    for (let attempt = 1; attempt <= this.options.retryCount; attempt++) {
      try {
        await axios.post(url, payload, {
          timeout: this.options.timeoutMs,
          validateStatus: () => true
        });
        return;
      } catch (error) {
        if (attempt === this.options.retryCount) {
          throw error;
        }
        await this.delay(this.options.retryDelayMs * attempt);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Core alert engine: evaluates rules against snapshots and manages alert lifecycle.
 *
 * Lifecycle states:
 * - pending: Violation detected but not yet consecutive enough to fire
 * - firing: Alert is active and notifications are sent (respecting cooldown)
 * - resolved: Violation cleared, resolution notification sent
 *
 * Anti-flapping: consecutivePeriods requirement prevents single-spike alerts
 * Deduplication: cooldownSeconds prevents notification spam
 */
export class AlertEngine {
  private readonly rules: AlertRule[];
  private readonly notifier: WebhookNotifier;
  private readonly states: Map<string, RuleState> = new Map();
  private readonly history: AlertEvent[] = [];
  private readonly ruleIndex: Map<string, AlertRule> = new Map();
  private readonly maxHistory = 200;

  constructor(rules: AlertRule[] = ALERT_RULES, notifier?: WebhookNotifier) {
    this.rules = rules;
    this.notifier = notifier ?? new WebhookNotifier();

    for (const rule of rules) {
      this.ruleIndex.set(rule.id, rule);
      this.states.set(rule.id, {
        status: 'resolved',
        consecutive: 0,
        series: []
      });
    }
  }

  /**
   * Evaluate all rules against the provided metric snapshot.
   * Returns array of alert events (firing or resolved transitions).
   *
   * Performance: O(rules) with O(1) state lookup per rule.
   */
  evaluate(snapshot: AlertMetricSnapshot): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const rule of this.rules) {
      const value = snapshot.metrics[rule.metric];
      if (value === undefined || value === null || !Number.isFinite(value)) {
        continue;
      }

      const state = this.states.get(rule.id) ?? this.createState();
      const event =
        rule.type === 'trend'
          ? this.evaluateTrend(rule as TrendRule, state, value, snapshot.timestamp)
          : this.evaluateThreshold(rule as ThresholdRule, state, value, snapshot.timestamp);

      this.states.set(rule.id, state);

      if (event) {
        events.push(event);
        this.history.push(event);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
        this.dispatch(event, rule, state);
      }
    }

    return events;
  }

  /**
   * Get all currently firing alerts with current state.
   */
  getActiveAlerts(): AlertEvent[] {
    const now = Date.now();
    return this.rules
      .filter(rule => this.states.get(rule.id)?.status === 'firing')
      .map(rule => {
        const state = this.states.get(rule.id)!;
        const slope =
          rule.type === 'trend' ? this.calculateSlope(state.series) ?? undefined : undefined;
        return {
          id: `${rule.id}:active`,
          ruleId: rule.id,
          metric: rule.metric,
          severity: rule.severity,
          status: 'firing' as const,
          message: this.formatMessage(rule, state.lastValue ?? 0, slope),
          value: state.lastValue ?? 0,
          threshold: rule.type === 'threshold' ? rule.threshold : undefined,
          trendSlope: slope,
          labels: rule.labels,
          occurredAt: state.lastNotifiedAt ?? now
        };
      });
  }

  /**
   * Get alert history (most recent events).
   */
  getHistory(limit = 100): AlertEvent[] {
    return this.history.slice(-limit);
  }

  /**
   * Evaluate threshold rule: compare value against threshold.
   */
  private evaluateThreshold(
    rule: ThresholdRule,
    state: RuleState,
    value: number,
    ts: number
  ): AlertEvent | null {
    const violation = this.compare(value, rule.threshold, rule.comparison);

    if (violation) {
      state.consecutive += 1;
      state.status = state.consecutive >= (rule.consecutivePeriods ?? 1) ? 'firing' : 'pending';
      state.lastValue = value;

      if (state.status === 'firing') {
        return this.buildEvent(rule, 'firing', value, ts);
      }
    } else {
      const wasFiring = state.status === 'firing';
      state.status = 'resolved';
      state.consecutive = 0;
      state.lastValue = value;
      // Reset cooldown on resolution to allow immediate re-fire if condition recurs
      state.lastNotifiedAt = undefined;
      return wasFiring ? this.buildEvent(rule, 'resolved', value, ts) : null;
    }

    return null;
  }

  /**
   * Evaluate trend rule: compute slope and check direction/magnitude.
   */
  private evaluateTrend(
    rule: TrendRule,
    state: RuleState,
    value: number,
    ts: number
  ): AlertEvent | null {
    state.series.push({ ts, value });
    if (state.series.length > rule.windowSize) {
      state.series.shift();
    }

    // Wait for sufficient samples
    if (state.series.length < 2 || state.series.length < rule.windowSize) {
      state.status = 'pending';
      state.lastValue = value;
      return null;
    }

    const slope = this.calculateSlope(state.series);
    const meetsDirection =
      slope !== null &&
      ((rule.direction === 'increasing' && slope >= rule.minSlope) ||
        (rule.direction === 'decreasing' && slope <= -rule.minSlope));
    const meetsFloor = rule.floor === undefined || value >= rule.floor;

    if (slope !== null && meetsDirection && meetsFloor) {
      state.consecutive += 1;
      state.status = state.consecutive >= (rule.consecutivePeriods ?? 1) ? 'firing' : 'pending';
      state.lastValue = value;

      if (state.status === 'firing') {
        return this.buildEvent(rule, 'firing', value, ts, slope);
      }
    } else {
      const wasFiring = state.status === 'firing';
      state.status = 'resolved';
      state.consecutive = 0;
      state.lastValue = value;
      // Reset cooldown on resolution to allow immediate re-fire if condition recurs
      state.lastNotifiedAt = undefined;
      return wasFiring ? this.buildEvent(rule, 'resolved', value, ts, slope ?? undefined) : null;
    }

    return null;
  }

  /**
   * Calculate linear slope from time-series data (per minute).
   */
  private calculateSlope(series: Array<{ ts: number; value: number }>): number | null {
    if (series.length < 2) return null;

    const first = series[0];
    const last = series[series.length - 1];
    const minutes = (last.ts - first.ts) / 60000;

    if (minutes <= 0) return null;

    return (last.value - first.value) / minutes;
  }

  /**
   * Compare value against threshold using specified operator.
   */
  private compare(
    value: number,
    threshold: number,
    comparison: ThresholdRule['comparison']
  ): boolean {
    switch (comparison) {
      case '>':
        return value > threshold;
      case '>=':
        return value >= threshold;
      case '<':
        return value < threshold;
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
   * Build alert event object.
   */
  private buildEvent(
    rule: AlertRule,
    status: Exclude<AlertLifecycleStatus, 'pending'>,
    value: number,
    ts: number,
    slope?: number
  ): AlertEvent {
    const message = this.formatMessage(rule, value, slope);
    return {
      id: `${rule.id}:${ts}:${status}`,
      ruleId: rule.id,
      metric: rule.metric,
      severity: rule.severity,
      status,
      message,
      value,
      threshold: rule.type === 'threshold' ? (rule as ThresholdRule).threshold : undefined,
      trendSlope: slope,
      labels: rule.labels,
      occurredAt: ts
    };
  }

  /**
   * Format alert message with context.
   */
  private formatMessage(rule: AlertRule, value: number, slope?: number): string {
    const numeric = Number.isFinite(value) ? value.toFixed(4) : 'n/a';

    if (rule.type === 'threshold') {
      const unit = rule.metric === 'http.request.duration.p95' ? 's' : '';
      return (
        rule.message ??
        `${rule.description}: ${numeric}${unit} (${rule.comparison} ${(rule as ThresholdRule).threshold})`
      );
    }

    const slopeText = slope !== undefined ? slope.toFixed(4) : 'n/a';
    return rule.message ?? `${rule.description}: value=${numeric}, slope=${slopeText}/min`;
  }

  /**
   * Dispatch notification for alert event (respects cooldown).
   */
  private dispatch(event: AlertEvent, rule: AlertRule, state: RuleState): void {
    if (event.status === 'firing') {
      const now = event.occurredAt;
      if (state.lastNotifiedAt && now - state.lastNotifiedAt < rule.cooldownSeconds * 1000) {
        return; // Still in cooldown period
      }
      state.lastNotifiedAt = now;
    }

    // Fire and forget: webhook calls are async and don't block evaluation
    void this.notifier.notify(event);
  }

  /**
   * Create initial state for a rule.
   */
  private createState(): RuleState {
    return { status: 'resolved', consecutive: 0, series: [] };
  }
}
