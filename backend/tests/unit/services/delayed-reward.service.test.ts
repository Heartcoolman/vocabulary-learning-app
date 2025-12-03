/**
 * Delayed Reward Service Unit Tests
 *
 * Tests for the delayed reward service that handles deferred feedback signals.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  delayedReward: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn()
  },
  wordLearningState: {
    findUnique: vi.fn()
  },
  answerRecord: {
    findMany: vi.fn()
  },
  $transaction: vi.fn((fn) => fn(mockPrisma))
};

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
}));

vi.mock('../../../src/services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn()
  }
}));

import { DelayedRewardService } from '../../../src/services/delayed-reward.service';

describe('DelayedRewardService', () => {
  let rewardService: DelayedRewardService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    rewardService = new DelayedRewardService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Create Pending Reward Tests ====================

  describe('createPendingReward', () => {
    it('should create a pending reward record', async () => {
      const mockReward = {
        id: 'reward-1',
        userId: 'user-1',
        wordId: 'word-1',
        eventId: 'event-1',
        status: 'PENDING',
        createdAt: new Date(),
        dueAt: new Date(Date.now() + 86400000)
      };

      mockPrisma.delayedReward.create.mockResolvedValue(mockReward);

      const result = await rewardService.createPendingReward({
        userId: 'user-1',
        wordId: 'word-1',
        eventId: 'event-1',
        dueAt: new Date(Date.now() + 86400000)
      });

      expect(result).toEqual(mockReward);
      expect(mockPrisma.delayedReward.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          wordId: 'word-1',
          status: 'PENDING'
        })
      });
    });

    it('should set default due time if not provided', async () => {
      mockPrisma.delayedReward.create.mockResolvedValue({ id: 'reward-1' });

      await rewardService.createPendingReward({
        userId: 'user-1',
        wordId: 'word-1',
        eventId: 'event-1'
      });

      expect(mockPrisma.delayedReward.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dueAt: expect.any(Date)
        })
      });
    });
  });

  // ==================== Get Pending Rewards Tests ====================

  describe('getPendingRewards', () => {
    it('should return pending rewards for user', async () => {
      const mockRewards = [
        { id: 'reward-1', wordId: 'word-1', status: 'PENDING' },
        { id: 'reward-2', wordId: 'word-2', status: 'PENDING' }
      ];

      mockPrisma.delayedReward.findMany.mockResolvedValue(mockRewards);

      const result = await rewardService.getPendingRewards('user-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.delayedReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: 'PENDING'
          }
        })
      );
    });

    it('should filter by status', async () => {
      mockPrisma.delayedReward.findMany.mockResolvedValue([]);

      await rewardService.getPendingRewards('user-1', 'PROCESSED');

      expect(mockPrisma.delayedReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: 'PROCESSED'
          }
        })
      );
    });
  });

  // ==================== Get Due Rewards Tests ====================

  describe('getDueRewards', () => {
    it('should return rewards that are due', async () => {
      const dueRewards = [
        { id: 'reward-1', dueAt: new Date(Date.now() - 3600000) }
      ];

      mockPrisma.delayedReward.findMany.mockResolvedValue(dueRewards);

      const result = await rewardService.getDueRewards();

      expect(result).toHaveLength(1);
      expect(mockPrisma.delayedReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            dueAt: { lte: expect.any(Date) }
          }
        })
      );
    });

    it('should limit number of returned rewards', async () => {
      mockPrisma.delayedReward.findMany.mockResolvedValue([]);

      await rewardService.getDueRewards(50);

      expect(mockPrisma.delayedReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50
        })
      );
    });
  });

  // ==================== Process Reward Tests ====================

  describe('processReward', () => {
    it('should compute and update reward signal', async () => {
      const mockReward = {
        id: 'reward-1',
        userId: 'user-1',
        wordId: 'word-1',
        eventId: 'event-1',
        status: 'PENDING'
      };

      mockPrisma.delayedReward.findUnique.mockResolvedValue(mockReward);
      mockPrisma.wordLearningState.findUnique.mockResolvedValue({
        masteryLevel: 3,
        consecutiveCorrect: 5
      });
      mockPrisma.answerRecord.findMany.mockResolvedValue([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false }
      ]);
      mockPrisma.delayedReward.update.mockResolvedValue({
        ...mockReward,
        status: 'PROCESSED',
        rewardSignal: 0.67
      });

      const result = await rewardService.processReward('reward-1');

      expect(result.status).toBe('PROCESSED');
      expect(result.rewardSignal).toBeDefined();
    });

    it('should handle reward not found', async () => {
      mockPrisma.delayedReward.findUnique.mockResolvedValue(null);

      await expect(rewardService.processReward('non-existent')).rejects.toThrow(
        /not found/i
      );
    });

    it('should skip already processed rewards', async () => {
      mockPrisma.delayedReward.findUnique.mockResolvedValue({
        id: 'reward-1',
        status: 'PROCESSED'
      });

      const result = await rewardService.processReward('reward-1');

      expect(result.status).toBe('PROCESSED');
      expect(mockPrisma.delayedReward.update).not.toHaveBeenCalled();
    });
  });

  // ==================== Batch Process Tests ====================

  describe('processDueRewards', () => {
    it('should process all due rewards', async () => {
      const dueRewards = [
        { id: 'reward-1', userId: 'user-1', wordId: 'word-1', status: 'PENDING' },
        { id: 'reward-2', userId: 'user-1', wordId: 'word-2', status: 'PENDING' }
      ];

      mockPrisma.delayedReward.findMany.mockResolvedValue(dueRewards);
      mockPrisma.delayedReward.findUnique.mockImplementation(({ where }) => {
        return dueRewards.find(r => r.id === where.id);
      });
      mockPrisma.wordLearningState.findUnique.mockResolvedValue({ masteryLevel: 3 });
      mockPrisma.answerRecord.findMany.mockResolvedValue([{ isCorrect: true }]);
      mockPrisma.delayedReward.update.mockImplementation(({ where, data }) => ({
        ...dueRewards.find(r => r.id === where.id),
        ...data
      }));

      const results = await rewardService.processDueRewards();

      expect(results.processed).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.delayedReward.findMany.mockResolvedValue([
        { id: 'reward-1', status: 'PENDING' }
      ]);
      mockPrisma.delayedReward.findUnique.mockRejectedValue(new Error('DB error'));

      const results = await rewardService.processDueRewards();

      expect(results.failed).toBe(1);
      expect(results.processed).toBe(0);
    });
  });

  // ==================== Compute Reward Signal Tests ====================

  describe('computeRewardSignal', () => {
    it('should return positive signal for good retention', () => {
      const signal = rewardService.computeRewardSignal({
        correctCount: 8,
        totalCount: 10,
        masteryImprovement: 1,
        timeElapsed: 86400000
      });

      expect(signal).toBeGreaterThan(0);
    });

    it('should return negative signal for poor retention', () => {
      const signal = rewardService.computeRewardSignal({
        correctCount: 2,
        totalCount: 10,
        masteryImprovement: -1,
        timeElapsed: 86400000
      });

      expect(signal).toBeLessThan(0);
    });

    it('should weight recent performance higher', () => {
      const shortDelay = rewardService.computeRewardSignal({
        correctCount: 5,
        totalCount: 10,
        masteryImprovement: 0,
        timeElapsed: 3600000 // 1 hour
      });

      const longDelay = rewardService.computeRewardSignal({
        correctCount: 5,
        totalCount: 10,
        masteryImprovement: 0,
        timeElapsed: 604800000 // 1 week
      });

      // Long delay should have different weight
      expect(Math.abs(shortDelay)).not.toBe(Math.abs(longDelay));
    });

    it('should bound signal to [-1, 1]', () => {
      const extreme = rewardService.computeRewardSignal({
        correctCount: 100,
        totalCount: 100,
        masteryImprovement: 5,
        timeElapsed: 1000
      });

      expect(extreme).toBeLessThanOrEqual(1);
      expect(extreme).toBeGreaterThanOrEqual(-1);
    });
  });

  // ==================== Cleanup Tests ====================

  describe('cleanupOldRewards', () => {
    it('should delete old processed rewards', async () => {
      mockPrisma.delayedReward.deleteMany = vi.fn().mockResolvedValue({ count: 10 });

      const result = await rewardService.cleanupOldRewards(30);

      expect(result.deleted).toBe(10);
      expect(mockPrisma.delayedReward.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'PROCESSED',
          processedAt: { lt: expect.any(Date) }
        }
      });
    });
  });
});
