/**
 * AMAS Explain Routes Integration Tests
 *
 * Tests for AMAS explainability API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockExplainabilityService } = vi.hoisted(() => ({
  mockExplainabilityService: {
    getDecisionExplanation: vi.fn(),
    getLearningCurve: vi.fn(),
    getDecisionTimeline: vi.fn(),
    runCounterfactual: vi.fn(),
  },
}));

vi.mock('../../../src/services/explainability.service', () => ({
  explainabilityService: mockExplainabilityService,
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
  },
}));

import app from '../../../src/app';

describe('AMAS Explain API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GET /api/amas/explain-decision ====================

  describe('GET /api/amas/explain-decision', () => {
    it('should return decision explanation', async () => {
      mockExplainabilityService.getDecisionExplanation.mockResolvedValue({
        decisionId: 'decision-123',
        factors: [
          { name: 'attention', weight: 0.3, value: 0.8 },
          { name: 'fatigue', weight: 0.2, value: 0.3 },
        ],
        recommendation: 'Continue learning',
        confidence: 0.85,
      });

      const res = await request(app)
        .get('/api/amas/explain-decision')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.factors).toBeDefined();
    });

    it('should accept decisionId parameter', async () => {
      mockExplainabilityService.getDecisionExplanation.mockResolvedValue({
        decisionId: 'specific-id',
        factors: [],
        confidence: 0.9,
      });

      const res = await request(app)
        .get('/api/amas/explain-decision?decisionId=specific-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockExplainabilityService.getDecisionExplanation).toHaveBeenCalledWith(
        'test-user-id',
        'specific-id',
      );
    });

    it('should return 200 with null data when decision not found', async () => {
      mockExplainabilityService.getDecisionExplanation.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/amas/explain-decision?decisionId=nonexistent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/amas/explain-decision');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/amas/learning-curve ====================

  describe('GET /api/amas/learning-curve', () => {
    it('should return learning curve data', async () => {
      mockExplainabilityService.getLearningCurve.mockResolvedValue({
        dataPoints: [
          { date: '2024-01-01', accuracy: 0.6 },
          { date: '2024-01-02', accuracy: 0.65 },
          { date: '2024-01-03', accuracy: 0.7 },
        ],
        trend: 'improving',
      });

      const res = await request(app)
        .get('/api/amas/learning-curve')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataPoints).toHaveLength(3);
    });

    it('should accept days parameter', async () => {
      mockExplainabilityService.getLearningCurve.mockResolvedValue({
        dataPoints: [],
        trend: 'stable',
      });

      const res = await request(app)
        .get('/api/amas/learning-curve?days=60')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockExplainabilityService.getLearningCurve).toHaveBeenCalledWith('test-user-id', 60);
    });

    it('should use default days value', async () => {
      mockExplainabilityService.getLearningCurve.mockResolvedValue({
        dataPoints: [],
        trend: 'stable',
      });

      const res = await request(app)
        .get('/api/amas/learning-curve')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockExplainabilityService.getLearningCurve).toHaveBeenCalledWith('test-user-id', 30);
    });

    it('should return 400 for days < 7', async () => {
      const res = await request(app)
        .get('/api/amas/learning-curve?days=5')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });

    it('should return 400 for days > 90', async () => {
      const res = await request(app)
        .get('/api/amas/learning-curve?days=100')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/amas/decision-timeline ====================

  describe('GET /api/amas/decision-timeline', () => {
    it('should return decision timeline', async () => {
      mockExplainabilityService.getDecisionTimeline.mockResolvedValue({
        decisions: [
          { id: 'd-1', timestamp: new Date(), type: 'word_selection' },
          { id: 'd-2', timestamp: new Date(), type: 'difficulty_adjustment' },
        ],
        nextCursor: 'd-3',
      });

      const res = await request(app)
        .get('/api/amas/decision-timeline')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.decisions).toHaveLength(2);
    });

    it('should accept limit parameter', async () => {
      mockExplainabilityService.getDecisionTimeline.mockResolvedValue({
        decisions: [],
        nextCursor: null,
      });

      const res = await request(app)
        .get('/api/amas/decision-timeline?limit=100')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockExplainabilityService.getDecisionTimeline).toHaveBeenCalledWith(
        'test-user-id',
        100,
        undefined,
      );
    });

    it('should accept cursor parameter', async () => {
      mockExplainabilityService.getDecisionTimeline.mockResolvedValue({
        decisions: [],
        nextCursor: null,
      });

      const res = await request(app)
        .get('/api/amas/decision-timeline?cursor=abc123')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(mockExplainabilityService.getDecisionTimeline).toHaveBeenCalledWith(
        'test-user-id',
        50,
        'abc123',
      );
    });

    it('should return 400 for limit > 200', async () => {
      const res = await request(app)
        .get('/api/amas/decision-timeline?limit=250')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /api/amas/counterfactual ====================

  describe('POST /api/amas/counterfactual', () => {
    it('should run counterfactual analysis', async () => {
      mockExplainabilityService.runCounterfactual.mockResolvedValue({
        original: { decision: 'continue', confidence: 0.8 },
        counterfactual: { decision: 'take_break', confidence: 0.75 },
        changes: ['Higher fatigue would suggest taking a break'],
      });

      const res = await request(app)
        .post('/api/amas/counterfactual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          overrides: {
            fatigue: 0.9,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.original).toBeDefined();
      expect(res.body.data.counterfactual).toBeDefined();
    });

    it('should accept decisionId in body', async () => {
      mockExplainabilityService.runCounterfactual.mockResolvedValue({
        original: { decision: 'continue' },
        counterfactual: { decision: 'continue' },
      });

      const res = await request(app)
        .post('/api/amas/counterfactual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          decisionId: 'decision-123',
          overrides: { attention: 0.5 },
        });

      expect(res.status).toBe(200);
    });

    it('should return 200 with null data when counterfactual not available', async () => {
      mockExplainabilityService.runCounterfactual.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/amas/counterfactual')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toBeDefined();
    });

    it('should validate override values', async () => {
      const res = await request(app)
        .post('/api/amas/counterfactual')
        .set('Authorization', 'Bearer valid-token')
        .send({
          overrides: {
            attention: 2.0, // Invalid: should be 0-1
          },
        });

      expect(res.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/amas/counterfactual').send({});

      expect(res.status).toBe(401);
    });
  });
});
