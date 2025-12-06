/**
 * Tracking Routes Integration Tests
 *
 * Tests for user interaction tracking API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockTrackingService } = vi.hoisted(() => ({
  mockTrackingService: {
    processBatch: vi.fn(),
    getUserInteractionStats: vi.fn(),
    calculateAuditoryPreference: vi.fn(),
    getRecentEvents: vi.fn()
  }
}));

vi.mock('../../../src/services/tracking.service', () => ({
  trackingService: mockTrackingService,
  EventBatch: {} // mock type
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

describe('Tracking API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/tracking/events ====================

  describe('POST /api/tracking/events', () => {
    const validBatch = {
      events: [
        { type: 'click', target: 'pronunciation', timestamp: Date.now() },
        { type: 'pause', duration: 5000, timestamp: Date.now() }
      ],
      sessionId: 'session-123',
      timestamp: Date.now()
    };

    it('should process events batch for authenticated user', async () => {
      mockTrackingService.processBatch.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/tracking/events')
        .set('Authorization', 'Bearer valid-token')
        .send(validBatch);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('2 events');
    });

    it('should accept but not store events for anonymous user', async () => {
      const res = await request(app)
        .post('/api/tracking/events')
        .send(validBatch);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('anonymous');
      expect(mockTrackingService.processBatch).not.toHaveBeenCalled();
    });

    it('should support token in query parameter', async () => {
      mockTrackingService.processBatch.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/tracking/events?token=valid-token')
        .send(validBatch);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for missing events array', async () => {
      const res = await request(app)
        .post('/api/tracking/events')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-123' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-array events', async () => {
      const res = await request(app)
        .post('/api/tracking/events')
        .set('Authorization', 'Bearer valid-token')
        .send({ events: 'not-an-array', sessionId: 'session-123' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(app)
        .post('/api/tracking/events')
        .set('Authorization', 'Bearer valid-token')
        .send({ events: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for too many events', async () => {
      const tooManyEvents = Array(101).fill({ type: 'click', timestamp: Date.now() });

      const res = await request(app)
        .post('/api/tracking/events')
        .set('Authorization', 'Bearer valid-token')
        .send({ events: tooManyEvents, sessionId: 'session-123' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/tracking/stats ====================

  describe('GET /api/tracking/stats', () => {
    it('should return interaction stats', async () => {
      mockTrackingService.getUserInteractionStats.mockResolvedValue({
        pronunciationClicks: 50,
        pauseCount: 10,
        pageSwitchCount: 20,
        totalInteractions: 80,
        totalSessionDuration: 3600,
        lastActivityTime: new Date()
      });

      const res = await request(app)
        .get('/api/tracking/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pronunciationClicks).toBe(50);
    });

    it('should return default stats when no data', async () => {
      mockTrackingService.getUserInteractionStats.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tracking/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.pronunciationClicks).toBe(0);
      expect(res.body.data.totalInteractions).toBe(0);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/tracking/stats');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/tracking/auditory-preference ====================

  describe('GET /api/tracking/auditory-preference', () => {
    it('should return strong auditory preference', async () => {
      mockTrackingService.calculateAuditoryPreference.mockResolvedValue(0.8);

      const res = await request(app)
        .get('/api/tracking/auditory-preference')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(0.8);
      expect(res.body.data.interpretation).toBe('strong_auditory');
    });

    it('should return moderate auditory preference', async () => {
      mockTrackingService.calculateAuditoryPreference.mockResolvedValue(0.5);

      const res = await request(app)
        .get('/api/tracking/auditory-preference')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.interpretation).toBe('moderate_auditory');
    });

    it('should return low auditory preference', async () => {
      mockTrackingService.calculateAuditoryPreference.mockResolvedValue(0.2);

      const res = await request(app)
        .get('/api/tracking/auditory-preference')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.interpretation).toBe('low_auditory');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/tracking/auditory-preference');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/tracking/recent ====================

  describe('GET /api/tracking/recent', () => {
    it('should return recent events', async () => {
      mockTrackingService.getRecentEvents.mockResolvedValue([
        { type: 'click', timestamp: new Date() },
        { type: 'pause', timestamp: new Date() }
      ]);

      const res = await request(app)
        .get('/api/tracking/recent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.events).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('should accept limit parameter', async () => {
      mockTrackingService.getRecentEvents.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/tracking/recent?limit=10')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockTrackingService.getRecentEvents).toHaveBeenCalledWith('test-user-id', 10);
    });

    it('should cap limit at 100', async () => {
      mockTrackingService.getRecentEvents.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/tracking/recent?limit=200')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockTrackingService.getRecentEvents).toHaveBeenCalledWith('test-user-id', 100);
    });

    it('should use default limit when not specified', async () => {
      mockTrackingService.getRecentEvents.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/tracking/recent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockTrackingService.getRecentEvents).toHaveBeenCalledWith('test-user-id', 50);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/tracking/recent');

      expect(res.status).toBe(401);
    });
  });
});
