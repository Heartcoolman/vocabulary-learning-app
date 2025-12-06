/**
 * MotivationTracker Unit Tests
 *
 * Tests for the motivation tracking model that monitors user emotional state
 * and learning motivation using exponential scoring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MotivationTracker,
  MotivationEvent
} from '../../../../src/amas/modeling/motivation-tracker';

describe('MotivationTracker', () => {
  let tracker: MotivationTracker;

  beforeEach(() => {
    tracker = new MotivationTracker();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default motivation value of 0', () => {
      expect(tracker.get()).toBe(0);
    });

    it('should accept custom initial motivation value', () => {
      const custom = new MotivationTracker(undefined, 0.5);
      expect(custom.get()).toBe(0.5);
    });

    it('should clamp initial motivation to [-1, 1] range', () => {
      const high = new MotivationTracker(undefined, 1.5);
      expect(high.get()).toBe(1);

      const low = new MotivationTracker(undefined, -1.5);
      expect(low.get()).toBe(-1);
    });

    it('should start with low motivation count of 0', () => {
      expect(tracker.getLowMotivationCount()).toBe(0);
    });
  });

  // ==================== Update Tests ====================

  describe('update', () => {
    it('should increase motivation on success', () => {
      const initial = tracker.get();
      const event: MotivationEvent = { successes: 1 };
      const result = tracker.update(event);

      expect(result).toBeGreaterThan(initial);
    });

    it('should decrease motivation on failure', () => {
      const initial = tracker.get();
      const event: MotivationEvent = { failures: 1 };
      const result = tracker.update(event);

      expect(result).toBeLessThan(initial);
    });

    it('should decrease motivation more on quit', () => {
      const tracker1 = new MotivationTracker();
      const tracker2 = new MotivationTracker();

      tracker1.update({ failures: 1 });
      tracker2.update({ quits: 1 });

      expect(tracker2.get()).toBeLessThan(tracker1.get());
    });

    it('should apply decay factor (rho) on each update', () => {
      // Set high positive motivation
      const positiveTracker = new MotivationTracker(undefined, 0.8);

      // Update with no events - should decay toward 0
      positiveTracker.update({});

      expect(positiveTracker.get()).toBeLessThan(0.8);
    });

    it('should handle mixed events correctly', () => {
      const event: MotivationEvent = {
        successes: 2,
        failures: 1,
        quits: 0
      };

      const result = tracker.update(event);
      // Net positive due to more successes
      expect(result).toBeGreaterThan(0);
    });

    it('should keep motivation in [-1, 1] range', () => {
      // Many successes
      for (let i = 0; i < 50; i++) {
        tracker.update({ successes: 3 });
      }
      expect(tracker.get()).toBeLessThanOrEqual(1);

      // Reset and many failures
      tracker.reset();
      for (let i = 0; i < 50; i++) {
        tracker.update({ failures: 3, quits: 1 });
      }
      expect(tracker.get()).toBeGreaterThanOrEqual(-1);
    });

    it('should track low motivation count when M < 0', () => {
      expect(tracker.getLowMotivationCount()).toBe(0);

      // Drive motivation negative
      tracker.update({ failures: 3 });
      expect(tracker.get()).toBeLessThan(0);
      expect(tracker.getLowMotivationCount()).toBe(1);

      tracker.update({ failures: 2 });
      expect(tracker.getLowMotivationCount()).toBe(2);
    });

    it('should reset low motivation count when M >= 0', () => {
      // Drive negative
      tracker.update({ failures: 3 });
      tracker.update({ failures: 2 });
      expect(tracker.getLowMotivationCount()).toBe(2);

      // Drive positive
      tracker.update({ successes: 5 });
      if (tracker.get() >= 0) {
        expect(tracker.getLowMotivationCount()).toBe(0);
      }
    });
  });

  // ==================== updateFromEvent Tests ====================

  describe('updateFromEvent', () => {
    it('should increase motivation on correct answer', () => {
      const initial = tracker.get();
      tracker.updateFromEvent(true, false, 0);
      expect(tracker.get()).toBeGreaterThan(initial);
    });

    it('should decrease motivation on incorrect answer', () => {
      const initial = tracker.get();
      tracker.updateFromEvent(false, false, 0);
      expect(tracker.get()).toBeLessThan(initial);
    });

    it('should decrease motivation more on quit', () => {
      const tracker1 = new MotivationTracker();
      const tracker2 = new MotivationTracker();

      tracker1.updateFromEvent(false, false, 0);
      tracker2.updateFromEvent(false, true, 0);

      expect(tracker2.get()).toBeLessThan(tracker1.get());
    });

    it('should factor in retry count for failures', () => {
      const tracker1 = new MotivationTracker();
      const tracker2 = new MotivationTracker();

      tracker1.updateFromEvent(false, false, 0);
      tracker2.updateFromEvent(false, false, 2);

      expect(tracker2.get()).toBeLessThan(tracker1.get());
    });

    it('should cap retry count effect at 2', () => {
      const tracker1 = new MotivationTracker();
      const tracker2 = new MotivationTracker();

      tracker1.updateFromEvent(false, false, 2);
      tracker2.updateFromEvent(false, false, 10);

      expect(tracker1.get()).toBe(tracker2.get());
    });
  });

  // ==================== State Detection Tests ====================

  describe('state detection', () => {
    it('should detect frustrated state when M < -0.3', () => {
      const frustrated = new MotivationTracker(undefined, -0.4);
      expect(frustrated.isFrustrated()).toBe(true);

      const normal = new MotivationTracker(undefined, -0.2);
      expect(normal.isFrustrated()).toBe(false);
    });

    it('should detect highly motivated state when M > 0.5', () => {
      const motivated = new MotivationTracker(undefined, 0.6);
      expect(motivated.isHighlyMotivated()).toBe(true);

      const normal = new MotivationTracker(undefined, 0.4);
      expect(normal.isHighlyMotivated()).toBe(false);
    });

    it('should detect long-term low motivation after 10+ negative updates', () => {
      expect(tracker.isLongTermLowMotivation()).toBe(false);

      // Drive motivation negative and keep it there
      for (let i = 0; i < 12; i++) {
        tracker.update({ failures: 2 });
      }

      expect(tracker.getLowMotivationCount()).toBeGreaterThan(10);
      expect(tracker.isLongTermLowMotivation()).toBe(true);
    });
  });

  // ==================== State Management Tests ====================

  describe('state management', () => {
    it('should reset to default value', () => {
      tracker.update({ failures: 5 });
      tracker.update({ failures: 3 });

      tracker.reset();

      expect(tracker.get()).toBe(0);
      expect(tracker.getLowMotivationCount()).toBe(0);
    });

    it('should reset to custom value', () => {
      tracker.reset(0.5);
      expect(tracker.get()).toBe(0.5);
    });

    it('should clamp reset value', () => {
      tracker.reset(1.5);
      expect(tracker.get()).toBe(1);

      tracker.reset(-1.5);
      expect(tracker.get()).toBe(-1);
    });

    it('should persist and restore state correctly', () => {
      tracker.update({ failures: 3 });
      tracker.update({ failures: 2 });

      const state = tracker.getState();
      expect(state).toHaveProperty('M');
      expect(state).toHaveProperty('lowMotivationCount');

      const newTracker = new MotivationTracker();
      newTracker.setState(state);

      expect(newTracker.get()).toBe(tracker.get());
      expect(newTracker.getLowMotivationCount()).toBe(tracker.getLowMotivationCount());
    });

    it('should clamp restored state values', () => {
      const invalidState = {
        M: 2.0,
        lowMotivationCount: -5
      };

      tracker.setState(invalidState);

      expect(tracker.get()).toBe(1);
      expect(tracker.getLowMotivationCount()).toBe(0);
    });
  });

  // ==================== Parameter Configuration Tests ====================

  describe('parameter configuration', () => {
    it('should allow setting custom parameters', () => {
      tracker.setParams({
        rho: 0.8,
        kappa: 0.2,
        lambda: 0.3,
        mu: 0.5
      });

      // Should work without error
      const result = tracker.update({ successes: 1, failures: 1 });
      expect(typeof result).toBe('number');
    });

    it('should allow partial parameter updates', () => {
      tracker.setParams({ kappa: 0.3 });

      const result = tracker.update({ successes: 1 });
      expect(result).toBeGreaterThan(0);
    });
  });

  // ==================== Alias Tests ====================

  describe('aliases', () => {
    it('getMotivation should be alias for get', () => {
      tracker.update({ successes: 2, failures: 1 });

      expect(tracker.getMotivation()).toBe(tracker.get());
    });
  });
});
