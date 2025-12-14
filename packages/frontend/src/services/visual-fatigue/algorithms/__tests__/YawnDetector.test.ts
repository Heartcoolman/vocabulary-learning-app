/**
 * YawnDetector Tests
 *
 * 测试打哈欠检测器的 MAR 计算和状态机逻辑
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { YawnDetector, DEFAULT_YAWN_CONFIG } from '../YawnDetector';
import { MOUTH_LANDMARKS } from '@danci/shared';

// Mock landmarks helper
function createMockLandmarks(
  topY: number = 0.5,
  bottomY: number = 0.6,
  leftX: number = 0.4,
  rightX: number = 0.6,
): { x: number; y: number }[] {
  const landmarks: { x: number; y: number }[] = Array(500)
    .fill(null)
    .map(() => ({ x: 0.5, y: 0.5 }));

  // Set mouth landmarks
  landmarks[MOUTH_LANDMARKS.TOP] = { x: 0.5, y: topY };
  landmarks[MOUTH_LANDMARKS.BOTTOM] = { x: 0.5, y: bottomY };
  landmarks[MOUTH_LANDMARKS.LEFT] = { x: leftX, y: 0.55 };
  landmarks[MOUTH_LANDMARKS.RIGHT] = { x: rightX, y: 0.55 };

  return landmarks;
}

describe('YawnDetector', () => {
  let detector: YawnDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    detector = new YawnDetector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(detector.getState()).toBe('NORMAL');
    });

    it('should accept custom config', () => {
      const customDetector = new YawnDetector({
        marThreshold: 0.7,
        minYawnDuration: 3000,
        maxYawnDuration: 10000,
      });
      expect(customDetector.getState()).toBe('NORMAL');
    });
  });

  describe('MAR calculation', () => {
    it('should calculate MAR correctly for normal mouth', () => {
      // Vertical distance: 0.1, Horizontal distance: 0.2
      // MAR = 0.1 / 0.2 = 0.5
      const landmarks = createMockLandmarks(0.5, 0.6, 0.4, 0.6);
      const result = detector.calculateMAR(landmarks);

      expect(result.isValid).toBe(true);
      expect(result.mar).toBeCloseTo(0.5, 1);
    });

    it('should calculate high MAR for wide open mouth (yawning)', () => {
      // Vertical distance: 0.3, Horizontal distance: 0.2
      // MAR = 0.3 / 0.2 = 1.5
      const landmarks = createMockLandmarks(0.4, 0.7, 0.4, 0.6);
      const result = detector.calculateMAR(landmarks);

      expect(result.isValid).toBe(true);
      expect(result.mar).toBeCloseTo(1.5, 1);
    });

    it('should return invalid result for missing landmarks', () => {
      const landmarks: { x: number; y: number }[] = Array(10).fill({ x: 0, y: 0 });
      const result = detector.calculateMAR(landmarks);

      expect(result.isValid).toBe(false);
      expect(result.mar).toBe(-1);
    });

    it('should return invalid result for zero horizontal distance', () => {
      // Left and right at same position
      const landmarks = createMockLandmarks(0.5, 0.6, 0.5, 0.5);
      const result = detector.calculateMAR(landmarks);

      expect(result.isValid).toBe(false);
      expect(result.mar).toBe(-1);
    });
  });

  describe('state machine transitions', () => {
    it('should transition from NORMAL to YAWNING when MAR exceeds threshold', () => {
      const now = Date.now();
      detector.detectYawn(0.7, now); // Above threshold (0.6)
      expect(detector.getState()).toBe('YAWNING');
    });

    it('should stay in NORMAL when MAR is below threshold', () => {
      const now = Date.now();
      detector.detectYawn(0.5, now); // Below threshold
      expect(detector.getState()).toBe('NORMAL');
    });

    it('should transition back to NORMAL after yawn ends', () => {
      const now = Date.now();
      detector.detectYawn(0.7, now); // NORMAL -> YAWNING
      expect(detector.getState()).toBe('YAWNING');
      detector.detectYawn(0.4, now + 3000); // YAWNING -> NORMAL (after valid duration)
      expect(detector.getState()).toBe('NORMAL');
    });
  });

  describe('yawn event detection', () => {
    it('should return a yawn event when a valid yawn is detected', () => {
      const now = Date.now();
      detector.detectYawn(0.7, now); // Start yawn
      const event = detector.detectYawn(0.4, now + 3000); // End yawn after 3 seconds

      expect(event).not.toBeNull();
      expect(event?.startTime).toBe(now);
      expect(event?.endTime).toBe(now + 3000);
      expect(event?.duration).toBe(3000);
    });

    it('should return null when MAR stays below threshold', () => {
      const now = Date.now();
      const event = detector.detectYawn(0.5, now);
      expect(event).toBeNull();
    });

    it('should not register yawn if duration is too short', () => {
      const now = Date.now();
      detector.detectYawn(0.7, now); // Start yawn
      const event = detector.detectYawn(0.4, now + 1000); // End after only 1 second

      expect(event).toBeNull();
      expect(detector.getState()).toBe('NORMAL');
    });

    it('should not register yawn if duration is too long (false positive)', () => {
      const now = Date.now();
      detector.detectYawn(0.7, now); // Start yawn
      // Keep high MAR for too long (9 seconds > max 8 seconds)
      detector.detectYawn(0.7, now + 9000);
      expect(detector.getState()).toBe('NORMAL'); // Should reset due to timeout
    });
  });

  describe('yawn statistics', () => {
    it('should return zero stats when no yawns detected', () => {
      const stats = detector.getStats();
      expect(stats.yawnCount).toBe(0);
      expect(stats.avgYawnDuration).toBe(0);
      expect(stats.isValid).toBe(true);
    });

    it('should calculate correct yawn count', () => {
      const now = Date.now();

      // Simulate 3 yawns
      for (let i = 0; i < 3; i++) {
        const baseTime = now + i * 30000;
        detector.detectYawn(0.7, baseTime);
        detector.detectYawn(0.4, baseTime + 3000);
      }

      const stats = detector.getStats();
      expect(stats.yawnCount).toBe(3);
    });

    it('should calculate correct average yawn duration', () => {
      const now = Date.now();

      // Yawn 1: 3000ms duration
      detector.detectYawn(0.7, now);
      detector.detectYawn(0.4, now + 3000);

      // Yawn 2: 5000ms duration
      detector.detectYawn(0.7, now + 30000);
      detector.detectYawn(0.4, now + 35000);

      const stats = detector.getStats();
      // Average: (3000 + 5000) / 2 = 4000ms
      expect(stats.avgYawnDuration).toBe(4000);
    });

    it('should return window duration in stats', () => {
      const stats = detector.getStats();
      expect(stats.windowDuration).toBe(DEFAULT_YAWN_CONFIG.windowSizeSeconds * 1000);
    });

    it('should prune old events outside the window (5 minutes)', () => {
      const now = Date.now();

      // Simulate a yawn at the start
      detector.detectYawn(0.7, now);
      detector.detectYawn(0.4, now + 3000);

      expect(detector.getYawnCount()).toBe(1);

      // Advance time beyond the window (5 minutes = 300 seconds)
      vi.advanceTimersByTime(310000);

      expect(detector.getYawnCount()).toBe(0);
    });
  });

  describe('process method (combined MAR + detection)', () => {
    it('should calculate MAR and detect yawn in one call', () => {
      const now = Date.now();

      // Wide open mouth (yawning)
      const landmarksYawning = createMockLandmarks(0.35, 0.75, 0.4, 0.6);
      const result1 = detector.process(landmarksYawning, now);

      expect(result1.mar.isValid).toBe(true);
      expect(result1.mar.mar).toBeGreaterThan(DEFAULT_YAWN_CONFIG.marThreshold);
      expect(detector.getState()).toBe('YAWNING');

      // Mouth closes after 3 seconds
      const landmarksNormal = createMockLandmarks(0.5, 0.6, 0.4, 0.6);
      const result2 = detector.process(landmarksNormal, now + 3000);

      expect(result2.yawnEvent).not.toBeNull();
      expect(result2.yawnEvent?.duration).toBe(3000);
    });

    it('should return null yawnEvent for invalid MAR', () => {
      const invalidLandmarks = Array(10).fill({ x: 0, y: 0 });
      const result = detector.process(invalidLandmarks);

      expect(result.mar.isValid).toBe(false);
      expect(result.yawnEvent).toBeNull();
    });
  });

  describe('threshold configuration', () => {
    it('should allow updating MAR threshold', () => {
      detector.setMarThreshold(0.8);

      const now = Date.now();
      // With new threshold 0.8, MAR of 0.7 should not trigger yawning
      detector.detectYawn(0.7, now);
      expect(detector.getState()).toBe('NORMAL');

      // MAR of 0.85 should trigger yawning
      detector.detectYawn(0.85, now + 100);
      expect(detector.getState()).toBe('YAWNING');
    });
  });

  describe('getYawnCount', () => {
    it('should return the count of yawns in the window', () => {
      const now = Date.now();

      expect(detector.getYawnCount()).toBe(0);

      // Add 2 yawns
      detector.detectYawn(0.7, now);
      detector.detectYawn(0.4, now + 3000);

      detector.detectYawn(0.7, now + 10000);
      detector.detectYawn(0.4, now + 13000);

      expect(detector.getYawnCount()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all state and history', () => {
      const now = Date.now();

      // Create some yawn events
      detector.detectYawn(0.7, now);
      detector.detectYawn(0.4, now + 3000);

      expect(detector.getYawnCount()).toBe(1);

      detector.reset();

      expect(detector.getState()).toBe('NORMAL');
      expect(detector.getYawnCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle MAR values at exactly the threshold', () => {
      const now = Date.now();
      // MAR at exactly 0.6 should not trigger (need to be > threshold)
      detector.detectYawn(0.6, now);
      expect(detector.getState()).toBe('NORMAL');

      // Slightly above threshold should trigger
      detector.detectYawn(0.601, now + 100);
      expect(detector.getState()).toBe('YAWNING');
    });

    it('should handle multiple yawns in sequence', () => {
      const now = Date.now();

      // First yawn
      detector.detectYawn(0.7, now);
      detector.detectYawn(0.4, now + 3000);

      // Second yawn immediately after
      detector.detectYawn(0.75, now + 3100);
      expect(detector.getState()).toBe('YAWNING');

      const event = detector.detectYawn(0.4, now + 6100);
      expect(event).not.toBeNull();
      expect(detector.getYawnCount()).toBe(2);
    });
  });
});
