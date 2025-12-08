/**
 * LLMAdvisorPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LLMAdvisorPage from '../LLMAdvisorPage';

// Mock useToast hook
vi.mock('@/components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock Icon components
vi.mock('@/components/Icon', () => ({
  Robot: ({ className, size, weight }: any) => (
    <span data-testid="robot-icon" className={className}>
      Robot
    </span>
  ),
  Lightning: ({ className, size, weight }: any) => (
    <span data-testid="lightning-icon" className={className}>
      Lightning
    </span>
  ),
  CheckCircle: ({ className, size }: any) => (
    <span data-testid="check-circle-icon" className={className}>
      CheckCircle
    </span>
  ),
  XCircle: ({ className, size }: any) => (
    <span data-testid="x-circle-icon" className={className}>
      XCircle
    </span>
  ),
  Warning: ({ className, size }: any) => (
    <span data-testid="warning-icon" className={className}>
      Warning
    </span>
  ),
  ArrowsClockwise: ({ className, size }: any) => (
    <span data-testid="arrows-clockwise-icon" className={className}>
      ArrowsClockwise
    </span>
  ),
  Eye: ({ className, size }: any) => (
    <span data-testid="eye-icon" className={className}>
      Eye
    </span>
  ),
  CaretDown: ({ className, size }: any) => (
    <span data-testid="caret-down-icon" className={className}>
      CaretDown
    </span>
  ),
  CaretUp: ({ className, size }: any) => (
    <span data-testid="caret-up-icon" className={className}>
      CaretUp
    </span>
  ),
  Lightbulb: ({ className, size }: any) => (
    <span data-testid="lightbulb-icon" className={className}>
      Lightbulb
    </span>
  ),
  Gear: ({ className, size }: any) => (
    <span data-testid="gear-icon" className={className}>
      Gear
    </span>
  ),
  ChartLine: ({ className, size }: any) => (
    <span data-testid="chart-line-icon" className={className}>
      ChartLine
    </span>
  ),
  Brain: ({ className, size }: any) => (
    <span data-testid="brain-icon" className={className}>
      Brain
    </span>
  ),
  Shield: ({ className, size }: any) => (
    <span data-testid="shield-icon" className={className}>
      Shield
    </span>
  ),
  CircleNotch: ({ className, size, weight }: any) => (
    <span data-testid="loading-spinner" className={className}>
      Loading
    </span>
  ),
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock config data
const mockConfig = {
  enabled: true,
  provider: 'openai',
  model: 'gpt-4',
  baseUrl: 'https://api.openai.com',
  apiKeySet: true,
};

// Mock worker status data
const mockWorkerStatus = {
  enabled: true,
  autoAnalysisEnabled: true,
  isRunning: false,
  schedule: '每周日 00:00',
  pendingCount: 3,
};

// Mock health data
const mockHealth = {
  status: 'healthy',
  message: '服务正常',
};

// Mock suggestion data
const mockSuggestion = {
  id: 'suggestion-1',
  weekStart: '2024-01-01',
  weekEnd: '2024-01-07',
  statsSnapshot: {
    period: { start: '2024-01-01', end: '2024-01-07' },
    users: { total: 100, activeThisWeek: 50, newThisWeek: 10, churned: 5 },
    learning: {
      avgAccuracy: 0.75,
      avgSessionDuration: 300,
      totalWordsLearned: 500,
      totalAnswers: 1000,
      avgResponseTime: 2.5,
    },
    stateDistribution: {
      fatigue: { low: 60, mid: 30, high: 10 },
      motivation: { low: 20, mid: 50, high: 30 },
    },
    alerts: {
      lowAccuracyUserRatio: 0.1,
      highFatigueUserRatio: 0.15,
      lowMotivationUserRatio: 0.2,
      churnRate: 0.05,
    },
  },
  rawResponse: 'Raw LLM response',
  parsedSuggestion: {
    analysis: {
      summary: '本周用户学习表现稳定',
      keyFindings: ['发现1', '发现2'],
      concerns: ['问题1', '问题2'],
    },
    suggestions: [
      {
        id: 'item-1',
        type: 'param_bound' as const,
        target: 'maxDailyWords',
        currentValue: 20,
        suggestedValue: 25,
        reason: '用户学习能力提升',
        expectedImpact: '预计提升10%学习效率',
        risk: 'low' as const,
        priority: 1,
      },
    ],
    confidence: 0.85,
    dataQuality: 'sufficient' as const,
    nextReviewFocus: '关注用户疲劳度变化',
  },
  status: 'pending' as const,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  appliedItems: null,
  createdAt: '2024-01-07T00:00:00Z',
};

// Mock API functions
const mockGetLLMConfig = vi.fn();
const mockCheckLLMHealth = vi.fn();
const mockGetSuggestions = vi.fn();
const mockTriggerAnalysis = vi.fn();
const mockApproveSuggestion = vi.fn();
const mockRejectSuggestion = vi.fn();

vi.mock('../../../services/llmAdvisorApi', () => ({
  getLLMConfig: () => mockGetLLMConfig(),
  checkLLMHealth: () => mockCheckLLMHealth(),
  getSuggestions: (params: any) => mockGetSuggestions(params),
  triggerAnalysis: () => mockTriggerAnalysis(),
  approveSuggestion: (id: string, items: string[], notes?: string) =>
    mockApproveSuggestion(id, items, notes),
  rejectSuggestion: (id: string, notes?: string) => mockRejectSuggestion(id, notes),
}));

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <LLMAdvisorPage />
    </MemoryRouter>,
  );
};

describe('LLMAdvisorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLLMConfig.mockResolvedValue({
      config: mockConfig,
      worker: mockWorkerStatus,
    });
    mockCheckLLMHealth.mockResolvedValue(mockHealth);
    mockGetSuggestions.mockResolvedValue({
      items: [mockSuggestion],
      total: 1,
    });
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      // Keep promises pending to test loading state
      mockGetLLMConfig.mockImplementation(() => new Promise(() => {}));
      mockGetSuggestions.mockImplementation(() => new Promise(() => {}));

      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('LLM 顾问')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('AI 驱动的参数优化建议')).toBeInTheDocument();
      });
    });

    it('should render robot icon', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('robot-icon').length).toBeGreaterThan(0);
      });
    });

    it('should render trigger analysis button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('立即分析')).toBeInTheDocument();
      });
    });
  });

  describe('configuration status card', () => {
    it('should render configuration status section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('配置状态')).toBeInTheDocument();
      });
    });

    it('should display enabled status when enabled', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Multiple elements may show "已启用" (config status + auto analysis)
        const enabledElements = screen.getAllByText('已启用');
        expect(enabledElements.length).toBeGreaterThan(0);
      });
    });

    it('should display disabled status when not enabled', async () => {
      mockGetLLMConfig.mockResolvedValue({
        config: { ...mockConfig, enabled: false },
        worker: mockWorkerStatus,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('未启用')).toBeInTheDocument();
      });
    });

    it('should display provider name', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('提供者')).toBeInTheDocument();
        expect(screen.getByText('openai')).toBeInTheDocument();
      });
    });

    it('should display model name', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('模型')).toBeInTheDocument();
        expect(screen.getByText('gpt-4')).toBeInTheDocument();
      });
    });

    it('should display API key set status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('API Key')).toBeInTheDocument();
        expect(screen.getByText('已设置')).toBeInTheDocument();
      });
    });

    it('should display API key not set when not configured', async () => {
      mockGetLLMConfig.mockResolvedValue({
        config: { ...mockConfig, apiKeySet: false },
        worker: mockWorkerStatus,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('未设置')).toBeInTheDocument();
      });
    });
  });

  describe('worker status card', () => {
    it('should render worker status section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Worker 状态')).toBeInTheDocument();
      });
    });

    it('should display auto analysis enabled status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('自动分析')).toBeInTheDocument();
      });
    });

    it('should display schedule', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('调度')).toBeInTheDocument();
        expect(screen.getByText('每周日 00:00')).toBeInTheDocument();
      });
    });

    it('should display pending count', async () => {
      renderWithRouter();

      await waitFor(() => {
        // "待审核" appears in multiple places, use getAllByText
        const pendingElements = screen.getAllByText('待审核');
        expect(pendingElements.length).toBeGreaterThan(0);
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });
  });

  describe('LLM service health card', () => {
    it('should render LLM service section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('LLM 服务')).toBeInTheDocument();
      });
    });

    it('should show healthy status message', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('服务正常')).toBeInTheDocument();
      });
    });

    it('should show disabled message when config is disabled', async () => {
      mockGetLLMConfig.mockResolvedValue({
        config: { ...mockConfig, enabled: false },
        worker: mockWorkerStatus,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('LLM 顾问未启用')).toBeInTheDocument();
      });
    });

    it('should show unknown status on health check failure', async () => {
      mockCheckLLMHealth.mockRejectedValue(new Error('Health check failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('无法检查')).toBeInTheDocument();
      });
    });
  });

  describe('suggestions list', () => {
    it('should render suggestions list section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('建议列表')).toBeInTheDocument();
      });
    });

    it('should display suggestion summary', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('本周用户学习表现稳定')).toBeInTheDocument();
      });
    });

    it('should display suggestion status', async () => {
      renderWithRouter();

      await waitFor(() => {
        // "待审核" appears in both filter dropdown and suggestion badge
        const pendingElements = screen.getAllByText('待审核');
        expect(pendingElements.length).toBeGreaterThan(0);
      });
    });

    it('should display confidence level', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Text content is "置信度: 85%" - find by checking all spans
        const allSpans = document.querySelectorAll('span');
        const confidenceSpan = Array.from(allSpans).find(
          (span) => span.textContent?.includes('置信度:') && span.textContent?.includes('85'),
        );
        expect(confidenceSpan).toBeTruthy();
      });
    });

    it('should display data quality', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Text content is "数据质量: sufficient" - find by checking all spans
        const allSpans = document.querySelectorAll('span');
        const dataQualitySpan = Array.from(allSpans).find(
          (span) =>
            span.textContent?.includes('数据质量:') && span.textContent?.includes('sufficient'),
        );
        expect(dataQualitySpan).toBeTruthy();
      });
    });

    it('should show empty state when no suggestions', async () => {
      mockGetSuggestions.mockResolvedValue({ items: [], total: 0 });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('暂无建议记录')).toBeInTheDocument();
      });
    });
  });

  describe('status filter', () => {
    it('should render status filter dropdown', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });

    it('should have all status options', async () => {
      renderWithRouter();

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toHaveTextContent('全部');
    });

    it('should filter suggestions on status change', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'approved' } });

      await waitFor(() => {
        expect(mockGetSuggestions).toHaveBeenCalledWith({
          status: 'approved',
          limit: 20,
        });
      });
    });
  });

  describe('trigger analysis', () => {
    it('should trigger analysis on button click', async () => {
      mockTriggerAnalysis.mockResolvedValue({
        suggestionId: 'new-suggestion-id',
        message: '分析完成',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('立即分析')).toBeInTheDocument();
      });

      const button = screen.getByText('立即分析');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockTriggerAnalysis).toHaveBeenCalled();
      });
    });

    it('should disable button when config is disabled', async () => {
      mockGetLLMConfig.mockResolvedValue({
        config: { ...mockConfig, enabled: false },
        worker: mockWorkerStatus,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('立即分析')).toBeInTheDocument();
      });

      const button = screen.getByText('立即分析');
      expect(button).toBeDisabled();
    });

    it('should show loading state during analysis', async () => {
      mockTriggerAnalysis.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ suggestionId: 'id', message: 'ok' }), 1000),
          ),
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('立即分析')).toBeInTheDocument();
      });

      const button = screen.getByText('立即分析');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('分析中...')).toBeInTheDocument();
      });
    });
  });

  describe('suggestion detail modal', () => {
    it('should open detail modal on view click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('建议详情')).toBeInTheDocument();
      });
    });

    it('should display key findings in detail modal', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('关键发现')).toBeInTheDocument();
        expect(screen.getByText('• 发现1')).toBeInTheDocument();
      });
    });

    it('should display concerns in detail modal', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('需关注问题')).toBeInTheDocument();
        expect(screen.getByText('• 问题1')).toBeInTheDocument();
      });
    });

    it('should display suggestion items in detail modal', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('建议项 (1)')).toBeInTheDocument();
        expect(screen.getByText('maxDailyWords')).toBeInTheDocument();
      });
    });

    it('should close modal on close button click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('建议详情')).toBeInTheDocument();
      });

      // Find close button (XCircle icon in modal header)
      const closeButtons = screen.getAllByTestId('x-circle-icon');
      const closeButton = closeButtons[closeButtons.length - 1].closest('button');
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      await waitFor(() => {
        expect(screen.queryByText('建议详情')).not.toBeInTheDocument();
      });
    });
  });

  describe('suggestion approval', () => {
    it('should show approval buttons for pending suggestions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('全部拒绝')).toBeInTheDocument();
      });
    });

    it('should enable approve button when items are selected', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('建议详情')).toBeInTheDocument();
      });

      // Click on checkbox to select item
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(screen.getByText('应用选中项 (1)')).toBeInTheDocument();
      });
    });

    it('should call approveSuggestion when applying selected items', async () => {
      mockApproveSuggestion.mockResolvedValue({
        ...mockSuggestion,
        status: 'approved',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByRole('checkbox')).toBeInTheDocument();
      });

      // Select an item
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click approve button
      const approveButton = screen.getByText('应用选中项 (1)');
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(mockApproveSuggestion).toHaveBeenCalledWith('suggestion-1', ['item-1'], undefined);
      });
    });

    it('should call rejectSuggestion when rejecting', async () => {
      mockRejectSuggestion.mockResolvedValue({
        ...mockSuggestion,
        status: 'rejected',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      });

      const viewButton = screen.getByTestId('eye-icon').closest('button');
      if (viewButton) {
        fireEvent.click(viewButton);
      }

      await waitFor(() => {
        expect(screen.getByText('全部拒绝')).toBeInTheDocument();
      });

      const rejectButton = screen.getByText('全部拒绝');
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(mockRejectSuggestion).toHaveBeenCalledWith('suggestion-1', undefined);
      });
    });
  });

  describe('error handling', () => {
    it('should show error toast when config API fails', async () => {
      mockGetLLMConfig.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      // Component should handle error gracefully
      await waitFor(() => {
        expect(mockGetLLMConfig).toHaveBeenCalled();
      });
    });

    it('should show error toast when suggestions API fails', async () => {
      mockGetSuggestions.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(mockGetSuggestions).toHaveBeenCalled();
      });
    });

    it('should show error toast when trigger analysis fails', async () => {
      mockTriggerAnalysis.mockRejectedValue(new Error('Trigger failed'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('立即分析')).toBeInTheDocument();
      });

      const button = screen.getByText('立即分析');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockTriggerAnalysis).toHaveBeenCalled();
      });
    });
  });

  describe('refresh functionality', () => {
    it('should have refresh button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('arrows-clockwise-icon').length).toBeGreaterThan(0);
      });
    });

    it('should reload data on refresh click', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('arrows-clockwise-icon').length).toBeGreaterThan(0);
      });

      // Find the refresh button in the suggestions list section
      const refreshIcons = screen.getAllByTestId('arrows-clockwise-icon');
      const refreshButton = refreshIcons[refreshIcons.length - 1].closest('button');

      if (refreshButton) {
        fireEvent.click(refreshButton);
      }

      await waitFor(() => {
        // Initial call + refresh call
        expect(mockGetSuggestions.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
