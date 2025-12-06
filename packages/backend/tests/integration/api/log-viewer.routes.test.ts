/**
 * Log Viewer Routes Integration Tests
 *
 * Tests for log viewer and alert rule management API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    systemLog: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn()
    },
    logAlertRule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}));

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
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

describe('Log Viewer API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/admin/logs ====================

  describe('GET /api/admin/logs', () => {
    it('should return paginated logs', async () => {
      mockPrisma.systemLog.count.mockResolvedValue(100);
      mockPrisma.systemLog.findMany.mockResolvedValue([
        { id: 'log-1', level: 'INFO', message: 'Test log 1', timestamp: new Date() },
        { id: 'log-2', level: 'ERROR', message: 'Test log 2', timestamp: new Date() }
      ]);

      const res = await request(app)
        .get('/api/admin/logs?page=1&pageSize=20')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(100);
    });

    it('should support level filter', async () => {
      mockPrisma.systemLog.count.mockResolvedValue(10);
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin/logs?level=ERROR')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
    });

    it('should support message pattern search', async () => {
      mockPrisma.systemLog.count.mockResolvedValue(5);
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin/logs?messagePattern=error')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
    });

    it('should support time range filter', async () => {
      mockPrisma.systemLog.count.mockResolvedValue(0);
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin/logs?startTime=2024-01-01T00:00:00Z&endTime=2024-01-31T23:59:59Z')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/admin/logs');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/admin/logs/stats ====================

  describe('GET /api/admin/logs/stats', () => {
    it('should return log statistics', async () => {
      mockPrisma.systemLog.count.mockResolvedValue(1000);
      mockPrisma.systemLog.groupBy.mockImplementation(({ by }: { by: string[] }) => {
        if (by[0] === 'level') {
          return Promise.resolve([
            { level: 'INFO', _count: { id: 700 } },
            { level: 'ERROR', _count: { id: 200 } },
            { level: 'WARN', _count: { id: 100 } }
          ]);
        }
        if (by[0] === 'source') {
          return Promise.resolve([
            { source: 'BACKEND', _count: { id: 800 } },
            { source: 'FRONTEND', _count: { id: 200 } }
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .get('/api/admin/logs/stats')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(1000);
      expect(res.body.data.errorCount).toBe(200);
    });
  });

  // ==================== GET /api/admin/logs/modules ====================

  describe('GET /api/admin/logs/modules', () => {
    it('should return module list', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([
        { module: 'auth' },
        { module: 'learning' },
        { module: 'admin' }
      ]);

      const res = await request(app)
        .get('/api/admin/logs/modules')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toContain('auth');
    });

    it('should support search filter', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([
        { module: 'auth-service' }
      ]);

      const res = await request(app)
        .get('/api/admin/logs/modules?search=auth')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
    });
  });

  // ==================== GET /api/admin/logs/:id ====================

  describe('GET /api/admin/logs/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return log details', async () => {
      mockPrisma.systemLog.findUnique.mockResolvedValue({
        id: validId,
        level: 'ERROR',
        message: 'Test error',
        context: { userId: 'user-1' },
        timestamp: new Date()
      });

      const res = await request(app)
        .get(`/api/admin/logs/${validId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(validId);
    });

    it('should return 404 for non-existent log', async () => {
      mockPrisma.systemLog.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/admin/logs/${validId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
    });
  });

  // ==================== GET /api/admin/logs/log-alerts ====================

  describe('GET /api/admin/logs/log-alerts', () => {
    it('should return alert rules', async () => {
      mockPrisma.logAlertRule.findMany.mockResolvedValue([
        { id: 'rule-1', name: 'High Error Rate', enabled: true },
        { id: 'rule-2', name: 'Slow Response', enabled: false }
      ]);

      const res = await request(app)
        .get('/api/admin/logs/log-alerts')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  // ==================== POST /api/admin/logs/log-alerts ====================

  describe('POST /api/admin/logs/log-alerts', () => {
    const validRule = {
      name: 'New Alert Rule',
      description: 'Test description',
      enabled: true,
      levels: ['ERROR'],
      threshold: 10,
      windowMinutes: 5,
      cooldownMinutes: 30
    };

    it('should create alert rule', async () => {
      mockPrisma.logAlertRule.create.mockResolvedValue({
        id: 'new-rule-id',
        ...validRule,
        createdAt: new Date()
      });

      const res = await request(app)
        .post('/api/admin/logs/log-alerts')
        .set('Authorization', 'Bearer admin-token')
        .send(validRule);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Alert Rule');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/admin/logs/log-alerts')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validRule, name: '' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for empty levels array', async () => {
      const res = await request(app)
        .post('/api/admin/logs/log-alerts')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validRule, levels: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid windowMinutes', async () => {
      const res = await request(app)
        .post('/api/admin/logs/log-alerts')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validRule, windowMinutes: 2000 });

      expect(res.status).toBe(400);
    });
  });

  // ==================== PUT /api/admin/logs/log-alerts/:id ====================

  describe('PUT /api/admin/logs/log-alerts/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should update alert rule', async () => {
      mockPrisma.logAlertRule.findUnique.mockResolvedValue({
        id: validId,
        name: 'Old Name'
      });

      mockPrisma.logAlertRule.update.mockResolvedValue({
        id: validId,
        name: 'Updated Name',
        enabled: false
      });

      const res = await request(app)
        .put(`/api/admin/logs/log-alerts/${validId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ name: 'Updated Name', enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should return 404 for non-existent rule', async () => {
      mockPrisma.logAlertRule.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/admin/logs/log-alerts/${validId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  // ==================== DELETE /api/admin/logs/log-alerts/:id ====================

  describe('DELETE /api/admin/logs/log-alerts/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete alert rule', async () => {
      mockPrisma.logAlertRule.findUnique.mockResolvedValue({
        id: validId,
        name: 'To Delete'
      });

      mockPrisma.logAlertRule.delete.mockResolvedValue({});

      const res = await request(app)
        .delete(`/api/admin/logs/log-alerts/${validId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('删除成功');
    });

    it('should return 404 for non-existent rule', async () => {
      mockPrisma.logAlertRule.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/admin/logs/log-alerts/${validId}`)
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
    });
  });
});
