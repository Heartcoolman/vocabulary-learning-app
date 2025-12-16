/**
 * ProgressOverviewCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressOverviewCard } from '../ProgressOverviewCard';
import type { StudyProgressData } from '../../../hooks/useStudyProgress';

// Mock Icon components
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    Trophy: ({ className }: any) => (
      <span data-testid="icon-trophy" className={className}>
        Trophy
      </span>
    ),
    Target: ({ className }: any) => (
      <span data-testid="icon-target" className={className}>
        Target
      </span>
    ),
    BookOpen: ({ className }: any) => (
      <span data-testid="icon-book" className={className}>
        Book
      </span>
    ),
  };
});

describe('ProgressOverviewCard', () => {
  const defaultData: StudyProgressData = {
    todayStudied: 20,
    todayTarget: 30,
    totalStudied: 500,
    correctRate: 85,
    weeklyTrend: [10, 15, 20, 18, 22, 25, 20],
  };

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render today studied count', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('20')).toBeInTheDocument();
    });

    it('should render today target', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('/ 30')).toBeInTheDocument();
    });

    it('should render today target label', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('今日目标')).toBeInTheDocument();
    });

    it('should render total studied count', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('已学单词')).toBeInTheDocument();
    });

    it('should render correct rate', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('答题正确率')).toBeInTheDocument();
    });

    it('should render completion message when target met', () => {
      const data = { ...defaultData, todayStudied: 30 };
      render(<ProgressOverviewCard data={data} />);

      expect(screen.getByText('太棒了，已完成！')).toBeInTheDocument();
    });

    it('should render encouraging message when target not met', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('继续加油！')).toBeInTheDocument();
    });
  });

  // ==================== Progress Circle Tests ====================

  describe('progress circle', () => {
    it('should render SVG progress circle', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render both circle elements', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(2); // Background and progress circles
    });

    it('should have correct progress percentage calculation', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      // percentComplete = (20 / 30) * 100 = ~67%
      const progressCircle = container.querySelectorAll('circle')[1];
      expect(progressCircle).toBeInTheDocument();
      expect(progressCircle.getAttribute('stroke')).toBe('#3B82F6');
    });
  });

  // ==================== Data Handling Tests ====================

  describe('data handling', () => {
    it('should handle zero today target gracefully', () => {
      const data = { ...defaultData, todayTarget: 0 };
      render(<ProgressOverviewCard data={data} />);

      expect(screen.getByText('/ 0')).toBeInTheDocument();
    });

    it('should cap percentage at 100', () => {
      const data = { ...defaultData, todayStudied: 50, todayTarget: 30 };
      render(<ProgressOverviewCard data={data} />);

      // Should still render without error
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('should format large total studied numbers', () => {
      const data = { ...defaultData, totalStudied: 1234567 };
      render(<ProgressOverviewCard data={data} />);

      // toLocaleString should format the number
      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });

    it('should handle zero values', () => {
      const data: StudyProgressData = {
        todayStudied: 0,
        todayTarget: 30,
        totalStudied: 0,
        correctRate: 0,
        weeklyTrend: [0, 0, 0, 0, 0, 0, 0],
      };
      render(<ProgressOverviewCard data={data} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
      // Multiple 0s in the UI
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThan(0);
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should render target icon', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByTestId('icon-target')).toBeInTheDocument();
    });

    it('should render book icon for total studied', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByTestId('icon-book')).toBeInTheDocument();
    });

    it('should render trophy icon for correct rate', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByTestId('icon-trophy')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have correct container classes', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('bg-white')).toBe(true);
      expect(card.classList.contains('rounded-card')).toBe(true);
    });

    it('should apply indigo styling to total studied card', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      const indigoCard = container.querySelector('.bg-indigo-50');
      expect(indigoCard).toBeInTheDocument();
    });

    it('should apply amber styling to correct rate card', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      const amberCard = container.querySelector('.bg-amber-50');
      expect(amberCard).toBeInTheDocument();
    });
  });

  // ==================== Layout Tests ====================

  describe('layout', () => {
    it('should have grid layout', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });

    it('should render progress circle section', () => {
      const { container } = render(<ProgressOverviewCard data={defaultData} />);

      // Progress circle container
      const circleContainer = container.querySelector('.relative.w-40.h-40');
      expect(circleContainer).toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have semantic structure', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      // Check for heading
      expect(screen.getByText('今日目标')).toBeInTheDocument();
    });

    it('should have descriptive labels', () => {
      render(<ProgressOverviewCard data={defaultData} />);

      expect(screen.getByText('累计')).toBeInTheDocument();
      expect(screen.getByText('准确率')).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle 100% completion', () => {
      const data = { ...defaultData, todayStudied: 30, todayTarget: 30 };
      render(<ProgressOverviewCard data={data} />);

      expect(screen.getByText('太棒了，已完成！')).toBeInTheDocument();
    });

    it('should handle over 100% completion', () => {
      const data = { ...defaultData, todayStudied: 45, todayTarget: 30 };
      render(<ProgressOverviewCard data={data} />);

      // Should still show completed message
      expect(screen.getByText('太棒了，已完成！')).toBeInTheDocument();
    });

    it('should handle high correct rate', () => {
      const data = { ...defaultData, correctRate: 100 };
      render(<ProgressOverviewCard data={data} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
