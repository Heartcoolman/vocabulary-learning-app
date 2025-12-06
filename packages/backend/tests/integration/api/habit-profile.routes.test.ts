/**
 * Habit Profile Routes Integration Tests
 *
 * Tests for habit profile API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockHabitProfileService } = vi.hoisted(() => ({
  mockHabitProfileService: {
    recordSessionEnd: vi.fn(),
    getHabitProfile: vi.fn(),
    persistHabitProfile: vi.fn(),
    initializeFromHistory: vi.fn(),
    resetUser: vi.fn()
  }
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    learningSession: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    habitProfile: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock('../../../src/services/habit-profile.service', () => ({
  habitProfileService: mockHabitProfileService
}));

vi.mock('../../../src/config/database', () => ({
  default: mockPrisma
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

describe('Habit Profile API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST /api/habit-profile/end-session ====================

  describe('POST /api/habit-profile/end-session', () => {
    it('should end session and persist habit profile', async () => {
      const sessionStart = new Date(Date.now() - 30 * 60000); // 30 minutes ago

      mockPrisma.learningSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'test-user-id',
        startedAt: sessionStart,
        _count: { answerRecords: 20 }
      });

      mockPrisma.learningSession.update.mockResolvedValue({});

      mockHabitProfileService.getHabitProfile.mockReturnValue({
        samples: { timeEvents: 15 },
        preferredTimeSlots: ['morning', 'evening']
      });

      mockHabitProfileService.persistHabitProfile.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionEnded).toBe(true);
      expect(res.body.data.habitProfileSaved).toBe(true);
    });

    it('should return 400 for missing sessionId', async () => {
      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent session', async () => {
      mockPrisma.learningSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'nonexistent' });

      expect(res.status).toBe(404);
    });

    it('should return 403 for session belonging to another user', async () => {
      mockPrisma.learningSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'other-user-id',
        startedAt: new Date(),
        _count: { answerRecords: 10 }
      });

      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-1' });

      expect(res.status).toBe(403);
    });

    it('should indicate insufficient samples', async () => {
      const sessionStart = new Date(Date.now() - 10 * 60000);

      mockPrisma.learningSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'test-user-id',
        startedAt: sessionStart,
        _count: { answerRecords: 5 }
      });

      mockPrisma.learningSession.update.mockResolvedValue({});

      mockHabitProfileService.getHabitProfile.mockReturnValue({
        samples: { timeEvents: 3 },
        preferredTimeSlots: []
      });

      mockHabitProfileService.persistHabitProfile.mockResolvedValue(false);

      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-1' });

      expect(res.status).toBe(200);
      expect(res.body.data.habitProfileSaved).toBe(false);
      expect(res.body.data.habitProfileMessage).toContain('样本不足');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/habit-profile/end-session')
        .send({ sessionId: 'session-1' });

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/habit-profile ====================

  describe('GET /api/habit-profile', () => {
    it('should return habit profile', async () => {
      mockPrisma.habitProfile.findUnique.mockResolvedValue({
        userId: 'test-user-id',
        timePref: [0.1, 0.2, 0.3],
        rhythmPref: { preferred: 'steady' },
        updatedAt: new Date()
      });

      mockHabitProfileService.getHabitProfile.mockReturnValue({
        timePref: [0.1, 0.2, 0.3],
        preferredTimeSlots: ['morning'],
        rhythmPref: { preferred: 'steady' },
        samples: { timeEvents: 20 }
      });

      const res = await request(app)
        .get('/api/habit-profile')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stored).toBeDefined();
      expect(res.body.data.realtime).toBeDefined();
    });

    it('should return null stored when no profile exists', async () => {
      mockPrisma.habitProfile.findUnique.mockResolvedValue(null);

      mockHabitProfileService.getHabitProfile.mockReturnValue({
        timePref: [],
        preferredTimeSlots: [],
        rhythmPref: {},
        samples: { timeEvents: 0 }
      });

      const res = await request(app)
        .get('/api/habit-profile')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.stored).toBeNull();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/habit-profile');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/habit-profile/initialize ====================

  describe('POST /api/habit-profile/initialize', () => {
    it('should initialize habit profile from history', async () => {
      mockHabitProfileService.resetUser.mockReturnValue(undefined);
      mockHabitProfileService.initializeFromHistory.mockResolvedValue(undefined);
      mockHabitProfileService.persistHabitProfile.mockResolvedValue(true);
      mockHabitProfileService.getHabitProfile.mockReturnValue({
        preferredTimeSlots: ['morning', 'evening'],
        rhythmPref: { preferred: 'steady' },
        samples: { timeEvents: 50 }
      });

      const res = await request(app)
        .post('/api/habit-profile/initialize')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.initialized).toBe(true);
      expect(res.body.data.saved).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/habit-profile/initialize');

      expect(res.status).toBe(401);
    });
  });

  // ==================== POST /api/habit-profile/persist ====================

  describe('POST /api/habit-profile/persist', () => {
    it('should persist habit profile', async () => {
      mockHabitProfileService.persistHabitProfile.mockResolvedValue(true);
      mockHabitProfileService.getHabitProfile.mockReturnValue({
        preferredTimeSlots: ['afternoon'],
        rhythmPref: { preferred: 'burst' },
        samples: { timeEvents: 25 }
      });

      const res = await request(app)
        .post('/api/habit-profile/persist')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.saved).toBe(true);
    });

    it('should indicate when save fails', async () => {
      mockHabitProfileService.persistHabitProfile.mockResolvedValue(false);
      mockHabitProfileService.getHabitProfile.mockReturnValue({
        preferredTimeSlots: [],
        rhythmPref: {},
        samples: { timeEvents: 5 }
      });

      const res = await request(app)
        .post('/api/habit-profile/persist')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.saved).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/habit-profile/persist');

      expect(res.status).toBe(401);
    });
  });
});
