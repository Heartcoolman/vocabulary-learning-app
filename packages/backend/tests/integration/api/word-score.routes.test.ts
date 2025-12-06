/**
 * Word Score Routes Integration Tests
 *
 * Tests for word score API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockWordScoreService } = vi.hoisted(() => ({
  mockWordScoreService: {
    getWordsByScoreRange: vi.fn(),
    getLowScoreWords: vi.fn(),
    getHighScoreWords: vi.fn(),
    getUserScoreStats: vi.fn(),
    getWordScore: vi.fn(),
    batchGetWordScores: vi.fn(),
    upsertWordScore: vi.fn()
  }
}));

vi.mock('../../../src/services/word-score.service', () => ({
  wordScoreService: mockWordScoreService
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
    next();
  }
}));

import app from '../../../src/app';

describe('Word Score API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/word-scores/range ====================

  describe('GET /api/word-scores/range', () => {
    it('should return words in score range', async () => {
      mockWordScoreService.getWordsByScoreRange.mockResolvedValue([
        { wordId: 'w-1', score: 45, lastReviewed: new Date() },
        { wordId: 'w-2', score: 55, lastReviewed: new Date() }
      ]);

      const res = await request(app)
        .get('/api/word-scores/range?minScore=40&maxScore=60')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should use default range when not specified', async () => {
      mockWordScoreService.getWordsByScoreRange.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/word-scores/range')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockWordScoreService.getWordsByScoreRange).toHaveBeenCalledWith(
        'test-user-id',
        0,
        100
      );
    });

    it('should return 400 for invalid range (minScore < 0)', async () => {
      const res = await request(app)
        .get('/api/word-scores/range?minScore=-10&maxScore=50')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid range (maxScore > 100)', async () => {
      const res = await request(app)
        .get('/api/word-scores/range?minScore=0&maxScore=150')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid range (minScore > maxScore)', async () => {
      const res = await request(app)
        .get('/api/word-scores/range?minScore=80&maxScore=20')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/word-scores/range');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/word-scores/low/list ====================

  describe('GET /api/word-scores/low/list', () => {
    it('should return low score words', async () => {
      mockWordScoreService.getLowScoreWords.mockResolvedValue([
        { wordId: 'w-1', score: 20 },
        { wordId: 'w-2', score: 30 }
      ]);

      const res = await request(app)
        .get('/api/word-scores/low/list')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should accept threshold parameter', async () => {
      mockWordScoreService.getLowScoreWords.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/word-scores/low/list?threshold=30')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockWordScoreService.getLowScoreWords).toHaveBeenCalledWith('test-user-id', 30);
    });

    it('should return 400 for threshold out of range', async () => {
      const res = await request(app)
        .get('/api/word-scores/low/list?threshold=150')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for negative threshold', async () => {
      const res = await request(app)
        .get('/api/word-scores/low/list?threshold=-10')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/word-scores/high/list ====================

  describe('GET /api/word-scores/high/list', () => {
    it('should return high score words', async () => {
      mockWordScoreService.getHighScoreWords.mockResolvedValue([
        { wordId: 'w-1', score: 90 },
        { wordId: 'w-2', score: 95 }
      ]);

      const res = await request(app)
        .get('/api/word-scores/high/list')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should accept threshold parameter', async () => {
      mockWordScoreService.getHighScoreWords.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/word-scores/high/list?threshold=90')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockWordScoreService.getHighScoreWords).toHaveBeenCalledWith('test-user-id', 90);
    });

    it('should return 400 for threshold out of range', async () => {
      const res = await request(app)
        .get('/api/word-scores/high/list?threshold=110')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/word-scores/stats/overview ====================

  describe('GET /api/word-scores/stats/overview', () => {
    it('should return score statistics', async () => {
      mockWordScoreService.getUserScoreStats.mockResolvedValue({
        totalWords: 100,
        averageScore: 65.5,
        lowScoreCount: 20,
        mediumScoreCount: 50,
        highScoreCount: 30
      });

      const res = await request(app)
        .get('/api/word-scores/stats/overview')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalWords).toBe(100);
      expect(res.body.data.averageScore).toBe(65.5);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/word-scores/stats/overview');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/word-scores/:wordId ====================

  describe('GET /api/word-scores/:wordId', () => {
    it('should return word score', async () => {
      mockWordScoreService.getWordScore.mockResolvedValue({
        wordId: 'word-123',
        score: 75,
        reviewCount: 10,
        lastReviewed: new Date()
      });

      const res = await request(app)
        .get('/api/word-scores/word-123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(75);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/word-scores/word-123');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/word-scores/batch ====================

  describe('POST /api/word-scores/batch', () => {
    it('should return batch word scores', async () => {
      const scoresMap = new Map([
        ['w-1', { wordId: 'w-1', score: 70 }],
        ['w-2', { wordId: 'w-2', score: 80 }]
      ]);

      mockWordScoreService.batchGetWordScores.mockResolvedValue(scoresMap);

      const res = await request(app)
        .post('/api/word-scores/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['w-1', 'w-2'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 400 for non-array wordIds', async () => {
      const res = await request(app)
        .post('/api/word-scores/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for too many wordIds', async () => {
      const tooManyIds = Array(501).fill('word-id');

      const res = await request(app)
        .post('/api/word-scores/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: tooManyIds });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid wordId elements', async () => {
      const res = await request(app)
        .post('/api/word-scores/batch')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordIds: ['valid', '', 'another'] });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/word-scores/batch')
        .send({ wordIds: ['w-1'] });

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/word-scores/:wordId ====================

  describe('PUT /api/word-scores/:wordId', () => {
    // Schema requires: wordId (uuid), isCorrect (boolean), responseTime (optional), dwellTime (optional)
    const validWordId = '123e4567-e89b-12d3-a456-426614174000';

    it('should update word score', async () => {
      mockWordScoreService.upsertWordScore.mockResolvedValue({
        wordId: validWordId,
        score: 85,
        reviewCount: 11,
        updatedAt: new Date()
      });

      const res = await request(app)
        .put(`/api/word-scores/${validWordId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ wordId: validWordId, isCorrect: true, responseTime: 1500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(85);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put(`/api/word-scores/${validWordId}`)
        .send({ wordId: validWordId, isCorrect: true });

      expect(res.status).toBe(401);
    });
  });
});
