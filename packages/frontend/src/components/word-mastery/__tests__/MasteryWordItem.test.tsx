/**
 * MasteryWordItem Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MasteryWordItem } from '../MasteryWordItem';
import apiClient from '../../../services/client';
import type { MasteryEvaluation } from '../../../types/word-mastery';

// Note: framer-motion is no longer used in MasteryWordItem after CSS migration

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  CaretDown: ({ size, className }: any) => (
    <span data-testid="icon-caret-down" className={className}>
      ▼
    </span>
  ),
  CaretUp: ({ size, className }: any) => (
    <span data-testid="icon-caret-up" className={className}>
      ▲
    </span>
  ),
  Clock: ({ size, className }: any) => (
    <span data-testid="icon-clock" className={className}>
      Clock
    </span>
  ),
  Fire: ({ size, className }: any) => (
    <span data-testid="icon-fire" className={className}>
      Fire
    </span>
  ),
}));

// Mock MemoryTraceChart
vi.mock('./MemoryTraceChart', () => ({
  MemoryTraceChart: ({ trace }: any) => (
    <div data-testid="memory-trace-chart">MemoryTraceChart: {trace.length} records</div>
  ),
}));

// Mock API
vi.mock('../../../services/client', () => ({
  default: {
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

const mockMastery: MasteryEvaluation = {
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
  suggestion: '建议复习此单词',
};

const mockTraceResponse = {
  wordId: 'word-1',
  trace: [
    {
      id: '1',
      timestamp: '2024-01-01T10:00:00Z',
      isCorrect: true,
      responseTime: 2.0,
      secondsAgo: 0,
    },
    {
      id: '2',
      timestamp: '2024-01-02T10:00:00Z',
      isCorrect: false,
      responseTime: 3.0,
      secondsAgo: 86400,
    },
  ],
  count: 2,
};

const mockIntervalResponse = {
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

describe('MasteryWordItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.getWordMasteryTrace as any).mockResolvedValue(mockTraceResponse);
    (apiClient.getWordMasteryInterval as any).mockResolvedValue(mockIntervalResponse);
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render word spelling', () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      expect(screen.getByText('hello')).toBeInTheDocument();
    });

    it('should render word meanings', () => {
      render(
        <MasteryWordItem
          wordId="word-1"
          spelling="hello"
          meanings="你好，问候"
          mastery={mockMastery}
        />,
      );

      expect(screen.getByText('你好，问候')).toBeInTheDocument();
    });

    it('should render mastery level badge', () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      // Score 0.75 should be "熟练"
      expect(screen.getByText('熟练')).toBeInTheDocument();
    });

    it('should render mastery score', () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should render confidence score', () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should render caret down icon initially', () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      expect(screen.getByTestId('icon-caret-down')).toBeInTheDocument();
    });
  });

  // ==================== Mastery Level Tests ====================

  describe('mastery levels', () => {
    it('should show "未学习" when mastery is null', () => {
      render(<MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={null} />);

      expect(screen.getByText('未学习')).toBeInTheDocument();
    });

    it('should show "已掌握" when isLearned is true', () => {
      const learnedMastery = { ...mockMastery, isLearned: true };
      render(
        <MasteryWordItem
          wordId="word-1"
          spelling="hello"
          meanings="你好"
          mastery={learnedMastery}
        />,
      );

      expect(screen.getByText('已掌握')).toBeInTheDocument();
    });

    it('should show "熟练" when score >= 0.7', () => {
      const proficientMastery = { ...mockMastery, score: 0.7 };
      render(
        <MasteryWordItem
          wordId="word-1"
          spelling="hello"
          meanings="你好"
          mastery={proficientMastery}
        />,
      );

      expect(screen.getByText('熟练')).toBeInTheDocument();
    });

    it('should show "学习中" when score >= 0.4 and < 0.7', () => {
      const learningMastery = { ...mockMastery, score: 0.5 };
      render(
        <MasteryWordItem
          wordId="word-1"
          spelling="hello"
          meanings="你好"
          mastery={learningMastery}
        />,
      );

      expect(screen.getByText('学习中')).toBeInTheDocument();
    });

    it('should show "需复习" when score < 0.4', () => {
      const needReviewMastery = { ...mockMastery, score: 0.3 };
      render(
        <MasteryWordItem
          wordId="word-1"
          spelling="hello"
          meanings="你好"
          mastery={needReviewMastery}
        />,
      );

      expect(screen.getByText('需复习')).toBeInTheDocument();
    });
  });

  // ==================== Expansion Tests ====================

  describe('expansion', () => {
    it('should expand on click and load data', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(apiClient.getWordMasteryTrace).toHaveBeenCalledWith('word-1');
        expect(apiClient.getWordMasteryInterval).toHaveBeenCalledWith('word-1');
      });
    });

    it('should show caret up icon when expanded', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByTestId('icon-caret-up')).toBeInTheDocument();
      });
    });

    it('should collapse on second click', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');

      // Expand
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByTestId('icon-caret-up')).toBeInTheDocument();
      });

      // Collapse
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByTestId('icon-caret-down')).toBeInTheDocument();
      });
    });

    it('should not reload data on re-expand', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');

      // First expand
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(apiClient.getWordMasteryTrace).toHaveBeenCalledTimes(1);
      });

      // Collapse
      await act(async () => {
        fireEvent.click(button);
      });

      // Re-expand
      await act(async () => {
        fireEvent.click(button);
      });

      // Should not call API again
      expect(apiClient.getWordMasteryTrace).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Expanded Content Tests ====================

  describe('expanded content', () => {
    it('should show next review info when expanded', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('最佳间隔')).toBeInTheDocument();
        expect(screen.getByText('1天')).toBeInTheDocument();
        expect(screen.getByText('最小间隔')).toBeInTheDocument();
        expect(screen.getByText('12小时')).toBeInTheDocument();
        expect(screen.getByText('最大间隔')).toBeInTheDocument();
        expect(screen.getByText('2天')).toBeInTheDocument();
      });
    });

    it('should show mastery details when expanded', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('SRS等级')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('ACT-R提取概率')).toBeInTheDocument();
        expect(screen.getByText('80%')).toBeInTheDocument();
        expect(screen.getByText('近期准确率')).toBeInTheDocument();
        expect(screen.getByText('90%')).toBeInTheDocument();
      });
    });

    it('should show suggestion when available', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('建议复习此单词')).toBeInTheDocument();
      });
    });
  });

  // ==================== Loading State Tests ====================

  describe('loading state', () => {
    it('should make API calls when expanded', async () => {
      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Verify API calls were made
      await waitFor(() => {
        expect(apiClient.getWordMasteryTrace).toHaveBeenCalledWith('word-1');
        expect(apiClient.getWordMasteryInterval).toHaveBeenCalledWith('word-1');
      });
    });
  });

  // ==================== Error Handling Tests ====================

  describe('error handling', () => {
    it('should handle API error gracefully', async () => {
      (apiClient.getWordMasteryTrace as any).mockRejectedValue(new Error('API Error'));

      render(
        <MasteryWordItem wordId="word-1" spelling="hello" meanings="你好" mastery={mockMastery} />,
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Should not crash and still render
      expect(screen.getByText('hello')).toBeInTheDocument();
    });
  });
});
