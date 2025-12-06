/**
 * Plan Routes Integration Tests
 *
 * Tests for learning plan API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockPlanGeneratorService } = vi.hoisted(() => ({
  mockPlanGeneratorService: {
    getCurrentPlan: vi.fn(),
    generatePlan: vi.fn(),
    updatePlanProgress: vi.fn(),
    adjustPlan: vi.fn()
  }
}));

vi.mock('../../../src/services/plan-generator.service', () => ({
  planGeneratorService: mockPlanGeneratorService
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

describe('Plan API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/plan ====================

  describe('GET /api/plan', () => {
    it('should return current plan', async () => {
      const mockPlan = {
        id: 'plan-id',
        dailyTarget: 20,
        totalWords: 1000,
        estimatedCompletionDate: new Date('2024-12-31'),
        wordbookDistribution: { 'wb-1': 500, 'wb-2': 500 },
        weeklyMilestones: [{ week: 1, target: 140 }],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPlanGeneratorService.getCurrentPlan.mockResolvedValue(mockPlan);

      const res = await request(app)
        .get('/api/plan')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dailyTarget).toBe(20);
      expect(res.body.data.totalWords).toBe(1000);
    });

    it('should return null when no plan exists', async () => {
      mockPlanGeneratorService.getCurrentPlan.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/plan')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toContain('暂无学习计划');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/plan');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/plan/generate ====================

  describe('POST /api/plan/generate', () => {
    it('should generate a new plan', async () => {
      const mockPlan = {
        id: 'new-plan-id',
        dailyTarget: 30,
        totalWords: 900,
        estimatedCompletionDate: new Date('2024-12-31'),
        wordbookDistribution: {},
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPlanGeneratorService.generatePlan.mockResolvedValue(mockPlan);

      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ targetDays: 30, dailyTarget: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dailyTarget).toBe(30);
      expect(res.body.message).toContain('学习计划已生成');
    });

    it('should generate plan without parameters', async () => {
      const mockPlan = {
        id: 'auto-plan-id',
        dailyTarget: 20,
        totalWords: 600,
        estimatedCompletionDate: new Date('2024-12-31'),
        wordbookDistribution: {},
        weeklyMilestones: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPlanGeneratorService.generatePlan.mockResolvedValue(mockPlan);

      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid targetDays (negative)', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ targetDays: -1 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid targetDays (too large)', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ targetDays: 400 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid targetDays (not integer)', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ targetDays: 30.5 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid dailyTarget (too small)', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ dailyTarget: 0 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid dailyTarget (too large)', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ dailyTarget: 250 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-array wordbookIds', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordbookIds: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for wordbookIds with empty strings', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordbookIds: ['valid-id', ''] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for too many wordbookIds', async () => {
      const tooManyIds = Array(51).fill('id');
      const res = await request(app)
        .post('/api/plan/generate')
        .set('Authorization', 'Bearer valid-token')
        .send({ wordbookIds: tooManyIds });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/plan/generate')
        .send({ targetDays: 30 });

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/plan/progress ====================

  describe('GET /api/plan/progress', () => {
    it('should return plan progress', async () => {
      mockPlanGeneratorService.updatePlanProgress.mockResolvedValue({
        completedToday: 15,
        targetToday: 20,
        weeklyProgress: 0.75,
        overallProgress: 0.45,
        onTrack: true,
        deviation: 0.05
      });

      const res = await request(app)
        .get('/api/plan/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.completedToday).toBe(15);
      expect(res.body.data.targetToday).toBe(20);
      expect(res.body.data.onTrack).toBe(true);
    });

    it('should indicate when behind schedule', async () => {
      mockPlanGeneratorService.updatePlanProgress.mockResolvedValue({
        completedToday: 5,
        targetToday: 20,
        weeklyProgress: 0.25,
        overallProgress: 0.20,
        onTrack: false,
        deviation: -0.3
      });

      const res = await request(app)
        .get('/api/plan/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.onTrack).toBe(false);
      expect(res.body.data.status).toContain('落后');
    });

    it('should indicate when ahead of schedule', async () => {
      mockPlanGeneratorService.updatePlanProgress.mockResolvedValue({
        completedToday: 30,
        targetToday: 20,
        weeklyProgress: 1.5,
        overallProgress: 0.60,
        onTrack: false,
        deviation: 0.5
      });

      const res = await request(app)
        .get('/api/plan/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toContain('超前');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/plan/progress');

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/plan/adjust ====================

  describe('PUT /api/plan/adjust', () => {
    it('should adjust plan', async () => {
      const adjustedPlan = {
        id: 'adjusted-plan-id',
        dailyTarget: 25,
        totalWords: 800,
        estimatedCompletionDate: new Date('2024-12-31'),
        wordbookDistribution: {},
        weeklyMilestones: [],
        isActive: true,
        updatedAt: new Date()
      };

      mockPlanGeneratorService.adjustPlan.mockResolvedValue(adjustedPlan);

      const res = await request(app)
        .put('/api/plan/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: '工作繁忙需要减少学习量' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('学习计划已调整');
    });

    it('should adjust plan without reason', async () => {
      const adjustedPlan = {
        id: 'adjusted-plan-id',
        dailyTarget: 20,
        totalWords: 600,
        estimatedCompletionDate: new Date('2024-12-31'),
        wordbookDistribution: {},
        weeklyMilestones: [],
        isActive: true,
        updatedAt: new Date()
      };

      mockPlanGeneratorService.adjustPlan.mockResolvedValue(adjustedPlan);

      const res = await request(app)
        .put('/api/plan/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPlanGeneratorService.adjustPlan).toHaveBeenCalledWith(
        'test-user-id',
        '用户手动调整'
      );
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/plan/adjust')
        .send({ reason: 'test' });

      expect(res.status).toBe(401);
    });

    it('should handle plan not found', async () => {
      mockPlanGeneratorService.adjustPlan.mockRejectedValue(new Error('学习计划不存在'));

      const res = await request(app)
        .put('/api/plan/adjust')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect([404, 500]).toContain(res.status);
    });
  });
});
