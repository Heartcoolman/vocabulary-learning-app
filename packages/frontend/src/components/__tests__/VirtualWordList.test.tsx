/**
 * VirtualWordList 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VirtualWordList from '../VirtualWordList';
import { type WordWithState, ROW_HEIGHT, ITEM_HEIGHT, ITEM_GAP } from '../virtualWordList.types';

interface MockListProps {
  rowCount: number;
  rowComponent: React.ComponentType<{
    index: number;
    style: React.CSSProperties;
    ariaAttributes: Record<string, unknown>;
  }>;
  style?: React.CSSProperties;
  rowHeight?: number;
}

// Mock react-window
vi.mock('react-window', () => ({
  List: ({ rowCount, rowComponent: Row, ...props }: MockListProps) => {
    return (
      <div data-testid="virtual-list" style={props.style}>
        {Array.from({ length: Math.min(rowCount, 5) }, (_, index) => (
          <Row key={index} index={index} style={{ height: props.rowHeight }} ariaAttributes={{}} />
        ))}
      </div>
    );
  },
  useListRef: () => ({ current: { scrollToRow: vi.fn() } }),
  useListCallbackRef: () => [{ scrollToRow: vi.fn() }, vi.fn()],
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    Star: ({ weight, color }: any) => (
      <span data-testid="star" data-weight={weight} data-color={color}>
        ★
      </span>
    ),
    Target: () => <span data-testid="target">🎯</span>,
    Clock: () => <span data-testid="clock">🕐</span>,
    CheckCircle: () => <span data-testid="check-circle">✓</span>,
    Warning: () => <span data-testid="warning">⚠</span>,
    ArrowClockwise: () => <span data-testid="arrow-clockwise">↻</span>,
  };
});

describe('VirtualWordList', () => {
  const createMockWords = (count: number): WordWithState[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `word-${i + 1}`,
      spelling: `word${i + 1}`,
      phonetic: `fəˈnetɪk${i + 1}`,
      meanings: [`meaning ${i + 1}`],
      masteryLevel: i % 5,
      score: 70 + (i % 30),
      nextReviewDate: '明天',
      accuracy: 0.8 + (i % 20) / 100,
      studyCount: i + 1,
    }));
  };

  const defaultProps = {
    words: createMockWords(10),
    onAdjustWord: vi.fn(),
    containerHeight: 600,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render virtual list container', () => {
      render(<VirtualWordList {...defaultProps} />);

      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    it('should render word spellings', () => {
      render(<VirtualWordList {...defaultProps} />);

      expect(screen.getByText('word1')).toBeInTheDocument();
    });

    it('should render word phonetics', () => {
      render(<VirtualWordList {...defaultProps} />);

      expect(screen.getByText('/fəˈnetɪk1/')).toBeInTheDocument();
    });

    it('should render word meanings', () => {
      render(<VirtualWordList {...defaultProps} />);

      expect(screen.getByText('meaning 1')).toBeInTheDocument();
    });

    it('should render mastery stars', () => {
      render(<VirtualWordList {...defaultProps} />);

      const stars = screen.getAllByTestId('star');
      expect(stars.length).toBeGreaterThan(0);
    });

    it('should render word score', () => {
      render(<VirtualWordList {...defaultProps} />);

      expect(screen.getByText('70')).toBeInTheDocument();
    });

    it('should render next review date', () => {
      render(<VirtualWordList {...defaultProps} />);

      const reviewDates = screen.getAllByText('明天');
      expect(reviewDates.length).toBeGreaterThan(0);
    });
  });

  describe('action buttons', () => {
    it('should render mastered button', () => {
      render(<VirtualWordList {...defaultProps} />);

      const masteredButtons = screen.getAllByRole('button', { name: /已掌握/i });
      expect(masteredButtons.length).toBeGreaterThan(0);
    });

    it('should render needs practice button', () => {
      render(<VirtualWordList {...defaultProps} />);

      const practiceButtons = screen.getAllByRole('button', { name: /重点学习/i });
      expect(practiceButtons.length).toBeGreaterThan(0);
    });

    it('should render reset button', () => {
      render(<VirtualWordList {...defaultProps} />);

      const resetButtons = screen.getAllByRole('button', { name: /重置/i });
      expect(resetButtons.length).toBeGreaterThan(0);
    });

    it('should call onAdjustWord with mastered action', () => {
      const onAdjustWord = vi.fn();
      render(<VirtualWordList {...defaultProps} onAdjustWord={onAdjustWord} />);

      const masteredButtons = screen.getAllByRole('button', { name: /已掌握/i });
      fireEvent.click(masteredButtons[0]);

      expect(onAdjustWord).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'word-1' }),
        'mastered',
      );
    });

    it('should call onAdjustWord with needsPractice action', () => {
      const onAdjustWord = vi.fn();
      render(<VirtualWordList {...defaultProps} onAdjustWord={onAdjustWord} />);

      const practiceButtons = screen.getAllByRole('button', { name: /重点学习/i });
      fireEvent.click(practiceButtons[0]);

      expect(onAdjustWord).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'word-1' }),
        'needsPractice',
      );
    });

    it('should call onAdjustWord with reset action', () => {
      const onAdjustWord = vi.fn();
      render(<VirtualWordList {...defaultProps} onAdjustWord={onAdjustWord} />);

      const resetButtons = screen.getAllByRole('button', { name: /重置/i });
      fireEvent.click(resetButtons[0]);

      expect(onAdjustWord).toHaveBeenCalledWith(expect.objectContaining({ id: 'word-1' }), 'reset');
    });
  });

  describe('empty state', () => {
    it('should handle empty words array', () => {
      render(<VirtualWordList {...defaultProps} words={[]} />);

      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });
  });

  describe('constants', () => {
    it('should export correct ROW_HEIGHT', () => {
      expect(ROW_HEIGHT).toBe(ITEM_HEIGHT + ITEM_GAP);
    });

    it('should export correct ITEM_HEIGHT', () => {
      expect(ITEM_HEIGHT).toBe(160);
    });

    it('should export correct ITEM_GAP', () => {
      expect(ITEM_GAP).toBe(16);
    });
  });
});
