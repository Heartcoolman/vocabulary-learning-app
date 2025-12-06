/**
 * Monitoring Service - 监控服务
 * 整合告警引擎和指标采集器，提供统一的监控接口
 */

import { AlertEngine, createDefaultAlertEngine, Alert } from './alert-engine';
import {
  MetricsCollector,
  createDefaultMetricsCollector,
  HealthStatus
} from './metrics-collector';
import { SLOConfig, DEFAULT_SLO } from './alert-config';
import { monitorLogger } from '../../logger';

/**
 * 监控服务配置
 */
export interface MonitoringConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 指标采集间隔(毫秒) */
  collectionIntervalMs: number;
  /** 告警评估间隔(毫秒) */
  evaluationIntervalMs: number;
  /** SLO配置 */
  slo: SLOConfig;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MonitoringConfig = {
  enabled: true,
  collectionIntervalMs: 60000, // 每分钟
  evaluationIntervalMs: 30000, // 每30秒
  slo: DEFAULT_SLO
};

/**
 * 监控服务
 */
export class MonitoringService {
  private config: MonitoringConfig;
  private collector: MetricsCollector;
  private alertEngine: AlertEngine;
  private evaluationHandle?: NodeJS.Timeout;
  private running: boolean = false;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.collector = createDefaultMetricsCollector();
    this.alertEngine = createDefaultAlertEngine();
  }

  /**
   * 启动监控服务
   */
  start(): void {
    if (!this.config.enabled) {
      monitorLogger.debug('Disabled by config');
      return;
    }

    if (this.running) {
      monitorLogger.warn('Already running');
      return;
    }

    // 启动指标采集
    this.collector.start();

    // 启动告警评估
    this.evaluationHandle = setInterval(() => {
      this.evaluateAlerts();
    }, this.config.evaluationIntervalMs);

    this.running = true;
    monitorLogger.info('Started');
  }

  /**
   * 停止监控服务
   */
  stop(): void {
    if (!this.running) return;

    // 停止指标采集
    this.collector.stop();

    // 停止告警评估
    if (this.evaluationHandle) {
      clearInterval(this.evaluationHandle);
      this.evaluationHandle = undefined;
    }

    this.running = false;
    monitorLogger.info('Stopped');
  }

  /**
   * 记录决策延迟
   */
  recordDecisionLatency(latencyMs: number): void {
    this.collector.recordDecisionLatency(latencyMs);
  }

  /**
   * 记录错误
   */
  recordError(): void {
    this.collector.recordError();
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.collector.recordSuccess();
  }

  /**
   * 记录降级
   */
  recordDegradation(): void {
    this.collector.recordDegradation();
  }

  /**
   * 记录超时
   */
  recordTimeout(): void {
    this.collector.recordTimeout();
  }

  /**
   * 记录熔断器状态
   */
  recordCircuitState(isOpen: boolean): void {
    this.collector.recordCircuitState(isOpen);
  }

  /**
   * 记录延迟奖励结果
   */
  recordRewardResult(success: boolean): void {
    this.collector.recordRewardResult(success);
  }

  /**
   * 获取健康状态
   */
  getHealthStatus(): HealthStatus {
    return this.collector.getHealthStatus();
  }

  /**
   * 获取活动告警
   */
  getActiveAlerts(): Alert[] {
    return this.alertEngine.getActiveAlerts();
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertEngine.getAlertHistory(limit);
  }

  /**
   * 手动解决告警
   */
  resolveAlert(alertId: string): boolean {
    return this.alertEngine.manualResolveAlert(alertId);
  }

  /**
   * 评估告警
   */
  private evaluateAlerts(): void {
    try {
      // 采集指标
      const metrics = this.collector.collectMetrics();

      // 评估告警
      const firedAlerts = this.alertEngine.evaluateMetrics(metrics);

      if (firedAlerts.length > 0) {
        monitorLogger.info({ count: firedAlerts.length }, 'Alerts fired');
      }
    } catch (error) {
      monitorLogger.error({ err: error }, 'Alert evaluation failed');
    }
  }

  /**
   * 获取监控统计
   */
  getStats(): {
    running: boolean;
    activeAlerts: number;
    totalAlerts: number;
    health: HealthStatus;
  } {
    const health = this.getHealthStatus();
    const activeAlerts = this.getActiveAlerts();
    const allAlerts = this.getAlertHistory(1000);

    return {
      running: this.running,
      activeAlerts: activeAlerts.length,
      totalAlerts: allAlerts.length,
      health
    };
  }
}

/**
 * 全局监控服务实例
 */
export const monitoringService = new MonitoringService();

/**
 * 启动全局监控服务
 */
export function startGlobalMonitoring(): void {
  monitoringService.start();
}

/**
 * 停止全局监控服务
 */
export function stopGlobalMonitoring(): void {
  monitoringService.stop();
}
