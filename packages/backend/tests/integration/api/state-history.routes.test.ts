/**
 * State History Routes Integration Tests
 *
 * Tests for state history and cognitive growth API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockStateHistoryService } = vi.hoisted(() => ({
  mockStateHistoryService: {
    getStateHistory: vi.fn(),
    getHistorySummary: vi.fn(),
    getCognitiveGrowth: vi.fn(),
    getSignificantChanges: vi.fn()
  }
}));

vi.mock('../../../src/services/state-history.service', () => ({
  stateHistoryService: mockStateHistoryService,
  DateRangeOption: {} // mock type
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

describe('State History API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/amas/history ====================

  describe('GET /api/amas/history', () => {
    it('should return state history', async () => {
      mockStateHistoryService.getStateHistory.mockResolvedValue([
        {
          date: new Date('2024-01-01'),
          attention: 0.8,
          fatigue: 0.2,
          motivation: 0.7,
          memory: 0.75,
          speed: 0.6,
          stability: 0.85,
          trendState: 'up'
        },
        {
          date: new Date('2024-01-02'),
          attention: 0.85,
          fatigue: 0.15,
          motivation: 0.75,
          memory: 0.78,
          speed: 0.65,
          stability: 0.88,
          trendState: 'up'
        }
      ]);

      mockStateHistoryService.getHistorySummary.mockResolvedValue({
        recordCount: 30,
        avgAttention: 0.82,
        avgFatigue: 0.18,
        avgMotivation: 0.72,
        avgMemory: 0.76,
        avgSpeed: 0.62,
        avgStability: 0.86
      });

      const res = await request(app)
        .get('/api/amas/history')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.history).toHaveLength(2);
      expect(res.body.data.summary).toBeDefined();
    });

    it('should accept range parameter', async () => {
      mockStateHistoryService.getStateHistory.mockResolvedValue([]);
      mockStateHistoryService.getHistorySummary.mockResolvedValue({
        recordCount: 0,
        avgAttention: 0,
        avgFatigue: 0,
        avgMotivation: 0,
        avgMemory: 0,
        avgSpeed: 0,
        avgStability: 0
      });

      const res = await request(app)
        .get('/api/amas/history?range=7')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.range).toBe(7);
    });

    it('should default to 30 days for invalid range', async () => {
      mockStateHistoryService.getStateHistory.mockResolvedValue([]);
      mockStateHistoryService.getHistorySummary.mockResolvedValue({
        recordCount: 0,
        avgAttention: 0,
        avgFatigue: 0,
        avgMotivation: 0,
        avgMemory: 0,
        avgSpeed: 0,
        avgStability: 0
      });

      const res = await request(app)
        .get('/api/amas/history?range=15')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.range).toBe(30);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/history');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/growth ====================

  describe('GET /api/amas/growth', () => {
    it('should return cognitive growth data', async () => {
      mockStateHistoryService.getCognitiveGrowth.mockResolvedValue({
        current: { memory: 0.8, speed: 0.7, stability: 0.9 },
        past: { memory: 0.6, speed: 0.5, stability: 0.7 },
        changes: { memory: 0.2, speed: 0.2, stability: 0.2 },
        period: 30
      });

      const res = await request(app)
        .get('/api/amas/growth')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.current).toBeDefined();
      expect(res.body.data.past).toBeDefined();
      expect(res.body.data.changes).toBeDefined();
    });

    it('should calculate change percentages', async () => {
      mockStateHistoryService.getCognitiveGrowth.mockResolvedValue({
        current: { memory: 0.8, speed: 0.7, stability: 0.9 },
        past: { memory: 0.4, speed: 0.5, stability: 0.6 },
        changes: { memory: 0.4, speed: 0.2, stability: 0.3 },
        period: 30
      });

      const res = await request(app)
        .get('/api/amas/growth')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.changes.memory.direction).toBe('up');
      expect(res.body.data.changes.speed.direction).toBe('up');
    });

    it('should handle negative changes', async () => {
      mockStateHistoryService.getCognitiveGrowth.mockResolvedValue({
        current: { memory: 0.5, speed: 0.4, stability: 0.6 },
        past: { memory: 0.8, speed: 0.7, stability: 0.9 },
        changes: { memory: -0.3, speed: -0.3, stability: -0.3 },
        period: 30
      });

      const res = await request(app)
        .get('/api/amas/growth')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.changes.memory.direction).toBe('down');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/growth');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/changes ====================

  describe('GET /api/amas/changes', () => {
    it('should return significant changes', async () => {
      mockStateHistoryService.getSignificantChanges.mockResolvedValue([
        {
          metric: 'memory',
          metricLabel: '记忆力',
          changePercent: 25,
          direction: 'up',
          isPositive: true,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-30')
        },
        {
          metric: 'fatigue',
          metricLabel: '疲劳度',
          changePercent: -15,
          direction: 'down',
          isPositive: true,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-30')
        }
      ]);

      const res = await request(app)
        .get('/api/amas/changes')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.changes).toHaveLength(2);
      expect(res.body.data.hasSignificantChanges).toBe(true);
    });

    it('should return no significant changes message', async () => {
      mockStateHistoryService.getSignificantChanges.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/changes')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.hasSignificantChanges).toBe(false);
      expect(res.body.data.summary).toContain('保持稳定');
    });

    it('should accept range parameter', async () => {
      mockStateHistoryService.getSignificantChanges.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/changes?range=90')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.range).toBe(90);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/changes');

      expect(res.status).toBe(401);
    });
  });
});
