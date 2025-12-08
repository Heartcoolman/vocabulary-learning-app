/**
 * StudyProgressPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  totalStudied: 500,
  totalMastered: 150,
  totalWords: 500,
  correctRate: 85,
  streakDays: 7,
  weeklyTrend: [10, 20, 15, 25, 30, 20, 25],
};

const mockRefresh = vi.fn();
const mockRefetch = vi.fn().mockResolvedValue({ data: mockProgress });

// Mock the correct hook from queries folder
vi.mock('@/hooks/queries/useStudyProgress', () => ({
  useStudyProgressWithRefresh: vi.fn(() => ({
    progress: mockProgress,
    loading: false,
    error: null,
    refresh: mockRefetch,
  })),
  useStudyProgress: vi.fn(() => ({
    data: mockProgress,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  })),
}));

// Mock useExtendedProgress hook
vi.mock('@/hooks/useExtendedProgress', () => ({
  useExtendedProgress: vi.fn(() => ({
    progress: null,
    loading: false,
    error: null,
    refresh: mockRefresh,
  })),
}));

vi.mock('@/components/dashboard/ProgressOverviewCard', () => ({
  ProgressOverviewCard: ({ data }: { data: any }) => (
    <div data-testid="progress-overview-card">
      <span>
        Today: {data.todayStudied}/{data.todayTarget}
      </span>
      <span>Correct Rate: {data.correctRate}%</span>
    </div>
  ),
}));

vi.mock('@/components/Icon', () => ({
  CircleNotch: ({ className }: { className?: string }) => (
    <span data-testid="loading-spinner" className={className}>
      Loading
    </span>
  ),
  TrendUp: () => <span data-testid="trend-up">📈</span>,
  Activity: () => <span data-testid="activity">📊</span>,
  WarningCircle: () => <span data-testid="warning-circle">⚠️</span>,
  Calendar: () => <span data-testid="calendar">📅</span>,
  Fire: () => <span data-testid="fire">🔥</span>,
  Confetti: () => <span data-testid="confetti">🎉</span>,
  Lightning: () => <span data-testid="lightning">⚡</span>,
}));

// Mock other components that might be used
vi.mock('@/components/progress/MilestoneCard', () => ({
  MilestoneCard: () => <div data-testid="milestone-card">Milestone</div>,
}));

vi.mock('@/components/progress/GoalTracker', () => ({
  GoalTracker: () => <div data-testid="goal-tracker">Goal Tracker</div>,
}));

vi.mock('@/components/progress/MasteryDistributionChart', () => ({
  MasteryDistributionChart: () => <div data-testid="mastery-chart">Mastery Chart</div>,
}));

vi.mock('@/components/LineChart', () => ({
  default: () => <div data-testid="line-chart">Line Chart</div>,
}));

describe('StudyProgressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('学习进度')).toBeInTheDocument();
    });

    it('should render subtitle', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('追踪你的词汇掌握进程')).toBeInTheDocument();
    });

    it('should render ProgressOverviewCard', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByTestId('progress-overview-card')).toBeInTheDocument();
    });

    it('should render 7-day activity section', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('7日学习活动')).toBeInTheDocument();
    });

    it('should render learning efficiency section', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('学习效率')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: null,
        loading: true,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('正在分析你的学习进度...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error occurs', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: null,
        loading: false,
        error: '网络错误',
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('无法加载进度数据')).toBeInTheDocument();
      expect(screen.getByText('网络错误')).toBeInTheDocument();
    });

    it('should show retry button on error', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: null,
        loading: false,
        error: '加载失败',
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('重试')).toBeInTheDocument();
    });

    it('should call refresh when retry clicked', async () => {
      const mockRefreshFn = vi.fn();
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: null,
        loading: false,
        error: '加载失败',
        refresh: mockRefreshFn,
      });

      render(<StudyProgressPage />);

      const retryButton = screen.getByText('重试');
      fireEvent.click(retryButton);

      expect(mockRefreshFn).toHaveBeenCalled();
    });
  });

  describe('progress display', () => {
    it('should display correct rate', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('答题准确率')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should display today completion', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('今日完成度')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should show excellent performance message for high accuracy', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: { ...mockProgress, correctRate: 90 },
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/表现优秀/)).toBeInTheDocument();
    });

    it('should show encouragement for medium accuracy', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: { ...mockProgress, correctRate: 70 },
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/不错的表现/)).toBeInTheDocument();
    });

    it('should show suggestion for low accuracy', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: { ...mockProgress, correctRate: 50 },
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText(/建议加强复习/)).toBeInTheDocument();
    });
  });

  describe('weekly trend', () => {
    it('should render 7 day bars', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
      dayLabels.forEach((day) => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('should render day labels correctly', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: mockProgress,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      // 测试7日学习活动部分的日期标签
      expect(screen.getByText('7日学习活动')).toBeInTheDocument();
    });
  });

  describe('null progress handling', () => {
    it('should handle null progress gracefully', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: null,
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      expect(screen.getByText('无法加载进度数据')).toBeInTheDocument();
    });
  });

  describe('zero target handling', () => {
    it('should handle zero target gracefully', async () => {
      const { useStudyProgressWithRefresh } = await import('@/hooks/queries/useStudyProgress');
      vi.mocked(useStudyProgressWithRefresh).mockReturnValue({
        progress: { ...mockProgress, todayTarget: 0 },
        loading: false,
        error: null,
        refresh: mockRefetch,
      });

      render(<StudyProgressPage />);

      // Should show 0% instead of NaN or Infinity
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });
});
