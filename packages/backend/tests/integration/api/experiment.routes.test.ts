/**
 * Experiment Routes Integration Tests
 *
 * Tests for A/B testing experiment API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockExperimentService } = vi.hoisted(() => ({
  mockExperimentService: {
    listExperiments: vi.fn(),
    createExperiment: vi.fn(),
    getExperiment: vi.fn(),
    getExperimentStatus: vi.fn(),
    startExperiment: vi.fn(),
    stopExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
    recordMetric: vi.fn()
  }
}));

vi.mock('../../../src/services/experiment.service', () => ({
  experimentService: mockExperimentService
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser', role: 'USER' };
      next();
    } else if (authHeader === 'Bearer admin-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser', role: 'USER' };
    } else if (authHeader === 'Bearer admin-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
    }
    next();
  }
}));

vi.mock('../../../src/middleware/admin.middleware', () => ({
  adminMiddleware: (req: any, res: any, next: any) => {
    if (req.user?.role === 'ADMIN') {
      next();
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
}));

import app from '../../../src/app';

describe('Experiment API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/experiments ====================

  describe('GET /api/experiments', () => {
    it('should return experiment list (admin only)', async () => {
      mockExperimentService.listExperiments.mockResolvedValue({
        experiments: [
          { id: 'exp-1', name: 'Test Experiment 1', status: 'running' },
          { id: 'exp-2', name: 'Test Experiment 2', status: 'draft' }
        ],
        total: 2
      });

      const res = await request(app)
        .get('/api/experiments')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should support pagination', async () => {
      mockExperimentService.listExperiments.mockResolvedValue({
        experiments: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/experiments?page=2&pageSize=10')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(mockExperimentService.listExperiments).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 10 })
      );
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/experiments')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });
  });

  // ==================== POST /api/experiments ====================

  describe('POST /api/experiments', () => {
    const validExperiment = {
      name: 'New Experiment',
      description: 'Test experiment description',
      trafficAllocation: 'EVEN',
      minSampleSize: 100,
      significanceLevel: 0.05,
      minimumDetectableEffect: 0.1,
      autoDecision: false,
      variants: [
        { id: 'control', name: 'Control', weight: 0.5 },
        { id: 'treatment', name: 'Treatment', weight: 0.5 }
      ]
    };

    it('should create experiment (admin only)', async () => {
      mockExperimentService.createExperiment.mockResolvedValue({
        id: 'new-exp-id',
        ...validExperiment,
        status: 'draft',
        createdAt: new Date()
      });

      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send(validExperiment);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Experiment');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, name: '' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for name exceeding 200 characters', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, name: 'a'.repeat(201) });

      expect(res.status).toBe(400);
    });

    it('should return 400 for less than 2 variants', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, variants: [{ id: 'a', name: 'A', weight: 1 }] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid traffic allocation', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, trafficAllocation: 'INVALID' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for minSampleSize < 10', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, minSampleSize: 5 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid significanceLevel', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validExperiment, significanceLevel: 1.5 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid variant weight', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer admin-token')
        .send({
          ...validExperiment,
          variants: [
            { id: 'a', name: 'A', weight: 1.5 },
            { id: 'b', name: 'B', weight: 0.5 }
          ]
        });

      expect(res.status).toBe(400);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/experiments')
        .set('Authorization', 'Bearer valid-token')
        .send(validExperiment);

      expect(res.status).toBe(403);
    });
  });

  // ==================== GET /api/experiments/:experimentId ====================

  describe('GET /api/experiments/:experimentId', () => {
    it('should return experiment details', async () => {
      mockExperimentService.getExperiment.mockResolvedValue({
        id: 'exp-1',
        name: 'Test Experiment',
        status: 'running',
        variants: []
      });

      const res = await request(app)
        .get('/api/experiments/exp-1')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Experiment');
    });

    it('should return 404 for non-existent experiment', async () => {
      mockExperimentService.getExperiment.mockRejectedValue(new Error('实验不存在'));

      const res = await request(app)
        .get('/api/experiments/nonexistent')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
    });
  });

  // ==================== POST /api/experiments/:experimentId/start ====================

  describe('POST /api/experiments/:experimentId/start', () => {
    it('should start experiment', async () => {
      mockExperimentService.startExperiment.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/experiments/exp-1/start')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('已启动');
    });

    it('should return 400 for invalid state transition', async () => {
      mockExperimentService.startExperiment.mockRejectedValue(
        new Error('实验已经在运行中')
      );

      const res = await request(app)
        .post('/api/experiments/exp-1/start')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /api/experiments/:experimentId/stop ====================

  describe('POST /api/experiments/:experimentId/stop', () => {
    it('should stop experiment', async () => {
      mockExperimentService.stopExperiment.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/experiments/exp-1/stop')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('已停止');
    });
  });

  // ==================== DELETE /api/experiments/:experimentId ====================

  describe('DELETE /api/experiments/:experimentId', () => {
    it('should delete experiment', async () => {
      mockExperimentService.deleteExperiment.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/experiments/exp-1')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('已删除');
    });
  });

  // ==================== POST /api/experiments/:experimentId/metric ====================

  describe('POST /api/experiments/:experimentId/metric', () => {
    it('should record metric (user can record)', async () => {
      mockExperimentService.recordMetric.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/experiments/exp-1/metric')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'control', reward: 0.5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(true);
    });

    it('should return 400 for missing variantId', async () => {
      const res = await request(app)
        .post('/api/experiments/exp-1/metric')
        .set('Authorization', 'Bearer valid-token')
        .send({ reward: 0.5 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid reward value', async () => {
      const res = await request(app)
        .post('/api/experiments/exp-1/metric')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'control', reward: 2 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for reward < -1', async () => {
      const res = await request(app)
        .post('/api/experiments/exp-1/metric')
        .set('Authorization', 'Bearer valid-token')
        .send({ variantId: 'control', reward: -2 });

      expect(res.status).toBe(400);
    });
  });
});
