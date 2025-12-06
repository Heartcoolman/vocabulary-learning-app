/**
 * Learning Objectives Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Create mock instance before module import
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockHistoryCreate = vi.fn();
const mockHistoryFindMany = vi.fn();

const mockPrismaInstance = {
  userLearningObjectives: {
    findUnique: mockFindUnique,
    upsert: mockUpsert,
    delete: mockDelete
  },
  objectiveHistory: {
    create: mockHistoryCreate,
    findMany: mockHistoryFindMany
  }
};

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: function() {
      return mockPrismaInstance;
    }
  };
});

vi.mock('../../../src/amas/optimization/multi-objective-optimizer', () => ({
  MultiObjectiveOptimizer: {
    normalizeWeights: vi.fn((obj) => obj),
    getPresetMode: vi.fn((mode) => ({
      primaryObjective: 'accuracy',
      weightShortTerm: 0.4,
      weightLongTerm: 0.4,
      weightEfficiency: 0.2,
      minAccuracy: mode === 'exam' ? 0.9 : undefined,
      maxDailyTime: mode === 'travel' ? 30 : undefined,
      targetRetention: mode === 'daily' ? 0.85 : undefined
    }))
  }
}));

describe('LearningObjectivesService', () => {
  let LearningObjectivesService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('../../../src/services/learning-objectives.service');
    LearningObjectivesService = module.LearningObjectivesService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getUserObjectives', () => {
    it('should return null when no objectives found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await LearningObjectivesService.getUserObjectives('user-1');

      expect(result).toBeNull();
    });

    it('should return formatted objectives when found', async () => {
      mockFindUnique.mockResolvedValue({
        userId: 'user-1',
        mode: 'daily',
        primaryObjective: 'accuracy',
        minAccuracy: 0.8,
        maxDailyTime: 60,
        targetRetention: 0.85,
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      });

      const result = await LearningObjectivesService.getUserObjectives('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        mode: 'daily',
        primaryObjective: 'accuracy',
        minAccuracy: 0.8,
        maxDailyTime: 60,
        targetRetention: 0.85,
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      });
    });
  });

  describe('upsertUserObjectives', () => {
    it('should create or update user objectives', async () => {
      const objectives = {
        userId: 'user-1',
        mode: 'daily' as const,
        primaryObjective: 'accuracy' as const,
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      };

      mockUpsert.mockResolvedValue({
        ...objectives,
        minAccuracy: null,
        maxDailyTime: null,
        targetRetention: null
      });

      const result = await LearningObjectivesService.upsertUserObjectives(objectives);

      expect(result.userId).toBe('user-1');
      expect(result.mode).toBe('daily');
    });
  });

  describe('switchMode', () => {
    it('should switch to exam mode with preset config', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue({
        userId: 'user-1',
        mode: 'exam',
        primaryObjective: 'accuracy',
        minAccuracy: 0.9,
        maxDailyTime: null,
        targetRetention: null,
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      });

      const result = await LearningObjectivesService.switchMode('user-1', 'exam');

      expect(result.mode).toBe('exam');
    });

    it('should record history when switching from existing objectives', async () => {
      mockFindUnique
        .mockResolvedValueOnce({
          id: 'obj-1',
          userId: 'user-1',
          mode: 'daily',
          primaryObjective: 'accuracy',
          weightShortTerm: 0.4,
          weightLongTerm: 0.4,
          weightEfficiency: 0.2
        })
        .mockResolvedValueOnce({ id: 'obj-1' });

      mockUpsert.mockResolvedValue({
        userId: 'user-1',
        mode: 'exam',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      });

      mockHistoryCreate.mockResolvedValue({});

      await LearningObjectivesService.switchMode('user-1', 'exam', 'manual');

      expect(mockHistoryCreate).toHaveBeenCalled();
    });
  });

  describe('getSuggestions', () => {
    it('should return default suggestion for new user', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await LearningObjectivesService.getSuggestions('user-1');

      expect(result.currentMode).toBe('daily');
      expect(result.suggestedModes.length).toBeGreaterThan(0);
    });

    it('should return suggestions excluding current mode', async () => {
      mockFindUnique.mockResolvedValue({
        userId: 'user-1',
        mode: 'daily',
        primaryObjective: 'accuracy',
        weightShortTerm: 0.4,
        weightLongTerm: 0.4,
        weightEfficiency: 0.2
      });

      const result = await LearningObjectivesService.getSuggestions('user-1');

      expect(result.currentMode).toBe('daily');
      expect(result.suggestedModes.every((s: any) => s.mode !== 'daily')).toBe(true);
    });
  });

  describe('getObjectiveHistory', () => {
    it('should return formatted history', async () => {
      mockHistoryFindMany.mockResolvedValue([
        {
          timestamp: new Date('2024-01-01'),
          reason: 'manual',
          beforeMetrics: { mode: 'daily' },
          afterMetrics: { mode: 'exam' }
        }
      ]);

      const result = await LearningObjectivesService.getObjectiveHistory('user-1', 10);

      expect(result).toHaveLength(1);
      expect(result[0].beforeMode).toBe('daily');
      expect(result[0].afterMode).toBe('exam');
    });
  });

  describe('deleteUserObjectives', () => {
    it('should delete user objectives', async () => {
      mockDelete.mockResolvedValue({});

      await LearningObjectivesService.deleteUserObjectives('user-1');

      expect(mockDelete).toHaveBeenCalledWith({
        where: { userId: 'user-1' }
      });
    });
  });
});
