/**
 * BadgeCelebration Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BadgeCelebration from '../BadgeCelebration';
import { Badge } from '../../types/amas-enhanced';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      variants: _variants,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      ...props
    }: any) => <div {...props}>{children}</div>,
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      transition: _transition,
      ...props
    }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    Confetti: () => <span data-testid="confetti-icon">Confetti</span>,
    Star: () => <span data-testid="star-icon">Star</span>,
    Trophy: () => <span data-testid="trophy-icon">Trophy</span>,
    Medal: () => <span data-testid="medal-icon">Medal</span>,
    X: () => <span data-testid="x-icon">X</span>,
  };
});

// Mock animations
vi.mock('../../utils/animations', () => ({
  backdropVariants: {},
  celebrationVariants: {},
  g3SpringBouncy: {},
  g3SpringGentle: {},
}));

describe('BadgeCelebration', () => {
  const mockOnClose = vi.fn();

  const mockBadge: Badge = {
    id: 'badge-1',
    name: '学习达人',
    description: '连续学习7天',
    tier: 3,
    category: 'STREAK',
    iconUrl: '/badges/star.png',
    progress: 100,
    unlockedAt: '2024-01-15T10:30:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== Visibility Tests ====================

  describe('visibility', () => {
    it('should not render when isVisible is false', () => {
      const { container } = render(
        <BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={false} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render when isVisible is true', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('恭喜获得新徽章!')).toBeInTheDocument();
    });
  });

  // ==================== Content Tests ====================

  describe('content', () => {
    it('should display badge name', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('学习达人')).toBeInTheDocument();
    });

    it('should display badge description', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('连续学习7天')).toBeInTheDocument();
    });

    it('should display unlock time', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText(/解锁时间/)).toBeInTheDocument();
    });

    it('should display confetti icon', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByTestId('confetti-icon')).toBeInTheDocument();
    });

    it('should display confirmation button', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('太棒了!')).toBeInTheDocument();
    });
  });

  // ==================== Badge Category Icons ====================

  describe('category icons', () => {
    it('should show star icon for STREAK category', () => {
      const streakBadge = { ...mockBadge, category: 'STREAK' as const };
      render(<BadgeCelebration badge={streakBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getAllByTestId('star-icon').length).toBeGreaterThan(0);
    });

    it('should show trophy icon for ACCURACY category', () => {
      const accuracyBadge = { ...mockBadge, category: 'ACCURACY' as const };
      render(<BadgeCelebration badge={accuracyBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByTestId('trophy-icon')).toBeInTheDocument();
    });

    it('should show medal icon for COGNITIVE category', () => {
      const cognitiveBadge = { ...mockBadge, category: 'COGNITIVE' as const };
      render(<BadgeCelebration badge={cognitiveBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByTestId('medal-icon')).toBeInTheDocument();
    });

    it('should show confetti icon for MILESTONE category', () => {
      const milestoneBadge = { ...mockBadge, category: 'MILESTONE' as const };
      render(<BadgeCelebration badge={milestoneBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getAllByTestId('confetti-icon').length).toBeGreaterThan(0);
    });
  });

  // ==================== Tier Display Tests ====================

  describe('tier display', () => {
    it('should display tier stars', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      // Badge tier is 3, so there should be multiple star icons
      const stars = screen.getAllByTestId('star-icon');
      expect(stars.length).toBeGreaterThan(0);
    });

    it('should handle tier 1', () => {
      const tier1Badge = { ...mockBadge, tier: 1 };
      render(<BadgeCelebration badge={tier1Badge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('学习达人')).toBeInTheDocument();
    });

    it('should handle tier 5', () => {
      const tier5Badge = { ...mockBadge, tier: 5 };
      render(<BadgeCelebration badge={tier5Badge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByText('学习达人')).toBeInTheDocument();
    });
  });

  // ==================== Interaction Tests ====================

  describe('interactions', () => {
    it('should call onClose when X button is clicked', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const closeButton = screen.getByLabelText('关闭');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when "太棒了!" button is clicked', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const confirmButton = screen.getByText('太棒了!');
      fireEvent.click(confirmButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const backdrop = screen.getByText('恭喜获得新徽章!').closest('.fixed');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const modalContent = screen.getByText('恭喜获得新徽章!').closest('.bg-white');
      if (modalContent) {
        fireEvent.click(modalContent);
      }

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ==================== Auto Close Tests ====================

  describe('auto close', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should auto close after 5 seconds', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not auto close when not visible', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={false} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should clear timer on unmount', () => {
      const { unmount } = render(
        <BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />,
      );

      unmount();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ==================== Confetti Pieces Tests ====================

  describe('confetti pieces', () => {
    it('should render confetti pieces', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      // There should be multiple confetti pieces (20 by default)
      const confettiContainer = screen.getByText('恭喜获得新徽章!').closest('.fixed');
      const confettiPieces = confettiContainer?.querySelectorAll('.w-3.h-8');
      expect(confettiPieces?.length).toBe(20);
    });

    it('should have different colors for confetti pieces', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const confettiContainer = screen.getByText('恭喜获得新徽章!').closest('.fixed');
      const confettiPieces = confettiContainer?.querySelectorAll('.w-3.h-8');

      const colors = new Set<string>();
      confettiPieces?.forEach((piece) => {
        const color = (piece as HTMLElement).style.backgroundColor;
        if (color) {
          colors.add(color);
        }
      });

      expect(colors.size).toBeGreaterThan(1);
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have aria-label on close button', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);
      expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    });
  });

  // ==================== Badge Without Unlock Time ====================

  describe('badge without unlock time', () => {
    it('should not show unlock time when not provided', () => {
      const badgeNoTime = { ...mockBadge, unlockedAt: undefined };
      render(<BadgeCelebration badge={badgeNoTime} onClose={mockOnClose} isVisible={true} />);
      expect(screen.queryByText(/解锁时间/)).not.toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have backdrop blur', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const backdrop = screen.getByText('恭喜获得新徽章!').closest('.backdrop-blur-sm');
      expect(backdrop).toBeInTheDocument();
    });

    it('should have shadow on modal', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const modal = screen.getByText('恭喜获得新徽章!').closest('.shadow-2xl');
      expect(modal).toBeInTheDocument();
    });

    it('should have rounded corners on modal', () => {
      render(<BadgeCelebration badge={mockBadge} onClose={mockOnClose} isVisible={true} />);

      const modal = screen.getByText('恭喜获得新徽章!').closest('.rounded-3xl');
      expect(modal).toBeInTheDocument();
    });
  });
});
