/**
 * WeightRadarChart Component Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeightRadarChart from '../WeightRadarChart';
import type { AlgorithmWeights } from '../../../types/explainability';

const mockWeights: AlgorithmWeights = {
  thompson: 0.4,
  linucb: 0.3,
  actr: 0.2,
  heuristic: 0.1,
};

describe('WeightRadarChart', () => {
  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render the SVG element', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render the title', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      expect(screen.getByText('算法混合策略')).toBeInTheDocument();
    });

    it('should render all algorithm labels', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      // Labels may appear multiple times (in SVG and description)
      expect(screen.getAllByText('Thompson').length).toBeGreaterThan(0);
      expect(screen.getAllByText('LinUCB').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ACT-R').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Heuristic').length).toBeGreaterThan(0);
    });

    it('should render all algorithm values', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      expect(screen.getByText('0.40')).toBeInTheDocument();
      expect(screen.getByText('0.30')).toBeInTheDocument();
      expect(screen.getByText('0.20')).toBeInTheDocument();
      expect(screen.getByText('0.10')).toBeInTheDocument();
    });

    it('should render the dominant algorithm in description', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      // Thompson has highest weight (0.4) - appears multiple times
      expect(screen.getAllByText(/Thompson/).length).toBeGreaterThan(0);
      expect(screen.getByText(/主导/)).toBeInTheDocument();
    });

    it('should render grid levels', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      // Check for polygon elements (grid + data polygon)
      const polygons = document.querySelectorAll('polygon');
      expect(polygons.length).toBeGreaterThan(1); // At least grid levels + data polygon
    });

    it('should render data points', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      // Check for circle elements (data points)
      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(4); // 4 algorithms
    });

    it('should render axis lines', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      // Check for line elements (axis lines)
      const lines = document.querySelectorAll('line');
      expect(lines.length).toBe(4); // 4 axis lines
    });
  });

  // ==================== Props Tests ====================

  describe('props handling', () => {
    it('should handle different dominant algorithms', () => {
      const weightsLinUCBDominant: AlgorithmWeights = {
        thompson: 0.1,
        linucb: 0.5,
        actr: 0.2,
        heuristic: 0.2,
      };
      render(<WeightRadarChart weights={weightsLinUCBDominant} />);

      // LinUCB appears multiple times (label and dominant description)
      const elements = screen.getAllByText(/LinUCB/);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should handle ACT-R as dominant', () => {
      const weightsActrDominant: AlgorithmWeights = {
        thompson: 0.1,
        linucb: 0.2,
        actr: 0.5,
        heuristic: 0.2,
      };
      render(<WeightRadarChart weights={weightsActrDominant} />);

      expect(screen.getByText('0.50')).toBeInTheDocument();
    });

    it('should handle zero weights', () => {
      const weightsWithZero: AlgorithmWeights = {
        thompson: 0,
        linucb: 0.5,
        actr: 0.3,
        heuristic: 0.2,
      };
      render(<WeightRadarChart weights={weightsWithZero} />);

      expect(screen.getByText('0.00')).toBeInTheDocument();
    });

    it('should handle equal weights', () => {
      const equalWeights: AlgorithmWeights = {
        thompson: 0.25,
        linucb: 0.25,
        actr: 0.25,
        heuristic: 0.25,
      };
      render(<WeightRadarChart weights={equalWeights} />);

      // All should be rendered
      const values = screen.getAllByText('0.25');
      expect(values.length).toBe(4);
    });

    it('should handle maximum weights', () => {
      const maxWeights: AlgorithmWeights = {
        thompson: 1.0,
        linucb: 1.0,
        actr: 1.0,
        heuristic: 1.0,
      };
      render(<WeightRadarChart weights={maxWeights} />);

      const values = screen.getAllByText('1.00');
      expect(values.length).toBe(4);
    });
  });

  // ==================== SVG Structure Tests ====================

  describe('SVG structure', () => {
    it('should have correct viewBox dimensions', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      const svg = document.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('300');
      expect(svg?.getAttribute('height')).toBe('300');
    });

    it('should render data polygon with correct attributes', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      const polygons = document.querySelectorAll('polygon');
      const dataPolygon = Array.from(polygons).find((p) =>
        p.getAttribute('fill')?.includes('rgba'),
      );

      expect(dataPolygon).toBeInTheDocument();
      expect(dataPolygon?.getAttribute('stroke')).toBe('#6366f1');
      expect(dataPolygon?.getAttribute('stroke-width')).toBe('2');
    });

    it('should render points with correct stroke', () => {
      render(<WeightRadarChart weights={mockWeights} />);

      const circles = document.querySelectorAll('circle');
      circles.forEach((circle) => {
        expect(circle.getAttribute('fill')).toBe('#6366f1');
        expect(circle.getAttribute('stroke')).toBe('white');
      });
    });
  });
});
