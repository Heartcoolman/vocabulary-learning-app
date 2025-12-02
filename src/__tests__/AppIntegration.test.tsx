import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import App from '../App';
import apiClient from '../services/ApiClient';

vi.mock('../services/ApiClient');

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Mock common API calls
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      username: 'testuser',
      role: 'USER',
      createdAt: '2024-01-01'
    });
    
    vi.mocked(apiClient.login).mockResolvedValue({
      token: 'test-token',
      user: {
        id: 'user-1',
        email: 'test@test.com',
        username: 'testuser',
        role: 'USER',
        createdAt: '2024-01-01'
      }
    });
  });

  it('应该渲染应用并显示登录页', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/登录|Login/i)).toBeInTheDocument();
    });
  });

  it('应该支持用户登录流程', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/邮箱|Email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/邮箱|Email/i);
    const passwordInput = screen.getByLabelText(/密码|Password/i);
    
    await user.type(emailInput, 'test@test.com');
    await user.type(passwordInput, 'password123');

    const loginButton = screen.getByRole('button', { name: /登录|Login/i });
    await user.click(loginButton);

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith('test@test.com', 'password123');
    });
  });

  it('应该保护需要认证的路由', async () => {
    render(<App />);

    // 未登录时访问根路径应该重定向到登录页
    await waitFor(() => {
      expect(screen.getByText(/登录|Login/i)).toBeInTheDocument();
    });
  });

  it('应该允许访问公开路由（/about）', async () => {
    render(<App />);

    // /about 路由应该不需要登录
    window.history.pushState({}, '', '/about');

    await waitFor(() => {
      expect(screen.getByText(/AMAS|决策/i)).toBeInTheDocument();
    });
  });
});
