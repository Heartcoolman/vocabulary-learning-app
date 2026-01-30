import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import type { ReactNode, HTMLAttributes } from 'react';
import SystemStatusPage from '../SystemStatusPage';

type MockMotionProps = HTMLAttributes<HTMLElement> & { children?: ReactNode };

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MockMotionProps) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: MockMotionProps) => <span {...props}>{children}</span>,
    p: ({ children, ...props }: MockMotionProps) => <p {...props}>{children}</p>,
    li: ({ children, ...props }: MockMotionProps) => <li {...props}>{children}</li>,
    ul: ({ children, ...props }: MockMotionProps) => <ul {...props}>{children}</ul>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Mock aboutApi
const mockPipelineStatus = {
  systemHealth: 'healthy',
  totalThroughput: 150,
  layers: [
    {
      id: 'PERCEPTION',
      name: 'Perception',
      nameCn: '感知层',
      processedCount: 1500,
      avgLatencyMs: 5,
      successRate: 0.99,
      status: 'healthy',
    },
    {
      id: 'MODELING',
      name: 'Modeling',
      nameCn: '建模层',
      processedCount: 1400,
      avgLatencyMs: 8,
      successRate: 0.98,
      status: 'healthy',
    },
    {
      id: 'LEARNING',
      name: 'Learning',
      nameCn: '学习层',
      processedCount: 1300,
      avgLatencyMs: 12,
      successRate: 0.97,
      status: 'healthy',
    },
    {
      id: 'DECISION',
      name: 'Decision',
      nameCn: '决策层',
      processedCount: 1200,
      avgLatencyMs: 10,
      successRate: 0.99,
      status: 'healthy',
    },
    {
      id: 'EVALUATION',
      name: 'Evaluation',
      nameCn: '评估层',
      processedCount: 1100,
      avgLatencyMs: 6,
      successRate: 0.98,
      status: 'degraded',
    },
    {
      id: 'OPTIMIZATION',
      name: 'Optimization',
      nameCn: '优化层',
      processedCount: 1000,
      avgLatencyMs: 15,
      successRate: 0.96,
      status: 'healthy',
    },
  ],
};

const mockAlgorithmStatus = {
  ensembleConsensusRate: 0.85,
  algorithms: [
    {
      id: 'thompson',
      name: 'Thompson Sampling',
      weight: 0.35,
      callCount: 450,
      avgLatencyMs: 8,
      explorationRate: 0.15,
    },
    {
      id: 'linucb',
      name: 'LinUCB',
      weight: 0.25,
      callCount: 320,
      avgLatencyMs: 12,
      explorationRate: 0.2,
    },
    {
      id: 'actr',
      name: 'ACT-R',
      weight: 0.2,
      callCount: 250,
      avgLatencyMs: 6,
      explorationRate: 0.1,
    },
    {
      id: 'heuristic',
      name: 'Heuristic',
      weight: 0.2,
      callCount: 230,
      avgLatencyMs: 3,
      explorationRate: 0.05,
    },
  ],
  coldstartStats: {
    classifyCount: 150,
    exploreCount: 80,
    normalCount: 1020,
    userTypeDistribution: { fast: 0.35, stable: 0.45, cautious: 0.2 },
  },
};

const mockUserStateStatus = {
  distributions: {
    attention: { avg: 0.72, low: 0.15, medium: 0.45, high: 0.4, lowAlertCount: 12 },
    fatigue: { avg: 0.28, fresh: 0.55, normal: 0.35, tired: 0.1, highAlertCount: 5 },
    motivation: { avg: 0.35, frustrated: 0.1, neutral: 0.4, motivated: 0.5, lowAlertCount: 8 },
    cognitive: { memory: 0.7, speed: 0.75, stability: 0.68 },
  },
  recentInferences: [
    {
      id: 'user-1',
      timestamp: '2024-01-15T10:00:00.000Z',
      attention: 0.8,
      fatigue: 0.2,
      motivation: 0.6,
      confidence: 0.92,
    },
    {
      id: 'user-2',
      timestamp: '2024-01-15T09:55:00.000Z',
      attention: 0.65,
      fatigue: 0.35,
      motivation: 0.4,
      confidence: 0.88,
    },
  ],
  modelParams: {
    attention: { beta: 0.5, weights: { responseTime: 0.4, errorRate: 0.3, engagement: 0.3 } },
    fatigue: { decayK: 0.1, longBreakThreshold: 30 },
    motivation: { rho: 0.5, kappa: 0.3, lambda: 0.2 },
  },
};

