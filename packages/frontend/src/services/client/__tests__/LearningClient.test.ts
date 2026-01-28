/**
 * LearningClient 单元测试
 * 测试学习记录和学习状态管理相关 API 客户端功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LearningClient } from '../learning/LearningClient';
import TokenManager from '../base/TokenManager';
import { WordState } from '../../../types/models';

describe('LearningClient', () => {
  let client: LearningClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Mock TokenManager
    vi.spyOn(TokenManager, 'getInstance').mockReturnValue({
      getToken: vi.fn().mockReturnValue('mock-token'),
      setToken: vi.fn(),
      clearToken: vi.fn(),
      hasValidToken: vi.fn().mockReturnValue(true),
    } as unknown as TokenManager);

    client = new LearningClient('http://localhost:3000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRecords', () => {
    it('should get records with pagination', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          wordId: 'word-1',
          timestamp: '2024-01-01T00:00:00Z',
          selectedAnswer: '苹果',
          correctAnswer: '苹果',
          isCorrect: true,
          responseTime: 2000,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockRecords,
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
      });

      const result = await client.getRecords({ page: 1, pageSize: 20 });

      expect(result.records).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
    });

    it('should convert timestamp string to number', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          wordId: 'word-1',
          timestamp: '2024-01-01T00:00:00Z',
          selectedAnswer: '苹果',
          correctAnswer: '苹果',
          isCorrect: true,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockRecords,
          }),
      });

      const result = await client.getRecords();

      expect(typeof result.records[0].timestamp).toBe('number');
    });
  });

  describe('createRecord', () => {
    it('should create a new record', async () => {
      const recordData = {
        userId: 'user-1',
        wordId: 'word-1',
        timestamp: Date.now(),
        selectedAnswer: '苹果',
        correctAnswer: '苹果',
        isCorrect: true,
        responseTime: 2000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: { id: 'record-1', ...recordData },
          }),
      });

      const result = await client.createRecord(recordData);

      expect(result.id).toBe('record-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/records',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('batchCreateRecords', () => {
    it('should batch create records', async () => {
      const records = [
        {
          userId: 'user-1',
          wordId: 'word-1',
          timestamp: Date.now(),
          selectedAnswer: '苹果',
          correctAnswer: '苹果',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          userId: 'user-1',
          wordId: 'word-2',
          timestamp: Date.now(),
          selectedAnswer: '香蕉',
          correctAnswer: '香蕉',
          isCorrect: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: records.map((r, i) => ({ id: `record-${i}`, ...r })),
          }),
      });

      const result = await client.batchCreateRecords(records);

      expect(result).toHaveLength(2);
    });
  });

  describe('getWordLearningState', () => {
    it('should get word learning state', async () => {
      const mockState = {
        id: 'state-1',
        userId: 'user-1',
        wordId: 'word-1',
        state: 'learning',
        masteryLevel: 2,
        easeFactor: 2.5,
        reviewCount: 3,
        lastReviewDate: '2024-01-01T00:00:00Z',
        nextReviewDate: '2024-01-02T00:00:00Z',
        currentInterval: 1,
        consecutiveCorrect: 2,
        consecutiveWrong: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockState,
          }),
      });

      const result = await client.getWordLearningState('word-1');

      expect(result).not.toBeNull();
      expect(result?.wordId).toBe('word-1');
      expect(typeof result?.lastReviewDate).toBe('number');
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Not found',
            code: 'NOT_FOUND',
          }),
      });

      const result = await client.getWordLearningState('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getWordLearningStates', () => {
    it('should batch get word learning states', async () => {
      const mockStates = [
        {
          wordId: 'word-1',
          state: {
            id: 'state-1',
            userId: 'user-1',
            wordId: 'word-1',
            state: 'learning',
            masteryLevel: 2,
            easeFactor: 2.5,
            reviewCount: 3,
            lastReviewDate: null,
            nextReviewDate: null,
            currentInterval: 1,
            consecutiveCorrect: 2,
            consecutiveWrong: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockStates,
          }),
      });

      const result = await client.getWordLearningStates(['word-1']);

      expect(result).toHaveLength(1);
    });

    it('should return empty array for empty input', async () => {
      const result = await client.getWordLearningStates([]);

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('saveWordLearningState', () => {
    it('should save word learning state', async () => {
      const state = {
        id: 'state-1',
        userId: 'user-1',
        wordId: 'word-1',
        state: WordState.LEARNING,
        masteryLevel: 2,
        easeFactor: 2.5,
        reviewCount: 3,
        lastReviewDate: Date.now(),
        nextReviewDate: Date.now() + 86400000,
        currentInterval: 1,
        consecutiveCorrect: 2,
        consecutiveWrong: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: undefined,
          }),
      });

      await expect(client.saveWordLearningState(state)).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/word-states/word-1',
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });
  });

  describe('deleteWordLearningState', () => {
    it('should delete word learning state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-length': '0' }),
      });

      await expect(client.deleteWordLearningState('word-1')).resolves.toBeUndefined();
    });
  });

  describe('getDueWords', () => {
    it('should get due words', async () => {
      const mockDueWords = [
        {
          id: 'state-1',
          userId: 'user-1',
          wordId: 'word-1',
          state: 'learning',
          masteryLevel: 2,
          easeFactor: 2.5,
          reviewCount: 3,
          lastReviewDate: '2024-01-01T00:00:00Z',
          nextReviewDate: '2024-01-02T00:00:00Z',
          currentInterval: 1,
          consecutiveCorrect: 2,
          consecutiveWrong: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockDueWords,
          }),
      });

      const result = await client.getDueWords();

      expect(result).toHaveLength(1);
    });
  });

  describe('getWordsByState', () => {
    it('should get words by state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: [],
          }),
      });

      const result = await client.getWordsByState(WordState.MASTERED);

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/word-states/by-state/MASTERED'),
        expect.any(Object),
      );
    });
  });

  describe('getWordScore', () => {
    it('should get word score', async () => {
      const mockScore = {
        id: 'score-1',
        userId: 'user-1',
        wordId: 'word-1',
        totalScore: 85,
        accuracyScore: 90,
        speedScore: 80,
        stabilityScore: 85,
        proficiencyScore: 85,
        totalAttempts: 10,
        correctAttempts: 9,
        averageResponseTime: 2500,
        averageDwellTime: 1000,
        recentAccuracy: 0.9,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockScore,
          }),
      });

      const result = await client.getWordScore('word-1');

      expect(result).not.toBeNull();
      expect(result?.totalScore).toBe(85);
    });
  });

  describe('getWordScores', () => {
    it('should batch get word scores', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: [],
          }),
      });

      const result = await client.getWordScores(['word-1', 'word-2']);

      expect(result).toEqual([]);
    });
  });

  describe('getMasteryStudyWords', () => {
    it('should get mastery study words', async () => {
      const mockResponse = {
        words: [
          {
            id: 'word-1',
            spelling: 'apple',
            phonetic: '/ˈæp.əl/',
            meanings: ['苹果'],
            examples: ['I eat an apple.'],
            isNew: true,
          },
        ],
        meta: {
          mode: 'mastery',
          targetCount: 20,
          fetchCount: 1,
          masteryThreshold: 2,
          maxQuestions: 100,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: mockResponse,
          }),
      });

      const result = await client.getMasteryStudyWords(20);

      expect(result.words).toHaveLength(1);
      expect(result.meta.targetCount).toBe(20);
    });
  });

  describe('createMasterySession', () => {
    it('should create mastery session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: { sessionId: 'session-123' },
          }),
      });

      const result = await client.createMasterySession(20);

      expect(result.sessionId).toBe('session-123');
    });
  });

  describe('syncMasteryProgress', () => {
    it('should sync mastery progress', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            success: true,
            data: undefined,
          }),
      });

      await expect(
        client.syncMasteryProgress({
          sessionId: 'session-123',
          actualMasteryCount: 15,
          totalQuestions: 50,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
