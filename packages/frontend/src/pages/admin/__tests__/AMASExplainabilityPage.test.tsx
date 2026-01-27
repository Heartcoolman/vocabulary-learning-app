/**
 * AMASExplainabilityPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Use vi.hoisted to ensure mock is available when vi.mock is hoisted
const mockExplainabilityApi = vi.hoisted(() => ({
  getDecisionExplanation: vi.fn(),
  getLearningCurve: vi.fn(),
  getDecisionTimeline: vi.fn(),
  runCounterfactual: vi.fn(),
}));

// Mock useToast hook
vi.mock('../../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/ui')>();
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }),
  };
});

// Mock explainabilityApi
vi.mock('../../../services/explainabilityApi', () => ({
  explainabilityApi: mockExplainabilityApi,
}));

import AMASExplainabilityPage from '../AMASExplainabilityPage';

// Mock Icon components
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
    Warning: () => <span data-testid="warning-icon">Warning</span>,
    CheckCircle: () => <span data-testid="check-icon">Check</span>,
    Brain: () => <span data-testid="brain-icon">Brain</span>,
    Lightbulb: () => <span data-testid="lightbulb-icon">Lightbulb</span>,
    ArrowClockwise: () => <span data-testid="refresh-icon">Refresh</span>,
    Clock: () => <span data-testid="clock-icon">Clock</span>,
    TrendUp: () => <span data-testid="trend-up-icon">TrendUp</span>,
    TrendDown: () => <span data-testid="trend-down-icon">TrendDown</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    Info: () => <span data-testid="info-icon">Info</span>,
    Lightning: () => <span data-testid="lightning-icon">Lightning</span>,
    Target: () => <span data-testid="target-icon">Target</span>,
    ChartLine: () => <span data-testid="chart-icon">Chart</span>,
    Question: () => <span data-testid="question-icon">Question</span>,
  };
});

// Mock logger
vi.mock('../../../utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockExplanation = {
  decisionId: 'test-decision-123',
  timestamp: new Date().toISOString(),
  reasoning: 'Test reasoning explanation',
  state: {
    attention: 0.75,
    fatigue: 0.3,
    motivation: 0.8,
  },
  difficultyFactors: {
    length: 0.5,
    accuracy: 0.7,
  },
  weights: {
    sm2: 0.6,
    fsrs: 0.4,
  },
  factors: [
    {
      name: 'Test Factor',
      weight: 0.5,
      score: 0.8,
      explanation: 'Test factor explanation',
    },
  ],
  triggers: ['trigger1', 'trigger2'],
};

const mockLearningCurve = {
  currentMastery: 0.75,
  averageAttention: 0.8,
  trend: 'up',
  points: [
    { date: '2024-01-01', mastery: 0.6, attention: 0.7, fatigue: 0.2, motivation: 0.8 },
    { date: '2024-01-02', mastery: 0.75, attention: 0.8, fatigue: 0.3, motivation: 0.75 },
  ],
};

const mockTimeline = {
  items: [
    {
      answerId: 'answer-1',
      wordId: 'word-123',
      timestamp: new Date().toISOString(),
      decision: {
        decisionId: 'decision-1',
        confidence: 0.85,
      },
    },
  ],
  nextCursor: null,
};

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <AMASExplainabilityPage />
    </MemoryRouter>,
  );
};

describe('AMASExplainabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExplainabilityApi.getDecisionExplanation.mockResolvedValue(mockExplanation);
    mockExplainabilityApi.getLearningCurve.mockResolvedValue(mockLearningCurve);
    mockExplainabilityApi.getDecisionTimeline.mockResolvedValue(mockTimeline);
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('AMAS 可解释性')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/深入了解 AMAS 自适应学习系统/)).toBeInTheDocument();
      });
    });

    it('should render brain icon', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('brain-icon').length).toBeGreaterThan(0);
      });
    });
  });

  describe('decision explanation', () => {
    it('should display decision explanation section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('决策解释')).toBeInTheDocument();
      });
    });

    it('should show reasoning when available', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/Test reasoning explanation/)).toBeInTheDocument();
      });
    });

    it('should display learning state metrics', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('学习状态')).toBeInTheDocument();
        expect(screen.getByText('注意力')).toBeInTheDocument();
        expect(screen.getByText('疲劳度')).toBeInTheDocument();
        expect(screen.getByText('动机')).toBeInTheDocument();
      });
    });

    it('should display difficulty factors', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('难度因素')).toBeInTheDocument();
      });
    });
  });

  describe('learning curve', () => {
    it('should display learning curve section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('学习曲线')).toBeInTheDocument();
      });
    });

    it('should show current mastery', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('当前掌握度')).toBeInTheDocument();
        expect(screen.getByText('75.0%')).toBeInTheDocument();
      });
    });

    it('should show average attention', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('平均注意力')).toBeInTheDocument();
        expect(screen.getByText('80.0%')).toBeInTheDocument();
      });
    });

    it('should allow changing days filter', async () => {
      renderWithRouter();

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '14' } });

      await waitFor(() => {
        expect(mockExplainabilityApi.getLearningCurve).toHaveBeenCalledWith(14);
      });
    });
  });

  describe('decision timeline', () => {
    it('should display timeline section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('决策时间线')).toBeInTheDocument();
      });
    });

    it('should show timeline items', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/word-123/)).toBeInTheDocument();
      });
    });

    it('should show confidence level', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });
  });

  describe('counterfactual analysis', () => {
    it('should display counterfactual section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('反事实分析')).toBeInTheDocument();
      });
    });

    it('should show analysis description', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Use getAllByText since the text appears in multiple places (counterfactual section and explanation)
        expect(screen.getAllByText(/如果...会怎样/).length).toBeGreaterThan(0);
      });
    });

    it('should have run analysis button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('运行反事实分析')).toBeInTheDocument();
      });
    });

    it('should run counterfactual analysis on submit', async () => {
      const mockResult = {
        prediction: {
          wouldTriggerAdjustment: true,
          suggestedDifficulty: 'easier',
          estimatedAccuracyChange: 0.1,
        },
        baseState: { attention: 0.5, fatigue: 0.4, motivation: 0.6 },
        counterfactualState: { attention: 0.7, fatigue: 0.3, motivation: 0.8 },
        explanation: 'Test explanation',
      };
      mockExplainabilityApi.runCounterfactual.mockResolvedValue(mockResult);

      renderWithRouter();

      await waitFor(() => {
        const submitButton = screen.getByText('运行反事实分析');
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockExplainabilityApi.runCounterfactual).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('should show error when API fails', async () => {
      mockExplainabilityApi.getDecisionExplanation.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('warning-icon').length).toBeGreaterThan(0);
      });
    });
  });

  describe('refresh functionality', () => {
    it('should refresh data when refresh button is clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('决策解释')).toBeInTheDocument();
      });

      const refreshButtons = screen.getAllByTitle('刷新');
      expect(refreshButtons.length).toBeGreaterThan(0);

      fireEvent.click(refreshButtons[0]);

      await waitFor(() => {
        expect(mockExplainabilityApi.getDecisionExplanation).toHaveBeenCalledTimes(2);
      });
    });
  });
});
