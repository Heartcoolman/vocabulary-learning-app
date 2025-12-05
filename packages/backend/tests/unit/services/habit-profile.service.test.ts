/**
 * Habit Profile Service Unit Tests
 * Tests for the actual HabitProfileService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    habitProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    },
    learningSession: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../../../src/amas/modeling/habit-recognizer', () => ({
  HabitRecognizer: class MockHabitRecognizer {
    updateTimePref = vi.fn();
    getProfile = vi.fn().mockReturnValue({
      preferredTimes: [9, 14, 20],
      peakHours: [10, 11],
      consistency: 0.7
    });
  }
}));

import prisma from '../../../src/config/database';

describe('HabitProfileService', () => {
  let habitProfileService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/habit-profile.service');
    habitProfileService = module.habitProfileService;
  });

  describe('getProfile', () => {
    it('should return user habit profile from database', async () => {
      const mockProfile = {
        userId: 'user-1',
        timePref: {
          preferredTimes: [9, 10, 11],
          avgSessionDuration: 15,
          consistency: 0.8
        },
        rhythmPref: {}
      };
      (prisma.habitProfile.findUnique as any).mockResolvedValue(mockProfile);

      const result = await habitProfileService.getProfile('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.preferredTimes).toEqual([9, 10, 11]);
    });

    it('should return default profile for new user', async () => {
      (prisma.habitProfile.findUnique as any).mockResolvedValue(null);

      const result = await habitProfileService.getProfile('new-user');

      expect(result.userId).toBe('new-user');
      expect(result.preferredTimes).toEqual([]);
      expect(result.avgSessionDuration).toBe(0);
    });
  });

  describe('updateProfile', () => {
    it('should update profile based on sessions', async () => {
      const mockSessions = [
        { startedAt: new Date('2024-01-01T09:00:00'), endedAt: new Date('2024-01-01T09:15:00') },
        { startedAt: new Date('2024-01-02T10:00:00'), endedAt: new Date('2024-01-02T10:20:00') }
      ];
      (prisma.learningSession.findMany as any).mockResolvedValue(mockSessions);
      (prisma.habitProfile.upsert as any).mockResolvedValue({
        userId: 'user-1',
        timePref: { preferredTimes: [9, 10] }
      });

      const result = await habitProfileService.updateProfile('user-1');

      expect(result.userId).toBe('user-1');
      expect(prisma.habitProfile.upsert).toHaveBeenCalled();
    });

    it('should return default profile when no sessions', async () => {
      (prisma.learningSession.findMany as any).mockResolvedValue([]);

      const result = await habitProfileService.updateProfile('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('getRecommendedTimes', () => {
    it('should return preferred times from profile', async () => {
      (prisma.habitProfile.findUnique as any).mockResolvedValue({
        userId: 'user-1',
        timePref: { preferredTimes: [9, 14, 20] }
      });

      const result = await habitProfileService.getRecommendedTimes('user-1');

      expect(result).toEqual([9, 14, 20]);
    });

    it('should return default times for new user', async () => {
      (prisma.habitProfile.findUnique as any).mockResolvedValue(null);

      const result = await habitProfileService.getRecommendedTimes('new-user');

      // Default recommended times
      expect(result).toEqual([9, 14, 20]);
    });
  });

  describe('recordTimeEvent', () => {
    it('should record time event without throwing', () => {
      expect(() => {
        habitProfileService.recordTimeEvent('user-1', Date.now());
      }).not.toThrow();
    });
  });

  describe('exports', () => {
    it('should export habitProfileService singleton', async () => {
      const module = await import('../../../src/services/habit-profile.service');
      expect(module.habitProfileService).toBeDefined();
    });
  });
});
