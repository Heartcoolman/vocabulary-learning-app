/**
 * Trend Analysis Routes Integration Tests
 *
 * Tests for trend analysis and intervention API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockTrendAnalysisService } = vi.hoisted(() => ({
  mockTrendAnalysisService: {
    getCurrentTrend: vi.fn(),
    getTrendHistory: vi.fn(),
    generateTrendReport: vi.fn(),
    checkIntervention: vi.fn()
  }
}));

vi.mock('../../../src/services/trend-analysis.service', () => ({
  trendAnalysisService: mockTrendAnalysisService
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

describe('Trend Analysis API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/amas/trend ====================

  describe('GET /api/amas/trend', () => {
    it('should return current trend (up)', async () => {
      mockTrendAnalysisService.getCurrentTrend.mockResolvedValue({
        state: 'up',
        consecutiveDays: 5,
        lastChange: new Date('2024-01-15')
      });

      const res = await request(app)
        .get('/api/amas/trend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.state).toBe('up');
      expect(res.body.data.stateDescription).toContain('上升');
    });

    it('should return flat trend', async () => {
      mockTrendAnalysisService.getCurrentTrend.mockResolvedValue({
        state: 'flat',
        consecutiveDays: 10,
        lastChange: new Date('2024-01-10')
      });

      const res = await request(app)
        .get('/api/amas/trend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('flat');
      expect(res.body.data.stateDescription).toContain('平稳');
    });

    it('should return stuck trend', async () => {
      mockTrendAnalysisService.getCurrentTrend.mockResolvedValue({
        state: 'stuck',
        consecutiveDays: 14,
        lastChange: new Date('2024-01-01')
      });

      const res = await request(app)
        .get('/api/amas/trend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('stuck');
      expect(res.body.data.stateDescription).toContain('停滞');
    });

    it('should return down trend', async () => {
      mockTrendAnalysisService.getCurrentTrend.mockResolvedValue({
        state: 'down',
        consecutiveDays: 3,
        lastChange: new Date('2024-01-18')
      });

      const res = await request(app)
        .get('/api/amas/trend')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('down');
      expect(res.body.data.stateDescription).toContain('下降');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/trend');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/trend/history ====================

  describe('GET /api/amas/trend/history', () => {
    it('should return trend history', async () => {
      mockTrendAnalysisService.getTrendHistory.mockResolvedValue([
        { date: new Date('2024-01-01'), state: 'up', accuracy: 0.8, avgResponseTime: 2000, motivation: 0.7 },
        { date: new Date('2024-01-02'), state: 'up', accuracy: 0.82, avgResponseTime: 1900, motivation: 0.75 },
        { date: new Date('2024-01-03'), state: 'flat', accuracy: 0.81, avgResponseTime: 1950, motivation: 0.73 }
      ]);

      const res = await request(app)
        .get('/api/amas/trend/history')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.daily).toHaveLength(3);
      expect(res.body.data.weekly).toBeDefined();
    });

    it('should accept days parameter', async () => {
      mockTrendAnalysisService.getTrendHistory.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/amas/trend/history?days=14')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockTrendAnalysisService.getTrendHistory).toHaveBeenCalledWith('test-user-id', 14);
    });

    it('should return 400 for days < 1', async () => {
      const res = await request(app)
        .get('/api/amas/trend/history?days=0')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for days > 90', async () => {
      const res = await request(app)
        .get('/api/amas/trend/history?days=100')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/trend/history');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/trend/report ====================

  describe('GET /api/amas/trend/report', () => {
    it('should return trend report', async () => {
      mockTrendAnalysisService.generateTrendReport.mockResolvedValue({
        accuracyTrend: { direction: 'up', change: 0.05, currentValue: 0.85 },
        responseTimeTrend: { direction: 'down', change: -200, currentValue: 1800 },
        motivationTrend: { direction: 'flat', change: 0.01, currentValue: 0.7 },
        summary: '学习状态良好，正确率持续提升',
        recommendations: ['继续保持当前学习节奏', '尝试增加复习频率']
      });

      const res = await request(app)
        .get('/api/amas/trend/report')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accuracyTrend).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.recommendations).toHaveLength(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/trend/report');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/trend/intervention ====================

  describe('GET /api/amas/trend/intervention', () => {
    it('should return intervention needed', async () => {
      mockTrendAnalysisService.checkIntervention.mockResolvedValue({
        needsIntervention: true,
        type: 'warning',
        message: '学习进度连续3天下滑，建议调整学习计划',
        actions: ['减少每日学习量', '增加休息时间', '复习之前学过的内容']
      });

      const res = await request(app)
        .get('/api/amas/trend/intervention')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.needsIntervention).toBe(true);
      expect(res.body.data.type).toBe('warning');
      expect(res.body.data.actions).toHaveLength(3);
    });

    it('should return no intervention needed', async () => {
      mockTrendAnalysisService.checkIntervention.mockResolvedValue({
        needsIntervention: false,
        type: null,
        message: null,
        actions: []
      });

      const res = await request(app)
        .get('/api/amas/trend/intervention')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.needsIntervention).toBe(false);
    });

    it('should return encouragement type', async () => {
      mockTrendAnalysisService.checkIntervention.mockResolvedValue({
        needsIntervention: true,
        type: 'encouragement',
        message: '太棒了！连续学习7天，继续保持！',
        actions: ['挑战更难的单词', '尝试新的词书']
      });

      const res = await request(app)
        .get('/api/amas/trend/intervention')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe('encouragement');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/trend/intervention');

      expect(res.status).toBe(401);
    });
  });
});
