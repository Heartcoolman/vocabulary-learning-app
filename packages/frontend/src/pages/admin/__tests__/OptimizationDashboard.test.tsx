/**
 * OptimizationDashboard Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';

// Mock Toast module BEFORE importing component
const mockToast = {
  showToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock ui components (re-exports from Toast)
vi.mock('../../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/ui')>();
  return {
    ...actual,
    useToast: () => mockToast,
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div>{children}</div> : null,
    ConfirmModal: ({
      isOpen,
      onClose,
      onConfirm,
      title,
      message,
    }: {
      isOpen: boolean;
      onClose: () => void;
      onConfirm: () => void;
      title: string;
      message: string;
    }) =>
      isOpen ? (
        <div data-testid="confirm-modal">
          <h2>{title}</h2>
          <p>{message}</p>
          <button onClick={onConfirm}>Confirm</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      ) : null,
    AlertModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div>{children}</div> : null,
  };
});

// Mock ApiClient - use vi.hoisted to ensure it's available when mock factory runs
const mockApiClient = vi.hoisted(() => ({
  getOptimizationSuggestion: vi.fn(),
  getOptimizationHistory: vi.fn(),
  getBestOptimizationParams: vi.fn(),
  getOptimizationDiagnostics: vi.fn(),
  triggerOptimization: vi.fn(),
  resetOptimizer: vi.fn(),
  recordOptimizationEvaluation: vi.fn(),
}));

vi.mock('../../../services/client', () => ({
  default: mockApiClient,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

// Mock Icon components
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    Activity: () => <span data-testid="activity-icon">Activity</span>,
    ArrowsClockwise: ({ className }: { className?: string }) => (
      <span data-testid="refresh-icon" className={className}>
        Refresh
      </span>
    ),
    Gear: () => <span data-testid="gear-icon">Gear</span>,
    TrendUp: () => <span data-testid="trend-up-icon">TrendUp</span>,
    WarningCircle: () => <span data-testid="warning-icon">Warning</span>,
    CheckCircle: () => <span data-testid="check-icon">Check</span>,
    ChartBar: () => <span data-testid="chart-icon">Chart</span>,
    Target: () => <span data-testid="target-icon">Target</span>,
    Play: () => <span data-testid="play-icon">Play</span>,
    ArrowCounterClockwise: () => <span data-testid="reset-icon">Reset</span>,
    Lightning: () => <span data-testid="lightning-icon">Lightning</span>,
    Clock: () => <span data-testid="clock-icon">Clock</span>,
    Database: () => <span data-testid="database-icon">Database</span>,
    Info: () => <span data-testid="info-icon">Info</span>,
    ArrowUp: () => <span data-testid="arrow-up-icon">ArrowUp</span>,
    ArrowDown: () => <span data-testid="arrow-down-icon">ArrowDown</span>,
    Minus: () => <span data-testid="minus-icon">Minus</span>,
    CaretDown: () => <span data-testid="caret-down-icon">CaretDown</span>,
    CaretUp: () => <span data-testid="caret-up-icon">CaretUp</span>,
    Lightbulb: () => <span data-testid="lightbulb-icon">Lightbulb</span>,
    Trophy: () => <span data-testid="trophy-icon">Trophy</span>,
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

import OptimizationDashboard from '../OptimizationDashboard';

const mockSuggestion = {
  params: {
    learning_rate: 0.1,
    batch_size: 32,
    difficulty_factor: 0.8,
  },
  paramSpace: {
    learning_rate: { min: 0, max: 1, step: 0.01 },
    batch_size: { min: 8, max: 64, step: 8 },
    difficulty_factor: { min: 0.5, max: 1.5, step: 0.1 },
  },
};

const mockHistory = [
  {
    params: { learning_rate: 0.05, batch_size: 16, difficulty_factor: 0.7 },
    value: 0.75,
    timestamp: '2024-01-10T10:00:00Z',
  },
  {
    params: { learning_rate: 0.08, batch_size: 24, difficulty_factor: 0.75 },
    value: 0.82,
    timestamp: '2024-01-11T10:00:00Z',
  },
  {
    params: { learning_rate: 0.1, batch_size: 32, difficulty_factor: 0.8 },
    value: 0.88,
    timestamp: '2024-01-12T10:00:00Z',
  },
];

const mockBestParams = {
  params: { learning_rate: 0.1, batch_size: 32, difficulty_factor: 0.8 },
  value: 0.88,
};

const mockDiagnostics = {
  optimizer_state: 'running',
  iteration: 15,
  acquisition_function: 'expected_improvement',
  kernel_params: { lengthscale: 0.5, variance: 1.0 },
};

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <OptimizationDashboard />
    </MemoryRouter>,
  );
};

describe('OptimizationDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getOptimizationSuggestion.mockResolvedValue(mockSuggestion);
    mockApiClient.getOptimizationHistory.mockResolvedValue(mockHistory);
    mockApiClient.getBestOptimizationParams.mockResolvedValue(mockBestParams);
    mockApiClient.getOptimizationDiagnostics.mockResolvedValue(mockDiagnostics);
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('优化分析仪表盘')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText(/贝叶斯优化/).length).toBeGreaterThan(0);
      });
    });

    it('should render lightning icon', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('lightning-icon').length).toBeGreaterThan(0);
      });
    });

    it('should show loading state initially', () => {
      renderWithRouter();

      expect(screen.getByRole('status', { name: /加载中/ })).toBeInTheDocument();
    });
  });

  describe('key metrics', () => {
    it('should display history evaluation count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('历史评估次数')).toBeInTheDocument();
        // '3' appears multiple times (history count and param dimensions), use getAllByText
        expect(screen.getAllByText('3').length).toBeGreaterThan(0);
      });
    });

    it('should display best performance value', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByText('最佳性能值').length).toBeGreaterThan(0);
        expect(screen.getByText('0.8800')).toBeInTheDocument();
      });
    });

    it('should display parameter space dimensions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('参数空间维度')).toBeInTheDocument();
      });
    });

    it('should display optimization status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('优化状态')).toBeInTheDocument();
        expect(screen.getByText('探索中')).toBeInTheDocument();
      });
    });
  });

  describe('tabs navigation', () => {
    it('should render all tabs', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('优化建议')).toBeInTheDocument();
        expect(screen.getByText('优化历史')).toBeInTheDocument();
        expect(screen.getByText('最佳参数')).toBeInTheDocument();
        expect(screen.getByText('优化控制')).toBeInTheDocument();
        expect(screen.getByText('诊断信息')).toBeInTheDocument();
      });
    });

    it('should switch to history tab on click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const historyTab = screen.getByText('优化历史');
        fireEvent.click(historyTab);
      });

      await waitFor(() => {
        expect(screen.getByText('历史评估记录')).toBeInTheDocument();
      });
    });

    it('should switch to best params tab on click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const bestTab = screen.getByText('最佳参数');
        fireEvent.click(bestTab);
      });

      await waitFor(() => {
        expect(screen.getByText('当前最佳参数配置')).toBeInTheDocument();
      });
    });

    it('should switch to control tab on click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        expect(screen.getByText('优化器控制面板')).toBeInTheDocument();
      });
    });

    it('should switch to diagnostics tab on click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const diagnosticsTab = screen.getByText('诊断信息');
        fireEvent.click(diagnosticsTab);
      });

      await waitFor(() => {
        expect(screen.getByText('优化器诊断信息')).toBeInTheDocument();
      });
    });
  });

  describe('suggestion tab', () => {
    it('should display suggestion info', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('下一个推荐参数组合')).toBeInTheDocument();
      });
    });

    it('should display parameter cards', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('learning_rate')).toBeInTheDocument();
        expect(screen.getByText('batch_size')).toBeInTheDocument();
        expect(screen.getByText('difficulty_factor')).toBeInTheDocument();
      });
    });

    it('should display evaluation input', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('记录评估结果')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('例如: 0.85')).toBeInTheDocument();
      });
    });

    it('should submit evaluation on button click', async () => {
      mockApiClient.recordOptimizationEvaluation.mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        const input = screen.getByPlaceholderText('例如: 0.85');
        fireEvent.change(input, { target: { value: '0.9' } });

        const submitButton = screen.getByText('提交评估');
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockApiClient.recordOptimizationEvaluation).toHaveBeenCalledWith(
          mockSuggestion.params,
          0.9,
        );
      });
    });
  });

  describe('history tab', () => {
    it('should display history chart', async () => {
      renderWithRouter();

      await waitFor(() => {
        const historyTab = screen.getByText('优化历史');
        fireEvent.click(historyTab);
      });

      await waitFor(() => {
        expect(screen.getByText('历史评估记录')).toBeInTheDocument();
      });
    });

    it('should display history stats', async () => {
      renderWithRouter();

      await waitFor(() => {
        const historyTab = screen.getByText('优化历史');
        fireEvent.click(historyTab);
      });

      await waitFor(() => {
        expect(screen.getByText('最高值')).toBeInTheDocument();
        expect(screen.getByText('平均值')).toBeInTheDocument();
        expect(screen.getByText('最低值')).toBeInTheDocument();
      });
    });
  });

  describe('best params tab', () => {
    it('should display best params', async () => {
      renderWithRouter();

      await waitFor(() => {
        const bestTab = screen.getByText('最佳参数');
        fireEvent.click(bestTab);
      });

      await waitFor(() => {
        expect(screen.getAllByText('最佳性能值').length).toBeGreaterThan(0);
      });
    });

    it('should display all best parameters', async () => {
      renderWithRouter();

      await waitFor(() => {
        const bestTab = screen.getByText('最佳参数');
        fireEvent.click(bestTab);
      });

      await waitFor(() => {
        expect(screen.getByText('learning_rate')).toBeInTheDocument();
        expect(screen.getByText('batch_size')).toBeInTheDocument();
        expect(screen.getByText('difficulty_factor')).toBeInTheDocument();
      });
    });
  });

  describe('control tab', () => {
    it('should have trigger optimization button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        // Multiple elements with "触发优化" - one h3 title and one button
        expect(screen.getAllByText('触发优化').length).toBeGreaterThan(0);
      });
    });

    it('should have reset optimizer button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        // Multiple elements with "重置优化器" - one h3 title and one button
        expect(screen.getAllByText('重置优化器').length).toBeGreaterThan(0);
      });
    });

    it('should trigger optimization on button click', async () => {
      mockApiClient.triggerOptimization.mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        // Find the button by role
        const triggerButtons = screen.getAllByText('触发优化');
        // The button is the one in the button element, click the last one (the actual button)
        const button =
          triggerButtons.find((el) => el.tagName === 'BUTTON') ||
          triggerButtons[triggerButtons.length - 1];
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(mockApiClient.triggerOptimization).toHaveBeenCalled();
      });
    });

    it('should show confirmation modal before reset', async () => {
      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        // Find the button by role
        const resetButtons = screen.getAllByText('重置优化器');
        // The button is the one in the button element, click the last one (the actual button)
        const button =
          resetButtons.find((el) => el.tagName === 'BUTTON') ||
          resetButtons[resetButtons.length - 1];
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText('确认重置优化器')).toBeInTheDocument();
      });
    });

    it('should reset optimizer on confirmation', async () => {
      mockApiClient.resetOptimizer.mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        const controlTab = screen.getByText('优化控制');
        fireEvent.click(controlTab);
      });

      await waitFor(() => {
        // Find the button by role
        const resetButtons = screen.getAllByText('重置优化器');
        // The button is the one in the button element, click the last one (the actual button)
        const button =
          resetButtons.find((el) => el.tagName === 'BUTTON') ||
          resetButtons[resetButtons.length - 1];
        fireEvent.click(button);
      });

      await waitFor(() => {
        const confirmButton = screen.getByText('Confirm');
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockApiClient.resetOptimizer).toHaveBeenCalled();
      });
    });
  });

  describe('diagnostics tab', () => {
    it('should display diagnostics section', async () => {
      renderWithRouter();

      await waitFor(() => {
        const diagnosticsTab = screen.getByText('诊断信息');
        fireEvent.click(diagnosticsTab);
      });

      await waitFor(() => {
        expect(screen.getByText('优化器诊断信息')).toBeInTheDocument();
      });
    });

    it('should have expand/collapse button', async () => {
      renderWithRouter();

      await waitFor(() => {
        const diagnosticsTab = screen.getByText('诊断信息');
        fireEvent.click(diagnosticsTab);
      });

      await waitFor(() => {
        expect(screen.getByText('查看详细信息')).toBeInTheDocument();
      });
    });

    it('should expand diagnostics on button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        const diagnosticsTab = screen.getByText('诊断信息');
        fireEvent.click(diagnosticsTab);
      });

      await waitFor(() => {
        const expandButton = screen.getByText('查看详细信息');
        fireEvent.click(expandButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/"optimizer_state": "running"/)).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error when API fails', async () => {
      mockApiClient.getOptimizationSuggestion.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockApiClient.getOptimizationSuggestion.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry on button click', async () => {
      mockApiClient.getOptimizationSuggestion.mockRejectedValueOnce(new Error('API Error'));
      mockApiClient.getOptimizationSuggestion.mockResolvedValue(mockSuggestion);

      renderWithRouter();

      await waitFor(() => {
        const retryButton = screen.getByText('重试');
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(mockApiClient.getOptimizationSuggestion).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('refresh functionality', () => {
    it('should refresh data on refresh button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('优化分析仪表盘')).toBeInTheDocument();
      });

      const refreshButton = screen.getByTitle('刷新数据');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockApiClient.getOptimizationSuggestion).toHaveBeenCalledTimes(2);
      });
    });
  });
});
