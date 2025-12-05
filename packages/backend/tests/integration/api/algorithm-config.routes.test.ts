/**
 * Algorithm Config Routes Integration Tests
 *
 * Tests for algorithm configuration API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockAlgorithmConfigService } = vi.hoisted(() => ({
  mockAlgorithmConfigService: {
    getActiveConfig: vi.fn(),
    updateConfig: vi.fn(),
    resetToDefault: vi.fn(),
    getConfigHistory: vi.fn(),
    getAllConfigs: vi.fn(),
    validateConfig: vi.fn()
  }
}));

vi.mock('../../../src/services/algorithm-config.service', () => ({
  algorithmConfigService: mockAlgorithmConfigService
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

describe('Algorithm Config API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/algorithm-config ====================

  describe('GET /api/algorithm-config', () => {
    const mockConfig = {
      id: 'config-1',
      name: 'default',
      config: {
        linucb: { alpha: 0.5, lambda: 1.0 },
        thompson: { priorAlpha: 1, priorBeta: 1 },
        ensemble: { weights: { thompson: 0.4, linucb: 0.4, heuristic: 0.2 } }
      },
      isActive: true,
      createdAt: new Date().toISOString()
    };

    it('should return active config for authenticated user', async () => {
      mockAlgorithmConfigService.getActiveConfig.mockResolvedValue(mockConfig);

      const res = await request(app)
        .get('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('config-1');
      expect(res.body.data.config.linucb).toBeDefined();
    });

    it('should return 404 when no config exists', async () => {
      mockAlgorithmConfigService.getActiveConfig.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/algorithm-config');

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/algorithm-config ====================

  describe('PUT /api/algorithm-config', () => {
    const validUpdatePayload = {
      configId: 'config-1',
      config: {
        linucb: { alpha: 0.6, lambda: 1.2 },
        thompson: { priorAlpha: 2, priorBeta: 2 },
        ensemble: { weights: { thompson: 0.5, linucb: 0.3, heuristic: 0.2 } }
      },
      changeReason: 'Tuning for better exploration'
    };

    it('should update config for authenticated user', async () => {
      mockAlgorithmConfigService.validateConfig.mockReturnValue({ valid: true, errors: [] });
      mockAlgorithmConfigService.updateConfig.mockResolvedValue({
        id: 'config-1',
        config: validUpdatePayload.config,
        updatedAt: new Date().toISOString()
      });

      const res = await request(app)
        .put('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token')
        .send(validUpdatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockAlgorithmConfigService.updateConfig).toHaveBeenCalledWith(
        'config-1',
        validUpdatePayload.config,
        'test-user-id',
        'Tuning for better exploration'
      );
    });

    it('should return 400 for missing configId', async () => {
      const res = await request(app)
        .put('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ config: {} });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('配置ID');
    });

    it('should return 400 for missing config data', async () => {
      const res = await request(app)
        .put('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ configId: 'config-1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('配置数据');
    });

    it('should return 400 for invalid config', async () => {
      mockAlgorithmConfigService.validateConfig.mockReturnValue({
        valid: false,
        errors: ['linucb.alpha must be positive', 'thompson.priorAlpha must be >= 1']
      });

      const res = await request(app)
        .put('/api/algorithm-config')
        .set('Authorization', 'Bearer valid-token')
        .send({
          configId: 'config-1',
          config: { linucb: { alpha: -1 } }
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toContain('linucb.alpha must be positive');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/algorithm-config')
        .send(validUpdatePayload);

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/algorithm-config/reset ====================

  describe('POST /api/algorithm-config/reset', () => {
    it('should reset config to default', async () => {
      mockAlgorithmConfigService.getActiveConfig.mockResolvedValue({ id: 'config-1' });
      mockAlgorithmConfigService.resetToDefault.mockResolvedValue({
        id: 'config-1',
        config: { linucb: { alpha: 0.5 } },
        isDefault: true
      });

      const res = await request(app)
        .post('/api/algorithm-config/reset')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockAlgorithmConfigService.resetToDefault).toHaveBeenCalledWith(
        'config-1',
        'test-user-id'
      );
    });

    it('should reset specific config when configId provided', async () => {
      mockAlgorithmConfigService.resetToDefault.mockResolvedValue({
        id: 'config-2',
        isDefault: true
      });

      const res = await request(app)
        .post('/api/algorithm-config/reset')
        .set('Authorization', 'Bearer valid-token')
        .send({ configId: 'config-2' });

      expect(res.status).toBe(200);
      expect(mockAlgorithmConfigService.resetToDefault).toHaveBeenCalledWith(
        'config-2',
        'test-user-id'
      );
    });

    it('should return 500 when no config available', async () => {
      mockAlgorithmConfigService.getActiveConfig.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/algorithm-config/reset')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(500);
    });
  });

  // ==================== GET /api/algorithm-config/history ====================

  describe('GET /api/algorithm-config/history', () => {
    it('should require admin authentication', async () => {
      const res = await request(app)
        .get('/api/algorithm-config/history')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
    });

    it('should return history for admin', async () => {
      mockAlgorithmConfigService.getConfigHistory.mockResolvedValue([
        { id: 'history-1', changedAt: new Date().toISOString(), changedBy: 'user-1' },
        { id: 'history-2', changedAt: new Date().toISOString(), changedBy: 'user-2' }
      ]);

      const res = await request(app)
        .get('/api/algorithm-config/history')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      mockAlgorithmConfigService.getConfigHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/algorithm-config/history?limit=10')
        .set('Authorization', 'Bearer admin-token');

      expect(mockAlgorithmConfigService.getConfigHistory).toHaveBeenCalledWith(
        undefined,
        10
      );
    });

    it('should filter by configId', async () => {
      mockAlgorithmConfigService.getConfigHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/algorithm-config/history?configId=config-1')
        .set('Authorization', 'Bearer admin-token');

      expect(mockAlgorithmConfigService.getConfigHistory).toHaveBeenCalledWith(
        'config-1',
        50
      );
    });
  });

  // ==================== GET /api/algorithm-config/presets ====================

  describe('GET /api/algorithm-config/presets', () => {
    it('should return all config presets', async () => {
      mockAlgorithmConfigService.getAllConfigs.mockResolvedValue([
        { id: 'preset-1', name: 'conservative', description: 'Low exploration' },
        { id: 'preset-2', name: 'aggressive', description: 'High exploration' },
        { id: 'preset-3', name: 'balanced', description: 'Balanced approach' }
      ]);

      const res = await request(app)
        .get('/api/algorithm-config/presets')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/algorithm-config/presets');

      expect(res.status).toBe(401);
    });
  });
});
