/**
 * ExplainabilityModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ExplainabilityModal from '../ExplainabilityModal';
import { explainabilityApi } from '../../../services/explainabilityApi';
import type { AmasProcessResult } from '../../../types/amas';

// Mock createPortal
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (children: any) => children,
  };
});

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  X: () => <span data-testid="icon-x">X</span>,
  ChartPie: () => <span data-testid="icon-chartpie">ChartPie</span>,
  Sliders: () => <span data-testid="icon-sliders">Sliders</span>,
  TrendUp: () => <span data-testid="icon-trendup">TrendUp</span>,
  Flask: () => <span data-testid="icon-flask">Flask</span>,
}));

// Mock child components
vi.mock('../DecisionFactors', () => ({
  default: ({ factors }: any) => (
    <div data-testid="decision-factors">DecisionFactors: {factors.length} items</div>
  ),
}));

vi.mock('../WeightRadarChart', () => ({
  default: ({ weights }: any) => (
    <div data-testid="weight-radar-chart">WeightRadarChart: {JSON.stringify(weights)}</div>
  ),
}));

vi.mock('../LearningCurveChart', () => ({
  default: ({ data }: any) => (
    <div data-testid="learning-curve-chart">LearningCurveChart: {data.length} points</div>
  ),
}));

vi.mock('../CounterfactualPanel', () => ({
  default: ({ decisionId }: any) => (
    <div data-testid="counterfactual-panel">CounterfactualPanel: {decisionId}</div>
  ),
}));

// Mock API
vi.mock('../../../services/explainabilityApi', () => ({
  explainabilityApi: {
    getDecisionExplanation: vi.fn(),
    getLearningCurve: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
  },
}));

const mockLatestDecision: AmasProcessResult = {
  sessionId: 'test-session-1',
  selectedWord: { id: 'word-1', spelling: 'test', phonetic: '/test/', meanings: ['测试'], examples: [] },
  explanation: '选择此单词是因为它匹配当前学习状态。',
  confidence: 0.85,
  state: {
    attention: 0.7,
    fatigue: 0.3,
    motivation: 0.8,
    memory: 0.6,
    speed: 0.5,
  },
};

const mockExplanationResponse = {
  decisionId: 'decision-1',
  timestamp: new Date().toISOString(),
  reasoning: '基于多因素分析选择此单词',
  state: { attention: 0.7, fatigue: 0.3, motivation: 0.8 },
  difficultyFactors: { length: 0.5, accuracy: 0.6, frequency: 0.4, forgetting: 0.3 },
  factors: [
    { name: '记忆强度', score: 0.6, weight: 0.4, explanation: '记忆痕迹', icon: 'memory' },
  ],
  weights: { thompson: 0.5, linucb: 0.25, actr: 0.15, heuristic: 0.1 },
};

const mockCurveResponse = {
  points: [
    { date: '2024-01-01', mastery: 30 },
    { date: '2024-01-02', mastery: 45 },
  ],
  trend: 'up' as const,
  currentMastery: 45,
  averageAttention: 0.7,
};

describe('ExplainabilityModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (explainabilityApi.getDecisionExplanation as any).mockResolvedValue(mockExplanationResponse);
    (explainabilityApi.getLearningCurve as any).mockResolvedValue(mockCurveResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <ExplainabilityModal
          isOpen={false}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.queryByText('AMAS 决策透视')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByText('AMAS 决策透视')).toBeInTheDocument();
    });

    it('should render subtitle', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByText('为什么选择这个词？')).toBeInTheDocument();
    });

    it('should render all tab buttons', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByText('决策因素')).toBeInTheDocument();
      expect(screen.getByText('算法权重')).toBeInTheDocument();
      expect(screen.getByText('学习曲线')).toBeInTheDocument();
      expect(screen.getByText('反事实分析')).toBeInTheDocument();
    });

    it('should render close button', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    });

    it('should render footer', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByText(/Powered by AMAS/)).toBeInTheDocument();
    });
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should show loading spinner initially', async () => {
      (explainabilityApi.getDecisionExplanation as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockExplanationResponse), 100))
      );

      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      expect(screen.getByText('正在解析 AI 决策...')).toBeInTheDocument();
    });
  });

  // ==================== Tab Navigation Tests ====================

  describe('tab navigation', () => {
    it('should show DecisionFactors by default', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('decision-factors')).toBeInTheDocument();
      });
    });

    it('should switch to WeightRadarChart tab', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('正在解析 AI 决策...')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('算法权重'));
      });

      expect(screen.getByTestId('weight-radar-chart')).toBeInTheDocument();
    });

    it('should switch to LearningCurveChart tab', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('正在解析 AI 决策...')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('学习曲线'));
      });

      expect(screen.getByTestId('learning-curve-chart')).toBeInTheDocument();
    });

    it('should switch to CounterfactualPanel tab', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('正在解析 AI 决策...')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('反事实分析'));
      });

      expect(screen.getByTestId('counterfactual-panel')).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when close button clicked', async () => {
      const onClose = vi.fn();
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={onClose}
          latestDecision={mockLatestDecision}
        />
      );

      const closeButton = screen.getByTestId('icon-x').parentElement;
      await act(async () => {
        fireEvent.click(closeButton!);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay clicked', async () => {
      const onClose = vi.fn();
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={onClose}
          latestDecision={mockLatestDecision}
        />
      );

      const overlay = document.querySelector('.backdrop-blur-sm');
      await act(async () => {
        fireEvent.click(overlay!);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should gracefully fallback to latestDecision when API fails', async () => {
      // When API fails with .catch(() => null), component uses latestDecision as fallback
      (explainabilityApi.getDecisionExplanation as any).mockRejectedValue(new Error('API Error'));
      (explainabilityApi.getLearningCurve as any).mockRejectedValue(new Error('API Error'));

      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      // Component should still show content using latestDecision fallback
      await waitFor(() => {
        // Should show the fallback reasoning from latestDecision.explanation
        expect(screen.getByText(/AI 思考：/)).toBeInTheDocument();
      });
    });

    it('should handle missing latestDecision', () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={null}
        />
      );

      // Should not crash and show loading or empty state
      expect(screen.getByText('AMAS 决策透视')).toBeInTheDocument();
    });
  });

  // ==================== Content Display Tests ====================

  describe('content display', () => {
    it('should display AI reasoning', async () => {
      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/AI 思考：/)).toBeInTheDocument();
      });
    });

    it('should handle empty learning curve data', async () => {
      (explainabilityApi.getLearningCurve as any).mockResolvedValue({ points: [] });

      render(
        <ExplainabilityModal
          isOpen={true}
          onClose={vi.fn()}
          latestDecision={mockLatestDecision}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('正在解析 AI 决策...')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('学习曲线'));
      });

      expect(screen.getByTestId('learning-curve-chart')).toBeInTheDocument();
    });
  });
});
