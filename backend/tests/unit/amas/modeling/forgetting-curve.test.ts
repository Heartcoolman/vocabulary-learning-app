/**
 * ForgettingCurve Unit Tests
 *
 * Tests for the forgetting curve calculation module based on ACT-R memory model.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calculateForgettingFactor,
  batchCalculateForgettingFactors,
  MemoryTrace
} from '../../../../src/amas/modeling/forgetting-curve';

describe('ForgettingCurve', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== calculateForgettingFactor Tests ====================

  describe('calculateForgettingFactor', () => {
    it('should return 1 for just-reviewed word', () => {
      const trace: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: new Date(),
        reviewCount: 1,
        averageAccuracy: 0.8
      };

      const factor = calculateForgettingFactor(trace);
      expect(factor).toBeCloseTo(1, 1);
    });

    it('should decay over time', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const recent: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: oneDayAgo,
        reviewCount: 1,
        averageAccuracy: 0.8
      };

      const older: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: twoDaysAgo,
        reviewCount: 1,
        averageAccuracy: 0.8
      };

      const recentFactor = calculateForgettingFactor(recent);
      const olderFactor = calculateForgettingFactor(older);

      expect(recentFactor).toBeGreaterThan(olderFactor);
    });

    it('should decay slower with more reviews', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const fewReviews: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: twoDaysAgo,
        reviewCount: 1,
        averageAccuracy: 0.8
      };

      const manyReviews: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: twoDaysAgo,
        reviewCount: 10,
        averageAccuracy: 0.8
      };

      const fewFactor = calculateForgettingFactor(fewReviews);
      const manyFactor = calculateForgettingFactor(manyReviews);

      expect(manyFactor).toBeGreaterThan(fewFactor);
    });

    it('should decay slower with higher accuracy', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const lowAccuracy: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: twoDaysAgo,
        reviewCount: 5,
        averageAccuracy: 0.3
      };

      const highAccuracy: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: twoDaysAgo,
        reviewCount: 5,
        averageAccuracy: 0.9
      };

      const lowFactor = calculateForgettingFactor(lowAccuracy);
      const highFactor = calculateForgettingFactor(highAccuracy);

      expect(highFactor).toBeGreaterThan(lowFactor);
    });

    it('should factor in memory strength if provided', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const weakMemory: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: twoDaysAgo,
        reviewCount: 5,
        averageAccuracy: 0.8,
        memoryStrength: 0.5
      };

      const strongMemory: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: twoDaysAgo,
        reviewCount: 5,
        averageAccuracy: 0.8,
        memoryStrength: 2.0
      };

      const weakFactor = calculateForgettingFactor(weakMemory);
      const strongFactor = calculateForgettingFactor(strongMemory);

      expect(strongFactor).toBeGreaterThan(weakFactor);
    });

    it('should handle string date format', () => {
      const trace: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: '2024-01-14T12:00:00Z', // 1 day ago
        reviewCount: 3,
        averageAccuracy: 0.7
      };

      const factor = calculateForgettingFactor(trace);
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(1);
    });

    it('should clamp accuracy to [0.1, 1] range', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const zeroAccuracy: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: twoDaysAgo,
        reviewCount: 3,
        averageAccuracy: 0
      };

      const negativeAccuracy: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: twoDaysAgo,
        reviewCount: 3,
        averageAccuracy: -0.5
      };

      // Should not throw and should produce reasonable values
      const factor1 = calculateForgettingFactor(zeroAccuracy);
      const factor2 = calculateForgettingFactor(negativeAccuracy);

      expect(factor1).toBeGreaterThan(0);
      expect(factor2).toBeGreaterThan(0);
    });

    it('should return value in [0, 1] range', () => {
      // Very old review
      const oldTrace: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        reviewCount: 1,
        averageAccuracy: 0.5
      };

      // Just reviewed
      const newTrace: MemoryTrace = {
        wordId: 'word-2',
        lastReviewTime: new Date(),
        reviewCount: 100,
        averageAccuracy: 1.0
      };

      const oldFactor = calculateForgettingFactor(oldTrace);
      const newFactor = calculateForgettingFactor(newTrace);

      expect(oldFactor).toBeGreaterThanOrEqual(0);
      expect(oldFactor).toBeLessThanOrEqual(1);
      expect(newFactor).toBeGreaterThanOrEqual(0);
      expect(newFactor).toBeLessThanOrEqual(1);
    });

    it('should enforce minimum half-life', () => {
      const veryRecent = new Date(Date.now() - 1000); // 1 second ago

      const lowParams: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: veryRecent,
        reviewCount: 0,
        averageAccuracy: 0.1,
        memoryStrength: 0.1
      };

      // Should not throw due to extremely small half-life
      const factor = calculateForgettingFactor(lowParams);
      expect(factor).toBeGreaterThan(0);
    });

    it('should handle future lastReviewTime gracefully', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const trace: MemoryTrace = {
        wordId: 'word-1',
        lastReviewTime: futureDate,
        reviewCount: 3,
        averageAccuracy: 0.8
      };

      // Days since review should be clamped to 0
      const factor = calculateForgettingFactor(trace);
      expect(factor).toBeCloseTo(1, 1);
    });
  });

  // ==================== batchCalculateForgettingFactors Tests ====================

  describe('batchCalculateForgettingFactors', () => {
    it('should calculate factors for multiple traces', () => {
      const traces: MemoryTrace[] = [
        {
          wordId: 'word-1',
          lastReviewTime: new Date(),
          reviewCount: 5,
          averageAccuracy: 0.9
        },
        {
          wordId: 'word-2',
          lastReviewTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
          reviewCount: 3,
          averageAccuracy: 0.7
        },
        {
          wordId: 'word-3',
          lastReviewTime: new Date(Date.now() - 72 * 60 * 60 * 1000),
          reviewCount: 1,
          averageAccuracy: 0.5
        }
      ];

      const results = batchCalculateForgettingFactors(traces);

      expect(results.size).toBe(3);
      expect(results.has('word-1')).toBe(true);
      expect(results.has('word-2')).toBe(true);
      expect(results.has('word-3')).toBe(true);

      // Word-1 should have highest retention (just reviewed)
      expect(results.get('word-1')!).toBeGreaterThan(results.get('word-2')!);
      expect(results.get('word-2')!).toBeGreaterThan(results.get('word-3')!);
    });

    it('should return empty map for empty input', () => {
      const results = batchCalculateForgettingFactors([]);
      expect(results.size).toBe(0);
    });

    it('should handle single trace', () => {
      const traces: MemoryTrace[] = [
        {
          wordId: 'word-1',
          lastReviewTime: new Date(),
          reviewCount: 3,
          averageAccuracy: 0.8
        }
      ];

      const results = batchCalculateForgettingFactors(traces);

      expect(results.size).toBe(1);
      expect(results.get('word-1')).toBeCloseTo(1, 1);
    });

    it('should handle duplicate wordIds (last one wins)', () => {
      const traces: MemoryTrace[] = [
        {
          wordId: 'word-1',
          lastReviewTime: new Date(Date.now() - 72 * 60 * 60 * 1000),
          reviewCount: 1,
          averageAccuracy: 0.5
        },
        {
          wordId: 'word-1', // Same ID
          lastReviewTime: new Date(),
          reviewCount: 10,
          averageAccuracy: 0.9
        }
      ];

      const results = batchCalculateForgettingFactors(traces);

      expect(results.size).toBe(1);
      // Last trace should be used (more recent, higher retention)
      expect(results.get('word-1')!).toBeGreaterThan(0.5);
    });

    it('should maintain consistent ordering in map', () => {
      const traces: MemoryTrace[] = Array.from({ length: 10 }, (_, i) => ({
        wordId: `word-${i}`,
        lastReviewTime: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        reviewCount: 5,
        averageAccuracy: 0.8
      }));

      const results = batchCalculateForgettingFactors(traces);

      expect(results.size).toBe(10);

      // Factors should decrease with age
      let prevFactor = Infinity;
      for (let i = 0; i < 10; i++) {
        const factor = results.get(`word-${i}`)!;
        expect(factor).toBeLessThanOrEqual(prevFactor);
        prevFactor = factor;
      }
    });
  });

  // ==================== Mathematical Properties Tests ====================

  describe('mathematical properties', () => {
    it('should follow exponential decay pattern', () => {
      const baseTrace: MemoryTrace = {
        wordId: 'word-1',
        reviewCount: 5,
        averageAccuracy: 0.8,
        lastReviewTime: new Date()
      };

      const factors: number[] = [];
      for (let days = 0; days <= 10; days++) {
        const trace = {
          ...baseTrace,
          lastReviewTime: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        };
        factors.push(calculateForgettingFactor(trace));
      }

      // Each factor should be smaller than the previous (monotonic decrease)
      for (let i = 1; i < factors.length; i++) {
        expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
      }

      // Rate of decrease should be proportional to current value (exponential)
      // Check that ratios are roughly constant
      const ratios: number[] = [];
      for (let i = 1; i < factors.length; i++) {
        if (factors[i - 1] > 0.01) {
          ratios.push(factors[i] / factors[i - 1]);
        }
      }

      // All ratios should be similar (within some tolerance)
      if (ratios.length > 2) {
        const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        for (const ratio of ratios) {
          expect(Math.abs(ratio - avgRatio)).toBeLessThan(0.2);
        }
      }
    });

    it('should have half-life proportional to review count', () => {
      // At half-life, factor should be ~0.5 (actually e^(-1) ≈ 0.37 for one half-life)
      // Higher review count = longer half-life = slower decay

      // Compare retention at a fixed time point (5 days)
      const testDays = 5;
      const testTime = new Date(Date.now() - testDays * 24 * 60 * 60 * 1000);

      const trace1: MemoryTrace = {
        wordId: 'test1',
        lastReviewTime: testTime,
        reviewCount: 1,
        averageAccuracy: 0.8
      };

      const trace5: MemoryTrace = {
        wordId: 'test5',
        lastReviewTime: testTime,
        reviewCount: 5,
        averageAccuracy: 0.8
      };

      const trace10: MemoryTrace = {
        wordId: 'test10',
        lastReviewTime: testTime,
        reviewCount: 10,
        averageAccuracy: 0.8
      };

      const factor1 = calculateForgettingFactor(trace1);
      const factor5 = calculateForgettingFactor(trace5);
      const factor10 = calculateForgettingFactor(trace10);

      // More reviews = higher retention at same time point
      expect(factor5).toBeGreaterThan(factor1);
      expect(factor10).toBeGreaterThan(factor5);
    });
  });
});
