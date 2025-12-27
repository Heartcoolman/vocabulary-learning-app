/**
 * llmAdvisorApi Tests
 *
 * 测试 LLM 顾问 API 服务的功能，包括：
 * 1. 配置获取
 * 2. 健康检查
 * 3. 建议管理（获取、审批、拒绝）
 * 4. 手动触发分析
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ApiClient
vi.mock('../client', () => ({
  default: {
    getLLMAdvisorConfig: vi.fn(),
    checkLLMAdvisorHealth: vi.fn(),
    getLLMAdvisorSuggestions: vi.fn(),
    getLLMAdvisorSuggestion: vi.fn(),
    approveLLMAdvisorSuggestion: vi.fn(),
    rejectLLMAdvisorSuggestion: vi.fn(),
    triggerLLMAdvisorAnalysis: vi.fn(),
    getLatestLLMAdvisorSuggestion: vi.fn(),
    getLLMAdvisorPendingCount: vi.fn(),
  },
}));

import {
  getLLMConfig,
  checkLLMHealth,
  getSuggestions,
  getSuggestion,
  approveSuggestion,
  rejectSuggestion,
  triggerAnalysis,
  getLatestSuggestion,
  getPendingCount,
  type LLMConfig,
  type WorkerStatus,
  type StoredSuggestion,
  type LLMSuggestion,
  type WeeklyStats,
} from '../llmAdvisorApi';
import apiClient from '../client';

const mockApiClient = apiClient as unknown as {
  getLLMAdvisorConfig: ReturnType<typeof vi.fn>;
  checkLLMAdvisorHealth: ReturnType<typeof vi.fn>;
  getLLMAdvisorSuggestions: ReturnType<typeof vi.fn>;
  getLLMAdvisorSuggestion: ReturnType<typeof vi.fn>;
  approveLLMAdvisorSuggestion: ReturnType<typeof vi.fn>;
  rejectLLMAdvisorSuggestion: ReturnType<typeof vi.fn>;
  triggerLLMAdvisorAnalysis: ReturnType<typeof vi.fn>;
  getLatestLLMAdvisorSuggestion: ReturnType<typeof vi.fn>;
  getLLMAdvisorPendingCount: ReturnType<typeof vi.fn>;
};

describe('llmAdvisorApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mock data
  const mockLLMConfig: LLMConfig = {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4',
    baseUrl: 'https://api.openai.com',
    apiKeySet: true,
  };

  const mockWorkerStatus: WorkerStatus = {
    enabled: true,
    autoAnalysisEnabled: true,
    isRunning: false,
    schedule: '0 0 * * 0',
    pendingCount: 3,
  };

  const mockWeeklyStats: WeeklyStats = {
    period: { start: '2024-01-01', end: '2024-01-07' },
    users: {
      total: 1000,
      activeThisWeek: 500,
      newThisWeek: 50,
      churned: 10,
    },
    learning: {
      avgAccuracy: 0.75,
      avgSessionDuration: 1200,
      totalWordsLearned: 50000,
      totalAnswers: 100000,
      avgResponseTime: 3500,
    },
    stateDistribution: {
      fatigue: { low: 60, mid: 30, high: 10 },
      motivation: { low: 15, mid: 55, high: 30 },
    },
    alerts: {
      lowAccuracyUserRatio: 0.1,
      highFatigueUserRatio: 0.05,
      lowMotivationUserRatio: 0.08,
      churnRate: 0.01,
    },
  };

  const mockLLMSuggestion: LLMSuggestion = {
    analysis: {
      summary: 'Overall learning performance is stable',
      keyFindings: ['High engagement rate', 'Accuracy improved'],
      concerns: ['Some users show fatigue'],
    },
    suggestions: [
      {
        id: 'suggestion-1',
        type: 'param_bound',
        target: 'learning_rate',
        currentValue: 0.01,
        suggestedValue: 0.015,
        reason: 'Users are learning faster than expected',
        expectedImpact: '+5% accuracy improvement',
        risk: 'low',
        priority: 1,
      },
    ],
    confidence: 0.85,
    dataQuality: 'sufficient',
    nextReviewFocus: 'Monitor fatigue levels',
  };

  const mockStoredSuggestion: StoredSuggestion = {
    id: 'stored-1',
    weekStart: '2024-01-01',
    weekEnd: '2024-01-07',
    statsSnapshot: mockWeeklyStats,
    rawResponse: JSON.stringify(mockLLMSuggestion),
    parsedSuggestion: mockLLMSuggestion,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    appliedItems: null,
    skippedItems: null,
    createdAt: '2024-01-08T00:00:00.000Z',
  };

  // ==================== getLLMConfig 测试 ====================

  describe('getLLMConfig', () => {
    it('should fetch LLM config', async () => {
      const mockResponse = { config: mockLLMConfig, worker: mockWorkerStatus };
      mockApiClient.getLLMAdvisorConfig.mockResolvedValue(mockResponse);

      const result = await getLLMConfig();

      expect(mockApiClient.getLLMAdvisorConfig).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should return config with all required fields', async () => {
      const mockResponse = { config: mockLLMConfig, worker: mockWorkerStatus };
      mockApiClient.getLLMAdvisorConfig.mockResolvedValue(mockResponse);

      const result = await getLLMConfig();

      expect(result.config).toHaveProperty('enabled');
      expect(result.config).toHaveProperty('provider');
      expect(result.config).toHaveProperty('model');
      expect(result.config).toHaveProperty('apiKeySet');
      expect(result.worker).toHaveProperty('enabled');
      expect(result.worker).toHaveProperty('isRunning');
    });

    it('should handle API error', async () => {
      mockApiClient.getLLMAdvisorConfig.mockRejectedValue(new Error('Config fetch failed'));

      await expect(getLLMConfig()).rejects.toThrow('Config fetch failed');
    });
  });

  // ==================== checkLLMHealth 测试 ====================

  describe('checkLLMHealth', () => {
    it('should check LLM health', async () => {
      const mockResponse = { status: 'healthy', message: 'LLM service is operational' };
      mockApiClient.checkLLMAdvisorHealth.mockResolvedValue(mockResponse);

      const result = await checkLLMHealth();

      expect(mockApiClient.checkLLMAdvisorHealth).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should return unhealthy status when service is down', async () => {
      const mockResponse = { status: 'unhealthy', message: 'LLM service is unavailable' };
      mockApiClient.checkLLMAdvisorHealth.mockResolvedValue(mockResponse);

      const result = await checkLLMHealth();

      expect(result.status).toBe('unhealthy');
    });

    it('should handle API error', async () => {
      mockApiClient.checkLLMAdvisorHealth.mockRejectedValue(new Error('Health check failed'));

      await expect(checkLLMHealth()).rejects.toThrow('Health check failed');
    });
  });

  // ==================== getSuggestions 测试 ====================

  describe('getSuggestions', () => {
    it('should fetch suggestions without params', async () => {
      const mockResponse = { items: [mockStoredSuggestion], total: 1 };
      mockApiClient.getLLMAdvisorSuggestions.mockResolvedValue(mockResponse);

      const result = await getSuggestions();

      expect(mockApiClient.getLLMAdvisorSuggestions).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should fetch suggestions with status filter', async () => {
      const mockResponse = { items: [mockStoredSuggestion], total: 1 };
      mockApiClient.getLLMAdvisorSuggestions.mockResolvedValue(mockResponse);

      const result = await getSuggestions({ status: 'pending' });

      expect(mockApiClient.getLLMAdvisorSuggestions).toHaveBeenCalledWith({ status: 'pending' });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch suggestions with pagination', async () => {
      const mockResponse = { items: [mockStoredSuggestion], total: 10 };
      mockApiClient.getLLMAdvisorSuggestions.mockResolvedValue(mockResponse);

      const result = await getSuggestions({ limit: 5, offset: 10 });

      expect(mockApiClient.getLLMAdvisorSuggestions).toHaveBeenCalledWith({ limit: 5, offset: 10 });
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty result', async () => {
      const mockResponse = { items: [], total: 0 };
      mockApiClient.getLLMAdvisorSuggestions.mockResolvedValue(mockResponse);

      const result = await getSuggestions({ status: 'approved' });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle API error', async () => {
      mockApiClient.getLLMAdvisorSuggestions.mockRejectedValue(new Error('Fetch failed'));

      await expect(getSuggestions()).rejects.toThrow('Fetch failed');
    });
  });

  // ==================== getSuggestion 测试 ====================

  describe('getSuggestion', () => {
    it('should fetch single suggestion by ID', async () => {
      mockApiClient.getLLMAdvisorSuggestion.mockResolvedValue(mockStoredSuggestion);

      const result = await getSuggestion('stored-1');

      expect(mockApiClient.getLLMAdvisorSuggestion).toHaveBeenCalledWith('stored-1');
      expect(result).toEqual(mockStoredSuggestion);
    });

    it('should return suggestion with all required fields', async () => {
      mockApiClient.getLLMAdvisorSuggestion.mockResolvedValue(mockStoredSuggestion);

      const result = await getSuggestion('stored-1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('weekStart');
      expect(result).toHaveProperty('weekEnd');
      expect(result).toHaveProperty('statsSnapshot');
      expect(result).toHaveProperty('parsedSuggestion');
      expect(result).toHaveProperty('status');
    });

    it('should handle API error', async () => {
      mockApiClient.getLLMAdvisorSuggestion.mockRejectedValue(new Error('Suggestion not found'));

      await expect(getSuggestion('non-existent')).rejects.toThrow('Suggestion not found');
    });
  });

  // ==================== approveSuggestion 测试 ====================

  describe('approveSuggestion', () => {
    it('should approve suggestion with selected items', async () => {
      const approvedSuggestion: StoredSuggestion = {
        ...mockStoredSuggestion,
        status: 'approved',
        reviewedBy: 'admin',
        reviewedAt: '2024-01-09T00:00:00.000Z',
        appliedItems: ['suggestion-1'],
      };
      mockApiClient.approveLLMAdvisorSuggestion.mockResolvedValue(approvedSuggestion);

      const result = await approveSuggestion('stored-1', ['suggestion-1']);

      expect(mockApiClient.approveLLMAdvisorSuggestion).toHaveBeenCalledWith(
        'stored-1',
        ['suggestion-1'],
        undefined,
      );
      expect(result.status).toBe('approved');
      expect(result.appliedItems).toContain('suggestion-1');
    });

    it('should approve suggestion with notes', async () => {
      const approvedSuggestion: StoredSuggestion = {
        ...mockStoredSuggestion,
        status: 'approved',
        reviewNotes: 'Approved after review',
      };
      mockApiClient.approveLLMAdvisorSuggestion.mockResolvedValue(approvedSuggestion);

      const result = await approveSuggestion('stored-1', ['suggestion-1'], 'Approved after review');

      expect(mockApiClient.approveLLMAdvisorSuggestion).toHaveBeenCalledWith(
        'stored-1',
        ['suggestion-1'],
        'Approved after review',
      );
    });

    it('should handle partial approval', async () => {
      const partialSuggestion: StoredSuggestion = {
        ...mockStoredSuggestion,
        status: 'partial',
        appliedItems: ['suggestion-1'],
      };
      mockApiClient.approveLLMAdvisorSuggestion.mockResolvedValue(partialSuggestion);

      const result = await approveSuggestion('stored-1', ['suggestion-1']);

      expect(result.status).toBe('partial');
    });

    it('should handle API error', async () => {
      mockApiClient.approveLLMAdvisorSuggestion.mockRejectedValue(new Error('Approval failed'));

      await expect(approveSuggestion('stored-1', ['suggestion-1'])).rejects.toThrow(
        'Approval failed',
      );
    });
  });

  // ==================== rejectSuggestion 测试 ====================

  describe('rejectSuggestion', () => {
    it('should reject suggestion', async () => {
      const rejectedSuggestion: StoredSuggestion = {
        ...mockStoredSuggestion,
        status: 'rejected',
        reviewedBy: 'admin',
        reviewedAt: '2024-01-09T00:00:00.000Z',
      };
      mockApiClient.rejectLLMAdvisorSuggestion.mockResolvedValue(rejectedSuggestion);

      const result = await rejectSuggestion('stored-1');

      expect(mockApiClient.rejectLLMAdvisorSuggestion).toHaveBeenCalledWith('stored-1', undefined);
      expect(result.status).toBe('rejected');
    });

    it('should reject suggestion with notes', async () => {
      const rejectedSuggestion: StoredSuggestion = {
        ...mockStoredSuggestion,
        status: 'rejected',
        reviewNotes: 'Not applicable for current situation',
      };
      mockApiClient.rejectLLMAdvisorSuggestion.mockResolvedValue(rejectedSuggestion);

      const result = await rejectSuggestion('stored-1', 'Not applicable for current situation');

      expect(mockApiClient.rejectLLMAdvisorSuggestion).toHaveBeenCalledWith(
        'stored-1',
        'Not applicable for current situation',
      );
    });

    it('should handle API error', async () => {
      mockApiClient.rejectLLMAdvisorSuggestion.mockRejectedValue(new Error('Rejection failed'));

      await expect(rejectSuggestion('stored-1')).rejects.toThrow('Rejection failed');
    });
  });

  // ==================== triggerAnalysis 测试 ====================

  describe('triggerAnalysis', () => {
    it('should trigger manual analysis', async () => {
      const mockResponse = { suggestionId: 'new-suggestion-1', message: 'Analysis started' };
      mockApiClient.triggerLLMAdvisorAnalysis.mockResolvedValue(mockResponse);

      const result = await triggerAnalysis();

      expect(mockApiClient.triggerLLMAdvisorAnalysis).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('should return suggestion ID on success', async () => {
      const mockResponse = { suggestionId: 'new-suggestion-1', message: 'Analysis completed' };
      mockApiClient.triggerLLMAdvisorAnalysis.mockResolvedValue(mockResponse);

      const result = await triggerAnalysis();

      expect(result.suggestionId).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it('should handle API error', async () => {
      mockApiClient.triggerLLMAdvisorAnalysis.mockRejectedValue(
        new Error('Analysis trigger failed'),
      );

      await expect(triggerAnalysis()).rejects.toThrow('Analysis trigger failed');
    });
  });

  // ==================== getLatestSuggestion 测试 ====================

  describe('getLatestSuggestion', () => {
    it('should fetch latest suggestion', async () => {
      mockApiClient.getLatestLLMAdvisorSuggestion.mockResolvedValue(mockStoredSuggestion);

      const result = await getLatestSuggestion();

      expect(mockApiClient.getLatestLLMAdvisorSuggestion).toHaveBeenCalled();
      expect(result).toEqual(mockStoredSuggestion);
    });

    it('should return null when no suggestions exist', async () => {
      mockApiClient.getLatestLLMAdvisorSuggestion.mockResolvedValue(null);

      const result = await getLatestSuggestion();

      expect(result).toBeNull();
    });

    it('should handle API error', async () => {
      mockApiClient.getLatestLLMAdvisorSuggestion.mockRejectedValue(new Error('Fetch failed'));

      await expect(getLatestSuggestion()).rejects.toThrow('Fetch failed');
    });
  });

  // ==================== getPendingCount 测试 ====================

  describe('getPendingCount', () => {
    it('should fetch pending count', async () => {
      mockApiClient.getLLMAdvisorPendingCount.mockResolvedValue({ count: 5 });

      const result = await getPendingCount();

      expect(mockApiClient.getLLMAdvisorPendingCount).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should return 0 when no pending suggestions', async () => {
      mockApiClient.getLLMAdvisorPendingCount.mockResolvedValue({ count: 0 });

      const result = await getPendingCount();

      expect(result).toBe(0);
    });

    it('should handle API error', async () => {
      mockApiClient.getLLMAdvisorPendingCount.mockRejectedValue(new Error('Count fetch failed'));

      await expect(getPendingCount()).rejects.toThrow('Count fetch failed');
    });
  });
});
