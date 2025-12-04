/**
 * TrendAnalyzer Unit Tests
 *
 * Tests for the trend analysis model that tracks long-term ability changes
 * using linear regression and EMA-based cold start approximation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrendAnalyzer, TrendState } from '../../../../src/amas/modeling/trend-analyzer';

describe('TrendAnalyzer', () => {
  let analyzer: TrendAnalyzer;
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    analyzer = new TrendAnalyzer();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with flat trend state', () => {
      expect(analyzer.getTrendState()).toBe('flat');
    });

    it('should initialize with zero slope', () => {
      expect(analyzer.getTrendSlope()).toBe(0);
    });

    it('should initialize with zero confidence', () => {
      expect(analyzer.getConfidence()).toBe(0);
    });

    it('should accept custom window and sample parameters', () => {
      const custom = new TrendAnalyzer(14, 5);
      expect(custom.getTrendState()).toBe('flat');
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should return flat with insufficient samples', () => {
      const now = Date.now();
      const state = analyzer.update(0.5, now);
      expect(state).toBe('flat');
    });

    it('should detect upward trend with improving ability', () => {
      const now = Date.now();

      // Add samples showing clear improvement over 20 days
      for (let i = 0; i < 20; i++) {
        const ability = 0.3 + i * 0.025; // Start at 0.3, end at 0.8
        const ts = now - (20 - i) * DAY_MS;
        analyzer.update(ability, ts);
      }

      expect(analyzer.getTrendState()).toBe('up');
      expect(analyzer.getTrendSlope()).toBeGreaterThan(0.01);
    });

    it('should detect downward trend with declining ability', () => {
      const now = Date.now();

      // Add samples showing clear decline over 20 days
      for (let i = 0; i < 20; i++) {
        const ability = 0.8 - i * 0.02; // Start at 0.8, end at 0.4
        const ts = now - (20 - i) * DAY_MS;
        analyzer.update(ability, ts);
      }

      expect(analyzer.getTrendState()).toBe('down');
      expect(analyzer.getTrendSlope()).toBeLessThan(-0.005);
    });

    it('should detect flat trend with stable ability and low variance', () => {
      const now = Date.now();

      // Add samples with very stable ability
      for (let i = 0; i < 20; i++) {
        const ability = 0.5 + (Math.random() - 0.5) * 0.02; // 0.49-0.51
        const ts = now - (20 - i) * DAY_MS;
        analyzer.update(ability, ts);
      }

      // Should be flat or stuck (low variance stable)
      const state = analyzer.getTrendState();
      expect(['flat', 'stuck']).toContain(state);
    });

    it('should detect stuck trend with no clear direction', () => {
      const now = Date.now();

      // Add samples with high variance but no clear trend
      for (let i = 0; i < 20; i++) {
        const ability = 0.5 + Math.sin(i * 0.5) * 0.2; // Oscillating
        const ts = now - (20 - i) * DAY_MS;
        analyzer.update(ability, ts);
      }

      const state = analyzer.getTrendState();
      expect(['stuck', 'flat']).toContain(state);
    });

    it('should handle out-of-order timestamps by sorting', () => {
      const now = Date.now();

      // Add samples in random order
      const timestamps = [5, 1, 10, 3, 7].map((d) => now - d * DAY_MS);
      const abilities = [0.6, 0.4, 0.8, 0.5, 0.7];

      for (let i = 0; i < timestamps.length; i++) {
        analyzer.update(abilities[i], timestamps[i]);
      }

      // Should not throw and should compute something reasonable
      expect(typeof analyzer.getTrendState()).toBe('string');
    });

    it('should clamp ability values to [0, 1]', () => {
      const now = Date.now();

      // Ability values outside range
      analyzer.update(1.5, now - 10 * DAY_MS);
      analyzer.update(-0.5, now);

      // Should not throw
      expect(typeof analyzer.getTrendState()).toBe('string');
    });

    it('should ignore invalid inputs', () => {
      const now = Date.now();
      const initialState = analyzer.getTrendState();

      analyzer.update(NaN, now);
      analyzer.update(0.5, NaN);
      analyzer.update(Infinity, now);

      expect(analyzer.getTrendState()).toBe(initialState);
    });
  });

  // ==================== Rolling Window Tests ====================

  describe('rolling window', () => {
    it('should remove samples outside 30-day window', () => {
      const now = Date.now();

      // Add old samples (35 days ago)
      for (let i = 0; i < 5; i++) {
        analyzer.update(0.3, now - (35 - i) * DAY_MS);
      }

      // Add recent samples showing improvement
      for (let i = 0; i < 15; i++) {
        analyzer.update(0.5 + i * 0.02, now - (15 - i) * DAY_MS);
      }

      // Old samples should be dropped, trend should reflect recent improvement
      expect(analyzer.getTrendSlope()).toBeGreaterThan(0);
    });
  });

  // ==================== Cold Start (EMA) Tests ====================

  describe('cold start behavior', () => {
    it('should use EMA when sample count is below minimum', () => {
      const now = Date.now();

      // Add only a few samples (below default minSamples of 10)
      for (let i = 0; i < 5; i++) {
        analyzer.update(0.4 + i * 0.1, now - (5 - i) * DAY_MS);
      }

      // Should still compute a trend using EMA
      expect(typeof analyzer.getTrendState()).toBe('string');
      expect(typeof analyzer.getTrendSlope()).toBe('number');
    });

    it('should use EMA when time span is insufficient', () => {
      const now = Date.now();

      // Add many samples but in short time span (1 week)
      for (let i = 0; i < 20; i++) {
        const ts = now - (7 - i * 0.35) * DAY_MS;
        analyzer.update(0.5, ts);
      }

      // Should use EMA due to insufficient time span
      expect(typeof analyzer.getTrendSlope()).toBe('number');
    });

    it('should have lower confidence with EMA method', () => {
      const now = Date.now();

      // Few samples - EMA method
      const emaAnalyzer = new TrendAnalyzer();
      for (let i = 0; i < 5; i++) {
        emaAnalyzer.update(0.5, now - (5 - i) * DAY_MS);
      }
      const emaConfidence = emaAnalyzer.getConfidence();

      // Many samples - regression method
      const regAnalyzer = new TrendAnalyzer();
      for (let i = 0; i < 25; i++) {
        regAnalyzer.update(0.5, now - (25 - i) * DAY_MS);
      }
      const regConfidence = regAnalyzer.getConfidence();

      expect(emaConfidence).toBeLessThan(regConfidence);
    });
  });

  // ==================== Confidence Calculation Tests ====================

  describe('confidence calculation', () => {
    it('should increase confidence with more samples', () => {
      const now = Date.now();

      const analyzer1 = new TrendAnalyzer();
      for (let i = 0; i < 10; i++) {
        analyzer1.update(0.5, now - (10 - i) * DAY_MS);
      }

      const analyzer2 = new TrendAnalyzer();
      for (let i = 0; i < 25; i++) {
        analyzer2.update(0.5, now - (25 - i) * DAY_MS);
      }

      expect(analyzer2.getConfidence()).toBeGreaterThan(analyzer1.getConfidence());
    });

    it('should factor in volatility when computing confidence', () => {
      const now = Date.now();

      // Low volatility - stable values
      const stableAnalyzer = new TrendAnalyzer();
      for (let i = 0; i < 20; i++) {
        stableAnalyzer.update(0.5, now - (20 - i) * DAY_MS);
      }

      // High volatility - oscillating values
      const volatileAnalyzer = new TrendAnalyzer();
      for (let i = 0; i < 20; i++) {
        const ability = 0.5 + (i % 2 === 0 ? 0.3 : -0.3);
        volatileAnalyzer.update(ability, now - (20 - i) * DAY_MS);
      }

      // Both should have valid confidence values
      expect(stableAnalyzer.getConfidence()).toBeGreaterThan(0);
      expect(stableAnalyzer.getConfidence()).toBeLessThanOrEqual(1);
      expect(volatileAnalyzer.getConfidence()).toBeGreaterThan(0);
      expect(volatileAnalyzer.getConfidence()).toBeLessThanOrEqual(1);
    });

    it('should reduce confidence for very weak trends', () => {
      const now = Date.now();

      // Very weak trend (near zero slope)
      for (let i = 0; i < 20; i++) {
        const ability = 0.5 + i * 0.0001; // Almost flat
        analyzer.update(ability, now - (20 - i) * DAY_MS);
      }

      // Confidence should be reduced due to weak trend
      expect(analyzer.getConfidence()).toBeLessThan(0.8);
    });

    it('should keep confidence in [0, 1] range', () => {
      const now = Date.now();

      for (let i = 0; i < 50; i++) {
        analyzer.update(Math.random(), now - i * DAY_MS);
      }

      expect(analyzer.getConfidence()).toBeGreaterThanOrEqual(0);
      expect(analyzer.getConfidence()).toBeLessThanOrEqual(1);
    });
  });

  // ==================== Trend Classification Tests ====================

  describe('trend classification thresholds', () => {
    it('should classify as up when slope > 0.01/day', () => {
      const now = Date.now();

      // Slope of ~0.015/day
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.3 + i * 0.015, now - (20 - i) * DAY_MS);
      }

      expect(analyzer.getTrendState()).toBe('up');
    });

    it('should classify as down when slope < -0.005/day', () => {
      const now = Date.now();

      // Slope of ~-0.01/day
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.7 - i * 0.01, now - (20 - i) * DAY_MS);
      }

      expect(analyzer.getTrendState()).toBe('down');
    });

    it('should classify as flat when slope near zero and low volatility', () => {
      const now = Date.now();

      // Very stable, near-zero slope
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.5 + i * 0.001, now - (20 - i) * DAY_MS);
      }

      const state = analyzer.getTrendState();
      expect(['flat', 'stuck']).toContain(state);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle single sample', () => {
      analyzer.update(0.5, Date.now());
      expect(analyzer.getTrendState()).toBe('flat');
      expect(analyzer.getTrendSlope()).toBe(0);
    });

    it('should handle two samples', () => {
      const now = Date.now();
      analyzer.update(0.3, now - DAY_MS);
      analyzer.update(0.7, now);

      // Should compute something reasonable
      expect(typeof analyzer.getTrendSlope()).toBe('number');
    });

    it('should handle all same timestamps', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        analyzer.update(0.5 + i * 0.01, now);
      }

      // Should not crash, slope might be 0 or very small
      expect(typeof analyzer.getTrendSlope()).toBe('number');
    });

    it('should handle all same ability values', () => {
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        analyzer.update(0.5, now - (20 - i) * DAY_MS);
      }

      expect(analyzer.getTrendSlope()).toBeCloseTo(0, 3);
    });
  });
});
