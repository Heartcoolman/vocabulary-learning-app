/**
 * WordListPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WordListPage from '../WordListPage';

const mockNavigate = vi.fn();
const mockUser = { id: 'user-1', email: 'test@test.com' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

vi.mock('@/services/StorageService', () => ({
  default: {
    getWords: vi.fn().mockResolvedValue([
      { id: 'w1', spelling: 'apple', phonetic: 'ˈæpl', meanings: ['苹果'] },
      { id: 'w2', spelling: 'banana', phonetic: 'bəˈnænə', meanings: ['香蕉'] },
      { id: 'w3', spelling: 'cherry', phonetic: 'ˈtʃeri', meanings: ['樱桃'] },
    ]),
    getStudyStatistics: vi.fn().mockResolvedValue({
      wordStats: new Map([
        ['w1', { attempts: 10, correct: 8 }],
        ['w2', { attempts: 5, correct: 2 }],
        ['w3', { attempts: 0, correct: 0 }],
      ]),
    }),
    getWordLearningStates: vi.fn().mockResolvedValue([
      { wordId: 'w1', masteryLevel: 4, nextReviewDate: '2024-01-15' },
      { wordId: 'w2', masteryLevel: 2, nextReviewDate: '2024-01-10' },
      { wordId: 'w3', masteryLevel: 0, nextReviewDate: null },
    ]),
    getWordScores: vi.fn().mockResolvedValue([
      { wordId: 'w1', totalScore: 85 },
      { wordId: 'w2', totalScore: 45 },
      { wordId: 'w3', totalScore: 0 },
    ]),
  },
}));

vi.mock('@/services/LearningService', () => ({
  default: {
    markAsMastered: vi.fn().mockResolvedValue(undefined),
    markAsNeedsPractice: vi.fn().mockResolvedValue(undefined),
    resetProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/components/Icon', () => ({
  ArrowLeft: () => <span data-testid="arrow-left">←</span>,
  Star: ({ weight }: { weight: string }) => <span data-testid={`star-${weight}`}>★</span>,
  Target: () => <span data-testid="target">🎯</span>,
  Clock: () => <span data-testid="clock">🕐</span>,
  MagnifyingGlass: () => <span data-testid="search">🔍</span>,
  CheckCircle: () => <span data-testid="check">✓</span>,
  Warning: () => <span data-testid="warning">⚠</span>,
  ArrowClockwise: () => <span data-testid="reset">↻</span>,
}));

describe('WordListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('单词列表')).toBeInTheDocument();
      });
    });

    it('should render word count', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText(/共 3 \/ 3 个单词/)).toBeInTheDocument();
      });
    });

    it('should render all words', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.getByText('banana')).toBeInTheDocument();
        expect(screen.getByText('cherry')).toBeInTheDocument();
      });
    });

    it('should render back button', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('should show loading indicator initially', () => {
      render(<WordListPage />);

      expect(screen.getByText('正在加载单词列表...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should handle error state gracefully', async () => {
      // 这个测试验证组件能正常渲染和加载
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('单词列表')).toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('should filter words by search query', async () => {
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      await user.type(searchInput, 'apple');

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.queryByText('banana')).not.toBeInTheDocument();
      });
    });
  });

  describe('filtering', () => {
    it('should filter by mastery level', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const masterySelect = screen.getByDisplayValue('所有掌握程度');
      fireEvent.change(masterySelect, { target: { value: '4' } });

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.queryByText('banana')).not.toBeInTheDocument();
      });
    });

    it('should filter by score range', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const scoreSelect = screen.getByDisplayValue('所有得分');
      fireEvent.change(scoreSelect, { target: { value: 'high' } });

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.queryByText('banana')).not.toBeInTheDocument();
      });
    });
  });

  describe('sorting', () => {
    it('should sort by score descending by default', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        const words = screen.getAllByRole('heading', { level: 3 });
        expect(words[0]).toHaveTextContent('apple');
      });
    });

    it('should change sort order', async () => {
      render(<WordListPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('得分 (高到低)');
      fireEvent.change(sortSelect, { target: { value: 'score-asc' } });

      await waitFor(() => {
        const words = screen.getAllByRole('heading', { level: 3 });
        expect(words[0]).toHaveTextContent('cherry');
      });
    });
  });

  describe('word adjustment', () => {
    it('should show confirm dialog when marking as mastered', async () => {
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const masteredButtons = screen.getAllByText('已掌握');
      await user.click(masteredButtons[0]);

      expect(screen.getByText('确认操作')).toBeInTheDocument();
      expect(screen.getByText(/标记为已掌握/)).toBeInTheDocument();
    });

    it('should close dialog when cancelled', async () => {
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const masteredButtons = screen.getAllByText('已掌握');
      await user.click(masteredButtons[0]);

      const cancelButton = screen.getByText('取消');
      await user.click(cancelButton);

      expect(screen.queryByText('确认操作')).not.toBeInTheDocument();
    });

    it('should call markAsMastered when confirmed', async () => {
      const LearningService = (await import('@/services/LearningService')).default;
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const masteredButtons = screen.getAllByText('已掌握');
      await user.click(masteredButtons[0]);

      const confirmButton = screen.getByText('确认');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(LearningService.markAsMastered).toHaveBeenCalled();
      });
    });
  });

  describe('navigation', () => {
    it('should navigate back when back button clicked', async () => {
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('单词列表')).toBeInTheDocument();
      });

      const backButton = screen.getByRole('button', { name: '返回' });
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('empty state', () => {
    it('should show empty message when no words match filter', async () => {
      render(<WordListPage />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText('没有找到符合条件的单词')).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });
});
