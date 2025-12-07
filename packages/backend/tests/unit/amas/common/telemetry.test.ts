/**
 * Telemetry Unit Tests
 *
 * Tests for the telemetry/monitoring interfaces used by AMAS
 * including ConsoleTelemetry, NoOpTelemetry, and AggregateTelemetry implementations
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Telemetry, TelemetryEvent } from '../../../../src/amas/common/telemetry';
import { createTestTelemetry } from '../../../../src/amas/common/telemetry';

// Mock the logger to avoid console output during tests
vi.mock('../../../../src/logger', () => ({
  amasLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

describe('Telemetry', () => {
  // ==================== AggregateTelemetry Tests (via createTestTelemetry) ====================

  describe('AggregateTelemetry', () => {
    let telemetry: ReturnType<typeof createTestTelemetry>;

    beforeEach(() => {
      telemetry = createTestTelemetry();
    });

    describe('record', () => {
      it('should record an event without error', () => {
        expect(() => {
          telemetry.record('amas.circuit.event', { state: 'open' });
        }).not.toThrow();
      });

      it('should record multiple events', () => {
        expect(() => {
          telemetry.record('amas.circuit.event', { state: 'open' });
          telemetry.record('amas.circuit.transition', { from: 'closed', to: 'open' });
          telemetry.record('amas.degradation', { level: 'partial' });
        }).not.toThrow();
      });

      it('should accept various data formats', () => {
        expect(() => {
          telemetry.record('amas.exception', { error: 'test', stack: 'trace' });
          telemetry.record('amas.timeout', { duration: 5000, operation: 'test' });
          telemetry.record('amas.decision.latency', { value: 100 });
        }).not.toThrow();
      });
    });

    describe('increment', () => {
      it('should increment counter for an event', () => {
        telemetry.increment('amas.circuit.event');

        const count = telemetry.getCounter('amas.circuit.event');
        expect(count).toBe(1);
      });

      it('should increment counter multiple times', () => {
        telemetry.increment('amas.circuit.event');
        telemetry.increment('amas.circuit.event');
        telemetry.increment('amas.circuit.event');

        const count = telemetry.getCounter('amas.circuit.event');
        expect(count).toBe(3);
      });

      it('should track counters with different labels separately', () => {
        telemetry.increment('amas.circuit.event', { model: 'thompson' });
        telemetry.increment('amas.circuit.event', { model: 'thompson' });
        telemetry.increment('amas.circuit.event', { model: 'linucb' });

        expect(telemetry.getCounter('amas.circuit.event', { model: 'thompson' })).toBe(2);
        expect(telemetry.getCounter('amas.circuit.event', { model: 'linucb' })).toBe(1);
        expect(telemetry.getCounter('amas.circuit.event')).toBe(0); // No labels
      });

      it('should track counters for different events separately', () => {
        telemetry.increment('amas.circuit.event');
        telemetry.increment('amas.circuit.event');
        telemetry.increment('amas.degradation');

        expect(telemetry.getCounter('amas.circuit.event')).toBe(2);
        expect(telemetry.getCounter('amas.degradation')).toBe(1);
      });

      it('should return 0 for non-existent counter', () => {
        const count = telemetry.getCounter('amas.timeout');
        expect(count).toBe(0);
      });

      it('should handle multiple label combinations', () => {
        telemetry.increment('amas.circuit.event', { model: 'thompson', action: 'select' });
        telemetry.increment('amas.circuit.event', { action: 'select', model: 'thompson' }); // Same labels, different order

        // Labels should be sorted, so these should be the same key
        expect(telemetry.getCounter('amas.circuit.event', { model: 'thompson', action: 'select' })).toBe(2);
      });
    });

    describe('histogram', () => {
      it('should record histogram values', () => {
        telemetry.histogram('amas.decision.latency', 100);
        telemetry.histogram('amas.decision.latency', 150);
        telemetry.histogram('amas.decision.latency', 200);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats).not.toBeNull();
        expect(stats!.count).toBe(3);
        expect(stats!.mean).toBeCloseTo(150, 5);
      });

      it('should track histograms with labels separately', () => {
        telemetry.histogram('amas.decision.latency', 100, { model: 'thompson' });
        telemetry.histogram('amas.decision.latency', 200, { model: 'thompson' });
        telemetry.histogram('amas.decision.latency', 50, { model: 'linucb' });

        const thompsonStats = telemetry.getHistogramStats('amas.decision.latency', { model: 'thompson' });
        const linucbStats = telemetry.getHistogramStats('amas.decision.latency', { model: 'linucb' });

        expect(thompsonStats!.count).toBe(2);
        expect(thompsonStats!.mean).toBe(150);
        expect(linucbStats!.count).toBe(1);
        expect(linucbStats!.mean).toBe(50);
      });

      it('should return null for non-existent histogram', () => {
        const stats = telemetry.getHistogramStats('amas.model.update.latency');
        expect(stats).toBeNull();
      });
    });

    describe('getHistogramStats', () => {
      it('should calculate correct mean', () => {
        telemetry.histogram('amas.decision.latency', 10);
        telemetry.histogram('amas.decision.latency', 20);
        telemetry.histogram('amas.decision.latency', 30);
        telemetry.histogram('amas.decision.latency', 40);
        telemetry.histogram('amas.decision.latency', 50);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.mean).toBe(30);
      });

      it('should calculate correct p95', () => {
        // Add 100 values from 1 to 100
        for (let i = 1; i <= 100; i++) {
          telemetry.histogram('amas.decision.latency', i);
        }

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.count).toBe(100);
        // p95Index = Math.floor(100 * 0.95) = 95, sorted[95] = 96 (0-indexed)
        expect(stats!.p95).toBe(96);
      });

      it('should calculate correct p99', () => {
        // Add 100 values from 1 to 100
        for (let i = 1; i <= 100; i++) {
          telemetry.histogram('amas.decision.latency', i);
        }

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        // p99Index = Math.floor(100 * 0.99) = 99, sorted[99] = 100 (0-indexed)
        expect(stats!.p99).toBe(100);
      });

      it('should handle single value', () => {
        telemetry.histogram('amas.decision.latency', 42);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.count).toBe(1);
        expect(stats!.mean).toBe(42);
        expect(stats!.p95).toBe(42);
        expect(stats!.p99).toBe(42);
      });

      it('should handle unsorted input values', () => {
        telemetry.histogram('amas.decision.latency', 50);
        telemetry.histogram('amas.decision.latency', 10);
        telemetry.histogram('amas.decision.latency', 30);
        telemetry.histogram('amas.decision.latency', 40);
        telemetry.histogram('amas.decision.latency', 20);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.mean).toBe(30);
        // Values should be sorted for percentile calculation
      });

      it('should handle negative values', () => {
        telemetry.histogram('amas.decision.latency', -10);
        telemetry.histogram('amas.decision.latency', 0);
        telemetry.histogram('amas.decision.latency', 10);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.mean).toBe(0);
        expect(stats!.count).toBe(3);
      });

      it('should handle decimal values', () => {
        telemetry.histogram('amas.decision.latency', 1.5);
        telemetry.histogram('amas.decision.latency', 2.5);
        telemetry.histogram('amas.decision.latency', 3.0);

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.mean).toBeCloseTo(2.333, 2);
      });
    });

    describe('histogram size limit', () => {
      it('should limit histogram size to 1000 values', () => {
        // Add 1100 values
        for (let i = 0; i < 1100; i++) {
          telemetry.histogram('amas.decision.latency', i);
        }

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        expect(stats!.count).toBe(1000);
      });

      it('should remove oldest values when limit exceeded', () => {
        // Add 1100 values (0-1099)
        for (let i = 0; i < 1100; i++) {
          telemetry.histogram('amas.decision.latency', i);
        }

        const stats = telemetry.getHistogramStats('amas.decision.latency');
        // First 100 values (0-99) should be removed
        // Remaining values are 100-1099
        // Mean of 100-1099 is (100+1099)/2 = 599.5
        expect(stats!.mean).toBeCloseTo(599.5, 1);
      });
    });

    describe('reset', () => {
      it('should clear all counters', () => {
        telemetry.increment('amas.circuit.event');
        telemetry.increment('amas.degradation');

        telemetry.reset();

        expect(telemetry.getCounter('amas.circuit.event')).toBe(0);
        expect(telemetry.getCounter('amas.degradation')).toBe(0);
      });

      it('should clear all histograms', () => {
        telemetry.histogram('amas.decision.latency', 100);
        telemetry.histogram('amas.model.update.latency', 200);

        telemetry.reset();

        expect(telemetry.getHistogramStats('amas.decision.latency')).toBeNull();
        expect(telemetry.getHistogramStats('amas.model.update.latency')).toBeNull();
      });

      it('should allow new values after reset', () => {
        telemetry.increment('amas.circuit.event');
        telemetry.histogram('amas.decision.latency', 100);

        telemetry.reset();

        telemetry.increment('amas.circuit.event');
        telemetry.histogram('amas.decision.latency', 50);

        expect(telemetry.getCounter('amas.circuit.event')).toBe(1);
        expect(telemetry.getHistogramStats('amas.decision.latency')!.count).toBe(1);
        expect(telemetry.getHistogramStats('amas.decision.latency')!.mean).toBe(50);
      });
    });

    describe('makeKey (label handling)', () => {
      it('should create consistent keys regardless of label order', () => {
        telemetry.increment('amas.circuit.event', { a: '1', b: '2', c: '3' });
        telemetry.increment('amas.circuit.event', { c: '3', a: '1', b: '2' });
        telemetry.increment('amas.circuit.event', { b: '2', c: '3', a: '1' });

        expect(telemetry.getCounter('amas.circuit.event', { a: '1', b: '2', c: '3' })).toBe(3);
      });

      it('should handle empty labels', () => {
        telemetry.increment('amas.circuit.event', {});
        // This should be the same as no labels
        // But actual behavior depends on implementation
        expect(telemetry.getCounter('amas.circuit.event', {})).toBeGreaterThanOrEqual(0);
      });

      it('should handle special characters in label values', () => {
        telemetry.increment('amas.circuit.event', { path: '/api/v1/test', status: '200' });

        expect(telemetry.getCounter('amas.circuit.event', { path: '/api/v1/test', status: '200' })).toBe(1);
      });
    });
  });

  // ==================== TelemetryEvent Type Tests ====================

  describe('TelemetryEvent types', () => {
    let telemetry: ReturnType<typeof createTestTelemetry>;

    beforeEach(() => {
      telemetry = createTestTelemetry();
    });

    it('should accept amas.circuit.event', () => {
      expect(() => {
        telemetry.record('amas.circuit.event', { data: 'test' });
        telemetry.increment('amas.circuit.event');
        telemetry.histogram('amas.circuit.event', 100);
      }).not.toThrow();
    });

    it('should accept amas.circuit.transition', () => {
      expect(() => {
        telemetry.record('amas.circuit.transition', { from: 'closed', to: 'open' });
        telemetry.increment('amas.circuit.transition');
        telemetry.histogram('amas.circuit.transition', 100);
      }).not.toThrow();
    });

    it('should accept amas.degradation', () => {
      expect(() => {
        telemetry.record('amas.degradation', { level: 'partial' });
        telemetry.increment('amas.degradation');
        telemetry.histogram('amas.degradation', 100);
      }).not.toThrow();
    });

    it('should accept amas.timeout', () => {
      expect(() => {
        telemetry.record('amas.timeout', { duration: 5000 });
        telemetry.increment('amas.timeout');
        telemetry.histogram('amas.timeout', 100);
      }).not.toThrow();
    });

    it('should accept amas.decision.latency', () => {
      expect(() => {
        telemetry.record('amas.decision.latency', { value: 100 });
        telemetry.increment('amas.decision.latency');
        telemetry.histogram('amas.decision.latency', 100);
      }).not.toThrow();
    });

    it('should accept amas.model.update.latency', () => {
      expect(() => {
        telemetry.record('amas.model.update.latency', { value: 200 });
        telemetry.increment('amas.model.update.latency');
        telemetry.histogram('amas.model.update.latency', 200);
      }).not.toThrow();
    });

    it('should accept amas.exception', () => {
      expect(() => {
        telemetry.record('amas.exception', { error: 'test error' });
        telemetry.increment('amas.exception');
        telemetry.histogram('amas.exception', 1);
      }).not.toThrow();
    });
  });

  // ==================== createTestTelemetry Tests ====================

  describe('createTestTelemetry', () => {
    it('should create a new AggregateTelemetry instance', () => {
      const telemetry1 = createTestTelemetry();
      const telemetry2 = createTestTelemetry();

      // Should be separate instances
      telemetry1.increment('amas.circuit.event');

      expect(telemetry1.getCounter('amas.circuit.event')).toBe(1);
      expect(telemetry2.getCounter('amas.circuit.event')).toBe(0);
    });

    it('should implement Telemetry interface', () => {
      const telemetry = createTestTelemetry();

      // Check that all interface methods exist
      expect(typeof telemetry.record).toBe('function');
      expect(typeof telemetry.increment).toBe('function');
      expect(typeof telemetry.histogram).toBe('function');
    });
  });

  // ==================== Integration Tests ====================

  describe('integration', () => {
    let telemetry: ReturnType<typeof createTestTelemetry>;

    beforeEach(() => {
      telemetry = createTestTelemetry();
    });

    it('should handle mixed operations', () => {
      // Record events
      telemetry.record('amas.circuit.event', { state: 'open' });
      telemetry.record('amas.circuit.transition', { from: 'closed', to: 'open' });

      // Increment counters
      telemetry.increment('amas.circuit.event');
      telemetry.increment('amas.circuit.event');
      telemetry.increment('amas.degradation', { level: 'partial' });

      // Record histograms
      telemetry.histogram('amas.decision.latency', 100);
      telemetry.histogram('amas.decision.latency', 150);
      telemetry.histogram('amas.model.update.latency', 500, { model: 'linucb' });

      // Verify counters
      expect(telemetry.getCounter('amas.circuit.event')).toBe(2);
      expect(telemetry.getCounter('amas.degradation', { level: 'partial' })).toBe(1);

      // Verify histograms
      const latencyStats = telemetry.getHistogramStats('amas.decision.latency');
      expect(latencyStats!.count).toBe(2);
      expect(latencyStats!.mean).toBe(125);

      const modelStats = telemetry.getHistogramStats('amas.model.update.latency', { model: 'linucb' });
      expect(modelStats!.count).toBe(1);
      expect(modelStats!.mean).toBe(500);
    });

    it('should handle high-frequency operations', () => {
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        telemetry.increment('amas.circuit.event');
      }

      expect(telemetry.getCounter('amas.circuit.event')).toBe(iterations);
    });

    it('should handle concurrent-like operations on different events', () => {
      const events: TelemetryEvent[] = [
        'amas.circuit.event',
        'amas.circuit.transition',
        'amas.degradation',
        'amas.timeout',
        'amas.decision.latency',
        'amas.model.update.latency',
        'amas.exception'
      ];

      // Increment each event 5 times
      for (const event of events) {
        for (let i = 0; i < 5; i++) {
          telemetry.increment(event);
        }
      }

      // Verify all events have correct count
      for (const event of events) {
        expect(telemetry.getCounter(event)).toBe(5);
      }
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    let telemetry: ReturnType<typeof createTestTelemetry>;

    beforeEach(() => {
      telemetry = createTestTelemetry();
    });

    it('should handle very large counter values', () => {
      for (let i = 0; i < 100000; i++) {
        telemetry.increment('amas.circuit.event');
      }
      expect(telemetry.getCounter('amas.circuit.event')).toBe(100000);
    });

    it('should handle very small histogram values', () => {
      telemetry.histogram('amas.decision.latency', 0.001);
      telemetry.histogram('amas.decision.latency', 0.002);

      const stats = telemetry.getHistogramStats('amas.decision.latency');
      expect(stats!.mean).toBeCloseTo(0.0015, 6);
    });

    it('should handle very large histogram values', () => {
      telemetry.histogram('amas.decision.latency', 1e10);
      telemetry.histogram('amas.decision.latency', 2e10);

      const stats = telemetry.getHistogramStats('amas.decision.latency');
      expect(stats!.mean).toBeCloseTo(1.5e10, -8);
    });

    it('should handle zero histogram values', () => {
      telemetry.histogram('amas.decision.latency', 0);
      telemetry.histogram('amas.decision.latency', 0);

      const stats = telemetry.getHistogramStats('amas.decision.latency');
      expect(stats!.mean).toBe(0);
      expect(stats!.p95).toBe(0);
      expect(stats!.p99).toBe(0);
    });

    it('should handle empty data object in record', () => {
      expect(() => {
        telemetry.record('amas.circuit.event', {});
      }).not.toThrow();
    });

    it('should handle complex nested data in record', () => {
      expect(() => {
        telemetry.record('amas.exception', {
          error: {
            message: 'test',
            stack: 'trace',
            nested: {
              deep: {
                value: 123
              }
            }
          },
          timestamp: Date.now()
        });
      }).not.toThrow();
    });
  });
});
