/**
 * LLM Advisor Routes Integration Tests
 *
 * Tests for LLM advisor API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const { mockLlmWeeklyAdvisor } = vi.hoisted(() => ({
  mockLlmWeeklyAdvisor: {
    getSuggestions: vi.fn(),
    getSuggestion: vi.fn(),
    approveSuggestion: vi.fn(),
    rejectSuggestion: vi.fn(),
    getLatestSuggestion: vi.fn(),
    getPendingCount: vi.fn()
  }
}));

const { mockLlmConfig, mockGetConfigSummary } = vi.hoisted(() => ({
  mockLlmConfig: { enabled: true },
  mockGetConfigSummary: vi.fn()
}));

const { mockLlmProviderService } = vi.hoisted(() => ({
  mockLlmProviderService: {
    healthCheck: vi.fn()
  }
}));

const { mockTriggerLLMAnalysis, mockGetLLMAdvisorWorkerStatus } = vi.hoisted(() => ({
  mockTriggerLLMAnalysis: vi.fn(),
  mockGetLLMAdvisorWorkerStatus: vi.fn()
}));

vi.mock('../../../src/amas/optimization/llm-advisor', () => ({
  llmWeeklyAdvisor: mockLlmWeeklyAdvisor
}));

vi.mock('../../../src/config/llm.config', () => ({
  llmConfig: mockLlmConfig,
  getConfigSummary: mockGetConfigSummary
}));

vi.mock('../../../src/services/llm-provider.service', () => ({
  llmProviderService: mockLlmProviderService
}));

vi.mock('../../../src/workers/llm-advisor.worker', () => ({
  triggerLLMAnalysis: mockTriggerLLMAnalysis,
  getLLMAdvisorWorkerStatus: mockGetLLMAdvisorWorkerStatus
}));

vi.mock('../../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token') {
      req.user = { id: 'admin-user-id', username: 'admin', role: 'ADMIN' };
      next();
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer admin-token') {
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

describe('LLM Advisor API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLlmConfig.enabled = true;
  });

  // ==================== GET /api/llm-advisor/config ====================

  describe('GET /api/llm-advisor/config', () => {
    it('should return LLM config status', async () => {
      mockGetConfigSummary.mockReturnValue({
        provider: 'openai',
        model: 'gpt-4',
        enabled: true
      });

      mockGetLLMAdvisorWorkerStatus.mockResolvedValue({
        enabled: true,
        autoAnalysisEnabled: true,
        isRunning: false,
        schedule: '0 0 * * 0',
        pendingCount: 2
      });

      const res = await request(app)
        .get('/api/llm-advisor/config')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.config).toBeDefined();
      expect(res.body.data.worker).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/llm-advisor/config');

      expect(res.status).toBe(401);
    });
  });

  // ==================== GET /api/llm-advisor/health ====================

  describe('GET /api/llm-advisor/health', () => {
    it('should return healthy status', async () => {
      mockLlmProviderService.healthCheck.mockResolvedValue({
        ok: true,
        message: 'LLM service is healthy'
      });

      const res = await request(app)
        .get('/api/llm-advisor/health')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });

    it('should return disabled status when LLM is disabled', async () => {
      mockLlmConfig.enabled = false;

      const res = await request(app)
        .get('/api/llm-advisor/health')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('disabled');
    });

    it('should return unhealthy status', async () => {
      mockLlmProviderService.healthCheck.mockResolvedValue({
        ok: false,
        message: 'Connection failed'
      });

      const res = await request(app)
        .get('/api/llm-advisor/health')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unhealthy');
    });
  });

  // ==================== GET /api/llm-advisor/suggestions ====================

  describe('GET /api/llm-advisor/suggestions', () => {
    it('should return suggestions list', async () => {
      mockLlmWeeklyAdvisor.getSuggestions.mockResolvedValue({
        items: [
          { id: 'sug-1', status: 'pending', createdAt: new Date() },
          { id: 'sug-2', status: 'approved', createdAt: new Date() }
        ],
        total: 2
      });

      const res = await request(app)
        .get('/api/llm-advisor/suggestions')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should support status filter', async () => {
      mockLlmWeeklyAdvisor.getSuggestions.mockResolvedValue({
        items: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/llm-advisor/suggestions?status=pending')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(mockLlmWeeklyAdvisor.getSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      );
    });

    it('should support pagination', async () => {
      mockLlmWeeklyAdvisor.getSuggestions.mockResolvedValue({
        items: [],
        total: 0
      });

      const res = await request(app)
        .get('/api/llm-advisor/suggestions?limit=10&offset=20')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(mockLlmWeeklyAdvisor.getSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });
  });

  // ==================== GET /api/llm-advisor/suggestions/:id ====================

  describe('GET /api/llm-advisor/suggestions/:id', () => {
    it('should return suggestion details', async () => {
      mockLlmWeeklyAdvisor.getSuggestion.mockResolvedValue({
        id: 'sug-1',
        status: 'pending',
        content: 'Test suggestion content',
        createdAt: new Date()
      });

      const res = await request(app)
        .get('/api/llm-advisor/suggestions/sug-1')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('sug-1');
    });

    it('should return 404 for non-existent suggestion', async () => {
      mockLlmWeeklyAdvisor.getSuggestion.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/llm-advisor/suggestions/nonexistent')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(404);
    });
  });

  // ==================== POST /api/llm-advisor/suggestions/:id/approve ====================

  describe('POST /api/llm-advisor/suggestions/:id/approve', () => {
    it('should approve suggestion', async () => {
      mockLlmWeeklyAdvisor.approveSuggestion.mockResolvedValue({
        id: 'sug-1',
        status: 'approved'
      });

      const res = await request(app)
        .post('/api/llm-advisor/suggestions/sug-1/approve')
        .set('Authorization', 'Bearer admin-token')
        .send({ selectedItems: ['item-1', 'item-2'], notes: 'Approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for non-array selectedItems', async () => {
      const res = await request(app)
        .post('/api/llm-advisor/suggestions/sug-1/approve')
        .set('Authorization', 'Bearer admin-token')
        .send({ selectedItems: 'not-an-array' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /api/llm-advisor/suggestions/:id/reject ====================

  describe('POST /api/llm-advisor/suggestions/:id/reject', () => {
    it('should reject suggestion', async () => {
      mockLlmWeeklyAdvisor.rejectSuggestion.mockResolvedValue({
        id: 'sug-1',
        status: 'rejected'
      });

      const res = await request(app)
        .post('/api/llm-advisor/suggestions/sug-1/reject')
        .set('Authorization', 'Bearer admin-token')
        .send({ notes: 'Not relevant' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==================== POST /api/llm-advisor/trigger ====================

  describe('POST /api/llm-advisor/trigger', () => {
    it('should trigger LLM analysis', async () => {
      mockTriggerLLMAnalysis.mockResolvedValue('new-suggestion-id');

      const res = await request(app)
        .post('/api/llm-advisor/trigger')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.suggestionId).toBe('new-suggestion-id');
    });

    it('should return 400 when LLM is disabled', async () => {
      mockLlmConfig.enabled = false;

      const res = await request(app)
        .post('/api/llm-advisor/trigger')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /api/llm-advisor/pending-count ====================

  describe('GET /api/llm-advisor/pending-count', () => {
    it('should return pending count', async () => {
      mockLlmWeeklyAdvisor.getPendingCount.mockResolvedValue(5);

      const res = await request(app)
        .get('/api/llm-advisor/pending-count')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(5);
    });
  });
});
