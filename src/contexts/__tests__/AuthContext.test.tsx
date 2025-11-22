import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import apiClient from '../../services/ApiClient';

// Mock ApiClient
vi.mock('../../services/ApiClient', () => ({
  default: {
    getToken: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该在没有token时初始化为未认证状态', async () => {
    vi.mocked(apiClient.getToken).mockReturnValue(null);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('应该在有token时加载用户信息', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      username: 'Test User',
      role: 'USER' as const,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(apiClient.getToken).mockReturnValue('test-token');
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });

  it('应该在useAuth在AuthProvider外使用时抛出错误', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth必须在AuthProvider内部使用');
  });
});
