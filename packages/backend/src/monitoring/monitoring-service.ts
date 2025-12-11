/**
 * Monitoring Service - Metric Aggregation and Alert Evaluation Loop
 *
 * Architecture:
 * - Captures raw metrics from amas-metrics at regular intervals
 * - Computes derived metrics (rates, percentiles) for alert evaluation
 * - Feeds AlertEngine with computed snapshots
 * - Provides API for accessing active alerts and history
 *
 * Performance:
 * - Evaluation loop: 30s interval with 5s jitter
 * - Non-blocking: uses queueMicrotask to avoid blocking event loop
 * - Memory-efficient: stateless snapshot computation
 */

import { AlertEngine, AlertMetricSnapshot, AlertEvent } from './alert-engine';
import {
  ALERT_RULES,
  AlertMetricKey,
  DEFAULT_EVALUATION_INTERVAL_MS,
  DEFAULT_EVALUATION_JITTER_MS,
} from './alert-rules';
import { amasMetrics } from './amas-metrics';
import { monitorLogger } from '../logger';

interface HistogramStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

/**
 * Raw snapshot captured from AMAS metrics.
 * Used for delta computation (rates, etc.).
 */
interface RawSnapshot {
  timestamp: number;
  http: {
    total: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    count: number;
    fiveXx: number;
  };
  db: {
    slowQueryTotal: number;
  };
  amas: {
    decisionConfidenceP50: number;
  };
}

export interface MonitoringServiceConfig {
  enabled?: boolean;
  evaluationIntervalMs?: number;
}

/**
 * Monitoring service orchestrates alert evaluation lifecycle.
 *
 * Responsibilities:
 * 1. Capture metric snapshots from amasMetrics
 * 2. Compute derived metrics (error rates, query rates)
 * 3. Feed AlertEngine with computed snapshots
 * 4. Expose active alerts and history via API
 */
export class MonitoringService {
  private readonly engine: AlertEngine;
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer?: NodeJS.Timeout;
  private lastSnapshot?: RawSnapshot;
  private running = false;
  private evaluating = false;
  private history: RawSnapshot[] = [];
  private readonly maxHistory = 12 * 60; // 最多保存 12 小时，每分钟 1 个点

  constructor(config: MonitoringServiceConfig = {}) {
    this.intervalMs = config.evaluationIntervalMs ?? DEFAULT_EVALUATION_INTERVAL_MS;
    this.enabled = config.enabled ?? true;
    this.engine = new AlertEngine(ALERT_RULES);
  }

