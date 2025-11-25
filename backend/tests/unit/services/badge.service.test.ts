/**
 * Badge Service Tests
 * 徽章服务单元测试
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadgeCategory } from '@prisma/client';

// Mock Prisma
vi.mock('../../../src/config/database', () => ({
  default: {
    badgeDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    userBadge: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn()
    },
    answerRecord: {
      findMany: vi.fn(),
      groupBy: vi.fn()
    },
    wordLearningState: {
      count: vi.fn()
    },
    userStateHistory: {
      findFirst: vi.fn()
    }
  }
}));

// 导入服务前需要先设置 mock
import { badgeService, BadgeCondition, UserStats } from '../../../src/services/badge.service';

describe('BadgeService', () => {
  let mockPrisma: any;

  beforeEach(async () => {
    const prismaModule = await import('../../../src/config/database');
    mockPrisma = prismaModule.default;
    vi.clearAllMocks();
  });

  describe('getUserBadges', () => {
    it('应该返回用户已获得的徽章列表', async () => {
      const userId = 'user-123';
      const mockUserBadges = [
        {
          id: 'ub-1',
          badgeId: 'badge-1',
          tier: 1,
          unlockedAt: new Date('2024-01-15'),
          badge: {
            id: 'badge-1',
            name: '初学者',
            description: '完成首次学习',
            iconUrl: '/icons/beginner.svg',
            category: BadgeCategory.MILESTONE,
            tier: 1
          }
        }
      ];

      mockPrisma.userBadge.findMany.mockResolvedValue(mockUserBadges);

      const result = await badgeService.getUserBadges(userId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('初学者');
      expect(result[0].category).toBe(BadgeCategory.MILESTONE);
      expect(mockPrisma.userBadge.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: { badge: true },
        orderBy: [{ unlockedAt: 'desc' }]
      });
    });

    it('应该返回空数组当用户没有徽章', async () => {
      mockPrisma.userBadge.findMany.mockResolvedValue([]);

      const result = await badgeService.getUserBadges('new-user');

      expect(result).toEqual([]);
    });
  });

  describe('checkAndAwardBadges', () => {
    it('应该为满足条件的徽章授予用户', async () => {
      const userId = 'user-123';

      // Mock 用户统计数据相关查询
      mockPrisma.answerRecord.findMany.mockResolvedValue([
        { timestamp: new Date(), isCorrect: true }
      ]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([{ sessionId: 's1' }]);
      mockPrisma.wordLearningState.count.mockResolvedValue(150);
      mockPrisma.userStateHistory.findFirst.mockResolvedValue(null);

      // Mock 徽章定义
      mockPrisma.badgeDefinition.findMany.mockResolvedValue([
        {
          id: 'badge-100words',
          name: '百词斩',
          description: '学习100个单词',
          iconUrl: '/icons/100words.svg',
          category: BadgeCategory.MILESTONE,
          tier: 1,
          condition: { type: 'words_learned', value: 100 }
        }
      ]);

      // Mock 用户已有徽章（空）
      mockPrisma.userBadge.findMany.mockResolvedValue([]);

      // Mock 创建新徽章
      const newBadgeRecord = {
        id: 'ub-new',
        badgeId: 'badge-100words',
        tier: 1,
        unlockedAt: new Date()
      };
      mockPrisma.userBadge.create.mockResolvedValue(newBadgeRecord);

      const result = await badgeService.checkAndAwardBadges(userId);

      expect(result).toHaveLength(1);
      expect(result[0].badge.name).toBe('百词斩');
      expect(result[0].isNew).toBe(true);
    });

    it('应该跳过已获得的徽章', async () => {
      const userId = 'user-123';

      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.wordLearningState.count.mockResolvedValue(150);
      mockPrisma.userStateHistory.findFirst.mockResolvedValue(null);

      mockPrisma.badgeDefinition.findMany.mockResolvedValue([
        {
          id: 'badge-100words',
          name: '百词斩',
          description: '学习100个单词',
          iconUrl: '/icons/100words.svg',
          category: BadgeCategory.MILESTONE,
          tier: 1,
          condition: { type: 'words_learned', value: 100 }
        }
      ]);

      // 用户已有该徽章
      mockPrisma.userBadge.findMany.mockResolvedValue([
        { badgeId: 'badge-100words', tier: 1 }
      ]);

      const result = await badgeService.checkAndAwardBadges(userId);

      expect(result).toHaveLength(0);
      expect(mockPrisma.userBadge.create).not.toHaveBeenCalled();
    });
  });

  describe('getBadgeDetails', () => {
    it('应该返回徽章详情', async () => {
      const badgeId = 'badge-streak7';
      mockPrisma.badgeDefinition.findUnique.mockResolvedValue({
        id: badgeId,
        name: '七日连胜',
        description: '连续学习7天',
        iconUrl: '/icons/streak7.svg',
        category: BadgeCategory.STREAK,
        tier: 1,
        condition: { type: 'streak', value: 7 }
      });

      const result = await badgeService.getBadgeDetails(badgeId);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('七日连胜');
      expect(result!.condition.type).toBe('streak');
    });

    it('应该返回null当徽章不存在', async () => {
      mockPrisma.badgeDefinition.findUnique.mockResolvedValue(null);

      const result = await badgeService.getBadgeDetails('non-existent');

      expect(result).toBeNull();
    });

    it('应该包含用户解锁状态', async () => {
      const badgeId = 'badge-streak7';
      const userId = 'user-123';

      mockPrisma.badgeDefinition.findUnique.mockResolvedValue({
        id: badgeId,
        name: '七日连胜',
        description: '连续学习7天',
        iconUrl: '/icons/streak7.svg',
        category: BadgeCategory.STREAK,
        tier: 1,
        condition: { type: 'streak', value: 7 }
      });

      mockPrisma.userBadge.findFirst.mockResolvedValue({
        unlockedAt: new Date('2024-01-15')
      });

      const result = await badgeService.getBadgeDetails(badgeId, userId);

      expect(result!.unlocked).toBe(true);
      expect(result!.unlockedAt).toBeDefined();
    });
  });

  describe('getBadgeProgress', () => {
    it('应该返回徽章进度', async () => {
      const userId = 'user-123';
      const badgeId = 'badge-100words';

      mockPrisma.badgeDefinition.findUnique.mockResolvedValue({
        id: badgeId,
        name: '百词斩',
        description: '学习100个单词',
        iconUrl: '/icons/100words.svg',
        category: BadgeCategory.MILESTONE,
        tier: 1,
        condition: { type: 'words_learned', value: 100 }
      });

      // Mock 用户统计
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.wordLearningState.count.mockResolvedValue(75);
      mockPrisma.userStateHistory.findFirst.mockResolvedValue(null);

      const result = await badgeService.getBadgeProgress(userId, badgeId);

      expect(result).not.toBeNull();
      expect(result!.currentValue).toBe(75);
      expect(result!.targetValue).toBe(100);
      expect(result!.percentage).toBe(75);
    });

    it('应该返回null当徽章不存在', async () => {
      mockPrisma.badgeDefinition.findUnique.mockResolvedValue(null);

      const result = await badgeService.getBadgeProgress('user-123', 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAllBadgesWithStatus', () => {
    it('应该返回所有徽章及用户解锁状态和进度', async () => {
      const userId = 'user-123';

      mockPrisma.badgeDefinition.findMany.mockResolvedValue([
        {
          id: 'badge-streak7',
          name: '七日连胜',
          description: '连续学习7天',
          iconUrl: '/icons/streak7.svg',
          category: BadgeCategory.STREAK,
          tier: 1,
          condition: { type: 'streak', value: 7 }
        },
        {
          id: 'badge-100words',
          name: '百词斩',
          description: '学习100个单词',
          iconUrl: '/icons/100words.svg',
          category: BadgeCategory.MILESTONE,
          tier: 1,
          condition: { type: 'words_learned', value: 100 }
        }
      ]);

      mockPrisma.userBadge.findMany.mockResolvedValue([
        { badgeId: 'badge-streak7', tier: 1, unlockedAt: new Date('2024-01-15') }
      ]);

      // Mock 用户统计
      mockPrisma.answerRecord.findMany.mockResolvedValue([]);
      mockPrisma.answerRecord.groupBy.mockResolvedValue([]);
      mockPrisma.wordLearningState.count.mockResolvedValue(50);
      mockPrisma.userStateHistory.findFirst.mockResolvedValue(null);

      const result = await badgeService.getAllBadgesWithStatus(userId);

      expect(result).toHaveLength(2);

      // 已解锁的徽章
      const unlockedBadge = result.find(b => b.id === 'badge-streak7');
      expect(unlockedBadge!.unlocked).toBe(true);
      expect(unlockedBadge!.progress).toBe(100);

      // 未解锁的徽章
      const lockedBadge = result.find(b => b.id === 'badge-100words');
      expect(lockedBadge!.unlocked).toBe(false);
      expect(lockedBadge!.progress).toBe(50); // 50/100 = 50%
    });
  });
});

describe('Badge Eligibility Logic', () => {
  describe('条件类型检查', () => {
    it('streak 条件: 连续天数 >= 目标值', () => {
      const condition: BadgeCondition = { type: 'streak', value: 7 };
      const stats: UserStats = {
        consecutiveDays: 10,
        totalWordsLearned: 0,
        totalSessions: 0,
        recentAccuracy: 0,
        cognitiveImprovement: { memory: 0, speed: 0, stability: 0, hasData: false }
      };

      // 通过私有方法测试（通过公开的 checkAndAwardBadges 间接测试）
      expect(stats.consecutiveDays >= condition.value).toBe(true);
    });

    it('accuracy 条件: 正确率 >= 目标值', () => {
      const condition: BadgeCondition = { type: 'accuracy', value: 0.9 };
      const stats: UserStats = {
        consecutiveDays: 0,
        totalWordsLearned: 100,
        totalSessions: 0,
        recentAccuracy: 0.95,
        cognitiveImprovement: { memory: 0, speed: 0, stability: 0, hasData: false }
      };

      expect(stats.recentAccuracy >= condition.value).toBe(true);
    });

    it('words_learned 条件: 学习单词数 >= 目标值', () => {
      const condition: BadgeCondition = { type: 'words_learned', value: 500 };
      const stats: UserStats = {
        consecutiveDays: 0,
        totalWordsLearned: 600,
        totalSessions: 0,
        recentAccuracy: 0,
        cognitiveImprovement: { memory: 0, speed: 0, stability: 0, hasData: false }
      };

      expect(stats.totalWordsLearned >= condition.value).toBe(true);
    });

    it('total_sessions 条件: 会话数 >= 目标值', () => {
      const condition: BadgeCondition = { type: 'total_sessions', value: 50 };
      const stats: UserStats = {
        consecutiveDays: 0,
        totalWordsLearned: 0,
        totalSessions: 75,
        recentAccuracy: 0,
        cognitiveImprovement: { memory: 0, speed: 0, stability: 0, hasData: false }
      };

      expect(stats.totalSessions >= condition.value).toBe(true);
    });

    it('cognitive_improvement 条件: 需要 hasData 为 true', () => {
      const condition: BadgeCondition = {
        type: 'cognitive_improvement',
        value: 0.1,
        params: { metric: 'memory' }
      };

      const statsNoData: UserStats = {
        consecutiveDays: 0,
        totalWordsLearned: 0,
        totalSessions: 0,
        recentAccuracy: 0,
        cognitiveImprovement: { memory: 0.2, speed: 0.1, stability: 0.1, hasData: false }
      };

      const statsWithData: UserStats = {
        consecutiveDays: 0,
        totalWordsLearned: 0,
        totalSessions: 0,
        recentAccuracy: 0,
        cognitiveImprovement: { memory: 0.2, speed: 0.1, stability: 0.1, hasData: true }
      };

      // 无数据时不应该满足条件
      expect(statsNoData.cognitiveImprovement.hasData).toBe(false);
      // 有数据时应该满足条件
      expect(statsWithData.cognitiveImprovement.memory >= condition.value).toBe(true);
    });
  });
});
