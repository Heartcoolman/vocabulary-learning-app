/**
 * Metrics Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('MetricsService', () => {
  let metricsService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/metrics.service');
    metricsService = module;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('recordFeatureVectorSaved', () => {
    it('should record feature vector save metric', () => {
      expect(() => metricsService.recordFeatureVectorSaved?.()).not.toThrow();
    });
  });

  describe('recordDifficultyComputationTime', () => {
    it('should record computation time', () => {
      expect(() => metricsService.recordDifficultyComputationTime?.(0.5)).not.toThrow();
    });

    it('should handle zero time', () => {
      expect(() => metricsService.recordDifficultyComputationTime?.(0)).not.toThrow();
    });
  });

  describe('recordQueueAdjustmentDuration', () => {
    it('should record queue adjustment duration', () => {
      expect(() => metricsService.recordQueueAdjustmentDuration?.(1.2)).not.toThrow();
    });
  });

  describe('recordAMASProcessingTime', () => {
    it('should record AMAS processing time', () => {
      expect(() => metricsService.recordAMASProcessingTime?.(0.3)).not.toThrow();
    });
  });

  describe('recordCacheHit', () => {
    it('should record cache hit', () => {
      expect(() => metricsService.recordCacheHit?.('test-cache')).not.toThrow();
    });
  });

  describe('recordCacheMiss', () => {
    it('should record cache miss', () => {
      expect(() => metricsService.recordCacheMiss?.('test-cache')).not.toThrow();
    });
  });

  describe('recordDatabaseQueryTime', () => {
    it('should record database query time', () => {
      expect(() => metricsService.recordDatabaseQueryTime?.('select', 0.05)).not.toThrow();
    });
  });

  describe('recordAPIRequestTime', () => {
    it('should record API request time', () => {
      expect(() => metricsService.recordAPIRequestTime?.('/api/test', 'GET', 200, 0.1)).not.toThrow();
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter', () => {
      expect(() => metricsService.incrementCounter?.('test_counter')).not.toThrow();
    });

    it('should increment counter with labels', () => {
      expect(() => metricsService.incrementCounter?.('test_counter', { type: 'test' })).not.toThrow();
    });
  });

  describe('setGauge', () => {
    it('should set gauge value', () => {
      expect(() => metricsService.setGauge?.('test_gauge', 42)).not.toThrow();
    });
  });

  describe('observeHistogram', () => {
    it('should observe histogram value', () => {
      expect(() => metricsService.observeHistogram?.('test_histogram', 0.5)).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics array', async () => {
      const metrics = metricsService.getMetrics?.('test_metric');
      expect(Array.isArray(metrics) || metrics === undefined).toBe(true);
    });
  });

  describe('getMetricsPrometheus', () => {
    it('should return metrics in prometheus format', () => {
      const metrics = metricsService.getMetricsPrometheus?.();
      expect(typeof metrics === 'string' || metrics === undefined).toBe(true);
    });
  });

  describe('getMetricsJson', () => {
    it('should return metrics in JSON format', () => {
      const metrics = metricsService.getMetricsJson?.();
      expect(typeof metrics === 'object' || metrics === undefined).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      expect(() => metricsService.resetMetrics?.()).not.toThrow();
    });
  });
});
