/**
 * AMASDecisionsTab Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    adminGetUserDecisions: vi.fn(),
    adminGetDecisionDetail: vi.fn(),
  },
}));

vi.mock('@/services/ApiClient', () => ({
  default: mockApiClient,
}));

import AMASDecisionsTab from '../AMASDecisionsTab';

describe('AMASDecisionsTab', () => {
  const mockDecisions = [
    {
      decisionId: 'dec-1',
      timestamp: '2024-01-15T10:30:00Z',
      decisionSource: 'ensemble',
      confidence: 0.85,
      reward: 0.75,
      totalDurationMs: 150,
      strategy: {
        difficulty: 'mid',
        batch_size: 8,
        interval_scale: 1.0,
        new_ratio: 0.2,
        hint_level: 1,
      },
    },
    {
      decisionId: 'dec-2',
      timestamp: '2024-01-15T11:00:00Z',
      decisionSource: 'coldstart',
      confidence: 0.65,
      reward: null,
      totalDurationMs: 80,
      strategy: {
        difficulty: 'easy',
        batch_size: 5,
      },
    },
  ];

  const mockStatistics = {
    totalDecisions: 100,
    averageConfidence: 0.78,
    averageReward: 0.65,
    decisionSourceDistribution: {
      ensemble: 80,
      coldstart: 20,
    },
  };

  const mockPagination = {
    page: 1,
    pageSize: 20,
    total: 100,
    totalPages: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.adminGetUserDecisions.mockResolvedValue({
      data: {
        decisions: mockDecisions,
        statistics: mockStatistics,
        pagination: mockPagination,
      },
    });
  });

  describe('rendering', () => {
    it('should show loading state initially', () => {
      mockApiClient.adminGetUserDecisions.mockImplementation(() => new Promise(() => {}));
      render(<AMASDecisionsTab userId="user-123" />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });

    it('should render statistics panel', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('决策统计')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('78.0%')).toBeInTheDocument();
      });
    });

    it('should render decision table', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('时间')).toBeInTheDocument();
        expect(screen.getByText('来源')).toBeInTheDocument();
        expect(screen.getByText('策略')).toBeInTheDocument();
        expect(screen.getByText('置信度')).toBeInTheDocument();
      });
    });

    it('should render decision rows', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('ensemble')).toBeInTheDocument();
        expect(screen.getByText('coldstart')).toBeInTheDocument();
      });
    });

    it('should render filter bar', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('刷新')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });
  });

  describe('pagination', () => {
    it('should render pagination controls', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('上一页')).toBeInTheDocument();
        expect(screen.getByText('下一页')).toBeInTheDocument();
        expect(screen.getByText(/第 1 \/ 5 页/)).toBeInTheDocument();
      });
    });

    it('should disable prev button on first page', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
      });
    });

    it('should call API when page changes', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: '下一页' }));

      await waitFor(() => {
        expect(mockApiClient.adminGetUserDecisions).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('filters', () => {
    it('should filter by decision source', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ensemble' } });

      await waitFor(() => {
        expect(mockApiClient.adminGetUserDecisions).toHaveBeenCalled();
      });
    });

    it('should refresh data when refresh button clicked', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '刷新' }));

      await waitFor(() => {
        expect(mockApiClient.adminGetUserDecisions).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('decision detail modal', () => {
    const mockDetail = {
      decision: {
        decisionId: 'dec-1',
        timestamp: '2024-01-15T10:30:00Z',
        decisionSource: 'ensemble',
        confidence: 0.85,
        reward: 0.75,
        selectedAction: { difficulty: 'mid', batch_size: 8 },
      },
      pipeline: [
        {
          stage: 'PERCEPTION',
          stageName: '感知层',
          status: 'SUCCESS',
          durationMs: 10,
          startedAt: '2024-01-15T10:30:00Z',
        },
        {
          stage: 'DECISION',
          stageName: '决策层',
          status: 'SUCCESS',
          durationMs: 50,
          startedAt: '2024-01-15T10:30:00Z',
        },
      ],
      insight: {
        stateSnapshot: { attention: 0.8, fatigue: 0.2 },
      },
    };

    beforeEach(() => {
      mockApiClient.adminGetDecisionDetail.mockResolvedValue({ data: mockDetail });
    });

    it('should open detail modal when detail button clicked', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: '详情' })[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]);

      await waitFor(() => {
        expect(screen.getByText('决策详情')).toBeInTheDocument();
      });
    });

    it('should display decision info in modal', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('基本信息')).toBeInTheDocument();
      });
    });

    it('should display pipeline stages', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('流水线执行（六层架构）')).toBeInTheDocument();
        expect(screen.getByText('感知层')).toBeInTheDocument();
        expect(screen.getByText('决策层')).toBeInTheDocument();
      });
    });

    it('should close modal when close button clicked', async () => {
      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]);
      });

      await waitFor(() => {
        expect(screen.getByText('决策详情')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '×' }));

      await waitFor(() => {
        expect(screen.queryByText('决策详情')).not.toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no decisions', async () => {
      mockApiClient.adminGetUserDecisions.mockResolvedValue({
        data: {
          decisions: [],
          statistics: null,
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      });

      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('暂无决策记录')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message on load failure', async () => {
      mockApiClient.adminGetUserDecisions.mockRejectedValue(new Error('Network error'));

      render(<AMASDecisionsTab userId="user-123" />);

      await waitFor(() => {
        expect(screen.getByText('加载决策记录失败')).toBeInTheDocument();
      });
    });
  });
});
