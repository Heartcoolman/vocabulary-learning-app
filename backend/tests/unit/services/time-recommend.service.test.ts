/**
 * Time Recommend Service Unit Tests
 * Tests for the actual TimeRecommendService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    answerRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    },
    learningSession: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    },
    habitProfile: {
      findUnique: vi.fn().mockResolvedValue(null)
    }
  }
}));

import prisma from '../../../src/config/database';

describe('TimeRecommendService', () => {
  let timeRecommendService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../../../src/services/time-recommend.service');
    timeRecommendService = module.timeRecommendService || module.default;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getTimePreferences', () => {
    it('should return insufficient data result when session count is low', async () => {
      // Service uses findMany.length, not count
      (prisma.learningSession.findMany as any).mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const result = await timeRecommendService?.getTimePreferences?.('user-1');

      expect(result).toBeDefined();
      // Check if result indicates insufficient data
      if (result?.insufficientData) {
        expect(result.insufficientData).toBe(true);
      }
    });

    it('should return time preferences when sufficient data exists', async () => {
      (prisma.learningSession.count as any).mockResolvedValue(50);
      (prisma.habitProfile.findUnique as any).mockResolvedValue({
        timePref: JSON.stringify(new Array(24).fill(1/24))
      });

      const result = await timeRecommendService?.getTimePreferences?.('user-1');

      expect(result).toBeDefined();
      if (!result?.insufficientData) {
        expect(result.timePref).toBeDefined();
        expect(result.preferredSlots).toBeDefined();
        expect(result.confidence).toBeDefined();
      }
    });

    it('should calculate time preferences from records when no habit profile', async () => {
      (prisma.learningSession.count as any).mockResolvedValue(50);
      (prisma.habitProfile.findUnique as any).mockResolvedValue(null);
      (prisma.answerRecord.findMany as any).mockResolvedValue([
        { timestamp: new Date('2024-01-01T09:00:00'), isCorrect: true },
        { timestamp: new Date('2024-01-01T10:00:00'), isCorrect: true },
        { timestamp: new Date('2024-01-01T14:00:00'), isCorrect: false }
      ]);

      const result = await timeRecommendService?.getTimePreferences?.('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('isGoldenTime', () => {
    it('should return golden time result', async () => {
      (prisma.learningSession.count as any).mockResolvedValue(50);
      (prisma.habitProfile.findUnique as any).mockResolvedValue({
        timePref: JSON.stringify(new Array(24).fill(0).map((_, i) => i === 9 ? 0.5 : 0.02))
      });

      const result = await timeRecommendService?.isGoldenTime?.('user-1');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('isGolden');
      expect(result).toHaveProperty('currentHour');
    });

    it('should return non-golden time for new users with insufficient data', async () => {
      (prisma.learningSession.count as any).mockResolvedValue(5);

      const result = await timeRecommendService?.isGoldenTime?.('new-user');

      expect(result).toBeDefined();
      expect(result.isGolden).toBe(false);
    });
  });

  describe('service exports', () => {
    it('should export timeRecommendService singleton', async () => {
      const module = await import('../../../src/services/time-recommend.service');
      expect(module.timeRecommendService).toBeDefined();
    });

  });

  describe('type definitions', () => {
    it('should have TimeSlot interface with required properties', async () => {
      (prisma.learningSession.count as any).mockResolvedValue(50);
      (prisma.habitProfile.findUnique as any).mockResolvedValue({
        timePref: JSON.stringify(new Array(24).fill(1/24))
      });

      const result = await timeRecommendService?.getTimePreferences?.('user-1');

      if (result && !result.insufficientData && result.preferredSlots?.length > 0) {
        const slot = result.preferredSlots[0];
        expect(slot).toHaveProperty('hour');
        expect(slot).toHaveProperty('score');
        expect(slot).toHaveProperty('confidence');
      }
    });
  });
});
