/**
 * BlinkDetector Tests
 *
 * 测试眨眼检测器的状态机逻辑和统计功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BlinkDetector, DEFAULT_BLINK_CONFIG } from '../BlinkDetector';

describe('BlinkDetector', () => {
  let detector: BlinkDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    detector = new BlinkDetector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(detector.getState()).toBe('OPEN');
    });

    it('should accept custom config', () => {
      const customDetector = new BlinkDetector({
        earThreshold: 0.25,
        minBlinkDuration: 100,
        maxBlinkDuration: 600,
      });
      expect(customDetector.getState()).toBe('OPEN');
    });
  });

  describe('state machine transitions', () => {
    it('should transition from OPEN to CLOSING when EAR drops below threshold', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // Below threshold (0.2)
      expect(detector.getState()).toBe('CLOSING');
    });

    it('should transition from CLOSING to CLOSED when EAR is significantly low', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 10); // CLOSING -> CLOSED (below 0.2 * 0.8 = 0.16)
      expect(detector.getState()).toBe('CLOSED');
    });

    it('should return to OPEN from CLOSING if EAR recovers', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      expect(detector.getState()).toBe('CLOSING');
      detector.detectBlink(0.25, now + 10); // CLOSING -> OPEN (above threshold)
      expect(detector.getState()).toBe('OPEN');
    });

    it('should transition from CLOSED to OPENING when EAR starts to recover', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 10); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 100); // CLOSED -> OPENING (above 0.16)
      expect(detector.getState()).toBe('OPENING');
    });

    it('should complete blink cycle and return to OPEN', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 10); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 100); // CLOSED -> OPENING
      detector.detectBlink(0.25, now + 200); // OPENING -> OPEN
      expect(detector.getState()).toBe('OPEN');
    });
  });

  describe('blink event detection', () => {
    it('should return a blink event when a valid blink is detected', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 20); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 100); // CLOSED -> OPENING
      const event = detector.detectBlink(0.25, now + 200); // OPENING -> OPEN

      expect(event).not.toBeNull();
      expect(event?.timestamp).toBe(now + 200);
      expect(event?.duration).toBe(200); // from closeStartTime to now
    });

    it('should return null when EAR is above threshold (no blink)', () => {
      const now = Date.now();
      const event = detector.detectBlink(0.3, now);
      expect(event).toBeNull();
    });

    it('should not register blink if duration is too short', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 10); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 20); // CLOSED -> OPENING
      const event = detector.detectBlink(0.25, now + 30); // Duration: 30ms < minBlinkDuration (50ms)

      expect(event).toBeNull();
    });

    it('should not register blink if duration is too long', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 10); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 400); // CLOSED -> OPENING
      const event = detector.detectBlink(0.25, now + 600); // Duration: 600ms > maxBlinkDuration (500ms)

      expect(event).toBeNull();
    });
  });

  describe('blink statistics', () => {
    it('should return zero stats when no blinks detected', () => {
      const stats = detector.getStats();
      expect(stats.blinkCount).toBe(0);
      expect(stats.blinkRate).toBe(0);
      expect(stats.avgBlinkDuration).toBe(0);
      expect(stats.isValid).toBe(false);
    });

    it('should calculate correct blink count', () => {
      const now = Date.now();

      // Simulate 3 blinks
      for (let i = 0; i < 3; i++) {
        const baseTime = now + i * 5000;
        detector.detectBlink(0.18, baseTime);
        detector.detectBlink(0.12, baseTime + 20);
        detector.detectBlink(0.17, baseTime + 100);
        detector.detectBlink(0.25, baseTime + 200);
      }

      const stats = detector.getStats();
      expect(stats.blinkCount).toBe(3);
    });

    it('should calculate correct blink rate (blinks per minute)', () => {
      const now = Date.now();

      // Simulate 6 blinks over 30 seconds
      for (let i = 0; i < 6; i++) {
        const baseTime = now + i * 5000; // Every 5 seconds
        detector.detectBlink(0.18, baseTime);
        detector.detectBlink(0.12, baseTime + 20);
        detector.detectBlink(0.17, baseTime + 100);
        detector.detectBlink(0.25, baseTime + 200);
      }

      // Advance time to simulate 30 seconds have passed
      vi.advanceTimersByTime(30000);

      const stats = detector.getStats();
      // 6 blinks over ~30 seconds = ~12 blinks/minute
      expect(stats.blinkRate).toBeGreaterThan(10);
      expect(stats.blinkRate).toBeLessThan(15);
    });

    it('should calculate correct average blink duration', () => {
      const now = Date.now();

      // Blink 1: 150ms duration
      detector.detectBlink(0.18, now);
      detector.detectBlink(0.12, now + 10);
      detector.detectBlink(0.17, now + 100);
      detector.detectBlink(0.25, now + 150);

      // Blink 2: 250ms duration
      detector.detectBlink(0.18, now + 5000);
      detector.detectBlink(0.12, now + 5010);
      detector.detectBlink(0.17, now + 5100);
      detector.detectBlink(0.25, now + 5250);

      vi.advanceTimersByTime(10000);

      const stats = detector.getStats();
      // Average: (150 + 250) / 2 = 200ms
      expect(stats.avgBlinkDuration).toBe(200);
    });

    it('should mark stats as valid after 10 seconds of data', () => {
      const now = Date.now();

      // Single blink
      detector.detectBlink(0.18, now);
      detector.detectBlink(0.12, now + 10);
      detector.detectBlink(0.17, now + 100);
      detector.detectBlink(0.25, now + 200);

      // Advance time by 15 seconds
      vi.advanceTimersByTime(15000);

      const stats = detector.getStats();
      expect(stats.isValid).toBe(true);
    });

    it('should prune old events outside the window', () => {
      const now = Date.now();

      // Simulate a blink at the start
      detector.detectBlink(0.18, now);
      detector.detectBlink(0.12, now + 10);
      detector.detectBlink(0.17, now + 100);
      detector.detectBlink(0.25, now + 200);

      // Advance time beyond the window (60 seconds)
      vi.advanceTimersByTime(70000);

      const stats = detector.getStats();
      expect(stats.blinkCount).toBe(0); // Old event should be pruned
    });
  });

  describe('threshold configuration', () => {
    it('should allow updating EAR threshold', () => {
      detector.setEarThreshold(0.25);

      const now = Date.now();
      // With new threshold 0.25, EAR of 0.22 should trigger closing
      detector.detectBlink(0.22, now);
      expect(detector.getState()).toBe('CLOSING');
    });
  });

  describe('reset', () => {
    it('should reset all state and history', () => {
      const now = Date.now();

      // Create some blink events
      detector.detectBlink(0.18, now);
      detector.detectBlink(0.12, now + 10);
      detector.detectBlink(0.17, now + 100);
      detector.detectBlink(0.25, now + 200);

      expect(detector.getStats().blinkCount).toBe(1);

      detector.reset();

      expect(detector.getState()).toBe('OPEN');
      expect(detector.getStats().blinkCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid EAR changes gracefully', () => {
      const now = Date.now();

      // Rapid fluctuations
      for (let i = 0; i < 10; i++) {
        detector.detectBlink(0.1 + (i % 2) * 0.2, now + i * 10);
      }

      // Should not crash and state should be valid
      expect(['OPEN', 'CLOSING', 'CLOSED', 'OPENING']).toContain(detector.getState());
    });

    it('should use current timestamp if not provided', () => {
      const beforeTime = Date.now();
      detector.detectBlink(0.18);
      const afterTime = Date.now();

      expect(detector.getState()).toBe('CLOSING');
      // State changed, meaning timestamp was used internally
    });

    it('should handle state returning to CLOSED from OPENING', () => {
      const now = Date.now();
      detector.detectBlink(0.18, now); // OPEN -> CLOSING
      detector.detectBlink(0.12, now + 20); // CLOSING -> CLOSED
      detector.detectBlink(0.17, now + 100); // CLOSED -> OPENING
      // Eyes close again before fully opening
      detector.detectBlink(0.1, now + 150); // OPENING -> CLOSED (below 0.16)
      expect(detector.getState()).toBe('CLOSED');
    });
  });
});
