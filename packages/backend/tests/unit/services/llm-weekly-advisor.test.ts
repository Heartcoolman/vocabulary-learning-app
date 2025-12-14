/**
 * LLM Weekly Advisor Unit Tests
 * LLM 周度顾问服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
const mockLLMAdvisorSuggestionCreate = vi.fn();
const mockLLMAdvisorSuggestionFindMany = vi.fn();
const mockLLMAdvisorSuggestionFindUnique = vi.fn();
const mockLLMAdvisorSuggestionFindFirst = vi.fn();
const mockLLMAdvisorSuggestionUpdate = vi.fn();
const mockLLMAdvisorSuggestionCount = vi.fn();

vi.mock('../../../src/config/database', () => ({
  default: {
    lLMAdvisorSuggestion: {
      create: (...args: any[]) => mockLLMAdvisorSuggestionCreate(...args),
      findMany: (...args: any[]) => mockLLMAdvisorSuggestionFindMany(...args),
      findUnique: (...args: any[]) => mockLLMAdvisorSuggestionFindUnique(...args),
      findFirst: (...args: any[]) => mockLLMAdvisorSuggestionFindFirst(...args),
      update: (...args: any[]) => mockLLMAdvisorSuggestionUpdate(...args),
      count: (...args: any[]) => mockLLMAdvisorSuggestionCount(...args),
    },
  },
}));

vi.mock('../../../src/config/llm.config', () => ({
  llmConfig: {
    enabled: true,
  },
}));

vi.mock('../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock collectors and services
const mockCollectWeeklyStats = vi.fn();
const mockCompleteWithSystem = vi.fn();
const mockParse = vi.fn();
const mockValidate = vi.fn();
const mockUpdateParamBound = vi.fn();
const mockUpdateThreshold = vi.fn();
const mockUpdateRewardWeight = vi.fn();
const mockUpdateSafetyThreshold = vi.fn();
const mockGetParamBounds = vi.fn();

vi.mock('../../../src/amas/services/llm-advisor/stats-collector', () => ({
  statsCollector: {
    collectWeeklyStats: (...args: any[]) => mockCollectWeeklyStats(...args),
  },
  StatsCollector: class {
    collectWeeklyStats = mockCollectWeeklyStats;
  },
}));

vi.mock('../../../src/services/llm-provider.service', () => ({
  llmProviderService: {
    completeWithSystem: (...args: any[]) => mockCompleteWithSystem(...args),
  },
  LLMProviderService: class {
    completeWithSystem = mockCompleteWithSystem;
  },
}));

vi.mock('../../../src/amas/services/llm-advisor/suggestion-parser', () => ({
  suggestionParser: {
    parse: (...args: any[]) => mockParse(...args),
    validate: (...args: any[]) => mockValidate(...args),
  },
  SuggestionParser: class {
    parse = mockParse;
    validate = mockValidate;
  },
}));

vi.mock('../../../src/amas/services/llm-advisor/prompts', () => ({
  SYSTEM_PROMPT: 'You are an expert in adaptive learning systems.',
  buildWeeklyAnalysisPrompt: vi.fn(() => 'Weekly analysis prompt'),
}));

vi.mock('../../../src/services/amas-config.service', () => ({
  amasConfigService: {
    updateParamBound: (...args: any[]) => mockUpdateParamBound(...args),
    updateThreshold: (...args: any[]) => mockUpdateThreshold(...args),
    updateRewardWeight: (...args: any[]) => mockUpdateRewardWeight(...args),
    updateSafetyThreshold: (...args: any[]) => mockUpdateSafetyThreshold(...args),
    getParamBounds: (...args: any[]) => mockGetParamBounds(...args),
  },
}));

describe('LLMWeeklyAdvisor', () => {
  let LLMWeeklyAdvisor: any;
  let llmWeeklyAdvisor: any;

  const mockWeeklyStats = {
    period: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-07'),
    },
    users: {
      total: 1000,
      activeThisWeek: 500,
      newThisWeek: 50,
      churned: 30,
    },
    learning: {
      avgAccuracy: 0.75,
      avgSessionDuration: 15,
      totalWordsLearned: 5000,
      totalAnswers: 20000,
      avgResponseTime: 2500,
    },
    stateDistribution: {
      fatigue: { low: 0.6, mid: 0.3, high: 0.1 },
      motivation: { low: 0.1, mid: 0.5, high: 0.4 },
    },
    currentConfig: {
      userParamBounds: {
        alpha: { min: 0.3, max: 2.0 },
      },
      rewardWeights: { correct: 1.0 },
      adjustmentThresholds: {},
      safetyThresholds: { highFatigue: 0.7 },
    },
    optimizationHistory: {
      recentObservations: [],
      bestParams: null,
      bestValue: null,
      evaluationCount: 0,
    },
    alerts: {
      lowAccuracyUserRatio: 0.1,
      highFatigueUserRatio: 0.1,
      lowMotivationUserRatio: 0.1,
      churnRate: 0.06,
    },
  };

  const mockLLMSuggestion = {
    analysis: {
      summary: 'System performing well with room for improvement',
      keyFindings: ['High accuracy rate', 'Low churn'],
      concerns: ['Some users show fatigue'],
    },
    suggestions: [
      {
        id: 'suggestion-1',
        type: 'threshold',
        target: 'highAccuracy',
        currentValue: 0.85,
        suggestedValue: 0.88,
        reason: 'Improve learning outcomes',
        expectedImpact: '5% improvement in retention',
        risk: 'low',
        priority: 2,
      },
    ],
    confidence: 0.8,
    dataQuality: 'sufficient',
    nextReviewFocus: 'Monitor fatigue levels',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Setup default mocks
    mockCollectWeeklyStats.mockResolvedValue(mockWeeklyStats);
    mockCompleteWithSystem.mockResolvedValue(JSON.stringify(mockLLMSuggestion));
    mockParse.mockReturnValue(mockLLMSuggestion);
    mockValidate.mockReturnValue({ valid: true, errors: [], warnings: [] });
    mockGetParamBounds.mockResolvedValue({
      alpha: { min: 0.3, max: 2.0 },
      fatigueK: { min: 0.02, max: 0.2 },
    });

    const module = await import('../../../src/amas/services/llm-advisor/llm-weekly-advisor');
    LLMWeeklyAdvisor = module.LLMWeeklyAdvisor;
    llmWeeklyAdvisor = new LLMWeeklyAdvisor();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('isEnabled', () => {
    it('should return true when LLM is enabled', () => {
      expect(llmWeeklyAdvisor.isEnabled()).toBe(true);
    });
  });

  describe('runWeeklyAnalysis', () => {
    it('should run complete analysis cycle', async () => {
      mockLLMAdvisorSuggestionCreate.mockResolvedValue({
        id: 'stored-1',
        weekStart: mockWeeklyStats.period.start,
        weekEnd: mockWeeklyStats.period.end,
        statsSnapshot: mockWeeklyStats,
        rawResponse: JSON.stringify(mockLLMSuggestion),
        parsedSuggestion: mockLLMSuggestion,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        appliedItems: null,
        createdAt: new Date(),
      });

      const result = await llmWeeklyAdvisor.runWeeklyAnalysis();

      expect(result.id).toBe('stored-1');
      expect(result.stats).toEqual(mockWeeklyStats);
      expect(result.suggestion).toEqual(mockLLMSuggestion);
      expect(mockCollectWeeklyStats).toHaveBeenCalled();
      expect(mockCompleteWithSystem).toHaveBeenCalled();
      expect(mockParse).toHaveBeenCalled();
      expect(mockValidate).toHaveBeenCalled();
    });

    it('should handle validation warnings', async () => {
      mockValidate.mockReturnValue({
        valid: false,
        errors: ['Missing field'],
        warnings: ['Low confidence'],
      });

      mockLLMAdvisorSuggestionCreate.mockResolvedValue({
        id: 'stored-1',
        weekStart: mockWeeklyStats.period.start,
        weekEnd: mockWeeklyStats.period.end,
        statsSnapshot: mockWeeklyStats,
        rawResponse: '',
        parsedSuggestion: mockLLMSuggestion,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        appliedItems: null,
        createdAt: new Date(),
      });

      const result = await llmWeeklyAdvisor.runWeeklyAnalysis();

      expect(result).toBeDefined();
    });

    it('should throw error when LLM fails', async () => {
      mockCompleteWithSystem.mockRejectedValue(new Error('LLM API error'));

      await expect(llmWeeklyAdvisor.runWeeklyAnalysis()).rejects.toThrow('LLM API error');
    });
  });

  describe('getSuggestions', () => {
    it('should return paginated suggestions list', async () => {
      const mockStoredSuggestions = [
        {
          id: 'stored-1',
          weekStart: new Date(),
          weekEnd: new Date(),
          statsSnapshot: mockWeeklyStats,
          rawResponse: '',
          parsedSuggestion: mockLLMSuggestion,
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
          appliedItems: null,
          createdAt: new Date(),
        },
      ];

      mockLLMAdvisorSuggestionFindMany.mockResolvedValue(mockStoredSuggestions);
      mockLLMAdvisorSuggestionCount.mockResolvedValue(1);

      const result = await llmWeeklyAdvisor.getSuggestions({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockLLMAdvisorSuggestionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
        }),
      );
    });

    it('should filter by status', async () => {
      mockLLMAdvisorSuggestionFindMany.mockResolvedValue([]);
      mockLLMAdvisorSuggestionCount.mockResolvedValue(0);

      await llmWeeklyAdvisor.getSuggestions({ status: 'pending' });

      expect(mockLLMAdvisorSuggestionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'pending' },
        }),
      );
    });
  });

  describe('getSuggestion', () => {
    it('should return suggestion by id', async () => {
      const mockStored = {
        id: 'stored-1',
        weekStart: new Date(),
        weekEnd: new Date(),
        statsSnapshot: mockWeeklyStats,
        rawResponse: '',
        parsedSuggestion: mockLLMSuggestion,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        appliedItems: null,
        createdAt: new Date(),
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(mockStored);

      const result = await llmWeeklyAdvisor.getSuggestion('stored-1');

      expect(result.id).toBe('stored-1');
      expect(mockLLMAdvisorSuggestionFindUnique).toHaveBeenCalledWith({
        where: { id: 'stored-1' },
      });
    });

    it('should return null for non-existent suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(null);

      const result = await llmWeeklyAdvisor.getSuggestion('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('approveSuggestion', () => {
    const mockStoredSuggestion = {
      id: 'stored-1',
      weekStart: new Date(),
      weekEnd: new Date(),
      statsSnapshot: mockWeeklyStats,
      rawResponse: '',
      parsedSuggestion: mockLLMSuggestion,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      appliedItems: null,
      createdAt: new Date(),
    };

    it('should approve suggestion and apply selected items', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(mockStoredSuggestion);
      mockUpdateThreshold.mockResolvedValue(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...mockStoredSuggestion,
        status: 'approved',
        reviewedBy: 'admin',
        reviewedAt: new Date(),
        appliedItems: ['suggestion-1'],
      });

      const result = await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['suggestion-1'],
        notes: 'Approved',
      });

      expect(result.status).toBe('approved');
      expect(mockUpdateThreshold).toHaveBeenCalledWith(
        'highAccuracy',
        0.88,
        'llm-advisor',
        'Improve learning outcomes',
        'stored-1',
      );
    });

    it('should mark as rejected when no items selected', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(mockStoredSuggestion);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...mockStoredSuggestion,
        status: 'rejected',
        reviewedBy: 'admin',
        appliedItems: [],
      });

      const result = await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: [],
      });

      expect(result.status).toBe('rejected');
    });

    it('should mark as partial when some items selected', async () => {
      const multiSuggestion = {
        ...mockStoredSuggestion,
        parsedSuggestion: {
          ...mockLLMSuggestion,
          suggestions: [
            mockLLMSuggestion.suggestions[0],
            { ...mockLLMSuggestion.suggestions[0], id: 'suggestion-2' },
          ],
        },
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(multiSuggestion);
      mockUpdateThreshold.mockResolvedValue(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...multiSuggestion,
        status: 'partial',
        reviewedBy: 'admin',
        appliedItems: ['suggestion-1'],
      });

      const result = await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['suggestion-1'],
      });

      expect(result.status).toBe('partial');
    });

    it('should throw error for non-existent suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(null);

      await expect(
        llmWeeklyAdvisor.approveSuggestion({
          suggestionId: 'non-existent',
          approvedBy: 'admin',
          selectedItems: [],
        }),
      ).rejects.toThrow('建议不存在');
    });

    it('should throw error for already reviewed suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue({
        ...mockStoredSuggestion,
        status: 'approved',
      });

      await expect(
        llmWeeklyAdvisor.approveSuggestion({
          suggestionId: 'stored-1',
          approvedBy: 'admin',
          selectedItems: [],
        }),
      ).rejects.toThrow('建议状态不允许审批');
    });

    it('should throw error for invalid item ids', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(mockStoredSuggestion);

      await expect(
        llmWeeklyAdvisor.approveSuggestion({
          suggestionId: 'stored-1',
          approvedBy: 'admin',
          selectedItems: ['invalid-item'],
        }),
      ).rejects.toThrow('无效的建议项');
    });
  });

  describe('rejectSuggestion', () => {
    const mockStoredSuggestion = {
      id: 'stored-1',
      weekStart: new Date(),
      weekEnd: new Date(),
      statsSnapshot: mockWeeklyStats,
      rawResponse: '',
      parsedSuggestion: mockLLMSuggestion,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      appliedItems: null,
      createdAt: new Date(),
    };

    it('should reject pending suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(mockStoredSuggestion);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...mockStoredSuggestion,
        status: 'rejected',
        reviewedBy: 'admin',
        reviewedAt: new Date(),
        reviewNotes: 'Not needed',
        appliedItems: [],
      });

      const result = await llmWeeklyAdvisor.rejectSuggestion('stored-1', 'admin', 'Not needed');

      expect(result.status).toBe('rejected');
      expect(mockLLMAdvisorSuggestionUpdate).toHaveBeenCalledWith({
        where: { id: 'stored-1' },
        data: expect.objectContaining({
          status: 'rejected',
          reviewedBy: 'admin',
          reviewNotes: 'Not needed',
          appliedItems: [],
        }),
      });
    });

    it('should throw error for non-existent suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(null);

      await expect(llmWeeklyAdvisor.rejectSuggestion('non-existent', 'admin')).rejects.toThrow(
        '建议不存在',
      );
    });

    it('should throw error for already reviewed suggestion', async () => {
      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue({
        ...mockStoredSuggestion,
        status: 'approved',
      });

      await expect(llmWeeklyAdvisor.rejectSuggestion('stored-1', 'admin')).rejects.toThrow(
        '建议状态不允许拒绝',
      );
    });
  });

  describe('getPendingCount', () => {
    it('should return count of pending suggestions', async () => {
      mockLLMAdvisorSuggestionCount.mockResolvedValue(5);

      const result = await llmWeeklyAdvisor.getPendingCount();

      expect(result).toBe(5);
      expect(mockLLMAdvisorSuggestionCount).toHaveBeenCalledWith({
        where: { status: 'pending' },
      });
    });
  });

  describe('getLatestSuggestion', () => {
    it('should return most recent suggestion', async () => {
      const mockStored = {
        id: 'latest-1',
        weekStart: new Date(),
        weekEnd: new Date(),
        statsSnapshot: mockWeeklyStats,
        rawResponse: '',
        parsedSuggestion: mockLLMSuggestion,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        appliedItems: null,
        createdAt: new Date(),
      };

      mockLLMAdvisorSuggestionFindFirst.mockResolvedValue(mockStored);

      const result = await llmWeeklyAdvisor.getLatestSuggestion();

      expect(result.id).toBe('latest-1');
      expect(mockLLMAdvisorSuggestionFindFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return null when no suggestions exist', async () => {
      mockLLMAdvisorSuggestionFindFirst.mockResolvedValue(null);

      const result = await llmWeeklyAdvisor.getLatestSuggestion();

      expect(result).toBeNull();
    });
  });

  describe('applySuggestionItem - different types', () => {
    const mockStoredSuggestion = {
      id: 'stored-1',
      weekStart: new Date(),
      weekEnd: new Date(),
      statsSnapshot: mockWeeklyStats,
      rawResponse: '',
      parsedSuggestion: mockLLMSuggestion,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      appliedItems: null,
      createdAt: new Date(),
    };

    it('should apply param_bound suggestion with explicit bound type', async () => {
      const paramBoundSuggestion = {
        ...mockStoredSuggestion,
        parsedSuggestion: {
          ...mockLLMSuggestion,
          suggestions: [
            {
              id: 'param-1',
              type: 'param_bound',
              target: 'alpha.min',
              currentValue: 0.3,
              suggestedValue: 0.35,
              reason: 'Improve stability',
              expectedImpact: 'Better convergence',
              risk: 'low',
              priority: 2,
            },
          ],
        },
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(paramBoundSuggestion);
      mockUpdateParamBound.mockResolvedValue(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...paramBoundSuggestion,
        status: 'approved',
      });

      await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['param-1'],
      });

      expect(mockUpdateParamBound).toHaveBeenCalledWith(
        'alpha',
        'min',
        0.35,
        'llm-advisor',
        'Improve stability',
        'stored-1',
      );
    });

    it('should apply reward_weight suggestion', async () => {
      const rewardWeightSuggestion = {
        ...mockStoredSuggestion,
        parsedSuggestion: {
          ...mockLLMSuggestion,
          suggestions: [
            {
              id: 'reward-1',
              type: 'reward_weight',
              target: 'correct',
              currentValue: 1.0,
              suggestedValue: 1.2,
              reason: 'Increase positive feedback',
              expectedImpact: 'Better motivation',
              risk: 'low',
              priority: 3,
            },
          ],
        },
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(rewardWeightSuggestion);
      mockUpdateRewardWeight.mockResolvedValue(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...rewardWeightSuggestion,
        status: 'approved',
      });

      await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['reward-1'],
      });

      expect(mockUpdateRewardWeight).toHaveBeenCalledWith(
        'correct',
        1.2,
        'llm-advisor',
        'Increase positive feedback',
        'stored-1',
      );
    });

    it('should apply safety_threshold suggestion', async () => {
      const safetyThresholdSuggestion = {
        ...mockStoredSuggestion,
        parsedSuggestion: {
          ...mockLLMSuggestion,
          suggestions: [
            {
              id: 'safety-1',
              type: 'safety_threshold',
              target: 'highFatigue',
              currentValue: 0.7,
              suggestedValue: 0.65,
              reason: 'Earlier fatigue detection',
              expectedImpact: 'Reduce burnout',
              risk: 'medium',
              priority: 1,
            },
          ],
        },
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(safetyThresholdSuggestion);
      mockUpdateSafetyThreshold.mockResolvedValue(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...safetyThresholdSuggestion,
        status: 'approved',
      });

      await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['safety-1'],
      });

      expect(mockUpdateSafetyThreshold).toHaveBeenCalledWith(
        'highFatigue',
        0.65,
        'llm-advisor',
        'Earlier fatigue detection',
        'stored-1',
      );
    });
  });

  describe('error handling in apply', () => {
    it('should continue processing other items when one fails', async () => {
      const multiSuggestion = {
        id: 'stored-1',
        weekStart: new Date(),
        weekEnd: new Date(),
        statsSnapshot: mockWeeklyStats,
        rawResponse: '',
        parsedSuggestion: {
          ...mockLLMSuggestion,
          suggestions: [
            {
              id: 'threshold-1',
              type: 'threshold',
              target: 'highAccuracy',
              currentValue: 0.85,
              suggestedValue: 0.88,
              reason: 'Test 1',
              expectedImpact: 'Impact 1',
              risk: 'low',
              priority: 2,
            },
            {
              id: 'threshold-2',
              type: 'threshold',
              target: 'lowAccuracy',
              currentValue: 0.6,
              suggestedValue: 0.55,
              reason: 'Test 2',
              expectedImpact: 'Impact 2',
              risk: 'low',
              priority: 3,
            },
          ],
        },
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        appliedItems: null,
        createdAt: new Date(),
      };

      mockLLMAdvisorSuggestionFindUnique.mockResolvedValue(multiSuggestion);
      // First call fails, second succeeds
      mockUpdateThreshold
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValueOnce(undefined);
      mockLLMAdvisorSuggestionUpdate.mockResolvedValue({
        ...multiSuggestion,
        status: 'partial',
      });

      const result = await llmWeeklyAdvisor.approveSuggestion({
        suggestionId: 'stored-1',
        approvedBy: 'admin',
        selectedItems: ['threshold-1', 'threshold-2'],
      });

      // Should still complete, with partial status
      expect(result).toBeDefined();
      expect(mockUpdateThreshold).toHaveBeenCalledTimes(2);
    });
  });
});
