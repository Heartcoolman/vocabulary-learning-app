/**
 * ProgressBarChart Component Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBarChart, { ProgressBarData } from '../ProgressBarChart';

describe('ProgressBarChart', () => {
  // ==================== Empty State Tests ====================

  describe('empty state', () => {
    it('should show no data message when data is empty', () => {
      render(<ProgressBarChart data={[]} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should show no data message when data is undefined', () => {
      render(<ProgressBarChart data={undefined} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should show no data message when data is null', () => {
      render(<ProgressBarChart data={null} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  // ==================== Data Display Tests ====================

  describe('data display', () => {
    const testData: ProgressBarData[] = [
      { label: 'Task 1', value: 75, maxValue: 100 },
      { label: 'Task 2', value: 50, maxValue: 100 },
      { label: 'Task 3', value: 25, maxValue: 100 },
    ];

    it('should display all labels', () => {
      render(<ProgressBarChart data={testData} />);

      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
      expect(screen.getByText('Task 3')).toBeInTheDocument();
    });

    it('should display percentage values', () => {
      render(<ProgressBarChart data={testData} />);

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('should render correct number of progress bars', () => {
      render(<ProgressBarChart data={testData} />);

      const progressbars = screen.getAllByRole('progressbar');
      expect(progressbars).toHaveLength(3);
    });

    it('should render list items', () => {
      render(<ProgressBarChart data={testData} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(3);
    });
  });

  // ==================== Percentage Calculation Tests ====================

  describe('percentage calculation', () => {
    it('should calculate percentage correctly', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 30, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByText('30%')).toBeInTheDocument();
    });

    it('should handle value greater than maxValue', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 150, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      // Should clamp to 100%
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle negative value', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: -10, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      // Should clamp to 0%
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should handle zero maxValue', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 0 }];

      render(<ProgressBarChart data={data} />);

      // Should show 0% when maxValue is 0
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should handle decimal percentages', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 33, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByText('33%')).toBeInTheDocument();
    });
  });

  // ==================== Color Tests ====================

  describe('colors', () => {
    it('should use default blue color when no color specified', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      const progressbar = screen.getByRole('progressbar');
      const bar = progressbar.querySelector('div');
      expect(bar?.className).toContain('bg-blue-500');
    });

    it('should use custom color when specified', () => {
      const data: ProgressBarData[] = [
        { label: 'Test', value: 50, maxValue: 100, color: 'bg-green-500' },
      ];

      render(<ProgressBarChart data={data} />);

      const progressbar = screen.getByRole('progressbar');
      const bar = progressbar.querySelector('div');
      expect(bar?.className).toContain('bg-green-500');
    });
  });

  // ==================== Height Tests ====================

  describe('height', () => {
    it('should use default height of 40px', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveStyle({ height: '40px' });
    });

    it('should use custom height when specified', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} height={20} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveStyle({ height: '20px' });
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have list role on container', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('should have aria-label on list', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('list')).toHaveAttribute('aria-label', '掌握度进度图表');
    });

    it('should have progressbar role', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should have correct aria-valuenow', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 75, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    });

    it('should have aria-valuemin of 0', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemin', '0');
    });

    it('should have aria-valuemax of 100', () => {
      const data: ProgressBarData[] = [{ label: 'Test', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
    });

    it('should have aria-label with label and percentage', () => {
      const data: ProgressBarData[] = [{ label: 'Task 1', value: 75, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Task 1: 75%');
    });
  });

  // ==================== Label Truncation Tests ====================

  describe('label truncation', () => {
    it('should have title attribute for long labels', () => {
      const data: ProgressBarData[] = [
        {
          label: 'This is a very long label that should be truncated',
          value: 50,
          maxValue: 100,
        },
      ];

      render(<ProgressBarChart data={data} />);

      const labelElement = screen.getByText('This is a very long label that should be truncated');
      expect(labelElement).toHaveAttribute(
        'title',
        'This is a very long label that should be truncated',
      );
    });

    it('should have truncate class on label', () => {
      const data: ProgressBarData[] = [{ label: 'Test Label', value: 50, maxValue: 100 }];

      render(<ProgressBarChart data={data} />);

      const labelElement = screen.getByText('Test Label');
      expect(labelElement.className).toContain('truncate');
    });
  });

  // ==================== Multiple Items Tests ====================

  describe('multiple items', () => {
    it('should render all items with different colors', () => {
      const data: ProgressBarData[] = [
        { label: 'Red', value: 80, maxValue: 100, color: 'bg-red-500' },
        { label: 'Green', value: 60, maxValue: 100, color: 'bg-green-500' },
        { label: 'Blue', value: 40, maxValue: 100, color: 'bg-blue-500' },
      ];

      render(<ProgressBarChart data={data} />);

      const progressbars = screen.getAllByRole('progressbar');
      expect(progressbars).toHaveLength(3);

      expect(progressbars[0].querySelector('div')?.className).toContain('bg-red-500');
      expect(progressbars[1].querySelector('div')?.className).toContain('bg-green-500');
      expect(progressbars[2].querySelector('div')?.className).toContain('bg-blue-500');
    });

    it('should render items in order', () => {
      const data: ProgressBarData[] = [
        { label: 'First', value: 100, maxValue: 100 },
        { label: 'Second', value: 75, maxValue: 100 },
        { label: 'Third', value: 50, maxValue: 100 },
      ];

      render(<ProgressBarChart data={data} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems[0]).toHaveTextContent('First');
      expect(listItems[1]).toHaveTextContent('Second');
      expect(listItems[2]).toHaveTextContent('Third');
    });
  });
});