const mockMemoryStatus = {
  strengthDistribution: [
    { range: '0-20%', count: 150, percentage: 15 },
    { range: '20-40%', count: 200, percentage: 20 },
    { range: '40-60%', count: 250, percentage: 25 },
    { range: '60-80%', count: 250, percentage: 25 },
    { range: '80-100%', count: 150, percentage: 15 },
  ],
  urgentReviewCount: 250,
  soonReviewCount: 500,
  stableCount: 1200,
  avgHalfLifeDays: 4.5,
  todayConsolidationRate: 78.5,
};

const mockFeatureFlags = {
  readEnabled: true,
  writeEnabled: true,
  flags: {
    trendAnalyzer: { enabled: true, status: 'healthy', latencyMs: 40 },
    heuristicBaseline: { enabled: true, status: 'healthy', latencyMs: 25 },
    igeSampling: { enabled: true, status: 'healthy', latencyMs: 30 },
    msmtMemory: { enabled: true, status: 'healthy', latencyMs: 20 },
    ensemble: { enabled: true, status: 'healthy' },
    coldStartManager: { enabled: true, status: 'healthy' },
    userParamsManager: { enabled: true, status: 'healthy' },
    causalInference: { enabled: true, status: 'healthy', latencyMs: 60 },
    bayesianOptimizer: { enabled: false, status: 'disabled' },
    delayedReward: { enabled: true, status: 'healthy' },
    realDataRead: { enabled: true, status: 'healthy' },
    realDataWrite: { enabled: true, status: 'healthy' },
    visualization: { enabled: true, status: 'healthy' },
  },
};

