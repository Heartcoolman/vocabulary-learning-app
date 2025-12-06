/**
 * Optimization Routes Integration Tests
 *
 * Tests for hyperparameter optimization API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockOptimizationService } = vi.hoisted(() => ({
  mockOptimizationService: {
    suggestNextParams: vi.fn(),
    recordEvaluation: vi.fn(),
    getBestParams: vi.fn(),
    getOptimizationHistory: vi.fn(),
    runOptimizationCycle: vi.fn(),
    resetOptimizer: vi.fn(),
    getDiagnostics: vi.fn(),
    getParamSpace: vi.fn()
  }
}));

vi.mock('../../../src/services/optimization.service', () => ({
  optimizationService: mockOptimizationService
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token') {
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

describe('Optimization API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/optimization/suggest ====================

  describe('GET /api/optimization/suggest', () => {
    it('should return suggested parameters', async () => {
      mockOptimizationService.suggestNextParams.mockReturnValue({
        learningRate: 0.01,
        batchSize: 32,
        momentum: 0.9
      });

      mockOptimizationService.getParamSpace.mockReturnValue({
        learningRate: { min: 0.001, max: 0.1 },
        batchSize: { min: 16, max: 128 },
        momentum: { min: 0.5, max: 0.99 }
      });

      const res = await request(app)
        .get('/api/optimization/suggest')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.params).toBeDefined();
      expect(res.body.data.paramSpace).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/optimization/suggest');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/optimization/evaluate ====================

  describe('POST /api/optimization/evaluate', () => {
    it('should record evaluation', async () => {
      mockOptimizationService.recordEvaluation.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/optimization/evaluate')
        .set('Authorization', 'Bearer admin-token')
        .send({
          params: { learningRate: 0.01, batchSize: 32 },
          value: 0.85
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(true);
    });

    it('should return 400 for missing params', async () => {
      const res = await request(app)
        .post('/api/optimization/evaluate')
        .set('Authorization', 'Bearer admin-token')
        .send({ value: 0.85 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for non-object params', async () => {
      const res = await request(app)
        .post('/api/optimization/evaluate')
        .set('Authorization', 'Bearer admin-token')
        .send({ params: 'not-an-object', value: 0.85 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid value', async () => {
      const res = await request(app)
        .post('/api/optimization/evaluate')
        .set('Authorization', 'Bearer admin-token')
        .send({ params: { lr: 0.01 }, value: 'not-a-number' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for NaN value', async () => {
      const res = await request(app)
        .post('/api/optimization/evaluate')
        .set('Authorization', 'Bearer admin-token')
        .send({ params: { lr: 0.01 }, value: NaN });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/optimization/best ====================

  describe('GET /api/optimization/best', () => {
    it('should return best parameters', async () => {
      mockOptimizationService.getBestParams.mockReturnValue({
        params: { learningRate: 0.005, batchSize: 64 },
        value: 0.92,
        iteration: 15
      });

      const res = await request(app)
        .get('/api/optimization/best')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.value).toBe(0.92);
    });

    it('should return null when no best params yet', async () => {
      mockOptimizationService.getBestParams.mockReturnValue(null);

      const res = await request(app)
        .get('/api/optimization/best')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  // ==================== GET /api/optimization/history ====================

  describe('GET /api/optimization/history', () => {
    it('should return optimization history', async () => {
      mockOptimizationService.getOptimizationHistory.mockReturnValue([
        { iteration: 1, params: { lr: 0.01 }, value: 0.7 },
        { iteration: 2, params: { lr: 0.02 }, value: 0.75 },
        { iteration: 3, params: { lr: 0.015 }, value: 0.8 }
      ]);

      const res = await request(app)
        .get('/api/optimization/history')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return empty array when no history', async () => {
      mockOptimizationService.getOptimizationHistory.mockReturnValue([]);

      const res = await request(app)
        .get('/api/optimization/history')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  // ==================== POST /api/optimization/trigger ====================

  describe('POST /api/optimization/trigger', () => {
    it('should trigger optimization cycle', async () => {
      mockOptimizationService.runOptimizationCycle.mockResolvedValue({
        success: true,
        newBestParams: { lr: 0.008 },
        improvement: 0.05
      });

      const res = await request(app)
        .post('/api/optimization/trigger')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.improvement).toBe(0.05);
    });
  });

  // ==================== POST /api/optimization/reset ====================

  describe('POST /api/optimization/reset', () => {
    it('should reset optimizer', async () => {
      mockOptimizationService.resetOptimizer.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/optimization/reset')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reset).toBe(true);
    });
  });

  // ==================== GET /api/optimization/diagnostics ====================

  describe('GET /api/optimization/diagnostics', () => {
    it('should return diagnostics', async () => {
      mockOptimizationService.getDiagnostics.mockReturnValue({
        totalIterations: 50,
        convergenceRate: 0.95,
        explorationRatio: 0.2,
        lastImprovement: 5
      });

      const res = await request(app)
        .get('/api/optimization/diagnostics')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalIterations).toBe(50);
    });
  });

  // ==================== GET /api/optimization/param-space ====================

  describe('GET /api/optimization/param-space', () => {
    it('should return parameter space', async () => {
      mockOptimizationService.getParamSpace.mockReturnValue({
        learningRate: { min: 0.001, max: 0.1, type: 'continuous' },
        batchSize: { values: [16, 32, 64, 128], type: 'categorical' }
      });

      const res = await request(app)
        .get('/api/optimization/param-space')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.learningRate).toBeDefined();
      expect(res.body.data.batchSize).toBeDefined();
    });
  });
});
