/**
 * AdminDashboard Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminDashboard from '../AdminDashboard';

const mockStats = {
  totalUsers: 100,
  activeUsers: 50,
  totalWordBooks: 10,
  systemWordBooks: 5,
  userWordBooks: 5,
  totalWords: 1000,
  totalRecords: 5000,
};

vi.mock('@/services/ApiClient', () => ({
  default: {
    adminGetStatistics: vi.fn().mockResolvedValue({
      totalUsers: 100,
      activeUsers: 50,
      totalWordBooks: 10,
      systemWordBooks: 5,
      userWordBooks: 5,
      totalWords: 1000,
      totalRecords: 5000,
    }),
  },
}));

vi.mock('@/components/Icon', () => ({
  UsersThree: () => <span data-testid="icon-users">👥</span>,
  Sparkle: () => <span data-testid="icon-sparkle">✨</span>,
  Books: () => <span data-testid="icon-books">📚</span>,
  BookOpen: () => <span data-testid="icon-bookopen">📖</span>,
  Note: () => <span data-testid="icon-note">📝</span>,
  FileText: () => <span data-testid="icon-filetext">📄</span>,
  ChartBar: () => <span data-testid="icon-chartbar">📊</span>,
  CircleNotch: ({ className }: { className?: string }) => (
    <span data-testid="loading-spinner" className={className}>Loading</span>
  ),
  Warning: () => <span data-testid="icon-warning">⚠️</span>,
}));

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      render(<AdminDashboard />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should render page title after loading', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('系统概览')).toBeInTheDocument();
      });
    });

    it('should display statistics cards', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        // Multiple elements may show same text, use getAllByText
        const userElements = screen.getAllByText('总用户数');
        expect(userElements.length).toBeGreaterThan(0);
        const valueElements = screen.getAllByText('100');
        expect(valueElements.length).toBeGreaterThan(0);
      });
    });

    it('should display active users count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('活跃用户')).toBeInTheDocument();
        // Multiple elements may show "50", use getAllByText
        const elements = screen.getAllByText('50');
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display wordbook statistics', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('总词库数')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should display word count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('总单词数')).toBeInTheDocument();
        expect(screen.getByText('1000')).toBeInTheDocument();
      });
    });

    it('should calculate active rate correctly', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('should calculate average words per wordbook', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('平均每词库单词数')).toBeInTheDocument();
        // Multiple elements may show "100", use getAllByText
        const elements = screen.getAllByText('100');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('error state', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetStatistics).mockRejectedValue(new Error('网络错误'));

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('加载失败')).toBeInTheDocument();
        expect(screen.getByText('网络错误')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetStatistics).mockRejectedValue(new Error('Error'));

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should reload data when retry clicked', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetStatistics)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce(mockStats);

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      await waitFor(() => {
        expect(screen.getByText('系统概览')).toBeInTheDocument();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle zero total users', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetStatistics).mockResolvedValue({
        ...mockStats,
        totalUsers: 0,
        activeUsers: 0,
      });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });

    it('should handle zero wordbooks', async () => {
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetStatistics).mockResolvedValue({
        ...mockStats,
        totalWordBooks: 0,
      });

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('平均每词库单词数')).toBeInTheDocument();
      });
    });
  });
});
