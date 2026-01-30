import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import type { ReactNode, HTMLAttributes } from 'react';
import StatsPage from '../StatsPage';

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
const mockOverviewStats = {
  todayDecisions: 1250,
  activeUsers: 85,
  totalWords: 150000,
  avgAccuracy: 87.5,
};

const mockAlgorithmDistribution = {
  ige: 0.35,
  swd: 0.25,
  msmt: 0.2,
  heuristic: 0.15,
  coldstart: 0.05,
};

const mockPerformanceMetrics = {
  globalAccuracy: 87.5,
  accuracyImprovement: 5.2,
  causalATE: 0.15,
  causalConfidence: 0.92,
  avgInferenceMs: 12,
  p99InferenceMs: 45,
};

const mockOptimizationEvents = [
  {
    id: 'event-1',
    type: 'bayesian',
    title: '参数优化',
    description: 'IGE 权重调整',
    timestamp: '2024-01-15T10:00:00.000Z',
    impact: '+2.3% 准确率',
  },
  {
    id: 'event-2',
    type: 'ab_test',
    title: 'A/B 测试完成',
    description: '新复习间隔算法测试',
    timestamp: '2024-01-15T09:00:00.000Z',
    impact: '+5% 记忆保持',
  },
];

const mockMasteryRadar = {
  speed: 0.78,
  stability: 0.82,
  complexity: 0.65,
  consistency: 0.88,
};

