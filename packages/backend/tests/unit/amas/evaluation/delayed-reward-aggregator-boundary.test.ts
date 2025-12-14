/**
 * DelayedRewardAggregator Boundary Condition Tests
 *
 * Tests for extreme inputs, edge cases, and error recovery
 * Target: 90%+ coverage for AMAS core algorithms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DelayedRewardAggregator,
  RewardSchedule,
  computeImmediateReward,
  getDefaultSchedule,
} from '../../../../src/amas/rewards/delayed-reward-aggregator';

describe('DelayedRewardAggregator - Boundary Conditions', () => {
  let aggregator: DelayedRewardAggregator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    aggregator = new DelayedRewardAggregator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Extreme Input Values Tests ====================

  describe('extreme reward values', () => {
    it('should clamp reward > 1 to 1', () => {
      aggregator.addReward('user-1', 5.0);
      const result = aggregator.aggregate();

      // Should be clamped, so immediate portion = 1.0 * 0.30 = 0.30
      expect(result.totalIncrement).toBeCloseTo(0.3, 2);
    });

    it('should clamp reward < -1 to -1', () => {
      aggregator.addReward('user-1', -5.0);
      const result = aggregator.aggregate();

      // Should be clamped, so immediate portion = -1.0 * 0.30 = -0.30
      expect(result.totalIncrement).toBeCloseTo(-0.3, 2);
    });

    it('should throw error for NaN reward', () => {
      expect(() => {
        aggregator.addReward('user-1', NaN);
      }).toThrow('奖励值必须是有限数值');
    });

    it('should throw error for Infinity reward', () => {
      expect(() => {
        aggregator.addReward('user-1', Infinity);
      }).toThrow('奖励值必须是有限数值');
    });

    it('should throw error for -Infinity reward', () => {
      expect(() => {
        aggregator.addReward('user-1', -Infinity);
      }).toThrow('奖励值必须是有限数值');
    });

    it('should handle zero reward', () => {
      aggregator.addReward('user-1', 0);
      const result = aggregator.aggregate();

      expect(result.totalIncrement).toBe(0);
    });

    it('should handle very small reward values', () => {
      aggregator.addReward('user-1', 1e-15);
      const result = aggregator.aggregate();

      // Very small values may have floating point precision issues
      expect(Math.abs(result.totalIncrement)).toBeLessThan(1e-10);
    });
  });

  // ==================== Empty/Missing Data Tests ====================

  describe('empty and missing data handling', () => {
    it('should return zero for aggregate with no events', () => {
      const result = aggregator.aggregate();

      expect(result.totalIncrement).toBe(0);
      expect(result.breakdown.length).toBe(0);
      expect(result.pendingCount).toBe(0);
    });

    it('should return 0 for pending count with no events', () => {
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should return empty array for pending events with no events', () => {
      const events = aggregator.getPendingEvents('user-1');
      expect(events).toEqual([]);
    });

    it('should handle null state restoration gracefully', () => {
      // @ts-ignore
      aggregator.setState(null);
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should handle empty state object restoration', () => {
      // @ts-ignore
      aggregator.setState({});
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should handle state with missing events array', () => {
      const state = aggregator.getState();
      delete (state as any).events;

      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      expect(newAggregator.getPendingCount()).toBe(0);
    });
  });

  // ==================== Custom Schedule Tests ====================

  describe('custom schedule handling', () => {
    it('should normalize weights if they do not sum to 1', () => {
      const customSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 0.5, label: 'immediate' },
        { delaySec: 3600, weight: 0.3, label: '1h' },
      ];

      const customAggregator = new DelayedRewardAggregator(customSchedule);
      const schedule = customAggregator.getSchedule();

      const totalWeight = schedule.reduce((sum, s) => sum + s.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should use default schedule when all weights are zero', () => {
      const zeroSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 0, label: 'zero1' },
        { delaySec: 3600, weight: 0, label: 'zero2' },
      ];

      const customAggregator = new DelayedRewardAggregator(zeroSchedule);
      const schedule = customAggregator.getSchedule();

      // Should fall back to default schedule (5 entries)
      expect(schedule.length).toBe(5);
    });

    it('should handle single schedule entry', () => {
      const singleSchedule: RewardSchedule[] = [{ delaySec: 0, weight: 1.0, label: 'immediate' }];

      const customAggregator = new DelayedRewardAggregator(singleSchedule);
      customAggregator.addReward('user-1', 1.0);
      const result = customAggregator.aggregate();

      expect(result.totalIncrement).toBeCloseTo(1.0, 2);
    });

    it('should handle schedule with very small weights', () => {
      const smallWeightSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 1e-10, label: 'tiny1' },
        { delaySec: 3600, weight: 1e-10, label: 'tiny2' },
      ];

      const customAggregator = new DelayedRewardAggregator(smallWeightSchedule);
      const schedule = customAggregator.getSchedule();

      const totalWeight = schedule.reduce((sum, s) => sum + s.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should handle schedule with negative weights by falling back to default', () => {
      const negativeSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: -0.5, label: 'negative' },
        { delaySec: 3600, weight: 0.3, label: 'positive' },
      ];

      // Total is negative, should fall back
      const customAggregator = new DelayedRewardAggregator(negativeSchedule);
      const schedule = customAggregator.getSchedule();

      expect(schedule.length).toBe(5); // Default schedule
    });
  });

  // ==================== Time-Based Delivery Tests ====================

  describe('time-based reward delivery', () => {
    it('should deliver immediate reward right away', () => {
      aggregator.addReward('user-1', 1.0);
      const result = aggregator.aggregate();

      expect(result.totalIncrement).toBeCloseTo(0.3, 2);
    });

    it('should progressively deliver rewards over time', () => {
      aggregator.addReward('user-1', 1.0);

      const result1 = aggregator.aggregate();
      const delivered1 = result1.totalIncrement;

      // Advance time by 1 hour
      vi.advanceTimersByTime(3600 * 1000);

      const result2 = aggregator.aggregate();
      const delivered2 = result2.totalIncrement;

      // After first aggregate, immediate portion is delivered (0.30)
      // After 1 hour, the 1h portion should be delivered (0.20)
      // The second aggregate delivers remaining portions
      expect(delivered1 + delivered2).toBeGreaterThan(delivered1);
    });

    it('should fully deliver all rewards after max delay', () => {
      aggregator.addReward('user-1', 1.0);

      let totalDelivered = 0;

      // Aggregate multiple times over 8 days
      for (let day = 0; day < 8; day++) {
        const result = aggregator.aggregate();
        totalDelivered += result.totalIncrement;
        vi.advanceTimersByTime(24 * 3600 * 1000);
      }

      // Should have delivered close to full reward
      expect(totalDelivered).toBeCloseTo(1.0, 1);
    });

    it('should discard expired events', () => {
      aggregator.addReward('user-1', 1.0);

      // Advance time beyond MAX_EVENT_AGE (8 days)
      vi.advanceTimersByTime(9 * 24 * 3600 * 1000);

      const result = aggregator.aggregate();

      expect(result.breakdown.length).toBe(0);
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should handle events added at different times', () => {
      aggregator.addReward('user-1', 0.5);

      vi.advanceTimersByTime(3600 * 1000); // 1 hour

      aggregator.addReward('user-1', 0.5);

      const result = aggregator.aggregate();

      // Should have two events with different delivery progress
      expect(result.breakdown.length).toBe(2);
    });
  });

  // ==================== User Filtering Tests ====================

  describe('user filtering', () => {
    it('should filter aggregate by userId', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);
      aggregator.addReward('user-1', 0.3);

      const result = aggregator.aggregate(Date.now(), 'user-1');

      expect(result.breakdown.length).toBe(2);
      expect(result.breakdown.every((b) => b.userId === 'user-1')).toBe(true);
    });

    it('should return empty breakdown for non-existent user', () => {
      aggregator.addReward('user-1', 1.0);

      const result = aggregator.aggregate(Date.now(), 'non-existent');

      expect(result.breakdown.length).toBe(0);
      expect(result.totalIncrement).toBe(0);
    });

    it('should return pending count for specific user', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-1', 0.5);
      aggregator.addReward('user-2', 0.8);

      expect(aggregator.getPendingCount('user-1')).toBe(2);
      expect(aggregator.getPendingCount('user-2')).toBe(1);
    });

    it('should clear events for specific user', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      aggregator.clear('user-1');

      expect(aggregator.getPendingCount('user-1')).toBe(0);
      expect(aggregator.getPendingCount('user-2')).toBe(1);
    });

    it('should clear all events when no userId provided', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      aggregator.clear();

      expect(aggregator.getPendingCount()).toBe(0);
    });
  });

  // ==================== Custom Event ID Tests ====================

  describe('custom event ID handling', () => {
    it('should accept custom event ID', () => {
      const eventId = aggregator.addReward('user-1', 1.0, Date.now(), {
        id: 'custom-id-123',
      });

      expect(eventId).toBe('custom-id-123');
    });

    it('should generate unique IDs when not provided', () => {
      const id1 = aggregator.addReward('user-1', 1.0);
      const id2 = aggregator.addReward('user-1', 0.5);

      expect(id1).not.toBe(id2);
    });

    it('should include userId in generated ID', () => {
      const eventId = aggregator.addReward('user-123', 1.0);

      expect(eventId).toContain('user-123');
    });
  });

  // ==================== Feature Vector and Action Index Tests ====================

  describe('feature vector and action index', () => {
    it('should store feature vector with event', () => {
      const featureVector = { data: [0.1, 0.2, 0.3], version: 1 };
      aggregator.addReward('user-1', 1.0, Date.now(), { featureVector });

      const events = aggregator.getPendingEvents('user-1');
      expect(events[0].featureVector).toEqual(featureVector);
    });

    it('should store action index with event', () => {
      aggregator.addReward('user-1', 1.0, Date.now(), { actionIndex: 5 });

      const events = aggregator.getPendingEvents('user-1');
      expect(events[0].actionIndex).toBe(5);
    });

    it('should include feature vector in breakdown', () => {
      aggregator.addReward('user-1', 1.0, Date.now(), {
        featureVector: { data: [0.1, 0.2], version: 1 },
        actionIndex: 3,
      });

      const result = aggregator.aggregate();

      expect(result.breakdown[0].featureVector).toBeDefined();
      expect(result.breakdown[0].actionIndex).toBe(3);
    });
  });

  // ==================== Statistics Tests ====================

  describe('delivery statistics', () => {
    it('should track delivery stats correctly', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.aggregate();

      const stats = aggregator.getDeliveryStats();

      expect(stats.length).toBe(5);
      expect(stats[0].label).toBe('immediate');
      expect(stats[0].totalDelivered).toBeCloseTo(0.3, 2);
    });

    it('should accumulate stats across multiple aggregates', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.aggregate();

      vi.advanceTimersByTime(3600 * 1000);
      aggregator.aggregate();

      const stats = aggregator.getDeliveryStats();

      // 1h stats should now have delivered value
      const oneHourStats = stats.find((s) => s.label === '1h');
      expect(oneHourStats?.totalDelivered).toBeGreaterThan(0);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should preserve events across state save/restore', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      const state = aggregator.getState();

      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      expect(newAggregator.getPendingCount()).toBe(2);
    });

    it('should preserve delivered amounts after restore', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.aggregate(); // Deliver immediate portion

      const state = aggregator.getState();

      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      // Aggregate again should not re-deliver immediate portion
      const result = newAggregator.aggregate();
      expect(result.totalIncrement).toBeLessThan(0.3);
    });

    it('should restore events with feature vectors', () => {
      aggregator.addReward('user-1', 0.8, Date.now(), {
        featureVector: { data: [0.1, 0.2], version: 1 },
        actionIndex: 5,
      });

      const state = aggregator.getState();

      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      const events = newAggregator.getPendingEvents('user-1');
      expect(events[0].featureVector).toBeDefined();
      expect(events[0].actionIndex).toBe(5);
    });
  });

  // ==================== High Volume Tests ====================

  describe('high volume handling', () => {
    it('should handle many events without issues', () => {
      for (let i = 0; i < 100; i++) {
        aggregator.addReward(`user-${i % 10}`, Math.random() * 2 - 1);
      }

      expect(aggregator.getPendingCount()).toBe(100);

      const result = aggregator.aggregate();
      expect(result.breakdown.length).toBe(100);
    });

    it('should handle rapid sequential rewards', () => {
      for (let i = 0; i < 50; i++) {
        aggregator.addReward('user-1', 0.5);
      }

      const result = aggregator.aggregate();

      // 50 events * 0.5 reward * 0.30 immediate weight = 7.5
      expect(result.totalIncrement).toBeCloseTo(7.5, 2);
    });

    it('should handle many users', () => {
      for (let i = 0; i < 100; i++) {
        aggregator.addReward(`user-${i}`, 0.5);
      }

      expect(aggregator.getPendingCount()).toBe(100);

      // Filter for specific user
      const events = aggregator.getPendingEvents('user-50');
      expect(events.length).toBe(1);
    });
  });

  // ==================== Helper Function Tests ====================

  describe('computeImmediateReward', () => {
    it('should compute immediate reward portion', () => {
      const immediate = computeImmediateReward(1.0);
      expect(immediate).toBeCloseTo(0.3, 2);
    });

    it('should handle negative rewards', () => {
      const immediate = computeImmediateReward(-0.5);
      expect(immediate).toBeCloseTo(-0.15, 2);
    });

    it('should accept custom schedule', () => {
      const customSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 0.5, label: 'immediate' },
        { delaySec: 3600, weight: 0.5, label: '1h' },
      ];

      const immediate = computeImmediateReward(1.0, customSchedule);
      expect(immediate).toBeCloseTo(0.5, 2);
    });

    it('should handle schedule with no immediate entry', () => {
      const noImmediateSchedule: RewardSchedule[] = [
        { delaySec: 3600, weight: 0.5, label: '1h' },
        { delaySec: 7200, weight: 0.5, label: '2h' },
      ];

      const immediate = computeImmediateReward(1.0, noImmediateSchedule);
      // computeImmediateReward uses default schedule if provided schedule doesn't have delaySec=0
      // This is the expected behavior based on implementation
      expect(Number.isFinite(immediate)).toBe(true);
    });
  });

  describe('getDefaultSchedule', () => {
    it('should return copy of default schedule', () => {
      const schedule1 = getDefaultSchedule();
      const schedule2 = getDefaultSchedule();

      expect(schedule1).toEqual(schedule2);
      expect(schedule1).not.toBe(schedule2);
    });

    it('should have correct structure', () => {
      const schedule = getDefaultSchedule();

      expect(schedule.length).toBe(5);
      schedule.forEach((s) => {
        expect(s).toHaveProperty('delaySec');
        expect(s).toHaveProperty('weight');
        expect(s).toHaveProperty('label');
        expect(typeof s.delaySec).toBe('number');
        expect(typeof s.weight).toBe('number');
        expect(typeof s.label).toBe('string');
      });
    });

    it('should have weights summing to 1', () => {
      const schedule = getDefaultSchedule();
      const totalWeight = schedule.reduce((sum, s) => sum + s.weight, 0);

      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });
});
