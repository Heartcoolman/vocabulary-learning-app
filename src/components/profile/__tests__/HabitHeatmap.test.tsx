/**
 * HabitHeatmap Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HabitHeatmap } from '../HabitHeatmap';

vi.mock('@phosphor-icons/react', () => ({
  Info: () => <span data-testid="info-icon">Info</span>,
  Moon: () => <span data-testid="moon-icon">Moon</span>,
  SunHorizon: () => <span data-testid="sun-horizon-icon">SunHorizon</span>,
  Sun: () => <span data-testid="sun-icon">Sun</span>,
  CloudSun: () => <span data-testid="cloud-sun-icon">CloudSun</span>,
  SunDim: () => <span data-testid="sun-dim-icon">SunDim</span>,
  MoonStars: () => <span data-testid="moon-stars-icon">MoonStars</span>,
}));

describe('HabitHeatmap', () => {
  const mockData = Array.from({ length: 24 }, (_, i) => i * 2);

  describe('rendering', () => {
    it('should render heatmap title', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('学习时段偏好')).toBeInTheDocument();
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

    it('should render time period summary', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('时段汇总')).toBeInTheDocument();
    });

    it('should render all time period labels', () => {
      render(<HabitHeatmap data={mockData} />);

      expect(screen.getByText('凌晨')).toBeInTheDocument();
      expect(screen.getByText('上午')).toBeInTheDocument();
      expect(screen.getByText('中午')).toBeInTheDocument();
      expect(screen.getByText('下午')).toBeInTheDocument();
      expect(screen.getByText('晚上')).toBeInTheDocument();
      expect(screen.getByText('深夜')).toBeInTheDocument();
    });

    it('should render hour labels (0-23)', () => {
      render(<HabitHeatmap data={mockData} />);

      // Some hours should be displayed - use getAllByText since values might match hour numbers
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
      expect(screen.getAllByText('12').length).toBeGreaterThan(0);
      expect(screen.getAllByText('23').length).toBeGreaterThan(0);
    });
  });

  describe('data handling', () => {
    it('should handle empty data', () => {
      const emptyData: number[] = [];
      render(<HabitHeatmap data={emptyData} />);

      expect(screen.getByText('暂无学习时段数据')).toBeInTheDocument();
    });

    it('should handle all zero data', () => {
      const zeroData = Array(24).fill(0);
      render(<HabitHeatmap data={zeroData} />);

      expect(screen.getByText('暂无学习时段数据')).toBeInTheDocument();
    });

    it('should handle single non-zero value', () => {
      const singleData = Array(24).fill(0);
      singleData[12] = 100;
      render(<HabitHeatmap data={singleData} />);

      expect(screen.getByText('学习时段偏好')).toBeInTheDocument();
    });
  });

  describe('backward compatibility', () => {
    it('should support timePref prop as alias for data', () => {
      render(<HabitHeatmap timePref={mockData} />);

      expect(screen.getByText('学习时段偏好')).toBeInTheDocument();
    });

    it('should prefer data over timePref when both provided', () => {
      const otherData = Array(24).fill(0);
      render(<HabitHeatmap data={mockData} timePref={otherData} />);

      // Should use data (which has values) not timePref (all zeros)
      expect(screen.getByText('学习时段偏好')).toBeInTheDocument();
    });
  });

  describe('showCard prop', () => {
    it('should render card container by default', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      expect(container.querySelector('.bg-white.rounded-2xl')).toBeInTheDocument();
    });

    it('should not render card container when showCard is false', () => {
      const { container } = render(<HabitHeatmap data={mockData} showCard={false} />);

      expect(container.querySelector('.bg-white.rounded-2xl')).not.toBeInTheDocument();
    });

    it('should render content without card for empty data when showCard is false', () => {
      render(<HabitHeatmap data={[]} showCard={false} />);

      expect(screen.getByText('暂无学习时段数据')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have aria-label on hour cells', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      const cells = container.querySelectorAll('[role="button"][aria-label]');
      expect(cells.length).toBeGreaterThan(0);
    });

    it('should have tabIndex on interactive elements', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      const focusableElements = container.querySelectorAll('[tabindex="0"]');
      expect(focusableElements.length).toBeGreaterThan(0);
    });
  });

  describe('grid structure', () => {
    it('should render 24 hour cells', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Should have 24 hour cells + 6 time period summary cells
      const buttonCells = container.querySelectorAll('[role="button"]');
      expect(buttonCells.length).toBe(24 + 6);
    });
  });

  describe('color coding', () => {
    it('should apply correct color classes based on intensity', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Check that various color classes exist
      const hasColoredCells = container.querySelector('.bg-blue-100') !== null ||
                               container.querySelector('.bg-blue-300') !== null ||
                               container.querySelector('.bg-blue-500') !== null ||
                               container.querySelector('.bg-blue-700') !== null ||
                               container.querySelector('.bg-gray-50') !== null;
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
    it('should have card container styling when showCard is true', () => {
      const { container } = render(<HabitHeatmap data={mockData} showCard={true} />);

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
      expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
    });
  });
});
