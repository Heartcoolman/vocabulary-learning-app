/**
 * HabitHeatmap Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HabitHeatmap } from '../HabitHeatmap';

vi.mock('@phosphor-icons/react', () => ({
  Info: () => <span data-testid="info-icon">ℹ️</span>,
  Moon: () => <span data-testid="moon-icon">🌙</span>,
  SunHorizon: () => <span data-testid="sun-horizon-icon">🌅</span>,
  Sun: () => <span data-testid="sun-icon">☀️</span>,
  CloudSun: () => <span data-testid="cloud-sun-icon">⛅</span>,
  SunDim: () => <span data-testid="sun-dim-icon">🌤️</span>,
  MoonStars: () => <span data-testid="moon-stars-icon">🌙✨</span>,
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

    it('should render time slot summary section', () => {
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

      // With all zeros, shows empty state
      expect(screen.getByText('暂无学习时段数据')).toBeInTheDocument();
    });

    it('should handle single non-zero value', () => {
      const singleData = Array(24).fill(0);
      singleData[12] = 100;
      render(<HabitHeatmap data={singleData} />);

      expect(screen.getByText('学习时段偏好')).toBeInTheDocument();
    });
  });

  describe('grid structure', () => {
    it('should render 24 hour cells', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Each hour has a cell
      const cells = container.querySelectorAll('.aspect-square.rounded-lg');
      expect(cells.length).toBe(24);
    });

    it('should render 6 time period cards', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // 6 time periods: 凌晨, 上午, 中午, 下午, 晚上, 深夜
      const periodCards = container.querySelectorAll('.p-3.rounded-lg.text-center');
      expect(periodCards.length).toBe(6);
    });
  });

  describe('color coding', () => {
    it('should apply correct color classes based on intensity', () => {
      const { container } = render(<HabitHeatmap data={mockData} />);

      // Check that various color classes exist
      const cells = container.querySelectorAll('.aspect-square.rounded-lg');
      const hasColoredCells = Array.from(cells).some(
        (cell) =>
          cell.classList.contains('bg-blue-100') ||
          cell.classList.contains('bg-blue-300') ||
          cell.classList.contains('bg-blue-500') ||
          cell.classList.contains('bg-blue-700') ||
          cell.classList.contains('bg-gray-50'),
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
  });
});
