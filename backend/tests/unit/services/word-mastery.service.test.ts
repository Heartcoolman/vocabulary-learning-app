/**
 * Word Mastery Service Unit Tests
 *
 * Tests for the word mastery service that tracks learning progress.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma
const mockPrisma = {
  wordLearningState: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn()
  },
  answerRecord: {
    findMany: vi.fn(),
    count: vi.fn()
  },
  $transaction: vi.fn((fn) => fn(mockPrisma))
};

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
}));

import { WordMasteryService } from '../../../src/services/word-mastery.service';

describe('WordMasteryService', () => {
  let masteryService: WordMasteryService;

  beforeEach(() => {
    vi.clearAllMocks();
    masteryService = new WordMasteryService();
  });

  // ==================== Get Mastery Tests ====================

  describe('getMastery', () => {
    it('should return word mastery state', async () => {
      const mockState = {
        id: 'state-1',
        userId: 'user-1',
        wordId: 'word-1',
        masteryLevel: 3,
        consecutiveCorrect: 5,
        lastReviewDate: new Date(),
        nextReviewDate: new Date(Date.now() + 86400000)
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValue(mockState);

      const result = await masteryService.getMastery('user-1', 'word-1');

      expect(result).toEqual(mockState);
      expect(mockPrisma.wordLearningState.findUnique).toHaveBeenCalledWith({
        where: {
          unique_user_word: {
            userId: 'user-1',
            wordId: 'word-1'
          }
        }
      });
    });

    it('should return null for untracked word', async () => {
      mockPrisma.wordLearningState.findUnique.mockResolvedValue(null);

      const result = await masteryService.getMastery('user-1', 'word-new');

      expect(result).toBeNull();
    });
  });

  // ==================== Update Mastery Tests ====================

  describe('updateMastery', () => {
    it('should increase mastery on correct answer', async () => {
      const existingState = {
        id: 'state-1',
        userId: 'user-1',
        wordId: 'word-1',
        masteryLevel: 2,
        consecutiveCorrect: 3,
        currentInterval: 1
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValue(existingState);
      mockPrisma.wordLearningState.update.mockResolvedValue({
        ...existingState,
        masteryLevel: 3,
        consecutiveCorrect: 4
      });

      const result = await masteryService.updateMastery('user-1', 'word-1', true);

      expect(result.masteryLevel).toBe(3);
      expect(result.consecutiveCorrect).toBe(4);
    });

    it('should reset consecutive count on incorrect answer', async () => {
      const existingState = {
        id: 'state-1',
        userId: 'user-1',
        wordId: 'word-1',
        masteryLevel: 3,
        consecutiveCorrect: 5,
        currentInterval: 4
      };

      mockPrisma.wordLearningState.findUnique.mockResolvedValue(existingState);
      mockPrisma.wordLearningState.update.mockResolvedValue({
        ...existingState,
        consecutiveCorrect: 0,
        currentInterval: 1
      });

      const result = await masteryService.updateMastery('user-1', 'word-1', false);

      expect(result.consecutiveCorrect).toBe(0);
    });

    it('should create new state for first review', async () => {
      mockPrisma.wordLearningState.findUnique.mockResolvedValue(null);
      mockPrisma.wordLearningState.create.mockResolvedValue({
        id: 'new-state',
        userId: 'user-1',
        wordId: 'word-1',
        masteryLevel: 1,
        consecutiveCorrect: 1,
        currentInterval: 1
      });

      const result = await masteryService.updateMastery('user-1', 'word-1', true);

      expect(result.masteryLevel).toBe(1);
      expect(mockPrisma.wordLearningState.create).toHaveBeenCalled();
    });
  });

  // ==================== Get User Progress Tests ====================

  describe('getUserProgress', () => {
    it('should return overall user progress', async () => {
      mockPrisma.wordLearningState.findMany.mockResolvedValue([
        { masteryLevel: 5 },
        { masteryLevel: 3 },
        { masteryLevel: 1 }
      ]);
      mockPrisma.wordLearningState.count.mockResolvedValue(3);

      const progress = await masteryService.getUserProgress('user-1');

      expect(progress.totalWords).toBe(3);
      expect(progress.masteredWords).toBe(1); // Level 5
      expect(progress.learningWords).toBe(1); // Level 3
      expect(progress.newWords).toBe(1); // Level 1
    });

    it('should handle user with no progress', async () => {
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);
      mockPrisma.wordLearningState.count.mockResolvedValue(0);

      const progress = await masteryService.getUserProgress('new-user');

      expect(progress.totalWords).toBe(0);
      expect(progress.masteredWords).toBe(0);
    });
  });

  // ==================== Due Words Tests ====================

  describe('getDueWords', () => {
    it('should return words due for review', async () => {
      const now = new Date();
      const dueWords = [
        { wordId: 'word-1', nextReviewDate: new Date(now.getTime() - 3600000) },
        { wordId: 'word-2', nextReviewDate: new Date(now.getTime() - 7200000) }
      ];

      mockPrisma.wordLearningState.findMany.mockResolvedValue(dueWords);

      const result = await masteryService.getDueWords('user-1', 10);

      expect(result).toHaveLength(2);
      expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            nextReviewDate: { lte: expect.any(Date) }
          }),
          take: 10
        })
      );
    });

    it('should order by urgency (most overdue first)', async () => {
      mockPrisma.wordLearningState.findMany.mockResolvedValue([]);

      await masteryService.getDueWords('user-1', 10);

      expect(mockPrisma.wordLearningState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { nextReviewDate: 'asc' }
        })
      );
    });
  });

  // ==================== Interval Calculation Tests ====================

  describe('calculateNextInterval', () => {
    it('should increase interval on correct answer', () => {
      const interval = masteryService.calculateNextInterval(1, true, 3);
      expect(interval).toBeGreaterThan(1);
    });

    it('should reset interval on incorrect answer', () => {
      const interval = masteryService.calculateNextInterval(7, false, 0);
      expect(interval).toBe(1);
    });

    it('should factor in consecutive correct count', () => {
      const lowConsecutive = masteryService.calculateNextInterval(2, true, 1);
      const highConsecutive = masteryService.calculateNextInterval(2, true, 10);

      expect(highConsecutive).toBeGreaterThan(lowConsecutive);
    });

    it('should cap maximum interval', () => {
      const interval = masteryService.calculateNextInterval(100, true, 50);
      expect(interval).toBeLessThanOrEqual(180); // 6 months max
    });
  });

  // ==================== Mastery Level Tests ====================

  describe('calculateMasteryLevel', () => {
    it('should return level 1 for new words', () => {
      const level = masteryService.calculateMasteryLevel(0, 0);
      expect(level).toBe(1);
    });

    it('should increase level with consecutive correct', () => {
      const level = masteryService.calculateMasteryLevel(5, 10);
      expect(level).toBeGreaterThan(1);
    });

    it('should cap at level 5', () => {
      const level = masteryService.calculateMasteryLevel(100, 200);
      expect(level).toBeLessThanOrEqual(5);
    });
  });

  // ==================== Batch Operations Tests ====================

  describe('batch operations', () => {
    it('should get mastery for multiple words', async () => {
      const mockStates = [
        { wordId: 'word-1', masteryLevel: 3 },
        { wordId: 'word-2', masteryLevel: 5 }
      ];

      mockPrisma.wordLearningState.findMany.mockResolvedValue(mockStates);

      const result = await masteryService.getMasteryBatch(
        'user-1',
        ['word-1', 'word-2', 'word-3']
      );

      expect(result.size).toBe(2);
      expect(result.get('word-1')?.masteryLevel).toBe(3);
    });
  });
});
