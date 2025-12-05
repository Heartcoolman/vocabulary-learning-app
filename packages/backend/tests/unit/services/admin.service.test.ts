/**
 * Admin Service Unit Tests
 * Tests for the actual AdminService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    wordBook: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    word: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn()
    },
    wordLearningState: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn()
    },
    wordScore: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn()
    },
    anomalyFlag: {
      create: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn()
    },
    session: {
      deleteMany: vi.fn()
    },
    $transaction: vi.fn((operations) => Promise.all(operations)),
    $queryRaw: vi.fn().mockResolvedValue([])
  }
}));

import prisma from '../../../src/config/database';

describe('AdminService', () => {
  let adminService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/admin.service');
    adminService = module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getAllUsers', () => {
    it('should return paginated user list', async () => {
      (prisma.user.findMany as any).mockResolvedValue([
        { id: 'u1', email: 'user1@test.com' },
        { id: 'u2', email: 'user2@test.com' }
      ]);
      (prisma.user.count as any).mockResolvedValue(50);
      // Mock batch queries for user stats
      (prisma.answerRecord.groupBy as any).mockResolvedValue([]);
      (prisma.wordScore.groupBy as any).mockResolvedValue([]);
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);

      const result = await adminService.getAllUsers({ page: 1, pageSize: 10 });

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(50);
    });

    it('should support search filter', async () => {
      (prisma.user.findMany as any).mockResolvedValue([]);
      (prisma.user.count as any).mockResolvedValue(0);

      await adminService.getAllUsers({ search: 'test' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@test.com',
        username: 'testuser'
      };
      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      const result = await adminService.getUserById('u1');

      expect(result).toEqual(mockUser);
    });

    it('should throw error for non-existent user', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(adminService.getUserById('non-existent')).rejects.toThrow('用户不存在');
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      (prisma.user.update as any).mockResolvedValue({
        id: 'u1',
        role: 'ADMIN'
      });

      const result = await adminService.updateUserRole('u1', 'ADMIN');

      expect(result.role).toBe('ADMIN');
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      (prisma.user.delete as any).mockResolvedValue({});

      await adminService.deleteUser('u1');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'u1' }
      });
    });
  });

  describe('banUser', () => {
    it('should ban user by clearing sessions', async () => {
      (prisma.session.deleteMany as any).mockResolvedValue({ count: 2 });
      (prisma.user.update as any).mockResolvedValue({
        id: 'u1',
        role: 'USER'
      });

      const result = await adminService.banUser('u1');

      expect(prisma.session.deleteMany).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(result.banned).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return overall statistics', async () => {
      (prisma.user.count as any).mockResolvedValue(100);
      (prisma.wordBook.count as any).mockResolvedValue(10);
      (prisma.word.count as any).mockResolvedValue(50000);
      (prisma.answerRecord.count as any).mockResolvedValue(100000);

      const result = await adminService.getStatistics();

      expect(result).toBeDefined();
      expect(result.totalUsers).toBe(100);
    });
  });

  describe('getSystemStats', () => {
    it('should return system statistics', async () => {
      (prisma.user.count as any).mockResolvedValue(100);
      (prisma.wordBook.count as any).mockResolvedValue(10);
      (prisma.word.count as any).mockResolvedValue(50000);

      const result = await adminService.getSystemStats();

      expect(result).toBeDefined();
    });
  });

  describe('createSystemWordBook', () => {
    it('should create system wordbook', async () => {
      (prisma.wordBook.create as any).mockResolvedValue({
        id: 'wb-new',
        name: 'New Wordbook',
        type: 'SYSTEM'
      });

      const result = await adminService.createSystemWordBook({
        name: 'New Wordbook',
        description: 'Description'
      });

      expect(result.type).toBe('SYSTEM');
    });
  });

  describe('updateSystemWordBook', () => {
    it('should update system wordbook', async () => {
      (prisma.wordBook.findUnique as any).mockResolvedValue({
        id: 'wb-1',
        type: 'SYSTEM'
      });
      (prisma.wordBook.update as any).mockResolvedValue({
        id: 'wb-1',
        name: 'Updated Name'
      });

      const result = await adminService.updateSystemWordBook('wb-1', {
        name: 'Updated Name'
      });

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('deleteSystemWordBook', () => {
    it('should delete system wordbook', async () => {
      (prisma.wordBook.findUnique as any).mockResolvedValue({
        id: 'wb-1',
        type: 'SYSTEM'
      });
      (prisma.$transaction as any).mockResolvedValue(undefined);

      await adminService.deleteSystemWordBook('wb-1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getUserLearningData', () => {
    it('should return user learning data', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', email: 'test@test.com', username: 'test' });
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { wordId: 'w1', isCorrect: true, word: { spelling: 'apple', phonetic: '', meanings: [] } },
        { wordId: 'w2', isCorrect: false, word: { spelling: 'banana', phonetic: '', meanings: [] } }
      ]);
      (prisma.answerRecord.count as any).mockResolvedValueOnce(10).mockResolvedValueOnce(8);
      (prisma.answerRecord.groupBy as any).mockResolvedValue([{ wordId: 'w1' }, { wordId: 'w2' }]);

      const result = await adminService.getUserLearningData('u1');

      expect(result.recentRecords).toHaveLength(2);
      expect(result.user).toBeDefined();
    });

    it('should support limit option', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', email: 'test@test.com', username: 'test' });
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);
      (prisma.answerRecord.count as any).mockResolvedValue(0);
      (prisma.answerRecord.groupBy as any).mockResolvedValue([]);

      await adminService.getUserLearningData('u1', { limit: 10 });

      expect(prisma.answerRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10
        })
      );
    });
  });

  describe('getUserDetailedStatistics', () => {
    it('should return detailed user statistics', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'u1',
        email: 'test@test.com',
        username: 'test',
        role: 'USER',
        createdAt: new Date()
      });
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(500)  // totalRecords
        .mockResolvedValueOnce(400); // correctRecords
      (prisma.answerRecord.groupBy as any).mockResolvedValue([{ wordId: 'w1' }]);
      (prisma.wordScore.aggregate as any).mockResolvedValue({ _avg: { totalScore: 85.5 } });
      (prisma.wordLearningState.groupBy as any).mockResolvedValue([{ masteryLevel: 3, _count: 10 }]);
      (prisma.answerRecord.aggregate as any).mockResolvedValue({ _sum: { responseTime: 1000, dwellTime: 500 } });
      (prisma.$queryRaw as any).mockResolvedValue([{ date: new Date() }]);

      const result = await adminService.getUserDetailedStatistics('u1');

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
    });
  });

  describe('exportUserWords', () => {
    it('should export user words in CSV format', async () => {
      // Need to mock user lookup first
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'u1',
        username: 'testuser'
      });
      (prisma.wordLearningState.findMany as any).mockResolvedValue([
        {
          word: {
            spelling: 'apple',
            phonetic: '/ˈæpəl/',
            meanings: ['苹果'],
            examples: ['I ate an apple']
          }
        }
      ]);

      const result = await adminService.exportUserWords('u1', 'csv');

      expect(result).toBeDefined();
    });
  });

  describe('getUserLearningHeatmap', () => {
    it('should return learning heatmap data', async () => {
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { timestamp: new Date(), isCorrect: true }
      ]);

      const result = await adminService.getUserLearningHeatmap('u1');

      expect(result).toBeDefined();
    });
  });

  describe('flagAnomalyRecord', () => {
    it('should create anomaly flag', async () => {
      (prisma.anomalyFlag.upsert as any).mockResolvedValue({
        id: 'af-1',
        reason: 'suspicious'
      });

      const result = await adminService.flagAnomalyRecord({
        userId: 'u1',
        wordId: 'w1',
        flaggedBy: 'admin-1',
        reason: 'suspicious'
      });

      expect(result).toBeDefined();
    });
  });

  describe('getAnomalyFlags', () => {
    it('should return anomaly flags for user', async () => {
      (prisma.anomalyFlag.findMany as any).mockResolvedValue([
        { id: 'af-1', reason: 'suspicious' }
      ]);

      const result = await adminService.getAnomalyFlags('u1');

      expect(result).toHaveLength(1);
    });
  });

  describe('exports', () => {
    it('should export AdminService class', async () => {
      const module = await import('../../../src/services/admin.service');
      expect(module.AdminService).toBeDefined();
    });

    it('should export default singleton', async () => {
      const module = await import('../../../src/services/admin.service');
      expect(module.default).toBeDefined();
    });
  });
});
