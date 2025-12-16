/**
 * ExperimentDashboard Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExperimentDashboard from '../ExperimentDashboard';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    getExperiments: vi.fn(),
    startExperiment: vi.fn(),
    stopExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
    getExperimentStatus: vi.fn(),
    createExperiment: vi.fn(),
  },
}));

vi.mock('../../../services/client', () => ({
  default: mockApiClient,
  apiClient: mockApiClient,
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

// Mock Icon components from phosphor-icons/react (used via components/Icon)
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    Activity: () => <span data-testid="icon-activity">📊</span>,
    UsersThree: () => <span data-testid="icon-users">👥</span>,
    Scales: () => <span data-testid="icon-scales">⚖️</span>,
    Target: () => <span data-testid="icon-target">🎯</span>,
    CheckCircle: () => <span data-testid="icon-check">✓</span>,
    WarningCircle: () => <span data-testid="icon-warning">⚠️</span>,
    XCircle: () => <span data-testid="icon-x">✗</span>,
    ArrowsClockwise: () => <span data-testid="icon-refresh">↻</span>,
    Trophy: () => <span data-testid="icon-trophy">🏆</span>,
    ArrowRight: () => <span data-testid="icon-arrow">→</span>,
    TrendUp: () => <span data-testid="icon-trend">📈</span>,
    Flask: () => <span data-testid="icon-flask">🧪</span>,
    Plus: () => <span data-testid="icon-plus">+</span>,
    ChartBar: () => <span data-testid="icon-chart">📊</span>,
    Gear: () => <span data-testid="icon-gear">⚙️</span>,
  };
});

describe('ExperimentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );

    mockApiClient.getExperiments.mockResolvedValue({
      experiments: [
        {
          id: 'exp-running',
          name: '运行中实验',
          description: 'desc',
          status: 'RUNNING',
          trafficAllocation: 'EVEN',
          minSampleSize: 100,
          significanceLevel: 0.05,
          startedAt: new Date().toISOString(),
          endedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          variantCount: 2,
          totalSamples: 1000,
        },
        {
          id: 'exp-draft',
          name: '草稿实验',
          description: null,
          status: 'DRAFT',
          trafficAllocation: 'EVEN',
          minSampleSize: 100,
          significanceLevel: 0.05,
          startedAt: null,
          endedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          variantCount: 2,
          totalSamples: 0,
        },
      ],
    });

    mockApiClient.getExperimentStatus.mockResolvedValue({
      status: 'running',
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
    });
  });

  it('should show loading state initially', () => {
    render(<ExperimentDashboard />);
    expect(screen.getByTestId('icon-refresh')).toBeInTheDocument();
  });

  it('should render list header after loading', async () => {
    render(<ExperimentDashboard />);

    await waitFor(() => {
      expect(screen.getByText('A/B 测试实验管理')).toBeInTheDocument();
    });

    expect(screen.getByText('运行中实验')).toBeInTheDocument();
    expect(screen.getByText('草稿实验')).toBeInTheDocument();
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0);
  });

  it('should start draft experiment when start button clicked', async () => {
    render(<ExperimentDashboard />);

    await waitFor(() => {
      expect(screen.getByText('草稿实验')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('启动实验'));

    await waitFor(() => {
      expect(mockApiClient.startExperiment).toHaveBeenCalledWith('exp-draft');
    });
  });

  it('should stop running experiment when stop button clicked', async () => {
    render(<ExperimentDashboard />);

    await waitFor(() => {
      expect(screen.getByText('运行中实验')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('停止实验'));

    await waitFor(() => {
      expect(mockApiClient.stopExperiment).toHaveBeenCalledWith('exp-running');
    });
  });

  it('should delete non-running experiment when confirmed', async () => {
    render(<ExperimentDashboard />);

    await waitFor(() => {
      expect(screen.getByText('草稿实验')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('删除实验'));

    await waitFor(() => {
      expect(mockApiClient.deleteExperiment).toHaveBeenCalledWith('exp-draft');
    });
  });

  it('should open detail and display key metrics', async () => {
    render(<ExperimentDashboard />);

    await waitFor(() => {
      expect(screen.getByText('运行中实验')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle('查看详情')[0]);

    await waitFor(() => {
      expect(screen.getByText('实验详情')).toBeInTheDocument();
    });

    expect(mockApiClient.getExperimentStatus).toHaveBeenCalledWith('exp-running');
    expect(screen.getByText('0.0300')).toBeInTheDocument();
    expect(screen.getAllByText('15.0%').length).toBeGreaterThan(0);
    expect(screen.getByText('继续运行实验')).toBeInTheDocument();
  });
});
