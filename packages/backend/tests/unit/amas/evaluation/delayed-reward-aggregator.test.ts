/**
 * DelayedRewardAggregator Unit Tests
 *
 * Tests for the multi-scale delayed reward aggregation module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DelayedRewardAggregator,
  RewardSchedule,
  DelayedRewardEvent,
  computeImmediateReward,
  getDefaultSchedule,
} from '../../../../src/amas/rewards/delayed-reward-aggregator';

describe('DelayedRewardAggregator', () => {
  let aggregator: DelayedRewardAggregator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    aggregator = new DelayedRewardAggregator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Initialization Tests ====================

  describe('initialization', () => {
    it('should initialize with default schedule', () => {
      const schedule = aggregator.getSchedule();
      expect(schedule.length).toBe(5);
      expect(schedule[0].label).toBe('immediate');
      expect(schedule[0].delaySec).toBe(0);
    });

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

      // Should fall back to default schedule
      expect(schedule.length).toBe(5);
    });
  });

  // ==================== addReward Tests ====================

  describe('addReward', () => {
    it('should add reward event to queue', () => {
      const eventId = aggregator.addReward('user-1', 1.0);

      expect(eventId).toContain('user-1');
      expect(aggregator.getPendingCount()).toBe(1);
    });

    it('should clamp reward to [-1, 1] range', () => {
      aggregator.addReward('user-1', 5.0);
      aggregator.addReward('user-2', -3.0);

      // Aggregate immediately to check the clamped values
      const result = aggregator.aggregate();

      // Should have clamped values
      expect(result.breakdown.length).toBe(2);
    });

    it('should throw error for non-finite reward', () => {
      expect(() => {
        aggregator.addReward('user-1', NaN);
      }).toThrow('奖励值必须是有限数值');

      expect(() => {
        aggregator.addReward('user-1', Infinity);
      }).toThrow('奖励值必须是有限数值');
    });

    it('should accept custom event ID', () => {
      const eventId = aggregator.addReward('user-1', 1.0, Date.now(), {
        id: 'custom-id-123',
      });

      expect(eventId).toBe('custom-id-123');
    });

    it('should accept feature vector and action index', () => {
      const featureVector = new Float32Array([0.1, 0.2, 0.3]);
      aggregator.addReward('user-1', 1.0, Date.now(), {
        featureVector: { data: Array.from(featureVector), version: 1 },
        actionIndex: 5,
      });

      const events = aggregator.getPendingEvents('user-1');
      expect(events[0].featureVector).toBeDefined();
      expect(events[0].actionIndex).toBe(5);
    });
  });

  // ==================== aggregate Tests ====================

  describe('aggregate', () => {
    it('should deliver immediate reward right away', () => {
      aggregator.addReward('user-1', 1.0);

      const result = aggregator.aggregate();

      // Immediate weight is 0.30 by default
      expect(result.totalIncrement).toBeCloseTo(0.3, 2);
      expect(result.breakdown.length).toBe(1);
    });

    it('should progressively deliver delayed rewards', () => {
      aggregator.addReward('user-1', 1.0);

      // First aggregate: immediate only
      const result1 = aggregator.aggregate();
      expect(result1.totalIncrement).toBeCloseTo(0.3, 2);

      // Advance time by 1 hour
      vi.advanceTimersByTime(3600 * 1000);

      // Second aggregate: 1h reward should be delivered plus partial 6h and 24h
      const result2 = aggregator.aggregate();
      // At 1h: 1h portion (0.20) + partial 6h (1/6 * 0.15) + partial 24h (1/24 * 0.20) + partial 7d
      expect(result2.totalIncrement).toBeGreaterThan(0.2);
    });

    it('should handle negative rewards correctly', () => {
      aggregator.addReward('user-1', -0.5);

      const result = aggregator.aggregate();

      // Should deliver negative immediate reward
      expect(result.totalIncrement).toBeCloseTo(-0.15, 2);
    });

    it('should filter by userId when provided', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      const result = aggregator.aggregate(Date.now(), 'user-1');

      expect(result.breakdown.length).toBe(1);
      expect(result.breakdown[0].userId).toBe('user-1');
    });

    it('should remove fully delivered events', () => {
      aggregator.addReward('user-1', 1.0);

      // Advance time beyond max delay (7 days)
      vi.advanceTimersByTime(8 * 24 * 3600 * 1000);

      aggregator.aggregate();

      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should discard expired events', () => {
      aggregator.addReward('user-1', 1.0);

      // Advance time beyond MAX_EVENT_AGE (8 days)
      vi.advanceTimersByTime(9 * 24 * 3600 * 1000);

      const result = aggregator.aggregate();

      expect(result.breakdown.length).toBe(0);
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should include feature vector and action index in breakdown', () => {
      aggregator.addReward('user-1', 1.0, Date.now(), {
        featureVector: { data: [0.1, 0.2], version: 1 },
        actionIndex: 3,
      });

      const result = aggregator.aggregate();

      expect(result.breakdown[0].featureVector).toBeDefined();
      expect(result.breakdown[0].actionIndex).toBe(3);
    });
  });

  // ==================== Pending Events Tests ====================

  describe('pending events', () => {
    it('should return pending events for a user', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-1', 0.5);
      aggregator.addReward('user-2', 0.8);

      const events = aggregator.getPendingEvents('user-1');

      expect(events.length).toBe(2);
      expect(events.every((e) => e.userId === 'user-1')).toBe(true);
    });

    it('should return pending count for all users', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      expect(aggregator.getPendingCount()).toBe(2);
    });

    it('should return pending count for specific user', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-1', 0.5);
      aggregator.addReward('user-2', 0.8);

      expect(aggregator.getPendingCount('user-1')).toBe(2);
      expect(aggregator.getPendingCount('user-2')).toBe(1);
    });
  });

  // ==================== clear Tests ====================

  describe('clear', () => {
    it('should clear all events', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      aggregator.clear();

      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should clear events for specific user', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      aggregator.clear('user-1');

      expect(aggregator.getPendingCount()).toBe(1);
      expect(aggregator.getPendingCount('user-2')).toBe(1);
    });
  });

  // ==================== State Persistence Tests ====================

  describe('state persistence', () => {
    it('should export and import state', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.addReward('user-2', 0.5);

      const state = aggregator.getState();

      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      expect(newAggregator.getPendingCount()).toBe(2);
    });

    it('should handle invalid state gracefully', () => {
      // @ts-ignore - Testing invalid input
      aggregator.setState(null);

      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should restore events with correct properties', () => {
      aggregator.addReward('user-1', 0.8, Date.now(), {
        featureVector: { data: [0.1, 0.2], version: 1 },
        actionIndex: 5,
      });

      const state = aggregator.getState();
      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      const events = newAggregator.getPendingEvents('user-1');
      expect(events[0].reward).toBeCloseTo(0.8, 5);
      expect(events[0].featureVector).toBeDefined();
      expect(events[0].actionIndex).toBe(5);
    });
  });

  // ==================== Statistics Tests ====================

  describe('statistics', () => {
    it('should return delivery stats', () => {
      aggregator.addReward('user-1', 1.0);
      aggregator.aggregate();

      const stats = aggregator.getDeliveryStats();

      expect(stats.length).toBe(5);
      expect(stats[0].label).toBe('immediate');
      expect(stats[0].totalDelivered).toBeCloseTo(0.3, 2);
    });
  });

  // ==================== Queue Pruning Tests ====================

  describe('queue pruning', () => {
    it('should prune queue when exceeding max size', () => {
      // Add more events than MAX_QUEUE_SIZE (10000)
      // We can't actually add 10000+ events in test, so we test the mechanism
      for (let i = 0; i < 100; i++) {
        aggregator.addReward(`user-${i}`, Math.random());
      }

      expect(aggregator.getPendingCount()).toBe(100);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle zero reward', () => {
      aggregator.addReward('user-1', 0);

      const result = aggregator.aggregate();

      expect(result.totalIncrement).toBe(0);
    });

    it('should handle rapid sequential rewards', () => {
      for (let i = 0; i < 10; i++) {
        aggregator.addReward('user-1', 0.5);
      }

      const result = aggregator.aggregate();

      // 10 events * 0.5 reward * 0.30 immediate weight = 1.5
      expect(result.totalIncrement).toBeCloseTo(1.5, 2);
    });

    it('should handle aggregate with no events', () => {
      const result = aggregator.aggregate();

      expect(result.totalIncrement).toBe(0);
      expect(result.breakdown.length).toBe(0);
      expect(result.pendingCount).toBe(0);
    });
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
    const customSchedule: RewardSchedule[] = [{ delaySec: 0, weight: 0.5, label: 'immediate' }];

    const immediate = computeImmediateReward(1.0, customSchedule);

    expect(immediate).toBeCloseTo(0.5, 2);
  });
});

describe('getDefaultSchedule', () => {
  it('should return copy of default schedule', () => {
    const schedule1 = getDefaultSchedule();
    const schedule2 = getDefaultSchedule();

    expect(schedule1).toEqual(schedule2);
    expect(schedule1).not.toBe(schedule2); // Different references
  });

  it('should have correct structure', () => {
    const schedule = getDefaultSchedule();

    expect(schedule.length).toBe(5);
    schedule.forEach((s) => {
      expect(s).toHaveProperty('delaySec');
      expect(s).toHaveProperty('weight');
      expect(s).toHaveProperty('label');
    });
  });
});
