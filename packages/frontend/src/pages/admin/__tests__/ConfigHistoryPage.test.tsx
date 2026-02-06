/**
 * ConfigHistoryPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfigHistoryPage from '../ConfigHistoryPage';

const mockHistory = [
  {
    id: 'h1',
    configId: 'config-1',
    timestamp: Date.now() - 1000,
    changedBy: 'admin',
    changeReason: '调整复习间隔',
    previousValue: { reviewIntervals: [1, 3, 7] },
    newValue: { reviewIntervals: [1, 3, 7, 14] },
  },
  {
    id: 'h2',
    configId: 'config-1',
    timestamp: Date.now() - 86400000,
    changedBy: 'system',
    changeReason: '自动调整',
    previousValue: { consecutiveCorrectThreshold: 4 },
    newValue: { consecutiveCorrectThreshold: 5 },
  },
];

const mockUseConfigHistory = vi.fn();

vi.mock('../../../hooks/queries/useConfigHistory', () => ({
  useConfigHistory: (...args: unknown[]) => mockUseConfigHistory(...args),
}));

vi.mock('@/components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Icon')>();
  return {
    ...actual,
    Clock: () => <span data-testid="icon-clock">🕐</span>,
    MagnifyingGlass: () => <span data-testid="icon-search">🔍</span>,
    ArrowCounterClockwise: () => <span data-testid="icon-reset">↺</span>,
  };
});

describe('ConfigHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConfigHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      mockUseConfigHistory.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<ConfigHistoryPage />);

      expect(screen.getByText('加载配置历史中...')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('配置历史')).toBeInTheDocument();
      });
    });

    it('should display history records', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument();
        expect(screen.getByText('system')).toBeInTheDocument();
      });
    });

    it('should display change reasons', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('调整复习间隔')).toBeInTheDocument();
        expect(screen.getByText('自动调整')).toBeInTheDocument();
      });
    });

    it('should display record count', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('should render search input', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索修改人或修改原因...')).toBeInTheDocument();
      });
    });

    it('should filter by search term', async () => {
      render(<ConfigHistoryPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索修改人或修改原因...');
      await user.type(searchInput, 'admin');

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument();
        expect(screen.queryByText('system')).not.toBeInTheDocument();
      });
    });
  });

  describe('date filtering', () => {
    it('should render date filter buttons', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('全部')).toBeInTheDocument();
        expect(screen.getByText('今天')).toBeInTheDocument();
        expect(screen.getByText('本周')).toBeInTheDocument();
        expect(screen.getByText('本月')).toBeInTheDocument();
      });
    });

    it('should filter by today', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getByText('全部')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('今天'));

      await waitFor(() => {
        expect(screen.getByText('筛选后 1 条')).toBeInTheDocument();
      });
    });
  });

  describe('record expansion', () => {
    it('should show expand button for records with changes', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        const expandButtons = screen.getAllByText('展开详情');
        expect(expandButtons.length).toBeGreaterThan(0);
      });
    });

    it('should show changed fields when expanded', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getAllByText('展开详情')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('展开详情')[0]);

      await waitFor(() => {
        expect(screen.getByText('收起详情')).toBeInTheDocument();
        expect(screen.getByText('修改前')).toBeInTheDocument();
        expect(screen.getByText('修改后')).toBeInTheDocument();
      });
    });

    it('should collapse details when clicked again', async () => {
      render(<ConfigHistoryPage />);

      await waitFor(() => {
        expect(screen.getAllByText('展开详情')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByText('展开详情')[0]);

      await waitFor(() => {
        expect(screen.getByText('收起详情')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('收起详情'));

      await waitFor(() => {
        expect(screen.queryByText('收起详情')).not.toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show no match message when filter returns empty', async () => {
      render(<ConfigHistoryPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索修改人或修改原因...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索修改人或修改原因...');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('没有符合条件的记录')).toBeInTheDocument();
      });
    });
  });
});
