/**
 * AdminUsers Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminUsers from '../AdminUsers';

const mockUsers = [
  { id: 'u1', username: 'user1', email: 'user1@test.com', role: 'USER', createdAt: '2024-01-01' },
  {
    id: 'u2',
    username: 'admin1',
    email: 'admin1@test.com',
    role: 'ADMIN',
    createdAt: '2024-01-02',
  },
];

const mockPagination = {
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

vi.mock('@/services/ApiClient', () => ({
  default: {
    adminGetUsers: vi.fn().mockResolvedValue({
      users: [
        {
          id: 'u1',
          username: 'user1',
          email: 'user1@test.com',
          role: 'USER',
          createdAt: '2024-01-01',
        },
        {
          id: 'u2',
          username: 'admin1',
          email: 'admin1@test.com',
          role: 'ADMIN',
          createdAt: '2024-01-02',
        },
      ],
      pagination: { total: 2, page: 1, pageSize: 20, totalPages: 1 },
    }),
    adminDeleteUser: vi.fn().mockResolvedValue(undefined),
    adminUpdateUserRole: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock useToast hook and ConfirmModal
vi.mock('@/components/ui', () => ({
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
}));

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    CircleNotch: ({ className }: { className?: string }) => (
      <span data-testid="loading-spinner" className={className}>
        Loading
      </span>
    ),
  };
});

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <AdminUsers />
    </MemoryRouter>,
  );
};

describe('AdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      renderWithRouter();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('用户管理')).toBeInTheDocument();
      });
    });

    it('should display user list', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('user1')).toBeInTheDocument();
        expect(screen.getByText('admin1')).toBeInTheDocument();
      });
    });

    it('should display user emails', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('user1@test.com')).toBeInTheDocument();
        expect(screen.getByText('admin1@test.com')).toBeInTheDocument();
      });
    });

    it('should display role badges', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('普通用户')).toBeInTheDocument();
        expect(screen.getByText('管理员')).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('should render search input', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索用户名或邮箱...')).toBeInTheDocument();
      });
    });

    it('should call API with search term', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索用户名或邮箱...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索用户名或邮箱...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(apiClient.adminGetUsers).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'test', page: 1 }),
        );
      });
    });
  });

  describe('user actions', () => {
    it('should show view link for each user', async () => {
      renderWithRouter();

      await waitFor(() => {
        const viewLinks = screen.getAllByText('查看');
        expect(viewLinks.length).toBe(2);
      });
    });

    it('should show role toggle button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('升为管理员')).toBeInTheDocument();
        expect(screen.getByText('降为用户')).toBeInTheDocument();
      });
    });

    it('should call API when toggling role', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('升为管理员')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('升为管理员'));

      // 现在需要点击确认弹窗的确认按钮
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('确认'));

      await waitFor(() => {
        expect(apiClient.adminUpdateUserRole).toHaveBeenCalledWith('u1', 'ADMIN');
      });
    });

    it('should show delete button for non-admin users', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('删除')).toBeInTheDocument();
      });
    });

    it('should call delete API when confirmed', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('删除')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('删除'));

      // 现在需要点击确认弹窗的确认按钮
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('确认'));

      await waitFor(() => {
        expect(apiClient.adminDeleteUser).toHaveBeenCalledWith('u1');
      });
    });
  });

  describe('pagination', () => {
    it('should display pagination info when multiple pages', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetUsers).mockResolvedValue({
        users: mockUsers,
        pagination: { ...mockPagination, totalPages: 2 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/共 2 个用户/)).toBeInTheDocument();
      });
    });

    it('should show pagination buttons when multiple pages', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetUsers).mockResolvedValue({
        users: mockUsers,
        pagination: { ...mockPagination, totalPages: 3 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('上一页')).toBeInTheDocument();
        expect(screen.getByText('下一页')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty message when no users', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetUsers).mockResolvedValue({
        users: [],
        pagination: { ...mockPagination, total: 0 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('没有找到用户')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetUsers).mockRejectedValue(new Error('加载失败'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });
  });
});
