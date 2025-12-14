/**
 * MasteryStatsCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MasteryStatsCard } from '../MasteryStatsCard';

// Mock phosphor-icons
vi.mock('@phosphor-icons/react', () => ({
  CheckCircle: ({ className }: any) => (
    <span data-testid="icon-check-circle" className={className}>
      ✓
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
  BookOpen: ({ className }: any) => (
    <span data-testid="icon-book-open" className={className}>
      Book
    </span>
  ),
}));

describe('MasteryStatsCard', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the label', () => {
      render(<MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />);

      expect(screen.getByText('已掌握')).toBeInTheDocument();
    });

    it('should render the value', () => {
      render(<MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />);

      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('should render zero value', () => {
      render(<MasteryStatsCard label="已掌握" value={0} icon="mastered" color="green" />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should render large values', () => {
      render(<MasteryStatsCard label="已掌握" value={99999} icon="mastered" color="green" />);

      expect(screen.getByText('99999')).toBeInTheDocument();
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should render CheckCircle icon for mastered', () => {
      render(<MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />);

      expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument();
    });

    it('should render Clock icon for learning', () => {
      render(<MasteryStatsCard label="学习中" value={50} icon="learning" color="blue" />);

      expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
    });

    it('should render Fire icon for review', () => {
      render(<MasteryStatsCard label="需复习" value={30} icon="review" color="orange" />);

      expect(screen.getByTestId('icon-fire')).toBeInTheDocument();
    });

    it('should render BookOpen icon for total', () => {
      render(<MasteryStatsCard label="总计" value={230} icon="total" color="purple" />);

      expect(screen.getByTestId('icon-book-open')).toBeInTheDocument();
    });
  });

  // ==================== Color Tests ====================

  describe('colors', () => {
    it('should apply green color classes', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      const valueElement = screen.getByText('150');
      expect(valueElement.classList.contains('text-green-600')).toBe(true);

      // Check for green background elements
      expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
    });

    it('should apply blue color classes', () => {
      const { container } = render(
        <MasteryStatsCard label="学习中" value={50} icon="learning" color="blue" />,
      );

      const valueElement = screen.getByText('50');
      expect(valueElement.classList.contains('text-blue-600')).toBe(true);

      expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    });

    it('should apply orange color classes', () => {
      const { container } = render(
        <MasteryStatsCard label="需复习" value={30} icon="review" color="orange" />,
      );

      const valueElement = screen.getByText('30');
      expect(valueElement.classList.contains('text-orange-600')).toBe(true);

      expect(container.querySelector('.bg-orange-50')).toBeInTheDocument();
    });

    it('should apply purple color classes', () => {
      const { container } = render(
        <MasteryStatsCard label="总计" value={230} icon="total" color="purple" />,
      );

      const valueElement = screen.getByText('230');
      expect(valueElement.classList.contains('text-purple-600')).toBe(true);

      expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
    });
  });

  // ==================== Structure Tests ====================

  describe('structure', () => {
    it('should have correct container classes', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('bg-white')).toBe(true);
      expect(card.classList.contains('rounded-card')).toBe(true);
    });

    it('should have hover effect classes', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('hover:shadow-elevated')).toBe(true);
    });

    it('should have transition classes', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      const card = container.firstChild as HTMLElement;
      expect(card.classList.contains('transition-all')).toBe(true);
    });
  });

  // ==================== Icon Container Tests ====================

  describe('icon container', () => {
    it('should have icon in colored background container', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      // Find the icon container with light background
      const iconContainer = container.querySelector('.bg-green-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have hover scale effect on icon container', () => {
      const { container } = render(
        <MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />,
      );

      const iconContainer = container.querySelector('.group-hover\\:scale-110');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have semantic structure', () => {
      render(<MasteryStatsCard label="已掌握" value={150} icon="mastered" color="green" />);

      // Label should be a paragraph
      const label = screen.getByText('已掌握');
      expect(label.tagName.toLowerCase()).toBe('p');

      // Value should be a paragraph
      const value = screen.getByText('150');
      expect(value.tagName.toLowerCase()).toBe('p');
    });
  });
});
