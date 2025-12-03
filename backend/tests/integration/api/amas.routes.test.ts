/**
 * AMAS Routes Integration Tests
 *
 * Tests for AMAS API endpoints with full implementation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock dependencies before importing app
const mockAmasService = {
  processLearningEvent: vi.fn(),
  getEngineState: vi.fn(),
  resetUserState: vi.fn(),
  getColdStartPhase: vi.fn(),
  batchProcessEvents: vi.fn()
};

const mockDelayedRewardService = {
  getPendingRewards: vi.fn()
};

vi.mock('../../../src/services/amas.service', () => ({
  default: mockAmasService,
  amasService: mockAmasService
}));

vi.mock('../../../src/services/delayed-reward.service', () => ({
  default: mockDelayedRewardService,
  delayedRewardService: mockDelayedRewardService
}));

// Mock auth middleware to inject test user
vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return _res.status(401).json({ error: 'Unauthorized' });
    }
  }
}));

import app from '../../../src/app';

describe('AMAS API Routes', () => {
  const validToken = 'valid-token';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/amas/process ====================

  describe('POST /api/amas/process', () => {
    const validEvent = {
      wordId: 'word-123',
      isCorrect: true,
      responseTimeMs: 2500,
      sessionId: 'session-123'
    };

    it('should process learning event with valid token', async () => {
      const mockResult = {
        strategy: { interval_scale: 1.2, difficulty: 'mid' },
        state: { fatigue: 0.3, attention: 0.8 },
        trace: { confidence: 0.85, anomaly: false }
      };
      mockAmasService.processLearningEvent.mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEvent);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockResult);
      expect(mockAmasService.processLearningEvent).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining(validEvent)
      );
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/amas/process')
        .send(validEvent);

      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', 'Bearer invalid-token')
        .send(validEvent);

      expect(res.status).toBe(401);
    });

    it('should return strategy and state', async () => {
      const mockResult = {
        strategy: {
          interval_scale: 1.5,
          difficulty: 'easy',
          recommended_delay: 3600
        },
        state: {
          fatigue: 0.2,
          attention: 0.9,
          motivation: 0.7
        },
        trace: {
          confidence: 0.9,
          learner_contributions: { linucb: 0.4, thompson: 0.3, heuristic: 0.3 }
        }
      };
      mockAmasService.processLearningEvent.mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEvent);

      expect(res.body.data.strategy).toBeDefined();
      expect(res.body.data.strategy.interval_scale).toBe(1.5);
      expect(res.body.data.state.fatigue).toBe(0.2);
    });

    it('should handle anomaly detection', async () => {
      const mockResult = {
        strategy: { interval_scale: 1.0, difficulty: 'mid' },
        state: { fatigue: 0.5 },
        trace: {
          confidence: 0.3,
          anomaly: true,
          anomaly_reason: 'response_time_too_fast'
        }
      };
      mockAmasService.processLearningEvent.mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validEvent, responseTimeMs: 100 });

      expect(res.body.data.trace.anomaly).toBe(true);
    });

    it('should handle service error gracefully', async () => {
      mockAmasService.processLearningEvent.mockRejectedValue(
        new Error('Database connection failed')
      );

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEvent);

      expect(res.status).toBe(500);
    });
  });

  // ==================== GET /api/amas/state ====================

  describe('GET /api/amas/state', () => {
    it('should return user state', async () => {
      const mockState = {
        phase: 'normal',
        interactionCount: 150,
        fatigue: 0.25,
        attention: 0.85,
        lastActivity: new Date().toISOString()
      };
      mockAmasService.getEngineState.mockResolvedValue(mockState);

      const res = await request(app)
        .get('/api/amas/state')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockState);
    });

    it('should return 404 for uninitialized user', async () => {
      mockAmasService.getEngineState.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/amas/state')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/amas/state');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/amas/reset ====================

  describe('POST /api/amas/reset', () => {
    it('should reset user state', async () => {
      mockAmasService.resetUserState.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/amas/reset')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockAmasService.resetUserState).toHaveBeenCalledWith(testUserId);
    });

    it('should clear cache on reset', async () => {
      mockAmasService.resetUserState.mockResolvedValue({
        success: true,
        cacheCleared: true
      });

      const res = await request(app)
        .post('/api/amas/reset')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data?.cacheCleared).toBe(true);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/amas/reset');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/phase ====================

  describe('GET /api/amas/phase', () => {
    it('should return cold start phase for new user', async () => {
      mockAmasService.getColdStartPhase.mockResolvedValue({
        phase: 'classify',
        probeIndex: 2,
        totalProbes: 5
      });

      const res = await request(app)
        .get('/api/amas/phase')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.phase).toBe('classify');
    });

    it('should return normal phase for established user', async () => {
      mockAmasService.getColdStartPhase.mockResolvedValue({
        phase: 'normal',
        probeIndex: 5,
        totalProbes: 5
      });

      const res = await request(app)
        .get('/api/amas/phase')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data.phase).toBe('normal');
    });
  });

  // ==================== POST /api/amas/batch-process ====================

  describe('POST /api/amas/batch-process', () => {
    it('should process batch of events', async () => {
      const events = [
        { wordId: 'word-1', isCorrect: true, responseTimeMs: 2000, sessionId: 'sess-1' },
        { wordId: 'word-2', isCorrect: false, responseTimeMs: 4000, sessionId: 'sess-1' }
      ];
      mockAmasService.batchProcessEvents.mockResolvedValue({
        processed: 2,
        results: [
          { wordId: 'word-1', strategy: { interval_scale: 1.2 } },
          { wordId: 'word-2', strategy: { interval_scale: 0.8 } }
        ]
      });

      const res = await request(app)
        .post('/api/amas/batch-process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ events });

      expect(res.status).toBe(200);
      expect(res.body.data.processed).toBe(2);
    });

    it('should reject batch larger than 100', async () => {
      const events = Array.from({ length: 101 }, (_, i) => ({
        wordId: `word-${i}`,
        isCorrect: true,
        responseTimeMs: 2000,
        sessionId: 'sess-1'
      }));

      const res = await request(app)
        .post('/api/amas/batch-process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ events });

      expect(res.status).toBe(400);
    });

    it('should handle partial batch failure', async () => {
      const events = [
        { wordId: 'word-1', isCorrect: true, responseTimeMs: 2000, sessionId: 'sess-1' },
        { wordId: 'word-2', isCorrect: true, responseTimeMs: 2000, sessionId: 'sess-1' }
      ];
      mockAmasService.batchProcessEvents.mockResolvedValue({
        processed: 1,
        failed: 1,
        results: [{ wordId: 'word-1', strategy: { interval_scale: 1.0 } }],
        errors: [{ wordId: 'word-2', error: 'Word not found' }]
      });

      const res = await request(app)
        .post('/api/amas/batch-process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ events });

      expect(res.body.data.failed).toBe(1);
    });
  });

  // ==================== GET /api/amas/delayed-rewards ====================

  describe('GET /api/amas/delayed-rewards', () => {
    it('should return pending rewards', async () => {
      const mockRewards = [
        { wordId: 'word-1', pendingReward: 0.8, dueAt: new Date().toISOString() },
        { wordId: 'word-2', pendingReward: 0.5, dueAt: new Date().toISOString() }
      ];
      mockDelayedRewardService.getPendingRewards.mockResolvedValue(mockRewards);

      const res = await request(app)
        .get('/api/amas/delayed-rewards')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockDelayedRewardService.getPendingRewards.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/delayed-rewards?status=applied')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDelayedRewardService.getPendingRewards).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({ status: 'applied' })
      );
    });

    it('should handle empty rewards', async () => {
      mockDelayedRewardService.getPendingRewards.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/delayed-rewards')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data).toEqual([]);
    });
  });
});
