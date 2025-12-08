/**
 * AdminLayout Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from '../AdminLayout';

const mockNavigate = vi.fn();
const mockAdminUser = {
  id: 'admin-1',
  username: 'admin',
  email: 'admin@test.com',
  role: 'ADMIN' as const,
  createdAt: '2024-01-01',
};
const mockNormalUser = {
  id: 'user-1',
  username: 'user',
  email: 'user@test.com',
  role: 'USER' as const,
  createdAt: '2024-01-01',
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/client', () => ({
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@test.com',
      role: 'ADMIN',
    }),
  },
}));

// Mock useToast hook
vi.mock('@/components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    showToast: vi.fn(),
  }),
}));

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

const renderWithRouter = (initialEntries = ['/admin']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AdminLayout />
    </MemoryRouter>,
  );
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('admin access', () => {
    it('should render admin layout for admin user', async () => {
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

    it('should redirect non-admin users', async () => {
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.getCurrentUser).mockResolvedValue(mockNormalUser);

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should redirect to login on auth error', async () => {
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

      renderWithRouter();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login');
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

    it('should render back to home link', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('返回主页')).toBeInTheDocument();
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
