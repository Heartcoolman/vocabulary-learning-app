/**
 * TodayWordsPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockUseStudyPlan = vi.fn();

vi.mock('@/hooks/useStudyPlan', () => ({
  useStudyPlan: () => mockUseStudyPlan(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', username: 'TestUser' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/components/dashboard/DailyMissionCard', () => ({
  DailyMissionCard: ({ onStart, totalWords, todayStudied, todayTarget }: any) => (
    <div data-testid="daily-mission-card">
      <span>Total: {totalWords}</span>
      <span>Studied: {todayStudied}</span>
      <span>Target: {todayTarget}</span>
      <button onClick={onStart}>开始学习</button>
    </div>
  ),
}));

import TodayWordsPage from '../TodayWordsPage';

describe('TodayWordsPage', () => {
  const mockPlan = {
    words: [
      { id: 'w1', spelling: 'apple', meanings: ['苹果'] },
      { id: 'w2', spelling: 'banana', meanings: ['香蕉'] },
      { id: 'w3', spelling: 'cherry', meanings: ['樱桃'] },
    ],
    todayStudied: 5,
    todayTarget: 20,
    correctRate: 85,
    totalStudied: 150,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStudyPlan.mockReturnValue({
      plan: mockPlan,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  describe('rendering', () => {
    it('should render welcome message with username', () => {
      render(<TodayWordsPage />);

      expect(screen.getByText(/欢迎回来，TestUser！/)).toBeInTheDocument();
    });

    it('should render daily mission card', () => {
      render(<TodayWordsPage />);

      expect(screen.getByTestId('daily-mission-card')).toBeInTheDocument();
    });

    it('should pass correct props to DailyMissionCard', () => {
      render(<TodayWordsPage />);

      expect(screen.getByText('Total: 3')).toBeInTheDocument();
      expect(screen.getByText('Studied: 5')).toBeInTheDocument();
      expect(screen.getByText('Target: 20')).toBeInTheDocument();
    });

    it('should render learning statistics', () => {
      render(<TodayWordsPage />);

      expect(screen.getByText('学习统计')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should render word preview section', () => {
      render(<TodayWordsPage />);

      expect(screen.getByText('今日单词预览')).toBeInTheDocument();
      expect(screen.getByText('apple')).toBeInTheDocument();
      expect(screen.getByText('banana')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner', () => {
      mockUseStudyPlan.mockReturnValue({
        plan: null,
        loading: true,
        error: null,
        refresh: vi.fn(),
      });

      render(<TodayWordsPage />);

      expect(screen.getByText('正在加载今日学习计划...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display error message', () => {
      mockUseStudyPlan.mockReturnValue({
        plan: null,
        loading: false,
        error: '网络错误',
        refresh: vi.fn(),
      });

      render(<TodayWordsPage />);

      expect(screen.getByText('无法加载学习计划')).toBeInTheDocument();
      expect(screen.getByText('网络错误')).toBeInTheDocument();
    });

    it('should show reload button on error', () => {
      const mockRefresh = vi.fn();
      mockUseStudyPlan.mockReturnValue({
        plan: null,
        loading: false,
        error: '网络错误',
        refresh: mockRefresh,
      });

      render(<TodayWordsPage />);

      const reloadButton = screen.getByRole('button', { name: '重新加载' });
      expect(reloadButton).toBeInTheDocument();

      fireEvent.click(reloadButton);
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('empty state', () => {
    it('should handle empty words list', () => {
      mockUseStudyPlan.mockReturnValue({
        plan: { ...mockPlan, words: [] },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<TodayWordsPage />);

      expect(screen.queryByText('今日单词预览')).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate to learning page when start clicked', () => {
      render(<TodayWordsPage />);

      fireEvent.click(screen.getByRole('button', { name: '开始学习' }));
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('word preview', () => {
    it('should show up to 6 words in preview', () => {
      const manyWords = Array.from({ length: 10 }, (_, i) => ({
        id: `w${i}`,
        spelling: `word${i}`,
        meanings: [`meaning${i}`],
      }));

      mockUseStudyPlan.mockReturnValue({
        plan: { ...mockPlan, words: manyWords },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      render(<TodayWordsPage />);

      expect(screen.getByText('word0')).toBeInTheDocument();
      expect(screen.getByText('word5')).toBeInTheDocument();
      expect(screen.queryByText('word6')).not.toBeInTheDocument();
      expect(screen.getByText(/还有 4 个单词/)).toBeInTheDocument();
    });
  });
});
