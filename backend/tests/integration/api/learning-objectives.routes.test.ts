/**
 * Learning Objectives Routes Integration Tests
 *
 * Tests for learning objectives management API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockLearningObjectivesService } = vi.hoisted(() => ({
  mockLearningObjectivesService: {
    getUserObjectives: vi.fn(),
    upsertUserObjectives: vi.fn(),
    switchMode: vi.fn(),
    getSuggestions: vi.fn(),
    getObjectiveHistory: vi.fn(),
    deleteUserObjectives: vi.fn()
  }
}));

vi.mock('../../../src/services/learning-objectives.service', () => ({
  LearningObjectivesService: mockLearningObjectivesService
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
  }
}));

import app from '../../../src/app';

describe('Learning Objectives API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/learning-objectives ====================

  describe('GET /api/learning-objectives', () => {
    it('should return user learning objectives', async () => {
      mockLearningObjectivesService.getUserObjectives.mockResolvedValue({
        id: 'obj-1',
        userId: 'test-user-id',
        mode: 'daily',
        primaryObjective: 'retention',
        minAccuracy: 0.8,
        maxDailyTime: 30,
        targetRetention: 0.85,
        weightShortTerm: 0.3,
        weightLongTerm: 0.5,
        weightEfficiency: 0.2
      });

      const res = await request(app)
        .get('/api/learning-objectives')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('daily');
      expect(res.body.data.primaryObjective).toBe('retention');
    });

    it('should return 404 when objectives not configured', async () => {
      mockLearningObjectivesService.getUserObjectives.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/learning-objectives')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('未配置');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/learning-objectives');

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/learning-objectives ====================

  describe('PUT /api/learning-objectives', () => {
    const validObjectives = {
      mode: 'exam',
      primaryObjective: 'speed',
      minAccuracy: 0.9,
      maxDailyTime: 60,
      targetRetention: 0.95,
      weightShortTerm: 0.6,
      weightLongTerm: 0.2,
      weightEfficiency: 0.2
    };

    it('should create or update learning objectives', async () => {
      mockLearningObjectivesService.upsertUserObjectives.mockResolvedValue({
        id: 'obj-1',
        userId: 'test-user-id',
        ...validObjectives,
        updatedAt: new Date().toISOString()
      });

      const res = await request(app)
        .put('/api/learning-objectives')
        .set('Authorization', 'Bearer valid-token')
        .send(validObjectives);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('exam');
      expect(mockLearningObjectivesService.upsertUserObjectives).toHaveBeenCalledWith({
        userId: 'test-user-id',
        ...validObjectives
      });
    });

    it('should update partial objectives', async () => {
      mockLearningObjectivesService.upsertUserObjectives.mockResolvedValue({
        id: 'obj-1',
        mode: 'daily',
        minAccuracy: 0.85
      });

      const res = await request(app)
        .put('/api/learning-objectives')
        .set('Authorization', 'Bearer valid-token')
        .send({ minAccuracy: 0.85 });

      expect(res.status).toBe(200);
      expect(mockLearningObjectivesService.upsertUserObjectives).toHaveBeenCalled();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/learning-objectives')
        .send(validObjectives);

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/learning-objectives/switch-mode ====================

  describe('POST /api/learning-objectives/switch-mode', () => {
    it('should switch to exam mode', async () => {
      mockLearningObjectivesService.switchMode.mockResolvedValue({
        id: 'obj-1',
        mode: 'exam',
        primaryObjective: 'speed',
        minAccuracy: 0.9
      });

      const res = await request(app)
        .post('/api/learning-objectives/switch-mode')
        .set('Authorization', 'Bearer valid-token')
        .send({ mode: 'exam', reason: 'upcoming test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('exam');
      expect(res.body.message).toContain('exam');
      expect(mockLearningObjectivesService.switchMode).toHaveBeenCalledWith(
        'test-user-id',
        'exam',
        'upcoming test'
      );
    });

    it('should switch to daily mode', async () => {
      mockLearningObjectivesService.switchMode.mockResolvedValue({
        mode: 'daily'
      });

      const res = await request(app)
        .post('/api/learning-objectives/switch-mode')
        .set('Authorization', 'Bearer valid-token')
        .send({ mode: 'daily' });

      expect(res.status).toBe(200);
      expect(mockLearningObjectivesService.switchMode).toHaveBeenCalledWith(
        'test-user-id',
        'daily',
        'manual'
      );
    });

    it('should switch to travel mode', async () => {
      mockLearningObjectivesService.switchMode.mockResolvedValue({
        mode: 'travel'
      });

      const res = await request(app)
        .post('/api/learning-objectives/switch-mode')
        .set('Authorization', 'Bearer valid-token')
        .send({ mode: 'travel' });

      expect(res.status).toBe(200);
    });

    it('should switch to custom mode', async () => {
      mockLearningObjectivesService.switchMode.mockResolvedValue({
        mode: 'custom'
      });

      const res = await request(app)
        .post('/api/learning-objectives/switch-mode')
        .set('Authorization', 'Bearer valid-token')
        .send({ mode: 'custom' });

      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid mode', async () => {
      const res = await request(app)
        .post('/api/learning-objectives/switch-mode')
        .set('Authorization', 'Bearer valid-token')
        .send({ mode: 'invalid_mode' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('无效');
    });
  });

  // ==================== GET /api/learning-objectives/suggestions ====================

  describe('GET /api/learning-objectives/suggestions', () => {
    it('should return mode suggestions', async () => {
      mockLearningObjectivesService.getSuggestions.mockResolvedValue({
        recommended: 'daily',
        reasons: [
          'Based on your learning patterns',
          'Optimal for long-term retention'
        ],
        alternatives: [
          { mode: 'exam', reason: 'If you have upcoming tests' },
          { mode: 'travel', reason: 'For quick review sessions' }
        ]
      });

      const res = await request(app)
        .get('/api/learning-objectives/suggestions')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recommended).toBe('daily');
      expect(res.body.data.reasons).toHaveLength(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/learning-objectives/suggestions');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/learning-objectives/history ====================

  describe('GET /api/learning-objectives/history', () => {
    it('should return objective history', async () => {
      mockLearningObjectivesService.getObjectiveHistory.mockResolvedValue([
        { id: 'h1', mode: 'exam', switchedAt: new Date().toISOString(), reason: 'test prep' },
        { id: 'h2', mode: 'daily', switchedAt: new Date().toISOString(), reason: 'auto' },
        { id: 'h3', mode: 'travel', switchedAt: new Date().toISOString(), reason: 'vacation' }
      ]);

      const res = await request(app)
        .get('/api/learning-objectives/history')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it('should respect limit parameter', async () => {
      mockLearningObjectivesService.getObjectiveHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/learning-objectives/history?limit=5')
        .set('Authorization', 'Bearer valid-token');

      expect(mockLearningObjectivesService.getObjectiveHistory).toHaveBeenCalledWith(
        'test-user-id',
        5
      );
    });

    it('should use default limit of 10', async () => {
      mockLearningObjectivesService.getObjectiveHistory.mockResolvedValue([]);

      await request(app)
        .get('/api/learning-objectives/history')
        .set('Authorization', 'Bearer valid-token');

      expect(mockLearningObjectivesService.getObjectiveHistory).toHaveBeenCalledWith(
        'test-user-id',
        10
      );
    });
  });

  // ==================== DELETE /api/learning-objectives ====================

  describe('DELETE /api/learning-objectives', () => {
    it('should delete user learning objectives', async () => {
      mockLearningObjectivesService.deleteUserObjectives.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/learning-objectives')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('已删除');
      expect(mockLearningObjectivesService.deleteUserObjectives).toHaveBeenCalledWith(
        'test-user-id'
      );
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).delete('/api/learning-objectives');

      expect(res.status).toBe(401);
    });
  });
});
