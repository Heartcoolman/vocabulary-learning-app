/**
 * UserDetailPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserDetailPage from '../UserDetailPage';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Mock the services/client module
vi.mock('@/services/client', async () => {
  const actual = await vi.importActual('@/services/client');

  const mockStatisticsData = {
    user: {
      id: 'u1',
      username: 'testuser',
      email: 'test@test.com',
      role: 'USER',
      createdAt: '2024-01-01',
    },
    totalWordsLearned: 100,
    accuracy: 85,
    averageScore: 78.5,
    studyDays: 30,
    consecutiveDays: 7,
    totalStudyTime: 120,
    masteryDistribution: {
      level0: 10,
      level1: 15,
      level2: 20,
      level3: 25,
      level4: 20,
      level5: 10,
    },
  };

  const mockWordsData = {
    words: [
      {
        word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: [] },
        score: 85,
        accuracy: 0.9,
        reviewCount: 10,
        masteryLevel: 4,
        lastReviewDate: '2024-01-15',
        nextReviewDate: '2024-01-20',
        state: 'reviewing',
      },
      {
        word: {
          id: 'w2',
          spelling: 'banana',
          phonetic: 'bəˈnænə',
          meanings: ['香蕉'],
          examples: [],
        },
        score: 60,
        accuracy: 0.7,
        reviewCount: 5,
        masteryLevel: 2,
        lastReviewDate: '2024-01-14',
        nextReviewDate: '2024-01-18',
        state: 'learning',
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  };

  const mockLearningData = {
    user: { id: 'u1', email: 'test@test.com', username: 'testuser' },
    totalRecords: 100,
    correctRecords: 85,
    averageAccuracy: 0.85,
    totalWordsLearned: 100,
    recentRecords: [],
  };

  const mockApiClient = {
    adminGetUserStatistics: vi.fn().mockResolvedValue(mockStatisticsData),
    adminGetUserWords: vi.fn().mockResolvedValue(mockWordsData),
    adminExportUserWords: vi.fn().mockResolvedValue(undefined),
    adminGetUserLearningData: vi.fn().mockResolvedValue(mockLearningData),
    setOnUnauthorized: vi.fn(),
  };

  return {
    ...actual,
    default: mockApiClient,
    apiClient: mockApiClient,
  };
});

// Mock useToast hook
vi.mock('@/components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui')>();
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      showToast: vi.fn(),
    }),
  };
});

vi.mock('@/components/Icon', async () => {
  const actual = await vi.importActual('@/components/Icon');
  return {
    ...actual,
    User: () => <span data-testid="icon-user">👤</span>,
    ChartBar: () => <span data-testid="icon-chart">📊</span>,
    Target: () => <span data-testid="icon-target">🎯</span>,
    Clock: () => <span data-testid="icon-clock">🕐</span>,
    TrendUp: () => <span data-testid="icon-trend">📈</span>,
    Books: () => <span data-testid="icon-books">📚</span>,
    ArrowLeft: () => <span data-testid="icon-arrow">←</span>,
    MagnifyingGlass: () => <span data-testid="icon-search">🔍</span>,
    CaretLeft: () => <span data-testid="icon-caret-left">‹</span>,
    CaretRight: () => <span data-testid="icon-caret-right">›</span>,
    WarningCircle: () => <span data-testid="icon-warning">⚠️</span>,
  };
});

vi.mock('@phosphor-icons/react', () => ({
  Flame: () => <span data-testid="icon-flame">🔥</span>,
  CaretDown: () => <span data-testid="icon-caret-down">▼</span>,
  ArrowUp: () => <span data-testid="icon-arrow-up">↑</span>,
  ArrowDown: () => <span data-testid="icon-arrow-down">↓</span>,
  ListDashes: () => <span data-testid="icon-list">☰</span>,
  Brain: () => <span data-testid="icon-brain">🧠</span>,
  ChartLine: () => <span data-testid="icon-chartline">📈</span>,
  Download: () => <span data-testid="icon-download">📥</span>,
  CalendarBlank: () => <span data-testid="icon-calendar">📅</span>,
  Lightning: () => <span data-testid="icon-lightning">⚡</span>,
}));

vi.mock('@/components/admin/LearningRecordsTab', () => ({
  default: () => <div data-testid="learning-records-tab">Learning Records Tab</div>,
}));

vi.mock('@/components/admin/AMASDecisionsTab', () => ({
  default: () => <div data-testid="amas-decisions-tab">AMAS Decisions Tab</div>,
}));

const renderWithRouter = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/users/u1']}>
        <Routes>
          <Route path="/admin/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  describe('loading state', () => {
    it('should show loading indicators initially', () => {
      renderWithRouter();

      expect(screen.getByText(/加载/i)).toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('should display user statistics', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
      });
    });

    it('should display total words count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });

    it('should display accuracy rate', async () => {
      renderWithRouter();

      await waitFor(
        () => {
          expect(screen.getByText(/85\.0%/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should display streak days', async () => {
      renderWithRouter();

      await waitFor(
        () => {
          // consecutiveDays is 7
          expect(screen.getByText('7')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('word list', () => {
    it('should display word list after loading', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.getByText('banana')).toBeInTheDocument();
      });
    });
  });

  describe('tabs', () => {
    it('should render overview tab by default', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
      });
    });

    it('should switch to learning records tab', async () => {
      renderWithRouter();

      await waitFor(() => {
        const recordsTab = screen.getByText(/学习记录/);
        fireEvent.click(recordsTab);
      });

      expect(screen.getByTestId('learning-records-tab')).toBeInTheDocument();
    });

    it('should switch to AMAS decisions tab', async () => {
      renderWithRouter();

      await waitFor(
        () => {
          expect(screen.getByText('testuser')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Tab text is "决策分析" not "AMAS"
      const decisionsTab = screen.getByText(/决策分析/);
      fireEvent.click(decisionsTab);

      await waitFor(() => {
        expect(screen.getByTestId('amas-decisions-tab')).toBeInTheDocument();
      });
    });
  });

  describe('export functionality', () => {
    it('should call export API when export button clicked', async () => {
      const apiClient = (await import('@/services/client')).default;
      renderWithRouter();

      await waitFor(
        () => {
          expect(screen.getByText('testuser')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Button text is "导出CSV" (direct button, no dropdown)
      const exportButton = screen.getByText('导出CSV');
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(apiClient.adminExportUserWords).toHaveBeenCalledWith('u1', 'csv');
      });
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.adminGetUserStatistics).mockRejectedValue(new Error('网络错误'));

      renderWithRouter();

      await waitFor(
        () => {
          // Error page shows "加载失败" as title and the error message
          expect(screen.getByText('加载失败')).toBeInTheDocument();
          expect(screen.getByText('网络错误')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });
  });

  describe('navigation', () => {
    it('should render back button', async () => {
      // 重新设置正确的 mock（因为上一个测试修改了它）
      const apiClient = (await import('@/services/client')).default;
      vi.mocked(apiClient.adminGetUserStatistics).mockResolvedValue({
        user: {
          id: 'u1',
          username: 'testuser',
          email: 'test@test.com',
          role: 'USER',
          createdAt: '2024-01-01',
        },
        totalWordsLearned: 100,
        accuracy: 85,
        averageScore: 78.5,
        studyDays: 30,
        consecutiveDays: 7,
        totalStudyTime: 120,
        masteryDistribution: {
          level0: 10,
          level1: 15,
          level2: 20,
          level3: 25,
          level4: 20,
          level5: 10,
        },
      });

      renderWithRouter();

      // 等待用户名加载后，返回按钮应该可见
      await waitFor(
        () => {
          expect(screen.getByText('testuser')).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // 返回按钮文本是"返回用户列表"
      expect(screen.getByText('返回用户列表')).toBeInTheDocument();
    });
  });
});
