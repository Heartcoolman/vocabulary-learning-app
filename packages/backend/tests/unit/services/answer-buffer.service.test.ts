/**
 * Answer Buffer Service Unit Tests
 * Tests for the AnswerBufferService with Redis buffer and batch database writes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Redis client
const mockRedisClient = {
  rpush: vi.fn(),
  llen: vi.fn(),
  lpop: vi.fn(),
};

vi.mock('../../../src/config/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

// Mock logger
vi.mock('../../../src/logger', () => ({
  serviceLogger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('AnswerBufferService', () => {
  let answerBufferService: any;
  let AnswerBufferService: any;
  let getAnswerBufferService: any;
  let resetAnswerBufferService: any;
  let mockPrisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset Redis mock defaults
    mockRedisClient.rpush.mockResolvedValue(1);
    mockRedisClient.llen.mockResolvedValue(1);
    mockRedisClient.lpop.mockResolvedValue(null);

    // Create mock Prisma client
    mockPrisma = {
      answerRecord: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    // Reset module for clean state
    vi.resetModules();
    const module = await import('../../../src/services/answer-buffer.service');
    AnswerBufferService = module.AnswerBufferService;
    getAnswerBufferService = module.getAnswerBufferService;
    resetAnswerBufferService = module.resetAnswerBufferService;

    // Reset singleton before each test
    resetAnswerBufferService();
    answerBufferService = new AnswerBufferService(mockPrisma);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('buffer', () => {
    const mockAnswer = {
      id: 'answer-1',
      userId: 'user-1',
      wordId: 'word-1',
      sessionId: 'session-1',
      isCorrect: true,
      responseTime: 1500,
      selectedAnswer: 'A',
      correctAnswer: 'A',
      timestamp: new Date('2024-01-01T00:00:00Z'),
    };

    it('should buffer answer to Redis', async () => {
      mockRedisClient.llen.mockResolvedValue(1);

      const result = await answerBufferService.buffer(mockAnswer);

      expect(result).toBe('answer-1');
      expect(mockRedisClient.rpush).toHaveBeenCalledWith(
        'answer_buffer',
        JSON.stringify(mockAnswer)
      );
    });

    it('should trigger flush when buffer reaches threshold', async () => {
      mockRedisClient.llen.mockResolvedValue(100);
      mockRedisClient.lpop.mockResolvedValue(null);

      await answerBufferService.buffer(mockAnswer);

      // Flush is triggered asynchronously
      await vi.runAllTimersAsync();
      expect(mockRedisClient.lpop).toHaveBeenCalled();
    });

    it('should fallback to direct write when Redis fails', async () => {
      mockRedisClient.rpush.mockRejectedValue(new Error('Redis connection failed'));

      const result = await answerBufferService.buffer(mockAnswer);

      expect(result).toBe('answer-1');
      expect(mockPrisma.answerRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'answer-1',
          userId: 'user-1',
          wordId: 'word-1',
        }),
      });
    });
  });

  describe('flush', () => {
    it('should do nothing when buffer is empty', async () => {
      mockRedisClient.lpop.mockResolvedValue(null);

      const count = await answerBufferService.flush();

      expect(count).toBe(0);
      expect(mockPrisma.answerRecord.createMany).not.toHaveBeenCalled();
    });

    it('should batch write buffered answers to database', async () => {
      const answers = [
        {
          id: 'answer-1',
          userId: 'user-1',
          wordId: 'word-1',
          sessionId: 'session-1',
          isCorrect: true,
          responseTime: 1500,
          selectedAnswer: 'A',
          correctAnswer: 'A',
          timestamp: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'answer-2',
          userId: 'user-1',
          wordId: 'word-2',
          sessionId: 'session-1',
          isCorrect: false,
          responseTime: 2000,
          selectedAnswer: 'B',
          correctAnswer: 'C',
          timestamp: new Date('2024-01-01T00:00:01Z'),
        },
      ];

      let callCount = 0;
      mockRedisClient.lpop.mockImplementation(async () => {
        if (callCount < answers.length) {
          return JSON.stringify(answers[callCount++]);
        }
        return null;
      });

      mockPrisma.answerRecord.createMany.mockResolvedValue({ count: 2 });

      const count = await answerBufferService.flush();

      expect(count).toBe(2);
      expect(mockPrisma.answerRecord.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'answer-1' }),
          expect.objectContaining({ id: 'answer-2' }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should not process if already processing', async () => {
      // Create a slow lpop to simulate processing
      let resolvePromise: () => void;
      const slowPromise = new Promise<null>(resolve => {
        resolvePromise = () => resolve(null);
      });
      mockRedisClient.lpop.mockReturnValueOnce(slowPromise);

      // Start first flush (will be in processing state)
      const firstFlush = answerBufferService.flush();

      // Try second flush while first is processing
      const secondFlushResult = await answerBufferService.flush();

      expect(secondFlushResult).toBe(0);

      // Complete first flush
      resolvePromise!();
      await firstFlush;
    });

    it('should limit items per flush to threshold', async () => {
      const answers = Array.from({ length: 150 }, (_, i) => ({
        id: `answer-${i}`,
        userId: 'user-1',
        wordId: `word-${i}`,
        sessionId: 'session-1',
        isCorrect: true,
        responseTime: 1500,
        selectedAnswer: 'A',
        correctAnswer: 'A',
        timestamp: new Date(),
      }));

      let callCount = 0;
      mockRedisClient.lpop.mockImplementation(async () => {
        if (callCount < answers.length) {
          return JSON.stringify(answers[callCount++]);
        }
        return null;
      });

      const count = await answerBufferService.flush();

      // Should only process up to FLUSH_THRESHOLD (100)
      expect(count).toBe(100);
    });
  });

  describe('startPeriodicFlush', () => {
    it('should start periodic flush timer', async () => {
      mockRedisClient.lpop.mockResolvedValue(null);

      answerBufferService.startPeriodicFlush();

      // Advance timer by flush interval
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockRedisClient.lpop).toHaveBeenCalled();

      answerBufferService.stopPeriodicFlush();
    });

    it('should not start multiple timers', () => {
      answerBufferService.startPeriodicFlush();
      answerBufferService.startPeriodicFlush();

      // Should still work without errors
      answerBufferService.stopPeriodicFlush();
    });
  });

  describe('stopPeriodicFlush', () => {
    it('should stop periodic flush timer', async () => {
      mockRedisClient.lpop.mockResolvedValue(null);

      answerBufferService.startPeriodicFlush();
      answerBufferService.stopPeriodicFlush();

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(10000);

      expect(mockRedisClient.lpop).not.toHaveBeenCalled();
    });

    it('should handle stop without start', () => {
      // Should not throw
      answerBufferService.stopPeriodicFlush();
    });
  });

  describe('gracefulShutdown', () => {
    it('should stop timer and flush all remaining data', async () => {
      const answers = [
        {
          id: 'answer-1',
          userId: 'user-1',
          wordId: 'word-1',
          sessionId: 'session-1',
          isCorrect: true,
          responseTime: 1500,
          selectedAnswer: 'A',
          correctAnswer: 'A',
          timestamp: new Date(),
        },
      ];

      let callCount = 0;
      mockRedisClient.lpop.mockImplementation(async () => {
        if (callCount < answers.length) {
          return JSON.stringify(answers[callCount++]);
        }
        return null;
      });

      answerBufferService.startPeriodicFlush();

      await answerBufferService.gracefulShutdown();

      expect(mockPrisma.answerRecord.createMany).toHaveBeenCalled();
    });
  });

  describe('getBufferLength', () => {
    it('should return buffer length', async () => {
      mockRedisClient.llen.mockResolvedValue(42);

      const length = await answerBufferService.getBufferLength();

      expect(length).toBe(42);
      expect(mockRedisClient.llen).toHaveBeenCalledWith('answer_buffer');
    });

    it('should return 0 on error', async () => {
      mockRedisClient.llen.mockRejectedValue(new Error('Redis error'));

      const length = await answerBufferService.getBufferLength();

      expect(length).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      resetAnswerBufferService();
      const instance1 = getAnswerBufferService(mockPrisma);
      const instance2 = getAnswerBufferService(mockPrisma);

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getAnswerBufferService(mockPrisma);
      resetAnswerBufferService();
      const instance2 = getAnswerBufferService(mockPrisma);

      expect(instance1).not.toBe(instance2);
    });
  });
});
