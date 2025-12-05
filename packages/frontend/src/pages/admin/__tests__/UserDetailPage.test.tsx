/**
 * UserDetailPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserDetailPage from '../UserDetailPage';

const mockStatistics = {
  user: { id: 'u1', username: 'testuser', email: 'test@test.com', role: 'USER' },
  totalWordsLearned: 100,
  masteredWords: 50,
  learningWords: 30,
  newWords: 20,
  totalRecords: 500,
  accuracy: 85,
  averageScore: 78.5,
  avgResponseTime: 2500,
  studyDays: 30,
  consecutiveDays: 7,
  totalStudyTime: 120,
  lastActiveAt: '2024-01-15',
  masteryDistribution: {
    level0: 10,
    level1: 15,
    level2: 20,
    level3: 25,
    level4: 20,
    level5: 10,
  },
};

const mockWords = [
  { wordId: 'w1', spelling: 'apple', score: 85, accuracy: 0.9, reviewCount: 10, masteryLevel: 4 },
  { wordId: 'w2', spelling: 'banana', score: 60, accuracy: 0.7, reviewCount: 5, masteryLevel: 2 },
];

const mockPagination = { page: 1, pageSize: 20, total: 2, totalPages: 1 };

vi.mock('@/services/ApiClient', () => ({
  default: {
    adminGetUserStatistics: vi.fn().mockResolvedValue({
      user: { id: 'u1', username: 'testuser', email: 'test@test.com', role: 'USER' },
      totalWordsLearned: 100,
      masteredWords: 50,
      learningWords: 30,
      newWords: 20,
      totalRecords: 500,
      accuracy: 85,
      averageScore: 78.5,
      avgResponseTime: 2500,
      studyDays: 30,
      consecutiveDays: 7,
      totalStudyTime: 120,
      lastActiveAt: '2024-01-15',
      masteryDistribution: {
        level0: 10,
        level1: 15,
        level2: 20,
        level3: 25,
        level4: 20,
        level5: 10,
      },
    }),
    adminGetUserWords: vi.fn().mockResolvedValue({
      words: [
        {
          word: { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'], examples: [] },
          score: 85, accuracy: 0.9, reviewCount: 10, masteryLevel: 4,
          lastReviewDate: '2024-01-15', nextReviewDate: '2024-01-20', state: 'reviewing'
        },
        {
          word: { id: 'w2', spelling: 'banana', phonetic: 'bəˈnænə', meanings: ['香蕉'], examples: [] },
          score: 60, accuracy: 0.7, reviewCount: 5, masteryLevel: 2,
          lastReviewDate: '2024-01-14', nextReviewDate: '2024-01-18', state: 'learning'
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    }),
    adminExportUserWords: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/components/Icon', () => ({
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
}));

vi.mock('@phosphor-icons/react', () => ({
  Flame: () => <span data-testid="icon-flame">🔥</span>,
  CaretDown: () => <span data-testid="icon-caret-down">▼</span>,
  ArrowUp: () => <span data-testid="icon-arrow-up">↑</span>,
  ArrowDown: () => <span data-testid="icon-arrow-down">↓</span>,
  ListDashes: () => <span data-testid="icon-list">☰</span>,
  Brain: () => <span data-testid="icon-brain">🧠</span>,
}));

vi.mock('@/components/admin/LearningRecordsTab', () => ({
  default: () => <div data-testid="learning-records-tab">Learning Records Tab</div>,
}));

vi.mock('@/components/admin/AMASDecisionsTab', () => ({
  default: () => <div data-testid="amas-decisions-tab">AMAS Decisions Tab</div>,
}));

const renderWithRouter = () => {
  return render(
    <MemoryRouter initialEntries={['/admin/users/u1']}>
      <Routes>
        <Route path="/admin/users/:userId" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>
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

      await waitFor(() => {
        expect(screen.getByText(/85\.0%/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should display streak days', async () => {
      renderWithRouter();

      await waitFor(() => {
        // consecutiveDays is 7
        expect(screen.getByText('7')).toBeInTheDocument();
      }, { timeout: 3000 });
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

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
      }, { timeout: 3000 });

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
      const apiClient = (await import('@/services/ApiClient')).default;
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument();
      }, { timeout: 3000 });

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
      const apiClient = (await import('@/services/ApiClient')).default;
      vi.mocked(apiClient.adminGetUserStatistics).mockRejectedValue(new Error('网络错误'));

      renderWithRouter();

      await waitFor(() => {
        // Error page shows "加载失败" as title
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('navigation', () => {
    it('should render back button', async () => {
      renderWithRouter();

      // Back button should be visible immediately, no need to wait for data
      await waitFor(() => {
        expect(screen.getByText('返回用户列表')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});
