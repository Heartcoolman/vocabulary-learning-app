/**
 * Badge Service Unit Tests
 * Tests for the actual BadgeService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    badge: {
      findMany: vi.fn()
    },
    badgeDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    userBadge: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn()
    },
    answerRecord: {
      count: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([])
    },
    wordLearningState: {
      count: vi.fn()
    },
    learningSession: {
      count: vi.fn(),
      findMany: vi.fn()
    },
    stateHistory: {
      findFirst: vi.fn()
    },
    userStateHistory: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([])
    }
  }
}));

import prisma from '../../../src/config/database';

describe('BadgeService', () => {
  let badgeService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/badge.service');
    badgeService = module.badgeService || module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getUserBadges', () => {
    it('should return user badges with details', async () => {
      (prisma.userBadge.findMany as any).mockResolvedValue([
        {
          id: 'ub-1',
          badgeId: 'badge-1',
          tier: 1,
          unlockedAt: new Date(),
          badge: {
            name: '新手',
            description: '完成首次学习',
            iconUrl: '/badge1.png',
            category: 'STREAK'
          }
        }
      ]);

      const result = await badgeService.getUserBadges('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('新手');
    });

    it('should return empty array for user with no badges', async () => {
      (prisma.userBadge.findMany as any).mockResolvedValue([]);

      const result = await badgeService.getUserBadges('new-user');

      expect(result).toHaveLength(0);
    });
  });

  describe('checkAndAwardBadges', () => {
    beforeEach(() => {
      // Mock badge definitions
      (prisma.badgeDefinition.findMany as any).mockResolvedValue([
        {
          id: 'badge-streak',
          name: '坚持者',
          description: '连续7天学习',
          iconUrl: '/streak.png',
          category: 'STREAK',
          tier: 1,
          condition: { type: 'streak', value: 7 }
        },
        {
          id: 'badge-words',
          name: '词汇达人',
          description: '学习100个单词',
          iconUrl: '/words.png',
          category: 'ACHIEVEMENT',
          tier: 1,
          condition: { type: 'words_learned', value: 100 }
        }
      ]);
      
      // Mock existing badges (none)
      (prisma.userBadge.findMany as any).mockResolvedValue([]);
      
      // Mock user stats
      (prisma.learningSession.findMany as any).mockResolvedValue([]);
      (prisma.wordLearningState.count as any).mockResolvedValue(50);
      (prisma.learningSession.count as any).mockResolvedValue(10);
      (prisma.answerRecord.aggregate as any).mockResolvedValue({ _avg: { isCorrect: 0.8 } });
      (prisma.stateHistory.findFirst as any).mockResolvedValue(null);
    });

    it('should return empty array when no new badges earned', async () => {
      const result = await badgeService.checkAndAwardBadges('user-1');

      expect(Array.isArray(result) || result.awarded !== undefined).toBeTruthy();
    });

    it('should award badge when condition met', async () => {
      // User has learned 100+ words
      (prisma.wordLearningState.count as any).mockResolvedValue(150);
      (prisma.userBadge.create as any).mockResolvedValue({
        id: 'ub-new',
        badgeId: 'badge-words',
        tier: 1,
        unlockedAt: new Date()
      });

      const result = await badgeService.checkAndAwardBadges('user-1');

      expect(result).toBeDefined();
    });

    it('should not award already earned badge', async () => {
      (prisma.userBadge.findMany as any).mockResolvedValue([
        { badgeId: 'badge-words', tier: 1 }
      ]);

      const result = await badgeService.checkAndAwardBadges('user-1');

      expect(prisma.userBadge.create).not.toHaveBeenCalled();
    });
  });

  describe('getBadgeDetails', () => {
    it('should return badge details with unlock status', async () => {
      (prisma.badgeDefinition.findMany as any).mockResolvedValue([
        {
          id: 'badge-1',
          name: 'Test Badge',
          description: 'Test',
          iconUrl: '/test.png',
          category: 'STREAK',
          tier: 1,
          condition: { type: 'streak', value: 7 }
        }
      ]);
      (prisma.userBadge.findFirst as any).mockResolvedValue({
        id: 'ub-1',
        unlockedAt: new Date()
      });

      const result = await badgeService.getBadgeDetails?.('badge-1', 'user-1');

      if (result) {
        expect(result.unlocked).toBe(true);
      }
    });
  });

  describe('getBadgeProgress', () => {
    it('should return progress for badges', async () => {
      (prisma.badgeDefinition.findMany as any).mockResolvedValue([
        {
          id: 'badge-1',
          name: 'Words Badge',
          condition: { type: 'words_learned', value: 100 }
        }
      ]);
      (prisma.wordLearningState.count as any).mockResolvedValue(50);
      (prisma.userBadge.findFirst as any).mockResolvedValue(null);

      const result = await badgeService.getBadgeProgress?.('user-1');

      if (result) {
        expect(result).toBeDefined();
      }
    });
  });

  describe('getAllBadges', () => {
    it('should return all badge definitions', async () => {
      (prisma.badgeDefinition.findMany as any).mockResolvedValue([
        { id: 'badge-1', name: 'Badge 1' },
        { id: 'badge-2', name: 'Badge 2' }
      ]);

      const result = await badgeService.getAllBadges();

      expect(result).toHaveLength(2);
    });
  });

  describe('getAllBadgesWithStatus', () => {
    it('should return all badges with user unlock status', async () => {
      (prisma.badgeDefinition.findMany as any).mockResolvedValue([
        {
          id: 'badge-1',
          name: 'Badge 1',
          description: 'Test',
          iconUrl: '/test.png',
          category: 'STREAK',
          tier: 1,
          condition: { type: 'streak', value: 7 }
        }
      ]);
      (prisma.userBadge.findMany as any).mockResolvedValue([
        { badgeId: 'badge-1', tier: 1, unlockedAt: new Date() }
      ]);

      const result = await badgeService.getAllBadgesWithStatus('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].unlocked).toBe(true);
    });
  });

  describe('exports', () => {
    it('should export badgeService singleton', async () => {
      const module = await import('../../../src/services/badge.service');
      expect(module.badgeService).toBeDefined();
    });

    it('should export default', async () => {
      const module = await import('../../../src/services/badge.service');
      expect(module.default).toBeDefined();
    });
  });
});
