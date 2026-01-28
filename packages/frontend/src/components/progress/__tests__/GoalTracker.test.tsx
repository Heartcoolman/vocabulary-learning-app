/**
 * GoalTracker Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalTracker } from '../GoalTracker';

// Mock Icon components
vi.mock('../../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../Icon')>();
  return {
    ...actual,
    Calendar: ({ className }: { className?: string }) => (
      <span data-testid="icon-calendar" className={className}>
        Calendar
      </span>
    ),
    Target: ({ className }: { className?: string }) => (
      <span data-testid="icon-target" className={className}>
        Target
      </span>
    ),
    TrendUp: ({ className }: { className?: string }) => (
      <span data-testid="icon-trendup" className={className}>
        TrendUp
      </span>
    ),
    Confetti: () => <span data-testid="icon-confetti">Confetti</span>,
    Lightning: () => <span data-testid="icon-lightning">Lightning</span>,
  };
});

describe('GoalTracker', () => {
  const defaultProps = {
    dailyGoal: 30,
    currentProgress: 15,
    weeklyGoal: 200,
    weeklyProgress: 100,
    estimatedDaysToComplete: 30,
  };

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the title', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('学习目标追踪')).toBeInTheDocument();
    });

    it('should render daily goal section', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('每日目标')).toBeInTheDocument();
      expect(screen.getByText('15 / 30 个单词')).toBeInTheDocument();
    });

    it('should render weekly goal section', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('本周目标')).toBeInTheDocument();
      expect(screen.getByText('100 / 200 个单词')).toBeInTheDocument();
    });

    it('should render estimated days to complete', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('完成预测')).toBeInTheDocument();
      expect(screen.getByText('30 天')).toBeInTheDocument();
    });

    it('should render remaining words message for daily goal', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('还需学习 15 个单词')).toBeInTheDocument();
    });

    it('should render weekly completion percentage', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText('本周已完成 50%')).toBeInTheDocument();
    });
  });

  // ==================== Progress Bar Tests ====================

  describe('progress bars', () => {
    it('should render daily progress bar', () => {
      const { container } = render(<GoalTracker {...defaultProps} />);

      // dailyPercentage = (15 / 30) * 100 = 50%
      const progressBars = container.querySelectorAll('[style*="width: 50%"]');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('should cap daily progress at 100%', () => {
      const props = { ...defaultProps, currentProgress: 50 };
      const { container } = render(<GoalTracker {...props} />);

      const progressBar = container.querySelector('[style*="width: 100%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should handle zero daily goal', () => {
      const props = { ...defaultProps, dailyGoal: 0 };
      const { container } = render(<GoalTracker {...props} />);

      const progressBar = container.querySelector('[style*="width: 0%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should handle zero weekly goal', () => {
      const props = { ...defaultProps, weeklyGoal: 0 };
      render(<GoalTracker {...props} />);

      // Should not crash
      expect(screen.getByText('本周目标')).toBeInTheDocument();
    });
  });

  // ==================== Completion State Tests ====================

  describe('completion states', () => {
    it('should show completion message for daily goal', () => {
      const props = { ...defaultProps, currentProgress: 30 };
      render(<GoalTracker {...props} />);

      expect(screen.getByText(/太棒了！今日目标已完成！/)).toBeInTheDocument();
    });

    it('should show near completion message', () => {
      const props = { ...defaultProps, currentProgress: 25 }; // 83%
      render(<GoalTracker {...props} />);

      expect(screen.getByText(/快完成了，继续加油！/)).toBeInTheDocument();
    });

    it('should apply green gradient when daily goal completed', () => {
      const props = { ...defaultProps, currentProgress: 30 };
      const { container } = render(<GoalTracker {...props} />);

      const greenGradient = container.querySelector('.from-green-400');
      expect(greenGradient).toBeInTheDocument();
    });

    it('should apply blue gradient when daily goal not completed', () => {
      const { container } = render(<GoalTracker {...defaultProps} />);

      const blueGradient = container.querySelector('.from-blue-400');
      expect(blueGradient).toBeInTheDocument();
    });

    it('should apply green gradient when weekly goal completed', () => {
      const props = { ...defaultProps, weeklyProgress: 200 };
      const { container } = render(<GoalTracker {...props} />);

      // Should have green gradient for weekly progress
      const greenGradients = container.querySelectorAll('.from-green-400');
      expect(greenGradients.length).toBeGreaterThan(0);
    });
  });

  // ==================== Estimated Days Tests ====================

  describe('estimated days to complete', () => {
    it('should show estimation when days > 0', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByText(/预计/)).toBeInTheDocument();
      expect(screen.getByText('30 天')).toBeInTheDocument();
    });

    it('should not show estimation when days is 0', () => {
      const props = { ...defaultProps, estimatedDaysToComplete: 0 };
      render(<GoalTracker {...props} />);

      expect(screen.queryByText('完成预测')).not.toBeInTheDocument();
    });

    it('should not show estimation when days is null', () => {
      const props = { ...defaultProps, estimatedDaysToComplete: null };
      render(<GoalTracker {...props} />);

      expect(screen.queryByText('完成预测')).not.toBeInTheDocument();
    });

    it('should handle 1 day estimation', () => {
      const props = { ...defaultProps, estimatedDaysToComplete: 1 };
      render(<GoalTracker {...props} />);

      expect(screen.getByText('1 天')).toBeInTheDocument();
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should render target icon in title', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByTestId('icon-target')).toBeInTheDocument();
    });

    it('should render calendar icons', () => {
      render(<GoalTracker {...defaultProps} />);

      // Should have calendar icons for daily goal and estimation
      const calendarIcons = screen.getAllByTestId('icon-calendar');
      expect(calendarIcons.length).toBeGreaterThan(0);
    });

    it('should render trend up icon for weekly goal', () => {
      render(<GoalTracker {...defaultProps} />);

      expect(screen.getByTestId('icon-trendup')).toBeInTheDocument();
    });

    it('should render confetti icon when daily goal completed', () => {
      const props = { ...defaultProps, currentProgress: 30 };
      render(<GoalTracker {...props} />);

      expect(screen.getByTestId('icon-confetti')).toBeInTheDocument();
    });

    it('should render lightning icon when near completion', () => {
      const props = { ...defaultProps, currentProgress: 25 }; // 83%
      render(<GoalTracker {...props} />);

      expect(screen.getByTestId('icon-lightning')).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle all zeros', () => {
      const props = {
        dailyGoal: 0,
        currentProgress: 0,
        weeklyGoal: 0,
        weeklyProgress: 0,
        estimatedDaysToComplete: null,
      };
      render(<GoalTracker {...props} />);

      // Should render without crashing
      expect(screen.getByText('学习目标追踪')).toBeInTheDocument();
    });

    it('should handle exceeding goals', () => {
      const props = {
        ...defaultProps,
        currentProgress: 50,
        weeklyProgress: 300,
      };
      render(<GoalTracker {...props} />);

      // Should cap at 100%
      expect(screen.getByText(/太棒了！今日目标已完成！/)).toBeInTheDocument();
    });

    it('should handle large numbers', () => {
      const props = {
        ...defaultProps,
        dailyGoal: 1000,
        currentProgress: 500,
        weeklyGoal: 10000,
        weeklyProgress: 5000,
        estimatedDaysToComplete: 365,
      };
      render(<GoalTracker {...props} />);

      expect(screen.getByText('500 / 1000 个单词')).toBeInTheDocument();
      expect(screen.getByText('5000 / 10000 个单词')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have correct container classes', () => {
      const { container } = render(<GoalTracker {...defaultProps} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('bg-white')).toBe(true);
      expect(card.classList.contains('rounded-card')).toBe(true);
    });

    it('should have gradient background for estimation section', () => {
      const { container } = render(<GoalTracker {...defaultProps} />);

      const gradientSection = container.querySelector('.from-blue-50');
      expect(gradientSection).toBeInTheDocument();
    });
  });
});
