/**
 * AMAS 监控 - 统一监控服务
 *
 * 职责：
 * - 对外提供“记录指标”的统一接口（封装 MetricsCollector）
 * - 周期性将聚合指标送入 AlertEngine 进行告警评估
 * - 对外暴露 active alerts、history 与健康度快照
 */

import { AlertEngine } from './alert-engine';
import { MetricsCollector, HealthStatus } from './metrics-collector';
import { DEFAULT_SLO, SLOConfig } from './alert-config';

export interface MonitoringConfig {
  enabled?: boolean;
  /** 指标聚合周期（ms），当前实现为占位 */
  collectionIntervalMs?: number;
  /** 告警评估周期（ms） */
  evaluationIntervalMs?: number;
  /** 自定义 SLO 阈值 */
  slo?: SLOConfig;
}

export interface MonitoringStats {
  running: boolean;
  activeAlerts: number;
  totalAlerts: number;
  health: HealthStatus;
}

export class MonitoringService {
  private readonly enabled: boolean;
  private readonly evaluationIntervalMs: number;
  private readonly engine: AlertEngine;
  private readonly collector: MetricsCollector;

  private running = false;
  private evaluationTimer?: NodeJS.Timeout;

  constructor(config: MonitoringConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.evaluationIntervalMs = config.evaluationIntervalMs ?? 30_000;
    this.engine = new AlertEngine();
    this.collector = new MetricsCollector(config.slo ?? DEFAULT_SLO);
    void config.collectionIntervalMs;
  }

  start(): void {
    if (!this.enabled) return;
    if (this.running) return;

    this.running = true;
    this.collector.start();

    this.evaluationTimer = setInterval(() => this.evaluateOnce(), this.evaluationIntervalMs);
    if (this.evaluationTimer.unref) this.evaluationTimer.unref();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }
    this.collector.stop();
  }

  // ==================== 记录接口 ====================

  recordDecisionLatency(ms: number): void {
    this.collector.recordDecisionLatency(ms);
  }

  recordError(): void {
    this.collector.recordError();
  }

  recordSuccess(): void {
    this.collector.recordSuccess();
  }

  recordDegradation(): void {
    this.collector.recordDegradation();
  }

  recordTimeout(): void {
    this.collector.recordTimeout();
  }

  recordCircuitState(isOpen: boolean): void {
    this.collector.recordCircuitState(isOpen);
  }

  recordRewardResult(success: boolean): void {
    this.collector.recordRewardResult(success);
  }

  // ==================== 查询接口 ====================

  getHealthStatus(): HealthStatus {
    return this.collector.getHealthStatus();
  }

  getActiveAlerts() {
    return this.engine.getActiveAlerts();
  }

  getAlertHistory(limit?: number) {
    return this.engine.getAlertHistory(limit);
  }

  resolveAlert(alertId: string): boolean {
    return this.engine.manualResolveAlert(alertId);
  }

  getStats(): MonitoringStats {
    const health = this.getHealthStatus();
    return {
      running: this.running && this.enabled,
      activeAlerts: this.engine.getActiveAlerts().length,
      totalAlerts: this.engine.getAlertHistory(Number.MAX_SAFE_INTEGER).length,
      health,
    };
  }

  private evaluateOnce(): void {
    const metrics = this.collector.collectMetrics();
    this.engine.evaluateMetrics(metrics);
  }
}

export const monitoringService = new MonitoringService();

export function startGlobalMonitoring(): void {
  monitoringService.start();
}

export function stopGlobalMonitoring(): void {
  monitoringService.stop();
}
