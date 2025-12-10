/**
 * VisualFatigueProcessor Tests
 *
 * 测试视觉疲劳处理器的数据处理和用户档案管理
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  VisualFatigueProcessor,
  DEFAULT_VISUAL_PROCESSOR_CONFIG,
} from '../../../../src/amas/modeling/visual-fatigue-processor';
import type { VisualFatigueInput, PersonalBaseline } from '@danci/shared';

// Helper to create mock visual fatigue input
function createMockInput(overrides?: Partial<VisualFatigueInput>): VisualFatigueInput {
  return {
    score: 0.3,
    perclos: 0.1,
    blinkRate: 15,
    yawnCount: 0,
    headPitch: 0,
    headYaw: 0,
    confidence: 0.9,
    timestamp: Date.now(),
    sessionId: 'test-session',
    ...overrides,
  };
}

// Helper to create mock personal baseline
function createMockBaseline(overrides?: Partial<PersonalBaseline>): PersonalBaseline {
  return {
    ear: { mean: 0.28, std: 0.03, samples: 100 },
    mar: { mean: 0.15, std: 0.05, samples: 100 },
    blinkRate: { mean: 15, std: 3, samples: 100 },
    lastUpdated: Date.now(),
    version: 1,
    calibrationSessions: 1,
    isCalibrated: true,
    ...overrides,
  };
}

describe('VisualFatigueProcessor', () => {
  let processor: VisualFatigueProcessor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    processor = new VisualFatigueProcessor();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(processor).toBeDefined();
      expect(processor.getStats().totalUsers).toBe(0);
    });

    it('should accept custom config', () => {
      const customProcessor = new VisualFatigueProcessor({
        dataMaxAge: 60000,
        minConfidence: 0.3,
      });
      expect(customProcessor).toBeDefined();
    });
  });

  describe('process', () => {
    it('should process valid input and return processed result', () => {
      const userId = 'user-1';
      const input = createMockInput();

      const result = processor.process(userId, input);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return invalid result for invalid input', () => {
      const userId = 'user-1';
      const invalidInput = createMockInput({ score: -0.5 });

      const result = processor.process(userId, invalidInput);

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should return invalid result for out-of-range perclos', () => {
      const userId = 'user-1';
      const invalidInput = createMockInput({ perclos: 1.5 });

      const result = processor.process(userId, invalidInput);

      expect(result.isValid).toBe(false);
    });

    it('should return invalid result for low confidence', () => {
      const lowConfidenceProcessor = new VisualFatigueProcessor({ minConfidence: 0.5 });
      const userId = 'user-1';
      const input = createMockInput({ confidence: 0.3 });

      const result = lowConfidenceProcessor.process(userId, input);

      expect(result.isValid).toBe(false);
    });

    it('should create user profile on first process', () => {
      const userId = 'user-1';
      const input = createMockInput();

      processor.process(userId, input);

      const profile = processor.getProfile(userId);
      expect(profile).not.toBeNull();
      expect(profile?.userId).toBe(userId);
    });

    it('should update user profile on subsequent processes', () => {
      const userId = 'user-1';
      const input1 = createMockInput({ score: 0.3 });
      const input2 = createMockInput({ score: 0.5, timestamp: Date.now() + 1000 });

      processor.process(userId, input1);
      processor.process(userId, input2);

      const profile = processor.getProfile(userId);
      expect(profile?.recordCount).toBe(2);
    });

    it('should apply baseline calibration when available', () => {
      const userId = 'user-1';
      const baseline = createMockBaseline();
      processor.setBaseline(userId, baseline);

      const input = createMockInput({ perclos: 0.1 });
      const result = processor.process(userId, input);

      expect(result.isValid).toBe(true);
    });
  });

  describe('data freshness', () => {
    it('should calculate freshness based on timestamp age', () => {
      const userId = 'user-1';
      const oldInput = createMockInput({ timestamp: Date.now() - 15000 }); // 15 seconds old

      const result = processor.process(userId, oldInput);

      // Freshness should be around 0.5 (half of maxAge which is 30s)
      expect(result.freshness).toBeGreaterThan(0.4);
      expect(result.freshness).toBeLessThan(0.6);
    });

    it('should return zero freshness for expired data', () => {
      const userId = 'user-1';
      const expiredInput = createMockInput({ timestamp: Date.now() - 60000 }); // 60 seconds old

      const result = processor.process(userId, expiredInput);

      expect(result.freshness).toBe(0);
      expect(result.isValid).toBe(false);
    });
  });

  describe('getLatest', () => {
    it('should return null for unknown user', () => {
      const result = processor.getLatest('unknown-user');
      expect(result).toBeNull();
    });

    it('should return latest processed data for known user', () => {
      const userId = 'user-1';
      const input = createMockInput({ score: 0.4 });
      processor.process(userId, input);

      const latest = processor.getLatest(userId);

      expect(latest).not.toBeNull();
      expect(latest?.score).toBeGreaterThan(0);
    });

    it('should return null for expired data', () => {
      const userId = 'user-1';
      const input = createMockInput();
      processor.process(userId, input);

      // Advance time beyond maxAge
      vi.advanceTimersByTime(35000);

      const latest = processor.getLatest(userId);
      expect(latest).toBeNull();
    });

    it('should update freshness when getting latest', () => {
      const userId = 'user-1';
      const input = createMockInput();
      processor.process(userId, input);

      vi.advanceTimersByTime(10000);

      const latest = processor.getLatest(userId);
      // Freshness should be recalculated
      expect(latest?.freshness).toBeLessThan(0.7);
    });
  });

  describe('getProfile', () => {
    it('should return null for unknown user', () => {
      const profile = processor.getProfile('unknown-user');
      expect(profile).toBeNull();
    });

    it('should return profile with correct statistics', () => {
      const userId = 'user-1';

      // Process multiple inputs
      processor.process(userId, createMockInput({ score: 0.2 }));
      processor.process(userId, createMockInput({ score: 0.4, timestamp: Date.now() + 1000 }));
      processor.process(userId, createMockInput({ score: 0.6, timestamp: Date.now() + 2000 }));

      const profile = processor.getProfile(userId);

      expect(profile?.recordCount).toBe(3);
      expect(profile?.maxVisualFatigue).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('setBaseline', () => {
    it('should set user baseline', () => {
      const userId = 'user-1';
      const baseline = createMockBaseline();

      processor.setBaseline(userId, baseline);

      const profile = processor.getProfile(userId);
      expect(profile?.baseline).not.toBeNull();
      expect(profile?.baseline?.ear.mean).toBe(0.28);
    });

    it('should create profile if not exists when setting baseline', () => {
      const userId = 'new-user';
      const baseline = createMockBaseline();

      processor.setBaseline(userId, baseline);

      const profile = processor.getProfile(userId);
      expect(profile).not.toBeNull();
      expect(profile?.baseline).not.toBeNull();
    });
  });

  describe('getTrend', () => {
    it('should return zero for insufficient data', () => {
      const userId = 'user-1';
      processor.process(userId, createMockInput());

      const trend = processor.getTrend(userId);
      expect(trend).toBe(0);
    });

    it('should detect increasing fatigue trend', () => {
      const userId = 'user-1';

      // Process 20 data points with increasing scores
      for (let i = 0; i < 20; i++) {
        const input = createMockInput({
          score: 0.2 + i * 0.02,
          timestamp: Date.now() + i * 1000,
        });
        processor.process(userId, input);
      }

      const trend = processor.getTrend(userId);
      expect(trend).toBeGreaterThan(0);
    });

    it('should detect decreasing fatigue trend', () => {
      const userId = 'user-1';

      // Process 20 data points with decreasing scores
      for (let i = 0; i < 20; i++) {
        const input = createMockInput({
          score: 0.6 - i * 0.02,
          timestamp: Date.now() + i * 1000,
        });
        processor.process(userId, input);
      }

      const trend = processor.getTrend(userId);
      expect(trend).toBeLessThan(0);
    });
  });

  describe('getStats', () => {
    it('should return correct total user count', () => {
      processor.process('user-1', createMockInput());
      processor.process('user-2', createMockInput());
      processor.process('user-3', createMockInput());

      const stats = processor.getStats();
      expect(stats.totalUsers).toBe(3);
    });

    it('should return correct active user count', () => {
      processor.process('user-1', createMockInput());
      processor.process('user-2', createMockInput());

      const stats = processor.getStats();
      expect(stats.activeUsers).toBe(2);
    });

    it('should calculate average fatigue correctly', () => {
      processor.process('user-1', createMockInput({ score: 0.2 }));
      processor.process('user-2', createMockInput({ score: 0.4 }));

      const stats = processor.getStats();
      // Average should be around (0.2 + 0.4) / 2 = 0.3
      expect(stats.avgFatigue).toBeGreaterThan(0.2);
      expect(stats.avgFatigue).toBeLessThan(0.5);
    });

    it('should not count expired users as active', () => {
      processor.process('user-1', createMockInput());

      vi.advanceTimersByTime(35000); // Beyond maxAge

      const stats = processor.getStats();
      expect(stats.activeUsers).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired data', () => {
      processor.process('user-1', createMockInput());

      // Advance time significantly
      vi.advanceTimersByTime(400000); // 400 seconds > 10 * maxAge

      processor.cleanup();

      expect(processor.getLatest('user-1')).toBeNull();
    });

    it('should keep recent data', () => {
      processor.process('user-1', createMockInput());

      vi.advanceTimersByTime(10000); // Only 10 seconds

      processor.cleanup();

      expect(processor.getLatest('user-1')).not.toBeNull();
    });
  });

  describe('resetUser', () => {
    it('should remove all user data', () => {
      const userId = 'user-1';
      processor.process(userId, createMockInput());
      processor.setBaseline(userId, createMockBaseline());

      expect(processor.getProfile(userId)).not.toBeNull();
      expect(processor.getLatest(userId)).not.toBeNull();

      processor.resetUser(userId);

      expect(processor.getProfile(userId)).toBeNull();
      expect(processor.getLatest(userId)).toBeNull();
    });
  });

  describe('outlier filtering', () => {
    it('should filter extreme outliers', () => {
      const userId = 'user-1';

      // Build up history with normal values
      for (let i = 0; i < 10; i++) {
        processor.process(
          userId,
          createMockInput({ score: 0.3, timestamp: Date.now() + i * 1000 }),
        );
      }

      // Process an extreme outlier
      const outlierInput = createMockInput({
        score: 0.95,
        timestamp: Date.now() + 11000,
      });
      const result = processor.process(userId, outlierInput);

      // Score should be limited due to outlier filtering
      expect(result.score).toBeLessThan(0.95);
    });
  });

  describe('baseline calibration', () => {
    it('should adjust score based on personal baseline', () => {
      const userId = 'user-1';

      // Set a baseline with higher than average EAR
      const baseline = createMockBaseline({
        ear: { mean: 0.32, std: 0.02, samples: 100 },
      });
      processor.setBaseline(userId, baseline);

      // Process input with same values - should be calibrated
      const input = createMockInput({ score: 0.3, perclos: 0.1 });
      const result = processor.process(userId, input);

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('input validation', () => {
    it('should reject null input', () => {
      const result = processor.process('user-1', null as any);
      expect(result.isValid).toBe(false);
    });

    it('should reject negative blinkRate', () => {
      const input = createMockInput({ blinkRate: -5 });
      const result = processor.process('user-1', input);
      expect(result.isValid).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const input = createMockInput({ confidence: 1.5 });
      const result = processor.process('user-1', input);
      expect(result.isValid).toBe(false);
    });

    it('should accept valid boundary values', () => {
      const input = createMockInput({
        score: 0,
        perclos: 0,
        blinkRate: 0,
        confidence: 1,
      });
      const result = processor.process('user-1', input);
      expect(result.isValid).toBe(true);
    });
  });
});
