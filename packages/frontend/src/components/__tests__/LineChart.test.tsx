/**
 * LineChart Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineChart, { LineChartData } from '../LineChart';

describe('LineChart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock offsetWidth for container
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 600,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== Empty State Tests ====================

  describe('empty state', () => {
    it('should show no data message when data is empty', () => {
      render(<LineChart data={[]} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should show no data message when data is undefined', () => {
      render(<LineChart data={undefined as unknown as LineChartData[]} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should show no data message when data is null', () => {
      render(<LineChart data={null as unknown as LineChartData[]} />);
      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
      { date: '2024-01-03', value: 15 },
    ];

    it('should render SVG element', () => {
      render(<LineChart data={testData} />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render data points', () => {
      render(<LineChart data={testData} />);
      const circles = document.querySelectorAll('circle');
      expect(circles).toHaveLength(3);
    });

    it('should render line path', () => {
      render(<LineChart data={testData} />);
      const path = document.querySelector('path[fill="none"]');
      expect(path).toBeInTheDocument();
    });

    it('should render title when provided', () => {
      render(<LineChart data={testData} title="Test Chart" />);
      expect(screen.getByText('Test Chart')).toBeInTheDocument();
    });

    it('should render y-axis label when provided', () => {
      render(<LineChart data={testData} yAxisLabel="Value" />);
      expect(screen.getByText('Value')).toBeInTheDocument();
    });

    it('should render grid lines', () => {
      render(<LineChart data={testData} />);
      const gridLines = document.querySelectorAll('line[stroke="#e5e7eb"]');
      expect(gridLines.length).toBeGreaterThan(0);
    });

    it('should render y-axis tick labels', () => {
      render(<LineChart data={testData} />);
      const tickLabels = document.querySelectorAll('text.fill-gray-500');
      expect(tickLabels.length).toBeGreaterThan(0);
    });

    it('should render x-axis date labels', () => {
      render(<LineChart data={testData} />);
      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
    });
  });

  // ==================== Height Tests ====================

  describe('height', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
    ];

    it('should use default height of 300', () => {
      render(<LineChart data={testData} />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('height', '300');
    });

    it('should use custom height when provided', () => {
      render(<LineChart data={testData} height={400} />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('height', '400');
    });
  });

  // ==================== Hover Interaction Tests ====================

  describe('hover interactions', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
      { date: '2024-01-03', value: 15 },
    ];

    it('should render circles for hover interaction', () => {
      render(<LineChart data={testData} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(testData.length);
    });

    it('should have hover events on circles', () => {
      render(<LineChart data={testData} />);

      const circles = document.querySelectorAll('circle');
      // Verify circles exist and can receive events
      expect(circles[0]).toBeInTheDocument();

      // Trigger hover to ensure no errors
      fireEvent.mouseEnter(circles[0]);
      fireEvent.mouseLeave(circles[0]);
    });

    it('should have correct initial circle radius', () => {
      render(<LineChart data={testData} />);

      const circles = document.querySelectorAll('circle');
      const radius = circles[0].getAttribute('r');
      expect(Number(radius)).toBeGreaterThan(0);
    });
  });

  // ==================== Value Scaling Tests ====================

  describe('value scaling', () => {
    it('should handle all same values', () => {
      const data: LineChartData[] = [
        { date: '2024-01-01', value: 50 },
        { date: '2024-01-02', value: 50 },
        { date: '2024-01-03', value: 50 },
      ];

      render(<LineChart data={data} />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should handle negative values', () => {
      const data: LineChartData[] = [
        { date: '2024-01-01', value: -10 },
        { date: '2024-01-02', value: 10 },
        { date: '2024-01-03', value: 0 },
      ];

      render(<LineChart data={data} />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should handle decimal values', () => {
      const data: LineChartData[] = [
        { date: '2024-01-01', value: 0.5 },
        { date: '2024-01-02', value: 0.75 },
        { date: '2024-01-03', value: 0.25 },
      ];

      render(<LineChart data={data} />);

      const circles = document.querySelectorAll('circle');
      fireEvent.mouseEnter(circles[0]);

      // Value should be shown as 0.5
      expect(screen.getByText('0.5')).toBeInTheDocument();
    });

    it('should handle large values', () => {
      const data: LineChartData[] = [
        { date: '2024-01-01', value: 1000000 },
        { date: '2024-01-02', value: 2000000 },
        { date: '2024-01-03', value: 1500000 },
      ];

      render(<LineChart data={data} />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  // ==================== Single Data Point Tests ====================

  describe('single data point', () => {
    it('should handle single data point', () => {
      const data: LineChartData[] = [{ date: '2024-01-01', value: 10 }];

      render(<LineChart data={data} />);
      const circles = document.querySelectorAll('circle');
      expect(circles).toHaveLength(1);
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
    ];

    it('should have role img on SVG', () => {
      render(<LineChart data={testData} />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('role', 'img');
    });

    it('should have aria-label on SVG', () => {
      render(<LineChart data={testData} />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('aria-label', '折线图');
    });

    it('should include title in aria-label when provided', () => {
      render(<LineChart data={testData} title="My Chart" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('aria-label', '折线图: My Chart');
    });
  });

  // ==================== Responsive Tests ====================

  describe('responsive behavior', () => {
    it('should render with default dimensions', () => {
      const testData: LineChartData[] = [
        { date: '2024-01-01', value: 10 },
        { date: '2024-01-02', value: 20 },
      ];

      render(<LineChart data={testData} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // SVG should have a width attribute
      expect(svg?.getAttribute('width')).toBeTruthy();
    });
  });

  // ==================== Gradient Tests ====================

  describe('gradient', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
    ];

    it('should render gradient definition', () => {
      render(<LineChart data={testData} />);
      const gradient = document.querySelector('linearGradient#lineGradient');
      expect(gradient).toBeInTheDocument();
    });

    it('should render area fill with gradient', () => {
      render(<LineChart data={testData} />);
      const polygon = document.querySelector('polygon[fill="url(#lineGradient)"]');
      expect(polygon).toBeInTheDocument();
    });
  });

  // ==================== Line Styling Tests ====================

  describe('line styling', () => {
    const testData: LineChartData[] = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 20 },
    ];

    it('should have blue stroke on line', () => {
      render(<LineChart data={testData} />);
      const path = document.querySelector('path[stroke="#3b82f6"]');
      expect(path).toBeInTheDocument();
    });

    it('should have rounded line caps', () => {
      render(<LineChart data={testData} />);
      const path = document.querySelector('path[stroke-linecap="round"]');
      expect(path).toBeInTheDocument();
    });

    it('should have stroke width of 2', () => {
      render(<LineChart data={testData} />);
      const path = document.querySelector('path[stroke-width="2"]');
      expect(path).toBeInTheDocument();
    });
  });

  // ==================== X-Axis Label Interval Tests ====================

  describe('x-axis label interval', () => {
    it('should show all labels for small datasets', () => {
      const data: LineChartData[] = [
        { date: '2024-01-01', value: 10 },
        { date: '2024-01-02', value: 20 },
        { date: '2024-01-03', value: 15 },
      ];

      render(<LineChart data={data} />);

      // First and last should always be shown
      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
      expect(screen.getByText('2024-01-03')).toBeInTheDocument();
    });

    it('should skip labels for large datasets', () => {
      const data: LineChartData[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        value: Math.random() * 100,
      }));

      render(<LineChart data={data} />);

      // Not all labels should be shown
      const xLabels = document.querySelectorAll('text.fill-gray-600');
      expect(xLabels.length).toBeLessThan(30);
    });
  });
});
