import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import WordMasteryPage from '../WordMasteryPage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock data matching actual component expectations
const mockStats = {
  totalWords: 100,
  masteredWords: 60,
  learningWords: 30,
  needReviewCount: 10,
};

const mockWordsWithMastery = [
  {
    id: 'word-1',
    spelling: 'achievement',
    meanings: '成就; 成绩',
    mastery: { wordId: 'word-1', score: 0.9, isLearned: true },
  },
  {
    id: 'word-2',
    spelling: 'accomplish',
    meanings: '完成; 实现',
    mastery: { wordId: 'word-2', score: 0.6, isLearned: false },
  },
  {
    id: 'word-3',
    spelling: 'adequate',
    meanings: '足够的; 适当的',
    mastery: { wordId: 'word-3', score: 0.3, isLearned: false },
  },
];

// Mock useMasteryWords hook
const mockRefetch = vi.fn();
const mockUseMasteryWords = vi.fn();

vi.mock('../../hooks/queries/useMasteryWords', () => ({
  useMasteryWords: () => mockUseMasteryWords(),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock MasteryStatsCard component
vi.mock('../../components/word-mastery/MasteryStatsCard', () => ({
  MasteryStatsCard: ({ label, value }: { label: string; value: number }) => (
    <div data-testid={`stats-card-${label}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

// Mock MasteryWordItem component
vi.mock('../../components/word-mastery/MasteryWordItem', () => ({
  MasteryWordItem: ({ spelling, meanings }: { spelling: string; meanings: string }) => (
    <div data-testid={`word-item-${spelling}`}>
      <span>{spelling}</span>
      <span>{meanings}</span>
    </div>
  ),
}));

// Mock WordMasteryDetailModal component
vi.mock('../../components/word-mastery/WordMasteryDetailModal', () => ({
  WordMasteryDetailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="word-detail-modal">
        <button onClick={onClose}>关闭</button>
      </div>
    ) : null,
}));

describe('WordMasteryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation - successful data load
    mockUseMasteryWords.mockReturnValue({
      words: mockWordsWithMastery,
      stats: mockStats,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <WordMasteryPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('单词掌握度分析')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/查看您的单词学习进度/)).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: null,
        loading: true,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();
      // The component shows a spinning div, not text
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Stats Cards Display', () => {
    it('should display mastered words count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('stats-card-已掌握')).toBeInTheDocument();
      });
    });

    it('should display learning words count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('stats-card-学习中')).toBeInTheDocument();
      });
    });

    it('should display need review count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('stats-card-需复习')).toBeInTheDocument();
      });
    });

    it('should display total words count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('stats-card-总词汇量')).toBeInTheDocument();
      });
    });
  });

  describe('Word List Display', () => {
    it('should display word items', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('word-item-achievement')).toBeInTheDocument();
        expect(screen.getByTestId('word-item-accomplish')).toBeInTheDocument();
        expect(screen.getByTestId('word-item-adequate')).toBeInTheDocument();
      });
    });

    it('should display word count', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/共 3 个单词/)).toBeInTheDocument();
      });
    });
  });

  describe('Filter Tabs', () => {
    it('should display filter tabs', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '已掌握' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '学习中' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '需复习' })).toBeInTheDocument();
      });
    });

    it('should filter words when clicking mastered tab', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '已掌握' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '已掌握' }));

      await waitFor(() => {
        // Only word-1 has isLearned: true
        expect(screen.getByTestId('word-item-achievement')).toBeInTheDocument();
      });
    });
  });

  describe('Search', () => {
    it('should display search input', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });
    });

    it('should filter words when searching', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      fireEvent.change(searchInput, { target: { value: 'achieve' } });

      await waitFor(() => {
        expect(screen.getByTestId('word-item-achievement')).toBeInTheDocument();
      });
    });
  });

  describe('Word Detail Modal', () => {
    it('should open modal when clicking on a word', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('word-item-achievement')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('word-item-achievement'));

      await waitFor(() => {
        expect(screen.getByTestId('word-detail-modal')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no words', async () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: mockStats,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('暂无学习记录')).toBeInTheDocument();
      });
    });

    it('should show message about starting learning', async () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: mockStats,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/开始学习后.*会显示/)).toBeInTheDocument();
      });
    });
  });

  describe('No Match State', () => {
    it('should show no match message when search has no results', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索单词...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('搜索单词...');
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('没有找到匹配的单词')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: null,
        loading: false,
        error: '加载数据失败，请稍后重试',
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('加载数据失败，请稍后重试')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: null,
        loading: false,
        error: '加载数据失败，请稍后重试',
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when clicking retry button', async () => {
      mockUseMasteryWords.mockReturnValue({
        words: [],
        stats: null,
        loading: false,
        error: '加载数据失败，请稍后重试',
        refetch: mockRefetch,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('重试'));

      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
