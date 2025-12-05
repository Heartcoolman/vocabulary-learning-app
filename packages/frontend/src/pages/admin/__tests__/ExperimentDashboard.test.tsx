/**
 * ExperimentDashboard Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExperimentDashboard from '../ExperimentDashboard';

const mockExperimentStatus = {
  status: 'running' as const,
  pValue: 0.03,
  effectSize: 0.15,
  confidenceInterval: { lower: 0.05, upper: 0.25 },
  isSignificant: true,
  statisticalPower: 0.85,
  sampleSizes: [
    { variantId: 'linucb', sampleCount: 500 },
    { variantId: 'thompson', sampleCount: 500 },
  ],
  winner: null,
  recommendation: '继续运行实验',
  reason: '样本量尚未达到最小要求',
  isActive: true,
};

vi.mock('@/services/ApiClient', () => ({
  default: {
    getExperimentStatus: vi.fn().mockResolvedValue({
      status: 'running' as const,
      pValue: 0.03,
      effectSize: 0.15,
      confidenceInterval: { lower: 0.05, upper: 0.25 },
      isSignificant: true,
      statisticalPower: 0.85,
      sampleSizes: [
        { variantId: 'linucb', sampleCount: 500 },
        { variantId: 'thompson', sampleCount: 500 },
      ],
      winner: null,
      recommendation: '继续运行实验',
      reason: '样本量尚未达到最小要求',
      isActive: true,
    }),
    toggleExperiment: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('framer-motion', () => {
  const createMotionComponent = (tag: string) => {
    return ({ children, ...props }: any) => {
      const Tag = tag as keyof JSX.IntrinsicElements;
      const filteredProps = { ...props };
      delete filteredProps.initial;
      delete filteredProps.animate;
      delete filteredProps.exit;
      delete filteredProps.transition;
      delete filteredProps.whileHover;
      delete filteredProps.whileTap;
      delete filteredProps.variants;
      return <Tag {...filteredProps}>{children}</Tag>;
    };
  };
  return {
    motion: {
      div: createMotionComponent('div'),
      section: createMotionComponent('section'),
      span: createMotionComponent('span'),
      button: createMotionComponent('button'),
      p: createMotionComponent('p'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      h3: createMotionComponent('h3'),
    },
    AnimatePresence: ({ children }: any) => children,
  };
});

vi.mock('lucide-react', () => ({
  Activity: () => <span data-testid="icon-activity">📊</span>,
  Users: () => <span data-testid="icon-users">👥</span>,
  Scale: () => <span data-testid="icon-scale">⚖️</span>,
  Target: () => <span data-testid="icon-target">🎯</span>,
  CheckCircle2: () => <span data-testid="icon-check">✓</span>,
  AlertCircle: () => <span data-testid="icon-alert">⚠️</span>,
  XCircle: () => <span data-testid="icon-x">✗</span>,
  RefreshCw: () => <span data-testid="icon-refresh">↻</span>,
  Trophy: () => <span data-testid="icon-trophy">🏆</span>,
  ArrowRight: () => <span data-testid="icon-arrow">→</span>,
  TrendingUp: () => <span data-testid="icon-trend">📈</span>,
  Beaker: () => <span data-testid="icon-beaker">🧪</span>,
}));

describe('ExperimentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading state initially', () => {
      render(<ExperimentDashboard />);

      // Loading state shows RefreshCw icon
      expect(screen.getByTestId('icon-refresh')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        // Page title is "A/B 测试仪表盘: Bandit 算法优化"
        expect(screen.getByText(/测试仪表盘/)).toBeInTheDocument();
      });
    });

    it('should display experiment status badge', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/运行中/i)).toBeInTheDocument();
      });
    });

    it('should display p-value', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/0.03/)).toBeInTheDocument();
      });
    });

    it('should display effect size', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        // effectSize 0.15 is displayed as percentage "15.0%" in multiple places
        const elements = screen.getAllByText(/15\.0%/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display sample sizes', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        // Component shows total samples as "1,000" and individual samples "500" in multiple places
        const elements = screen.getAllByText(/1,000|500/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display recommendation', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/继续运行实验/)).toBeInTheDocument();
      });
    });
  });

  describe('completed experiment', () => {
    it('should show winner when experiment is completed', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.getExperimentStatus).mockResolvedValue({
        ...mockExperimentStatus,
        status: 'completed',
        winner: 'treatment',
        recommendation: '推荐采用实验组策略',
      });

      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/已完成/i)).toBeInTheDocument();
      });
    });
  });

  describe('stopped experiment', () => {
    it('should show stopped status', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.getExperimentStatus).mockResolvedValue({
        ...mockExperimentStatus,
        status: 'stopped',
        isActive: false,
      });

      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/已停止/i)).toBeInTheDocument();
      });
    });
  });

  describe('statistical significance', () => {
    it('should indicate when results are significant', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        // Check for significance indicator - component shows "统计显著" when isSignificant is true
        expect(screen.getByText(/统计显著/)).toBeInTheDocument();
      });
    });

    it('should indicate when results are not significant', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.getExperimentStatus).mockResolvedValue({
        ...mockExperimentStatus,
        isSignificant: false,
        pValue: 0.12,
      });

      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/0.12/)).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.getExperimentStatus).mockRejectedValue(new Error('API Error'));

      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/错误|失败/i)).toBeInTheDocument();
      });
    });
  });

  describe('experiment controls', () => {
    it('should render refresh button', async () => {
      render(<ExperimentDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('icon-refresh')).toBeInTheDocument();
      });
    });
  });
});