vi.mock('../../../services/aboutApi', () => ({
  getOverviewStatsWithSource: vi.fn(),
  getAlgorithmDistribution: vi.fn(),
  getAlgorithmTrend: vi.fn(),
  getPerformanceMetrics: vi.fn(),
  getOptimizationEvents: vi.fn(),
  getMasteryRadar: vi.fn(),
  getLearningModeDistribution: vi.fn(),
  getHalfLifeDistribution: vi.fn(),
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
  getOverviewStatsWithSource,
  getAlgorithmDistribution,
  getAlgorithmTrend,
  getPerformanceMetrics,
  getOptimizationEvents,
  getMasteryRadar,
  getLearningModeDistribution,
  getHalfLifeDistribution,
} from '../../../services/aboutApi';

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getOverviewStatsWithSource as Mock).mockResolvedValue({
      data: mockOverviewStats,
      source: 'virtual',
    });
    (getAlgorithmDistribution as Mock).mockResolvedValue(mockAlgorithmDistribution);
    (getAlgorithmTrend as Mock).mockResolvedValue({
      thompson: [45, 48, 50, 52, 55, 53, 56, 58, 60, 62],
      linucb: [40, 42, 43, 45, 46, 48, 50, 49, 51, 53],
      actr: [35, 36, 38, 40, 41, 43, 44, 46, 47, 48],
      heuristic: [30, 31, 32, 33, 35, 36, 37, 38, 39, 40],
      coldstart: [20, 22, 24, 23, 25, 26, 27, 28, 29, 30],
    });
    (getPerformanceMetrics as Mock).mockResolvedValue(mockPerformanceMetrics);
    (getOptimizationEvents as Mock).mockResolvedValue(mockOptimizationEvents);
    (getMasteryRadar as Mock).mockResolvedValue(mockMasteryRadar);
    (getLearningModeDistribution as Mock).mockResolvedValue({
      exam: 0.1,
      daily: 0.7,
      travel: 0.1,
      custom: 0.1,
    });
    (getHalfLifeDistribution as Mock).mockResolvedValue({
      avgHalfLife: 4.5,
      totalWords: 150000,
      distribution: [
        { range: '0-1天', count: 15000, percentage: 10 },
        { range: '1-3天', count: 30000, percentage: 20 },
        { range: '3-7天', count: 45000, percentage: 30 },
        { range: '7-14天', count: 37500, percentage: 25 },
        { range: '14天+', count: 22500, percentage: 15 },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <StatsPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('AMAS 神经网络监控')).toBeInTheDocument();
      });
    });

    it('should render subtitle', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Ensemble Learning Framework 实时性能遥测/)).toBeInTheDocument();
      });
    });

    it('should render system online status', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('系统在线')).toBeInTheDocument();
      });
    });
  });

  describe('System Vitality Cards', () => {
    it('should display global accuracy', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/全局准确率/)).toBeInTheDocument();
        expect(screen.getByText(/87\.5%/)).toBeInTheDocument();
      });
    });

    it('should display accuracy improvement', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/\+5\.2% 提升/)).toBeInTheDocument();
      });
    });

    it('should display causal ATE', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/集成因果效应/)).toBeInTheDocument();
        expect(screen.getByText(/\+0\.15/)).toBeInTheDocument();
      });
    });

    it('should display today decisions count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/今日决策总量/)).toBeInTheDocument();
        expect(screen.getByText(/1,250|1250/)).toBeInTheDocument();
      });
    });

    it('should display active users', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/活跃用户.*85/)).toBeInTheDocument();
      });
    });

    it('should display average inference time', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/平均推理耗时/)).toBeInTheDocument();
        // Value and unit are in separate elements: "12" and "ms"
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('ms')).toBeInTheDocument();
      });
    });

    it('should display P99 latency', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/P99.*45ms/)).toBeInTheDocument();
      });
    });
  });

  describe('Expert Members Section', () => {
    it('should render expert members title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/专家成员贡献榜/)).toBeInTheDocument();
      });
    });

    it('should display algorithm cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('IGE 信息增益探索')).toBeInTheDocument();
        expect(screen.getByText('SWD 相似度加权')).toBeInTheDocument();
        expect(screen.getByText('MSMT 多尺度记忆')).toBeInTheDocument();
        expect(screen.getByText('Heuristic 规则')).toBeInTheDocument();
      });
    });

    it('should display algorithm weights', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('35.0% 权重')).toBeInTheDocument();
        expect(screen.getByText('25.0% 权重')).toBeInTheDocument();
        expect(screen.getByText('20.0% 权重')).toBeInTheDocument();
      });
    });
  });

  describe('Word Mastery Radar', () => {
    it('should render mastery radar section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('群体掌握度评估')).toBeInTheDocument();
      });
    });

    it('should display radar dimensions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/速度.*78%/)).toBeInTheDocument();
        expect(screen.getByText(/稳定性.*82%/)).toBeInTheDocument();
        expect(screen.getByText(/复杂度.*65%/)).toBeInTheDocument();
        expect(screen.getByText(/一致性.*88%/)).toBeInTheDocument();
      });
    });
  });

  describe('Learning Mode Distribution', () => {
    it('should render learning mode section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习模式分布')).toBeInTheDocument();
      });
    });

    it('should display learning modes', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('考试模式')).toBeInTheDocument();
        expect(screen.getByText('日常模式')).toBeInTheDocument();
        expect(screen.getByText('旅行模式')).toBeInTheDocument();
        expect(screen.getByText('自定义模式')).toBeInTheDocument();
      });
    });
  });

  describe('Half-Life Distribution', () => {
    it('should render half-life section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('半衰期分布')).toBeInTheDocument();
      });
    });

    it('should display average half-life', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/平均半衰期/)).toBeInTheDocument();
      });
    });
  });

  describe('Optimization Timeline', () => {
    it('should render optimization timeline section', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('自进化事件日志')).toBeInTheDocument();
      });
    });

    it('should display optimization events', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('参数优化')).toBeInTheDocument();
        expect(screen.getByText('A/B 测试完成')).toBeInTheDocument();
      });
    });

    it('should display event descriptions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('IGE 权重调整')).toBeInTheDocument();
        expect(screen.getByText('新复习间隔算法测试')).toBeInTheDocument();
      });
    });

    it('should display event impacts', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('+2.3% 准确率')).toBeInTheDocument();
        expect(screen.getByText('+5% 记忆保持')).toBeInTheDocument();
      });
    });
  });

  describe('Data Fetching', () => {
    it('should fetch all data on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(getOverviewStatsWithSource).toHaveBeenCalled();
        expect(getAlgorithmDistribution).toHaveBeenCalled();
        expect(getAlgorithmTrend).toHaveBeenCalled();
        expect(getPerformanceMetrics).toHaveBeenCalled();
        expect(getOptimizationEvents).toHaveBeenCalled();
        expect(getMasteryRadar).toHaveBeenCalled();
        expect(getLearningModeDistribution).toHaveBeenCalled();
        expect(getHalfLifeDistribution).toHaveBeenCalled();
      });
    });

    it('should refresh data periodically', async () => {
      // Use fake timers for this specific test
      vi.useFakeTimers({ shouldAdvanceTime: true });

      renderComponent();

      await waitFor(() => {
        expect(getOverviewStatsWithSource).toHaveBeenCalledTimes(1);
      });

      // Advance timers by 60 seconds
      vi.advanceTimersByTime(60000);

      await waitFor(() => {
        expect(getOverviewStatsWithSource).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });
  });

  describe('Empty State', () => {
    it('should handle empty optimization events', async () => {
      (getOptimizationEvents as Mock).mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无优化事件')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (getOverviewStatsWithSource as Mock).mockRejectedValue(new Error('API Error'));

      renderComponent();

      // Should not crash, should still render
      await waitFor(() => {
        expect(screen.getByText('AMAS 神经网络监控')).toBeInTheDocument();
      });
    });
  });

  describe('Clock Display', () => {
    it('should display current time', async () => {
      renderComponent();

      await waitFor(() => {
        // Should have time display
        const timeElement = document.querySelector('.font-mono');
        expect(timeElement).toBeInTheDocument();
      });
    });
  });
});
