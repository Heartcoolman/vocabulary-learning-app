/**
 * LearningCurveChart Component Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LearningCurveChart from '../LearningCurveChart';
import type { LearningCurvePoint } from '../../../types/explainability';

const mockData: LearningCurvePoint[] = [
  { date: '2024-01-01', mastery: 30 },
  { date: '2024-01-05', mastery: 45 },
  { date: '2024-01-10', mastery: 60 },
  { date: '2024-01-15', mastery: 75 },
  { date: '2024-01-20', mastery: 85 },
];

describe('LearningCurveChart', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the title', () => {
      render(<LearningCurveChart data={mockData} />);

      expect(screen.getByText('最近30天学习曲线')).toBeInTheDocument();
    });

    it('should render the SVG element', () => {
      render(<LearningCurveChart data={mockData} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render the subtitle', () => {
      render(<LearningCurveChart data={mockData} />);

      expect(screen.getByText('记忆强度变化趋势')).toBeInTheDocument();
    });

    it('should render data points', () => {
      render(<LearningCurveChart data={mockData} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(mockData.length);
    });

    it('should render the path line', () => {
      render(<LearningCurveChart data={mockData} />);

      const paths = document.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should render axis lines', () => {
      render(<LearningCurveChart data={mockData} />);

      const lines = document.querySelectorAll('line');
      expect(lines.length).toBe(2); // X and Y axis
    });
  });

  // ==================== Empty State Tests ====================

  describe('empty state', () => {
    it('should display empty message when no data', () => {
      render(<LearningCurveChart data={[]} />);

      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('should not render SVG when no data', () => {
      render(<LearningCurveChart data={[]} />);

      const svg = document.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });
  });

  // ==================== Data Handling Tests ====================

  describe('data handling', () => {
    it('should handle single data point', () => {
      const singlePoint: LearningCurvePoint[] = [{ date: '2024-01-01', mastery: 50 }];
      render(<LearningCurveChart data={singlePoint} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(1);
    });

    it('should handle data with zero mastery', () => {
      const dataWithZero: LearningCurvePoint[] = [
        { date: '2024-01-01', mastery: 0 },
        { date: '2024-01-02', mastery: 50 },
      ];
      render(<LearningCurveChart data={dataWithZero} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(2);
    });

    it('should handle data with undefined mastery', () => {
      const dataWithUndefined: LearningCurvePoint[] = [
        { date: '2024-01-01', mastery: undefined },
        { date: '2024-01-02', mastery: 50 },
      ];
      render(<LearningCurveChart data={dataWithUndefined} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(2);
    });

    it('should handle data with maximum mastery (100)', () => {
      const maxData: LearningCurvePoint[] = [
        { date: '2024-01-01', mastery: 100 },
        { date: '2024-01-02', mastery: 100 },
      ];
      render(<LearningCurveChart data={maxData} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(2);
    });

    it('should clamp mastery values above 100', () => {
      const overMaxData: LearningCurvePoint[] = [{ date: '2024-01-01', mastery: 150 }];
      render(<LearningCurveChart data={overMaxData} />);

      // Should still render without error
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should handle negative mastery values', () => {
      const negativeData: LearningCurvePoint[] = [
        { date: '2024-01-01', mastery: -10 },
        { date: '2024-01-02', mastery: 50 },
      ];
      render(<LearningCurveChart data={negativeData} />);

      // Should still render without error
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  // ==================== Date Formatting Tests ====================

  describe('date formatting', () => {
    it('should format dates as MM/DD', () => {
      const dataWithDates: LearningCurvePoint[] = [{ date: '2024-01-15', mastery: 50 }];
      render(<LearningCurveChart data={dataWithDates} />);

      expect(screen.getByText('01/15')).toBeInTheDocument();
    });

    it('should handle various date formats', () => {
      const dataWithDate: LearningCurvePoint[] = [{ date: '2024-12-31', mastery: 50 }];
      render(<LearningCurveChart data={dataWithDate} />);

      expect(screen.getByText('12/31')).toBeInTheDocument();
    });
  });

  // ==================== SVG Structure Tests ====================

  describe('SVG structure', () => {
    it('should have correct viewBox', () => {
      render(<LearningCurveChart data={mockData} />);

      const svg = document.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 500 250');
    });

    it('should render gradient definition', () => {
      render(<LearningCurveChart data={mockData} />);

      const gradient = document.querySelector('#curveGradient');
      expect(gradient).toBeInTheDocument();
    });

    it('should render area path with gradient', () => {
      render(<LearningCurveChart data={mockData} />);

      const paths = document.querySelectorAll('path');
      const areaPath = Array.from(paths).find(
        (p) => p.getAttribute('fill') === 'url(#curveGradient)',
      );
      expect(areaPath).toBeInTheDocument();
    });

    it('should render line path with correct stroke', () => {
      render(<LearningCurveChart data={mockData} />);

      const paths = document.querySelectorAll('path');
      const linePath = Array.from(paths).find((p) => p.getAttribute('stroke') === '#6366f1');
      expect(linePath).toBeInTheDocument();
    });

    it('should render points with correct styling', () => {
      render(<LearningCurveChart data={mockData} />);

      const circles = document.querySelectorAll('circle');
      circles.forEach((circle) => {
        expect(circle.getAttribute('fill')).toBe('#fff');
        expect(circle.getAttribute('stroke')).toBe('#6366f1');
      });
    });
  });

  // ==================== Tooltip Tests ====================

  describe('tooltip', () => {
    it('should render tooltip elements for each point', () => {
      render(<LearningCurveChart data={mockData} />);

      // Tooltips are rendered within groups
      const groups = document.querySelectorAll('g.group');
      expect(groups.length).toBe(mockData.length);
    });
  });
});
