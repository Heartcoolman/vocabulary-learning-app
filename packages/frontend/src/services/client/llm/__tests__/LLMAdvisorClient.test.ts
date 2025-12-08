/**
 * LLMAdvisorClient 单元测试
 *
 * 测试 LLM 智能顾问 API 客户端的所有方法
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { LLMAdvisorClient } from '../LLMAdvisorClient';

// Mock BaseClient
vi.mock('../../base/BaseClient', () => ({
  BaseClient: class MockBaseClient {
    request = vi.fn();
  },
}));

describe('LLMAdvisorClient', () => {
  let client: LLMAdvisorClient;
  let mockRequest: Mock;

  const mockStoredSuggestion = {
    id: 'sug-1',
    weekStart: '2024-01-01',
    weekEnd: '2024-01-07',
    statsSnapshot: {
      period: { start: '2024-01-01', end: '2024-01-07' },
      users: { total: 100, activeThisWeek: 80, newThisWeek: 10, churned: 5 },
      learning: {
        avgAccuracy: 0.85,
        avgSessionDuration: 1200,
        totalWordsLearned: 5000,
        totalAnswers: 10000,
        avgResponseTime: 2500,
      },
      stateDistribution: {
        fatigue: { low: 60, mid: 30, high: 10 },
        motivation: { low: 15, mid: 50, high: 35 },
      },
      alerts: {
        lowAccuracyUserRatio: 0.1,
        highFatigueUserRatio: 0.1,
        lowMotivationUserRatio: 0.15,
        churnRate: 0.05,
      },
    },
    rawResponse: 'LLM raw response...',
    parsedSuggestion: {
      analysis: {
        summary: 'Overall learning performance is good.',
        keyFindings: ['High accuracy rate', 'Low churn rate'],
        concerns: ['Some users showing fatigue'],
      },
      suggestions: [
        {
          id: 'item-1',
          type: 'threshold' as const,
          target: 'fatigue_threshold',
          currentValue: 0.7,
          suggestedValue: 0.6,
          reason: 'Reduce fatigue threshold',
          expectedImpact: 'Fewer users hitting fatigue limit',
          risk: 'low' as const,
          priority: 1,
        },
      ],
      confidence: 0.85,
      dataQuality: 'sufficient' as const,
      nextReviewFocus: 'monitor fatigue levels',
    },
    status: 'pending' as const,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    appliedItems: null,
    createdAt: '2024-01-08T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LLMAdvisorClient();
    mockRequest = (client as unknown as { request: Mock }).request;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfig', () => {
    it('should fetch LLM config', async () => {
      const mockConfig = {
        config: {
          enabled: true,
          provider: 'openai',
          model: 'gpt-4',
          apiKeySet: true,
        },
        worker: {
          enabled: true,
          autoAnalysisEnabled: true,
          isRunning: false,
          schedule: '0 0 * * 1',
          pendingCount: 2,
        },
      };
      mockRequest.mockResolvedValue(mockConfig);

      const result = await client.getConfig();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/config');
      expect(result.config.enabled).toBe(true);
      expect(result.worker.pendingCount).toBe(2);
    });
  });

  describe('checkHealth', () => {
    it('should check LLM health status', async () => {
      const mockHealth = {
        status: 'healthy',
        message: 'LLM service is running normally',
      };
      mockRequest.mockResolvedValue(mockHealth);

      const result = await client.checkHealth();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/health');
      expect(result.status).toBe('healthy');
    });

    it('should report unhealthy status', async () => {
      const mockHealth = {
        status: 'unhealthy',
        message: 'API key not configured',
      };
      mockRequest.mockResolvedValue(mockHealth);

      const result = await client.checkHealth();

      expect(result.status).toBe('unhealthy');
    });
  });

  describe('getSuggestions', () => {
    it('should fetch suggestions without params', async () => {
      const mockResponse = {
        items: [mockStoredSuggestion],
        total: 1,
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.getSuggestions();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should fetch suggestions with status filter', async () => {
      mockRequest.mockResolvedValue({ items: [], total: 0 });

      await client.getSuggestions({ status: 'pending' });

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions?status=pending');
    });

    it('should fetch suggestions with pagination', async () => {
      mockRequest.mockResolvedValue({ items: [], total: 100 });

      await client.getSuggestions({ limit: 10, offset: 20 });

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions?limit=10&offset=20');
    });

    it('should fetch suggestions with all params', async () => {
      mockRequest.mockResolvedValue({ items: [], total: 0 });

      await client.getSuggestions({ status: 'approved', limit: 5, offset: 10 });

      expect(mockRequest).toHaveBeenCalledWith(
        '/api/llm-advisor/suggestions?status=approved&limit=5&offset=10',
      );
    });
  });

  describe('getSuggestion', () => {
    it('should fetch a single suggestion by id', async () => {
      mockRequest.mockResolvedValue(mockStoredSuggestion);

      const result = await client.getSuggestion('sug-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions/sug-1');
      expect(result.id).toBe('sug-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('approveSuggestion', () => {
    it('should approve a suggestion with selected items', async () => {
      const approvedSuggestion = {
        ...mockStoredSuggestion,
        status: 'approved',
        reviewedBy: 'admin',
        reviewedAt: '2024-01-09T00:00:00Z',
        appliedItems: ['item-1'],
      };
      mockRequest.mockResolvedValue(approvedSuggestion);

      const result = await client.approveSuggestion('sug-1', ['item-1'], 'Looks good');

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions/sug-1/approve', {
        method: 'POST',
        body: JSON.stringify({ selectedItems: ['item-1'], notes: 'Looks good' }),
      });
      expect(result.status).toBe('approved');
      expect(result.appliedItems).toContain('item-1');
    });

    it('should approve without notes', async () => {
      mockRequest.mockResolvedValue({ ...mockStoredSuggestion, status: 'approved' });

      await client.approveSuggestion('sug-1', ['item-1']);

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions/sug-1/approve', {
        method: 'POST',
        body: JSON.stringify({ selectedItems: ['item-1'], notes: undefined }),
      });
    });
  });

  describe('rejectSuggestion', () => {
    it('should reject a suggestion with notes', async () => {
      const rejectedSuggestion = {
        ...mockStoredSuggestion,
        status: 'rejected',
        reviewedBy: 'admin',
        reviewedAt: '2024-01-09T00:00:00Z',
        reviewNotes: 'Not applicable',
      };
      mockRequest.mockResolvedValue(rejectedSuggestion);

      const result = await client.rejectSuggestion('sug-1', 'Not applicable');

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions/sug-1/reject', {
        method: 'POST',
        body: JSON.stringify({ notes: 'Not applicable' }),
      });
      expect(result.status).toBe('rejected');
    });

    it('should reject without notes', async () => {
      mockRequest.mockResolvedValue({ ...mockStoredSuggestion, status: 'rejected' });

      await client.rejectSuggestion('sug-1');

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/suggestions/sug-1/reject', {
        method: 'POST',
        body: JSON.stringify({ notes: undefined }),
      });
    });
  });

  describe('triggerAnalysis', () => {
    it('should trigger LLM analysis', async () => {
      const mockResponse = {
        suggestionId: 'sug-new',
        message: 'Analysis triggered successfully',
      };
      mockRequest.mockResolvedValue(mockResponse);

      const result = await client.triggerAnalysis();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/trigger', { method: 'POST' });
      expect(result.suggestionId).toBe('sug-new');
    });
  });

  describe('getLatestSuggestion', () => {
    it('should fetch the latest suggestion', async () => {
      mockRequest.mockResolvedValue(mockStoredSuggestion);

      const result = await client.getLatestSuggestion();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/latest');
      expect(result?.id).toBe('sug-1');
    });

    it('should return null when no suggestions exist', async () => {
      mockRequest.mockResolvedValue(null);

      const result = await client.getLatestSuggestion();

      expect(result).toBeNull();
    });
  });

  describe('getPendingCount', () => {
    it('should fetch pending count', async () => {
      mockRequest.mockResolvedValue({ count: 5 });

      const result = await client.getPendingCount();

      expect(mockRequest).toHaveBeenCalledWith('/api/llm-advisor/pending-count');
      expect(result.count).toBe(5);
    });

    it('should return zero when no pending suggestions', async () => {
      mockRequest.mockResolvedValue({ count: 0 });

      const result = await client.getPendingCount();

      expect(result.count).toBe(0);
    });
  });
});
