/**
 * Evaluation Routes Integration Tests
 *
 * Tests for causal inference evaluation API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockEvaluationService } = vi.hoisted(() => ({
  mockEvaluationService: {
    recordCausalObservation: vi.fn(),
    estimateStrategyEffect: vi.fn(),
    compareStrategies: vi.fn(),
    getCausalDiagnostics: vi.fn()
  }
}));

vi.mock('../../../src/services/evaluation.service', () => ({
  evaluationService: mockEvaluationService
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

describe('Evaluation API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/evaluation/causal/observe ====================

  describe('POST /api/evaluation/causal/observe', () => {
    const validObservation = {
      features: [0.5, 0.3, 0.8, 0.2],
      treatment: 1,
      outcome: 0.7
    };

    it('should record causal observation', async () => {
      mockEvaluationService.recordCausalObservation.mockResolvedValue({
        id: 'obs-1',
        treatment: 1,
        outcome: 0.7,
        timestamp: new Date()
      });

      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send(validObservation);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.treatment).toBe(1);
    });

    it('should return 400 for non-array features', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, features: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for features exceeding max length', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, features: Array(101).fill(0.5) });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid feature values', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, features: [0.5, 'invalid', 0.3] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for feature value exceeding max', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, features: [0.5, 1e7] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid treatment value', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, treatment: 2 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for outcome out of range', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validObservation, outcome: 1.5 });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/evaluation/causal/observe')
        .send(validObservation);

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/evaluation/causal/ate ====================

  describe('GET /api/evaluation/causal/ate', () => {
    it('should return ATE estimate (admin only)', async () => {
      mockEvaluationService.estimateStrategyEffect.mockResolvedValue({
        ate: 0.15,
        standardError: 0.05,
        confidenceInterval: [0.05, 0.25],
        sampleSize: 1000
      });

      const res = await request(app)
        .get('/api/evaluation/causal/ate')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ate).toBe(0.15);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/evaluation/causal/ate')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/evaluation/causal/ate');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/evaluation/causal/compare ====================

  describe('GET /api/evaluation/causal/compare', () => {
    it('should compare strategies (admin only)', async () => {
      mockEvaluationService.compareStrategies.mockResolvedValue({
        strategyA: { effect: 0.2, sampleSize: 500 },
        strategyB: { effect: 0.15, sampleSize: 500 },
        difference: 0.05,
        significant: true
      });

      const res = await request(app)
        .get('/api/evaluation/causal/compare?strategyA=0&strategyB=1')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.difference).toBe(0.05);
    });

    it('should return 400 for missing strategy parameters', async () => {
      const res = await request(app)
        .get('/api/evaluation/causal/compare')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid strategy values', async () => {
      const res = await request(app)
        .get('/api/evaluation/causal/compare?strategyA=invalid&strategyB=1')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/evaluation/causal/compare?strategyA=0&strategyB=1')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });
  });

  // ==================== GET /api/evaluation/causal/diagnostics ====================

  describe('GET /api/evaluation/causal/diagnostics', () => {
    it('should return causal diagnostics (admin only)', async () => {
      mockEvaluationService.getCausalDiagnostics.mockResolvedValue({
        balanceMetrics: { smb: 0.05, varianceRatio: 0.98 },
        overlapAssessment: { min: 0.1, max: 0.9 },
        sampleSize: 2000
      });

      const res = await request(app)
        .get('/api/evaluation/causal/diagnostics')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sampleSize).toBe(2000);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/evaluation/causal/diagnostics')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/evaluation/causal/diagnostics');

      expect(res.status).toBe(401);
    });
  });
});
