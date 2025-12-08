/**
 * Navigation Component Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navigation from '../Navigation';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock animations
vi.mock('../../utils/animations', () => ({
  fadeInVariants: {},
  g3SpringStandard: { type: 'spring', stiffness: 500, damping: 30 },
}));

// Mock Icon components
vi.mock('../Icon', () => ({
  CaretDown: () => <span data-testid="caret-down">▼</span>,
  Clock: () => <span>🕐</span>,
  TrendUp: () => <span>📈</span>,
  Trophy: () => <span>🏆</span>,
  CalendarCheck: () => <span>📅</span>,
  ChartBar: () => <span>📊</span>,
  Target: () => <span>🎯</span>,
  UserCircle: () => <span>👤</span>,
  List: () => <span data-testid="list-icon">☰</span>,
  X: () => <span data-testid="x-icon">✕</span>,
}));

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const renderWithRouter = (initialPath = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navigation />
    </MemoryRouter>,
  );
};

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    });
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render app title', () => {
      renderWithRouter();

      expect(screen.getByText('词汇学习')).toBeInTheDocument();
    });

    it('should render main navigation links', () => {
      renderWithRouter();

      expect(screen.getByText('学习')).toBeInTheDocument();
      expect(screen.getByText('词库管理')).toBeInTheDocument();
      expect(screen.getByText('学习设置')).toBeInTheDocument();
      expect(screen.getByText('学习历史')).toBeInTheDocument();
    });

    it('should render login link when not authenticated', () => {
      renderWithRouter();

      expect(screen.getByText('登录')).toBeInTheDocument();
    });

    it('should render username when authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { username: 'testuser', role: 'USER' },
      });
      renderWithRouter();

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should render admin link for admin users', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { username: 'admin', role: 'ADMIN' },
      });
      renderWithRouter();

      expect(screen.getByText('管理后台')).toBeInTheDocument();
    });

    it('should not render admin link for non-admin users', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { username: 'testuser', role: 'USER' },
      });
      renderWithRouter();

      expect(screen.queryByText('管理后台')).not.toBeInTheDocument();
    });
  });

  // ==================== Active State Tests ====================

  describe('active state', () => {
    it('should highlight active link', () => {
      renderWithRouter('/vocabulary');

      const vocabularyLink = screen.getByText('词库管理').closest('a');
      expect(vocabularyLink?.className).toContain('bg-blue-500');
    });

    it('should have aria-current on active page', () => {
      renderWithRouter('/');

      const learnLink = screen.getByText('学习').closest('a');
      expect(learnLink).toHaveAttribute('aria-current', 'page');
    });

    it('should not have aria-current on inactive pages', () => {
      renderWithRouter('/');

      const historyLink = screen.getByText('学习历史').closest('a');
      expect(historyLink).not.toHaveAttribute('aria-current');
    });
  });

  // ==================== Dropdown Tests ====================

  describe('insights dropdown', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { username: 'testuser', role: 'USER' },
      });
    });

    it('should show insights button when authenticated', () => {
      renderWithRouter();

      expect(screen.getByText('学习洞察')).toBeInTheDocument();
    });

    it('should not show insights when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
      });
      renderWithRouter();

      expect(screen.queryByText('学习洞察')).not.toBeInTheDocument();
    });

    it('should open dropdown on click', () => {
      renderWithRouter();

      fireEvent.click(screen.getByText('学习洞察'));

      expect(screen.getByText('学习统计')).toBeInTheDocument();
      expect(screen.getByText('学习时机')).toBeInTheDocument();
      expect(screen.getByText('趋势分析')).toBeInTheDocument();
    });

    it('should close dropdown on second click', () => {
      renderWithRouter();

      const button = screen.getByText('学习洞察');
      fireEvent.click(button);
      fireEvent.click(button);

      expect(screen.queryByText('学习统计')).not.toBeInTheDocument();
    });

    it('should have aria-expanded attribute', () => {
      renderWithRouter();

      const button = screen.getByText('学习洞察').closest('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button!);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have aria-haspopup attribute', () => {
      renderWithRouter();

      const button = screen.getByText('学习洞察').closest('button');
      expect(button).toHaveAttribute('aria-haspopup', 'true');
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have banner role on header', () => {
      renderWithRouter();

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('should have navigation role', () => {
      renderWithRouter();

      expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
    });

    it('should have proper aria-label for home link', () => {
      renderWithRouter();

      expect(screen.getByLabelText('返回首页')).toBeInTheDocument();
    });

    it('should have proper aria-label for profile link', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        user: { username: 'testuser', role: 'USER' },
      });
      renderWithRouter();

      expect(screen.getByLabelText(/个人资料 - testuser/)).toBeInTheDocument();
    });
  });
});
