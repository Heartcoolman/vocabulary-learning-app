import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import HistoryPage from '../HistoryPage';

// Mock 导航
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock data for word statistics
const mockWordStats = new Map([
  ['word-1', { attempts: 10, correct: 8, lastStudied: Date.now() - 3600000 }],
  ['word-2', { attempts: 5, correct: 5, lastStudied: Date.now() - 7200000 }],
  ['word-3', { attempts: 8, correct: 2, lastStudied: Date.now() - 86400000 }],
]);

const mockWords = [
  { id: 'word-1', spelling: 'apple', meaning: '苹果' },
  { id: 'word-2', spelling: 'banana', meaning: '香蕉' },
  { id: 'word-3', spelling: 'cherry', meaning: '樱桃' },
];

// Mock StorageService
vi.mock('../../services/StorageService', () => ({
  default: {
    getStudyStatistics: vi.fn(),
    getWords: vi.fn(),
  },
}));

// Mock API Client
vi.mock('../../services/ApiClient', () => ({
  default: {
    getStateHistory: vi.fn(),
    getCognitiveGrowth: vi.fn(),
    getSignificantChanges: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock errorHandler
vi.mock('../../utils/errorHandler', () => ({
  handleError: vi.fn((err) => err?.message || '未知错误'),
}));

import StorageService from '../../services/StorageService';
import ApiClient from '../../services/ApiClient';

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (StorageService.getStudyStatistics as any).mockResolvedValue({
      wordStats: mockWordStats,
    });
    (StorageService.getWords as any).mockResolvedValue(mockWords);
    (ApiClient.getStateHistory as any).mockResolvedValue({ history: [] });
    (ApiClient.getCognitiveGrowth as any).mockResolvedValue(null);
    (ApiClient.getSignificantChanges as any).mockResolvedValue({ changes: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('学习历史')).toBeInTheDocument();
      });
    });

    it('should render page subtitle', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('追踪你的学习进度，掌握每个单词')).toBeInTheDocument();
      });
    });

    it('should render view mode tabs', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('单词统计')).toBeInTheDocument();
        expect(screen.getByText('状态历史')).toBeInTheDocument();
      });
    });

    it('should render statistics panel', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('总学习单词')).toBeInTheDocument();
        expect(screen.getByText('平均正确率')).toBeInTheDocument();
      });

      // Check for mastery stats - these have exact text in the stats panel
      // Note: there are also filter buttons with similar text but different format
      const masteredElements = screen.getAllByText(/已掌握/);
      expect(masteredElements.length).toBeGreaterThan(0);

      const reviewingElements = screen.getAllByText(/需复习/);
      expect(reviewingElements.length).toBeGreaterThan(0);
    });

    it('should render word cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.getByText('banana')).toBeInTheDocument();
        expect(screen.getByText('cherry')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      // Make the promise never resolve
      (StorageService.getStudyStatistics as any).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      expect(screen.getByText('正在加载...')).toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    it('should display correct word count', async () => {
      renderComponent();

      await waitFor(() => {
        // Total words: 3
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('should display mastery levels', async () => {
      renderComponent();

      await waitFor(() => {
        // Check for mastery labels
        const masteredElements = screen.getAllByText('已掌握');
        expect(masteredElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Filtering', () => {
    it('should have filter buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/全部/)).toBeInTheDocument();
        // Look for filter buttons with counts
        expect(screen.getByText(/已掌握 \(/)).toBeInTheDocument();
        expect(screen.getByText(/需复习 \(/)).toBeInTheDocument();
        expect(screen.getByText(/未掌握 \(/)).toBeInTheDocument();
      });
    });

    it('should filter words when clicking filter button', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });

      // Click on mastered filter
      const masteredButton = screen.getByText(/已掌握 \(/);
      fireEvent.click(masteredButton);

      await waitFor(() => {
        // Should still show mastered words (apple: 80% correct, banana: 100% correct)
        expect(screen.getByText('apple')).toBeInTheDocument();
        expect(screen.getByText('banana')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('should have sort buttons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('最近学习')).toBeInTheDocument();
        expect(screen.getByText('正确率')).toBeInTheDocument();
        expect(screen.getByText('学习次数')).toBeInTheDocument();
      });
    });
  });

  describe('View Mode Toggle', () => {
    it('should switch to state history view', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('状态历史')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('状态历史'));

      await waitFor(() => {
        // Should show date range selector in state view
        expect(screen.getByText('时间范围:')).toBeInTheDocument();
      });
    });

    it('should show date range options in state view', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('状态历史')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('状态历史'));

      await waitFor(() => {
        expect(screen.getByText('7 天')).toBeInTheDocument();
        expect(screen.getByText('30 天')).toBeInTheDocument();
        expect(screen.getByText('90 天')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (StorageService.getStudyStatistics as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('出错了')).toBeInTheDocument();
        expect(screen.getByText('加载失败')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (StorageService.getStudyStatistics as any).mockRejectedValue(new Error('加载失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no learning records', async () => {
      (StorageService.getStudyStatistics as any).mockResolvedValue({
        wordStats: new Map(),
      });
      (StorageService.getWords as any).mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('还没有学习记录')).toBeInTheDocument();
      });
    });

    it('should show start learning button when no records', async () => {
      (StorageService.getStudyStatistics as any).mockResolvedValue({
        wordStats: new Map(),
      });
      (StorageService.getWords as any).mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('开始学习')).toBeInTheDocument();
      });
    });

    it('should navigate to home when clicking start learning', async () => {
      (StorageService.getStudyStatistics as any).mockResolvedValue({
        wordStats: new Map(),
      });
      (StorageService.getWords as any).mockResolvedValue([]);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('开始学习')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('开始学习'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Word Card Display', () => {
    it('should display word spelling', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('apple')).toBeInTheDocument();
      });
    });

    it('should display correct rate as percentage', async () => {
      renderComponent();

      await waitFor(() => {
        // apple has 80% correct rate (8/10)
        expect(screen.getByText('80%')).toBeInTheDocument();
      });
    });

    it('should display attempt count', async () => {
      renderComponent();

      await waitFor(() => {
        // apple has 10 attempts
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });
  });
});
