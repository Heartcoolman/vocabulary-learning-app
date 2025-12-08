import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ProfilePage from '../ProfilePage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuth hook
const mockLogout = vi.fn();
const mockUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    logout: mockLogout,
  })),
}));

// Mock apiClient
vi.mock('../../services/client', () => ({
  default: {
    updatePassword: vi.fn(),
  },
}));

// Mock StorageService
vi.mock('../../services/StorageService', () => ({
  default: {
    syncToCloud: vi.fn(),
    deleteDatabase: vi.fn(),
  },
}));

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};
vi.mock('../../components/ui', async () => {
  const actual = await vi.importActual('../../components/ui');
  return {
    ...actual,
    useToast: () => mockToast,
    ConfirmModal: ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText }: any) =>
      isOpen ? (
        <div data-testid="confirm-modal">
          <h2>{title}</h2>
          <p>{message}</p>
          <button onClick={onConfirm}>{confirmText}</button>
          <button onClick={onClose}>{cancelText}</button>
        </div>
      ) : null,
  };
});

// Import mocked modules for assertions
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/client';
import StorageService from '../../services/StorageService';

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: mockUser,
      logout: mockLogout,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', () => {
      renderComponent();
      expect(screen.getByText('个人资料')).toBeInTheDocument();
    });

    it('should render all tab buttons', () => {
      renderComponent();
      const tabs = screen.getByRole('navigation', { name: 'Tabs' });
      expect(tabs).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /基本信息/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /修改密码/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /数据管理/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /学习习惯/ })).toBeInTheDocument();
    });

    it('should display user information on profile tab', () => {
      renderComponent();
      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should show login prompt when user is not logged in', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        logout: mockLogout,
      });

      renderComponent();
      expect(screen.getByText('请先登录')).toBeInTheDocument();
      expect(screen.getByText('前往登录')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to password tab when clicked', async () => {
      renderComponent();
      const passwordTab = screen.getByText('修改密码');
      fireEvent.click(passwordTab);

      await waitFor(() => {
        expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
        expect(screen.getByLabelText('新密码')).toBeInTheDocument();
        expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
      });
    });

    it('should switch to cache tab when clicked', async () => {
      renderComponent();
      const cacheTab = screen.getByText('数据管理');
      fireEvent.click(cacheTab);

      await waitFor(() => {
        expect(screen.getByText('数据缓存')).toBeInTheDocument();
        expect(screen.getByText('刷新缓存')).toBeInTheDocument();
        expect(screen.getByText('清除本地缓存')).toBeInTheDocument();
      });
    });

    it('should switch to habit tab when clicked', async () => {
      renderComponent();
      const habitTab = screen.getByText('学习习惯');
      fireEvent.click(habitTab);

      await waitFor(() => {
        expect(screen.getByText('学习习惯分析')).toBeInTheDocument();
        expect(screen.getByText('查看完整分析')).toBeInTheDocument();
      });
    });
  });

  describe('Password Change', () => {
    beforeEach(() => {
      (apiClient.updatePassword as any).mockResolvedValue({});
    });

    it('should show error when fields are empty', async () => {
      renderComponent();
      // Click tab to switch to password change form
      const tabs = screen.getByRole('navigation', { name: 'Tabs' });
      fireEvent.click(tabs.querySelector('button:nth-child(2)')!);

      await waitFor(() => {
        expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
      });

      // Get submit button by type="submit"
      const submitButton = document.querySelector('button[type="submit"]')!;
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('请填写所有密码字段')).toBeInTheDocument();
      });
    });

    it('should show error when new password is too short', async () => {
      renderComponent();
      const tabs = screen.getByRole('navigation', { name: 'Tabs' });
      fireEvent.click(tabs.querySelector('button:nth-child(2)')!);

      await waitFor(() => {
        expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
      });

      const oldPasswordInput = screen.getByLabelText('当前密码');
      const newPasswordInput = screen.getByLabelText('新密码');
      const confirmPasswordInput = screen.getByLabelText('确认新密码');

      await userEvent.type(oldPasswordInput, 'oldpass123');
      await userEvent.type(newPasswordInput, 'short');
      await userEvent.type(confirmPasswordInput, 'short');

      const submitButton = document.querySelector('button[type="submit"]')!;
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('新密码长度至少为8个字符')).toBeInTheDocument();
      });
    });

    it('should show error when passwords do not match', async () => {
      renderComponent();
      const tabs = screen.getByRole('navigation', { name: 'Tabs' });
      fireEvent.click(tabs.querySelector('button:nth-child(2)')!);

      await waitFor(() => {
        expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
      });

      const oldPasswordInput = screen.getByLabelText('当前密码');
      const newPasswordInput = screen.getByLabelText('新密码');
      const confirmPasswordInput = screen.getByLabelText('确认新密码');

      await userEvent.type(oldPasswordInput, 'oldpass123');
      await userEvent.type(newPasswordInput, 'newpassword123');
      await userEvent.type(confirmPasswordInput, 'differentpassword');

      const submitButton = document.querySelector('button[type="submit"]')!;
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('两次输入的新密码不一致')).toBeInTheDocument();
      });
    });

    it('should successfully change password', async () => {
      renderComponent();
      const tabs = screen.getByRole('navigation', { name: 'Tabs' });
      fireEvent.click(tabs.querySelector('button:nth-child(2)')!);

      await waitFor(() => {
        expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
      });

      const oldPasswordInput = screen.getByLabelText('当前密码');
      const newPasswordInput = screen.getByLabelText('新密码');
      const confirmPasswordInput = screen.getByLabelText('确认新密码');

      await userEvent.type(oldPasswordInput, 'oldpass123');
      await userEvent.type(newPasswordInput, 'newpassword123');
      await userEvent.type(confirmPasswordInput, 'newpassword123');

      const submitButton = document.querySelector('button[type="submit"]')!;
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(apiClient.updatePassword).toHaveBeenCalledWith('oldpass123', 'newpassword123');
        expect(screen.getByText('密码修改成功！')).toBeInTheDocument();
      });
    });
  });

  describe('Cache Management', () => {
    it('should sync data when clicking refresh cache button', async () => {
      (StorageService.syncToCloud as any).mockResolvedValue(undefined);

      renderComponent();
      fireEvent.click(screen.getByText('数据管理'));

      await waitFor(() => {
        expect(screen.getByText('刷新缓存')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('刷新缓存'));

      await waitFor(() => {
        expect(StorageService.syncToCloud).toHaveBeenCalled();
        expect(screen.getByText('已刷新缓存并同步最新数据')).toBeInTheDocument();
      });
    });

    it('should show clear cache confirmation', async () => {
      renderComponent();
      fireEvent.click(screen.getByText('数据管理'));

      await waitFor(() => {
        expect(screen.getByText('清除本地缓存')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('清除本地缓存'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText('清除缓存')).toBeInTheDocument();
      });
    });

    it('should clear cache when confirmed', async () => {
      (StorageService.deleteDatabase as any).mockResolvedValue(undefined);

      renderComponent();
      fireEvent.click(screen.getByText('数据管理'));

      await waitFor(() => {
        expect(screen.getByText('清除本地缓存')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('清除本地缓存'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      // Click confirm button in modal
      fireEvent.click(screen.getByText('清除'));

      await waitFor(() => {
        expect(StorageService.deleteDatabase).toHaveBeenCalled();
        expect(mockToast.success).toHaveBeenCalledWith('本地缓存已清除');
      });
    });
  });

  describe('Logout', () => {
    it('should show logout confirmation', async () => {
      renderComponent();
      fireEvent.click(screen.getByText('退出登录'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText('确定要退出登录吗？')).toBeInTheDocument();
      });
    });

    it('should logout and navigate when confirmed', async () => {
      mockLogout.mockResolvedValue(undefined);

      renderComponent();
      fireEvent.click(screen.getByText('退出登录'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('退出'));

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Habit Profile Navigation', () => {
    it('should navigate to habit profile page when clicking view button', async () => {
      renderComponent();
      fireEvent.click(screen.getByText('学习习惯'));

      await waitFor(() => {
        expect(screen.getByText('查看完整分析')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('查看完整分析'));

      expect(mockNavigate).toHaveBeenCalledWith('/habit-profile');
    });
  });

  describe('Login Redirect', () => {
    it('should navigate to login page when user is not logged in and clicks login button', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        logout: mockLogout,
      });

      renderComponent();
      fireEvent.click(screen.getByText('前往登录'));

      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