  /**
   * Start alert evaluation loop.
   * Safe to call multiple times (idempotent).
   */
  start(): void {
    if (!this.enabled) {
      monitorLogger.info('Alerting disabled by config');
      return;
    }
    if (this.running) return;

    this.running = true;
    this.scheduleEvaluation();

    this.timer = setInterval(() => this.scheduleEvaluation(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();

    monitorLogger.info({ interval: this.intervalMs }, 'Alert loop started');
  }

  /**
   * Stop alert evaluation loop.
   * Safe to call multiple times (idempotent).
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.lastSnapshot = undefined;
    monitorLogger.info('Alert loop stopped');
  }

  /**
   * Get currently firing alerts.
   */
  getActiveAlerts(): AlertEvent[] {
    return this.engine.getActiveAlerts();
  }

  /**
   * Get alert history (most recent events).
   */
  getHistory(limit = 100): AlertEvent[] {
    return this.engine.getHistory(limit);
  }

  /**
   * Schedule evaluation on microtask queue to avoid blocking event loop.
   * Adds jitter to prevent lockstep behavior across multiple instances.
   */
  private scheduleEvaluation(): void {
    if (this.evaluating) return;
    this.evaluating = true;

    const jitter = Math.floor(Math.random() * DEFAULT_EVALUATION_JITTER_MS);
    setTimeout(() => {
      queueMicrotask(() => {
        try {
          const raw = this.captureSnapshot();
          const frame = this.buildSnapshot(raw);
          const changes = this.engine.evaluate(frame);
          this.pushHistory(raw);

          if (changes.length > 0) {
            monitorLogger.info({ count: changes.length }, 'Alert state change(s) processed');
          }
        } catch (error) {
          monitorLogger.error({ err: error }, 'Alert evaluation failed');
        } finally {
          this.evaluating = false;
        }
      });
    }, jitter);
  }

  /**
   * Build alert metric snapshot from raw snapshot.
   *
   * Computes derived metrics:
   * - http.request.duration.p95: direct from histogram
   * - decision.confidence.p50: direct from histogram
   * - db.slow_queries.per_min: delta / elapsed minutes
   * - http.error_rate.5xx: 5xx delta / total delta
   */
  private buildSnapshot(raw: RawSnapshot): AlertMetricSnapshot {
    const metrics: Partial<Record<AlertMetricKey, number>> = {};

    // Direct histogram metrics
    if (Number.isFinite(raw.http.p95)) {
      metrics['http.request.duration.p95'] = raw.http.p95;
    }
    if (Number.isFinite(raw.amas.decisionConfidenceP50)) {
      metrics['decision.confidence.p50'] = raw.amas.decisionConfidenceP50;
    }

    // Rate-based metrics (require previous snapshot for delta)
    if (this.lastSnapshot && raw.timestamp > this.lastSnapshot.timestamp) {
      const elapsedMinutes = (raw.timestamp - this.lastSnapshot.timestamp) / 60000;

      if (elapsedMinutes > 0) {
        // Slow query rate
        const slowDelta = raw.db.slowQueryTotal - this.lastSnapshot.db.slowQueryTotal;
        if (slowDelta >= 0) {
          metrics['db.slow_queries.per_min'] = slowDelta / elapsedMinutes;
        }

        // HTTP 5xx error rate
        const httpDelta = raw.http.total - this.lastSnapshot.http.total;
        const fiveXxDelta = raw.http.fiveXx - this.lastSnapshot.http.fiveXx;
        if (httpDelta > 0 && fiveXxDelta >= 0) {
          metrics['http.error_rate.5xx'] = fiveXxDelta / httpDelta;
        }
      }
    }

    // Reset baseline when counters reset (e.g., process restart)
    if (
      this.lastSnapshot &&
      (raw.http.total < this.lastSnapshot.http.total ||
        raw.db.slowQueryTotal < this.lastSnapshot.db.slowQueryTotal)
    ) {
      monitorLogger.info('Counter reset detected, resetting baseline');
      this.lastSnapshot = raw;
    } else {
      this.lastSnapshot = raw;
    }

    return { timestamp: raw.timestamp, metrics };
  }

  /**
   * Capture raw metrics from amasMetrics.
   */
  private captureSnapshot(): RawSnapshot {
    const timestamp = Date.now();
    const httpStats = amasMetrics.httpRequestDuration.getStats();
    const confidenceStats = amasMetrics.decisionConfidence.getStats();
    const httpCounts = this.collectHttpStatusCounts();

    return {
      timestamp,
      http: {
        total: httpCounts.total,
        avg: httpStats.avg,
        p50: httpStats.p50,
        p95: httpStats.p95,
        p99: httpStats.p99,
        count: httpStats.count,
        fiveXx: httpCounts.fiveXx,
      },
      db: {
        slowQueryTotal: amasMetrics.dbSlowQueryTotal.get(),
      },
      amas: {
        decisionConfidenceP50: confidenceStats.count > 0 ? confidenceStats.p50 : NaN,
      },
    };
  }

  /**
   * Collect HTTP status code counts from pre-aggregated counters.
   * Optimization: Uses dedicated 5xx counter instead of per-tick label scan.
   */
  private collectHttpStatusCounts(): { total: number; fiveXx: number } {
    const total = amasMetrics.httpRequestTotal.get();
    const fiveXx = amasMetrics.httpRequest5xxTotal.get();
    return { total, fiveXx };
  }

  /**
   * 保存原始快照到内存（环形缓冲）
   */
  private pushHistory(snapshot: RawSnapshot) {
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
  }

  /**
   * 获取指定时间范围内的原始快照
   */
  getSnapshots(rangeMinutes: number): RawSnapshot[] {
    const cutoff = Date.now() - rangeMinutes * 60 * 1000;
    return this.history.filter((s) => s.timestamp >= cutoff);
  }
}

// Shared instance for application lifecycle
export const alertMonitoringService = new MonitoringService();

/**
 * Start alert monitoring (idempotent).
 */
export function startAlertMonitoring(): void {
  alertMonitoringService.start();
}

/**
 * Stop alert monitoring (idempotent).
 */
export function stopAlertMonitoring(): void {
  alertMonitoringService.stop();
}
