/**
 * User Routes Integration Tests
 *
 * Tests for user API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockUserService } = vi.hoisted(() => ({
  mockUserService: {
    getUserById: vi.fn(),
    updatePassword: vi.fn(),
    getUserStatistics: vi.fn(),
    updateRewardProfile: vi.fn()
  }
}));

const { mockChronotypeDetector, mockLearningStyleProfiler } = vi.hoisted(() => ({
  mockChronotypeDetector: {
    analyzeChronotype: vi.fn()
  },
  mockLearningStyleProfiler: {
    detectLearningStyle: vi.fn()
  }
}));

vi.mock('../../../src/services/user.service', () => ({
  default: mockUserService
}));

vi.mock('../../../src/amas/modeling/chronotype', () => ({
  ChronotypeDetector: class MockChronotypeDetector {
    analyzeChronotype = mockChronotypeDetector.analyzeChronotype;
    isCurrentlyPeakTime = vi.fn().mockReturnValue(true);
    getNextPeakTime = vi.fn().mockReturnValue(9);
  }
}));

vi.mock('../../../src/amas/modeling/learning-style', () => ({
  LearningStyleProfiler: class MockLearningStyleProfiler {
    detectLearningStyle = mockLearningStyleProfiler.detectLearningStyle;
  }
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

describe('User API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/users/me ====================

  describe('GET /api/users/me', () => {
    it('should return current user info', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
        rewardProfile: 'standard'
      });

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('testuser');
      expect(mockUserService.getUserById).toHaveBeenCalledWith('test-user-id');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/me');

      expect(res.status).toBe(401);
    });

    it('should handle user not found', async () => {
      mockUserService.getUserById.mockRejectedValue(new Error('用户不存在'));

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer valid-token');

      expect([404, 500]).toContain(res.status);
    });
  });

  // ==================== PUT /api/users/me/password ====================

  describe('PUT /api/users/me/password', () => {
    // Schema requires 'oldPassword' (not 'currentPassword') and password must be:
    // - at least 10 characters
    // - contain letters, numbers, and special characters
    const validPasswordUpdate = {
      oldPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!'
    };

    it('should update password successfully', async () => {
      mockUserService.updatePassword.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', 'Bearer valid-token')
        .send(validPasswordUpdate);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('密码修改成功');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/users/me/password')
        .send(validPasswordUpdate);

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid password format', async () => {
      const res = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', 'Bearer valid-token')
        .send({ oldPassword: 'old', newPassword: '123' });

      expect(res.status).toBe(400);
    });

    it('should handle incorrect current password', async () => {
      mockUserService.updatePassword.mockRejectedValue(new Error('当前密码错误'));

      const res = await request(app)
        .put('/api/users/me/password')
        .set('Authorization', 'Bearer valid-token')
        .send(validPasswordUpdate);

      expect([400, 401, 500]).toContain(res.status);
    });
  });

  // ==================== GET /api/users/me/statistics ====================

  describe('GET /api/users/me/statistics', () => {
    it('should return user statistics', async () => {
      mockUserService.getUserStatistics.mockResolvedValue({
        totalWords: 100,
        masteredWords: 50,
        learningDays: 30,
        streak: 7
      });

      const res = await request(app)
        .get('/api/users/me/statistics')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalWords).toBe(100);
      expect(mockUserService.getUserStatistics).toHaveBeenCalledWith('test-user-id');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/me/statistics');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/users/profile/reward ====================

  describe('GET /api/users/profile/reward', () => {
    it('should return user reward profile', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 'test-user-id',
        username: 'testuser',
        rewardProfile: 'standard'
      });

      const res = await request(app)
        .get('/api/users/profile/reward')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentProfile).toBe('standard');
      expect(res.body.data.availableProfiles).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/reward');

      expect(res.status).toBe(401);
    });
  });

  // ==================== PUT /api/users/profile/reward ====================

  describe('PUT /api/users/profile/reward', () => {
    it('should update reward profile', async () => {
      mockUserService.updateRewardProfile.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/profile/reward')
        .set('Authorization', 'Bearer valid-token')
        .send({ profileId: 'cram' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentProfile).toBe('cram');
    });

    it('should return 400 for invalid profile ID', async () => {
      const res = await request(app)
        .put('/api/users/profile/reward')
        .set('Authorization', 'Bearer valid-token')
        .send({ profileId: 'invalid-profile' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .put('/api/users/profile/reward')
        .send({ profileId: 'standard' });

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/users/profile/chronotype ====================

  describe('GET /api/users/profile/chronotype', () => {
    it('should return user chronotype profile', async () => {
      mockChronotypeDetector.analyzeChronotype.mockResolvedValue({
        type: 'morning',
        peakHours: [9, 10, 11],
        confidence: 0.8
      });

      const res = await request(app)
        .get('/api/users/profile/chronotype')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('morning');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/chronotype');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/users/profile/learning-style ====================

  describe('GET /api/users/profile/learning-style', () => {
    it('should return user learning style', async () => {
      mockLearningStyleProfiler.detectLearningStyle.mockResolvedValue({
        dominantStyle: 'visual',
        styles: { visual: 0.6, auditory: 0.3, kinesthetic: 0.1 }
      });

      const res = await request(app)
        .get('/api/users/profile/learning-style')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dominantStyle).toBe('visual');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/users/profile/learning-style');

      expect(res.status).toBe(401);
    });
  });
});
