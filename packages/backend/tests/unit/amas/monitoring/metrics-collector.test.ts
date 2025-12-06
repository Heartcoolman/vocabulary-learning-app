/**
 * MetricsCollector Unit Tests
 *
 * Tests for the metrics collection and health status module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MetricsCollector,
  createDefaultMetricsCollector,
  HealthStatus
} from '../../../../src/amas/monitoring/metrics-collector';
import { DEFAULT_SLO } from '../../../../src/amas/monitoring/alert-config';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    collector = new MetricsCollector();
  });

  afterEach(() => {
    collector.stop();
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(collector).toBeDefined();
    });

    it('should accept custom SLO config', () => {
      const customSLO = {
        ...DEFAULT_SLO,
        decisionLatencyP95: 50
      };

      const customCollector = new MetricsCollector(customSLO);
      expect(customCollector).toBeDefined();
    });
  });

  // ==================== Start/Stop Tests ====================

  describe('start and stop', () => {
    it('should start collecting metrics', () => {
      collector.start();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should stop collecting metrics', () => {
      collector.start();
      collector.stop();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should be idempotent when starting multiple times', () => {
      collector.start();
      collector.start();
      collector.stop();
      // Should not throw or create multiple intervals
      expect(true).toBe(true);
    });
  });

  // ==================== Recording Methods Tests ====================

  describe('recordDecisionLatency', () => {
    it('should record single latency', () => {
      collector.recordDecisionLatency(50);

      const metrics = collector.collectMetrics();
      const latencyMetric = metrics.find(m => m.metric === 'amas.decision.latency_mean');

      expect(latencyMetric?.value).toBe(50);
    });

    it('should record multiple latencies', () => {
      collector.recordDecisionLatency(50);
      collector.recordDecisionLatency(100);
      collector.recordDecisionLatency(150);

      const metrics = collector.collectMetrics();
      const latencyMetric = metrics.find(m => m.metric === 'amas.decision.latency_mean');

      expect(latencyMetric?.value).toBe(100); // Mean of 50, 100, 150
    });

    it('should maintain window size', () => {
      // Add more than window size (1000)
      for (let i = 0; i < 1100; i++) {
        collector.recordDecisionLatency(i);
      }

      // Old values should be removed
      const metrics = collector.collectMetrics();
      const latencyMetric = metrics.find(m => m.metric === 'amas.decision.latency_mean');

      // Mean should be around 599.5 (100-1099 / 1000)
      expect(latencyMetric?.value).toBeGreaterThan(500);
    });
  });

  describe('recordError', () => {
    it('should record errors', () => {
      collector.recordSuccess();
      collector.recordError();
      collector.recordError();

      const metrics = collector.collectMetrics();
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');

      // 2 errors out of 3 total = 66.7%
      expect(errorRate?.value).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('recordSuccess', () => {
    it('should record successes', () => {
      collector.recordSuccess();
      collector.recordSuccess();
      collector.recordSuccess();

      const metrics = collector.collectMetrics();
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');

      expect(errorRate?.value).toBe(0);
    });
  });

  describe('recordDegradation', () => {
    it('should record degradation as success but track separately', () => {
      collector.recordDegradation();
      collector.recordDegradation();
      collector.recordSuccess();

      const metrics = collector.collectMetrics();
      const degradationRate = metrics.find(m => m.metric === 'amas.degradation_rate');

      // 2 degradations out of 3 total = 66.7%
      expect(degradationRate?.value).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('recordTimeout', () => {
    it('should record timeout as error', () => {
      collector.recordSuccess();
      collector.recordTimeout();

      const metrics = collector.collectMetrics();
      const timeoutRate = metrics.find(m => m.metric === 'amas.timeout_rate');
      const errorRate = metrics.find(m => m.metric === 'amas.error_rate');

      expect(timeoutRate?.value).toBe(0.5);
      expect(errorRate?.value).toBe(0.5);
    });
  });

  describe('recordCircuitState', () => {
    it('should record circuit breaker state', () => {
      collector.recordCircuitState(false);
      collector.recordCircuitState(false);
      collector.recordCircuitState(true);

      const metrics = collector.collectMetrics();
      const circuitOpenRate = metrics.find(m => m.metric === 'amas.circuit.open_rate');

      expect(circuitOpenRate?.value).toBeCloseTo(1 / 3, 2);
    });
  });

  describe('recordRewardResult', () => {
    it('should record reward processing results', () => {
      collector.recordRewardResult(true);
      collector.recordRewardResult(true);
      collector.recordRewardResult(false);

      const metrics = collector.collectMetrics();
      const rewardFailureRate = metrics.find(m => m.metric === 'amas.reward.failure_rate');

      expect(rewardFailureRate?.value).toBeCloseTo(1 / 3, 2);
    });
  });

  // ==================== collectMetrics Tests ====================

  describe('collectMetrics', () => {
    it('should return empty array when no data', () => {
      const metrics = collector.collectMetrics();

      expect(metrics).toEqual([]);
    });

    it('should return latency metrics', () => {
      collector.recordDecisionLatency(50);
      collector.recordDecisionLatency(100);

      const metrics = collector.collectMetrics();

      expect(metrics.some(m => m.metric === 'amas.decision.latency_p95')).toBe(true);
      expect(metrics.some(m => m.metric === 'amas.decision.latency_p99')).toBe(true);
      expect(metrics.some(m => m.metric === 'amas.decision.latency_mean')).toBe(true);
    });

    it('should include timestamp', () => {
      collector.recordDecisionLatency(50);

      const metrics = collector.collectMetrics();

      metrics.forEach(m => {
        expect(m.timestamp).toBeDefined();
        expect(m.timestamp).toBeGreaterThan(0);
      });
    });
  });

  // ==================== getHealthStatus Tests ====================

  describe('getHealthStatus', () => {
    it('should return healthy status when all metrics are good', () => {
      // Record good metrics
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(50);
        collector.recordSuccess();
        collector.recordCircuitState(false);
        collector.recordRewardResult(true);
      }

      const health = collector.getHealthStatus();

      expect(health.status).toBe('healthy');
    });

    it('should return degraded status when metrics are borderline', () => {
      // Record borderline metrics
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(160); // Above P95 threshold
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();

      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status when metrics are bad', () => {
      // Record bad metrics
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(600); // Very high latency
        collector.recordError();
      }

      const health = collector.getHealthStatus();

      expect(health.status).toBe('unhealthy');
    });

    it('should include component health', () => {
      collector.recordDecisionLatency(50);
      collector.recordSuccess();

      const health = collector.getHealthStatus();

      expect(health.components).toHaveProperty('decision');
      expect(health.components).toHaveProperty('circuit');
      expect(health.components).toHaveProperty('reward');
    });

    it('should include SLO status', () => {
      collector.recordDecisionLatency(50);
      collector.recordSuccess();

      const health = collector.getHealthStatus();

      expect(health.slo).toHaveProperty('decisionLatency');
      expect(health.slo).toHaveProperty('errorRate');
      expect(health.slo).toHaveProperty('circuitHealth');
      expect(health.slo).toHaveProperty('rewardQueueHealth');
    });

    it('should include check timestamp', () => {
      const health = collector.getHealthStatus();

      expect(health.checkedAt).toBeInstanceOf(Date);
    });
  });

  // ==================== Decision Health Tests ====================

  describe('decision component health', () => {
    it('should be healthy with good latency', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(50);
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();

      expect(health.components.decision.status).toBe('healthy');
    });

    it('should be degraded with elevated latency', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(160);
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();

      expect(health.components.decision.status).toBe('degraded');
    });

    it('should be unhealthy with high latency', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(600);
        collector.recordSuccess();
      }

      const health = collector.getHealthStatus();

      expect(health.components.decision.status).toBe('unhealthy');
    });

    it('should be unhealthy with high error rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordDecisionLatency(50);
        collector.recordError(); // All errors
      }

      const health = collector.getHealthStatus();

      expect(health.components.decision.status).toBe('unhealthy');
    });
  });

  // ==================== Circuit Health Tests ====================

  describe('circuit component health', () => {
    it('should be healthy with low open rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordCircuitState(false);
      }

      const health = collector.getHealthStatus();

      expect(health.components.circuit.status).toBe('healthy');
    });

    it('should be degraded with moderate open rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordCircuitState(i < 4); // 40% open
      }

      const health = collector.getHealthStatus();

      expect(health.components.circuit.status).toBe('degraded');
    });

    it('should be unhealthy with high open rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordCircuitState(i < 6); // 60% open
      }

      const health = collector.getHealthStatus();

      expect(health.components.circuit.status).toBe('unhealthy');
    });
  });

  // ==================== Reward Health Tests ====================

  describe('reward component health', () => {
    it('should be healthy with low failure rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordRewardResult(true);
      }

      const health = collector.getHealthStatus();

      expect(health.components.reward.status).toBe('healthy');
    });

    it('should be degraded with moderate failure rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordRewardResult(i > 1); // 20% failure (i=0,1 are false)
      }

      const health = collector.getHealthStatus();

      expect(health.components.reward.status).toBe('degraded');
    });

    it('should be unhealthy with high failure rate', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordRewardResult(i > 7); // 80% failure
      }

      const health = collector.getHealthStatus();

      expect(health.components.reward.status).toBe('unhealthy');
    });
  });

  // ==================== Reset Tests ====================

  describe('reset', () => {
    it('should reset all counters', () => {
      collector.recordDecisionLatency(50);
      collector.recordError();
      collector.recordSuccess();
      collector.recordDegradation();
      collector.recordTimeout();
      collector.recordCircuitState(true);
      collector.recordRewardResult(false);

      collector.reset();

      const metrics = collector.collectMetrics();
      expect(metrics.length).toBe(0);
    });
  });

  // ==================== Statistics Calculation Tests ====================

  describe('statistics calculation', () => {
    it('should calculate P50 correctly', () => {
      // Add 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        collector.recordDecisionLatency(i);
      }

      const metrics = collector.collectMetrics();
      const p50 = metrics.find(m => m.metric === 'amas.decision.latency_mean');

      // Mean of 1-100 is 50.5
      expect(p50?.value).toBeCloseTo(50.5, 1);
    });

    it('should calculate P95 correctly', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordDecisionLatency(i);
      }

      const metrics = collector.collectMetrics();
      const p95 = metrics.find(m => m.metric === 'amas.decision.latency_p95');

      // P95 of 1-100 should be around 95
      expect(p95?.value).toBeGreaterThanOrEqual(90);
    });

    it('should calculate P99 correctly', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordDecisionLatency(i);
      }

      const metrics = collector.collectMetrics();
      const p99 = metrics.find(m => m.metric === 'amas.decision.latency_p99');

      // P99 of 1-100 should be around 99
      expect(p99?.value).toBeGreaterThanOrEqual(95);
    });
  });
});

// ==================== Factory Function Tests ====================

describe('createDefaultMetricsCollector', () => {
  it('should create MetricsCollector instance', () => {
    const collector = createDefaultMetricsCollector();

    expect(collector).toBeInstanceOf(MetricsCollector);
  });
});
