/**
 * MemoryTraceChart Component Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryTraceChart } from '../MemoryTraceChart';
import type { ReviewTraceRecord } from '../../../types/word-mastery';
import { chartColors } from '../../../utils/iconColors';

const mockTrace: ReviewTraceRecord[] = [
  {
    id: 'record-1',
    timestamp: '2024-01-01T10:00:00Z',
    isCorrect: true,
    responseTime: 2.5,
    secondsAgo: 86400,
  },
  {
    id: 'record-2',
    timestamp: '2024-01-02T10:00:00Z',
    isCorrect: false,
    responseTime: 5.0,
    secondsAgo: 0,
  },
  {
    id: 'record-3',
    timestamp: '2024-01-03T10:00:00Z',
    isCorrect: true,
    responseTime: 1.8,
    secondsAgo: 172800,
  },
];

describe('MemoryTraceChart', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the SVG element with data', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render data points for each trace record', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(mockTrace.length);
    });

    it('should render the line path', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const path = document.querySelector('path');
      expect(path).toBeInTheDocument();
    });

    it('should render legend', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      // "正确" and "错误" appear multiple times (Y-axis + legend)
      expect(screen.getAllByText('正确').length).toBeGreaterThan(0);
      expect(screen.getAllByText('错误').length).toBeGreaterThan(0);
    });

    it('should render Y-axis labels', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      // Y-axis has "正确" and "错误" labels
      const correctLabels = screen.getAllByText('正确');
      const errorLabels = screen.getAllByText('错误');
      expect(correctLabels.length).toBeGreaterThan(0);
      expect(errorLabels.length).toBeGreaterThan(0);
    });

    it('should render grid lines', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const lines = document.querySelectorAll('line');
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  // ==================== Empty State Tests ====================

  describe('empty state', () => {
    it('should display empty message when trace is empty', () => {
      render(<MemoryTraceChart trace={[]} />);

      expect(screen.getByText('暂无记忆轨迹数据')).toBeInTheDocument();
    });

    it('should not render SVG when trace is empty', () => {
      render(<MemoryTraceChart trace={[]} />);

      const svg = document.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });

    it('should display empty message when trace is undefined', () => {
      render(<MemoryTraceChart trace={undefined as any} />);

      expect(screen.getByText('暂无记忆轨迹数据')).toBeInTheDocument();
    });
  });

  // ==================== Data Point Styling Tests ====================

  describe('data point styling', () => {
    it('should render correct answers with green color', () => {
      const correctOnlyTrace: ReviewTraceRecord[] = [
        {
          id: '1',
          timestamp: '2024-01-01T10:00:00Z',
          isCorrect: true,
          responseTime: 2.0,
          secondsAgo: 0,
        },
      ];
      render(<MemoryTraceChart trace={correctOnlyTrace} />);

      const circle = document.querySelector('circle');
      expect(circle?.getAttribute('fill')).toBe(chartColors.success);
    });

    it('should render incorrect answers with red color', () => {
      const incorrectOnlyTrace: ReviewTraceRecord[] = [
        {
          id: '1',
          timestamp: '2024-01-01T10:00:00Z',
          isCorrect: false,
          responseTime: 2.0,
          secondsAgo: 0,
        },
      ];
      render(<MemoryTraceChart trace={incorrectOnlyTrace} />);

      const circle = document.querySelector('circle');
      expect(circle?.getAttribute('fill')).toBe(chartColors.error);
    });
  });

  // ==================== Tooltip Tests ====================

  describe('tooltip', () => {
    it('should include response time in tooltip', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      // Check title elements for tooltip content
      const titles = document.querySelectorAll('title');
      const titleTexts = Array.from(titles).map((t) => t.textContent);

      expect(titleTexts.some((t) => t?.includes('2.5s'))).toBe(true);
      expect(titleTexts.some((t) => t?.includes('5.0s'))).toBe(true);
    });

    it('should include correctness in tooltip', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const titles = document.querySelectorAll('title');
      const titleTexts = Array.from(titles).map((t) => t.textContent);

      expect(titleTexts.some((t) => t?.includes('正确'))).toBe(true);
      expect(titleTexts.some((t) => t?.includes('错误'))).toBe(true);
    });
  });

  // ==================== Single Data Point Tests ====================

  describe('single data point', () => {
    it('should handle single data point', () => {
      const singleTrace: ReviewTraceRecord[] = [
        {
          id: '1',
          timestamp: '2024-01-01T10:00:00Z',
          isCorrect: true,
          responseTime: 2.0,
          secondsAgo: 0,
        },
      ];
      render(<MemoryTraceChart trace={singleTrace} />);

      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(1);
    });
  });

  // ==================== Date Formatting Tests ====================

  describe('date formatting', () => {
    it('should format dates correctly for X-axis labels', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      // Check for formatted date text (MM/DD format)
      expect(screen.getByText('1/1')).toBeInTheDocument();
    });
  });

  // ==================== SVG Dimensions Tests ====================

  describe('SVG dimensions', () => {
    it('should have correct width and height', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const svg = document.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('600');
      expect(svg?.getAttribute('height')).toBe('200');
    });
  });

  // ==================== Path Tests ====================

  describe('path', () => {
    it('should render path with correct stroke color', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const path = document.querySelector('path');
      expect(path?.getAttribute('stroke')).toBe(chartColors.secondary);
    });

    it('should render path with no fill', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const path = document.querySelector('path');
      expect(path?.getAttribute('fill')).toBe('none');
    });
  });

  // ==================== Legend Colors Tests ====================

  describe('legend colors', () => {
    it('should render green legend dot', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const legendDots = document.querySelectorAll('.rounded-full');
      const greenDot = Array.from(legendDots).find((dot) => dot.classList.contains('bg-green-500'));
      expect(greenDot).toBeInTheDocument();
    });

    it('should render red legend dot', () => {
      render(<MemoryTraceChart trace={mockTrace} />);

      const legendDots = document.querySelectorAll('.rounded-full');
      const redDot = Array.from(legendDots).find((dot) => dot.classList.contains('bg-red-500'));
      expect(redDot).toBeInTheDocument();
    });
  });
});
