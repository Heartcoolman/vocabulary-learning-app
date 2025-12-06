/**
 * User Service Unit Tests
 * Tests for the actual UserService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    word: {
      count: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    answerRecord: {
      count: vi.fn(),
      aggregate: vi.fn(),
      deleteMany: vi.fn()
    },
    wordLearningState: {
      deleteMany: vi.fn()
    },
    wordScore: {
      deleteMany: vi.fn()
    },
    learningSession: {
      deleteMany: vi.fn()
    },
    session: {
      deleteMany: vi.fn()
    },
    $transaction: vi.fn((operations) => Promise.all(operations))
  }
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn()
  }
}));

import prisma from '../../../src/config/database';
import bcrypt from 'bcrypt';

describe('UserService', () => {
  let userService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/user.service');
    userService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        rewardProfile: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      const result = await userService.getUserById('user-1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' }
        })
      );
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const result = await userService.getUserById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw error when throwIfMissing option is set', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        userService.getUserById('non-existent', { throwIfMissing: true })
      ).rejects.toThrow('用户不存在');
    });
  });

  describe('updatePassword', () => {
    it('should update password when old password is correct', async () => {
      const mockUser = {
        id: 'user-1',
        passwordHash: 'old-hash'
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (bcrypt.hash as any).mockResolvedValue('new-hash');
      (prisma.user.update as any).mockResolvedValue({});
      (prisma.session.deleteMany as any).mockResolvedValue({});

      await userService.updatePassword('user-1', {
        oldPassword: 'old-password',
        newPassword: 'new-password'
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('old-password', 'old-hash');
      expect(bcrypt.hash).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' }
      });
    });

    it('should throw error when user not found', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        userService.updatePassword('non-existent', {
          oldPassword: 'old',
          newPassword: 'new'
        })
      ).rejects.toThrow('用户不存在');
    });

    it('should throw error when old password is incorrect', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash'
      });
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(
        userService.updatePassword('user-1', {
          oldPassword: 'wrong',
          newPassword: 'new'
        })
      ).rejects.toThrow('旧密码不正确');
    });
  });

  describe('getUserStatistics', () => {
    it('should return user statistics', async () => {
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1' },
        { id: 'wb-2' }
      ]);
      (prisma.word.count as any).mockResolvedValue(1000);
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(500) // totalRecords
        .mockResolvedValueOnce(400); // correctRecords

      const result = await userService.getUserStatistics('user-1');

      expect(result).toBeDefined();
      expect(result.totalWords).toBe(1000);
      expect(result.totalRecords).toBe(500);
      expect(result.correctCount).toBe(400);
      expect(result.accuracy).toBe(80);
    });

    it('should return 0 accuracy when no records', async () => {
      (prisma.wordBook.findMany as any).mockResolvedValue([]);
      (prisma.word.count as any).mockResolvedValue(0);
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await userService.getUserStatistics('new-user');

      expect(result.accuracy).toBe(0);
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      const updatedUser = {
        id: 'user-1',
        username: 'updated-name'
      };
      (prisma.user.update as any).mockResolvedValue(updatedUser);

      const result = await userService.updateUser('user-1', { username: 'updated-name' });

      expect(result.username).toBe('updated-name');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { username: 'updated-name' }
      });
    });
  });

  describe('getUserStats', () => {
    it('should return user stats', async () => {
      (prisma.answerRecord.count as any).mockResolvedValue(100);
      (prisma.answerRecord.aggregate as any).mockResolvedValue({
        _avg: { responseTime: 2500 }
      });

      const result = await userService.getUserStats('user-1');

      expect(result.totalRecords).toBe(100);
      expect(result.avgResponseTime).toBe(2500);
    });

    it('should return null avgResponseTime when no records', async () => {
      (prisma.answerRecord.count as any).mockResolvedValue(0);
      (prisma.answerRecord.aggregate as any).mockResolvedValue({
        _avg: { responseTime: null }
      });

      const result = await userService.getUserStats('new-user');

      expect(result.totalRecords).toBe(0);
      expect(result.avgResponseTime).toBeNull();
    });
  });

  describe('updateRewardProfile', () => {
    it('should update reward profile', async () => {
      (prisma.user.update as any).mockResolvedValue({
        id: 'user-1',
        rewardProfile: 'efficiency'
      });

      const result = await userService.updateRewardProfile('user-1', 'efficiency');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { rewardProfile: 'efficiency' }
      });
    });
  });

  describe('deleteUser', () => {
    it('should delete user and related data in transaction', async () => {
      (prisma.$transaction as any).mockResolvedValue([{}, {}, {}, {}, {}]);

      await userService.deleteUser('user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('should export UserService class', async () => {
      const module = await import('../../../src/services/user.service');
      expect(module.UserService).toBeDefined();
    });

    it('should export default singleton', async () => {
      const module = await import('../../../src/services/user.service');
      expect(module.default).toBeDefined();
    });
  });
});
