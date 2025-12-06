/**
 * Badge Routes Integration Tests
 *
 * Tests for badge system API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockBadgeService } = vi.hoisted(() => ({
  mockBadgeService: {
    getUserBadges: vi.fn(),
    getAllBadgesWithStatus: vi.fn(),
    getBadgeDetails: vi.fn(),
    getBadgeProgress: vi.fn(),
    checkAndAwardBadges: vi.fn()
  }
}));

vi.mock('../../../src/services/badge.service', () => ({
  badgeService: mockBadgeService
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

describe('Badge API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/badges ====================

  describe('GET /api/badges', () => {
    it('should return user badges', async () => {
      mockBadgeService.getUserBadges.mockResolvedValue([
        { id: 'badge-1', name: '初学者', description: '完成首次学习', unlockedAt: new Date() },
        { id: 'badge-2', name: '坚持者', description: '连续学习7天', unlockedAt: new Date() }
      ]);

      const res = await request(app)
        .get('/api/badges')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.badges).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('should return empty array when user has no badges', async () => {
      mockBadgeService.getUserBadges.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/badges')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.badges).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/badges');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/badges/all ====================

  describe('GET /api/badges/all', () => {
    it('should return all badges with status', async () => {
      mockBadgeService.getAllBadgesWithStatus.mockResolvedValue([
        { id: 'badge-1', name: '初学者', category: 'beginner', unlocked: true },
        { id: 'badge-2', name: '坚持者', category: 'streak', unlocked: true },
        { id: 'badge-3', name: '大师', category: 'mastery', unlocked: false }
      ]);

      const res = await request(app)
        .get('/api/badges/all')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCount).toBe(3);
      expect(res.body.data.unlockedCount).toBe(2);
      expect(res.body.data.grouped).toBeDefined();
    });

    it('should group badges by category', async () => {
      mockBadgeService.getAllBadgesWithStatus.mockResolvedValue([
        { id: 'badge-1', name: '初学者', category: 'beginner', unlocked: true },
        { id: 'badge-2', name: '进阶者', category: 'beginner', unlocked: false },
        { id: 'badge-3', name: '坚持者', category: 'streak', unlocked: true }
      ]);

      const res = await request(app)
        .get('/api/badges/all')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.grouped.beginner).toHaveLength(2);
      expect(res.body.data.grouped.streak).toHaveLength(1);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/badges/all');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/badges/:id ====================

  describe('GET /api/badges/:id', () => {
    it('should return badge details', async () => {
      mockBadgeService.getBadgeDetails.mockResolvedValue({
        id: 'badge-1',
        name: '初学者',
        description: '完成首次学习',
        icon: 'beginner.svg',
        requirements: '完成1次学习会话',
        unlocked: true,
        unlockedAt: new Date()
      });

      const res = await request(app)
        .get('/api/badges/badge-1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('初学者');
    });

    it('should return 404 for non-existent badge', async () => {
      mockBadgeService.getBadgeDetails.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/badges/nonexistent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('不存在');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/badges/badge-1');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/badges/:id/progress ====================

  describe('GET /api/badges/:id/progress', () => {
    it('should return badge progress', async () => {
      mockBadgeService.getBadgeProgress.mockResolvedValue({
        badgeId: 'badge-streak-7',
        currentValue: 5,
        targetValue: 7,
        percentage: 71.43
      });

      const res = await request(app)
        .get('/api/badges/badge-streak-7/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentValue).toBe(5);
      expect(res.body.data.targetValue).toBe(7);
    });

    it('should return 404 for non-existent badge', async () => {
      mockBadgeService.getBadgeProgress.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/badges/nonexistent/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/badges/badge-1/progress');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/badges/check ====================

  describe('POST /api/badges/check', () => {
    it('should check and award new badges', async () => {
      mockBadgeService.checkAndAwardBadges.mockResolvedValue([
        { id: 'badge-new-1', name: '新徽章1' },
        { id: 'badge-new-2', name: '新徽章2' }
      ]);

      const res = await request(app)
        .post('/api/badges/check')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newBadges).toHaveLength(2);
      expect(res.body.data.hasNewBadges).toBe(true);
      expect(res.body.data.message).toContain('恭喜获得2个新徽章');
    });

    it('should return message when no new badges', async () => {
      mockBadgeService.checkAndAwardBadges.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/badges/check')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.newBadges).toEqual([]);
      expect(res.body.data.hasNewBadges).toBe(false);
      expect(res.body.data.message).toContain('暂无新徽章');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/badges/check');

      expect(res.status).toBe(401);
    });
  });
});
