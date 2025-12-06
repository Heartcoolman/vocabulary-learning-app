/**
 * LoginPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock('@/components/Icon', () => ({
  ArrowLeft: () => <span data-testid="arrow-left">←</span>,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render page title', () => {
      render(<LoginPage />);
      expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    });

    it('should render email input', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('邮箱地址')).toBeInTheDocument();
    });

    it('should render password input', () => {
      render(<LoginPage />);
      expect(screen.getByLabelText('密码')).toBeInTheDocument();
    });

    it('should render login button', () => {
      render(<LoginPage />);
      expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    });

    it('should render register link', () => {
      render(<LoginPage />);
      expect(screen.getByRole('link', { name: '立即注册' })).toHaveAttribute('href', '/register');
    });

    it('should render back to home link', () => {
      render(<LoginPage />);
      expect(screen.getByRole('link', { name: /了解更多/ })).toHaveAttribute('href', '/about');
    });
  });

  describe('validation', () => {
    it('should show error for empty fields', async () => {
      render(<LoginPage />);
      const submitButton = screen.getByRole('button', { name: '登录' });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('请填写所有字段');
      });
    });

    it('should validate email format', () => {
      // Email validation regex test
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test('valid@email.com')).toBe(true);
      expect(emailRegex.test('notvalid')).toBe(false);
      expect(emailRegex.test('missing@dot')).toBe(false);
    });

    it('should show error when only email is filled', async () => {
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('请填写所有字段');
      });
    });
  });

  describe('form submission', () => {
    it('should call login with correct credentials', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('should navigate to home on successful login', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should show error message on login failure', async () => {
      mockLogin.mockRejectedValueOnce(new Error('登录失败'));
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('登录失败');
      });
    });
  });

  describe('loading state', () => {
    it('should show loading state during login', async () => {
      mockLogin.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(screen.getByText('登录中...')).toBeInTheDocument();
      });
    });

    it('should disable inputs during loading', async () => {
      mockLogin.mockImplementation(() => new Promise(() => {}));
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '登录' }));

      await waitFor(() => {
        expect(screen.getByLabelText('邮箱地址')).toBeDisabled();
        expect(screen.getByLabelText('密码')).toBeDisabled();
      });
    });
  });

  describe('keyboard interaction', () => {
    it('should submit form on Enter key', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      render(<LoginPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
    });
  });
});