vi.mock('../../../services/aboutApi', () => ({
  getPipelineLayerStatusWithSource: vi.fn(),
  getAlgorithmStatusWithSource: vi.fn(),
  getUserStateStatusWithSource: vi.fn(),
  getMemoryStatusWithSource: vi.fn(),
  getModuleHealthWithSource: vi.fn(),
  getOverviewStatsWithSource: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock animations
vi.mock('../../../utils/animations', () => ({
  fadeInVariants: {},
  staggerContainerVariants: {},
}));

import {
  getPipelineLayerStatusWithSource,
  getAlgorithmStatusWithSource,
  getUserStateStatusWithSource,
  getMemoryStatusWithSource,
  getModuleHealthWithSource,
  getOverviewStatsWithSource,
} from '../../../services/aboutApi';

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPipelineLayerStatusWithSource as Mock).mockResolvedValue({
      data: mockPipelineStatus,
      source: 'virtual',
    });
    (getAlgorithmStatusWithSource as Mock).mockResolvedValue({
      data: mockAlgorithmStatus,
      source: 'virtual',
    });
    (getUserStateStatusWithSource as Mock).mockResolvedValue({
      data: mockUserStateStatus,
      source: 'virtual',
    });
    (getMemoryStatusWithSource as Mock).mockResolvedValue({
      data: mockMemoryStatus,
      source: 'virtual',
    });
    (getModuleHealthWithSource as Mock).mockResolvedValue({
      data: mockFeatureFlags,
      source: 'virtual',
    });
    (getOverviewStatsWithSource as Mock).mockResolvedValue({
      data: { todayDecisions: 0, activeUsers: 0, totalWords: 0, avgAccuracy: 0 },
      source: 'virtual',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <SystemStatusPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('AMAS 系统状态')).toBeInTheDocument();
      });
    });

    it('should render subtitle', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('实时监控系统运行状态和性能指标')).toBeInTheDocument();
      });
    });

    it('should render last updated time', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('最后更新')).toBeInTheDocument();
      });
    });
  });

  describe('Pipeline Status Panel', () => {
    it('should render pipeline status section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Pipeline 实时状态')).toBeInTheDocument();
      });
    });

    it('should display system health status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('系统健康')).toBeInTheDocument();
      });
    });

    it('should display throughput', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/吞吐量.*150/)).toBeInTheDocument();
      });
    });

    it('should display all pipeline layers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('感知层')).toBeInTheDocument();
        // 建模层、决策层在多个地方出现，使用 getAllByText
        expect(screen.getAllByText('建模层').length).toBeGreaterThan(0);
        expect(screen.getByText('学习层')).toBeInTheDocument();
        expect(screen.getAllByText('决策层').length).toBeGreaterThan(0);
        expect(screen.getByText('评估层')).toBeInTheDocument();
        expect(screen.getByText('优化层')).toBeInTheDocument();
      });
    });

    it('should display layer metrics', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('1500')).toBeInTheDocument(); // processed count
      });

      // Success rate 99.0% is displayed as part of the layer metrics
      const successRateElements = screen.getAllByText(/99\.0/);
      expect(successRateElements.length).toBeGreaterThan(0);
    });
  });

  describe('Algorithm Status Panel', () => {
    it('should render algorithm status section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('算法运行状态')).toBeInTheDocument();
      });
    });

    it('should display ensemble consensus rate', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/集成共识率/)).toBeInTheDocument();
      });
      // The percentage may be in a separate element
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should display all algorithms', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Thompson Sampling')).toBeInTheDocument();
        expect(screen.getByText('LinUCB')).toBeInTheDocument();
        expect(screen.getByText('ACT-R')).toBeInTheDocument();
        expect(screen.getByText('Heuristic')).toBeInTheDocument();
      });
    });

    it('should display algorithm weights', async () => {
      renderComponent();

      await waitFor(() => {
        // Multiple weight elements may exist
        const weightElements = screen.getAllByText(/35\.0%|25\.0%|20\.0%/);
        expect(weightElements.length).toBeGreaterThan(0);
      });
    });

    it('should display coldstart stats', async () => {
      renderComponent();

      // Wait for algorithm status to load
      await waitFor(() => {
        expect(screen.getByText('算法运行状态')).toBeInTheDocument();
      });

      // "冷启动管理器" appears in both algorithm panel and feature flags
      // Wait for algorithm data to load - then coldstart manager section will show
      await waitFor(() => {
        // Multiple "冷启动管理器" elements may exist
        const elements = screen.getAllByText('冷启动管理器');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('User State Panel', () => {
    it('should render user state section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('用户状态监控')).toBeInTheDocument();
      });
    });

    it('should display attention metrics', async () => {
      renderComponent();

      await waitFor(() => {
        // Multiple "注意力" elements may exist in the page
        const elements = screen.getAllByText('注意力');
        expect(elements.length).toBeGreaterThan(0);
      });
      // 72% may be in the display
      expect(screen.getByText('72%')).toBeInTheDocument();
    });

    it('should display fatigue metrics', async () => {
      renderComponent();

      await waitFor(() => {
        // Multiple "疲劳度" elements may exist
        const elements = screen.getAllByText('疲劳度');
        expect(elements.length).toBeGreaterThan(0);
      });
      expect(screen.getByText('28%')).toBeInTheDocument();
    });

    it('should display motivation metrics', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习动机')).toBeInTheDocument();
        expect(screen.getByText('+35%')).toBeInTheDocument();
      });
    });

    it('should display alert counts', async () => {
      renderComponent();

      await waitFor(() => {
        // Alert counts displayed in badges
        const alertElements = screen.getAllByText('12');
        expect(alertElements.length).toBeGreaterThan(0);
      });
      const fatigueAlertElements = screen.getAllByText('5');
      expect(fatigueAlertElements.length).toBeGreaterThan(0);
    });

    it('should display recent inferences', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('最近状态推断')).toBeInTheDocument();
        expect(screen.getByText('user-1')).toBeInTheDocument();
        expect(screen.getByText('user-2')).toBeInTheDocument();
      });
    });
  });

  describe('Memory Status Panel', () => {
    it('should render memory status section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('记忆状态分布')).toBeInTheDocument();
      });
    });

    it('should display strength distribution', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('记忆强度分布')).toBeInTheDocument();
        expect(screen.getByText('0-20%')).toBeInTheDocument();
        expect(screen.getByText('80-100%')).toBeInTheDocument();
      });
    });

    it('should display review counts', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('急需复习')).toBeInTheDocument();
        expect(screen.getByText('即将复习')).toBeInTheDocument();
        expect(screen.getByText('状态稳定')).toBeInTheDocument();
      });
    });

    it('should display average half-life', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('平均半衰期')).toBeInTheDocument();
        expect(screen.getByText('4.5天')).toBeInTheDocument();
      });
    });

    it('should display consolidation rate', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('今日巩固率')).toBeInTheDocument();
        expect(screen.getByText('78.5%')).toBeInTheDocument();
      });
    });

    it('should display ACT-R tracking info', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('ACT-R 记忆追踪')).toBeInTheDocument();
        expect(screen.getByText('最大追踪记录')).toBeInTheDocument();
      });
    });
  });

  describe('Feature Flags Panel', () => {
    it('should render feature flags section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('功能运行状态')).toBeInTheDocument();
      });
    });

    it('should display feature flags', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('趋势分析')).toBeInTheDocument();
        expect(screen.getByText('IGE 信息增益探索')).toBeInTheDocument();
        expect(screen.getByText('MSMT 多尺度记忆')).toBeInTheDocument();
        expect(screen.getByText('集成学习')).toBeInTheDocument();
      });
    });
  });

  describe('Data Fetching', () => {
    it('should fetch all data on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(getPipelineLayerStatusWithSource).toHaveBeenCalled();
        expect(getAlgorithmStatusWithSource).toHaveBeenCalled();
        expect(getUserStateStatusWithSource).toHaveBeenCalled();
        expect(getMemoryStatusWithSource).toHaveBeenCalled();
        expect(getModuleHealthWithSource).toHaveBeenCalled();
      });
    });

    it('should refresh pipeline data periodically', async () => {
      // Use fake timers for this specific test
      vi.useFakeTimers({ shouldAdvanceTime: true });

      renderComponent();

      await waitFor(() => {
        expect(getPipelineLayerStatusWithSource).toHaveBeenCalledTimes(1);
      });

      // Advance timers by 5 seconds (pipeline refresh interval)
      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(getPipelineLayerStatusWithSource).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });

    it('should refresh algorithm data at 10s interval', async () => {
      // Use fake timers for this specific test
      vi.useFakeTimers({ shouldAdvanceTime: true });

      renderComponent();

      await waitFor(() => {
        expect(getAlgorithmStatusWithSource).toHaveBeenCalledTimes(1);
      });

      // Advance timers by 10 seconds
      vi.advanceTimersByTime(10000);

      await waitFor(() => {
        expect(getAlgorithmStatusWithSource).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });
  });

  describe('Status Indicators', () => {
    it('should show healthy status indicator', async () => {
      renderComponent();

      await waitFor(() => {
        // Should have green status indicators for healthy layers
        const statusIndicators = document.querySelectorAll('.bg-emerald-500');
        expect(statusIndicators.length).toBeGreaterThan(0);
      });
    });

    it('should show degraded status indicator', async () => {
      renderComponent();

      await waitFor(() => {
        // Evaluation layer is degraded
        const degradedIndicators = document.querySelectorAll('.bg-amber-500');
        expect(degradedIndicators.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (getPipelineLayerStatusWithSource as Mock).mockRejectedValue(new Error('API Error'));

      renderComponent();

      // Should not crash, should show loading or handle gracefully
      await waitFor(() => {
        expect(screen.getByText('AMAS 系统状态')).toBeInTheDocument();
      });
    });
  });
});
