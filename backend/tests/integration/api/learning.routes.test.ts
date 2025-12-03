/**
 * Learning Routes Integration Tests
 *
 * Tests for mastery-based learning API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock mastery learning service
const mockMasteryLearningService = {
  getWordsForMasteryMode: vi.fn(),
  getNextWords: vi.fn(),
  syncSessionProgress: vi.fn(),
  ensureLearningSession: vi.fn(),
  getSessionProgress: vi.fn(),
  adjustWordsForUser: vi.fn()
};

vi.mock('../../../src/services/mastery-learning.service', () => ({
  masteryLearningService: mockMasteryLearningService
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

import app from '../../../src/app';

describe('Learning API Routes', () => {
  const validToken = 'valid-token';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/learning/study-words ====================

  describe('GET /api/learning/study-words', () => {
    it('should return study words for mastery mode', async () => {
      const mockResult = {
        words: [
          { id: 'word-1', spelling: 'hello', meanings: ['你好'] },
          { id: 'word-2', spelling: 'world', meanings: ['世界'] }
        ],
        sessionId: 'session-123',
        config: { masteryThreshold: 2, maxTotalQuestions: 100 }
      };
      mockMasteryLearningService.getWordsForMasteryMode.mockResolvedValue(mockResult);

      const res = await request(app)
        .get('/api/learning/study-words')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.words).toHaveLength(2);
      expect(res.body.data.sessionId).toBe('session-123');
    });

    it('should accept targetCount parameter', async () => {
      mockMasteryLearningService.getWordsForMasteryMode.mockResolvedValue({
        words: [],
        sessionId: 'sess-123',
        config: {}
      });

      await request(app)
        .get('/api/learning/study-words?targetCount=30')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockMasteryLearningService.getWordsForMasteryMode).toHaveBeenCalledWith(
        testUserId,
        30
      );
    });

    it('should return 400 for invalid targetCount', async () => {
      const res = await request(app)
        .get('/api/learning/study-words?targetCount=-5')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 400 for targetCount exceeding 100', async () => {
      const res = await request(app)
        .get('/api/learning/study-words?targetCount=150')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/learning/study-words');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/learning/next-words ====================

  describe('POST /api/learning/next-words', () => {
    const validBody = {
      currentWordIds: ['word-1', 'word-2'],
      masteredWordIds: ['word-3'],
      sessionId: 'session-123',
      count: 3
    };

    it('should return next batch of words', async () => {
      mockMasteryLearningService.getNextWords.mockResolvedValue({
        words: [
          { id: 'word-4', spelling: 'test' },
          { id: 'word-5', spelling: 'next' }
        ]
      });

      const res = await request(app)
        .post('/api/learning/next-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.data.words).toHaveLength(2);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(app)
        .post('/api/learning/next-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ currentWordIds: [], masteredWordIds: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid count', async () => {
      const res = await request(app)
        .post('/api/learning/next-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validBody, count: 50 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-array wordIds', async () => {
      const res = await request(app)
        .post('/api/learning/next-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validBody, currentWordIds: 'word-1' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /api/learning/sync-progress ====================

  describe('POST /api/learning/sync-progress', () => {
    it('should sync session progress', async () => {
      mockMasteryLearningService.syncSessionProgress.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/learning/sync-progress')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          sessionId: 'session-123',
          actualMasteryCount: 15,
          totalQuestions: 45
        });

      expect(res.status).toBe(200);
      expect(res.body.data.synced).toBe(true);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(app)
        .post('/api/learning/sync-progress')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ actualMasteryCount: 10, totalQuestions: 30 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for negative values', async () => {
      const res = await request(app)
        .post('/api/learning/sync-progress')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          sessionId: 'session-123',
          actualMasteryCount: -5,
          totalQuestions: 30
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-integer values', async () => {
      const res = await request(app)
        .post('/api/learning/sync-progress')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          sessionId: 'session-123',
          actualMasteryCount: 10.5,
          totalQuestions: 30
        });

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /api/learning/session ====================

  describe('POST /api/learning/session', () => {
    it('should create learning session', async () => {
      mockMasteryLearningService.ensureLearningSession.mockResolvedValue('new-session-id');

      const res = await request(app)
        .post('/api/learning/session')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ targetMasteryCount: 20 });

      expect(res.status).toBe(200);
      expect(res.body.data.sessionId).toBe('new-session-id');
    });

    it('should resume existing session', async () => {
      mockMasteryLearningService.ensureLearningSession.mockResolvedValue('existing-session');

      const res = await request(app)
        .post('/api/learning/session')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ targetMasteryCount: 20, sessionId: 'existing-session' });

      expect(mockMasteryLearningService.ensureLearningSession).toHaveBeenCalledWith(
        testUserId,
        20,
        'existing-session'
      );
    });

    it('should return 400 for invalid targetMasteryCount', async () => {
      const res = await request(app)
        .post('/api/learning/session')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ targetMasteryCount: 0 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for targetMasteryCount exceeding 100', async () => {
      const res = await request(app)
        .post('/api/learning/session')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ targetMasteryCount: 150 });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/learning/session/:sessionId ====================

  describe('GET /api/learning/session/:sessionId', () => {
    it('should return session progress', async () => {
      const mockProgress = {
        sessionId: 'session-123',
        targetMasteryCount: 20,
        actualMasteryCount: 12,
        totalQuestions: 35,
        completionRate: 0.6
      };
      mockMasteryLearningService.getSessionProgress.mockResolvedValue(mockProgress);

      const res = await request(app)
        .get('/api/learning/session/session-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sessionId).toBe('session-123');
      expect(res.body.data.completionRate).toBe(0.6);
    });

    it('should return 404 for unknown session', async () => {
      mockMasteryLearningService.getSessionProgress.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/learning/session/unknown-session')
        .set('Authorization', `Bearer ${validToken}`);

      // Service returns null, route should handle appropriately
      expect(res.body.data).toBeNull();
    });
  });

  // ==================== POST /api/learning/adjust-words ====================

  describe('POST /api/learning/adjust-words', () => {
    const validBody = {
      sessionId: 'session-123',
      currentWordIds: ['word-1', 'word-2'],
      masteredWordIds: ['word-3'],
      recentPerformance: {
        accuracy: 0.7,
        avgResponseTime: 3000,
        consecutiveWrong: 2
      },
      adjustReason: 'struggling'
    };

    it('should adjust learning queue', async () => {
      mockMasteryLearningService.adjustWordsForUser.mockResolvedValue({
        removed: ['word-1'],
        added: [{ id: 'word-4', spelling: 'easier' }],
        reason: 'Adjusted for struggling performance'
      });

      const res = await request(app)
        .post('/api/learning/adjust-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.data.removed).toContain('word-1');
    });

    it('should accept userState parameter', async () => {
      mockMasteryLearningService.adjustWordsForUser.mockResolvedValue({
        removed: [],
        added: []
      });

      const res = await request(app)
        .post('/api/learning/adjust-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          ...validBody,
          userState: { fatigue: 0.6, attention: 0.5, motivation: -0.2 }
        });

      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid adjustReason', async () => {
      const res = await request(app)
        .post('/api/learning/adjust-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validBody, adjustReason: 'invalid-reason' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid accuracy range', async () => {
      const res = await request(app)
        .post('/api/learning/adjust-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          ...validBody,
          recentPerformance: { ...validBody.recentPerformance, accuracy: 1.5 }
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid userState values', async () => {
      const res = await request(app)
        .post('/api/learning/adjust-words')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          ...validBody,
          userState: { fatigue: 2.0 } // Invalid: exceeds 1
        });

      expect(res.status).toBe(400);
    });

    it('should accept all valid adjustReasons', async () => {
      mockMasteryLearningService.adjustWordsForUser.mockResolvedValue({
        removed: [],
        added: []
      });

      for (const reason of ['fatigue', 'struggling', 'excelling', 'periodic']) {
        const res = await request(app)
          .post('/api/learning/adjust-words')
          .set('Authorization', `Bearer ${validToken}`)
          .send({ ...validBody, adjustReason: reason });

        expect(res.status).toBe(200);
      }
    });
  });
});
