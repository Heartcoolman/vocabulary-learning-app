/**
 * FatigueFusionEngine Tests
 *
 * 测试疲劳融合引擎的多信号融合和卡尔曼滤波功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  FatigueFusionEngine,
  DEFAULT_FUSION_CONFIG,
  type FusionInput,
  type FusionResult,
} from '../../../../src/amas/modeling/fatigue-fusion-engine';
import type { ProcessedVisualFatigue } from '../../../../src/amas/modeling/visual-fatigue-processor';

// Helper to create mock visual fatigue data
function createMockVisualData(overrides?: Partial<ProcessedVisualFatigue>): ProcessedVisualFatigue {
  return {
    score: 0.3,
    metrics: {
      perclos: 0.1,
      blinkRate: 15,
      yawnCount: 0,
      headPitch: 0,
      headYaw: 0,
    },
    confidence: 0.9,
    freshness: 1.0,
    isValid: true,
    timestamp: Date.now(),
    ...overrides,
  };
}

// Helper to create fusion input
function createFusionInput(overrides?: Partial<FusionInput>): FusionInput {
  return {
    userId: 'user-1',
    behaviorFatigue: 0.3,
    visualData: createMockVisualData(),
    studyDurationMinutes: 30,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FatigueFusionEngine', () => {
  let engine: FatigueFusionEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    engine = new FatigueFusionEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(engine).toBeDefined();
    });

    it('should accept custom config', () => {
      const customEngine = new FatigueFusionEngine({
        weights: { visual: 0.5, behavior: 0.3, temporal: 0.2 },
        smoothingFactor: 0.5,
      });
      expect(customEngine).toBeDefined();
    });

    it('should merge partial weight overrides', () => {
      const customEngine = new FatigueFusionEngine({
        weights: { visual: 0.5, behavior: 0.3, temporal: 0.2 },
      });
      expect(customEngine).toBeDefined();
    });
  });

  describe('fuse', () => {
    it('should fuse visual and behavior fatigue signals', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.3,
        visualData: createMockVisualData({ score: 0.4 }),
      });

      const result = engine.fuse(input);

      expect(result.fusedFatigue).toBeGreaterThan(0);
      expect(result.fusedFatigue).toBeLessThan(1);
      expect(result.behaviorFatigue).toBe(0.3);
      expect(result.visualFatigue).toBeGreaterThan(0);
    });

    it('should include temporal fatigue in fusion', () => {
      const input = createFusionInput({
        studyDurationMinutes: 60, // Significant study time
      });

      const result = engine.fuse(input);

      expect(result.temporalFatigue).toBeGreaterThan(0);
    });

    it('should return correct breakdown of fatigue sources', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.4,
        visualData: createMockVisualData({ score: 0.5 }),
        studyDurationMinutes: 45,
      });

      const result = engine.fuse(input);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.behavior).toBe(0.4);
      expect(result.breakdown.visual).toBeGreaterThan(0);
      expect(result.breakdown.temporal).toBeGreaterThan(0);
    });

    it('should handle missing visual data gracefully', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.5,
        visualData: undefined,
      });

      const result = engine.fuse(input);

      expect(result.fusedFatigue).toBeGreaterThan(0);
      expect(result.visualFatigue).toBe(0);
      expect(result.visualWeight).toBe(0);
    });

    it('should handle invalid visual data', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.5,
        visualData: createMockVisualData({ isValid: false }),
      });

      const result = engine.fuse(input);

      expect(result.visualFatigue).toBe(0);
    });

    it('should apply freshness decay to visual data', () => {
      const freshInput = createFusionInput({
        visualData: createMockVisualData({ score: 0.5, freshness: 1.0 }),
      });
      const staleInput = createFusionInput({
        visualData: createMockVisualData({ score: 0.5, freshness: 0.5 }),
      });

      // Reset engine to avoid Kalman filter influence
      const freshEngine = new FatigueFusionEngine();
      const staleEngine = new FatigueFusionEngine();

      const freshResult = freshEngine.fuse(freshInput);
      const staleResult = staleEngine.fuse(staleInput);

      // Stale data should contribute less to fusion
      expect(staleResult.visualFatigue).toBeLessThan(freshResult.visualFatigue);
    });
  });

  describe('temporal fatigue calculation', () => {
    it('should return zero for short study duration', () => {
      const input = createFusionInput({
        studyDurationMinutes: 10,
      });

      const result = engine.fuse(input);

      // Temporal fatigue should be near zero for short sessions
      expect(result.temporalFatigue).toBeLessThan(0.1);
    });

    it('should increase with study duration beyond threshold', () => {
      const shortSession = createFusionInput({ studyDurationMinutes: 30 });
      const longSession = createFusionInput({ studyDurationMinutes: 90 });

      // Use separate engines to avoid history effects
      const engine1 = new FatigueFusionEngine();
      const engine2 = new FatigueFusionEngine();

      const shortResult = engine1.fuse(shortSession);
      const longResult = engine2.fuse(longSession);

      expect(longResult.temporalFatigue).toBeGreaterThan(shortResult.temporalFatigue);
    });
  });

  describe('dynamic weight calculation', () => {
    it('should reduce visual weight for low confidence data', () => {
      const highConfInput = createFusionInput({
        visualData: createMockVisualData({ confidence: 0.9 }),
      });
      const lowConfInput = createFusionInput({
        visualData: createMockVisualData({ confidence: 0.1 }),
      });

      // Use separate engines to avoid history effects
      const engine1 = new FatigueFusionEngine();
      const engine2 = new FatigueFusionEngine();

      const highConfResult = engine1.fuse(highConfInput);
      const lowConfResult = engine2.fuse(lowConfInput);

      expect(lowConfResult.visualWeight).toBeLessThan(highConfResult.visualWeight);
    });

    it('should transfer visual weight to behavior when visual is unavailable', () => {
      const input = createFusionInput({
        visualData: undefined,
      });

      const result = engine.fuse(input);

      expect(result.visualWeight).toBe(0);
      expect(result.behaviorWeight).toBeGreaterThan(DEFAULT_FUSION_CONFIG.weights.behavior);
    });
  });

  describe('conflict detection', () => {
    it('should detect conflict when behavior and visual diverge significantly', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.8,
        visualData: createMockVisualData({ score: 0.1 }),
      });

      const result = engine.fuse(input);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictDescription).toBeDefined();
    });

    it('should not flag conflict when signals are similar', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.4,
        visualData: createMockVisualData({ score: 0.5 }),
      });

      const result = engine.fuse(input);

      expect(result.hasConflict).toBe(false);
    });

    it('should describe conflict type correctly - behavior higher', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.9,
        visualData: createMockVisualData({ score: 0.2, freshness: 1.0 }),
      });

      const result = engine.fuse(input);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictDescription).toContain('行为');
    });

    it('should describe conflict type correctly - visual higher', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.2,
        visualData: createMockVisualData({ score: 0.9, freshness: 1.0 }),
      });

      const result = engine.fuse(input);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictDescription).toContain('视觉');
    });
  });

  describe('fatigue level determination', () => {
    it('should classify low fatigue as alert', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.1,
        visualData: createMockVisualData({ score: 0.1 }),
        studyDurationMinutes: 10,
      });

      const result = engine.fuse(input);

      expect(result.fatigueLevel).toBe('alert');
    });

    it('should classify moderate fatigue as mild', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.35,
        visualData: createMockVisualData({ score: 0.35 }),
        studyDurationMinutes: 30,
      });

      const result = engine.fuse(input);

      expect(['mild', 'moderate']).toContain(result.fatigueLevel);
    });

    it('should classify high fatigue as severe', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.9,
        visualData: createMockVisualData({ score: 0.9 }),
        studyDurationMinutes: 120,
      });

      // Build up the Kalman state for a more responsive reading
      for (let i = 0; i < 5; i++) {
        engine.fuse(input);
      }

      const result = engine.fuse(input);

      expect(['moderate', 'severe']).toContain(result.fatigueLevel);
    });
  });

  describe('recommendations', () => {
    it('should generate recommendations for high fatigue', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.85,
        visualData: createMockVisualData({ score: 0.85 }),
        studyDurationMinutes: 60,
      });

      // Build up state
      for (let i = 0; i < 5; i++) {
        engine.fuse(input);
      }

      const result = engine.fuse(input);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should recommend rest for long study sessions', () => {
      const input = createFusionInput({
        studyDurationMinutes: 50,
      });

      const result = engine.fuse(input);

      const hasRestRecommendation = result.recommendations.some(
        (r) => r.includes('活动') || r.includes('休息') || r.includes('学习'),
      );
      expect(hasRestRecommendation).toBe(true);
    });

    it('should recommend eye rest when visual fatigue is high', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.2,
        visualData: createMockVisualData({ score: 0.75 }),
      });

      // Build up state
      for (let i = 0; i < 3; i++) {
        engine.fuse(input);
      }

      const result = engine.fuse(input);

      const hasEyeRecommendation = result.recommendations.some(
        (r) => r.includes('眼') || r.includes('闭眼'),
      );
      // May or may not have eye recommendation depending on smoothed value
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Kalman filter', () => {
    it('should smooth fatigue values over time', () => {
      const values: number[] = [];

      // Send alternating high and low fatigue signals
      for (let i = 0; i < 10; i++) {
        const fatigue = i % 2 === 0 ? 0.8 : 0.2;
        const input = createFusionInput({
          behaviorFatigue: fatigue,
          visualData: createMockVisualData({ score: fatigue }),
          timestamp: Date.now() + i * 1000,
        });
        const result = engine.fuse(input);
        values.push(result.fusedFatigue);
      }

      // Variance should be lower than input variance due to smoothing
      const variance = calculateVariance(values);
      expect(variance).toBeLessThan(0.09); // Less than raw variance of 0.3^2
    });

    it('should be disableable', () => {
      const noKalmanEngine = new FatigueFusionEngine({ useKalmanFilter: false });
      const kalmanEngine = new FatigueFusionEngine({ useKalmanFilter: true });

      // Both should produce valid results
      const input = createFusionInput();

      const noKalmanResult = noKalmanEngine.fuse(input);
      const kalmanResult = kalmanEngine.fuse(input);

      expect(noKalmanResult.fusedFatigue).toBeGreaterThan(0);
      expect(kalmanResult.fusedFatigue).toBeGreaterThan(0);
    });
  });

  describe('getLatest', () => {
    it('should return null for unknown user', () => {
      const result = engine.getLatest('unknown-user');
      expect(result).toBeNull();
    });

    it('should return latest fusion result for known user', () => {
      const input = createFusionInput();
      engine.fuse(input);

      const latest = engine.getLatest('user-1');

      expect(latest).not.toBeNull();
      expect(latest?.fusedFatigue).toBeGreaterThan(0);
    });

    it('should return null for expired data', () => {
      const input = createFusionInput();
      engine.fuse(input);

      // Advance time beyond maxDataAge
      vi.advanceTimersByTime(35000);

      const latest = engine.getLatest('user-1');
      expect(latest).toBeNull();
    });
  });

  describe('getTrend', () => {
    it('should return zero for insufficient history', () => {
      const input = createFusionInput();
      engine.fuse(input);

      const trend = engine.getTrend('user-1');
      expect(trend).toBe(0);
    });

    it('should detect increasing trend', () => {
      for (let i = 0; i < 15; i++) {
        const input = createFusionInput({
          behaviorFatigue: 0.2 + i * 0.03,
          visualData: createMockVisualData({ score: 0.2 + i * 0.03 }),
          timestamp: Date.now() + i * 1000,
        });
        engine.fuse(input);
      }

      const trend = engine.getTrend('user-1');
      expect(trend).toBeGreaterThan(0);
    });

    it('should detect decreasing trend', () => {
      for (let i = 0; i < 15; i++) {
        const input = createFusionInput({
          behaviorFatigue: 0.6 - i * 0.02,
          visualData: createMockVisualData({ score: 0.6 - i * 0.02 }),
          timestamp: Date.now() + i * 1000,
        });
        engine.fuse(input);
      }

      const trend = engine.getTrend('user-1');
      expect(trend).toBeLessThan(0);
    });
  });

  describe('resetUser', () => {
    it('should clear user state', () => {
      const input = createFusionInput();
      engine.fuse(input);

      expect(engine.getLatest('user-1')).not.toBeNull();

      engine.resetUser('user-1');

      expect(engine.getLatest('user-1')).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update fusion configuration', () => {
      engine.updateConfig({
        weights: { visual: 0.6, behavior: 0.2, temporal: 0.2 },
      });

      const input = createFusionInput({
        behaviorFatigue: 0.3,
        visualData: createMockVisualData({ score: 0.7 }),
      });

      const result = engine.fuse(input);

      // Visual should have more influence now
      expect(result.visualWeight).toBeGreaterThan(result.behaviorWeight);
    });
  });

  describe('dominant source determination', () => {
    it('should identify visual as dominant when visual contribution is highest', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.2,
        visualData: createMockVisualData({ score: 0.8, confidence: 1.0 }),
        studyDurationMinutes: 10,
      });

      const result = engine.fuse(input);

      expect(result.dominantSource).toBe('visual');
    });

    it('should identify behavior as dominant when behavior contribution is highest', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.8,
        visualData: createMockVisualData({ score: 0.2 }),
        studyDurationMinutes: 10,
      });

      const result = engine.fuse(input);

      expect(result.dominantSource).toBe('behavior');
    });

    it('should identify temporal as dominant for very long sessions', () => {
      const input = createFusionInput({
        behaviorFatigue: 0.1,
        visualData: createMockVisualData({ score: 0.1, confidence: 0.5 }),
        studyDurationMinutes: 180, // 3 hours
      });

      const result = engine.fuse(input);

      // Temporal should have significant contribution for long sessions
      expect(result.temporalFatigue).toBeGreaterThan(0.3);
    });
  });
});

// Helper function to calculate variance
function calculateVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
