/**
 * Plan Generator Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    userStudyConfig: {
      findUnique: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    learningPlan: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    answerRecord: {
      count: vi.fn()
    },
    wordLearningState: {
      count: vi.fn()
    }
  }
}));

vi.mock('../../../src/middleware/error.middleware', () => ({
  AppError: {
    forbidden: (msg: string) => new Error(msg)
  }
}));

import prisma from '../../../src/config/database';

describe('PlanGeneratorService', () => {
  let planGeneratorService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/plan-generator.service');
    planGeneratorService = module.planGeneratorService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('generatePlan', () => {
    beforeEach(() => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1', 'wb-2'],
        dailyWordCount: 20
      });
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', name: '词书1', wordCount: 500 },
        { id: 'wb-2', name: '词书2', wordCount: 300 }
      ]);
      (prisma.learningPlan.upsert as any).mockImplementation(async ({ create }) => ({
        id: 'plan-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
    });

    it('should generate plan with default daily target', async () => {
      const plan = await planGeneratorService.generatePlan('user-1');

      expect(plan).toBeDefined();
      expect(plan.dailyTarget).toBe(20);
      expect(plan.totalWords).toBe(800);
      expect(plan.wordbookDistribution).toHaveLength(2);
    });

    it('should use custom daily target', async () => {
      const plan = await planGeneratorService.generatePlan('user-1', {
        dailyTarget: 30
      });

      expect(plan.dailyTarget).toBe(30);
    });

    it('should calculate completion date based on daily target', async () => {
      const plan = await planGeneratorService.generatePlan('user-1', {
        dailyTarget: 100
      });

      const expectedDays = Math.ceil(800 / 100);
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + expectedDays);

      expect(plan.estimatedCompletionDate.getDate()).toBe(expectedDate.getDate());
    });

    it('should calculate daily target from target days', async () => {
      const plan = await planGeneratorService.generatePlan('user-1', {
        targetDays: 40
      });

      expect(plan.dailyTarget).toBe(Math.ceil(800 / 40));
    });

    it('should support legacy daysRemaining option', async () => {
      const plan = await planGeneratorService.generatePlan('user-1', {
        daysRemaining: 30
      });

      expect(plan.dailyTarget).toBe(Math.ceil(800 / 30));
    });

    it('should override total words with targetWords option', async () => {
      const plan = await planGeneratorService.generatePlan('user-1', {
        targetWords: 500
      });

      expect(plan.totalWords).toBe(500);
    });

    it('should generate weekly milestones', async () => {
      const plan = await planGeneratorService.generatePlan('user-1');

      expect(plan.weeklyMilestones).toBeDefined();
      expect(plan.weeklyMilestones.length).toBeGreaterThan(0);
      expect(plan.weeklyMilestones[0].week).toBe(1);
      expect(plan.weeklyMilestones[0].description).toBe('开始学习之旅');
    });

    it('should distribute wordbooks by priority', async () => {
      const plan = await planGeneratorService.generatePlan('user-1');

      const totalPercentage = plan.wordbookDistribution.reduce(
        (sum: number, wb: any) => sum + wb.percentage,
        0
      );

      expect(totalPercentage).toBe(100);
      expect(plan.wordbookDistribution[0].priority).toBe(1);
    });

    it('should throw for unauthorized wordbook access', async () => {
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', name: '词书1', wordCount: 500 }
      ]);

      await expect(
        planGeneratorService.generatePlan('user-1', {
          wordbookIds: ['wb-1', 'wb-unauthorized']
        })
      ).rejects.toThrow('无权访问');
    });
  });

  describe('getCurrentPlan', () => {
    it('should return current plan', async () => {
      const mockPlan = {
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: 20,
        totalWords: 500,
        estimatedCompletionDate: new Date(),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      (prisma.learningPlan.findUnique as any).mockResolvedValue(mockPlan);

      const plan = await planGeneratorService.getCurrentPlan('user-1');

      expect(plan).toBeDefined();
      expect(plan?.id).toBe('plan-1');
    });

    it('should return null for no plan', async () => {
      (prisma.learningPlan.findUnique as any).mockResolvedValue(null);

      const plan = await planGeneratorService.getCurrentPlan('user-1');

      expect(plan).toBeNull();
    });
  });

  describe('getPlan', () => {
    it('should find plan by userId', async () => {
      (prisma.learningPlan.findFirst as any).mockResolvedValue({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: 20,
        totalWords: 500,
        estimatedCompletionDate: new Date(),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const plan = await planGeneratorService.getPlan('user-1');

      expect(plan).toBeDefined();
    });

    it('should find plan by planId', async () => {
      (prisma.learningPlan.findFirst as any).mockResolvedValue({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: 20,
        totalWords: 500,
        estimatedCompletionDate: new Date(),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const plan = await planGeneratorService.getPlan('plan-1');

      expect(plan).toBeDefined();
    });
  });

  describe('updatePlanProgress', () => {
    beforeEach(() => {
      (prisma.learningPlan.findUnique as any).mockResolvedValue({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: 20,
        totalWords: 500,
        estimatedCompletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      });
    });

    it('should calculate progress metrics', async () => {
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(100);
      (prisma.wordLearningState.count as any).mockResolvedValue(150);

      const progress = await planGeneratorService.updatePlanProgress('user-1');

      expect(progress.completedToday).toBe(15);
      expect(progress.targetToday).toBe(20);
      expect(progress.weeklyProgress).toBeDefined();
      expect(progress.overallProgress).toBeDefined();
    });

    it('should return default progress when no plan exists', async () => {
      (prisma.learningPlan.findUnique as any).mockResolvedValue(null);

      const progress = await planGeneratorService.updatePlanProgress('user-1');

      expect(progress.completedToday).toBe(0);
      expect(progress.onTrack).toBe(true);
    });

    it('should detect off-track progress', async () => {
      (prisma.answerRecord.count as any)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(30);
      (prisma.wordLearningState.count as any).mockResolvedValue(50);
      (prisma.learningPlan.update as any).mockResolvedValue({});

      const progress = await planGeneratorService.updatePlanProgress('user-1');

      expect(typeof progress.deviation).toBe('number');
    });
  });

  describe('adjustPlan', () => {
    beforeEach(() => {
      (prisma.learningPlan.findUnique as any).mockResolvedValue({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: 20,
        totalWords: 500,
        estimatedCompletionDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      });
      (prisma.wordLearningState.count as any).mockResolvedValue(100);
    });

    it('should adjust daily target based on progress', async () => {
      (prisma.learningPlan.update as any).mockImplementation(async ({ data }) => ({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: data.dailyTarget,
        totalWords: 500,
        estimatedCompletionDate: new Date(),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: data.updatedAt
      }));

      const adjusted = await planGeneratorService.adjustPlan('user-1', 'test reason');

      expect(adjusted).toBeDefined();
      expect(prisma.learningPlan.update).toHaveBeenCalled();
    });

    it('should generate new plan if none exists', async () => {
      (prisma.learningPlan.findUnique as any).mockResolvedValue(null);
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1'],
        dailyWordCount: 20
      });
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', name: '词书1', wordCount: 500 }
      ]);
      (prisma.learningPlan.upsert as any).mockImplementation(async ({ create }) => ({
        id: 'plan-new',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const plan = await planGeneratorService.adjustPlan('user-1', 'no plan');

      expect(plan).toBeDefined();
    });

    it('should limit adjustment to 50% of original target', async () => {
      (prisma.wordLearningState.count as any).mockResolvedValue(50);
      (prisma.learningPlan.update as any).mockImplementation(async ({ data }) => ({
        id: 'plan-1',
        userId: 'user-1',
        dailyTarget: data.dailyTarget,
        totalWords: 500,
        estimatedCompletionDate: new Date(),
        wordbookDistribution: [],
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const adjusted = await planGeneratorService.adjustPlan('user-1', 'test');

      expect(adjusted.dailyTarget).toBeGreaterThanOrEqual(10);
      expect(adjusted.dailyTarget).toBeLessThanOrEqual(30);
    });
  });

  describe('wordbookDistribution calculation', () => {
    it('should ensure percentages sum to 100', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1', 'wb-2', 'wb-3'],
        dailyWordCount: 20
      });
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', name: '词书1', wordCount: 500 },
        { id: 'wb-2', name: '词书2', wordCount: 300 },
        { id: 'wb-3', name: '词书3', wordCount: 200 }
      ]);
      (prisma.learningPlan.upsert as any).mockImplementation(async ({ create }) => ({
        id: 'plan-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const plan = await planGeneratorService.generatePlan('user-1');

      const totalPercentage = plan.wordbookDistribution.reduce(
        (sum: number, wb: any) => sum + wb.percentage,
        0
      );

      expect(totalPercentage).toBe(100);
    });

    it('should handle single wordbook', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: ['wb-1'],
        dailyWordCount: 20
      });
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', name: '词书1', wordCount: 500 }
      ]);
      (prisma.learningPlan.upsert as any).mockImplementation(async ({ create }) => ({
        id: 'plan-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const plan = await planGeneratorService.generatePlan('user-1');

      expect(plan.wordbookDistribution).toHaveLength(1);
      expect(plan.wordbookDistribution[0].percentage).toBe(100);
    });

    it('should handle empty wordbook list', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        selectedWordBookIds: [],
        dailyWordCount: 20
      });
      (prisma.wordBook.findMany as any).mockResolvedValue([]);
      (prisma.learningPlan.upsert as any).mockImplementation(async ({ create }) => ({
        id: 'plan-1',
        ...create,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const plan = await planGeneratorService.generatePlan('user-1');

      expect(plan.wordbookDistribution).toHaveLength(0);
      expect(plan.totalWords).toBe(0);
    });
  });
});
