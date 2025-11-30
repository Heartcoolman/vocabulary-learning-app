/**
 * DelayedRewardAggregator Unit Tests
 * 测试多时间尺度奖励聚合和队列管理
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DelayedRewardAggregator,
  DelayedRewardState,
  RewardSchedule,
  getDefaultSchedule,
  computeImmediateReward
} from '../../../../src/amas/evaluation/delayed-reward-aggregator';

describe('DelayedRewardAggregator', () => {
  let aggregator: DelayedRewardAggregator;

  beforeEach(() => {
    aggregator = new DelayedRewardAggregator();
  });

  describe('Initialization', () => {
    it('should initialize with empty queue', () => {
      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should use default schedule', () => {
      const schedule = aggregator.getSchedule();

      expect(schedule.length).toBe(5);
      expect(schedule[0].label).toBe('immediate');
      expect(schedule[0].weight).toBe(0.3);
    });

    it('should accept custom schedule', () => {
      const customSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 0.5, label: 'now' },
        { delaySec: 3600, weight: 0.5, label: '1h' }
      ];

      const customAggregator = new DelayedRewardAggregator(customSchedule);
      const schedule = customAggregator.getSchedule();

      expect(schedule.length).toBe(2);
      expect(schedule[0].weight).toBe(0.5);
    });
  });

  describe('Adding Rewards', () => {
    it('should add reward to queue', () => {
      const eventId = aggregator.addReward('user1', 0.8);

      expect(aggregator.getPendingCount()).toBe(1);
      expect(eventId).toContain('user1');
    });

    it('should accept custom event ID', () => {
      const eventId = aggregator.addReward('user1', 0.8, Date.now(), {
        id: 'custom-id-123'
      });

      expect(eventId).toBe('custom-id-123');
    });

    it('should clamp reward to [-1, 1]', () => {
      aggregator.addReward('user1', 2.0);
      aggregator.addReward('user2', -2.0);

      const events1 = aggregator.getPendingEvents('user1');
      const events2 = aggregator.getPendingEvents('user2');

      expect(events1[0].reward).toBe(1);
      expect(events2[0].reward).toBe(-1);
    });

    it('should throw on non-finite reward', () => {
      expect(() => {
        aggregator.addReward('user1', NaN);
      }).toThrow();

      expect(() => {
        aggregator.addReward('user1', Infinity);
      }).toThrow();
    });

    it('should store optional metadata', () => {
      aggregator.addReward('user1', 0.8, Date.now(), {
        featureVector: [1, 2, 3],
        actionIndex: 5,
        meta: { source: 'test' }
      });

      const events = aggregator.getPendingEvents('user1');
      expect(events[0].featureVector).toEqual([1, 2, 3]);
      expect(events[0].actionIndex).toBe(5);
      expect(events[0].meta?.source).toBe('test');
    });
  });

  describe('Aggregation', () => {
    it('should return immediate reward portion immediately', () => {
      const now = Date.now();
      aggregator.addReward('user1', 1.0, now);

      const result = aggregator.aggregate(now);

      expect(result.totalIncrement).toBeCloseTo(0.3, 2);
    });

    it('should release more reward over time', () => {
      const now = Date.now();
      aggregator.addReward('user1', 1.0, now);

      const result1 = aggregator.aggregate(now);
      const result2 = aggregator.aggregate(now + 3600 * 1000);

      expect(result2.totalIncrement).toBeGreaterThan(0);
    });

    it('should eventually release full reward', () => {
      const now = Date.now();
      aggregator.addReward('user1', 1.0, now);

      let totalDelivered = 0;

      totalDelivered += aggregator.aggregate(now).totalIncrement;
      totalDelivered += aggregator.aggregate(now + 3600 * 1000).totalIncrement;
      totalDelivered += aggregator.aggregate(now + 21600 * 1000).totalIncrement;
      totalDelivered += aggregator.aggregate(now + 86400 * 1000).totalIncrement;
      totalDelivered += aggregator.aggregate(now + 604800 * 1000).totalIncrement;

      expect(totalDelivered).toBeCloseTo(1.0, 1);
    });

    it('should filter by user ID', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user2', 0.5);

      const result = aggregator.aggregate(Date.now(), 'user1');

      expect(result.breakdown.length).toBe(1);
      expect(result.breakdown[0].userId).toBe('user1');
    });

    it('should return breakdown details', () => {
      const now = Date.now();
      aggregator.addReward('user1', 0.8, now);

      const result = aggregator.aggregate(now);

      expect(result.breakdown.length).toBe(1);
      expect(result.breakdown[0]).toHaveProperty('eventId');
      expect(result.breakdown[0]).toHaveProperty('increment');
      expect(result.breakdown[0]).toHaveProperty('remaining');
      expect(result.breakdown[0]).toHaveProperty('progress');
    });

    it('should discard expired events', () => {
      const veryOldTime = Date.now() - 9 * 24 * 3600 * 1000;
      aggregator.addReward('user1', 0.8, veryOldTime);

      aggregator.aggregate(Date.now());

      expect(aggregator.getPendingCount()).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should get pending events for user', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user1', 0.5);
      aggregator.addReward('user2', 0.3);

      const events = aggregator.getPendingEvents('user1');

      expect(events.length).toBe(2);
    });

    it('should get pending count for all users', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user2', 0.5);

      expect(aggregator.getPendingCount()).toBe(2);
    });

    it('should get pending count for specific user', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user1', 0.5);
      aggregator.addReward('user2', 0.3);

      expect(aggregator.getPendingCount('user1')).toBe(2);
      expect(aggregator.getPendingCount('user2')).toBe(1);
    });

    it('should clear all events', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user2', 0.5);

      aggregator.clear();

      expect(aggregator.getPendingCount()).toBe(0);
    });

    it('should clear events for specific user', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user2', 0.5);

      aggregator.clear('user1');

      expect(aggregator.getPendingCount()).toBe(1);
      expect(aggregator.getPendingCount('user2')).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should return delivery stats', () => {
      const now = Date.now();
      aggregator.addReward('user1', 1.0, now);
      aggregator.aggregate(now);

      const stats = aggregator.getDeliveryStats();

      expect(stats.length).toBe(5);
      expect(stats[0].label).toBe('immediate');
      expect(stats[0].totalDelivered).toBeGreaterThan(0);
    });
  });

  describe('State Persistence', () => {
    it('should export state correctly', () => {
      aggregator.addReward('user1', 0.8);
      aggregator.addReward('user2', 0.5);

      const state = aggregator.getState();

      expect(state.version).toBeDefined();
      expect(state.queue.length).toBe(2);
      expect(state.idSequence).toBeGreaterThan(0);
    });

    it('should restore state correctly', () => {
      aggregator.addReward('user1', 0.8);

      const state = aggregator.getState();
      const newAggregator = new DelayedRewardAggregator();
      newAggregator.setState(state);

      expect(newAggregator.getPendingCount()).toBe(1);
      expect(newAggregator.getPendingEvents('user1').length).toBe(1);
    });

    it('should handle invalid state gracefully', () => {
      expect(() => {
        aggregator.setState(null as unknown as DelayedRewardState);
      }).not.toThrow();
    });

    it('should validate restored events', () => {
      const badState: DelayedRewardState = {
        version: '1.0.0',
        queue: [
          {
            id: 'test',
            userId: 'user1',
            reward: 5.0,
            timestamp: Date.now(),
            delivered: [0, 0]
          }
        ],
        idSequence: 1
      };

      aggregator.setState(badState);

      const events = aggregator.getPendingEvents('user1');
      expect(events[0].reward).toBe(1);
    });
  });

  describe('Convenience Functions', () => {
    it('getDefaultSchedule should return schedule copy', () => {
      const schedule = getDefaultSchedule();

      expect(schedule.length).toBe(5);
      expect(schedule[0].delaySec).toBe(0);
    });

    it('computeImmediateReward should return immediate portion', () => {
      const immediate = computeImmediateReward(1.0);

      expect(immediate).toBeCloseTo(0.3, 2);
    });

    it('computeImmediateReward should accept custom schedule', () => {
      const customSchedule: RewardSchedule[] = [
        { delaySec: 0, weight: 0.5, label: 'now' },
        { delaySec: 3600, weight: 0.5, label: '1h' }
      ];

      const immediate = computeImmediateReward(1.0, customSchedule);

      expect(immediate).toBeCloseTo(0.5, 2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative rewards', () => {
      const now = Date.now();
      aggregator.addReward('user1', -0.5, now);

      const result = aggregator.aggregate(now);

      expect(result.totalIncrement).toBeLessThan(0);
    });

    it('should handle zero rewards', () => {
      const now = Date.now();
      aggregator.addReward('user1', 0, now);

      const result = aggregator.aggregate(now);

      expect(result.totalIncrement).toBe(0);
    });

    it('should handle many events', () => {
      for (let i = 0; i < 100; i++) {
        aggregator.addReward(`user${i % 10}`, Math.random() * 2 - 1);
      }

      expect(aggregator.getPendingCount()).toBe(100);

      const result = aggregator.aggregate(Date.now());
      expect(result.pendingCount).toBe(100);
    });
  });
});
