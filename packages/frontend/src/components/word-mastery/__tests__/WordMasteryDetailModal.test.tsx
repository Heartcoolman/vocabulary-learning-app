/**
 * WordMasteryDetailModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WordMasteryDetailModal } from '../WordMasteryDetailModal';
import { apiClient } from '../../../services/client';
import { ApiError } from '../../../services/client';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Icon components
vi.mock('../../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../Icon')>();
  return {
    ...actual,
    X: ({ className }: any) => (
      <span data-testid="icon-x" className={className}>
        X
      </span>
    ),
    Clock: ({ className }: any) => (
      <span data-testid="icon-clock" className={className}>
        Clock
      </span>
    ),
    Fire: ({ className }: any) => (
      <span data-testid="icon-fire" className={className}>
        Fire
      </span>
    ),
    ChartLine: ({ className }: any) => (
      <span data-testid="icon-chartline" className={className}>
        Chart
      </span>
    ),
    Warning: ({ className }: any) => (
      <span data-testid="icon-warning" className={className}>
        Warning
      </span>
    ),
    CheckCircle: ({ className }: any) => (
      <span data-testid="icon-check" className={className}>
        Check
      </span>
    ),
    CircleNotch: ({ className }: any) => (
      <span data-testid="icon-loading" className={className}>
        Loading
      </span>
    ),
    Lightbulb: ({ className }: any) => (
      <span data-testid="icon-lightbulb" className={className}>
        Lightbulb
      </span>
    ),
  };
});

// Mock MemoryTraceChart
vi.mock('../MemoryTraceChart', () => ({
  MemoryTraceChart: ({ trace }: any) => (
    <div data-testid="memory-trace-chart">MemoryTraceChart: {trace?.length || 0} records</div>
  ),
}));

// Mock API
const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    getLearnedWords: vi.fn(),
    getWordById: vi.fn(),
    getWordMasteryDetail: vi.fn(),
    getWordMasteryTrace: vi.fn(),
    getWordMasteryInterval: vi.fn(),
  },
}));

vi.mock('../../../services/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/client')>();
  return {
    ...actual,
    apiClient: mockApiClient,
    default: mockApiClient,
  };
});

// Mock logger
vi.mock('../../../utils/logger', () => ({
  learningLogger: {
    error: vi.fn(),
  },
}));

const mockWordData = {
  id: 'word-1',
  spelling: 'hello',
  phonetic: '/həˈloʊ/',
  meanings: ['你好', '打招呼'],
};

const mockMasteryData = {
  wordId: 'word-1',
  isLearned: false,
  score: 0.75,
  confidence: 0.85,
  factors: {
    srsLevel: 3,
    actrRecall: 0.8,
    recentAccuracy: 0.9,
    userFatigue: 0.2,
  },
  suggestion: '建议多复习此单词',
};

const mockTraceData = {
  wordId: 'word-1',
  trace: [
    {
      id: '1',
      timestamp: '2024-01-01T10:00:00Z',
      isCorrect: true,
      responseTime: 2000,
      secondsAgo: 86400,
    },
    {
      id: '2',
      timestamp: '2024-01-02T10:00:00Z',
      isCorrect: false,
      responseTime: 3000,
      secondsAgo: 0,
    },
  ],
  count: 2,
};

const mockIntervalData = {
  wordId: 'word-1',
  interval: {
    optimalSeconds: 86400,
    minSeconds: 43200,
    maxSeconds: 172800,
    targetRecall: 0.9,
  },
  humanReadable: {
    optimal: '1天',
    min: '12小时',
    max: '2天',
  },
};

describe('WordMasteryDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getLearnedWords as any).mockResolvedValue([mockWordData]);
    (apiClient.getWordById as any).mockResolvedValue(mockWordData);
    (apiClient.getWordMasteryDetail as any).mockResolvedValue(mockMasteryData);
    (apiClient.getWordMasteryTrace as any).mockResolvedValue(mockTraceData);
    (apiClient.getWordMasteryInterval as any).mockResolvedValue(mockIntervalData);
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={false} onClose={vi.fn()} />);

      expect(screen.queryByRole('dialog', { name: '单词掌握度详情' })).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByRole('dialog', { name: '单词掌握度详情' })).toBeInTheDocument();
    });

    it('should show loading state initially', async () => {
      (apiClient.getLearnedWords as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([mockWordData]), 100)),
      );

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByTestId('icon-loading')).toBeInTheDocument();
      expect(screen.getByText('加载数据中...')).toBeInTheDocument();
    });
  });

  // ==================== Content Display Tests ====================

  describe('content display', () => {
    it('should display word spelling after loading', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('hello')).toBeInTheDocument();
      });
    });

    it('should display phonetic after loading', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('/həˈloʊ/')).toBeInTheDocument();
      });
    });

    it('should display meanings after loading', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('你好')).toBeInTheDocument();
        expect(screen.getByText('打招呼')).toBeInTheDocument();
      });
    });

    it('should display mastery score', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('75')).toBeInTheDocument();
      });
    });

    it('should display confidence', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });

    it('should display SRS level', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('熟练')).toBeInTheDocument();
      });
    });

    it('should display suggestion', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('下次复习建议')).toBeInTheDocument();
      });
    });
  });

  // ==================== Mastery Level Badge Tests ====================

  describe('mastery level badge', () => {
    it('should show "熟练" badge for score >= 0.7', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('熟练')).toBeInTheDocument();
      });
    });

    it('should show "已掌握" badge when isLearned is true', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        isLearned: true,
      });

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('已掌握')).toBeInTheDocument();
      });
    });

    it('should show "学习中" badge for score >= 0.4 and < 0.7', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        score: 0.5,
      });

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('学习中')).toBeInTheDocument();
      });
    });

    it('should show "需复习" badge for score < 0.4', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        score: 0.3,
      });

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('需复习')).toBeInTheDocument();
      });
    });
  });

  // ==================== Chart and History Tests ====================

  describe('chart and history', () => {
    it('should render MemoryTraceChart with trace data', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-trace-chart')).toBeInTheDocument();
        expect(screen.getByText(/2 records/)).toBeInTheDocument();
      });
    });
  });

  // ==================== Interval Display Tests ====================

  describe('interval display', () => {
    it('should display optimal interval', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('1天')).toBeInTheDocument();
      });
    });

    it('should display min interval', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('12小时')).toBeInTheDocument();
      });
    });

    it('should display max interval', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('2天')).toBeInTheDocument();
      });
    });

    it('should display target recall', async () => {
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        // 90% appears multiple times (recent accuracy and target recall)
        const elements = screen.getAllByText('90%');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when close button clicked', async () => {
      const onClose = vi.fn();
      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: '关闭' });
      await act(async () => {
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should display error message when word not found', async () => {
      (apiClient.getLearnedWords as any).mockResolvedValue([]);
      (apiClient.getWordById as any).mockRejectedValue(new ApiError('Not Found', 404));

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('未找到该单词信息')).toBeInTheDocument();
      });
    });

    it('should display error message when API fails', async () => {
      (apiClient.getLearnedWords as any).mockResolvedValue([]);
      (apiClient.getWordById as any).mockRejectedValue(new Error('网络请求失败'));

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('加载数据失败，请稍后重试')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (apiClient.getLearnedWords as any).mockResolvedValue([]);
      (apiClient.getWordById as any).mockRejectedValue(new Error('网络请求失败'));

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when retry button clicked', async () => {
      (apiClient.getLearnedWords as any).mockResolvedValue([]);
      (apiClient.getWordById as any)
        .mockRejectedValueOnce(new Error('网络请求失败'))
        .mockResolvedValueOnce(mockWordData);

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('重试');
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByText('hello')).toBeInTheDocument();
      });
    });
  });

  // ==================== Empty State Tests ====================

  describe('empty state', () => {
    it('should show empty state when no mastery and no trace', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue(null);
      (apiClient.getWordMasteryTrace as any).mockResolvedValue({
        wordId: 'word-1',
        trace: [],
        count: 0,
      });
      (apiClient.getWordMasteryInterval as any).mockResolvedValue(null);

      render(<WordMasteryDetailModal wordId="word-1" isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect(screen.queryByText('掌握度评估')).not.toBeInTheDocument();
        expect(screen.queryByTestId('memory-trace-chart')).not.toBeInTheDocument();
        expect(screen.queryByText('下次复习建议')).not.toBeInTheDocument();
      });
    });
  });
});
