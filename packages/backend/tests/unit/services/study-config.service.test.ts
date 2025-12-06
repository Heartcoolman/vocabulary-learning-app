/**
 * Study Config Service Unit Tests
 * Tests for the actual StudyConfigService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../../src/config/database', () => ({
  default: {
    userStudyConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    },
    wordBook: {
      findMany: vi.fn()
    },
    word: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    },
    wordScore: {
      findMany: vi.fn().mockResolvedValue([])
    },
    answerRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([])
    },
    wordLearningState: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0)
    }
  }
}));

import prisma from '../../../src/config/database';

describe('StudyConfigService', () => {
  let studyConfigService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/study-config.service');
    studyConfigService = new module.StudyConfigService();
  });

  describe('getUserStudyConfig', () => {
    it('should return user config if exists', async () => {
      const mockConfig = {
        userId: 'user-1',
        dailyWordCount: 30,
        selectedWordBookIds: ['wb-1'],
        studyMode: 'sequential'
      };
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue(mockConfig);

      const result = await studyConfigService.getUserStudyConfig('user-1');

      expect(result).toEqual(mockConfig);
    });

    it('should create default config for new user', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue(null);
      (prisma.userStudyConfig.create as any).mockResolvedValue({
        userId: 'user-1',
        dailyWordCount: 20,
        selectedWordBookIds: []
      });

      const result = await studyConfigService.getUserStudyConfig('new-user');

      expect(result).toBeDefined();
      expect(prisma.userStudyConfig.create).toHaveBeenCalled();
    });
  });

  describe('updateStudyConfig', () => {
    it('should update config with valid wordbooks', async () => {
      // Mock wordbooks validation
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1', type: 'SYSTEM' }
      ]);
      (prisma.userStudyConfig.upsert as any).mockResolvedValue({
        userId: 'user-1',
        dailyWordCount: 50,
        selectedWordBookIds: ['wb-1']
      });

      const result = await studyConfigService.updateStudyConfig('user-1', {
        dailyWordCount: 50,
        selectedWordBookIds: ['wb-1']
      });

      expect(result.dailyWordCount).toBe(50);
    });
  });

  describe('getTodayWords', () => {
    it('should return words for today study', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        userId: 'user-1',
        dailyWordCount: 20,
        selectedWordBookIds: ['wb-1']
      });
      // Mock wordBook.findMany for permission check
      (prisma.wordBook.findMany as any).mockResolvedValue([
        { id: 'wb-1' }
      ]);
      (prisma.word.findMany as any).mockResolvedValue([
        { id: 'w1', spelling: 'apple' },
        { id: 'w2', spelling: 'banana' }
      ]);
      (prisma.wordLearningState.findMany as any).mockResolvedValue([]);
      (prisma.answerRecord.findMany as any).mockResolvedValue([]);

      const result = await studyConfigService.getTodayWords('user-1');

      // Method returns { words, progress } object
      expect(result).toBeDefined();
      expect(result.words).toBeDefined();
      expect(result.progress).toBeDefined();
    });
  });

  describe('getStudyProgress', () => {
    it('should return study progress', async () => {
      (prisma.userStudyConfig.findUnique as any).mockResolvedValue({
        userId: 'user-1',
        dailyWordCount: 20,
        selectedWordBookIds: ['wb-1']
      });
      (prisma.answerRecord.count as any).mockResolvedValue(10);
      (prisma.word.count as any).mockResolvedValue(100);

      const result = await studyConfigService.getStudyProgress('user-1');

      expect(result).toBeDefined();
    });
  });

  describe('exports', () => {
    it('should export StudyConfigService class', async () => {
      const module = await import('../../../src/services/study-config.service');
      expect(module.StudyConfigService).toBeDefined();
    });
  });
});
