/**
 * Delayed Reward Service Unit Tests
 *
 * Tests for the delayed reward service that handles deferred feedback signals.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock must be defined inline without external variable references
vi.mock('../../../src/config/database', () => ({
  default: {
    rewardQueue: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn()
  }
}));

import prisma from '../../../src/config/database';
import { DelayedRewardService } from '../../../src/services/delayed-reward.service';

describe('DelayedRewardService', () => {
  let rewardService: DelayedRewardService;

  beforeEach(() => {
    vi.clearAllMocks();
    rewardService = new DelayedRewardService();
  });

  describe('enqueueDelayedReward', () => {
    it('should create a pending reward record', async () => {
      const mockReward = {
        id: 'reward-1',
        userId: 'user-1',
        sessionId: 'session-1',
        status: 'PENDING',
        dueTs: new Date(Date.now() + 86400000),
        reward: 0.5,
        idempotencyKey: 'user-1:word-1:12345'
      };

      (prisma.rewardQueue.create as any).mockResolvedValue(mockReward);

      const result = await rewardService.enqueueDelayedReward({
        userId: 'user-1',
        sessionId: 'session-1',
        dueTs: new Date(Date.now() + 86400000),
        reward: 0.5,
        idempotencyKey: 'user-1:word-1:12345'
      });

      expect(result).toEqual(mockReward);
      expect(prisma.rewardQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          status: 'PENDING',
          idempotencyKey: 'user-1:word-1:12345'
        })
      });
    });

    it('should return existing record on idempotency key conflict', async () => {
      const existingReward = {
        id: 'reward-existing',
        idempotencyKey: 'user-1:word-1:12345'
      };

      // Simulate P2002 unique constraint error using Prisma's error class
      const { Prisma } = await import('@prisma/client');
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '5.0.0' }
      );
      (prisma.rewardQueue.create as any).mockRejectedValue(prismaError);
      (prisma.rewardQueue.findUnique as any).mockResolvedValue(existingReward);

      const result = await rewardService.enqueueDelayedReward({
        userId: 'user-1',
        dueTs: new Date(),
        reward: 0.5,
        idempotencyKey: 'user-1:word-1:12345'
      });

      expect(result).toEqual(existingReward);
    });
  });

  describe('processPendingRewards', () => {
    it('should process pending rewards with handler', async () => {
      const mockTasks = [
        { id: 'task-1', userId: 'user-1', status: 'PENDING', dueTs: new Date() }
      ];

      (prisma.$transaction as any).mockImplementation(async (fn: any) => {
        return mockTasks;
      });
      (prisma.rewardQueue.update as any).mockResolvedValue({ id: 'task-1', status: 'DONE' });

      const handler = vi.fn().mockResolvedValue(undefined);

      await rewardService.processPendingRewards(handler);

      expect(handler).toHaveBeenCalledWith(mockTasks[0]);
    });

    it('should do nothing when no pending rewards', async () => {
      (prisma.$transaction as any).mockResolvedValue([]);

      const handler = vi.fn();

      await rewardService.processPendingRewards(handler);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle missing handler gracefully', async () => {
      await expect(
        rewardService.processPendingRewards(null as any)
      ).resolves.toBeUndefined();
    });
  });

  describe('getRewardStatus', () => {
    it('should return rewards for session', async () => {
      const mockRewards = [
        { id: 'r1', sessionId: 'session-1', status: 'PENDING' },
        { id: 'r2', sessionId: 'session-1', status: 'DONE' }
      ];

      (prisma.rewardQueue.findMany as any).mockResolvedValue(mockRewards);

      const result = await rewardService.getRewardStatus('session-1');

      expect(result).toHaveLength(2);
      expect(prisma.rewardQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1' }
        })
      );
    });
  });

  describe('findRewards', () => {
    it('should find rewards by filter', async () => {
      const mockRewards = [
        { id: 'r1', userId: 'user-1', status: 'PENDING' }
      ];

      (prisma.rewardQueue.findMany as any).mockResolvedValue(mockRewards);

      const result = await rewardService.findRewards({
        userId: 'user-1',
        status: 'PENDING' as any
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('exports', () => {
    it('should export DelayedRewardService class', async () => {
      const module = await import('../../../src/services/delayed-reward.service');
      expect(module.DelayedRewardService).toBeDefined();
    });

    it('should export delayedRewardService singleton', async () => {
      const module = await import('../../../src/services/delayed-reward.service');
      expect(module.delayedRewardService).toBeDefined();
    });
  });
});
