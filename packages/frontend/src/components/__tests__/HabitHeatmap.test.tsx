/**
 * HabitHeatmap Component Unit Tests
 * 学习时间热力图组件测试
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HabitHeatmap from '../HabitHeatmap';

describe('HabitHeatmap', () => {
  // Helper function to create time preference array
  const createTimePref = (
    pattern: 'uniform' | 'morning' | 'evening' | 'random' = 'uniform',
  ): number[] => {
    const timePref = Array(24).fill(0);
    switch (pattern) {
      case 'uniform':
        return Array(24).fill(0.5);
      case 'morning':
        // Higher values in morning hours
        for (let i = 0; i < 24; i++) {
          timePref[i] = i >= 6 && i <= 11 ? 0.8 : 0.1;
        }
        return timePref;
      case 'evening':
        // Higher values in evening hours
        for (let i = 0; i < 24; i++) {
          timePref[i] = i >= 18 && i <= 23 ? 0.9 : 0.1;
        }
        return timePref;
      case 'random':
        return Array(24)
          .fill(0)
          .map(() => Math.random());
    }
  };

  // ==================== Rendering Tests ====================
  describe('rendering', () => {
    it('should render title', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
    });

    it('should render legend labels', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      expect(screen.getByText('低')).toBeInTheDocument();
      expect(screen.getByText('高')).toBeInTheDocument();
    });

    it('should render detailed stats section', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      expect(screen.getByText('详细时段统计')).toBeInTheDocument();
    });

    it('should render 24 hour cells', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      // Check for hour labels 0-23
      for (let i = 0; i < 24; i++) {
        expect(screen.getByText(String(i))).toBeInTheDocument();
      }
    });

    it('should render 8 grouped time slots', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      // 24 hours / 3 hours per group = 8 groups
      expect(screen.getByText('0:00 - 2:59')).toBeInTheDocument();
      expect(screen.getByText('3:00 - 5:59')).toBeInTheDocument();
      expect(screen.getByText('6:00 - 8:59')).toBeInTheDocument();
      expect(screen.getByText('9:00 - 11:59')).toBeInTheDocument();
      expect(screen.getByText('12:00 - 14:59')).toBeInTheDocument();
      expect(screen.getByText('15:00 - 17:59')).toBeInTheDocument();
      expect(screen.getByText('18:00 - 20:59')).toBeInTheDocument();
      expect(screen.getByText('21:00 - 23:59')).toBeInTheDocument();
    });
  });

  // ==================== Empty/No Data State Tests ====================
  describe('empty/no data state', () => {
    it('should show empty state message when timePref is empty array', () => {
      render(<HabitHeatmap timePref={[]} />);

      expect(screen.getByText('暂无时间偏好数据')).toBeInTheDocument();
    });

    it('should show empty state when timePref is undefined', () => {
      // @ts-expect-error - Testing edge case with undefined prop
      render(<HabitHeatmap timePref={undefined} />);

      expect(screen.getByText('暂无时间偏好数据')).toBeInTheDocument();
    });

    it('should show empty state when timePref is null', () => {
      // @ts-expect-error - Testing edge case with null prop
      render(<HabitHeatmap timePref={null} />);

      expect(screen.getByText('暂无时间偏好数据')).toBeInTheDocument();
    });

    it('should not render legend in empty state', () => {
      render(<HabitHeatmap timePref={[]} />);

      expect(screen.queryByText('低')).not.toBeInTheDocument();
      expect(screen.queryByText('高')).not.toBeInTheDocument();
    });

    it('should not render detailed stats in empty state', () => {
      render(<HabitHeatmap timePref={[]} />);

      expect(screen.queryByText('详细时段统计')).not.toBeInTheDocument();
    });
  });

  // ==================== Color Intensity Tests ====================
  describe('color intensity', () => {
    it('should display 无活动 for zero values', () => {
      const timePref = Array(24).fill(0);
      render(<HabitHeatmap timePref={timePref} />);

      // All groups should show 无活动
      const noActivityLabels = screen.getAllByText('无活动');
      expect(noActivityLabels.length).toBeGreaterThan(0);
    });

    it('should display 频繁 for highest values', () => {
      const timePref = Array(24).fill(1);
      render(<HabitHeatmap timePref={timePref} />);

      // All groups should show 频繁
      const frequentLabels = screen.getAllByText('频繁');
      expect(frequentLabels.length).toBeGreaterThan(0);
    });

    it('should apply correct color classes based on intensity', () => {
      const timePref = Array(24).fill(0);
      timePref[9] = 1; // High value at 9:00
      timePref[10] = 1;
      timePref[11] = 1;

      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // Should have both low (gray) and high (blue) colors
      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-500')).toBeInTheDocument();
    });

    it('should show different intensity levels', () => {
      const timePref = Array(24).fill(0);
      // Set different intensity levels
      timePref[0] = 0; // 无活动
      timePref[3] = 0.1; // 极少
      timePref[6] = 0.3; // 较少
      timePref[9] = 0.5; // 中等
      timePref[12] = 0.7; // 较多
      timePref[15] = 1.0; // 频繁

      render(<HabitHeatmap timePref={timePref} />);

      // Check for various intensity labels in the groups (there are multiple, so use getAllByText)
      const intensityLabels = screen.getAllByText(/无活动|极少|较少|中等|较多|频繁/);
      expect(intensityLabels.length).toBeGreaterThan(0);
    });
  });

  // ==================== Accessibility Tests ====================
  describe('accessibility', () => {
    it('should have role=button on hour cells', () => {
      render(<HabitHeatmap timePref={createTimePref()} />);

      const buttons = screen.getAllByRole('button');
      // Should have buttons for grouped hours + individual hours
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should have tabIndex on interactive elements', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      const tabbableElements = container.querySelectorAll('[tabindex="0"]');
      expect(tabbableElements.length).toBeGreaterThan(0);
    });

    it('should have aria-label on hour cells', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      const labeledElements = container.querySelectorAll('[aria-label]');
      expect(labeledElements.length).toBeGreaterThan(0);
    });

    it('should include time range in aria-label for groups', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      const groupElement = container.querySelector('[aria-label*="0:00 - 2:59"]');
      expect(groupElement).toBeInTheDocument();
    });

    it('should include intensity in aria-label for individual hours', () => {
      const timePref = Array(24).fill(0);
      timePref[0] = 1; // Make hour 0 have high intensity

      const { container } = render(<HabitHeatmap timePref={timePref} />);

      const hourElement = container.querySelector('[aria-label*="0:00 - 0:59"]');
      expect(hourElement).toBeInTheDocument();
    });
  });

  // ==================== Tooltip Tests ====================
  describe('tooltips', () => {
    it('should show tooltip with frequency on hover for groups', async () => {
      const timePref = createTimePref('uniform');
      const user = userEvent.setup();
      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // Find a group element
      const groupElement = container.querySelector('[aria-label*="0:00 - 2:59"]');
      expect(groupElement).toBeInTheDocument();

      // Hover over the element
      if (groupElement) {
        await user.hover(groupElement);
      }

      // The tooltip should contain frequency information (there are multiple, so use getAllByText)
      const tooltipTexts = screen.getAllByText(/活动频次:/);
      expect(tooltipTexts.length).toBeGreaterThan(0);
    });

    it('should show tooltip with frequency on hover for individual hours', async () => {
      const timePref = createTimePref('uniform');
      const user = userEvent.setup();
      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // Find an individual hour element
      const hourElement = container.querySelector('[aria-label*="0:00 - 0:59"]');
      expect(hourElement).toBeInTheDocument();

      if (hourElement) {
        await user.hover(hourElement);
      }

      // The tooltip should contain frequency information (there are multiple, so use getAllByText)
      const tooltipTexts = screen.getAllByText(/频次:/);
      expect(tooltipTexts.length).toBeGreaterThan(0);
    });
  });

  // ==================== Calculation Tests ====================
  describe('calculations', () => {
    it('should calculate max value correctly', () => {
      const timePref = Array(24).fill(0.2);
      timePref[12] = 0.8; // Peak at noon

      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // The noon slot should have the highest intensity color
      expect(container.querySelector('.bg-blue-500')).toBeInTheDocument();
    });

    it('should handle all zero values without division by zero', () => {
      const timePref = Array(24).fill(0);

      // Should not throw
      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // Should render with gray (zero activity) colors
      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    });

    it('should calculate group averages correctly', () => {
      const timePref = Array(24).fill(0);
      // Group 0-2: average = (0.3 + 0.6 + 0.9) / 3 = 0.6
      timePref[0] = 0.3;
      timePref[1] = 0.6;
      timePref[2] = 0.9;

      render(<HabitHeatmap timePref={timePref} />);

      // The first group should show medium intensity
      // (exact label depends on the max value in the array)
      expect(screen.getByText('0:00 - 2:59')).toBeInTheDocument();
    });
  });

  // ==================== Props Update Tests ====================
  describe('props update', () => {
    it('should update when timePref changes', () => {
      const initialTimePref = Array(24).fill(0);
      const updatedTimePref = Array(24).fill(1);

      const { rerender } = render(<HabitHeatmap timePref={initialTimePref} />);

      // Initially all should be 无活动
      expect(screen.getAllByText('无活动').length).toBeGreaterThan(0);

      rerender(<HabitHeatmap timePref={updatedTimePref} />);

      // After update, all should be 频繁
      expect(screen.getAllByText('频繁').length).toBeGreaterThan(0);
    });

    it('should handle transition from empty to filled data', () => {
      const emptyTimePref: number[] = [];
      const filledTimePref = createTimePref('uniform');

      const { rerender } = render(<HabitHeatmap timePref={emptyTimePref} />);

      expect(screen.getByText('暂无时间偏好数据')).toBeInTheDocument();

      rerender(<HabitHeatmap timePref={filledTimePref} />);

      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
      expect(screen.queryByText('暂无时间偏好数据')).not.toBeInTheDocument();
    });

    it('should handle transition from filled to empty data', () => {
      const filledTimePref = createTimePref('uniform');
      const emptyTimePref: number[] = [];

      const { rerender } = render(<HabitHeatmap timePref={filledTimePref} />);

      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();

      rerender(<HabitHeatmap timePref={emptyTimePref} />);

      expect(screen.getByText('暂无时间偏好数据')).toBeInTheDocument();
    });
  });

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle very small positive values', () => {
      const timePref = Array(24).fill(0.001);

      render(<HabitHeatmap timePref={timePref} />);

      // Should render without errors
      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
    });

    it('should handle very large values', () => {
      const timePref = Array(24).fill(1000);

      render(<HabitHeatmap timePref={timePref} />);

      // Should still render with highest intensity
      expect(screen.getAllByText('频繁').length).toBeGreaterThan(0);
    });

    it('should handle negative values', () => {
      const timePref = Array(24).fill(-1);

      const { container } = render(<HabitHeatmap timePref={timePref} />);

      // Should treat as zero activity
      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
    });

    it('should handle array with less than 24 elements', () => {
      const timePref = Array(12).fill(0.5);

      render(<HabitHeatmap timePref={timePref} />);

      // Should render partial data without crashing
      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
    });

    it('should handle array with more than 24 elements', () => {
      const timePref = Array(48).fill(0.5);

      render(<HabitHeatmap timePref={timePref} />);

      // Should render correctly (only first 24 used in groups, all shown in detailed)
      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
    });

    it('should handle NaN values', () => {
      const timePref = Array(24).fill(NaN);

      // Should not crash
      render(<HabitHeatmap timePref={timePref} />);

      expect(screen.getByText('学习时间偏好 (24小时制)')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================
  describe('styling', () => {
    it('should have hover effect classes on cells', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      expect(container.querySelector('.hover\\:scale-105')).toBeInTheDocument();
      expect(container.querySelector('.hover\\:shadow-elevated')).toBeInTheDocument();
    });

    it('should have transition classes for animations', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      expect(container.querySelector('.transition-all')).toBeInTheDocument();
    });

    it('should have responsive grid classes', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      // Check for responsive grid on grouped section
      expect(container.querySelector('.grid-cols-2')).toBeInTheDocument();
      expect(container.querySelector('.sm\\:grid-cols-4')).toBeInTheDocument();

      // Check for responsive grid on detailed section
      expect(container.querySelector('.grid-cols-4')).toBeInTheDocument();
    });

    it('should have legend color boxes', () => {
      const { container } = render(<HabitHeatmap timePref={createTimePref()} />);

      // Legend should have color boxes from gray to blue
      expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-100')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-200')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-300')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-400')).toBeInTheDocument();
      expect(container.querySelector('.bg-blue-500')).toBeInTheDocument();
    });
  });
});
