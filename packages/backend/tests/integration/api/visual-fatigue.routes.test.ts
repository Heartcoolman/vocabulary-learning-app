/**
 * Visual Fatigue Routes Integration Tests
 *
 * Tests for visual fatigue detection API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock visual fatigue processor
const mockVisualFatigueProcessor = vi.hoisted(() => ({
  process: vi.fn().mockReturnValue({
    score: 0.35,
    confidence: 0.8,
    perclos: 0.12,
    blinkRate: 18,
    yawnCount: 0,
    timestamp: Date.now(),
    trend: 0.1,
    recommendation: 'normal',
  }),
  updateBaseline: vi.fn(),
  getBaselineStatus: vi.fn().mockReturnValue({
    isCalibrated: true,
    sampleCount: 100,
    lastCalibration: Date.now() - 3600000,
  }),
}));

// Mock fatigue fusion engine
const mockFatigueFusionEngine = vi.hoisted(() => ({
  computeFusedFatigue: vi.fn().mockReturnValue({
    fusedScore: 0.4,
    confidence: 0.75,
    components: {
      visual: { score: 0.35, weight: 0.4 },
      behavioral: { score: 0.45, weight: 0.35 },
      temporal: { score: 0.4, weight: 0.25 },
    },
    timestamp: Date.now(),
  }),
}));

// Mock behavior fatigue service
const mockBehaviorFatigueService = vi.hoisted(() => ({
  getUserBehaviorFatigue: vi.fn().mockReturnValue({
    score: 0.45,
    confidence: 0.7,
    components: {},
    timestamp: Date.now(),
  }),
}));

// Mock prisma
const mockPrisma = vi.hoisted(() => ({
  userVisualFatigueConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  visualFatigueRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('../../../src/amas/modeling', () => ({
  defaultVisualFatigueProcessor: mockVisualFatigueProcessor,
  defaultFatigueFusionEngine: mockFatigueFusionEngine,
}));

vi.mock('../../../src/services/behavior-fatigue.service', () => ({
  behaviorFatigueService: mockBehaviorFatigueService,
}));

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma,
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser', role: 'USER' };
      next();
    } else {
      res.status(401).json({ success: false, error: '未登录' });
    }
  },
}));

// Mock amas service to prevent initialization errors
vi.mock('../../../src/services/amas.service', () => ({
  default: {},
  amasService: {},
}));

import { createApp } from '../../../src/app';
import express from 'express';

describe('Visual Fatigue Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/visual-fatigue/metrics', () => {
    const validMetrics = {
      score: 0.35,
      perclos: 0.12,
      blinkRate: 18,
      yawnCount: 0,
      confidence: 0.8,
      timestamp: Date.now(),
    };

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).post('/api/visual-fatigue/metrics').send(validMetrics);

      expect(response.status).toBe(401);
    });

    it('should accept valid metrics and return processed result', async () => {
      const response = await request(app)
        .post('/api/visual-fatigue/metrics')
        .set('Authorization', 'Bearer valid-token')
        .send(validMetrics);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('score');
      expect(response.body.data).toHaveProperty('confidence');
    });

    it('should reject invalid metrics - score out of range', async () => {
      const invalidMetrics = {
        ...validMetrics,
        score: 1.5, // invalid: > 1
      };

      const response = await request(app)
        .post('/api/visual-fatigue/metrics')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidMetrics);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid metrics - negative blinkRate', async () => {
      const invalidMetrics = {
        ...validMetrics,
        blinkRate: -5, // invalid: < 0
      };

      const response = await request(app)
        .post('/api/visual-fatigue/metrics')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidMetrics);

      expect(response.status).toBe(400);
    });

    it('should reject invalid metrics - missing required fields', async () => {
      const incompleteMetrics = {
        score: 0.35,
        // missing other required fields
      };

      const response = await request(app)
        .post('/api/visual-fatigue/metrics')
        .set('Authorization', 'Bearer valid-token')
        .send(incompleteMetrics);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/visual-fatigue/baseline', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/visual-fatigue/baseline');

      expect(response.status).toBe(401);
    });

    it('should return baseline status for authenticated user', async () => {
      const response = await request(app)
        .get('/api/visual-fatigue/baseline')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isCalibrated');
    });
  });

  describe('GET /api/visual-fatigue/config', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/visual-fatigue/config');

      expect(response.status).toBe(401);
    });

    it('should return default config when no user config exists', async () => {
      mockPrisma.userVisualFatigueConfig.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/visual-fatigue/config')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('detectionIntervalMs');
    });

    it('should return merged config when user config exists', async () => {
      mockPrisma.userVisualFatigueConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: 'test-user-id',
        enabled: true,
        detectionFps: 15,
        uploadIntervalMs: 10000,
        vlmAnalysisEnabled: false,
        personalBaselineData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .get('/api/visual-fatigue/config')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(true);
    });
  });

  describe('PUT /api/visual-fatigue/config', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).put('/api/visual-fatigue/config').send({ enabled: true });

      expect(response.status).toBe(401);
    });

    it('should update user config', async () => {
      const updatedConfig = {
        id: 'config-1',
        userId: 'test-user-id',
        enabled: true,
        detectionFps: 20,
        uploadIntervalMs: 8000,
        vlmAnalysisEnabled: true,
        personalBaselineData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.userVisualFatigueConfig.upsert.mockResolvedValue(updatedConfig);

      const response = await request(app)
        .put('/api/visual-fatigue/config')
        .set('Authorization', 'Bearer valid-token')
        .send({
          enabled: true,
          detectionFps: 20,
          uploadIntervalMs: 8000,
          vlmAnalysisEnabled: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockPrisma.userVisualFatigueConfig.upsert).toHaveBeenCalled();
    });

    it('should reject invalid config - detectionFps out of range', async () => {
      const response = await request(app)
        .put('/api/visual-fatigue/config')
        .set('Authorization', 'Bearer valid-token')
        .send({
          detectionFps: 60, // invalid: > 30
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid config - uploadIntervalMs too small', async () => {
      const response = await request(app)
        .put('/api/visual-fatigue/config')
        .set('Authorization', 'Bearer valid-token')
        .send({
          uploadIntervalMs: 500, // invalid: < 1000
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/visual-fatigue/fusion', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/visual-fatigue/fusion');

      expect(response.status).toBe(401);
    });

    it('should return fused fatigue result', async () => {
      const response = await request(app)
        .get('/api/visual-fatigue/fusion')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('fusedScore');
      expect(response.body.data).toHaveProperty('components');
    });
  });
});
