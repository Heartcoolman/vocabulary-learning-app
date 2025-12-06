/**
 * ProtectedRoute Component Unit Tests
 *
 * 测试路由守卫组件的安全逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

const TestChild = () => <div data-testid="protected-content">Protected Content</div>;

const renderWithRouter = (requireAdmin = false, initialPath = '/protected') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute requireAdmin={requireAdmin}>
              <TestChild />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/403" element={<div data-testid="forbidden-page">Forbidden Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should show loading indicator when auth is loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true
      });

      renderWithRouter();

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('正在验证身份...')).toBeInTheDocument();
    });

    it('should show spinner animation when loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true
      });

      renderWithRouter();

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  // ==================== Authentication Tests ====================

  describe('authentication', () => {
    it('should redirect to login when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false
      });

      renderWithRouter();

      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should render children when authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'testuser', role: 'USER' },
        isAuthenticated: true,
        loading: false
      });

      renderWithRouter();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    });
  });

  // ==================== Admin Authorization Tests ====================

  describe('admin authorization', () => {
    it('should redirect to 403 when requireAdmin is true but user is not admin', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'testuser', role: 'USER' },
        isAuthenticated: true,
        loading: false
      });

      renderWithRouter(true);

      expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should render children when requireAdmin is true and user is admin', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'admin', role: 'ADMIN' },
        isAuthenticated: true,
        loading: false
      });

      renderWithRouter(true);

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('forbidden-page')).not.toBeInTheDocument();
    });

    it('should allow non-admin route access for admin users', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'admin', role: 'ADMIN' },
        isAuthenticated: true,
        loading: false
      });

      renderWithRouter(false);

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should redirect unauthenticated user to login even with requireAdmin', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false
      });

      renderWithRouter(true);

      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('forbidden-page')).not.toBeInTheDocument();
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle undefined user gracefully', () => {
      mockUseAuth.mockReturnValue({
        user: undefined,
        isAuthenticated: false,
        loading: false
      });

      renderWithRouter();

      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });

    it('should handle null role gracefully when requireAdmin is true', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'testuser', role: null },
        isAuthenticated: true,
        loading: false
      });

      renderWithRouter(true);

      expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
    });

    it('should default requireAdmin to false', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'testuser', role: 'USER' },
        isAuthenticated: true,
        loading: false
      });

      // Not passing requireAdmin prop
      render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <TestChild />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have proper aria-live attribute on loading status', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true
      });

      renderWithRouter();

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });
});
