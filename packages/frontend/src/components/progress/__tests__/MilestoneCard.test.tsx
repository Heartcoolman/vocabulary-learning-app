/**
 * MilestoneCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MilestoneCard, Milestone } from '../MilestoneCard';

// Mock Icon components
vi.mock('../../Icon', () => ({
  Trophy: ({ className }: any) => <span data-testid="icon-trophy" className={className}>Trophy</span>,
  Star: ({ className }: any) => <span data-testid="icon-star" className={className}>Star</span>,
  Target: ({ className }: any) => <span data-testid="icon-target" className={className}>Target</span>,
  Lightning: ({ className }: any) => <span data-testid="icon-zap" className={className}>Zap</span>,
}));

describe('MilestoneCard', () => {
  const defaultMilestone: Milestone = {
    id: 'milestone-1',
    title: '初学者',
    description: '学习100个单词',
    target: 100,
    current: 50,
    icon: 'trophy',
    achieved: false,
    color: 'blue',
  };

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the title', () => {
      render(<MilestoneCard milestone={defaultMilestone} />);

      expect(screen.getByText('初学者')).toBeInTheDocument();
    });

    it('should render the description', () => {
      render(<MilestoneCard milestone={defaultMilestone} />);

      expect(screen.getByText('学习100个单词')).toBeInTheDocument();
    });

    it('should render progress text', () => {
      render(<MilestoneCard milestone={defaultMilestone} />);

      expect(screen.getByText('50 / 100')).toBeInTheDocument();
      expect(screen.getByText('进度')).toBeInTheDocument();
    });

    it('should render percentage', () => {
      render(<MilestoneCard milestone={defaultMilestone} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should render progress bar', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const progressBar = container.querySelector('[style*="width: 50%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show achieved badge when achieved', () => {
      const achievedMilestone = { ...defaultMilestone, achieved: true };
      render(<MilestoneCard milestone={achievedMilestone} />);

      expect(screen.getByText('已达成')).toBeInTheDocument();
    });

    it('should not show achieved badge when not achieved', () => {
      render(<MilestoneCard milestone={defaultMilestone} />);

      expect(screen.queryByText('已达成')).not.toBeInTheDocument();
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should render trophy icon', () => {
      const milestone = { ...defaultMilestone, icon: 'trophy' as const };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByTestId('icon-trophy')).toBeInTheDocument();
    });

    it('should render star icon', () => {
      const milestone = { ...defaultMilestone, icon: 'star' as const };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByTestId('icon-star')).toBeInTheDocument();
    });

    it('should render target icon', () => {
      const milestone = { ...defaultMilestone, icon: 'target' as const };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByTestId('icon-target')).toBeInTheDocument();
    });

    it('should render zap icon', () => {
      const milestone = { ...defaultMilestone, icon: 'zap' as const };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
    });
  });

  // ==================== Color Tests ====================

  describe('colors', () => {
    it('should apply blue color styling', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
      expect(container.querySelector('.border-blue-200')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-500')).toBeInTheDocument();
    });

    it('should apply green color styling', () => {
      const greenMilestone = { ...defaultMilestone, color: 'green' };
      const { container } = render(<MilestoneCard milestone={greenMilestone} />);

      expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
      expect(container.querySelector('.border-green-200')).toBeInTheDocument();
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
    });

    it('should apply purple color styling', () => {
      const purpleMilestone = { ...defaultMilestone, color: 'purple' };
      const { container } = render(<MilestoneCard milestone={purpleMilestone} />);

      expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
      expect(container.querySelector('.border-purple-200')).toBeInTheDocument();
      expect(container.querySelector('.bg-purple-500')).toBeInTheDocument();
    });

    it('should apply amber color styling', () => {
      const amberMilestone = { ...defaultMilestone, color: 'amber' };
      const { container } = render(<MilestoneCard milestone={amberMilestone} />);

      expect(container.querySelector('.bg-amber-50')).toBeInTheDocument();
      expect(container.querySelector('.border-amber-200')).toBeInTheDocument();
      expect(container.querySelector('.bg-amber-500')).toBeInTheDocument();
    });

    it('should fallback to blue for unknown color', () => {
      const unknownColorMilestone = { ...defaultMilestone, color: 'unknown' };
      const { container } = render(<MilestoneCard milestone={unknownColorMilestone} />);

      expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    });
  });

  // ==================== Progress Calculation Tests ====================

  describe('progress calculation', () => {
    it('should calculate 0% progress correctly', () => {
      const milestone = { ...defaultMilestone, current: 0 };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should calculate 100% progress correctly', () => {
      const milestone = { ...defaultMilestone, current: 100 };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should cap progress at 100%', () => {
      const milestone = { ...defaultMilestone, current: 150, target: 100 };
      const { container } = render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
      const progressBar = container.querySelector('[style*="width: 100%"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should round percentage correctly', () => {
      const milestone = { ...defaultMilestone, current: 33, target: 100 };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('33%')).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle zero target', () => {
      const milestone = { ...defaultMilestone, target: 0, current: 0 };
      render(<MilestoneCard milestone={milestone} />);

      // Should not crash, will show NaN or handle gracefully
      expect(screen.getByText('初学者')).toBeInTheDocument();
    });

    it('should handle large numbers', () => {
      const milestone = {
        ...defaultMilestone,
        target: 10000,
        current: 5000,
      };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('5000 / 10000')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should handle long title and description', () => {
      const milestone = {
        ...defaultMilestone,
        title: '这是一个非常长的里程碑标题',
        description: '这是一个非常长的里程碑描述，包含很多详细信息',
      };
      render(<MilestoneCard milestone={milestone} />);

      expect(screen.getByText('这是一个非常长的里程碑标题')).toBeInTheDocument();
      expect(screen.getByText('这是一个非常长的里程碑描述，包含很多详细信息')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have correct container classes', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('border')).toBe(true);
      expect(card.classList.contains('rounded-xl')).toBe(true);
    });

    it('should have hover effect', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('hover:shadow-md')).toBe(true);
    });

    it('should have transition effect', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('transition-all')).toBe(true);
    });

    it('should have icon in colored background', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const iconContainer = container.querySelector('.w-10.h-10');
      expect(iconContainer).toBeInTheDocument();
      expect(iconContainer?.classList.contains('rounded-lg')).toBe(true);
    });

    it('should have progress bar with correct styling', () => {
      const { container } = render(<MilestoneCard milestone={defaultMilestone} />);

      const progressBarContainer = container.querySelector('.bg-gray-200.rounded-full');
      expect(progressBarContainer).toBeInTheDocument();
    });
  });

  // ==================== Achieved State Tests ====================

  describe('achieved state', () => {
    it('should show achieved badge with correct styling', () => {
      const achievedMilestone = { ...defaultMilestone, achieved: true };
      const { container } = render(<MilestoneCard milestone={achievedMilestone} />);

      const badge = screen.getByText('已达成');
      expect(badge.classList.contains('text-green-600')).toBe(true);
    });

    it('should show achieved badge in white background', () => {
      const achievedMilestone = { ...defaultMilestone, achieved: true };
      const { container } = render(<MilestoneCard milestone={achievedMilestone} />);

      const badgeContainer = screen.getByText('已达成').closest('div');
      expect(badgeContainer?.classList.contains('bg-white')).toBe(true);
    });
  });
});
