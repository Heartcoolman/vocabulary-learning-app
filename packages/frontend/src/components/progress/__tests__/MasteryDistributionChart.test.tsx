/**
 * MasteryDistributionChart Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MasteryDistributionChart } from '../MasteryDistributionChart';

describe('MasteryDistributionChart', () => {
  const defaultDistribution = [
    { level: 0, count: 50, percentage: 25 },
    { level: 1, count: 40, percentage: 20 },
    { level: 2, count: 30, percentage: 15 },
    { level: 3, count: 40, percentage: 20 },
    { level: 4, count: 25, percentage: 12.5 },
    { level: 5, count: 15, percentage: 7.5 },
  ];

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the title', () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(screen.getByText('单词掌握度分布')).toBeInTheDocument();
    });

    it('should render all level labels', () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(screen.getAllByText('新词').length).toBeGreaterThan(0);
      expect(screen.getAllByText('初识').length).toBeGreaterThan(0);
      expect(screen.getAllByText('熟悉').length).toBeGreaterThan(0);
      expect(screen.getAllByText('掌握').length).toBeGreaterThan(0);
      expect(screen.getAllByText('精通').length).toBeGreaterThan(0);
      expect(screen.getAllByText('母语').length).toBeGreaterThan(0);
    });

    it('should render count values', () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      // Each count appears twice - once in chart and once in legend
      expect(screen.getAllByText('50').length).toBeGreaterThan(0);
      expect(screen.getAllByText('40').length).toBeGreaterThan(0);
      expect(screen.getAllByText('30').length).toBeGreaterThan(0);
    });

    it('should render percentage values in legend', () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(screen.getByText('25.0%')).toBeInTheDocument();
      // 20.0% appears twice (level 1 and level 3 have the same percentage)
      expect(screen.getAllByText('20.0%').length).toBeGreaterThan(0);
      expect(screen.getByText('15.0%')).toBeInTheDocument();
    });

    it('should render chart bars', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      // Check for bar elements with background colors
      const bars = container.querySelectorAll('.rounded-t-lg');
      expect(bars.length).toBe(6);
    });

    it('should render legend section', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const legendSection = container.querySelector('.grid');
      expect(legendSection).toBeInTheDocument();
    });
  });

  // ==================== Bar Height Tests ====================

  describe('bar heights', () => {
    it('should calculate bar heights based on max count', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      // Max count is 50, so first bar should be 100%
      const bars = container.querySelectorAll('.rounded-t-lg');
      const firstBar = bars[0] as HTMLElement;
      expect(firstBar.style.height).toBe('100%');
    });

    it('should have minimum bar height when count > 0', () => {
      const distributionWithLowCount = [
        { level: 0, count: 100, percentage: 98 },
        { level: 1, count: 1, percentage: 1 },
        { level: 2, count: 1, percentage: 1 },
        { level: 3, count: 0, percentage: 0 },
        { level: 4, count: 0, percentage: 0 },
        { level: 5, count: 0, percentage: 0 },
      ];

      const { container } = render(
        <MasteryDistributionChart distribution={distributionWithLowCount} />,
      );

      const bars = container.querySelectorAll('.rounded-t-lg');
      const smallBar = bars[1] as HTMLElement;
      // Should have minimum height of 8px
      expect(smallBar.style.minHeight).toBe('8px');
    });
  });

  // ==================== Hover Interaction Tests ====================

  describe('hover interactions', () => {
    it('should show tooltip on hover', async () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      // Find a bar container and hover
      const barContainers = screen.getAllByText('新词')[0].closest('.cursor-pointer');

      await act(async () => {
        fireEvent.mouseEnter(barContainers!);
      });

      // Tooltip should show detailed info
      expect(screen.getByText('50 个单词')).toBeInTheDocument();
    });

    it('should hide tooltip on mouse leave', async () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const barContainers = screen.getAllByText('新词')[0].closest('.cursor-pointer');

      await act(async () => {
        fireEvent.mouseEnter(barContainers!);
      });

      expect(screen.getByText('50 个单词')).toBeInTheDocument();

      await act(async () => {
        fireEvent.mouseLeave(barContainers!);
      });

      // Tooltip should be hidden
      expect(screen.queryByText('50 个单词')).not.toBeInTheDocument();
    });

    it('should apply hover styles', async () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const barContainers = container.querySelectorAll('.cursor-pointer');
      const firstBar = barContainers[0];

      await act(async () => {
        fireEvent.mouseEnter(firstBar);
      });

      // Bar should have opacity-100 when hovered
      const bar = firstBar.querySelector('.rounded-t-lg');
      expect(bar?.classList.contains('opacity-100')).toBe(true);
    });
  });

  // ==================== Color Tests ====================

  describe('colors', () => {
    it('should apply correct color for level 0 (red)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-red-500')).toBeInTheDocument();
    });

    it('should apply correct color for level 1 (orange)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-orange-500')).toBeInTheDocument();
    });

    it('should apply correct color for level 2 (amber)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-amber-500')).toBeInTheDocument();
    });

    it('should apply correct color for level 3 (lime)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-lime-500')).toBeInTheDocument();
    });

    it('should apply correct color for level 4 (green)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
    });

    it('should apply correct color for level 5 (emerald)', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(container.querySelector('.bg-emerald-500')).toBeInTheDocument();
    });
  });

  // ==================== Legend Tests ====================

  describe('legend', () => {
    it('should render colored dots in legend', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const dots = container.querySelectorAll('.w-3.h-3.rounded');
      expect(dots.length).toBe(6);
    });

    it('should show percentage in legend items', () => {
      render(<MasteryDistributionChart distribution={defaultDistribution} />);

      expect(screen.getByText('25.0%')).toBeInTheDocument();
      // 20.0% appears twice (level 1 and level 3 have the same percentage)
      expect(screen.getAllByText('20.0%').length).toBeGreaterThan(0);
    });
  });

  // ==================== Edge Cases ====================

  describe('edge cases', () => {
    it('should handle empty distribution', () => {
      const emptyDistribution = [
        { level: 0, count: 0, percentage: 0 },
        { level: 1, count: 0, percentage: 0 },
        { level: 2, count: 0, percentage: 0 },
        { level: 3, count: 0, percentage: 0 },
        { level: 4, count: 0, percentage: 0 },
        { level: 5, count: 0, percentage: 0 },
      ];

      render(<MasteryDistributionChart distribution={emptyDistribution} />);

      expect(screen.getByText('单词掌握度分布')).toBeInTheDocument();
    });

    it('should handle single non-zero level', () => {
      const singleDistribution = [
        { level: 0, count: 100, percentage: 100 },
        { level: 1, count: 0, percentage: 0 },
        { level: 2, count: 0, percentage: 0 },
        { level: 3, count: 0, percentage: 0 },
        { level: 4, count: 0, percentage: 0 },
        { level: 5, count: 0, percentage: 0 },
      ];

      render(<MasteryDistributionChart distribution={singleDistribution} />);

      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });

    it('should handle decimal percentages', () => {
      const decimalDistribution = [
        { level: 0, count: 33, percentage: 33.333 },
        { level: 1, count: 33, percentage: 33.333 },
        { level: 2, count: 34, percentage: 33.334 },
        { level: 3, count: 0, percentage: 0 },
        { level: 4, count: 0, percentage: 0 },
        { level: 5, count: 0, percentage: 0 },
      ];

      render(<MasteryDistributionChart distribution={decimalDistribution} />);

      // Should display with 1 decimal place (multiple elements may match)
      const elements = screen.getAllByText('33.3%');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should handle large counts', () => {
      const largeDistribution = [
        { level: 0, count: 10000, percentage: 50 },
        { level: 1, count: 5000, percentage: 25 },
        { level: 2, count: 5000, percentage: 25 },
        { level: 3, count: 0, percentage: 0 },
        { level: 4, count: 0, percentage: 0 },
        { level: 5, count: 0, percentage: 0 },
      ];

      render(<MasteryDistributionChart distribution={largeDistribution} />);

      expect(screen.getAllByText('10000').length).toBeGreaterThan(0);
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have correct container classes', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('bg-white')).toBe(true);
      expect(card.classList.contains('rounded-card')).toBe(true);
    });

    it('should have chart area with correct height', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const chartArea = container.querySelector('.h-64');
      expect(chartArea).toBeInTheDocument();
    });

    it('should have border between chart and legend', () => {
      const { container } = render(<MasteryDistributionChart distribution={defaultDistribution} />);

      const borderSection = container.querySelector('.border-t');
      expect(borderSection).toBeInTheDocument();
    });
  });
});
