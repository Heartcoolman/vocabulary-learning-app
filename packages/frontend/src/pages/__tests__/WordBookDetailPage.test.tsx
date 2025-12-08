/**
 * WordBookDetailPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockNavigate, mockApiClient } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockApiClient: {
    getWordBookById: vi.fn(),
    getWordBookWords: vi.fn(),
    addWordToWordBook: vi.fn(),
    removeWordFromWordBook: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'wordbook-123' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('../../services/client', () => ({
  default: mockApiClient,
}));

vi.mock('../../services/AudioService', () => ({
  default: {
    playPronunciation: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock useToast hook
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  uiLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import WordBookDetailPage from '../WordBookDetailPage';

describe('WordBookDetailPage', () => {
  const mockWordBook = {
    id: 'wordbook-123',
    name: 'Test WordBook',
    description: 'A test wordbook',
    type: 'USER',
    wordCount: 3,
  };

  const mockWords = [
    {
      id: 'word-1',
      spelling: 'apple',
      phonetic: 'æpl',
      meanings: ['苹果'],
      examples: ['I eat an apple.'],
    },
    {
      id: 'word-2',
      spelling: 'banana',
      phonetic: 'bəˈnænə',
      meanings: ['香蕉'],
      examples: ['A yellow banana.'],
    },
    {
      id: 'word-3',
      spelling: 'cherry',
      phonetic: 'ˈtʃeri',
      meanings: ['樱桃'],
      examples: ['Cherry blossom.'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getWordBookById.mockResolvedValue(mockWordBook);
    mockApiClient.getWordBookWords.mockResolvedValue(mockWords);
  });

  describe('rendering', () => {
    it('should show loading state initially', () => {
      mockApiClient.getWordBookById.mockImplementation(() => new Promise(() => {}));
      render(<WordBookDetailPage />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });

    it('should render wordbook details after loading', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Test WordBook')).toBeInTheDocument();
      });

      expect(screen.getByText('A test wordbook')).toBeInTheDocument();
    });

    it('should display word count', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/共 3 个单词/)).toBeInTheDocument();
      });
    });

    it('should render all words in grid', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.getByText('banana')).toBeInTheDocument();
        expect(screen.getByText('cherry')).toBeInTheDocument();
      });
    });
  });

  describe('user wordbook features', () => {
    it('should show add word button for user wordbook', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /添加.*单词/ })).toBeInTheDocument();
      });
    });

    it('should hide add word button for system wordbook', async () => {
      mockApiClient.getWordBookById.mockResolvedValue({
        ...mockWordBook,
        type: 'SYSTEM',
      });

      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Test WordBook')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /添加.*单词/ })).not.toBeInTheDocument();
    });

    it('should show delete button for each word in user wordbook', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        const deleteButtons = screen.getAllByRole('button', { name: /删除/ });
        expect(deleteButtons.length).toBe(3);
      });
    });
  });

  describe('add word dialog', () => {
    it('should open add word dialog when button clicked', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /添加.*单词/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /添加.*单词/ }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should close dialog when cancel clicked', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /添加.*单词/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /添加.*单词/ }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /取消/ }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('word detail dialog', () => {
    it('should open word detail when word card clicked', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('apple'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('navigation', () => {
    it('should navigate back to vocabulary list', async () => {
      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Test WordBook')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /返回词库列表/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/vocabulary');
    });
  });

  describe('error handling', () => {
    it('should display error message on fetch failure', async () => {
      mockApiClient.getWordBookById.mockRejectedValue(new Error('加载失败'));

      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('出错了')).toBeInTheDocument();
      });
    });

    it('should show return button on error', async () => {
      mockApiClient.getWordBookById.mockRejectedValue(new Error('加载失败'));

      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /返回词库列表/ })).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no words', async () => {
      mockApiClient.getWordBookWords.mockResolvedValue([]);
      mockApiClient.getWordBookById.mockResolvedValue({ ...mockWordBook, wordCount: 0 });

      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('这个词书还没有单词')).toBeInTheDocument();
      });
    });
  });

  describe('pagination', () => {
    it('should show pagination when many words', async () => {
      const manyWords = Array.from({ length: 25 }, (_, i) => ({
        id: `word-${i}`,
        spelling: `word${i}`,
        phonetic: `word${i}`,
        meanings: [`meaning${i}`],
        examples: [],
      }));

      mockApiClient.getWordBookWords.mockResolvedValue(manyWords);
      mockApiClient.getWordBookById.mockResolvedValue({ ...mockWordBook, wordCount: 25 });

      render(<WordBookDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /分页/ })).toBeInTheDocument();
      });
    });
  });
});
