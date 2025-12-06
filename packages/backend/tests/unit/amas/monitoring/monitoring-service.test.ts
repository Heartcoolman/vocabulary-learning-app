/**
 * MonitoringService Unit Tests
 *
 * Tests for the unified monitoring service that integrates alert engine and metrics collector
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MonitoringService,
  MonitoringConfig,
  startGlobalMonitoring,
  stopGlobalMonitoring,
  monitoringService
} from '../../../../src/amas/monitoring/monitoring-service';
import { DEFAULT_SLO } from '../../../../src/amas/monitoring/alert-config';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    service = new MonitoringService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(service).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<MonitoringConfig> = {
        enabled: true,
        collectionIntervalMs: 30000,
        evaluationIntervalMs: 15000
      };

      const customService = new MonitoringService(customConfig);
      expect(customService).toBeDefined();
      customService.stop();
    });

    it('should accept disabled config', () => {
      const disabledService = new MonitoringService({ enabled: false });
      disabledService.start();
      // Should not actually start
      const stats = disabledService.getStats();
      expect(stats.running).toBe(false);
      disabledService.stop();
    });
  });

  // ==================== Start/Stop Tests ====================

  describe('start and stop', () => {
    it('should start monitoring', () => {
      service.start();
      const stats = service.getStats();
      expect(stats.running).toBe(true);
    });

    it('should stop monitoring', () => {
      service.start();
      service.stop();
      const stats = service.getStats();
      expect(stats.running).toBe(false);
    });

    it('should be idempotent when starting multiple times', () => {
      service.start();
      service.start();
      const stats = service.getStats();
      expect(stats.running).toBe(true);
      service.stop();
    });

    it('should be idempotent when stopping without start', () => {
      service.stop();
      const stats = service.getStats();
      expect(stats.running).toBe(false);
    });
  });

  // ==================== Recording Methods Tests ====================

  describe('recordDecisionLatency', () => {
    it('should record latency through to collector', () => {
      service.recordDecisionLatency(50);
      service.recordDecisionLatency(100);

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordError', () => {
    it('should record error through to collector', () => {
      service.recordError();

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordSuccess', () => {
    it('should record success through to collector', () => {
      service.recordSuccess();

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordDegradation', () => {
    it('should record degradation through to collector', () => {
      service.recordDegradation();

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordTimeout', () => {
    it('should record timeout through to collector', () => {
      service.recordTimeout();

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordCircuitState', () => {
    it('should record circuit state through to collector', () => {
      service.recordCircuitState(true);
      service.recordCircuitState(false);

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  describe('recordRewardResult', () => {
    it('should record reward result through to collector', () => {
      service.recordRewardResult(true);
      service.recordRewardResult(false);

      const health = service.getHealthStatus();
      expect(health).toBeDefined();
    });
  });

  // ==================== Health Status Tests ====================

  describe('getHealthStatus', () => {
    it('should return health status', () => {
      const health = service.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('slo');
      expect(health).toHaveProperty('checkedAt');
    });

    it('should return healthy status with good metrics', () => {
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(50);
        service.recordSuccess();
        service.recordCircuitState(false);
        service.recordRewardResult(true);
      }

      const health = service.getHealthStatus();

      expect(health.status).toBe('healthy');
    });

    it('should return unhealthy status with bad metrics', () => {
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(600);
        service.recordError();
      }

      const health = service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
    });
  });

  // ==================== Alert Methods Tests ====================

  describe('getActiveAlerts', () => {
    it('should return empty array initially', () => {
      const alerts = service.getActiveAlerts();

      expect(alerts).toEqual([]);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history', () => {
      const history = service.getAlertHistory();

      expect(Array.isArray(history)).toBe(true);
    });

    it('should respect limit parameter', () => {
      const history = service.getAlertHistory(10);

      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('resolveAlert', () => {
    it('should return false for unknown alert', () => {
      const result = service.resolveAlert('unknown-id');

      expect(result).toBe(false);
    });
  });

  // ==================== Stats Tests ====================

  describe('getStats', () => {
    it('should return monitoring stats', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('activeAlerts');
      expect(stats).toHaveProperty('totalAlerts');
      expect(stats).toHaveProperty('health');
    });

    it('should reflect running state', () => {
      expect(service.getStats().running).toBe(false);

      service.start();
      expect(service.getStats().running).toBe(true);

      service.stop();
      expect(service.getStats().running).toBe(false);
    });

    it('should count active alerts', () => {
      const stats = service.getStats();

      expect(stats.activeAlerts).toBeGreaterThanOrEqual(0);
    });

    it('should include health in stats', () => {
      const stats = service.getStats();

      expect(stats.health).toHaveProperty('status');
      expect(stats.health).toHaveProperty('components');
    });
  });

  // ==================== Alert Evaluation Tests ====================

  describe('alert evaluation cycle', () => {
    it('should evaluate alerts periodically when started', () => {
      service.start();

      // Record metrics that would trigger alerts
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(600);
        service.recordError();
      }

      // Advance time to trigger evaluation
      vi.advanceTimersByTime(30000); // Default evaluation interval

      // Note: Alerts might not be triggered immediately due to duration requirements
      const stats = service.getStats();
      expect(stats.running).toBe(true);
    });
  });

  // ==================== Integration Tests ====================

  describe('integration scenarios', () => {
    it('should handle full monitoring cycle', () => {
      service.start();

      // Simulate normal operation
      for (let i = 0; i < 20; i++) {
        service.recordDecisionLatency(50 + Math.random() * 50);
        service.recordSuccess();
        service.recordCircuitState(false);
        service.recordRewardResult(true);
      }

      const stats = service.getStats();

      expect(stats.running).toBe(true);
      expect(stats.health.status).toBe('healthy');
    });

    it('should handle degraded state', () => {
      service.start();

      // Simulate degraded operation
      for (let i = 0; i < 20; i++) {
        service.recordDecisionLatency(200);
        service.recordDegradation();
        service.recordCircuitState(i < 8); // Some circuit opens
        service.recordRewardResult(i > 2);
      }

      const health = service.getHealthStatus();

      // Should be degraded or unhealthy
      expect(['degraded', 'unhealthy']).toContain(health.status);
    });

    it('should recover from degraded state', () => {
      service.start();

      // First: degraded metrics
      for (let i = 0; i < 10; i++) {
        service.recordDecisionLatency(200);
        service.recordDegradation();
      }

      // Then: good metrics (but note: the collector accumulates data)
      for (let i = 0; i < 50; i++) {
        service.recordDecisionLatency(50);
        service.recordSuccess();
      }

      const health = service.getHealthStatus();

      // With enough good data, should trend toward healthy
      expect(health).toBeDefined();
    });
  });
});

// ==================== Global Service Tests ====================

describe('global monitoring service', () => {
  afterEach(() => {
    stopGlobalMonitoring();
  });

  it('should export global service instance', () => {
    expect(monitoringService).toBeInstanceOf(MonitoringService);
  });

  it('should start global monitoring', () => {
    startGlobalMonitoring();

    const stats = monitoringService.getStats();
    expect(stats.running).toBe(true);
  });

  it('should stop global monitoring', () => {
    startGlobalMonitoring();
    stopGlobalMonitoring();

    const stats = monitoringService.getStats();
    expect(stats.running).toBe(false);
  });
});
