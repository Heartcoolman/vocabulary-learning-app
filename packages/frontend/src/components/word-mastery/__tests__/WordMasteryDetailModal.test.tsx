/**
 * WordMasteryDetailModal Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WordMasteryDetailModal } from '../WordMasteryDetailModal';
import apiClient from '../../../services/ApiClient';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Icon components
vi.mock('../../Icon', () => ({
  X: ({ size, className, weight }: any) => <span data-testid="icon-x" className={className}>X</span>,
  Clock: ({ size, className }: any) => <span data-testid="icon-clock" className={className}>Clock</span>,
  Fire: ({ size, className, weight }: any) => <span data-testid="icon-fire" className={className}>Fire</span>,
  ChartLine: ({ size, className }: any) => <span data-testid="icon-chartline" className={className}>Chart</span>,
  Warning: ({ size, className }: any) => <span data-testid="icon-warning" className={className}>Warning</span>,
  CheckCircle: ({ size, className, weight }: any) => <span data-testid="icon-check" className={className}>Check</span>,
  CircleNotch: ({ size, className }: any) => <span data-testid="icon-loading" className={className}>Loading</span>,
  Lightbulb: ({ size, className, weight }: any) => <span data-testid="icon-lightbulb" className={className}>Lightbulb</span>,
}));

// Mock Modal component
vi.mock('../../ui/Modal', () => ({
  Modal: ({ isOpen, onClose, children }: any) => (
    isOpen ? (
      <div data-testid="modal">
        <button data-testid="close-button" onClick={onClose}>Close</button>
        {children}
      </div>
    ) : null
  ),
}));

// Mock MemoryTraceChart
vi.mock('../MemoryTraceChart', () => ({
  MemoryTraceChart: ({ trace }: any) => (
    <div data-testid="memory-trace-chart">MemoryTraceChart: {trace?.length || 0} records</div>
  ),
}));

// Mock API
vi.mock('../../../services/ApiClient', () => ({
  default: {
    getLearnedWords: vi.fn(),
    getWordMasteryDetail: vi.fn(),
    getWordMasteryTrace: vi.fn(),
    getWordMasteryInterval: vi.fn(),
  },
}));

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
    { id: '1', timestamp: '2024-01-01T10:00:00Z', isCorrect: true, responseTime: 2000, secondsAgo: 86400 },
    { id: '2', timestamp: '2024-01-02T10:00:00Z', isCorrect: false, responseTime: 3000, secondsAgo: 0 },
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
    (apiClient.getWordMasteryDetail as any).mockResolvedValue(mockMasteryData);
    (apiClient.getWordMasteryTrace as any).mockResolvedValue(mockTraceData);
    (apiClient.getWordMasteryInterval as any).mockResolvedValue(mockIntervalData);
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    it('should show loading state initially', async () => {
      (apiClient.getLearnedWords as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([mockWordData]), 100))
      );

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('加载中...')).toBeInTheDocument();
    });
  });

  // ==================== Content Display Tests ====================

  describe('content display', () => {
    it('should display word spelling after loading', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('hello')).toBeInTheDocument();
      });
    });

    it('should display phonetic after loading', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('/həˈloʊ/')).toBeInTheDocument();
      });
    });

    it('should display meanings after loading', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1. 你好')).toBeInTheDocument();
        expect(screen.getByText('2. 打招呼')).toBeInTheDocument();
      });
    });

    it('should display mastery score', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('75')).toBeInTheDocument();
      });
    });

    it('should display confidence', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });

    it('should display SRS level', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('should display suggestion', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('建议多复习此单词')).toBeInTheDocument();
      });
    });
  });

  // ==================== Mastery Level Badge Tests ====================

  describe('mastery level badge', () => {
    it('should show "熟练" badge for score >= 0.7', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('熟练')).toBeInTheDocument();
      });
    });

    it('should show "已掌握" badge when isLearned is true', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        isLearned: true,
      });

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('已掌握')).toBeInTheDocument();
      });
    });

    it('should show "学习中" badge for score >= 0.4 and < 0.7', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        score: 0.5,
      });

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('学习中')).toBeInTheDocument();
      });
    });

    it('should show "需复习" badge for score < 0.4', async () => {
      (apiClient.getWordMasteryDetail as any).mockResolvedValue({
        ...mockMasteryData,
        score: 0.3,
      });

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('需复习')).toBeInTheDocument();
      });
    });
  });

  // ==================== Chart and History Tests ====================

  describe('chart and history', () => {
    it('should render MemoryTraceChart with trace data', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('memory-trace-chart')).toBeInTheDocument();
        expect(screen.getByText(/2 records/)).toBeInTheDocument();
      });
    });

    it('should display trace count', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/共 2 次复习记录/)).toBeInTheDocument();
      });
    });

    it('should display review history records', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('回答正确')).toBeInTheDocument();
        expect(screen.getByText('回答错误')).toBeInTheDocument();
      });
    });
  });

  // ==================== Interval Display Tests ====================

  describe('interval display', () => {
    it('should display optimal interval', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1天')).toBeInTheDocument();
      });
    });

    it('should display min interval', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('12小时')).toBeInTheDocument();
      });
    });

    it('should display max interval', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('2天')).toBeInTheDocument();
      });
    });

    it('should display target recall', async () => {
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

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
      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={onClose}
        />
      );

      const closeButton = screen.getByTestId('close-button');
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

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('未找到该单词信息')).toBeInTheDocument();
      });
    });

    it('should display error message when API fails', async () => {
      (apiClient.getLearnedWords as any).mockRejectedValue(new Error('API Error'));

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('加载数据失败，请稍后重试')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      (apiClient.getLearnedWords as any).mockRejectedValue(new Error('API Error'));

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeInTheDocument();
      });
    });

    it('should retry loading when retry button clicked', async () => {
      (apiClient.getLearnedWords as any)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([mockWordData]);

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

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
      (apiClient.getWordMasteryTrace as any).mockResolvedValue({ wordId: 'word-1', trace: [], count: 0 });

      render(
        <WordMasteryDetailModal
          wordId="word-1"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('该单词暂无学习记录')).toBeInTheDocument();
      });
    });
  });
});
