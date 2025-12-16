/**
 * v1 Sessions Routes Integration Tests
 *
 * Focus: correct HTTP status codes for "session not found" scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock auth middleware
vi.mock('../../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', username: 'testuser' };
    }
    next();
  },
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    learningSession: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../../../src/config/database', () => ({
  default: prismaMock,
}));

import sessionsRoutes from '../../../../src/routes/v1/sessions.routes';
import { errorHandler } from '../../../../src/middleware/error.middleware';
import prisma from '../../../../src/config/database';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/sessions', sessionsRoutes);
  app.use(errorHandler);
  return app;
}

describe('v1 Sessions API Routes', () => {
  const validToken = 'valid-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/sessions/:sessionId', () => {
    it('should return 404 when session does not exist', async () => {
      (prisma.learningSession.findFirst as any).mockResolvedValue(null);

      const res = await request(createTestApp())
        .get('/api/v1/sessions/session-404')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/v1/sessions/:sessionId/progress', () => {
    it('should return 404 when session does not exist', async () => {
      (prisma.learningSession.updateMany as any).mockResolvedValue({ count: 0 });

      const res = await request(createTestApp())
        .put('/api/v1/sessions/session-404/progress')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ actualMasteryCount: 1, totalQuestions: 1 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
