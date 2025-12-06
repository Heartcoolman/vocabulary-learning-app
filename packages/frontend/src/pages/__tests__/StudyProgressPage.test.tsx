/**
 * StudyProgressPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StudyProgressPage from '../StudyProgressPage';

// Mock useAuth hook
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const mockProgress = {
  todayStudied: 25,
  todayTarget: 50,
  totalMastered: 150,
  totalWords: 500,
  correctRate: 85,
  streakDays: 7,
};

const mockRefresh = vi.fn();

vi.mock('@/hooks/useStudyProgress', () => ({
  useStudyProgress: vi.fn(() => ({
    progress: mockProgress,
    loading: false,
    error: null,
    refresh: mockRefresh,
  })),
}));

vi.mock('@/components/dashboard/ProgressOverviewCard', () => ({
  ProgressOverviewCard: ({ data }: { data: any }) => (
    <div data-testid="progress-overview-card">
      <span>Today: {data.todayStudied}/{data.todayTarget}</span>
      <span>Correct Rate: {data.correctRate}%</span>
    </div>
  ),
}));

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    CircleNotch: ({ className }: { className: string }) => (
      <span data-testid="loading-spinner" className={className}>Loading</span>
    ),
  };
});

vi.mock('lucide-react', () => ({
  TrendingUp: () => <span data-testid="trending-up">📈</span>,
  Activity: () => <span data-testid="activity">📊</span>,
  AlertCircle: () => <span data-testid="alert-circle">⚠️</span>,
}));

describe('StudyProgressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render page title', () => {
      render(<StudyProgressPage />);

      expect(screen.getByText('学习进度')).toBeInTheDocument();
    });

    it('should render subtitle', () => {
      render(<StudyProgressPage />);

      expect(screen.getByText('追踪你的词汇掌握进程')).toBeInTheDocument();
    });

    it('should render ProgressOverviewCard', () => {
      render(<StudyProgressPage />);

      expect(screen.getByTestId('progress-overview-card')).toBeInTheDocument();
    });

    it('should render 7-day activity section', () => {
      render(<StudyProgressPage />);

      expect(screen.getByText('7日学习活动')).toBeInTheDocument();
    });

    it('should render learning efficiency section', () => {
      render(<StudyProgressPage />);

      expect(screen.getByText('学习效率')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: null,
        loading: true,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('正在分析你的学习进度...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error occurs', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: null,
        loading: false,
        error: '网络错误',
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('无法加载进度数据')).toBeInTheDocument();
      expect(screen.getByText('网络错误')).toBeInTheDocument();
    });

    it('should show retry button on error', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: null,
        loading: false,
        error: '加载失败',
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('重试')).toBeInTheDocument();
    });

    it('should call refresh when retry clicked', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: null,
        loading: false,
        error: '加载失败',
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      const retryButton = screen.getByText('重试');
      fireEvent.click(retryButton);

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('progress display', () => {
    it('should display correct rate', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('答题准确率')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should display today completion', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('今日完成度')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should show excellent performance message for high accuracy', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: { ...mockProgress, correctRate: 90 },
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/表现优秀/)).toBeInTheDocument();
    });

    it('should show encouragement for medium accuracy', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: { ...mockProgress, correctRate: 70 },
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/不错的表现/)).toBeInTheDocument();
    });

    it('should show suggestion for low accuracy', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: { ...mockProgress, correctRate: 50 },
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/建议加强复习/)).toBeInTheDocument();
    });
  });

  describe('weekly trend', () => {
    it('should render 7 day bars', () => {
      render(<StudyProgressPage />);

      const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
      dayLabels.forEach(day => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('should render day labels correctly', () => {
      render(<StudyProgressPage />);

      // 测试7日学习活动部分的日期标签
      expect(screen.getByText('7日学习活动')).toBeInTheDocument();
    });
  });

  describe('null progress handling', () => {
    it('should handle null progress gracefully', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: null,
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('无法加载进度数据')).toBeInTheDocument();
    });
  });

  describe('zero target handling', () => {
    it('should handle zero target gracefully', async () => {
      const { useStudyProgress } = await import('@/hooks/useStudyProgress');
      vi.mocked(useStudyProgress).mockReturnValue({
        progress: { ...mockProgress, todayTarget: 0 },
        loading: false,
        error: null,
        refresh: mockRefresh,
      });

      render(<StudyProgressPage />);

      // Should show 0% instead of NaN or Infinity
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });
});
