/**
 * AdminLayout Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from '../AdminLayout';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
  };
});

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    ChartBar: () => <span data-testid="icon-chart">📊</span>,
    UsersThree: () => <span data-testid="icon-users">👥</span>,
    Books: () => <span data-testid="icon-books">📚</span>,
    Gear: () => <span data-testid="icon-gear">⚙️</span>,
    Clock: () => <span data-testid="icon-clock">🕐</span>,
    ArrowLeft: () => <span data-testid="icon-arrow">←</span>,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
  };
});

vi.mock('@/hooks/queries/useSystemVersion', () => ({
  useSystemVersion: vi.fn(() => ({
    data: {
      currentVersion: '0.1.0',
      latestVersion: '0.1.0',
      hasUpdate: false,
      releaseUrl: null,
      releaseNotes: null,
      publishedAt: null,
    },
    isLoading: false,
    error: null,
  })),
}));

// Mock admin auth store
vi.mock('@/stores/adminAuthStore', () => ({
  useAdminAuthStore: vi.fn(() => ({
    user: {
      id: 'admin-1',
      username: 'admin',
      email: 'admin@test.com',
    },
    clearAuth: vi.fn(),
  })),
}));

// Mock admin auth client
vi.mock('@/services/client/admin/AdminAuthClient', () => ({
  adminLogout: vi.fn().mockResolvedValue(undefined),
}));

// Mock useToast hook
vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      showToast: vi.fn(),
    }),
  };
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const renderWithRouter = (initialEntries = ['/admin']) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AdminLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('admin access', () => {
    it('should render admin layout', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('管理后台')).toBeInTheDocument();
      });
    });

    it('should display admin username', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument();
      });
    });
  });

  describe('navigation menu', () => {
    it('should render dashboard link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('仪表盘')).toBeInTheDocument();
      });
    });

    it('should render user management link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('用户管理')).toBeInTheDocument();
      });
    });

    it('should render wordbook management link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('系统词库')).toBeInTheDocument();
      });
    });

    it('should render algorithm config link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('算法配置')).toBeInTheDocument();
      });
    });

    it('should render config history link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('配置历史')).toBeInTheDocument();
      });
    });

    it('should render logout button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('退出登录')).toBeInTheDocument();
      });
    });
  });

  describe('active menu item', () => {
    it('should highlight dashboard on /admin path', async () => {
      renderWithRouter(['/admin']);

      await waitFor(() => {
        const dashboardLink = screen.getByText('仪表盘').closest('a');
        expect(dashboardLink).toHaveClass('bg-blue-50');
      });
    });

    it('should highlight users on /admin/users path', async () => {
      renderWithRouter(['/admin/users']);

      await waitFor(() => {
        const usersLink = screen.getByText('用户管理').closest('a');
        expect(usersLink).toHaveClass('bg-blue-50');
      });
    });
  });
});
