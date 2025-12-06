/**
 * Word Mastery Routes Integration Tests
 *
 * Tests for word mastery evaluation API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockWordMasteryService } = vi.hoisted(() => ({
  mockWordMasteryService: {
    evaluateWord: vi.fn(),
    batchEvaluateWords: vi.fn(),
    getMemoryTrace: vi.fn(),
    getUserMasteryStats: vi.fn(),
    predictInterval: vi.fn()
  }
}));

vi.mock('../../../src/services/word-mastery.service', () => ({
  wordMasteryService: mockWordMasteryService
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
    }
    // optionalAuthMiddleware always calls next, even without auth
    next();
  }
}));

import app from '../../../src/app';

describe('Word Mastery API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/word-mastery/stats ====================

  describe('GET /api/word-mastery/stats', () => {
    it('should return user mastery stats', async () => {
      mockWordMasteryService.getUserMasteryStats.mockResolvedValue({
        totalWords: 500,
        masteredWords: 150,
        learningWords: 200,
        newWords: 150,
        averageMastery: 0.65,
        averageRetention: 0.82
      });

      const res = await request(app)
        .get('/api/word-mastery/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalWords).toBe(500);
      expect(res.body.data.masteredWords).toBe(150);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/word-mastery/stats');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/word-mastery/batch ====================

  describe('POST /api/word-mastery/batch', () => {
    it('should batch evaluate multiple words', async () => {
      mockWordMasteryService.batchEvaluateWords.mockResolvedValue([
        { wordId: 'word-1', mastery: 0.8, retention: 0.9 },
        { wordId: 'word-2', mastery: 0.5, retention: 0.7 },
        { wordId: 'word-3', mastery: 0.3, retention: 0.5 }
      ]);

      const res = await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['word-1', 'word-2', 'word-3'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(mockWordMasteryService.batchEvaluateWords).toHaveBeenCalledWith(
        'test-user-id',
        ['word-1', 'word-2', 'word-3'],
        undefined
      );
    });

    it('should accept userFatigue parameter', async () => {
      mockWordMasteryService.batchEvaluateWords.mockResolvedValue([]);

      await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['word-1'], userFatigue: 0.6 });

      expect(mockWordMasteryService.batchEvaluateWords).toHaveBeenCalledWith(
        'test-user-id',
        ['word-1'],
        0.6
      );
    });

    it('should return 400 for empty wordIds array', async () => {
      const res = await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('非空数组');
    });

    it('should return 400 for non-array wordIds', async () => {
      const res = await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when wordIds exceeds max size', async () => {
      const tooManyIds = Array.from({ length: 101 }, (_, i) => `word-${i}`);

      const res = await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: tooManyIds });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('不能超过');
    });

    it('should return 400 for invalid userFatigue', async () => {
      const res = await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['word-1'], userFatigue: 1.5 });

      expect(res.status).toBe(400);
      // Zod validation error for number > 1 (max is 1)
      expect(res.body.success).toBe(false);
    });

    it('should deduplicate wordIds', async () => {
      mockWordMasteryService.batchEvaluateWords.mockResolvedValue([]);

      await request(app)
        .post('/api/word-mastery/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['word-1', 'word-1', 'word-2'] });

      expect(mockWordMasteryService.batchEvaluateWords).toHaveBeenCalledWith(
        'test-user-id',
        ['word-1', 'word-2'],
        undefined
      );
    });
  });

  // ==================== GET /api/word-mastery/:wordId ====================

  describe('GET /api/word-mastery/:wordId', () => {
    it('should return word evaluation', async () => {
      mockWordMasteryService.evaluateWord.mockResolvedValue({
        wordId: 'word-123',
        mastery: 0.75,
        retention: 0.85,
        stability: 0.8,
        difficulty: 0.4,
        lastReviewedAt: new Date().toISOString(),
        nextReviewAt: new Date().toISOString()
      });

      const res = await request(app)
        .get('/api/word-mastery/word-123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wordId).toBe('word-123');
      expect(res.body.data.mastery).toBe(0.75);
    });

    it('should accept userFatigue query parameter', async () => {
      mockWordMasteryService.evaluateWord.mockResolvedValue({ wordId: 'word-1' });

      await request(app)
        .get('/api/word-mastery/word-1?userFatigue=0.3')
        .set('Authorization', 'Bearer valid-token');

      expect(mockWordMasteryService.evaluateWord).toHaveBeenCalledWith(
        'test-user-id',
        'word-1',
        0.3
      );
    });

    it('should return 400 for invalid userFatigue query parameter', async () => {
      mockWordMasteryService.evaluateWord.mockResolvedValue({ wordId: 'word-1' });

      const res = await request(app)
        .get('/api/word-mastery/word-1?userFatigue=invalid')
        .set('Authorization', 'Bearer valid-token');

      // z.coerce.number() fails for non-numeric strings
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/word-mastery/word-123');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/word-mastery/:wordId/trace ====================

  describe('GET /api/word-mastery/:wordId/trace', () => {
    it('should return memory trace', async () => {
      mockWordMasteryService.getMemoryTrace.mockResolvedValue([
        { timestamp: new Date().toISOString(), mastery: 0.5, correct: true },
        { timestamp: new Date().toISOString(), mastery: 0.6, correct: true },
        { timestamp: new Date().toISOString(), mastery: 0.7, correct: false }
      ]);

      const res = await request(app)
        .get('/api/word-mastery/word-123/trace')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wordId).toBe('word-123');
      expect(res.body.data.trace).toHaveLength(3);
      expect(res.body.data.count).toBe(3);
    });

    it('should respect limit parameter', async () => {
      mockWordMasteryService.getMemoryTrace.mockResolvedValue([]);

      await request(app)
        .get('/api/word-mastery/word-123/trace?limit=10')
        .set('Authorization', 'Bearer valid-token');

      expect(mockWordMasteryService.getMemoryTrace).toHaveBeenCalledWith(
        'test-user-id',
        'word-123',
        10
      );
    });

    it('should use default limit when not specified', async () => {
      mockWordMasteryService.getMemoryTrace.mockResolvedValue([]);

      await request(app)
        .get('/api/word-mastery/word-123/trace')
        .set('Authorization', 'Bearer valid-token');

      expect(mockWordMasteryService.getMemoryTrace).toHaveBeenCalledWith(
        'test-user-id',
        'word-123',
        50
      );
    });

    it('should return 400 when limit exceeds 100', async () => {
      mockWordMasteryService.getMemoryTrace.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/word-mastery/word-123/trace?limit=200')
        .set('Authorization', 'Bearer valid-token');

      // Zod validation rejects values > 100
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==================== GET /api/word-mastery/:wordId/interval ====================

  describe('GET /api/word-mastery/:wordId/interval', () => {
    it('should return predicted interval', async () => {
      mockWordMasteryService.predictInterval.mockResolvedValue({
        optimalSeconds: 86400,
        minSeconds: 43200,
        maxSeconds: 172800,
        confidence: 0.85
      });

      const res = await request(app)
        .get('/api/word-mastery/word-123/interval')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.wordId).toBe('word-123');
      expect(res.body.data.interval.optimalSeconds).toBe(86400);
      expect(res.body.data.humanReadable.optimal).toBe('1 天');
    });

    it('should accept targetRecall parameter', async () => {
      mockWordMasteryService.predictInterval.mockResolvedValue({
        optimalSeconds: 3600,
        minSeconds: 1800,
        maxSeconds: 7200
      });

      await request(app)
        .get('/api/word-mastery/word-123/interval?targetRecall=0.95')
        .set('Authorization', 'Bearer valid-token');

      expect(mockWordMasteryService.predictInterval).toHaveBeenCalledWith(
        'test-user-id',
        'word-123',
        0.95
      );
    });

    it('should use default targetRecall of 0.9', async () => {
      mockWordMasteryService.predictInterval.mockResolvedValue({
        optimalSeconds: 3600,
        minSeconds: 1800,
        maxSeconds: 7200
      });

      await request(app)
        .get('/api/word-mastery/word-123/interval')
        .set('Authorization', 'Bearer valid-token');

      expect(mockWordMasteryService.predictInterval).toHaveBeenCalledWith(
        'test-user-id',
        'word-123',
        0.9
      );
    });

    it('should format interval in minutes', async () => {
      mockWordMasteryService.predictInterval.mockResolvedValue({
        optimalSeconds: 1800,
        minSeconds: 900,
        maxSeconds: 3600
      });

      const res = await request(app)
        .get('/api/word-mastery/word-123/interval')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.humanReadable.optimal).toBe('30 分钟');
    });

    it('should format interval in hours', async () => {
      mockWordMasteryService.predictInterval.mockResolvedValue({
        optimalSeconds: 7200,
        minSeconds: 3600,
        maxSeconds: 14400
      });

      const res = await request(app)
        .get('/api/word-mastery/word-123/interval')
        .set('Authorization', 'Bearer valid-token');

      expect(res.body.data.humanReadable.optimal).toBe('2 小时');
    });
  });
});
