/**
 * WordCard Component Unit Tests
 */

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WordCard from '../WordCard';

type MotionDivProps = ComponentPropsWithoutRef<'div'>;
type MotionButtonProps = ComponentPropsWithoutRef<'button'>;
type MotionHeadingProps = ComponentPropsWithoutRef<'h2'>;
type MotionSpanProps = ComponentPropsWithoutRef<'span'>;
type MotionParagraphProps = ComponentPropsWithoutRef<'p'>;
type MotionPresenceProps = { children?: ReactNode };
type IconStarProps = { weight?: string; color?: string };

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MotionDivProps) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: MotionButtonProps) => <button {...props}>{children}</button>,
    h2: ({ children, ...props }: MotionHeadingProps) => <h2 {...props}>{children}</h2>,
    span: ({ children, ...props }: MotionSpanProps) => <span {...props}>{children}</span>,
    p: ({ children, ...props }: MotionParagraphProps) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: MotionPresenceProps) => <>{children}</>,
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    Star: ({ weight, color }: IconStarProps) => (
      <span data-testid="star" data-weight={weight} data-color={color}>
        ★
      </span>
    ),
    Clock: () => <span data-testid="clock">🕐</span>,
    Target: () => <span data-testid="target">🎯</span>,
    SpeakerHigh: () => <span data-testid="speaker">🔊</span>,
    CircleNotch: () => <span data-testid="circle-notch">⟳</span>,
  };
});

// Mock TrackingService
vi.mock('../../services/TrackingService', () => ({
  trackingService: {
    trackPronunciationClick: vi.fn(),
    trackLearningPause: vi.fn(),
    trackLearningResume: vi.fn(),
    trackPageSwitch: vi.fn(),
    trackTaskSwitch: vi.fn(),
    trackInteraction: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
    getStats: vi.fn(() => ({
      pronunciationClicks: 0,
      pauseCount: 0,
      resumeCount: 0,
      pageSwitchCount: 0,
      taskSwitchCount: 0,
      totalInteractions: 0,
      sessionDuration: 0,
      lastActivityTime: 0,
    })),
  },
}));

const mockWord = {
  id: 'test-word-1',
  spelling: 'hello',
  phonetic: 'həˈloʊ',
  meanings: ['你好', '打招呼'],
  examples: ['Hello, how are you?'],
};

describe('WordCard', () => {
  const defaultProps = {
    word: mockWord,
    onPronounce: vi.fn(),
    isPronouncing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render word spelling', () => {
      render(<WordCard {...defaultProps} />);

      expect(screen.getByText('hello')).toBeInTheDocument();
    });

    it('should render phonetic', () => {
      render(<WordCard {...defaultProps} />);

      expect(screen.getByText('/həˈloʊ/')).toBeInTheDocument();
    });

    it('should render audio button', () => {
      render(<WordCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: /播放/ })).toBeInTheDocument();
    });

    it('should render example sentence', () => {
      render(<WordCard {...defaultProps} />);

      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
    });

    it('should show fallback when no examples', () => {
      const wordNoExamples = { ...mockWord, examples: [] };
      render(<WordCard {...defaultProps} word={wordNoExamples} />);

      expect(screen.getByText('暂无例句')).toBeInTheDocument();
    });

    it('should render mastery level stars', () => {
      render(<WordCard {...defaultProps} masteryLevel={3} />);

      const stars = screen.getAllByTestId('star');
      expect(stars).toHaveLength(5);

      // First 3 should be filled
      expect(stars[0]).toHaveAttribute('data-weight', 'fill');
      expect(stars[2]).toHaveAttribute('data-weight', 'fill');
      expect(stars[3]).toHaveAttribute('data-weight', 'regular');
    });

    it('should render word score', () => {
      render(<WordCard {...defaultProps} wordScore={85.7} />);

      expect(screen.getByText('86')).toBeInTheDocument(); // Rounded
    });

    it('should render next review date', () => {
      render(<WordCard {...defaultProps} nextReviewDate="明天" />);

      expect(screen.getByText('明天')).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onPronounce when audio button clicked', () => {
      const onPronounce = vi.fn();
      render(<WordCard {...defaultProps} onPronounce={onPronounce} />);

      fireEvent.click(screen.getByRole('button', { name: /播放/ }));

      expect(onPronounce).toHaveBeenCalledTimes(1);
    });

    it('should disable button when isPronouncing', () => {
      render(<WordCard {...defaultProps} isPronouncing={true} />);

      const button = screen.getByRole('button', { name: /正在播放/ });
      expect(button).toBeDisabled();
    });

    it('should call onPronounce on Space key press', () => {
      const onPronounce = vi.fn();
      render(<WordCard {...defaultProps} onPronounce={onPronounce} />);

      // Simulate space key press on window
      fireEvent.keyDown(window, { code: 'Space' });

      expect(onPronounce).toHaveBeenCalledTimes(1);
    });

    it('should not call onPronounce on Space when already pronouncing', () => {
      const onPronounce = vi.fn();
      render(<WordCard {...defaultProps} onPronounce={onPronounce} isPronouncing={true} />);

      fireEvent.keyDown(window, { code: 'Space' });

      expect(onPronounce).not.toHaveBeenCalled();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have proper ARIA label for card', () => {
      render(<WordCard {...defaultProps} />);

      expect(screen.getByRole('article', { name: /单词卡片: hello/ })).toBeInTheDocument();
    });

    it('should have proper ARIA label for audio button', () => {
      render(<WordCard {...defaultProps} />);

      const button = screen.getByRole('button', { name: /播放 hello 的发音/ });
      expect(button).toBeInTheDocument();
    });

    it('should have aria-pressed on audio button when pronouncing', () => {
      render(<WordCard {...defaultProps} isPronouncing={true} />);

      const button = screen.getByRole('button', { name: /正在播放/ });
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('should have proper ARIA label for mastery level', () => {
      render(<WordCard {...defaultProps} masteryLevel={3} />);

      expect(screen.getByLabelText(/掌握程度: 3 级/)).toBeInTheDocument();
    });

    it('should handle keyboard navigation on audio button', () => {
      const onPronounce = vi.fn();
      render(<WordCard {...defaultProps} onPronounce={onPronounce} />);

      const button = screen.getByRole('button', { name: /播放/ });
      fireEvent.keyDown(button, { key: 'Enter' });

      expect(onPronounce).toHaveBeenCalled();
    });
  });
});
