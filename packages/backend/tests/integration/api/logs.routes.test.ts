/**
 * Logs Routes Integration Tests
 *
 * Tests for frontend log receiving API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

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

describe('Logs API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/logs ====================

  describe('POST /api/logs', () => {
    const validLogBatch = {
      logs: [
        {
          level: 'info',
          msg: 'User clicked button',
          time: new Date().toISOString(),
          app: 'words-flashback',
          env: 'production',
          module: 'ui'
        },
        {
          level: 'error',
          msg: 'Failed to load data',
          time: new Date().toISOString(),
          app: 'words-flashback',
          env: 'production',
          module: 'api',
          err: {
            message: 'Network error',
            name: 'NetworkError',
            stack: 'Error: Network error\n    at fetch'
          }
        }
      ]
    };

    it('should accept valid log batch from authenticated user', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send(validLogBatch);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.received).toBe(2);
    });

    it('should accept logs from unauthenticated user', async () => {
      const res = await request(app)
        .post('/api/logs')
        .send(validLogBatch);

      // 未认证用户的日志也会被处理（使用 optionalAuthMiddleware）
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.received).toBe(2);
    });

    it('should return 400 for invalid log format', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({ logs: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid log level', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({
          logs: [{
            level: 'invalid-level',
            msg: 'Test',
            time: new Date().toISOString(),
            app: 'test',
            env: 'test'
          }]
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({
          logs: [{
            level: 'info',
            msg: 'Test'
            // missing time, app, env
          }]
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for too many logs in batch', async () => {
      const tooManyLogs = Array(101).fill({
        level: 'info',
        msg: 'Test',
        time: new Date().toISOString(),
        app: 'test',
        env: 'test'
      });

      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({ logs: tooManyLogs });

      expect(res.status).toBe(400);
    });

    it('should return 400 for message exceeding max length', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({
          logs: [{
            level: 'info',
            msg: 'a'.repeat(10001),
            time: new Date().toISOString(),
            app: 'test',
            env: 'test'
          }]
        });

      expect(res.status).toBe(400);
    });

    it('should accept all valid log levels', async () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

      for (const level of levels) {
        const res = await request(app)
          .post('/api/logs')
          .set('Authorization', 'Bearer valid-token')
          .send({
            logs: [{
              level,
              msg: `Test ${level} log`,
              time: new Date().toISOString(),
              app: 'test',
              env: 'test'
            }]
          });

        expect(res.status).toBe(202);
      }
    });

    it('should accept logs with optional context', async () => {
      const res = await request(app)
        .post('/api/logs')
        .set('Authorization', 'Bearer valid-token')
        .send({
          logs: [{
            level: 'info',
            msg: 'Test with context',
            time: new Date().toISOString(),
            app: 'test',
            env: 'test',
            module: 'test-module',
            context: { key: 'value', nested: { data: true } }
          }]
        });

      expect(res.status).toBe(202);
    });
  });

  // ==================== GET /api/logs/health ====================

  describe('GET /api/logs/health', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/api/logs/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should not require authentication', async () => {
      const res = await request(app)
        .get('/api/logs/health');

      expect(res.status).toBe(200);
    });
  });
});
