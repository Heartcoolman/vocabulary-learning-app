/**
 * Word State Routes Integration Tests
 *
 * Tests for word learning state API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock word state service
const mockWordStateService = {
  getWordState: vi.fn(),
  batchGetWordStates: vi.fn(),
  upsertWordState: vi.fn(),
  deleteWordState: vi.fn(),
  getDueWords: vi.fn(),
  getWordsByState: vi.fn(),
  getUserStats: vi.fn()
};

vi.mock('../../../src/services/word-state.service', () => ({
  wordStateService: mockWordStateService
}));

// Mock auth middleware
vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}));

// Mock validator
vi.mock('../../../src/validators/word-state.validator', () => ({
  validateWordStateUpdate: (_req: any, _res: any, next: any) => next()
}));

import app from '../../../src/app';

describe('Word State API Routes', () => {
  const validToken = 'valid-token';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/word-states/:wordId ====================

  describe('GET /api/word-states/:wordId', () => {
    it('should return word learning state', async () => {
      const mockState = {
        wordId: 'word-123',
        state: 'LEARNING',
        masteryLevel: 3,
        nextReviewDate: new Date().toISOString()
      };
      mockWordStateService.getWordState.mockResolvedValue(mockState);

      const res = await request(app)
        .get('/api/word-states/word-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.wordId).toBe('word-123');
      expect(res.body.data.state).toBe('LEARNING');
    });

    it('should return null for untracked word', async () => {
      mockWordStateService.getWordState.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/word-states/unknown-word')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/word-states/word-123');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/word-states/batch ====================

  describe('POST /api/word-states/batch', () => {
    it('should return batch word states', async () => {
      const statesMap = new Map([
        ['word-1', { state: 'LEARNING', masteryLevel: 2 }],
        ['word-2', { state: 'MASTERED', masteryLevel: 5 }]
      ]);
      mockWordStateService.batchGetWordStates.mockResolvedValue(statesMap);

      const res = await request(app)
        .post('/api/word-states/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordIds: ['word-1', 'word-2'] });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 400 for empty wordIds', async () => {
      const res = await request(app)
        .post('/api/word-states/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordIds: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-array wordIds', async () => {
      const res = await request(app)
        .post('/api/word-states/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordIds: 'word-1' });

      expect(res.status).toBe(400);
    });

    it('should reject batch larger than 500', async () => {
      const wordIds = Array.from({ length: 501 }, (_, i) => `word-${i}`);

      const res = await request(app)
        .post('/api/word-states/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordIds });

      expect(res.status).toBe(400);
    });

    it('should handle missing states gracefully', async () => {
      const statesMap = new Map([
        ['word-1', { state: 'LEARNING' }]
      ]);
      mockWordStateService.batchGetWordStates.mockResolvedValue(statesMap);

      const res = await request(app)
        .post('/api/word-states/batch')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordIds: ['word-1', 'word-2'] });

      const word2Data = res.body.data.find((d: any) => d.wordId === 'word-2');
      expect(word2Data.state).toBeNull();
    });
  });

  // ==================== PUT /api/word-states/:wordId ====================

  describe('PUT /api/word-states/:wordId', () => {
    it('should update word state', async () => {
      const updatedState = {
        wordId: 'word-123',
        state: 'REVIEWING',
        masteryLevel: 4
      };
      mockWordStateService.upsertWordState.mockResolvedValue(updatedState);

      const res = await request(app)
        .put('/api/word-states/word-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ state: 'review', masteryLevel: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('REVIEWING');
    });

    it('should create state for new word', async () => {
      const newState = {
        wordId: 'new-word',
        state: 'NEW',
        masteryLevel: 1
      };
      mockWordStateService.upsertWordState.mockResolvedValue(newState);

      const res = await request(app)
        .put('/api/word-states/new-word')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ state: 'new' });

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('NEW');
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .put('/api/word-states/word-123')
        .send({ state: 'learning' });

      expect(res.status).toBe(401);
    });
  });

  // ==================== DELETE /api/word-states/:wordId ====================

  describe('DELETE /api/word-states/:wordId', () => {
    it('should delete word state', async () => {
      mockWordStateService.deleteWordState.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/word-states/word-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockWordStateService.deleteWordState).toHaveBeenCalledWith(
        testUserId,
        'word-123'
      );
    });

    it('should return 401 without token', async () => {
      const res = await request(app).delete('/api/word-states/word-123');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/word-states/due/list ====================

  describe('GET /api/word-states/due/list', () => {
    it('should return words due for review', async () => {
      const dueWords = [
        { wordId: 'word-1', nextReviewDate: new Date() },
        { wordId: 'word-2', nextReviewDate: new Date() }
      ];
      mockWordStateService.getDueWords.mockResolvedValue(dueWords);

      const res = await request(app)
        .get('/api/word-states/due/list')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty array when no due words', async () => {
      mockWordStateService.getDueWords.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/word-states/due/list')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data).toEqual([]);
    });
  });

  // ==================== GET /api/word-states/by-state/:state ====================

  describe('GET /api/word-states/by-state/:state', () => {
    it('should return words by state', async () => {
      const masteredWords = [
        { wordId: 'word-1', state: 'MASTERED' },
        { wordId: 'word-2', state: 'MASTERED' }
      ];
      mockWordStateService.getWordsByState.mockResolvedValue(masteredWords);

      const res = await request(app)
        .get('/api/word-states/by-state/mastered')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 400 for invalid state', async () => {
      const res = await request(app)
        .get('/api/word-states/by-state/invalid')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });

    it('should accept valid states: new, learning, review, mastered', async () => {
      mockWordStateService.getWordsByState.mockResolvedValue([]);

      for (const state of ['new', 'learning', 'review', 'mastered']) {
        const res = await request(app)
          .get(`/api/word-states/by-state/${state}`)
          .set('Authorization', `Bearer ${validToken}`);

        expect(res.status).toBe(200);
      }
    });
  });

  // ==================== GET /api/word-states/stats/overview ====================

  describe('GET /api/word-states/stats/overview', () => {
    it('should return user learning statistics', async () => {
      const stats = {
        totalWords: 500,
        newWords: 100,
        learningWords: 150,
        reviewingWords: 150,
        masteredWords: 100,
        dueToday: 25
      };
      mockWordStateService.getUserStats.mockResolvedValue(stats);

      const res = await request(app)
        .get('/api/word-states/stats/overview')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalWords).toBe(500);
      expect(res.body.data.masteredWords).toBe(100);
    });

    it('should handle new user with no stats', async () => {
      mockWordStateService.getUserStats.mockResolvedValue({
        totalWords: 0,
        newWords: 0,
        learningWords: 0,
        reviewingWords: 0,
        masteredWords: 0,
        dueToday: 0
      });

      const res = await request(app)
        .get('/api/word-states/stats/overview')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data.totalWords).toBe(0);
    });
  });
});
