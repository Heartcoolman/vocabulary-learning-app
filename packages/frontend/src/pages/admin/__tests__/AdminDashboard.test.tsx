/**
 * AdminDashboard Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminDashboard from '../AdminDashboard';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const {
  mockUseAdminStatistics,
  mockUseSystemHealth,
  mockUseVisualFatigueStats,
  mockUseSystemVersion,
} = vi.hoisted(() => ({
  mockUseAdminStatistics: vi.fn(),
  mockUseSystemHealth: vi.fn(),
  mockUseVisualFatigueStats: vi.fn(),
  mockUseSystemVersion: vi.fn(),
}));

vi.mock('../../../hooks/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/queries')>();
  return {
    ...actual,
    useAdminStatistics: mockUseAdminStatistics,
    useSystemHealth: mockUseSystemHealth,
    useVisualFatigueStats: mockUseVisualFatigueStats,
    useSystemVersion: mockUseSystemVersion,
  };
});

vi.mock('../../../hooks/queries/useLLMAdvisor', () => ({
  useLLMPendingCount: () => ({ data: 0 }),
}));

const { mockAmasClient } = vi.hoisted(() => ({
  mockAmasClient: {
    getAmasStrategy: vi.fn(),
    resetAmasState: vi.fn(),
  },
}));

vi.mock('../../../services/client', () => ({
  amasClient: mockAmasClient,
}));

vi.mock('../../../hooks/mutations', () => ({
  useOTAUpdate: () => ({
    triggerUpdate: vi.fn(),
    updateStatus: null,
    isTriggering: false,
    triggerError: null,
    resetUpdate: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    isCheckingStatus: false,
    isUpdateInProgress: false,
  }),
  useRestartBackend: () => ({
    restartBackend: vi.fn(),
    isPending: false,
    error: null,
    isRestarting: false,
    isConfirmOpen: false,
    openConfirmModal: vi.fn(),
    closeConfirmModal: vi.fn(),
  }),
}));

// Mock useToast hook
vi.mock('../../../components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    showToast: vi.fn(),
  }),
  ConfirmModal: ({ isOpen, onConfirm, onCancel, children }: any) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        {children}
        <button onClick={onConfirm}>确认</button>
        <button onClick={onCancel}>取消</button>
      </div>
    ) : null,
  AlertModal: ({ isOpen, onClose, children }: any) =>
    isOpen ? (
      <div data-testid="alert-modal">
        {children}
        <button onClick={onClose}>关闭</button>
      </div>
    ) : null,
  Modal: ({ isOpen, children }: any) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Progress: ({ value }: any) => <div data-testid="progress" data-value={value} />,
}));

const mockStats = {
  totalUsers: 100,
  activeUsers: 50,
  totalWordBooks: 10,
  systemWordBooks: 5,
  userWordBooks: 5,
  totalWords: 1000,
  totalRecords: 5000,
};

vi.mock('../../../components/Icon', async () => {
  const actual = await vi.importActual<typeof import('../../../components/Icon')>(
    '../../../components/Icon',
  );
  return {
    ...actual,
    UsersThree: () => <span data-testid="icon-users">👥</span>,
    Sparkle: () => <span data-testid="icon-sparkle">✨</span>,
    Books: () => <span data-testid="icon-books">📚</span>,
    BookOpen: () => <span data-testid="icon-bookopen">📖</span>,
    Note: () => <span data-testid="icon-note">📝</span>,
    FileText: () => <span data-testid="icon-filetext">📄</span>,
    ChartBar: () => <span data-testid="icon-chartbar">📊</span>,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
    Warning: () => <span data-testid="icon-warning">⚠️</span>,
  };
});

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const renderWithRouter = () => {
  return renderWithProviders(<AdminDashboard />);
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAmasClient.getAmasStrategy.mockResolvedValue({
      interval_scale: 1.0,
      new_ratio: 0.3,
      difficulty: 'mid',
      batch_size: 10,
      hint_level: 1,
    });
    mockUseSystemHealth.mockReturnValue({ data: undefined });
    mockUseVisualFatigueStats.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mockUseSystemVersion.mockReturnValue({ data: undefined });
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      mockUseAdminStatistics.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title after loading', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('系统概览')).toBeInTheDocument();
      });
    });

    it('should display statistics cards', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        // Multiple elements may show same text, use getAllByText
        const userElements = screen.getAllByText('总用户数');
        expect(userElements.length).toBeGreaterThan(0);
        const valueElements = screen.getAllByText('100');
        expect(valueElements.length).toBeGreaterThan(0);
      });
    });

    it('should display active users count', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('活跃用户')).toBeInTheDocument();
        // Multiple elements may show "50", use getAllByText
        const elements = screen.getAllByText('50');
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display wordbook statistics', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('总词库数')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should display word count', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('总单词数')).toBeInTheDocument();
        expect(screen.getByText('1000')).toBeInTheDocument();
      });
    });

    it('should calculate active rate correctly', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should calculate average words per wordbook', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: mockStats,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('平均每词库单词数')).toBeInTheDocument();
        // Multiple elements may show "100", use getAllByText
        const elements = screen.getAllByText('100');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error state', () => {
    it('should show error message on API failure', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('网络错误'),
        refetch: vi.fn(),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
        expect(screen.getByText('网络错误')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Error'),
        refetch: vi.fn(),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should reload data when retry clicked', async () => {
      const refetch = vi.fn();
      mockUseAdminStatistics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Error'),
        refetch,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      expect(refetch).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle zero total users', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: { ...mockStats, totalUsers: 0, activeUsers: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });

    it('should handle zero wordbooks', async () => {
      mockUseAdminStatistics.mockReturnValue({
        data: { ...mockStats, totalWordBooks: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('平均每词库单词数')).toBeInTheDocument();
      });
    });
  });
});
