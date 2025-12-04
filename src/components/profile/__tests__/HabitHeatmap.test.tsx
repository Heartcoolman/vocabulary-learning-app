/**
 * HabitHeatmap Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HabitHeatmap } from '../HabitHeatmap';

vi.mock('@phosphor-icons/react', () => ({
  Info: () => <span data-testid="info-icon">ℹ️</span>,
}));

describe('HabitHeatmap', () => {
  const mockData = Array.from({ length: 24 }, (_, i) => i * 2);

  describe('rendering', () => {
    it('should render heatmap title', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('学习时段热力图')).toBeInTheDocument();
    });

    it('should render info icon', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByTestId('info-icon')).toBeInTheDocument();
    });

    it('should render legend', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('少')).toBeInTheDocument();
      expect(screen.getByText('多')).toBeInTheDocument();
    });

    it('should render all weekday labels', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('周一')).toBeInTheDocument();
      expect(screen.getByText('周二')).toBeInTheDocument();
      expect(screen.getByText('周三')).toBeInTheDocument();
      expect(screen.getByText('周四')).toBeInTheDocument();
      expect(screen.getByText('周五')).toBeInTheDocument();
      expect(screen.getByText('周六')).toBeInTheDocument();
      expect(screen.getByText('周日')).toBeInTheDocument();
    });

    it('should render hour labels', () => {
      render(<HabitHeatmap data={mockData} />);

      // Hours that are multiples of 3 should be displayed
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('6')).toBeInTheDocument();
    });
  });

  describe('data handling', () => {
    it('should handle empty data', () => {
      const emptyData: number[] = [];
      render(<HabitHeatmap data={emptyData} />);

      expect(screen.getByText('学习时段热力图')).toBeInTheDocument();
    });

    it('should handle all zero data', () => {
      const zeroData = Array(24).fill(0);
      render(<HabitHeatmap data={zeroData} />);

      expect(screen.getByText('学习时段热力图')).toBeInTheDocument();
    });

    it('should handle single non-zero value', () => {
      const singleData = Array(24).fill(0);
      singleData[12] = 100;
      render(<HabitHeatmap data={singleData} />);

      expect(screen.getByText('学习时段热力图')).toBeInTheDocument();
    });
  });

  describe('grid structure', () => {
    it('should render 7 rows (one for each day)', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      const dayLabels = container.querySelectorAll('.w-12');
      expect(dayLabels.length).toBe(7);
    });

    it('should render grid cells', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Each day has 24 hour cells
      const cells = container.querySelectorAll('.h-8.rounded-sm');
      expect(cells.length).toBe(7 * 24);
    });
  });

  describe('color coding', () => {
    it('should apply correct color classes based on intensity', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Check that various color classes exist
      const cells = container.querySelectorAll('.h-8.rounded-sm');
      const hasColoredCells = Array.from(cells).some(
        cell => cell.classList.contains('bg-emerald-100') ||
                cell.classList.contains('bg-emerald-300') ||
                cell.classList.contains('bg-emerald-500') ||
                cell.classList.contains('bg-emerald-700') ||
                cell.classList.contains('bg-gray-50')
      );
      expect(hasColoredCells).toBe(true);
    });
  });

  describe('tooltip', () => {
    it('should have title attribute on cells', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      const cellsWithTitle = container.querySelectorAll('[title]');
      expect(cellsWithTitle.length).toBeGreaterThan(0);
    });
  });

  describe('styling', () => {
    it('should have card container styling', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
      expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
    });

    it('should be horizontally scrollable', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument();
    });
  });
});
