/**
 * explainabilityApi Tests
 *
 * 测试可解释性 API 服务的功能，包括：
 * 1. 决策解释获取
 * 2. 反事实分析
 * 3. 学习曲线数据
 * 4. 决策时间线
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ApiClient
vi.mock('../ApiClient', () => ({
  default: {
    getAmasDecisionExplanation: vi.fn(),
    runCounterfactualAnalysis: vi.fn(),
    getAmasLearningCurve: vi.fn(),
    getDecisionTimeline: vi.fn(),
  },
}));

import { explainabilityApi } from '../explainabilityApi';
import apiClient from '../ApiClient';
import type {
  DecisionExplanation,
  CounterfactualInput,
  CounterfactualResult,
  LearningCurveData,
  DecisionTimelineResponse,
} from '../../types/explainability';

const mockApiClient = apiClient as {
  getAmasDecisionExplanation: ReturnType<typeof vi.fn>;
  runCounterfactualAnalysis: ReturnType<typeof vi.fn>;
  getAmasLearningCurve: ReturnType<typeof vi.fn>;
  getDecisionTimeline: ReturnType<typeof vi.fn>;
};

describe('explainabilityApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== getDecisionExplanation 测试 ====================

  describe('getDecisionExplanation', () => {
    const mockExplanation: DecisionExplanation = {
      decisionId: 'decision-123',
      timestamp: '2024-01-01T12:00:00.000Z',
      selectedWordId: 'word-1',
      reasoning: 'Based on user attention and fatigue levels',
      state: {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.7,
      },
      difficultyFactors: {
        length: 0.5,
        accuracy: 0.7,
        frequency: 0.6,
        forgetting: 0.4,
      },
      weights: {
        thompson: 0.3,
        linucb: 0.25,
        actr: 0.25,
        heuristic: 0.2,
      },
      triggers: ['high_attention', 'low_fatigue'],
      stages: [
        { stage: 'classify', durationMs: 10 },
        { stage: 'ensemble', durationMs: 25 },
      ],
    };

    it('should fetch decision explanation without decisionId', async () => {
      mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);

      const result = await explainabilityApi.getDecisionExplanation();

      expect(mockApiClient.getAmasDecisionExplanation).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockExplanation);
    });

    it('should fetch decision explanation with specific decisionId', async () => {
      mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);

      const result = await explainabilityApi.getDecisionExplanation('decision-123');

      expect(mockApiClient.getAmasDecisionExplanation).toHaveBeenCalledWith('decision-123');
      expect(result).toEqual(mockExplanation);
    });

    it('should handle API error', async () => {
      const error = new Error('API error');
      mockApiClient.getAmasDecisionExplanation.mockRejectedValue(error);

      await expect(explainabilityApi.getDecisionExplanation()).rejects.toThrow('API error');
    });

    it('should return explanation with all required fields', async () => {
      mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);

      const result = await explainabilityApi.getDecisionExplanation();

      expect(result).toHaveProperty('decisionId');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('difficultyFactors');
    });
  });

  // ==================== runCounterfactual 测试 ====================

  describe('runCounterfactual', () => {
    const mockInput: CounterfactualInput = {
      decisionId: 'decision-123',
      overrides: {
        attention: 0.5,
        fatigue: 0.8,
        motivation: 0.3,
      },
    };

    const mockResult: CounterfactualResult = {
      baseDecisionId: 'decision-123',
      baseState: {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.7,
      },
      counterfactualState: {
        attention: 0.5,
        fatigue: 0.8,
        motivation: 0.3,
      },
      prediction: {
        wouldTriggerAdjustment: true,
        suggestedDifficulty: 'easier',
        estimatedAccuracyChange: -0.15,
      },
      explanation: 'High fatigue would trigger difficulty adjustment',
    };

    it('should run counterfactual analysis', async () => {
      mockApiClient.runCounterfactualAnalysis.mockResolvedValue(mockResult);

      const result = await explainabilityApi.runCounterfactual(mockInput);

      expect(mockApiClient.runCounterfactualAnalysis).toHaveBeenCalledWith(mockInput);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty overrides', async () => {
      const inputWithEmptyOverrides: CounterfactualInput = {
        decisionId: 'decision-123',
      };
      mockApiClient.runCounterfactualAnalysis.mockResolvedValue(mockResult);

      await explainabilityApi.runCounterfactual(inputWithEmptyOverrides);

      expect(mockApiClient.runCounterfactualAnalysis).toHaveBeenCalledWith(inputWithEmptyOverrides);
    });

    it('should return prediction with adjustment information', async () => {
      mockApiClient.runCounterfactualAnalysis.mockResolvedValue(mockResult);

      const result = await explainabilityApi.runCounterfactual(mockInput);

      expect(result.prediction).toHaveProperty('wouldTriggerAdjustment');
      expect(result.prediction).toHaveProperty('estimatedAccuracyChange');
    });

    it('should handle API error', async () => {
      mockApiClient.runCounterfactualAnalysis.mockRejectedValue(new Error('Analysis failed'));

      await expect(explainabilityApi.runCounterfactual(mockInput)).rejects.toThrow('Analysis failed');
    });
  });

  // ==================== getLearningCurve 测试 ====================

  describe('getLearningCurve', () => {
    const mockLearningCurve: LearningCurveData = {
      points: [
        {
          date: '2024-01-01',
          mastery: 0.5,
          masteredCount: 50,
          accuracy: 0.7,
          attention: 0.8,
          fatigue: 0.2,
          motivation: 0.75,
        },
        {
          date: '2024-01-02',
          mastery: 0.55,
          masteredCount: 55,
          accuracy: 0.72,
          attention: 0.75,
          fatigue: 0.3,
          motivation: 0.7,
        },
      ],
      trend: 'up',
      currentMastery: 0.55,
      averageAttention: 0.775,
    };

    it('should fetch learning curve with default days', async () => {
      mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);

      const result = await explainabilityApi.getLearningCurve();

      expect(mockApiClient.getAmasLearningCurve).toHaveBeenCalledWith(30);
      expect(result).toEqual(mockLearningCurve);
    });

    it('should fetch learning curve with custom days', async () => {
      mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);

      const result = await explainabilityApi.getLearningCurve(7);

      expect(mockApiClient.getAmasLearningCurve).toHaveBeenCalledWith(7);
      expect(result).toEqual(mockLearningCurve);
    });

    it('should return points with all metrics', async () => {
      mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);

      const result = await explainabilityApi.getLearningCurve();

      expect(result.points.length).toBeGreaterThan(0);
      expect(result.points[0]).toHaveProperty('date');
      expect(result.points[0]).toHaveProperty('mastery');
    });

    it('should return trend information', async () => {
      mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);

      const result = await explainabilityApi.getLearningCurve();

      expect(['up', 'flat', 'down']).toContain(result.trend);
      expect(result.currentMastery).toBeDefined();
      expect(result.averageAttention).toBeDefined();
    });

    it('should handle API error', async () => {
      mockApiClient.getAmasLearningCurve.mockRejectedValue(new Error('Fetch failed'));

      await expect(explainabilityApi.getLearningCurve()).rejects.toThrow('Fetch failed');
    });
  });

  // ==================== getDecisionTimeline 测试 ====================

  describe('getDecisionTimeline', () => {
    const mockTimeline: DecisionTimelineResponse = {
      items: [
        {
          answerId: 'answer-1',
          wordId: 'word-1',
          timestamp: '2024-01-01T12:00:00.000Z',
          decision: {
            decisionId: 'decision-1',
            confidence: 0.85,
            selectedAction: { type: 'continue' },
          },
        },
        {
          answerId: 'answer-2',
          wordId: 'word-2',
          timestamp: '2024-01-01T12:01:00.000Z',
          decision: {
            decisionId: 'decision-2',
            confidence: 0.9,
            selectedAction: { type: 'review' },
          },
        },
      ],
      nextCursor: 'cursor-abc',
    };

    it('should fetch decision timeline with default parameters', async () => {
      mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);

      const result = await explainabilityApi.getDecisionTimeline();

      expect(mockApiClient.getDecisionTimeline).toHaveBeenCalledWith(50, undefined);
      expect(result).toEqual(mockTimeline);
    });

    it('should fetch decision timeline with custom limit', async () => {
      mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);

      const result = await explainabilityApi.getDecisionTimeline(100);

      expect(mockApiClient.getDecisionTimeline).toHaveBeenCalledWith(100, undefined);
      expect(result).toEqual(mockTimeline);
    });

    it('should fetch decision timeline with cursor for pagination', async () => {
      mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);

      const result = await explainabilityApi.getDecisionTimeline(50, 'cursor-xyz');

      expect(mockApiClient.getDecisionTimeline).toHaveBeenCalledWith(50, 'cursor-xyz');
      expect(result).toEqual(mockTimeline);
    });

    it('should return items with decision information', async () => {
      mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);

      const result = await explainabilityApi.getDecisionTimeline();

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty('answerId');
      expect(result.items[0]).toHaveProperty('wordId');
      expect(result.items[0]).toHaveProperty('timestamp');
      expect(result.items[0]).toHaveProperty('decision');
    });

    it('should return nextCursor for pagination', async () => {
      mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);

      const result = await explainabilityApi.getDecisionTimeline();

      expect(result.nextCursor).toBe('cursor-abc');
    });

    it('should handle empty timeline', async () => {
      const emptyTimeline: DecisionTimelineResponse = {
        items: [],
        nextCursor: null,
      };
      mockApiClient.getDecisionTimeline.mockResolvedValue(emptyTimeline);

      const result = await explainabilityApi.getDecisionTimeline();

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle API error', async () => {
      mockApiClient.getDecisionTimeline.mockRejectedValue(new Error('Timeline fetch failed'));

      await expect(explainabilityApi.getDecisionTimeline()).rejects.toThrow('Timeline fetch failed');
    });
  });
});
