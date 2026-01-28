/**
 * StateChangeReason Component Tests
 *
 * Tests C12 constraints:
 * - Display trigger: only on significant state changes
 * - Factor count: show all factors
 * - Visualization: horizontal bar chart, width by percentage
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StateChangeReason } from '../StateChangeReason';
import type { DecisionFactor } from '../../../types/explainability';

const mockFactors: DecisionFactor[] = [
  { name: 'attention', score: 0.8, weight: 0.35, explanation: '注意力变化', icon: 'attention' },
  { name: 'fatigue', score: 0.6, weight: 0.25, explanation: '疲劳度上升', icon: 'fatigue' },
  { name: 'memory', score: 0.7, weight: 0.2, explanation: '记忆力稳定', icon: 'memory' },
];

describe('StateChangeReason', () => {
  describe('rendering', () => {
    it('should render all factors', () => {
      render(<StateChangeReason factors={mockFactors} />);

      expect(screen.getByText('attention')).toBeInTheDocument();
      expect(screen.getByText('fatigue')).toBeInTheDocument();
      expect(screen.getByText('memory')).toBeInTheDocument();
    });

    it('should return null when factors is empty', () => {
      const { container } = render(<StateChangeReason factors={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('should return null when factors is undefined', () => {
      const { container } = render(
        <StateChangeReason factors={undefined as unknown as DecisionFactor[]} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('title display', () => {
    it('should show default title', () => {
      render(<StateChangeReason factors={mockFactors} />);

      expect(screen.getByText('影响因素')).toBeInTheDocument();
    });

    it('should show custom title', () => {
      render(<StateChangeReason factors={mockFactors} title="状态变化原因" />);

      expect(screen.getByText('状态变化原因')).toBeInTheDocument();
    });
  });

  describe('weight display', () => {
    it('should display weight as percentage', () => {
      render(<StateChangeReason factors={mockFactors} />);

      expect(screen.getByText('35%')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
    });

    it('should sort factors by weight (descending)', () => {
      render(<StateChangeReason factors={mockFactors} />);

      const percentages = screen.getAllByText(/%$/);
      const values = percentages.map((el) => parseInt(el.textContent || '0'));

      for (let i = 0; i < values.length - 1; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
      }
    });
  });

  describe('explanation display', () => {
    it('should show explanations by default', () => {
      render(<StateChangeReason factors={mockFactors} />);

      expect(screen.getByText('注意力变化')).toBeInTheDocument();
      expect(screen.getByText('疲劳度上升')).toBeInTheDocument();
      expect(screen.getByText('记忆力稳定')).toBeInTheDocument();
    });

    it('should hide explanations when showExplanation is false', () => {
      render(<StateChangeReason factors={mockFactors} showExplanation={false} />);

      expect(screen.queryByText('注意力变化')).not.toBeInTheDocument();
      expect(screen.queryByText('疲劳度上升')).not.toBeInTheDocument();
    });

    it('should handle factors without explanation', () => {
      const factorsNoExplanation: DecisionFactor[] = [
        { name: 'test', score: 0.5, weight: 0.3, explanation: '', icon: 'test' },
      ];

      render(<StateChangeReason factors={factorsNoExplanation} />);

      expect(screen.getByText('test')).toBeInTheDocument();
    });
  });

  describe('color mapping', () => {
    it('should apply correct color for attention factor', () => {
      const factors: DecisionFactor[] = [
        {
          name: 'Attention Level',
          score: 0.8,
          weight: 0.5,
          explanation: 'test',
          icon: 'attention',
        },
      ];

      render(<StateChangeReason factors={factors} />);

      const container = screen.getByText('Attention Level').closest('div')?.parentElement;
      const bar = container?.querySelector('[class*="bg-blue"]');
      expect(bar).toBeInTheDocument();
    });

    it('should apply correct color for fatigue factor', () => {
      const factors: DecisionFactor[] = [
        { name: 'User Fatigue', score: 0.6, weight: 0.5, explanation: 'test', icon: 'fatigue' },
      ];

      render(<StateChangeReason factors={factors} />);

      const container = screen.getByText('User Fatigue').closest('div')?.parentElement;
      const bar = container?.querySelector('[class*="bg-orange"]');
      expect(bar).toBeInTheDocument();
    });

    it('should apply default color for unknown factors', () => {
      const factors: DecisionFactor[] = [
        { name: 'Unknown Factor', score: 0.5, weight: 0.5, explanation: 'test', icon: 'unknown' },
      ];

      render(<StateChangeReason factors={factors} />);

      const container = screen.getByText('Unknown Factor').closest('div')?.parentElement;
      const bar = container?.querySelector('[class*="bg-gray"]');
      expect(bar).toBeInTheDocument();
    });
  });

  describe('bar width calculation', () => {
    it('should set max width factor to 100%', () => {
      const factors: DecisionFactor[] = [
        { name: 'high', score: 0.8, weight: 0.5, explanation: '', icon: 'test' },
        { name: 'low', score: 0.4, weight: 0.25, explanation: '', icon: 'test' },
      ];

      render(<StateChangeReason factors={factors} />);

      // The highest weight factor should have 100% width
      const highFactorContainer = screen.getByText('high').closest('div')?.parentElement;
      const highBar = highFactorContainer?.querySelector(
        '[class*="transition-all"]',
      ) as HTMLElement;

      if (highBar) {
        expect(highBar.style.width).toBe('100%');
      }
    });

    it('should scale other factors proportionally', () => {
      const factors: DecisionFactor[] = [
        { name: 'high', score: 0.8, weight: 0.5, explanation: '', icon: 'test' },
        { name: 'low', score: 0.4, weight: 0.25, explanation: '', icon: 'test' },
      ];

      render(<StateChangeReason factors={factors} />);

      const lowFactorContainer = screen.getByText('low').closest('div')?.parentElement;
      const lowBar = lowFactorContainer?.querySelector('[class*="transition-all"]') as HTMLElement;

      if (lowBar) {
        // 0.25 / 0.5 = 50%
        expect(lowBar.style.width).toBe('50%');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single factor', () => {
      const singleFactor: DecisionFactor[] = [
        { name: 'only', score: 0.7, weight: 0.4, explanation: 'single', icon: 'test' },
      ];

      render(<StateChangeReason factors={singleFactor} />);

      expect(screen.getByText('only')).toBeInTheDocument();
      expect(screen.getByText('40%')).toBeInTheDocument();
    });

    it('should handle zero weight', () => {
      const zeroWeightFactors: DecisionFactor[] = [
        { name: 'zero', score: 0.5, weight: 0, explanation: '', icon: 'test' },
        { name: 'positive', score: 0.5, weight: 0.5, explanation: '', icon: 'test' },
      ];

      render(<StateChangeReason factors={zeroWeightFactors} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should handle many factors', () => {
      const manyFactors: DecisionFactor[] = Array.from({ length: 10 }, (_, i) => ({
        name: `factor-${i}`,
        score: 0.5,
        weight: 0.1,
        explanation: `explanation-${i}`,
        icon: 'test',
      }));

      render(<StateChangeReason factors={manyFactors} />);

      manyFactors.forEach((f) => {
        expect(screen.getByText(f.name)).toBeInTheDocument();
      });
    });
  });
});
