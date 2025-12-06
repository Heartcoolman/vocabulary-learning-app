/**
 * Admin Routes Integration Tests
 *
 * Tests for admin API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockAdminService } = vi.hoisted(() => ({
  mockAdminService: {
    getAllUsers: vi.fn(),
    getUserById: vi.fn(),
    getUserLearningData: vi.fn(),
    getUserDetailedStatistics: vi.fn(),
    exportUserWords: vi.fn(),
    getUserWords: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    getSystemWordBooks: vi.fn(),
    createSystemWordBook: vi.fn(),
    updateSystemWordBook: vi.fn(),
    deleteSystemWordBook: vi.fn(),
    batchAddWordsToSystemWordBook: vi.fn(),
    getWordLearningHistory: vi.fn(),
    getWordScoreHistory: vi.fn(),
    getUserLearningHeatmap: vi.fn(),
    flagAnomalyRecord: vi.fn(),
    getAnomalyFlags: vi.fn(),
    getStatistics: vi.fn(),
    getUserDecisions: vi.fn(),
    getDecisionDetail: vi.fn()
  }
}));

vi.mock('../../../src/services/admin.service', () => ({
  default: mockAdminService
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer valid-token') {
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

describe('Admin API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/admin/users ====================

  describe('GET /api/admin/users', () => {
    it('should return paginated user list', async () => {
      mockAdminService.getAllUsers.mockResolvedValue({
        users: [
          { id: 'user-1', username: 'user1', email: 'user1@example.com' },
          { id: 'user-2', username: 'user2', email: 'user2@example.com' }
        ],
        total: 2,
        page: 1,
        pageSize: 20
      });

      const res = await request(app)
        .get('/api/admin/users?page=1&pageSize=20')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toHaveLength(2);
    });

    it('should support search parameter', async () => {
      mockAdminService.getAllUsers.mockResolvedValue({
        users: [{ id: 'user-1', username: 'testuser' }],
        total: 1
      });

      const res = await request(app)
        .get('/api/admin/users?search=test')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockAdminService.getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test' })
      );
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/admin/users');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/admin/users/:id ====================

  describe('GET /api/admin/users/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return user details', async () => {
      mockAdminService.getUserById.mockResolvedValue({
        id: validId,
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER'
      });

      const res = await request(app)
        .get(`/api/admin/users/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('testuser');
    });

    it('should handle user not found', async () => {
      mockAdminService.getUserById.mockRejectedValue(new Error('用户不存在'));

      const res = await request(app)
        .get(`/api/admin/users/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect([404, 500]).toContain(res.status);
    });
  });

  // ==================== PUT /api/admin/users/:id/role ====================

  describe('PUT /api/admin/users/:id/role', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should update user role', async () => {
      mockAdminService.updateUserRole.mockResolvedValue({
        id: validId,
        role: 'ADMIN'
      });

      const res = await request(app)
        .put(`/api/admin/users/${validId}/role`)
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('ADMIN');
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${validId}/role`)
        .set('Authorization', 'Bearer valid-token')
        .send({ role: 'INVALID_ROLE' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== DELETE /api/admin/users/:id ====================

  describe('DELETE /api/admin/users/:id', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should delete user', async () => {
      mockAdminService.deleteUser.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/admin/users/${validId}`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('删除成功');
    });
  });

  // ==================== GET /api/admin/wordbooks ====================

  describe('GET /api/admin/wordbooks', () => {
    it('should return system wordbooks', async () => {
      mockAdminService.getSystemWordBooks.mockResolvedValue([
        { id: 'wb-1', name: 'CET4', wordCount: 4000 },
        { id: 'wb-2', name: 'CET6', wordCount: 6000 }
      ]);

      const res = await request(app)
        .get('/api/admin/wordbooks')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  // ==================== POST /api/admin/wordbooks ====================

  describe('POST /api/admin/wordbooks', () => {
    it('should create system wordbook', async () => {
      mockAdminService.createSystemWordBook.mockResolvedValue({
        id: 'new-wb-id',
        name: 'TOEFL',
        description: 'TOEFL vocabulary',
        isSystem: true
      });

      const res = await request(app)
        .post('/api/admin/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'TOEFL', description: 'TOEFL vocabulary' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('TOEFL');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/admin/wordbooks')
        .set('Authorization', 'Bearer valid-token')
        .send({ description: 'test' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/admin/statistics ====================

  describe('GET /api/admin/statistics', () => {
    it('should return system statistics', async () => {
      mockAdminService.getStatistics.mockResolvedValue({
        totalUsers: 1000,
        activeUsers: 500,
        totalWords: 50000,
        totalLearningRecords: 1000000
      });

      const res = await request(app)
        .get('/api/admin/statistics')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalUsers).toBe(1000);
    });
  });

  // ==================== GET /api/admin/users/:id/decisions ====================

  describe('GET /api/admin/users/:id/decisions', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return user decisions', async () => {
      mockAdminService.getUserDecisions.mockResolvedValue({
        decisions: [
          { id: 'd-1', timestamp: new Date(), confidence: 0.9 }
        ],
        total: 1
      });

      const res = await request(app)
        .get(`/api/admin/users/${validId}/decisions`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== POST /api/admin/wordbooks/:id/words/batch ====================

  describe('POST /api/admin/wordbooks/:id/words/batch', () => {
    const validId = '123e4567-e89b-12d3-a456-426614174000';
    const batchWords = [
      { spelling: 'apple', phonetic: '/æpl/', meanings: ['苹果'], examples: ['I ate an apple.'] },
      { spelling: 'banana', phonetic: '/bəˈnænə/', meanings: ['香蕉'], examples: ['The banana is yellow.'] }
    ];

    it('should batch add words to system wordbook', async () => {
      mockAdminService.batchAddWordsToSystemWordBook.mockResolvedValue(batchWords);

      const res = await request(app)
        .post(`/api/admin/wordbooks/${validId}/words/batch`)
        .set('Authorization', 'Bearer valid-token')
        .send({ words: batchWords });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(2);
    });

    it('should return 400 for empty words array', async () => {
      const res = await request(app)
        .post(`/api/admin/wordbooks/${validId}/words/batch`)
        .set('Authorization', 'Bearer valid-token')
        .send({ words: [] });

      expect(res.status).toBe(400);
    });
  });
});
