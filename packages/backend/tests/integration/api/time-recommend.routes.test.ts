/**
 * Time Recommend Routes Integration Tests
 *
 * Tests for time recommendation API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockTimeRecommendService } = vi.hoisted(() => ({
  mockTimeRecommendService: {
    getTimePreferences: vi.fn(),
    isGoldenTime: vi.fn()
  }
}));

vi.mock('../../../src/services/time-recommend.service', () => ({
  timeRecommendService: mockTimeRecommendService
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

describe('Time Recommend API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/amas/time-preferences ====================

  describe('GET /api/amas/time-preferences', () => {
    it('should return time preferences', async () => {
      mockTimeRecommendService.getTimePreferences.mockResolvedValue({
        timePref: Array(24).fill(0).map((_, i) => i >= 8 && i <= 10 ? 0.8 : 0.2),
        preferredSlots: ['morning', 'evening'],
        confidence: 0.85,
        sampleCount: 50
      });

      const res = await request(app)
        .get('/api/amas/time-preferences')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.preferredSlots).toContain('morning');
      expect(res.body.data.confidence).toBe(0.85);
    });

    it('should return insufficient data message', async () => {
      mockTimeRecommendService.getTimePreferences.mockResolvedValue({
        insufficientData: true,
        minRequired: 10,
        currentCount: 3
      });

      const res = await request(app)
        .get('/api/amas/time-preferences')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.insufficientData).toBe(true);
      expect(res.body.data.minRequired).toBe(10);
      expect(res.body.data.message).toContain('至少10次');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/time-preferences');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/golden-time ====================

  describe('GET /api/amas/golden-time', () => {
    it('should return golden time status when in golden time', async () => {
      mockTimeRecommendService.isGoldenTime.mockResolvedValue({
        isGolden: true,
        currentHour: 9,
        matchedSlot: 'morning'
      });

      const res = await request(app)
        .get('/api/amas/golden-time')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isGolden).toBe(true);
      expect(res.body.data.message).toContain('黄金学习时间');
    });

    it('should return not golden time status', async () => {
      mockTimeRecommendService.isGoldenTime.mockResolvedValue({
        isGolden: false,
        currentHour: 14,
        matchedSlot: null
      });

      const res = await request(app)
        .get('/api/amas/golden-time')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.isGolden).toBe(false);
      expect(res.body.data.message).toContain('不是');
    });

    it('should return current hour', async () => {
      mockTimeRecommendService.isGoldenTime.mockResolvedValue({
        isGolden: false,
        currentHour: 15,
        matchedSlot: null
      });

      const res = await request(app)
        .get('/api/amas/golden-time')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.currentHour).toBe(15);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/golden-time');

      expect(res.status).toBe(401);
    });
  });
});
