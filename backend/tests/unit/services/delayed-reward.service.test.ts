/**
 * Delayed Reward Service Tests
 * 延迟奖励服务单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DelayedRewardService } from '../../../src/services/delayed-reward.service';
import { RewardStatus, Prisma } from '@prisma/client';

// Mock Prisma - 使用工厂函数并提供可重置的 mock
const createMockPrisma = () => {
  const mock = {
    rewardQueue: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn()
  };

  // $transaction 实现：调用 callback 并传入 mock 作为 tx
  mock.$transaction.mockImplementation(async (callback: (tx: typeof mock) => Promise<unknown>) => {
    return callback(mock);
  });

  return mock;
};

// 全局 mock 实例
let mockPrisma: ReturnType<typeof createMockPrisma>;

vi.mock('../../../src/config/database', () => {
  return {
    get default() {
      return mockPrisma;
    }
  };
});

describe('DelayedRewardService', () => {
  let service: DelayedRewardService;

  beforeEach(async () => {
    // 每次测试前创建新的 mock 实例
    mockPrisma = createMockPrisma();

    // 重置所有 mock
    vi.clearAllMocks();

    service = new DelayedRewardService();
  });

  describe('enqueueDelayedReward', () => {
    it('应该成功入队延迟奖励', async () => {
      const params = {
        sessionId: 'session-123',
        userId: 'user-123',
        dueTs: new Date('2025-11-25'),
        reward: 0.8,
        idempotencyKey: 'user-123:word-123:1732464000000'
      };

      const mockReward = {
        id: 'reward-123',
        ...params,
        status: RewardStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastError: null
      };

      mockPrisma.rewardQueue.create.mockResolvedValue(mockReward);

      const result = await service.enqueueDelayedReward(params);

      expect(result).toEqual(mockReward);
      expect(mockPrisma.rewardQueue.create).toHaveBeenCalledWith({
        data: {
          sessionId: params.sessionId,
          userId: params.userId,
          dueTs: params.dueTs,
          reward: params.reward,
          status: RewardStatus.PENDING,
          idempotencyKey: params.idempotencyKey
        }
      });
    });

    it('应该处理幂等性冲突', async () => {
      const params = {
        userId: 'user-123',
        dueTs: new Date(),
        reward: 0.8,
        idempotencyKey: 'duplicate-key'
      };

      // 模拟唯一约束冲突 - 使用正确的 Prisma 错误类型
      const conflictError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0' }
      );

      const existingReward = {
        id: 'existing-123',
        ...params,
        sessionId: null,
        status: RewardStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastError: null
      };

      mockPrisma.rewardQueue.create.mockRejectedValue(conflictError);
      mockPrisma.rewardQueue.findUnique.mockResolvedValue(existingReward);

      const result = await service.enqueueDelayedReward(params);

      expect(result).toEqual(existingReward);
      expect(mockPrisma.rewardQueue.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: params.idempotencyKey }
      });
    });

    it('应该抛出非幂等性错误', async () => {
      const params = {
        userId: 'user-123',
        dueTs: new Date(),
        reward: 0.8,
        idempotencyKey: 'key-123'
      };

      const otherError = new Error('Database connection failed');
      mockPrisma.rewardQueue.create.mockRejectedValue(otherError);

      await expect(service.enqueueDelayedReward(params)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('processPendingRewards', () => {
    it('应该处理到期的待处理奖励', async () => {
      const now = new Date();
      const tasks = [
        {
          id: 'task-1',
          userId: 'user-1',
          sessionId: 'session-1',
          reward: 0.8,
          dueTs: new Date(now.getTime() - 1000),
          status: RewardStatus.PENDING,
          lastError: null,
          idempotencyKey: 'key-1',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'task-2',
          userId: 'user-2',
          sessionId: 'session-2',
          reward: 0.9,
          dueTs: new Date(now.getTime() - 2000),
          status: RewardStatus.PENDING,
          lastError: null,
          idempotencyKey: 'key-2',
          createdAt: now,
          updatedAt: now
        }
      ];

      // $queryRaw 返回锁定的任务
      mockPrisma.$queryRaw.mockResolvedValue(tasks);
      mockPrisma.rewardQueue.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.rewardQueue.update.mockResolvedValue({});

      const handler = vi.fn().mockResolvedValue(undefined);

      await service.processPendingRewards(handler);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(tasks[0]);
      expect(handler).toHaveBeenCalledWith(tasks[1]);

      // 验证状态更新为DONE
      expect(mockPrisma.rewardQueue.update).toHaveBeenCalledTimes(2);
    });

    it('应该处理处理失败并重试', async () => {
      const now = new Date();
      const task = {
        id: 'task-1',
        userId: 'user-1',
        sessionId: 'session-1',
        reward: 0.8,
        dueTs: now,
        status: RewardStatus.PENDING,
        lastError: null,
        idempotencyKey: 'key-1',
        createdAt: now,
        updatedAt: now
      };

      mockPrisma.$queryRaw.mockResolvedValue([task]);
      mockPrisma.rewardQueue.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.rewardQueue.update.mockResolvedValue({});

      const handler = vi.fn().mockRejectedValue(new Error('Processing failed'));

      await service.processPendingRewards(handler);

      expect(handler).toHaveBeenCalledTimes(1);

      // 验证状态更新为PENDING（重试）
      const updateCall = mockPrisma.rewardQueue.update.mock.calls[0];
      expect(updateCall[0].data.status).toBe(RewardStatus.PENDING);
      expect(updateCall[0].data.lastError).toContain('attempts=1');
    });

    it('应该处理最大重试后标记为FAILED', async () => {
      const now = new Date();
      const task = {
        id: 'task-1',
        userId: 'user-1',
        sessionId: 'session-1',
        reward: 0.8,
        dueTs: now,
        status: RewardStatus.PENDING,
        lastError: 'attempts=2; status=retry; error=Previous error',
        idempotencyKey: 'key-1',
        createdAt: now,
        updatedAt: now
      };

      mockPrisma.$queryRaw.mockResolvedValue([task]);
      mockPrisma.rewardQueue.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.rewardQueue.update.mockResolvedValue({});

      const handler = vi.fn().mockRejectedValue(new Error('Still failing'));

      await service.processPendingRewards(handler);

      // 验证状态更新为FAILED
      const updateCall = mockPrisma.rewardQueue.update.mock.calls[0];
      expect(updateCall[0].data.status).toBe(RewardStatus.FAILED);
      expect(updateCall[0].data.lastError).toContain('attempts=3');
    });

    it('当没有待处理任务时应该提前返回', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const handler = vi.fn();

      await service.processPendingRewards(handler);

      expect(handler).not.toHaveBeenCalled();
      // updateMany 只在有任务时调用
      expect(mockPrisma.rewardQueue.update).not.toHaveBeenCalled();
    });
  });

  describe('getRewardStatus', () => {
    it('应该返回指定会话的奖励状态', async () => {
      const sessionId = 'session-123';
      const rewards = [
        {
          id: 'reward-1',
          sessionId,
          userId: 'user-1',
          reward: 0.8,
          dueTs: new Date(),
          status: RewardStatus.DONE,
          lastError: null,
          idempotencyKey: 'key-1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockPrisma.rewardQueue.findMany.mockResolvedValue(rewards);

      const result = await service.getRewardStatus(sessionId);

      expect(result).toEqual(rewards);
      expect(mockPrisma.rewardQueue.findMany).toHaveBeenCalledWith({
        where: { sessionId },
        orderBy: [{ dueTs: 'asc' }, { updatedAt: 'desc' }]
      });
    });
  });

  describe('findRewards', () => {
    it('应该根据过滤条件查找奖励', async () => {
      const filter = {
        userId: 'user-123',
        status: RewardStatus.PENDING,
        limit: 10
      };

      const rewards = [
        {
          id: 'reward-1',
          sessionId: 'session-1',
          userId: filter.userId,
          reward: 0.8,
          dueTs: new Date(),
          status: filter.status,
          lastError: null,
          idempotencyKey: 'key-1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockPrisma.rewardQueue.findMany.mockResolvedValue(rewards);

      const result = await service.findRewards(filter);

      expect(result).toEqual(rewards);
      expect(mockPrisma.rewardQueue.findMany).toHaveBeenCalledWith({
        where: { userId: filter.userId, status: filter.status },
        orderBy: [{ dueTs: 'asc' }, { updatedAt: 'desc' }],
        take: 10
      });
    });

    it('应该限制查询数量最大为100', async () => {
      mockPrisma.rewardQueue.findMany.mockResolvedValue([]);

      await service.findRewards({ limit: 500 });

      const call = mockPrisma.rewardQueue.findMany.mock.calls[0];
      expect(call[0].take).toBe(100);
    });
  });
});
