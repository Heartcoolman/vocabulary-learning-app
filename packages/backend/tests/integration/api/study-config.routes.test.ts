/**
 * Study Config Routes Integration Tests
 *
 * Tests for study configuration API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockStudyConfigService } = vi.hoisted(() => ({
  mockStudyConfigService: {
    getUserStudyConfig: vi.fn(),
    updateStudyConfig: vi.fn(),
    getTodayWords: vi.fn(),
    getStudyProgress: vi.fn()
  }
}));

vi.mock('../../../src/services/study-config.service', () => ({
  default: mockStudyConfigService
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

describe('Study Config API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/study-config ====================

  describe('GET /api/study-config', () => {
    it('should return user study config', async () => {
      mockStudyConfigService.getUserStudyConfig.mockResolvedValue({
        selectedWordBookIds: ['wb-1', 'wb-2'],
        dailyWordCount: 30,
        studyMode: 'mixed'
      });

      const res = await request(app)
        .get('/api/study-config')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dailyWordCount).toBe(30);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/study-config');

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/study-config ====================

  describe('PUT /api/study-config', () => {
    const validConfig = {
      selectedWordBookIds: ['wb-1', 'wb-2'],
      dailyWordCount: 50,
      studyMode: 'sequential'
    };

    it('should update study config', async () => {
      mockStudyConfigService.updateStudyConfig.mockResolvedValue({
        ...validConfig,
        updatedAt: new Date()
      });

      const res = await request(app)
        .put('/api/study-config')
        .set('Authorization', 'Bearer valid-token')
        .send(validConfig);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dailyWordCount).toBe(50);
    });

    it('should return 400 for non-array selectedWordBookIds', async () => {
      const res = await request(app)
        .put('/api/study-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validConfig, selectedWordBookIds: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 400 for dailyWordCount below 10', async () => {
      const res = await request(app)
        .put('/api/study-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validConfig, dailyWordCount: 5 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for dailyWordCount above 100', async () => {
      const res = await request(app)
        .put('/api/study-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validConfig, dailyWordCount: 150 });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid studyMode', async () => {
      const res = await request(app)
        .put('/api/study-config')
        .set('Authorization', 'Bearer valid-token')
        .send({ ...validConfig, studyMode: 'invalid-mode' });

      expect(res.status).toBe(400);
    });

    it('should accept all valid study modes', async () => {
      const validModes = ['sequential', 'random', 'new', 'review', 'mixed'];

      for (const mode of validModes) {
        mockStudyConfigService.updateStudyConfig.mockResolvedValue({
          ...validConfig,
          studyMode: mode
        });

        const res = await request(app)
          .put('/api/study-config')
          .set('Authorization', 'Bearer valid-token')
          .send({ ...validConfig, studyMode: mode });

        expect(res.status).toBe(200);
      }
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/study-config')
        .send(validConfig);

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/study-config/today-words ====================

  describe('GET /api/study-config/today-words', () => {
    it('should return today words', async () => {
      mockStudyConfigService.getTodayWords.mockResolvedValue({
        words: [
          { id: 'w-1', spelling: 'apple', meanings: ['苹果'] },
          { id: 'w-2', spelling: 'banana', meanings: ['香蕉'] }
        ],
        newCount: 10,
        reviewCount: 20,
        totalTarget: 30
      });

      const res = await request(app)
        .get('/api/study-config/today-words')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.words).toHaveLength(2);
    });

    it('should return empty array when no words scheduled', async () => {
      mockStudyConfigService.getTodayWords.mockResolvedValue({
        words: [],
        newCount: 0,
        reviewCount: 0,
        totalTarget: 30
      });

      const res = await request(app)
        .get('/api/study-config/today-words')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.words).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/study-config/today-words');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/study-config/progress ====================

  describe('GET /api/study-config/progress', () => {
    it('should return study progress', async () => {
      mockStudyConfigService.getStudyProgress.mockResolvedValue({
        todayCompleted: 15,
        todayTarget: 30,
        weeklyCompleted: 150,
        weeklyTarget: 210,
        totalMastered: 500,
        totalWords: 1000,
        streak: 7
      });

      const res = await request(app)
        .get('/api/study-config/progress')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.todayCompleted).toBe(15);
      expect(res.body.data.streak).toBe(7);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/study-config/progress');

      expect(res.status).toBe(401);
    });
  });
});
