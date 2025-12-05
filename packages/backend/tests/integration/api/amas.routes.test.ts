/**
 * AMAS Routes Integration Tests
 *
 * Tests for AMAS API endpoints with full implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Use vi.hoisted to ensure mocks are available after hoisting
const { mockAmasService, mockDelayedRewardService } = vi.hoisted(() => ({
  mockAmasService: {
    processLearningEvent: vi.fn(),
    getUserState: vi.fn(),
    resetUser: vi.fn(),
    getColdStartPhase: vi.fn(),
    batchProcessEvents: vi.fn(),
    getCurrentStrategy: vi.fn()
  },
  mockDelayedRewardService: {
    findRewards: vi.fn()
  }
}));

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
  },
  optionalAuthMiddleware: (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
    }
    // optionalAuthMiddleware always calls next, even without auth
    next();
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
      responseTime: 2500,
      sessionId: 'session-123'
    };

    it('should process learning event with valid token', async () => {
      const mockResult = {
        strategy: { interval_scale: 1.2, difficulty: 'mid' },
        state: { A: 0.8, F: 0.3, M: 0.5, C: { mem: 0.7, speed: 0.6, stability: 0.8 } },
        explanation: 'Good progress',
        suggestion: 'Keep going',
        shouldBreak: false
      };
      mockAmasService.processLearningEvent.mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEvent);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.strategy).toEqual(mockResult.strategy);
      expect(mockAmasService.processLearningEvent).toHaveBeenCalled();
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
          A: 0.9,
          F: 0.2,
          M: 0.7,
          C: { mem: 0.8, speed: 0.7, stability: 0.9 }
        },
        explanation: 'Excellent!',
        suggestion: null,
        shouldBreak: false
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
        state: { A: 0.5, F: 0.5, M: 0.0, C: { mem: 0.5, speed: 0.5, stability: 0.5 } },
        explanation: 'Anomaly detected',
        suggestion: 'Take a break',
        shouldBreak: true
      };
      mockAmasService.processLearningEvent.mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ ...validEvent, responseTime: 100 });

      expect(res.body.data.shouldBreak).toBe(true);
    });

    it('should handle service error gracefully', async () => {
      mockAmasService.processLearningEvent.mockRejectedValue(
        new Error('Database connection failed')
      );

      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validEvent);

      // Error handler converts generic errors to 400 (business error)
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing wordId', async () => {
      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ isCorrect: true, responseTime: 2500 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid responseTime', async () => {
      const res = await request(app)
        .post('/api/amas/process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ wordId: 'word-123', isCorrect: true, responseTime: -100 });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/amas/state ====================

  describe('GET /api/amas/state', () => {
    it('should return user state', async () => {
      const mockState = {
        A: 0.85,
        F: 0.25,
        M: 0.6,
        C: { mem: 0.7, speed: 0.8, stability: 0.75 },
        conf: 0.9,
        ts: Date.now()
      };
      mockAmasService.getUserState.mockResolvedValue(mockState);

      const res = await request(app)
        .get('/api/amas/state')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attention).toBe(0.85);
      expect(res.body.data.fatigue).toBe(0.25);
    });

    it('should return 404 for uninitialized user', async () => {
      mockAmasService.getUserState.mockResolvedValue(null);

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
      mockAmasService.resetUser.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/amas/reset')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockAmasService.resetUser).toHaveBeenCalledWith(testUserId);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/amas/reset');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/phase ====================

  describe('GET /api/amas/phase', () => {
    it('should return cold start phase for new user', async () => {
      mockAmasService.getColdStartPhase.mockReturnValue('classify');

      const res = await request(app)
        .get('/api/amas/phase')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.phase).toBe('classify');
    });

    it('should return normal phase for established user', async () => {
      mockAmasService.getColdStartPhase.mockReturnValue('normal');

      const res = await request(app)
        .get('/api/amas/phase')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data.phase).toBe('normal');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/amas/phase');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/amas/batch-process ====================

  describe('POST /api/amas/batch-process', () => {
    it('should process batch of events', async () => {
      const events = [
        { wordId: 'word-1', isCorrect: true, responseTime: 2000, timestamp: Date.now() - 1000 },
        { wordId: 'word-2', isCorrect: false, responseTime: 4000, timestamp: Date.now() - 500 }
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
        responseTime: 2000,
        timestamp: Date.now() - i * 100
      }));

      const res = await request(app)
        .post('/api/amas/batch-process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ events });

      expect(res.status).toBe(400);
    });

    it('should reject empty batch', async () => {
      const res = await request(app)
        .post('/api/amas/batch-process')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ events: [] });

      expect(res.status).toBe(400);
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/amas/batch-process')
        .send({ events: [] });

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/delayed-rewards ====================

  describe('GET /api/amas/delayed-rewards', () => {
    it('should return pending rewards', async () => {
      const mockRewards = [
        { wordId: 'word-1', pendingReward: 0.8, dueAt: new Date().toISOString() },
        { wordId: 'word-2', pendingReward: 0.5, dueAt: new Date().toISOString() }
      ];
      mockDelayedRewardService.findRewards.mockResolvedValue(mockRewards);

      const res = await request(app)
        .get('/api/amas/delayed-rewards')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockDelayedRewardService.findRewards.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/delayed-rewards?status=DONE')
        .set('Authorization', `Bearer ${validToken}`);

      expect(mockDelayedRewardService.findRewards).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DONE' })
      );
    });

    it('should handle empty rewards', async () => {
      mockDelayedRewardService.findRewards.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/delayed-rewards')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.body.data.items).toEqual([]);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/amas/delayed-rewards');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/strategy ====================

  describe('GET /api/amas/strategy', () => {
    it('should return current strategy', async () => {
      const mockStrategy = {
        interval_scale: 1.2,
        new_ratio: 0.3,
        difficulty: 'mid',
        batch_size: 20
      };
      mockAmasService.getCurrentStrategy.mockResolvedValue(mockStrategy);

      const res = await request(app)
        .get('/api/amas/strategy')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockStrategy);
    });

    it('should return 404 for uninitialized user', async () => {
      mockAmasService.getCurrentStrategy.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/amas/strategy')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/amas/strategy');

      expect(res.status).toBe(401);
    });
  });
});
