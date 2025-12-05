/**
 * ProtectedRoute Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock AuthContext
const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate" data-to={to} data-replace={String(replace)}>
      Redirecting to {to}
    </div>
  ),
}));

// Import after mocks
import ProtectedRoute from '../ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when loading', () => {
    it('should show loading spinner', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('正在验证身份...')).toBeInTheDocument();
    });

    it('should display loading animation', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should not render children while loading', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: true,
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('when not authenticated', () => {
    it('should redirect to login page', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      const navigate = screen.getByTestId('navigate');
      expect(navigate).toBeInTheDocument();
      expect(navigate).toHaveAttribute('data-to', '/login');
    });

    it('should use replace navigation', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      const navigate = screen.getByTestId('navigate');
      expect(navigate).toHaveAttribute('data-replace', 'true');
    });

    it('should not render children when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('when authenticated', () => {
    it('should render children', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should not show loading spinner', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('should not redirect', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    });

    it('should render multiple children', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    it('should render nested components', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      const NestedComponent = () => (
        <div data-testid="nested">
          <span>Nested Content</span>
        </div>
      );

      render(
        <ProtectedRoute>
          <NestedComponent />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });
  });

  describe('state transitions', () => {
    it('should handle loading to authenticated transition', () => {
      // Start with loading state
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
      });

      const { rerender } = render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

      // Transition to authenticated
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        loading: false,
      });

      rerender(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should handle loading to unauthenticated transition', () => {
      // Start with loading state
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
      });

      const { rerender } = render(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();

      // Transition to unauthenticated
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: false,
      });

      rerender(
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigate')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have aria-live on loading status', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        loading: true,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });
});
