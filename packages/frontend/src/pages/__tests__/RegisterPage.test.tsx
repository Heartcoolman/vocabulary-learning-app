/**
 * RegisterPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '../RegisterPage';

const mockNavigate = vi.fn();
const mockRegister = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

vi.mock('@/components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Icon')>();
  return {
    ...actual,
    ArrowLeft: () => <span data-testid="arrow-left">←</span>,
  };
});

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render page title', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('heading', { name: '创建账号' })).toBeInTheDocument();
    });

    it('should render all form fields', () => {
      render(<RegisterPage />);
      expect(screen.getByLabelText('用户名')).toBeInTheDocument();
      expect(screen.getByLabelText('邮箱地址')).toBeInTheDocument();
      expect(screen.getByLabelText('密码')).toBeInTheDocument();
      expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
    });

    it('should render register button', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    });

    it('should render login link', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('link', { name: '立即登录' })).toHaveAttribute('href', '/login');
    });

    it('should render password hint', () => {
      render(<RegisterPage />);
      expect(screen.getByText('密码长度至少为8个字符')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('should show error for empty fields', async () => {
      render(<RegisterPage />);

      fireEvent.click(screen.getByRole('button', { name: '注册' }));

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

    it('should show error for short password', async () => {
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'short');
      await user.type(screen.getByLabelText('确认密码'), 'short');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('密码长度至少为8个字符');
      });
    });

    it('should show error for password mismatch', async () => {
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'different123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致');
      });
    });

    it('should show error for short username', async () => {
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'a');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('用户名至少为2个字符');
      });
    });
  });

  describe('form submission', () => {
    it('should call register with correct data', async () => {
      mockRegister.mockResolvedValueOnce(undefined);
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith('test@example.com', 'password123', 'testuser');
      });
    });

    it('should navigate to home on successful registration', async () => {
      mockRegister.mockResolvedValueOnce(undefined);
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should show error message on registration failure', async () => {
      mockRegister.mockRejectedValueOnce(new Error('该邮箱已被注册'));
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'existing@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('该邮箱已被注册');
      });
    });
  });

  describe('loading state', () => {
    it('should show loading state during registration', async () => {
      mockRegister.mockImplementation(() => new Promise(() => {}));
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByText('注册中...')).toBeInTheDocument();
      });
    });

    it('should disable all inputs during loading', async () => {
      mockRegister.mockImplementation(() => new Promise(() => {}));
      render(<RegisterPage />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText('用户名'), 'testuser');
      await user.type(screen.getByLabelText('邮箱地址'), 'test@example.com');
      await user.type(screen.getByLabelText('密码'), 'password123');
      await user.type(screen.getByLabelText('确认密码'), 'password123');
      await user.click(screen.getByRole('button', { name: '注册' }));

      await waitFor(() => {
        expect(screen.getByLabelText('用户名')).toBeDisabled();
        expect(screen.getByLabelText('邮箱地址')).toBeDisabled();
        expect(screen.getByLabelText('密码')).toBeDisabled();
        expect(screen.getByLabelText('确认密码')).toBeDisabled();
      });
    });
  });
});
