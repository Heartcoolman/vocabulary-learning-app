import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useAmasDecisionExplanation,
  useAmasLearningCurve,
  useDecisionTimeline,
  useCounterfactualAnalysis,
  useFullExplanation,
} from '../useAmasExplanation';
import ApiClient from '../../../services/ApiClient';
import type {
  DecisionExplanation,
  LearningCurveData,
  DecisionTimelineResponse,
  CounterfactualResult,
} from '../../../types/explainability';

// Mock ApiClient
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getAmasDecisionExplanation: vi.fn(),
    getAmasLearningCurve: vi.fn(),
    getDecisionTimeline: vi.fn(),
    runCounterfactualAnalysis: vi.fn(),
  },
}));

const mockApiClient = ApiClient as {
  getAmasDecisionExplanation: ReturnType<typeof vi.fn>;
  getAmasLearningCurve: ReturnType<typeof vi.fn>;
  getDecisionTimeline: ReturnType<typeof vi.fn>;
  runCounterfactualAnalysis: ReturnType<typeof vi.fn>;
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Mock数据
const mockExplanation: DecisionExplanation = {
  decisionId: 'decision-123',
  timestamp: '2024-01-01T00:00:00Z',
  selectedWordId: 'word-123',
  reasoning: 'User showing high fatigue, reducing difficulty',
  state: {
    attention: 0.6,
    fatigue: 0.8,
    motivation: 0.5,
  },
  difficultyFactors: {
    length: 0.7,
    accuracy: 0.8,
    frequency: 0.6,
    forgetting: 0.5,
  },
  weights: {
    thompson: 0.3,
    linucb: 0.25,
    actr: 0.25,
    heuristic: 0.2,
  },
  triggers: ['high_fatigue', 'low_attention'],
};

const mockLearningCurve: LearningCurveData = {
  points: [
    {
      date: '2024-01-01',
      mastery: 0.5,
      masteredCount: 10,
      accuracy: 0.7,
      attention: 0.8,
      fatigue: 0.3,
      motivation: 0.7,
    },
    {
      date: '2024-01-02',
      mastery: 0.6,
      masteredCount: 15,
      accuracy: 0.75,
      attention: 0.75,
      fatigue: 0.4,
      motivation: 0.8,
    },
  ],
  trend: 'up',
  currentMastery: 0.6,
  averageAttention: 0.775,
};

const mockTimeline: DecisionTimelineResponse = {
  items: [
    {
      answerId: 'answer-1',
      wordId: 'word-1',
      timestamp: '2024-01-01T00:00:00Z',
      decision: {
        decisionId: 'decision-1',
        confidence: 0.8,
        selectedAction: { difficulty: 'mid' },
      },
    },
  ],
  nextCursor: 'cursor-123',
};

const mockCounterfactualResult: CounterfactualResult = {
  baseDecisionId: 'decision-123',
  baseState: {
    attention: 0.6,
    fatigue: 0.8,
    motivation: 0.5,
  },
  counterfactualState: {
    attention: 0.6,
    fatigue: 0.3,
    motivation: 0.5,
  },
  prediction: {
    wouldTriggerAdjustment: true,
    suggestedDifficulty: 'harder',
    estimatedAccuracyChange: 0.15,
  },
  explanation: 'If fatigue was lower, system would suggest harder difficulty',
};

describe('useAmasDecisionExplanation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch decision explanation successfully', async () => {
    mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAmasDecisionExplanation('decision-123'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockExplanation);
    expect(mockApiClient.getAmasDecisionExplanation).toHaveBeenCalledWith('decision-123');
  });

  it('should fetch latest explanation when no decisionId provided', async () => {
    mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAmasDecisionExplanation(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.getAmasDecisionExplanation).toHaveBeenCalledWith(undefined);
  });

  it('should respect enabled option', async () => {
    mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(
      () => useAmasDecisionExplanation('decision-123', { enabled: false }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    // 不应该发起请求
    expect(mockApiClient.getAmasDecisionExplanation).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it.skip('should handle API error', async () => {
    const error = new Error('API Error');
    mockApiClient.getAmasDecisionExplanation.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAmasDecisionExplanation('decision-123'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });
});

describe('useAmasLearningCurve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch learning curve successfully', async () => {
    mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useAmasLearningCurve(30), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockLearningCurve);
    expect(mockApiClient.getAmasLearningCurve).toHaveBeenCalledWith(30);
  });

  it('should use default 30 days', async () => {
    mockApiClient.getAmasLearningCurve.mockResolvedValue(mockLearningCurve);
    const queryClient = createTestQueryClient();

    renderHook(() => useAmasLearningCurve(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockApiClient.getAmasLearningCurve).toHaveBeenCalledWith(30);
    });
  });
});

describe('useDecisionTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch decision timeline successfully', async () => {
    mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useDecisionTimeline(50), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTimeline);
    expect(mockApiClient.getDecisionTimeline).toHaveBeenCalledWith(50, undefined);
  });

  it('should support pagination with cursor', async () => {
    mockApiClient.getDecisionTimeline.mockResolvedValue(mockTimeline);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useDecisionTimeline(50, 'cursor-123'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockApiClient.getDecisionTimeline).toHaveBeenCalledWith(50, 'cursor-123');
  });
});

describe('useCounterfactualAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run counterfactual analysis successfully', async () => {
    mockApiClient.runCounterfactualAnalysis.mockResolvedValue(mockCounterfactualResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCounterfactualAnalysis(), {
      wrapper: createWrapper(queryClient),
    });

    const input = {
      decisionId: 'decision-123',
      overrides: {
        fatigue: 0.3,
      },
    };

    act(() => {
      result.current.mutate(input);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCounterfactualResult);
    expect(mockApiClient.runCounterfactualAnalysis).toHaveBeenCalledWith(input);
  });

  it.skip('should handle mutation error', async () => {
    const error = new Error('Mutation Error');
    mockApiClient.runCounterfactualAnalysis.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useCounterfactualAnalysis(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ decisionId: 'decision-123' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
  });
});

describe('useFullExplanation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should combine explanation and counterfactual functionality', async () => {
    mockApiClient.getAmasDecisionExplanation.mockResolvedValue(mockExplanation);
    mockApiClient.runCounterfactualAnalysis.mockResolvedValue(mockCounterfactualResult);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useFullExplanation('decision-123'), {
      wrapper: createWrapper(queryClient),
    });

    // 等待explanation加载完成
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.explanation).toEqual(mockExplanation);

    // 运行反事实分析
    act(() => {
      result.current.runCounterfactual({
        decisionId: 'decision-123',
        overrides: { fatigue: 0.3 },
      });
    });

    await waitFor(() => {
      expect(result.current.isRunningCounterfactual).toBe(false);
    });

    expect(result.current.counterfactualResult).toEqual(mockCounterfactualResult);
  });

  it.skip('should handle explanation error', async () => {
    const error = new Error('Explanation Error');
    mockApiClient.getAmasDecisionExplanation.mockRejectedValue(error);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useFullExplanation('decision-123'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
    });
  });
});
