/**
 * AuthContext Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { ReactNode } from 'react';

// Mock apiClient - must be defined before vi.mock
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockRegister = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockSetToken = vi.fn();
const mockClearToken = vi.fn();
const mockGetToken = vi.fn();
const mockSetOnUnauthorized = vi.fn();

vi.mock('@/services/ApiClient', () => ({
  default: {
    login: (...args: unknown[]) => mockLogin(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    setToken: (...args: unknown[]) => mockSetToken(...args),
    clearToken: (...args: unknown[]) => mockClearToken(...args),
    getToken: (...args: unknown[]) => mockGetToken(...args),
    setOnUnauthorized: (...args: unknown[]) => mockSetOnUnauthorized(...args),
  },
}));

// Mock StorageService
const mockSetCurrentUser = vi.fn();
const mockClearLocalData = vi.fn();
const mockInit = vi.fn();

vi.mock('@/services/StorageService', () => ({
  default: {
    setCurrentUser: (...args: unknown[]) => mockSetCurrentUser(...args),
    clearLocalData: (...args: unknown[]) => mockClearLocalData(...args),
    init: (...args: unknown[]) => mockInit(...args),
  },
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  authLogger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { AuthProvider, useAuth } from '../AuthContext';

// Test wrapper component
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// Test consumer component
const TestConsumer = () => {
  const { user, isAuthenticated, loading, login, logout, register, refreshUser } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'loaded'}</span>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</span>
      <span data-testid="user-email">{user?.email || 'no-user'}</span>
      <span data-testid="user-id">{user?.id || 'no-id'}</span>
      <button data-testid="login-btn" onClick={() => login('test@test.com', 'password')}>Login</button>
      <button data-testid="logout-btn" onClick={() => logout()}>Logout</button>
      <button data-testid="register-btn" onClick={() => register('test@test.com', 'password', 'testuser')}>Register</button>
      <button data-testid="refresh-btn" onClick={() => refreshUser()}>Refresh</button>
    </div>
  );
};

// Mock user data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  role: 'USER' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no token
    mockGetToken.mockReturnValue(null);
    mockSetCurrentUser.mockResolvedValue(undefined);
    mockClearLocalData.mockResolvedValue(undefined);
  });

  describe('useAuth', () => {
    it('should provide auth state', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should provide user info when authenticated', async () => {
      // Setup: user has token and getCurrentUser returns user
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.user?.email).toBe('test@example.com');
      expect(result.current.user?.username).toBe('testuser');
    });

    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // renderHook captures errors in result.error instead of throwing
      const { result } = renderHook(() => useAuth());

      expect(result.error).toEqual(
        new Error('useAuth必须在AuthProvider内部使用')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('login', () => {
    it('should handle successful login', async () => {
      const authResponse = { user: mockUser, token: 'new-token' };
      mockLogin.mockResolvedValue(authResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockSetToken).toHaveBeenCalledWith('new-token');
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockSetCurrentUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle failed login', async () => {
      const loginError = new Error('Invalid credentials');
      mockLogin.mockRejectedValue(loginError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'wrongpassword');
        })
      ).rejects.toThrow('Invalid credentials');

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should store token', async () => {
      const authResponse = { user: mockUser, token: 'jwt-token-12345' };
      mockLogin.mockResolvedValue(authResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.login('test@example.com', 'password');
      });

      expect(mockSetToken).toHaveBeenCalledWith('jwt-token-12345');
    });

    it('should throw error when token is missing in response', async () => {
      const authResponse = { user: mockUser, token: '' };
      mockLogin.mockResolvedValue(authResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password');
        })
      ).rejects.toThrow('登录响应中缺少认证令牌');
    });
  });

  describe('logout', () => {
    it('should clear auth state', async () => {
      // Start with logged in state
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should clear token', async () => {
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockClearToken).toHaveBeenCalled();
      expect(mockSetCurrentUser).toHaveBeenCalledWith(null);
      expect(mockClearLocalData).toHaveBeenCalled();
    });

    it('should clear state even when logout API fails', async () => {
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogout.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      // Should still clear even if API call fails
      expect(mockClearToken).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('should handle registration', async () => {
      const authResponse = { user: mockUser, token: 'register-token' };
      mockRegister.mockResolvedValue(authResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.register('new@example.com', 'password123', 'newuser');
      });

      expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'password123', 'newuser');
      expect(mockSetToken).toHaveBeenCalledWith('register-token');
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should validate input - handle registration failure', async () => {
      const registerError = new Error('Email already exists');
      mockRegister.mockRejectedValue(registerError);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.register('existing@example.com', 'password', 'user');
        })
      ).rejects.toThrow('Email already exists');

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should throw error when token is missing in register response', async () => {
      const authResponse = { user: mockUser, token: '' };
      mockRegister.mockResolvedValue(authResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.register('new@example.com', 'password', 'newuser');
        })
      ).rejects.toThrow('注册响应中缺少认证令牌');
    });
  });

  describe('token refresh', () => {
    it('should refresh token', async () => {
      const updatedUser = { ...mockUser, username: 'updateduser' };
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user?.username).toBe('testuser');
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      expect(mockGetCurrentUser).toHaveBeenCalledTimes(2);
      expect(result.current.user?.username).toBe('updateduser');
    });

    it('should handle refresh failure', async () => {
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser
        .mockResolvedValueOnce(mockUser)
        .mockRejectedValueOnce(new Error('Token expired'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      // Should clear user on refresh failure
      expect(mockClearToken).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('initial loading', () => {
    it('should set loading to true initially', async () => {
      mockGetToken.mockReturnValue('valid-token');
      // Delay the getCurrentUser to observe loading state
      mockGetCurrentUser.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUser), 100))
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Should start as loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should finish loading when no token exists', async () => {
      mockGetToken.mockReturnValue(null);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('unauthorized handler', () => {
    it('should register unauthorized handler on mount', async () => {
      const { unmount } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockSetOnUnauthorized).toHaveBeenCalled();
      });

      // Should have been called with a function
      expect(typeof mockSetOnUnauthorized.mock.calls[0][0]).toBe('function');

      unmount();

      // Should clear handler on unmount
      expect(mockSetOnUnauthorized).toHaveBeenLastCalledWith(null);
    });

    it('should clear user state when unauthorized callback is triggered', async () => {
      mockGetToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue(mockUser);

      let unauthorizedCallback: (() => void) | null = null;
      mockSetOnUnauthorized.mockImplementation((cb) => {
        unauthorizedCallback = cb;
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Simulate unauthorized callback being triggered
      act(() => {
        if (unauthorizedCallback) {
          unauthorizedCallback();
        }
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Provider rendering', () => {
    it('should render children correctly', async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      });

      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      expect(screen.getByTestId('user-email')).toHaveTextContent('no-user');
    });

    it('should show authenticated state after login', async () => {
      const authResponse = { user: mockUser, token: 'test-token' };
      mockLogin.mockResolvedValue(authResponse);

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      });

      // Click login button
      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('user-id')).toHaveTextContent('user-123');
    });
  });
});
